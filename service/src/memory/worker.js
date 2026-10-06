/**
 * Server-side memory jobs.
 *
 * Formation failure leaves the original messages and a retryable job.
 * The cell path is derived from the segment id, so a retry overwrites the
 * same file instead of minting a second memory.
 */
import { estimateTokens, STALE_SEGMENT_MS } from '../timeline.js';
import { decideSegmentClose, detectTopicShift, resynthesizeSceneSummary } from './segment.js';
import { formatMemCellMarkdown } from '../../../plugin/src/memory/cell-format.js';
import { buildProfilePendingMarkdown, buildSceneVectorRow } from '../../../plugin/src/memory/consolidate.js';
import { formatSceneMarkdown, parseSceneMarkdown, slugifyScene } from '../../../plugin/src/memory/scene-format.js';
import { upsertDialogueRows } from '../../../plugin/src/memory/index-scope.js';
import { parseVectorsJsonl, serializeVectorsJsonl } from '../../../plugin/src/memory/vector-store.js';
import { updateJsonl } from './vector-lock.js';

const CELLS_DIR = 'agent-inbox/wiki/memories/cells';
const SCENES_DIR = 'agent-inbox/wiki/memories/scenes';

function cellIdFor(segmentId) {
  return `cell-${String(segmentId).replace(/[^a-z0-9-]/gi, '').slice(0, 48)}`;
}

/**
 * @param {import('../store.js').createStore extends Function ? any : any} store
 * @param {any} job
 * @param {{
 *   form?: (input: any) => Promise<any>,
 *   writeText?: (rel: string, text: string) => Promise<void>,
 *   readText?: (rel: string) => Promise<string | null>,
 *   vectorsPath?: string,
 *   embed?: (text: string) => Promise<number[] | null>,
 *   exportMessage?: (message: any) => Promise<void>,
 * }} deps
 */
export async function processMemoryJob(store, job, deps = {}) {
  if (!job) return null;
  if (job.kind === 'ingest') return ingestJob(store, job, deps);
  if (job.kind === 'form') return formJob(store, job, deps);
  store.completeMemoryJob(job.id);
  return { skipped: true };
}

async function ingestJob(store, job, deps) {
  const { conversationId, clientTurnId } = job.payload || {};
  const user = store.messageByClientRole(conversationId, clientTurnId, 'user');
  const assistant = store.messageByClientRole(conversationId, clientTurnId, 'assistant');
  if (!user || !assistant) {
    store.failMemoryJob(job.id, '原文还没齐，稍后重试');
    return { ok: false };
  }
  const added = estimateTokens(user.text) + estimateTokens(assistant.text);
  let segment = store.ensureOpenSegment(conversationId, user.createdAt);
  const idle =
    segment.tokenEstimate > 0 &&
    segment.lastMessageAt > 0 &&
    user.createdAt - segment.lastMessageAt > STALE_SEGMENT_MS;
  const topic = segment.tokenEstimate > 0 && detectTopicShift(user.text);
  const decision = decideSegmentClose({
    segmentTokens: segment.tokenEstimate,
    addedTokens: added,
    idle,
    topicShift: topic,
  });
  if (decision.closeBefore) {
    store.closeSegment(segment.id, decision.reason, Math.max(0, user.createdAt - 1));
    segment = store.ensureOpenSegment(conversationId, user.createdAt);
  }
  segment = store.addSegmentTokens(segment.id, added, assistant.createdAt);
  if (decision.closeAfter) {
    store.closeSegment(segment.id, decision.reason, assistant.createdAt);
  }
  const open = store.ensureOpenSegment(conversationId, assistant.createdAt);
  store.saveCursor(conversationId, {
    lastMessageSeq: assistant.seq,
    openSegmentId: open.id,
    tokenEstimate: open.tokenEstimate,
  });
  if (deps.exportMessage) {
    await deps.exportMessage(user);
    await deps.exportMessage(assistant);
  }
  store.completeMemoryJob(job.id);
  return { ok: true, decision };
}

