const REVIEW_LEDGER_PATH = "agent-inbox/meinc-home/review-ledger.json";
const HONGLOU_PUSH_FOLDER = "基础学科/语文/红楼梦/每日推送";
const LIBRARY_ROOT = "资料库";
const LIBRARY_EXCLUDE_DIRS = new Set(["成绩", "复利", "附件"]);
const REVIEW_LEXI_BATCH = 4;
const REVIEW_NEW_RATIO = 3;
const DAY_START_HOUR = 4;
const STAGGER_DAYS = 7;

const REVIEW_MORE_LINKS = [
  { name: "词汇笔记", path: "基础学科/英语/01-词汇", icon: "library" },
  { name: "背诵默写", path: "基础学科/语文", icon: "book-open", filter: "memorization" },
];

function interleaveLexideck(due, fresh, ratio = REVIEW_NEW_RATIO) {
  const out = [];
  let r = 0;
  let n = 0;
  let streak = 0;
  while (r < due.length || n < fresh.length) {
    if (r < due.length && (n >= fresh.length || streak < ratio)) {
      out.push(due[r++]);
      streak += 1;
    } else if (n < fresh.length) {
      out.push(fresh[n++]);
      streak = 0;
    } else {
      out.push(due[r++]);
    }
  }
  return out;
}

