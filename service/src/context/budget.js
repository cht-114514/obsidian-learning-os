/**
 * Initial context budget. These numbers are engineering defaults.
 * Manifests record estimated and reported usage so they can be recalibrated.
 */
import { estimateTokens } from '../timeline.js';

export const INITIAL_BUDGET = {
  softInput: 32000,
  workingState: 2000,
  recent: 8000,
  recall: 4000,
  note: 6000,
};

export { estimateTokens };

function textOf(message) {
  if (!message) return '';
  if (typeof message === 'string') return message;
  return String(message.text || message.content || '');
}

/**
 * Group a tool call with the tool results that follow it so they are dropped together.
 * @param {any[]} messages
 */
export function groupPreservingTools(messages) {
  /** @type {{ messages: any[] }[]} */
  const units = [];
  for (const message of messages || []) {
    const previous = units[units.length - 1];
    if (message?.role === 'tool' && previous?.open) {
      previous.messages.push(message);
      continue;
    }
    const opensTool = message?.role === 'assistant' && (message.toolCalls || message.tool_calls);
    units.push({ open: !!opensTool, messages: [message] });
  }
  return units;
}

function unitTokens(unit) {
  return unit.messages.reduce((sum, message) => sum + estimateTokens(textOf(message)), 0);
}

/**
 * Keep the newest units that fit. Tool calls stay paired with their results.
 */
export function trimRecent(messages, tokenLimit) {
  const units = groupPreservingTools(messages);
  let total = units.reduce((sum, unit) => sum + unitTokens(unit), 0);
  while (units.length && total > tokenLimit) {
    const dropped = units.shift();
    total -= unitTokens(dropped);
  }
  return units.flatMap((unit) => unit.messages);
}

function trimText(text, tokenLimit) {
  const raw = String(text || '');
  if (estimateTokens(raw) <= tokenLimit) return raw;
  let lo = 0;
  let hi = raw.length;
  let best = '';
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const slice = raw.slice(0, mid);
    if (estimateTokens(slice) <= tokenLimit) {
      best = slice;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/**
 * Fit the layers into the soft budget.
 * Unused sub-budgets may be borrowed. Recall is never expanded just to fill
 * the window, and the current user message is never truncated.
 */
export function fitContext(input) {
  const budget = { ...INITIAL_BUDGET, ...(input.budget || {}) };
  const hostTokens = estimateTokens(input.hostSystem) + estimateTokens(input.toolDefinitions);
  const current = String(input.currentMessage || '');
  const currentTokens = estimateTokens(current);
  if (hostTokens + currentTokens > budget.softInput) {
    return {
      overflow: true,
      message: '当前输入放不下，请拆分后再发',
      estimatedTokens: hostTokens + currentTokens,
    };
  }

  const recallItems = [...(input.recallItems || [])];
  while (recallItems.length && recallTokenCount(recallItems) > budget.recall) recallItems.pop();

  let soul = String(input.soul || '');
  let stateText = String(input.workingState || '');
  let noteText = String(input.note || '');
  let recent = [...(input.recentMessages || [])];

  const total = () =>
    hostTokens +
    currentTokens +
    estimateTokens(soul) +
    estimateTokens(stateText) +
    estimateTokens(noteText) +
    recallTokenCount(recallItems) +
    recent.reduce((sum, message) => sum + estimateTokens(textOf(message)), 0);

  while (total() > budget.softInput && recallItems.length) recallItems.pop();
  if (total() > budget.softInput && recent.length) {
    const over = total() - budget.softInput;
    const recentNow = recent.reduce((sum, message) => sum + estimateTokens(textOf(message)), 0);
    recent = trimRecent(recent, Math.max(0, recentNow - over));
  }
  if (total() > budget.softInput) noteText = trimText(noteText, Math.min(budget.note, estimateTokens(noteText)));
  while (total() > budget.softInput && noteText) noteText = trimText(noteText, estimateTokens(noteText) - 1);
  if (total() > budget.softInput) stateText = trimText(stateText, Math.min(budget.workingState, estimateTokens(stateText)));
  while (total() > budget.softInput && stateText) stateText = trimText(stateText, estimateTokens(stateText) - 1);
  while (total() > budget.softInput && soul) soul = trimText(soul, estimateTokens(soul) - 1);

  const tokenCounts = {
    host: hostTokens,
    current: currentTokens,
    soul: estimateTokens(soul),
    workingState: estimateTokens(stateText),
    recent: recent.reduce((sum, message) => sum + estimateTokens(textOf(message)), 0),
    recall: recallTokenCount(recallItems),
    note: estimateTokens(noteText),
  };
  return {
    overflow: false,
    soul,
    workingState: stateText,
    note: noteText,
    recallItems,
    recent,
    current,
    estimatedTokens: Object.values(tokenCounts).reduce((sum, n) => sum + n, 0),
    tokenCounts,
  };
}

function recallTokenCount(items) {
  return (items || []).reduce((sum, item) => sum + estimateTokens(item.text || ''), 0);
}
