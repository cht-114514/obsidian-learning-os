/** Client-side single-session helpers. No Node builtins, safe to bundle. */

export function canonicalSessionKey(agentId = 'main') {
  return `agent:${agentId || 'main'}:agent-os`;
}

export function timelineChrome() {
  return {
    showNew: false,
    showSessions: false,
    showDelete: false,
    searchPlaceholder: '搜索原文',
    title: '主会话',
  };
}

export function formatManifest(manifest) {
  if (!manifest) return '';
  const tokens = manifest.tokenCounts || {};
  const parts = [
    manifest.stateVersion ? `状态 v${manifest.stateVersion}` : '',
    Array.isArray(manifest.memoryIds) && manifest.memoryIds.length
      ? `记忆 ${manifest.memoryIds.length} 条`
      : '',
    Array.isArray(manifest.degradations) && manifest.degradations.length
      ? `降级：${manifest.degradations.join('、')}`
      : '',
    tokens.recent ? `近期 ${tokens.recent}` : '',
    tokens.recall ? `召回 ${tokens.recall}` : '',
  ].filter(Boolean);
  return parts.join(' · ') || '本轮没有额外召回';
}
