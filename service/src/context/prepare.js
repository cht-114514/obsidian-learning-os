/**
 * Assemble a turn's context when it becomes runnable, and record the manifest.
 * The gateway still receives the raw user text. This pack is what the
 * context engine injects beside that text.
 */
import { isAgentOsSessionKey } from '../timeline.js';
import { assembleContext, renderWorkingState } from './assemble.js';
import { recallForTurn } from '../memory/recall.js';

export async function prepareTurnContext({ store, turn, soul = '', rows = [], vectorAvailable = false, vectorHits = [], hostSystem = '', toolDefinitions = '' }) {
  if (!turn || !isAgentOsSessionKey(turn.sessionKey)) return null;
  const conversationId = turn.sessionKey;
  const recent = store.messagesPage(conversationId, { limit: 80 });
  const state = store.activeWorkingState(conversationId);
  const cursor = store.cursorFor(conversationId);
  const lagging = cursor ? store.messagesAfter(conversationId, cursor.lastMessageSeq, 12) : [];
  const stateView = state
    ? { ...state, lagging: lagging.filter((row) => row.turnId !== turn.id).map((row) => ({ role: row.role, text: row.text })) }
    : null;
  const user = store.messageByClientRole(conversationId, turn.clientTurnId, 'user');
  const note = user?.snapshot?.text || user?.snapshot?.excerpt || '';
  const prior = recent.filter((row) => row.clientTurnId !== turn.clientTurnId);
  const recalled = recallForTurn({
    query: turn.message,
    recentTurns: prior.slice(-2),
    workingState: state,
    rows,
    vectorAvailable,
    vectorHits,
    timelineHits: store.searchTimeline(conversationId, turn.message, 5),
  });
  const assembled = assembleContext({
    soul,
    workingState: renderWorkingState(stateView),
    note,
    recallItems: recalled.mode === 'timeline' ? recalled.hits : recalled.hits,
    recentMessages: prior.map((row) => ({ role: row.role, text: row.text })),
    currentMessage: turn.message,
    hostSystem,
    toolDefinitions,
    degradations: recalled.degraded,
    stateVersion: state?.version || 0,
    messageFromSeq: prior[0]?.seq || 0,
    messageToSeq: prior[prior.length - 1]?.seq || 0,
  });
  if (assembled.overflow) return assembled;
  store.saveManifest({
    turnId: turn.id,
    ...assembled.manifest,
  });
  return assembled;
}
