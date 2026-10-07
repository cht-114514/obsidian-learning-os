const ROUND_SIZE = 5;

function freshRound(items, size = ROUND_SIZE, now = Date.now()) {
  const queue = (Array.isArray(items) ? items : []).slice(0, size);
  return {
    queue,
    index: 0,
    revealed: false,
    note: "",
    skipped: [],
    startedAt: now,
    done: queue.length === 0,
  };
}

function currentCard(round) {
  if (!round || !Array.isArray(round.queue)) return null;
  return round.queue[round.index] || null;
}

function gradeRound(round, rating) {
  const next = {
    ...round,
    queue: round.queue.slice(),
    skipped: (round.skipped || []).slice(),
    revealed: false,
    note: "",
  };
  const card = currentCard(next);
  if (!card) {
    next.done = true;
    return { round: next, card: null, rating };
  }
  next.queue.splice(next.index, 1);
  if (next.index >= next.queue.length) next.index = Math.max(0, next.queue.length - 1);
  if (!next.queue.length) {
    next.index = 0;
    next.done = true;
  }
  return { round: next, card, rating };
}

function skipRound(round) {
  const next = {
    ...round,
    queue: round.queue.slice(),
    skipped: (round.skipped || []).slice(),
    revealed: false,
  };
  const card = currentCard(next);
  if (!card) {
    next.done = true;
    return next;
  }
  const key = cardKey(card);
  if (next.skipped.includes(key)) {
    next.done = true;
    return next;
  }
  next.skipped.push(key);
  next.queue.splice(next.index, 1);
  next.queue.push(card);
  if (next.skipped.length >= next.queue.length) next.done = true;
  return next;
}

function cardKey(card) {
  if (!card) return "";
  return `${card.type || "card"}:${card.id || card.path || ""}`;
}

function prosePrompt(card) {
  if (!card) return "";
  if (card.prompt) return card.prompt;
  if (card.type === "output") return "合上之后，用自己的话再讲一遍";
  return "这段在说什么？";
}

module.exports = {
  ROUND_SIZE,
  cardKey,
  currentCard,
  freshRound,
  gradeRound,
  prosePrompt,
  skipRound,
};
