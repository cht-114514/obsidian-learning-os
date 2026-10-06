/**
 * Build the model context for one Agent OS turn.
 * Soul, working state, recall, and the note snapshot go in the system addition.
 * User history stays raw text, and the current turn is included once.
 */
import { isAgentOsSessionKey } from '../timeline.js';
import { fitContext } from './budget.js';

export function renderWorkingState(state) {
  if (!state) return '';
  const lines = [];
  if (state.goal) lines.push(`目标：${state.goal}`);
  for (const item of state.decisions || []) lines.push(`已确认：${item}`);
  for (const item of state.constraints || []) lines.push(`约束：${item}`);
  for (const item of state.openQuestions || []) lines.push(`未解：${item}`);
  for (const item of state.todos || []) lines.push(`未完成：${item}`);
  if (state.lagging?.length) {
    lines.push('状态还没消化的原文：');
    for (const row of state.lagging) lines.push(`- ${row.role || 'user'}：${row.text}`);
  }
  return lines.join('\n');
}

export function renderRecall(items) {
  return (items || [])
    .map((item, index) => {
      const when = item.at ? `（${item.at}）` : '';
      const source = item.sourceId || item.path || item.id || '';
      return `${index + 1}. ${item.text || ''}${when}${source ? `\n来源：${source}` : ''}`;
    })
    .join('\n');
}

/**
 * @param {{
 *   soul?: string,
 *   workingState?: string,
 *   note?: string,
 *   recallItems?: { text: string, id?: string, path?: string, sourceId?: string, at?: string }[],
 *   recentMessages?: { role: string, text?: string, content?: string }[],
 *   currentMessage?: string,
 *   hostSystem?: string,
 *   toolDefinitions?: string,
 *   degradations?: string[],
 *   stateVersion?: number,
 *   messageFromSeq?: number,
 *   messageToSeq?: number,
 *   budget?: object,
 * }} pack
 */
export function assembleContext(pack) {
  const fitted = fitContext(pack);
  if (fitted.overflow) return fitted;
  const blocks = [];
  if (fitted.soul) blocks.push(`# Soul\n${fitted.soul}`);
  if (fitted.workingState) blocks.push(`# 当前工作状态\n${fitted.workingState}`);
  if (fitted.recallItems.length) blocks.push(`# 召回证据\n${renderRecall(fitted.recallItems)}`);
  if (fitted.note) blocks.push(`# 笔记现场（提交时的快照）\n${fitted.note}`);
  if (pack.degradations?.length) blocks.push(`# 降级\n${pack.degradations.join('、')}`);
  const systemPromptAddition = blocks.join('\n\n');
  const history = fitted.recent.map((message) => ({
    role: message.role || 'user',
    content: String(message.text || message.content || ''),
  }));
  const current = { role: 'user', content: fitted.current };
  const already = history.some((message) => message.role === 'user' && message.content === fitted.current);
  const messages = already ? history : history.concat(current);
  return {
    overflow: false,
    messages,
    systemPromptAddition,
    estimatedTokens: fitted.estimatedTokens + (systemPromptAddition ? 0 : 0),
    manifest: {
      stateVersion: pack.stateVersion || 0,
      messageFromSeq: pack.messageFromSeq || 0,
      messageToSeq: pack.messageToSeq || 0,
      memoryIds: fitted.recallItems.map((item) => item.id || item.path).filter(Boolean),
      tokenCounts: fitted.tokenCounts,
      degradations: pack.degradations || [],
    },
  };
}

/**
 * Other OpenClaw channels keep the host transcript unchanged.
 */
export function assembleForSession({ sessionKey, messages, pack }) {
  if (!isAgentOsSessionKey(sessionKey)) {
    return { messages: messages || [], estimatedTokens: 0, passthrough: true };
  }
  const assembled = assembleContext(pack || {});
  if (assembled.overflow) return assembled;
  const addition = assembled.systemPromptAddition || '';
  const leaked = (assembled.messages || []).some((message) => String(message.content || '').includes(addition) && addition.length > 40);
  if (leaked) {
    assembled.messages = (assembled.messages || []).map((message) => ({
      ...message,
      content: String(message.content || '').split(addition).join(''),
    }));
  }
  return assembled;
}
