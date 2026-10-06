/**
 * Recall for one turn.
 * Anaphora is resolved before search. Keyword and vector lists are fused with
 * RRF. A verbatim question reads the timeline instead of a summary.
 */
import { tokenize } from '../../../plugin/src/memory/retrieve.js';

export function rrfMerge(lists, k = 60) {
  const scores = new Map();
  for (const list of lists || []) {
    (list || []).forEach((item, index) => {
      const id = item?.id || item?.path || JSON.stringify(item);
      const prev = scores.get(id) || { item, score: 0 };
      prev.score += 1 / (k + index + 1);
      scores.set(id, prev);
    });
  }
  return [...scores.values()].sort((a, b) => b.score - a.score).map((row) => ({ ...row.item, rrf: row.score }));
}

export function isVerbatimQuestion(query) {
  return /原话|原文是什么|你刚才怎么说|怎么说的|昨天.*说/.test(String(query || ''));
}

export function resolveAnaphora(query, recentTurns = [], workingState = null) {
  const text = String(query || '').trim();
  if (!/那个|这个|刚才|继续|第二个|为什么/.test(text)) return text;
  const hint = [
    workingState?.goal,
    ...(workingState?.decisions || []).slice(0, 4),
    ...recentTurns.slice(-2).map((turn) => turn.text),
  ]
    .filter(Boolean)
    .join('\n');
  return hint ? `${text}\n${hint}` : text;
}

export function keywordRank(rows, query) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const ranked = [];
  for (const row of rows || []) {
    const hay = tokenize(`${row.text || ''} ${row.title || ''}`);
    const haySet = new Set(hay);
    let score = 0;
    for (const token of tokens) if (haySet.has(token)) score += token.length > 1 ? 2 : 1;
    if (score > 0) ranked.push({ ...row, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

export function filterLiveMemories(rows, today) {
  const day = today || new Date().toISOString().slice(0, 10);
  const skipped = [];
  const live = [];
  for (const row of rows || []) {
    if (row.retracted || row.superseded) {
      skipped.push(row.id || row.path);
      continue;
    }
    if (row.valid_until && row.valid_until < day) {
      skipped.push(row.id || row.path);
      continue;
    }
    if (row.traceable === false) {
      skipped.push(row.id || row.path);
      continue;
    }
    live.push(row);
  }
  return { live, skipped };
}

function expandScenes(hits) {
  const out = [];
  const seen = new Set();
  for (const hit of hits) {
    const id = hit.id || hit.path;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    out.push(hit);
    if (hit.kind === 'fact' && hit.scene_slug && hit.scene_text && !seen.has(hit.scene_slug)) {
      seen.add(hit.scene_slug);
      out.push({
        id: hit.scene_slug,
        kind: 'scene',
        text: hit.scene_text,
        path: hit.scene_path || '',
        sourceId: hit.sourceId || hit.source_id || '',
      });
    }
  }
  return out;
}

/**
 * One or two passes. Vector failure degrades to keyword + recent + state;
 * it does not throw away the turn.
 */
export function recallForTurn(input) {
  const degraded = [...(input.degraded || [])];
  if (isVerbatimQuestion(input.query)) {
    return {
      mode: 'timeline',
      hits: input.timelineHits || [],
      passes: 1,
      degraded,
      resolvedQuery: input.query,
    };
  }
  const resolved = resolveAnaphora(input.query, input.recentTurns, input.workingState);
  if (!input.vectorAvailable) degraded.push('vector-unavailable');
  const { live, skipped } = filterLiveMemories(input.rows || [], input.today);
  if (skipped.length) degraded.push('filtered-stale');
  const keyword = keywordRank(live, resolved);
  const vector = input.vectorAvailable ? input.vectorHits || [] : [];
  let merged = expandScenes(rrfMerge([keyword, vector])).slice(0, 8);
  let passes = 1;
  if (!merged.length && input.allowSecondPass !== false && input.secondQuery) {
    passes = 2;
    const second = keywordRank(live, input.secondQuery);
    merged = expandScenes(rrfMerge([second, vector])).slice(0, 8);
  }
  return { mode: 'memory', hits: merged, passes, degraded, resolvedQuery: resolved, skipped };
}
