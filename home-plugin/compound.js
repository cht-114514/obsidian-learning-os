const COMPOUND_DIR = "资料库/复利";
const COMPOUND_TITLE = "复利";
const COMPOUND_FIELD_MAX = 2000;
const COMPOUND_FIELDS = [
  { key: "kept", title: "今天留下了什么？" },
  { key: "found", title: "今天发现了什么问题？" },
  { key: "change", title: "明天因此改变什么？" },
  { key: "note", title: "一句发现或下一步" },
];
const COMPOUND_WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function parseCompoundDay(dayKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatCompoundDay(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function compoundDayKeyFromTime(ts = Date.now()) {
  return formatCompoundDay(new Date(ts));
}

function addCompoundDays(dayKey, delta) {
  const date = parseCompoundDay(dayKey);
  if (!date) return "";
  date.setDate(date.getDate() + Number(delta) || 0);
  return formatCompoundDay(date);
}

function compoundWeekStart(dayKey) {
  const date = parseCompoundDay(dayKey);
  if (!date) return "";
  const weekday = date.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  date.setDate(date.getDate() + diff);
  return formatCompoundDay(date);
}

function compoundWeekdayLabel(dayKey) {
  const date = parseCompoundDay(dayKey);
  if (!date) return "";
  return COMPOUND_WEEKDAYS[date.getDay()];
}

function compoundWeekLabel(weekStart) {
  const start = compoundWeekStart(weekStart);
  if (!start) return "";
  return `${start} ～ ${addCompoundDays(start, 6)}`;
}

function compoundWeekPath(weekStart) {
  const start = compoundWeekStart(weekStart);
  if (!start) return "";
  return `${COMPOUND_DIR}/${start}.md`;
}

function clipCompoundField(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, COMPOUND_FIELD_MAX);
}

function emptyCompoundDay() {
  return { kept: "", found: "", change: "" };
}

function normalizeCompoundDay(raw) {
  const day = emptyCompoundDay();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return day;
  for (const field of COMPOUND_FIELDS) {
    day[field.key] = clipCompoundField(raw[field.key]);
  }
  return day;
}

function compoundDayIsEmpty(day) {
  const normalized = normalizeCompoundDay(day);
  return COMPOUND_FIELDS.every((field) => !normalized[field.key]);
}

function compoundDayEquals(left, right) {
  const a = normalizeCompoundDay(left);
  const b = normalizeCompoundDay(right);
  return COMPOUND_FIELDS.every((field) => a[field.key] === b[field.key]);
}

function isCompoundWeekNote(markdown) {
  return /^type:\s*compound-week\s*$/m.test(String(markdown ?? ""));
}

function parseCompoundWeek(markdown) {
  const text = String(markdown ?? "").replace(/\r\n/g, "\n");
  const weekMatch = text.match(/^week_start:\s*(\d{4}-\d{2}-\d{2})\s*$/m);
  const weekStart = weekMatch && parseCompoundDay(weekMatch[1]) ? weekMatch[1] : "";
  const days = {};
  const marks = [];
  const dayRe = /^## (\d{4}-\d{2}-\d{2})[^\n]*$/gm;
  let dayMatch;
  while ((dayMatch = dayRe.exec(text))) {
    marks.push({
      dayKey: dayMatch[1],
      start: dayMatch.index,
      bodyAt: dayMatch.index + dayMatch[0].length,
    });
  }
  for (let i = 0; i < marks.length; i += 1) {
    if (!parseCompoundDay(marks[i].dayKey)) continue;
    const end = i + 1 < marks.length ? marks[i + 1].start : text.length;
    const body = text.slice(marks[i].bodyAt, end);
    const entry = emptyCompoundDay();
    const fields = [];
    const fieldRe = /^### ([^\n]+)$/gm;
    let fieldMatch;
    while ((fieldMatch = fieldRe.exec(body))) {
      fields.push({
        title: fieldMatch[1].trim(),
        start: fieldMatch.index,
        bodyAt: fieldMatch.index + fieldMatch[0].length,
      });
    }
    for (let j = 0; j < fields.length; j += 1) {
      const field = COMPOUND_FIELDS.find((item) => item.title === fields[j].title);
      if (!field) continue;
      const fieldEnd = j + 1 < fields.length ? fields[j + 1].start : body.length;
      entry[field.key] = clipCompoundField(body.slice(fields[j].bodyAt, fieldEnd));
    }
    if (!compoundDayIsEmpty(entry)) days[marks[i].dayKey] = entry;
  }
  return { weekStart, days };
}

function renderCompoundWeek(weekStart, days) {
  const start = compoundWeekStart(weekStart);
  if (!start) return "";
  const end = addCompoundDays(start, 6);
  const keys = Object.keys(days || {})
    .filter((key) => {
      if (!parseCompoundDay(key) || key < start || key > end) return false;
      return !compoundDayIsEmpty(days[key]);
    })
    .sort();
  const parts = [
    "---",
    "type: compound-week",
    `week_start: ${start}`,
    "---",
    "",
    `# 复利 · ${start} ～ ${end}`,
    "",
  ];
  for (const key of keys) {
    const day = normalizeCompoundDay(days[key]);
    parts.push(`## ${key} ${compoundWeekdayLabel(key)}`);
    parts.push("");
    for (const field of COMPOUND_FIELDS) {
      parts.push(`### ${field.title}`);
      parts.push("");
      if (day[field.key]) {
        parts.push(day[field.key]);
        parts.push("");
      }
    }
  }
  return `${parts.join("\n").replace(/\n+$/, "")}\n`;
}

function mergeCompoundDay(days, dayKey, entry) {
  const next = {};
  const source = days && typeof days === "object" && !Array.isArray(days) ? days : {};
  for (const key of Object.keys(source)) {
    if (!parseCompoundDay(key)) continue;
    const day = normalizeCompoundDay(source[key]);
    if (!compoundDayIsEmpty(day)) next[key] = day;
  }
  if (!parseCompoundDay(dayKey)) return next;
  const incoming = normalizeCompoundDay(entry);
  if (compoundDayIsEmpty(incoming)) delete next[dayKey];
  else next[dayKey] = incoming;
  return next;
}

function yesterdayCompoundChange(todayKey, sameWeekDays, previousWeekDays) {
  const yesterday = addCompoundDays(todayKey, -1);
  if (!yesterday) return "";
  const sameWeek = compoundWeekStart(yesterday) === compoundWeekStart(todayKey);
  const days = sameWeek ? sameWeekDays : previousWeekDays;
  return normalizeCompoundDay(days && days[yesterday]).change;
}

function summarizeCompoundDay(day) {
  const normalized = normalizeCompoundDay(day);
  if (compoundDayIsEmpty(normalized)) {
    return { filled: false, main: "还没记", preview: "" };
  }
  const preview =
    normalized.kept
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) || "";
  return { filled: true, main: "已记", preview };
}

