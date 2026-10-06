/**
 * Merge recoverable human transcripts into the single timeline.
 * A run can stop and start again: source ids are stable, so a second pass
 * does not append the same line. Adjacent sessions are not treated as one
 * continuous exchange.
 */
import { agentOsSessionKey, estimateTokens } from './timeline.js';

export const USER_MESSAGE_SENTINEL = '## 用户本轮消息';

/**
 * Split a legacy injected prompt from the user text.
 * Text without the sentinel is kept whole. Nothing is cut by a fuzzy match.
 */
export function splitInjected(text) {
  const raw = String(text ?? '');
  const at = raw.lastIndexOf(USER_MESSAGE_SENTINEL);
  if (at < 0) return { text: raw.trim(), injected: '', split: false };
  return {
    text: raw.slice(at + USER_MESSAGE_SENTINEL.length).replace(/^\s*\n?/, '').trim(),
    injected: raw.slice(0, at),
    split: true,
  };
}

/**
 * @param {ReturnType<import('./store.js').createStore>} store
 * @param {{ kind: string, id: string, messages?: { id?: string, role: string, text: string, ts?: number }[], detail?: string }[]} sources
 */
export function migrateSources(store, sources, { agentId = 'main' } = {}) {
  const conversationId = agentOsSessionKey(agentId);
  const report = { imported: 0, duplicates: 0, gaps: [], sessions: 0 };
  const ordered = [...(sources || [])].sort(
    (a, b) => (a.messages?.[0]?.ts || 0) - (b.messages?.[0]?.ts || 0)
  );
  for (const source of ordered) {
    const messages = source.messages || [];
    if (!messages.length) {
      const gapId = `gap:${source.kind}:${source.id || 'missing'}`;
      store.recordMigrationGap(gapId, source.kind || 'unknown', source.detail || '没有可恢复的消息');
      report.gaps.push(gapId);
      continue;
    }
    report.sessions += 1;
    const segment = store.ensureOpenSegment(conversationId, messages[0].ts || Date.now());
    for (const message of messages) {
      const split = splitInjected(message.text);
      const sourceId = `${source.kind}:${source.id}:${message.id || `${message.role}:${message.ts || 0}`}:${message.role}`;
      const saved = store.insertTimelineMessage({
        conversationId,
        role: message.role === 'assistant' ? 'assistant' : 'user',
        text: split.text,
        sourceKind: source.kind,
        sourceId,
        createdAt: message.ts || Date.now(),
        status: 'completed',
        entry: 'migration',
      });
      if (!saved.created) {
        report.duplicates += 1;
        continue;
      }
      report.imported += 1;
      if (split.split && split.injected) {
        store.saveArtifact(saved.message.id, 'injected_prompt', split.injected);
      }
      store.addSegmentTokens(segment.id, estimateTokens(split.text), message.ts || Date.now());
    }
    const finished = store.segmentById(segment.id);
    if (finished?.status === 'open' && finished.tokenEstimate > 0) {
      store.closeSegment(segment.id, 'migration-boundary', messages[messages.length - 1].ts || Date.now());
    }
  }
  return report;
}