function startOfDay(ts, hour = DAY_START_HOUR) {
  const d = new Date(ts);
  if (d.getHours() < hour) d.setDate(d.getDate() - 1);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

function startOfNextDay(ts, hour = DAY_START_HOUR) {
  const start = startOfDay(ts, hour);
  return start + 86400000;
}

function addCalendarDays(ts, days) {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

function normalizeLedger(raw) {
  const entries = {};
  if (raw && raw.entries && typeof raw.entries === "object") {
    for (const [path, entry] of Object.entries(raw.entries)) {
      if (!path) continue;
      entries[path] = normalizeLedgerEntry(entry, path);
    }
  }
  return {
    version: 1,
    staggered: !!(raw && raw.staggered),
    entries,
  };
}

function normalizeLedgerEntry(entry, path) {
  let kind = "article";
  const rawKind = entry && entry.kind;
  if (
    rawKind === "honglou" ||
    rawKind === "article" ||
    rawKind === "passage" ||
    rawKind === "output"
  ) {
    kind = rawKind;
  } else if (String(path || "").includes("红楼梦/每日推送")) kind = "honglou";
  const out = {
    kind,
    due: Number(entry && entry.due) || 0,
    addedAt: Number(entry && entry.addedAt) || Date.now(),
  };
  const prompt = String((entry && entry.prompt) || "").trim();
  const excerpt = String((entry && entry.excerpt) || "").trim();
  const title = String((entry && entry.title) || "").trim();
  if (prompt) out.prompt = prompt.slice(0, 500);
  if (excerpt) out.excerpt = excerpt.slice(0, 4000);
  if (title) out.title = title.slice(0, 200);
  return out;
}

function proseIntervalDays(rating) {
  if (rating === "good") return 7;
  if (rating === "hard") return 3;
  return 1;
}

function proseDueAfterGrade(rating, now = Date.now()) {
  const days = proseIntervalDays(rating);
  if (days <= 1) return startOfNextDay(now);
  return addCalendarDays(now, days);
}

function isProseDue(entry, now = Date.now()) {
  if (!entry) return false;
  const due = Number(entry.due) || 0;
  return !due || due <= now;
}

function listDueProseEntries(ledger, now = Date.now()) {
  const entries = ledger && ledger.entries ? ledger.entries : {};
  const due = [];
  for (const [path, entry] of Object.entries(entries)) {
    if (!isProseDue(entry, now)) continue;
    due.push({
      path,
      kind: entry.kind,
      due: entry.due || 0,
      prompt: entry.prompt || "",
      excerpt: entry.excerpt || "",
      title: entry.title || "",
    });
  }
  due.sort((a, b) => (a.due || 0) - (b.due || 0));
  return due;
}

function pickDueProse(ledger, now = Date.now(), opts = {}) {
  const maxHonglou = opts.maxHonglou ?? 1;
  const maxArticle = opts.maxArticle ?? 1;
  const due = listDueProseEntries(ledger, now);
  let honglou = 0;
  let article = 0;
  const picked = [];
  for (const item of due) {
    if (item.kind === "honglou" && honglou < maxHonglou) {
      picked.push(item);
      honglou += 1;
    } else if (item.kind === "article" && article < maxArticle) {
      picked.push(item);
      article += 1;
    }
  }
  return picked;
}

function mixReviewQueue(lexiItems, proseItems, batch = REVIEW_LEXI_BATCH) {
  const lexi = Array.isArray(lexiItems) ? lexiItems : [];
  const prose = Array.isArray(proseItems) ? proseItems : [];
  if (!lexi.length) return prose.slice();
  const out = [];
  let li = 0;
  let pi = 0;
  while (li < lexi.length || pi < prose.length) {
    for (let i = 0; i < batch && li < lexi.length; i += 1) {
      out.push(lexi[li++]);
    }
    if (pi < prose.length) out.push(prose[pi++]);
    if (li >= lexi.length && pi < prose.length) {
      while (pi < prose.length) out.push(prose[pi++]);
      break;
    }
  }
  return out;
}

function buildLexiQueueItems(lexideck, now = Date.now()) {
  if (!lexideck || typeof lexideck.getDueItems !== "function") return [];
  const out = [];
  for (const kind of ["words", "sentences"]) {
    const pack = lexideck.getDueItems(kind, { now });
    const queue = interleaveLexideck(pack.due || [], pack.fresh || []);
    for (const card of queue) {
      out.push({
        type: kind === "words" ? "word" : "sentence",
        kind,
        id: card.id,
        card,
      });
    }
  }
  return out;
}

function ledgerEntryForHonglouRead(now = Date.now()) {
  return {
    kind: "honglou",
    due: startOfNextDay(now),
    addedAt: now,
  };
}

function ledgerEntryForPassage(excerpt, now = Date.now()) {
  return {
    kind: "passage",
    due: now,
    addedAt: now,
    prompt: "这段在说什么？",
    excerpt: String(excerpt || "").trim().slice(0, 4000),
  };
}

function ledgerEntryForOutput(excerpt, now = Date.now()) {
  return {
    kind: "output",
    due: now,
    addedAt: now,
    prompt: "合上之后，用自己的话再讲一遍",
    excerpt: String(excerpt || "").trim().slice(0, 4000),
  };
}

function ledgerEntryForArticle(path, now = Date.now()) {
  return {
    kind: "article",
    due: now,
    addedAt: now,
  };
}

function staggerHonglouBackfill(inboxDone, paths, now = Date.now()) {
  const done = (paths || [])
    .filter((path) => inboxDone && inboxDone[path])
    .sort();
  const entries = {};
  if (!done.length) return entries;
  const base = startOfNextDay(now);
  const spanMs = STAGGER_DAYS * 86400000;
  for (let i = 0; i < done.length; i += 1) {
    const offset = Math.floor((i / done.length) * STAGGER_DAYS);
    const due = base + Math.min(spanMs - 1, offset * 86400000);
    entries[done[i]] = {
      kind: "honglou",
      due,
      addedAt: now,
    };
  }
  return entries;
}

function shouldHideSubjectChild(path, name) {
  const p = String(path || "");
  const n = String(name || "");
  if (p === "基础学科/语文/红楼梦" || p.startsWith("基础学科/语文/红楼梦/")) {
    return true;
  }
  if (p === "基础学科/英语/01-词汇" || p.startsWith("基础学科/英语/01-词汇/")) {
    return true;
  }
  if (n.startsWith("高考背诵默写")) return true;
  if (n === "红楼梦") return true;
  return false;
}

function isLibraryArticlePath(path) {
  const p = String(path || "");
  if (!p.startsWith(`${LIBRARY_ROOT}/`) || !p.endsWith(".md")) return false;
  const rest = p.slice(LIBRARY_ROOT.length + 1);
  const top = rest.split("/")[0];
  if (!top || LIBRARY_EXCLUDE_DIRS.has(top)) return false;
  if (rest === "00-入口.md") return false;
  return true;
}

function libraryArticleCategory(path) {
  const rest = String(path || "").slice(LIBRARY_ROOT.length + 1);
  return rest.split("/")[0] || LIBRARY_ROOT;
}

module.exports = {
  REVIEW_LEDGER_PATH,
  HONGLOU_PUSH_FOLDER,
  LIBRARY_ROOT,
  LIBRARY_EXCLUDE_DIRS,
  REVIEW_LEXI_BATCH,
  REVIEW_MORE_LINKS,
  addCalendarDays,
  buildLexiQueueItems,
  interleaveLexideck,
  isLibraryArticlePath,
  isProseDue,
  ledgerEntryForArticle,
  ledgerEntryForHonglouRead,
  ledgerEntryForOutput,
  ledgerEntryForPassage,
  libraryArticleCategory,
  mixReviewQueue,
  normalizeLedger,
  normalizeLedgerEntry,
  listDueProseEntries,
  pickDueProse,
  proseDueAfterGrade,
  proseIntervalDays,
  shouldHideSubjectChild,
  staggerHonglouBackfill,
  startOfNextDay,
};
