/**
 * Incremental working state.
 * Only the user's words become decisions. Assistant suggestions stay out
 * until the user accepts them. Parking and restoring keep a version chain.
 */

export function detectIntent(userText) {
  const text = String(userText || '');
  if (/回到刚才|回到上周|继续刚才|那个方案|那个设计/.test(text)) return 'restore';
  if (/换个(问题|话题)|另外说|先做|不说这个|我们说点别的/.test(text)) return 'park';
  if (/不对|不是这样|改成|取消|算了|撤回/.test(text)) return 'correct';
  return 'continue';
}

/** Constraints and decisions the user actually said. */
export function decisionsFromUser(userText) {
  const text = String(userText || '').trim();
  if (!text) return [];
  if (/^(建议|我觉得你可以|或许)/.test(text)) return [];
  if (/不要|必须|决定|确认|就按|改成|取消/.test(text)) return [text.slice(0, 240)];
  return [];
}

function blankState(topicKey, goal) {
  return {
    topicKey: topicKey || '',
    status: 'active',
    goal: goal || '',
    constraints: [],
    decisions: [],
    openQuestions: [],
    todos: [],
    materials: [],
    sources: [],
    supersedes: '',
  };
}

/**
 * @param {{ active: any, parked: any[] }} book
 * @param {{ userText: string, assistantText?: string, messageIds?: string[], topicKey?: string }} turn
 */
export function applyUserTurn(book, turn) {
  const active = book?.active ? { ...book.active, decisions: [...(book.active.decisions || [])], todos: [...(book.active.todos || [])], sources: [...(book.active.sources || [])] } : null;
  const parked = [...(book?.parked || [])];
  const intent = detectIntent(turn.userText);
  const sources = [...(turn.messageIds || [])];
  const accepted = decisionsFromUser(turn.userText);

  if (intent === 'park' && active) {
    parked.unshift({ ...active, status: 'parked' });
    return {
      active: blankState(turn.topicKey || 'next', turn.userText.slice(0, 80)),
      parked,
      intent,
      restored: null,
    };
  }

  if (intent === 'restore') {
    const picked = parked[0] || null;
    if (!picked) {
      return { active, parked, intent, restored: null };
    }
    if (active && (active.decisions?.length || active.goal)) parked.unshift({ ...active, status: 'parked' });
    const restored = {
      ...picked,
      status: 'active',
      sources: [...(picked.sources || []), ...sources],
      supersedes: picked.id || '',
    };
    return {
      active: restored,
      parked: parked.filter((row) => row !== picked),
      intent,
      restored,
    };
  }

  const next = active || blankState(turn.topicKey || 'current', '');
  if (intent === 'correct') {
    if (/取消|算了|不做/.test(turn.userText)) next.todos = [];
    next.decisions = accepted.length ? accepted : [String(turn.userText || '').slice(0, 240)];
    next.supersedes = active?.id || next.supersedes || '';
  } else if (accepted.length) {
    next.decisions = [...next.decisions, ...accepted];
  }
  if (/未解|还有个问题|不确定/.test(turn.userText || '')) {
    next.openQuestions = [...(next.openQuestions || []), String(turn.userText).slice(0, 200)];
  }
  next.sources = [...new Set([...(next.sources || []), ...sources])];
  next.status = 'active';
  return { active: next, parked, intent, restored: null };
}

/**
 * Append version rows. Previous rows stay readable.
 */
export function persistWorkingState(store, conversationId, before, after, messageIds = []) {
  const sources = messageIds;
  if (before?.active && after?.intent === 'park') {
    store.appendWorkingState({
      ...before.active,
      conversationId,
      status: 'parked',
      supersedes: before.active.id || '',
      sources: [...(before.active.sources || []), ...sources],
    });
  }
  if (after?.active) {
    return store.appendWorkingState({
      ...after.active,
      conversationId,
      status: 'active',
      sources: [...(after.active.sources || []), ...sources],
    });
  }
  return null;
}