function formatDayRecords(items) {
  const lines = [];
  const list = Array.isArray(items) ? items : [];
  const reviews = list.filter((item) => item && item.kind === "review");
  const reviewCount = reviews.reduce((sum, item) => sum + (Number(item.count) || 1), 0);
  if (reviewCount > 0) lines.push(`复习 ${reviewCount} 项`);
  for (const item of list) {
    if (!item || item.kind === "review") continue;
    const title = String(item.title || "").trim();
    if (item.kind === "focus") {
      const minutes = Math.max(0, Math.round(Number(item.minutes) || 0));
      lines.push(title ? `专注 ${title} ${minutes} 分` : `专注 ${minutes} 分`);
    } else if (item.kind === "read") {
      if (title) lines.push(`读了 ${title}`);
    } else if (item.kind === "write") {
      if (title) lines.push(`写了 ${title}`);
    } else if (title) {
      lines.push(title);
    }
  }
  return lines;
}

function compoundDaysInWeek(weekStart, days, todayKey) {
  const start = compoundWeekStart(weekStart);
  const end = addCompoundDays(start, 6);
  if (!start || !parseCompoundDay(todayKey)) return [];
  return Object.keys(days || {})
    .filter((key) => {
      if (!parseCompoundDay(key) || key < start || key > end || key > todayKey) return false;
      return !compoundDayIsEmpty(days[key]);
    })
    .sort();
}

module.exports = {
  COMPOUND_DIR,
  COMPOUND_FIELD_MAX,
  COMPOUND_FIELDS,
  COMPOUND_TITLE,
  addCompoundDays,
  clipCompoundField,
  compoundDayEquals,
  compoundDayIsEmpty,
  compoundDayKeyFromTime,
  compoundDaysInWeek,
  compoundWeekLabel,
  compoundWeekPath,
  compoundWeekStart,
  compoundWeekdayLabel,
  emptyCompoundDay,
  isCompoundWeekNote,
  mergeCompoundDay,
  normalizeCompoundDay,
  parseCompoundDay,
  parseCompoundWeek,
  renderCompoundWeek,
  formatDayRecords,
  summarizeCompoundDay,
  yesterdayCompoundChange,
};