async function formJob(store, job, deps) {
  const segment = store.segmentById(job.segmentId || job.payload?.segmentId);
  if (!segment) {
    store.failMemoryJob(job.id, '找不到片段', { retry: false });
    return { ok: false };
  }
  if (segment.cellId) {
    store.completeMemoryJob(job.id);
    return { ok: true, duplicate: true, cellId: segment.cellId };
  }
  const end = segment.closedAt || Date.now();
  const messages = store.messagesInWindow(segment.conversationId, segment.startedAt, end);
  if (!messages.length) {
    store.failMemoryJob(job.id, '片段里没有原文');
    return { ok: false };
  }
  let formed;
  try {
    formed = await (deps.form
      ? deps.form({ segment, messages })
      : {
          episode: messages.map((row) => `${row.role}: ${row.text}`).join('\n').slice(0, 800),
          facts: [],
          foresight: [],
          scene_title: '对话片段',
          profile_deltas: [],
        });
  } catch (error) {
    store.failMemoryJob(job.id, error?.message || '形成失败');
    return { ok: false, error };
  }
  if (!formed?.episode) {
    store.failMemoryJob(job.id, 'close without episode');
    return { ok: false };
  }
  const cellId = cellIdFor(segment.id);
  const cellPath = `${CELLS_DIR}/${cellId}.md`;
  const sourceIds = messages.map((row) => row.id);
  const markdown = formatMemCellMarkdown({
    cellId,
    sessionId: segment.conversationId,
    created: new Date(segment.closedAt || Date.now()).toISOString(),
    sceneSlug: slugifyScene(formed.scene_title || '对话片段'),
    sceneTitle: formed.scene_title || '对话片段',
    episode: formed.episode,
    facts: formed.facts || [],
    foresight: formed.foresight || [],
    sourceIds,
    speaker: 'user',
    factType: 'dialogue',
    eventTime: new Date(messages[0].createdAt).toISOString(),
    supersedes: formed.supersedes || '',
    traceable: true,
  });
  if (!deps.writeText) {
    store.failMemoryJob(job.id, 'vault 不可用');
    return { ok: false };
  }
  await deps.writeText(cellPath, markdown);

  const sceneSlug = slugifyScene(formed.scene_title || '对话片段');
  const scenePath = `${SCENES_DIR}/${sceneSlug}.md`;
  const previous = deps.readText ? parseSceneMarkdown((await deps.readText(scenePath)) || '') : null;
  const priorCells = previous?.cellPaths || [];
  const already = previous?.summary && String(previous.summary).includes(formed.episode);
  const summary = resynthesizeSceneSummary(
    already ? [{ episode: previous.summary }] : [{ episode: previous?.summary || '' }, { episode: formed.episode }]
  );
  const sceneMd = formatSceneMarkdown({
    slug: sceneSlug,
    title: formed.scene_title || previous?.title || '对话片段',
    summary,
    cellPaths: [...new Set([...priorCells, cellPath])],
    updated: new Date().toISOString().slice(0, 10),
  });
  await deps.writeText(scenePath, sceneMd);

  let embedFailed = false;
  if (deps.vectorsPath) {
    let embedding = null;
    if (deps.embed) {
      try {
        embedding = await deps.embed(summary);
      } catch {
        embedFailed = true;
        embedding = null;
      }
    } else {
      embedFailed = true;
    }
    if (embedding?.length) {
      const sceneRow = buildSceneVectorRow({
        slug: sceneSlug,
        title: formed.scene_title || sceneSlug,
        summary,
        model: 'bge-m3',
        embedding,
      });
      if (sceneRow.text !== summary) sceneRow.text = summary;
      await updateJsonl(
        deps.vectorsPath,
        (rows) => upsertDialogueRows(rows, [sceneRow]),
        { parse: parseVectorsJsonl, serialize: serializeVectorsJsonl }
      );
    }
  }

  if (formed.profile_deltas?.length) {
    const pending = buildProfilePendingMarkdown(
      formed.profile_deltas,
      cellPath,
      new Date().toISOString().slice(0, 10)
    );
    await deps.writeText(pending.pendingPath, pending.markdown);
  }

  const saved = store.setSegmentCell(segment.id, cellId);
  store.completeMemoryJob(job.id);
  return { ok: true, cellId: saved?.cellId || cellId, cellPath, embedFailed, summary };
}
