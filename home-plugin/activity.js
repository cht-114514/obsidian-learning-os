const ACTIVITY_PREFIX = "activity-";

function contentHash(text) {
  const s = String(text ?? "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function dayKeyFromTime(ts) {
  const date = new Date(Number(ts) || Date.now());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function normalizeEvent(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const type = String(raw.type || "").trim();
  const at = Number(raw.at);
  if (!type || !Number.isFinite(at)) return null;
  const event = {
    id: String(raw.id || `${type}-${at}`),
    type,
    at,
    deviceId: String(raw.deviceId || "").trim(),
  };
  const fields = [
    "path",
    "title",
    "draftId",
    "targetPath",
    "text",
    "prompt",
    "excerpt",
    "sourcePath",
    "monthKey",
  ];
  for (const key of fields) {
    if (raw[key] != null && String(raw[key]).trim()) event[key] = String(raw[key]);
  }
  if (Number.isFinite(Number(raw.progress))) event.progress = Number(raw.progress);
  if (Number.isFinite(Number(raw.index))) event.index = Number(raw.index);
  if (Number.isFinite(Number(raw.count))) event.count = Number(raw.count);
  if (raw.done === true) event.done = true;
  if (Array.isArray(raw.queue)) event.queue = raw.queue;
  return event;
}

function mergeEvents(...lists) {
  const map = new Map();
  for (const list of lists) {
    const items = Array.isArray(list) ? list : [];
    for (const item of items) {
      const event = normalizeEvent(item);
      if (!event) continue;
      const prev = map.get(event.id);
      if (!prev || event.at >= prev.at) map.set(event.id, event);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.at - b.at);
}

function parseActivityJsonl(text) {
  const events = [];
  for (const line of String(text || "").split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch (_) {}
  }
  return mergeEvents(events);
}

function serializeActivityJsonl(events) {
  return mergeEvents(events)
    .map((event) => JSON.stringify(event))
    .join("\n");
}

function latestBy(events, type) {
  let found = null;
  for (const event of mergeEvents(events)) {
    if (event.type === type) found = event;
  }
  return found;
}

function continueItems(events, limit = 3) {
  const merged = mergeEvents(events);
  const reads = new Map();
  const drafts = new Map();
  let review = null;
  let next = null;
  for (const event of merged) {
    if (event.type === "read" && event.path) reads.set(event.path, event);
    if (event.type === "draft" && (event.draftId || event.path) && !event.done) {
      drafts.set(event.draftId || event.path, event);
    }
    if (event.type === "draft" && event.done) drafts.delete(event.draftId || event.path);
    if (event.type === "review") review = event;
    if (event.type === "next") next = event;
  }
  const items = [];
  if (review && Array.isArray(review.queue) && review.index < review.queue.length && !review.done) {
    items.push({
      kind: "review",
      title: "继续复习",
      at: review.at,
      event: review,
    });
  }
  for (const event of drafts.values()) {
    items.push({
      kind: "draft",
      title: event.title || "未写完的草稿",
      path: event.path || "",
      draftId: event.draftId || "",
      at: event.at,
      event,
    });
  }
  for (const event of reads.values()) {
    if ((Number(event.progress) || 0) >= 0.98) continue;
    items.push({
      kind: "read",
      title: event.title || event.path,
      path: event.path,
      progress: Number(event.progress) || 0,
      at: event.at,
      event,
    });
  }
  if (next && next.text) {
    items.push({
      kind: "next",
      title: next.text,
      path: next.targetPath || next.path || "",
      at: next.at,
      event: next,
    });
  }
  return items.sort((a, b) => b.at - a.at).slice(0, Math.max(0, limit));
}

function readingShelves(events, paths) {
  const merged = mergeEvents(events);
  const progress = new Map();
  const later = new Set();
  for (const event of merged) {
    if (event.type === "read" && event.path) progress.set(event.path, event);
    if (event.type === "later" && event.path) later.add(event.path);
    if (event.type === "later-off" && event.path) later.delete(event.path);
  }
  const reading = Array.from(progress.values())
    .filter((event) => (Number(event.progress) || 0) < 0.98)
    .sort((a, b) => b.at - a.at);
  const readingPaths = new Set(reading.map((event) => event.path));
  const queued = Array.from(later).filter((path) => !readingPaths.has(path));
  const known = new Set([...readingPaths, ...queued]);
  const all = (Array.isArray(paths) ? paths : []).filter((path) => !known.has(path));
  return { reading, later: queued, all };
}

function recordsForDay(events, focusParts, dayKey) {
  const items = [];
  for (const event of mergeEvents(events)) {
    if (dayKeyFromTime(event.at) !== dayKey) continue;
    if (event.type === "read") items.push({ kind: "read", title: event.title || event.path || "" });
    if (event.type === "draft") items.push({ kind: "write", title: event.title || "草稿" });
    if (event.type === "review-grade") items.push({ kind: "review", count: 1 });
  }
  for (const part of Array.isArray(focusParts) ? focusParts : []) {
    if (part.dayKey !== dayKey || !(Number(part.minutes) > 0)) continue;
    items.push({
      kind: "focus",
      title: part.title || "",
      minutes: part.minutes,
    });
  }
  return items;
}

module.exports = {
  ACTIVITY_PREFIX,
  contentHash,
  continueItems,
  dayKeyFromTime,
  latestBy,
  mergeEvents,
  normalizeEvent,
  parseActivityJsonl,
  readingShelves,
  recordsForDay,
  serializeActivityJsonl,
};
