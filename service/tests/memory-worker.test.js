import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.js';
import { agentOsSessionKey, STALE_SEGMENT_MS } from '../src/timeline.js';
import { processMemoryJob } from '../src/memory/worker.js';
import { updateJsonl } from '../src/memory/vector-lock.js';
import { parseVectorsJsonl, serializeVectorsJsonl } from '../../plugin/src/memory/vector-store.js';
import { mergeWikiRebuild } from '../../plugin/src/memory/index-scope.js';
import { parseMemCellMarkdown, cellIsTraceable } from '../../plugin/src/memory/cell-format.js';

function filesVault() {
  const files = new Map();
  return {
    files,
    async writeText(rel, text) {
      files.set(rel, text);
    },
    async readText(rel) {
      return files.has(rel) ? files.get(rel) : null;
    },
  };
}

describe('memory jobs', () => {
  it('keeps the transcript when formation fails and does not write a second cell on retry', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-mem-'));
    const store = createStore(join(dir, 'mem.sqlite'));
    const key = agentOsSessionKey('main');
    store.receiveConversationTurn({
      id: 'turn-mem',
      clientTurnId: 'client-mem',
      message: '悬浮窗打开时不要发请求',
      agentId: 'main',
    });
    store.completeTurnWithMemory('turn-mem', '记下了');
    const vault = filesVault();
    let calls = 0;
    const job = store.claimNextMemoryJob();
    assert.equal(job.kind, 'ingest');
    await processMemoryJob(store, job, vault);
    const segment = store.ensureOpenSegment(key);
    store.addSegmentTokens(segment.id, 9000, Date.now());
    store.closeSegment(segment.id, 'tokens');
    const form = store.memoryJobById(`form:${segment.id}`);
    assert.ok(form);

    const claimed = store.claimNextMemoryJob();
    assert.equal(claimed.id, form.id);
    await processMemoryJob(store, claimed, {
      ...vault,
      form: async () => {
        calls += 1;
        if (calls === 1) throw new Error('model down');
        return { episode: '用户确认悬浮窗不自动发请求。', facts: ['不自动发请求'], scene_title: '悬浮窗' };
      },
    });
    assert.equal(store.memoryJobById(form.id).status, 'queued');
    assert.equal(store.messagesPage(key, { limit: 10 }).length, 2);
    assert.equal(vault.files.size, 0);

    const retry = store.claimNextMemoryJob();
    const written = await processMemoryJob(store, retry, {
      ...vault,
      form: async () => {
        calls += 1;
        return {
          episode: '用户确认悬浮窗不自动发请求。',
          facts: ['不自动发请求'],
          scene_title: '悬浮窗',
          profile_deltas: [{ target: 'profile', text: '喜欢短句' }],
        };
      },
    });
    assert.equal(written.duplicate, undefined);
    assert.equal(calls, 2);
    const again = store.memoryJobById(form.id);
    assert.equal(again.status, 'completed');
    const cellPaths = [...vault.files.keys()].filter((path) => path.includes('/cells/'));
    assert.equal(cellPaths.length, 1);
    const cell = parseMemCellMarkdown(vault.files.get(cellPaths[0]));
    assert.equal(cellIsTraceable(cell), true);
    assert.ok(cell.source_ids.length >= 1);
    const profileWrites = [...vault.files.keys()].filter((path) => path.endsWith('profile.md') || path.endsWith('style.md'));
    assert.deepEqual(profileWrites, []);
    assert.ok([...vault.files.keys()].some((path) => path.includes('agent-inbox/pending/')));

    const dup = await processMemoryJob(store, again, {
      ...vault,
      form: async () => {
        calls += 1;
        return { episode: '第二条', scene_title: '不该出现' };
      },
    });
    assert.equal(dup.duplicate, true);
    assert.equal(calls, 2);
    assert.equal([...vault.files.keys()].filter((path) => path.includes('/cells/')).length, 1);
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('closes a stale segment before the next turn and keeps a cursor past 24 messages', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-cursor-'));
    const store = createStore(join(dir, 'cursor.sqlite'));
    const key = agentOsSessionKey('main');
    const start = Date.now() - STALE_SEGMENT_MS - 10_000;
    store.receiveConversationTurn({
      id: 'old-turn',
      clientTurnId: 'old-client',
      message: '上一题',
      agentId: 'main',
      createdAt: start,
    });
    store.completeTurnWithMemory('old-turn', '上一答');
    const user = store.messageByClientRole(key, 'old-client', 'user');
    const assistant = store.messageByClientRole(key, 'old-client', 'assistant');
    assert.ok(user && assistant);
    const ingest = store.claimNextMemoryJob();
    await processMemoryJob(store, ingest, {});
    const open = store.ensureOpenSegment(key);
    store.addSegmentTokens(open.id, 100, start);

    store.receiveConversationTurn({
      id: 'new-turn',
      clientTurnId: 'new-client',
      message: '换个问题，先做数学',
      agentId: 'main',
    });
    store.completeTurnWithMemory('new-turn', '来');
    const next = store.claimNextMemoryJob();
    await processMemoryJob(store, next, {});
    const closed = store.segmentById(open.id);
    assert.equal(closed.status, 'closed');
    assert.equal(closed.closeReason, 'topic');
    const cursor = store.cursorFor(key);
    assert.ok(cursor.lastMessageSeq >= assistant.seq);
    assert.ok(store.messagesPage(key, { limit: 50 }).length >= 4);
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('wiki rebuild keeps dialogue rows and a locked writer does not drop them', async () => {
    const dialogue = {
      id: 'cell#episode',
      kind: 'episode',
      path: 'agent-inbox/wiki/memories/cells/a.md',
      text: '悬浮窗',
      embedding: [1, 0],
    };
    const wiki = { id: 'wiki#0', kind: 'wiki', path: 'agent-inbox/wiki/sources/a.md', text: '笔记', embedding: [0, 1] };
    const rebuilt = mergeWikiRebuild([dialogue, wiki], [{ ...wiki, text: '新笔记' }]);
    assert.equal(rebuilt.filter((row) => row.kind === 'episode').length, 1);
    assert.equal(rebuilt.find((row) => row.kind === 'wiki').text, '新笔记');

    const dir = mkdtempSync(join(tmpdir(), 'aos-vec-'));
    const file = join(dir, 'vectors.jsonl');
    writeFileSync(file, serializeVectorsJsonl([dialogue, wiki]));
    await Promise.all([
      updateJsonl(file, (rows) => mergeWikiRebuild(rows, [{ ...wiki, text: '甲' }]), {
        parse: parseVectorsJsonl,
        serialize: serializeVectorsJsonl,
      }),
      updateJsonl(file, (rows) => mergeWikiRebuild(rows, [{ ...wiki, text: '乙' }]), {
        parse: parseVectorsJsonl,
        serialize: serializeVectorsJsonl,
      }),
    ]);
    const rows = parseVectorsJsonl(readFileSync(file, 'utf8'));
    assert.equal(rows.filter((row) => row.kind === 'episode').length, 1);
    assert.equal(rows.filter((row) => row.path === wiki.path).length, 1);
    rmSync(dir, { recursive: true, force: true });
  });
});
