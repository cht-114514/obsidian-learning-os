const TIMEBOX_PRESETS = [5, 10, 15, 25, 45];
const TIMEBOX_RECENT_MAX = 5;
const TIMEBOX_MIN_MS = 60_000;
const TIMEBOX_MAX_PRESET_MIN = 180;
const TIMEBOX_SESSION_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const TIMEBOX_ABANDON_MIN_MS = 60_000;

function finitePositive(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clampDurationMs(value, fallbackMs = 30 * 60_000) {
  const ms = Math.round(finitePositive(value, fallbackMs));
  return Math.max(TIMEBOX_MIN_MS, ms);
}

function clampPresetMinutes(value) {
  const minutes = Math.round(finitePositive(value, 10));
  return Math.min(TIMEBOX_MAX_PRESET_MIN, Math.max(1, minutes));
}

function parseTimeboxPresetMinutes(text, fallback = TIMEBOX_PRESETS) {
  const base = Array.isArray(fallback) ? fallback : TIMEBOX_PRESETS;
  const raw = String(text || "")
    .split(/[,，\s]+/)
    .map((part) => clampPresetMinutes(part))
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const minutes of raw) {
    if (seen.has(minutes)) continue;
    seen.add(minutes);
    out.push(minutes);
  }
  return out.length ? out.sort((a, b) => a - b) : base.slice();
}

function rememberTitle(recentTitles, title) {
  const clean = String(title || "").trim();
  const current = Array.isArray(recentTitles) ? recentTitles : [];
  if (!clean) return current.slice(0, TIMEBOX_RECENT_MAX);
  return [clean, ...current.filter((item) => item !== clean)].slice(
    0,
    TIMEBOX_RECENT_MAX
  );
}

function createDefaultTimebox(defaultMin = 30) {
  const durationMs = clampDurationMs(Number(defaultMin) * 60_000);
  return {
    status: "idle",
    title: "",
    durationMs,
    startedAt: null,
    endsAt: null,
    remainingMs: durationMs,
    recentTitles: [],
    sourcePath: "",
    focusIntervals: [],
    openFocusStart: null,
  };
}

function normalizeTimebox(raw, defaultMin = 30) {
  const defaults = createDefaultTimebox(defaultMin);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;

  const durationMs = clampDurationMs(raw.durationMs, defaults.durationMs);
  const recentTitles = Array.isArray(raw.recentTitles)
    ? raw.recentTitles
        .map((title) => String(title || "").trim())
        .filter(Boolean)
        .slice(0, TIMEBOX_RECENT_MAX)
    : [];
  const title = String(raw.title || "").trim();
  const status = ["idle", "running", "paused"].includes(raw.status)
    ? raw.status
    : "idle";
  const remainingMs = Math.max(
    0,
    Math.round(finitePositive(raw.remainingMs, durationMs))
  );
  let startedAt = raw.startedAt == null ? null : Number(raw.startedAt);
  let endsAt = raw.endsAt == null ? null : Number(raw.endsAt);
  if (!Number.isFinite(startedAt)) startedAt = null;
  if (!Number.isFinite(endsAt)) endsAt = null;

  const sourcePath = String(raw.sourcePath || "").trim();
  const focusIntervals = normalizeFocusIntervals(raw.focusIntervals);
  const openFocusStart = Number.isFinite(Number(raw.openFocusStart))
    ? Number(raw.openFocusStart)
    : null;

  if (status === "idle" || !title) {
    return {
      ...defaults,
      durationMs,
      remainingMs: durationMs,
      recentTitles,
    };
  }

  if (status === "paused") {
    return {
      status: "paused",
      title,
      durationMs,
      startedAt,
      endsAt: null,
      remainingMs,
      recentTitles,
      sourcePath,
      focusIntervals,
      openFocusStart: null,
    };
  }

  return {
    status: "running",
    title,
    durationMs,
    startedAt,
    endsAt,
    remainingMs,
    recentTitles,
    sourcePath,
    focusIntervals,
    openFocusStart,
  };
}

function formatRemaining(milliseconds) {
  const seconds = Math.max(0, Math.ceil(Number(milliseconds) / 1000) || 0);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatTimeboxMinutes(milliseconds) {
  const minutes = Math.max(0, Math.round(Number(milliseconds) / 60_000));
  return minutes < 1 ? "<1" : String(minutes);
}

function formatTimeboxStatusBar(state) {
  if (!state || state.status === "idle") return "";
  const title = String(state.title || "").trim() || "Timebox";
  if (state.status === "paused") return `暂停 · ${title}`;
  return `${formatRemaining(state.remainingMs)} · ${title}`;
}

function timeboxProgressRatio(state) {
  if (!state || state.status === "idle") return 0;
  const total = Math.max(1, Number(state.durationMs) || 1);
  const remaining = Math.max(0, Number(state.remainingMs) || 0);
  return Math.min(1, Math.max(0, (total - remaining) / total));
}

function localDayKey(ts, now = Date.now()) {
  const date = new Date(ts);
  const today = new Date(now);
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const ty = today.getFullYear();
  const tm = today.getMonth();
  const td = today.getDate();
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function startOfLocalDay(ts) {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

const TIMEBOX_WEEKDAY_SHORT = ["一", "二", "三", "四", "五", "六", "日"];
const TIMEBOX_WEEKDAY_ARIA = [
  "周日",
  "周一",
  "周二",
  "周三",
  "周四",
  "周五",
  "周六",
];

function startOfLocalWeek(ts) {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  const weekday = date.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  date.setDate(date.getDate() + diff);
  return date.getTime();
}

function formatWeekRangeLabel(weekStartMs) {
  const start = new Date(weekStartMs);
  const end = new Date(weekStartMs + 6 * 86_400_000);
  const sy = start.getFullYear();
  const ey = end.getFullYear();
  const startPart = `${start.getMonth() + 1}/${start.getDate()}`;
  const endPart = `${end.getMonth() + 1}/${end.getDate()}`;
  if (sy !== ey) return `${sy}/${startPart} – ${ey}/${endPart}`;
  return `${startPart} – ${endPart}`;
}

function formatFocusDuration(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 1) return "0 分";
  if (m < 60) return `${m} 分`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  if (rest === 0) return `${hours} 小时`;
  return `${hours} 小时 ${rest} 分`;
}

function formatFocusDurationShort(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 1) return "";
  if (m < 60) return `${m}分`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  if (rest === 0) return `${hours}时`;
  return `${hours}时${rest}分`;
}

function timeboxDayAriaLabel(dayStartMs, minutes, blocks) {
  const date = new Date(dayStartMs);
  const weekday = TIMEBOX_WEEKDAY_ARIA[date.getDay()];
  const datePart = `${date.getMonth() + 1}月${date.getDate()}日`;
  const duration = formatFocusDuration(minutes);
  const blockPart = blocks > 0 ? `，${blocks}块` : "";
  return `${weekday} ${datePart}，${duration}${blockPart}`;
}

function timeboxSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeSession(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const title = String(raw.title || "").trim();
  const startedAt = Number(raw.startedAt);
  const endedAt = Number(raw.endedAt);
  if (!title || !Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
    return null;
  }
  const plannedMs = Math.max(
    TIMEBOX_MIN_MS,
    Math.round(finitePositive(raw.plannedMs, endedAt - startedAt))
  );
  const focusedMs = Math.max(
    0,
    Math.min(
      plannedMs,
      Math.round(finitePositive(raw.focusedMs, plannedMs))
    )
  );
  const outcome = ["completed", "early", "abandoned"].includes(raw.outcome)
    ? raw.outcome
    : raw.completed === false
      ? "abandoned"
      : "completed";
  const note = String(raw.note || "").trim();
  const session = {
    id: String(raw.id || timeboxSessionId()),
    title,
    startedAt,
    endedAt,
    plannedMs,
    focusedMs,
    outcome,
    note,
    deviceId: String(raw.deviceId || "").trim(),
    sourcePath: String(raw.sourcePath || "").trim(),
  };
  const segments = normalizeSegments(raw.segments);
  if (segments) session.segments = segments;
  return session;
}

function normalizeFocusIntervals(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const start = Number(item && item.start);
    const end = Number(item && item.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    out.push({ start, end });
  }
  return out;
}

function normalizeSegments(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const item of raw) {
    const dayKey = String((item && item.dayKey) || "");
    const focusedMs = Math.round(Number(item && item.focusedMs) || 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || focusedMs < 0) continue;
    out.push({ dayKey, focusedMs });
  }
  return out.length ? out : null;
}

function splitIntervalByLocalDay(start, end) {
  const parts = [];
  let cursor = start;
  while (cursor < end) {
    const nextMidnight = startOfLocalDay(cursor) + 86_400_000;
    const sliceEnd = Math.min(end, nextMidnight);
    if (sliceEnd <= cursor) break;
    parts.push({
      dayKey: localDayKey(cursor),
      focusedMs: sliceEnd - cursor,
    });
    cursor = sliceEnd;
  }
  return parts;
}

function segmentsFromIntervals(intervals) {
  const totals = new Map();
  for (const interval of normalizeFocusIntervals(intervals)) {
    for (const part of splitIntervalByLocalDay(interval.start, interval.end)) {
      totals.set(part.dayKey, (totals.get(part.dayKey) || 0) + part.focusedMs);
    }
  }
  return Array.from(totals.entries()).map(([dayKey, focusedMs]) => ({
    dayKey,
    focusedMs,
  }));
}

function sessionContributesBlock(session) {
  return session.outcome === "completed" || session.outcome === "early";
}

function sessionMinuteParts(session) {
  if (Array.isArray(session.segments) && session.segments.length) {
    return session.segments.map((seg) => ({
      dayKey: seg.dayKey,
      minutes: Math.round((Number(seg.focusedMs) || 0) / 60_000),
    }));
  }
  return [
    {
      dayKey: localDayKey(session.endedAt),
      minutes: Math.round((Number(session.focusedMs) || 0) / 60_000),
    },
  ];
}

function minutesOnDay(sessions, dayKey) {
  let total = 0;
  for (const session of mergeSessions(sessions)) {
    for (const part of sessionMinuteParts(session)) {
      if (part.dayKey === dayKey) total += part.minutes;
    }
  }
  return total;
}

function barFillRatio(minutes, scaleMinutes) {
  const amount = Math.round(Number(minutes) || 0);
  if (amount <= 0) return 0;
  const scale = Math.max(1, Math.round(Number(scaleMinutes) || 0));
  return amount / scale;
}

function mergeSessions(...lists) {
  const map = new Map();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const session = normalizeSession(item);
      if (!session) continue;
      const prev = map.get(session.id);
      if (!prev || session.endedAt >= prev.endedAt) {
        map.set(session.id, session);
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.endedAt - b.endedAt);
}

function pruneSessions(sessions) {
  return mergeSessions(sessions);
}

function countSuccessfulSessions(sessions) {
  return sessions.filter(
    (session) => session.outcome === "completed" || session.outcome === "early"
  );
}

function summarizeTimeboxStats(sessions, now = Date.now(), opts = {}) {
  const goal = Math.max(0, Math.round(Number(opts.goal) || 0));
  const successful = countSuccessfulSessions(mergeSessions(sessions));
  const todayKey = localDayKey(now, now);
  const todayStart = startOfLocalDay(now);

  const todaySessions = successful.filter(
    (session) => localDayKey(session.endedAt, now) === todayKey
  );
  const todayBlocks = todaySessions.length;
  const todayMinutes = minutesOnDay(sessions, todayKey);

  const dayKeysWithBlocks = new Set(
    successful.map((session) => localDayKey(session.endedAt, now))
  );
  let streak = 0;
  for (let offset = 0; offset < 366; offset += 1) {
    const key = localDayKey(todayStart - offset * 86_400_000, now);
    if (!dayKeysWithBlocks.has(key)) break;
    streak += 1;
  }

  const weekStartMs = startOfLocalWeek(now);
  const weekEndMs = weekStartMs + 7 * 86_400_000;
  const weekKeyStart = localDayKey(weekStartMs, now);
  const weekKeyEnd = localDayKey(weekEndMs, now);
  const weekSessions = successful.filter(
    (session) => session.endedAt >= weekStartMs && session.endedAt < weekEndMs
  );
  let weekMinutes = 0;
  for (const session of mergeSessions(sessions)) {
    for (const part of sessionMinuteParts(session)) {
      if (part.dayKey >= weekKeyStart && part.dayKey < weekKeyEnd) {
        weekMinutes += part.minutes;
      }
    }
  }

  const weekBars = [];
  for (let index = 0; index < 7; index += 1) {
    const dayStart = weekStartMs + index * 86_400_000;
    const key = localDayKey(dayStart, now);
    const blocks = successful.filter(
      (session) => localDayKey(session.endedAt, now) === key
    ).length;
    const minutes = minutesOnDay(sessions, key);
    const date = new Date(dayStart);
    weekBars.push({
      key,
      minutes,
      blocks,
      weekday: TIMEBOX_WEEKDAY_SHORT[index],
      dateLabel: String(date.getDate()),
      isToday: key === todayKey,
      isFuture: dayStart > todayStart,
      ariaLabel: timeboxDayAriaLabel(dayStart, minutes, blocks),
      shortLabel: formatFocusDurationShort(minutes),
    });
  }

  const titleStats = new Map();
  for (const session of mergeSessions(sessions)) {
    let minutes = 0;
    for (const part of sessionMinuteParts(session)) {
      if (part.dayKey >= weekKeyStart && part.dayKey < weekKeyEnd) {
        minutes += part.minutes;
      }
    }
    if (!minutes) continue;
    const prev = titleStats.get(session.title) || { minutes: 0, blocks: 0 };
    prev.minutes += minutes;
    if (
      sessionContributesBlock(session) &&
      localDayKey(session.endedAt, now) >= weekKeyStart &&
      localDayKey(session.endedAt, now) < weekKeyEnd
    ) {
      prev.blocks += 1;
    }
    titleStats.set(session.title, prev);
  }
  const topTitles = Array.from(titleStats.entries())
    .map(([title, stat]) => ({
      title,
      minutes: stat.minutes,
      blocks: stat.blocks,
    }))
    .sort((a, b) => b.minutes - a.minutes || a.title.localeCompare(b.title))
    .slice(0, 3);

  let todayLabel =
    todayMinutes > 0
      ? `今天 ${formatFocusDuration(todayMinutes)}`
      : "今天还没开始";
  if (goal > 0) todayLabel += ` · ${todayBlocks}/${goal}`;

  return {
    todayBlocks,
    todayMinutes,
    streak,
    goal,
    goalDots: goal > 0 ? Math.min(goal, todayBlocks) : 0,
    weekBars,
    weekMinutes,
    weekRangeLabel: formatWeekRangeLabel(weekStartMs),
    weekFocusLabel: weekMinutes > 0 ? formatFocusDuration(weekMinutes) : "还没有",
    todayLabel,
    streakLabel: streak >= 2 ? `连续 ${streak} 天` : "",
    topTitles,
    todayLine:
      todayMinutes > 0
        ? `今天 ${formatFocusDuration(todayMinutes)}`
        : "今天还没有块",
  };
}

function buildSessionPayload(state, endedAt, outcome) {
  const plannedMs = Math.max(TIMEBOX_MIN_MS, Number(state.durationMs) || TIMEBOX_MIN_MS);
  const remainingMs =
    state.status === "running"
      ? Math.max(0, (state.endsAt || endedAt) - endedAt)
      : Math.max(0, Number(state.remainingMs) || 0);
  const intervals = normalizeFocusIntervals(state.focusIntervals);
  const intervalMs = intervals.reduce((sum, item) => sum + (item.end - item.start), 0);
  const focusedFromClock = Math.max(0, Math.min(plannedMs, plannedMs - remainingMs));
  const focusedMs = intervals.length
    ? Math.max(0, Math.min(plannedMs, intervalMs))
    : focusedFromClock;
  const segments = intervals.length ? segmentsFromIntervals(intervals) : null;
  const session = {
    id: timeboxSessionId(),
    title: String(state.title || "").trim(),
    startedAt: Number(state.startedAt) || endedAt,
    endedAt,
    plannedMs,
    focusedMs,
    outcome,
    note: "",
    deviceId: "",
    sourcePath: String(state.sourcePath || "").trim(),
  };
  if (segments && segments.length) session.segments = segments;
  return session;
}

function startOfLocalMonth(ts) {
  const date = new Date(ts);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function startOfLocalYear(ts) {
  const date = new Date(ts);
  date.setMonth(0, 1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function resolveHistoryRange({ mode, anchor, from, to } = {}) {
  const point = Number(anchor) || Date.now();
  if (mode === "month") {
    const start = startOfLocalMonth(point);
    const next = new Date(start);
    next.setMonth(next.getMonth() + 1);
    return { mode, from: start, to: next.getTime() };
  }
  if (mode === "year") {
    const start = startOfLocalYear(point);
    const next = new Date(start);
    next.setFullYear(next.getFullYear() + 1);
    return { mode, from: start, to: next.getTime() };
  }
  if (mode === "custom") {
    const start = startOfLocalDay(Number(from) || point);
    const end = startOfLocalDay(Number(to) || point) + 86_400_000;
    return {
      mode,
      from: Math.min(start, end - 86_400_000),
      to: Math.max(end, start + 86_400_000),
    };
  }
  const start = startOfLocalWeek(point);
  return { mode: "week", from: start, to: start + 7 * 86_400_000 };
}

function shiftHistoryAnchor(mode, anchor, direction) {
  const dir = direction < 0 ? -1 : 1;
  if (mode === "custom") return Number(anchor) || Date.now();
  const date = new Date(Number(anchor) || Date.now());
  if (mode === "month") date.setMonth(date.getMonth() + dir);
  else if (mode === "year") date.setFullYear(date.getFullYear() + dir);
  else date.setDate(date.getDate() + 7 * dir);
  return date.getTime();
}

function shiftCustomRange(from, to, direction) {
  const span = Math.max(86_400_000, Number(to) - Number(from));
  const dir = direction < 0 ? -1 : 1;
  return { from: Number(from) + span * dir, to: Number(to) + span * dir };
}

function historyRangeLabel(range) {
  if (!range) return "";
  if (range.mode === "year") return String(new Date(range.from).getFullYear());
  if (range.mode === "month") {
    const date = new Date(range.from);
    return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
  }
  return formatWeekRangeLabel(range.from);
}

function buildHistoryBars(sessions, range) {
  const bounds = range || resolveHistoryRange({ mode: "week", anchor: Date.now() });
  const merged = mergeSessions(sessions);
  const bars = [];
  if (bounds.mode === "year") {
    for (let month = 0; month < 12; month += 1) {
      const start = new Date(bounds.from);
      start.setMonth(month);
      const monthStart = start.getTime();
      const next = new Date(monthStart);
      next.setMonth(next.getMonth() + 1);
      let minutes = 0;
      let blocks = 0;
      for (let day = monthStart; day < next.getTime(); day += 86_400_000) {
        const key = localDayKey(day);
        minutes += minutesOnDay(merged, key);
        blocks += merged.filter(
          (session) =>
            sessionContributesBlock(session) && localDayKey(session.endedAt) === key
        ).length;
      }
      bars.push({
        key: localDayKey(monthStart).slice(0, 7),
        dayStart: monthStart,
        grain: "month",
        minutes,
        blocks,
        label: `${month + 1}月`,
        durationLabel: formatFocusDuration(minutes),
        isFuture: monthStart > startOfLocalDay(Date.now()),
      });
    }
  } else {
    for (let day = startOfLocalDay(bounds.from); day < bounds.to; day += 86_400_000) {
      const key = localDayKey(day);
      const minutes = minutesOnDay(merged, key);
      const blocks = merged.filter(
        (session) =>
          sessionContributesBlock(session) && localDayKey(session.endedAt) === key
      ).length;
      const date = new Date(day);
      bars.push({
        key,
        dayStart: day,
        grain: "day",
        minutes,
        blocks,
        label: String(date.getDate()),
        weekday: TIMEBOX_WEEKDAY_SHORT[(date.getDay() + 6) % 7],
        durationLabel: formatFocusDuration(minutes),
        isFuture: day > startOfLocalDay(Date.now()),
        ariaLabel: timeboxDayAriaLabel(day, minutes, blocks),
      });
    }
  }
  const maxMinutes = bars.reduce((max, bar) => Math.max(max, bar.minutes), 0);
  return {
    ...bounds,
    label: historyRangeLabel(bounds),
    maxMinutes,
    bars: bars.map((bar) => ({
      ...bar,
      fillRatio: barFillRatio(bar.minutes, maxMinutes),
    })),
  };
}

function daySessionDetails(sessions, dayKey) {
  const details = [];
  for (const session of mergeSessions(sessions)) {
    const minutes = sessionMinuteParts(session)
      .filter((part) => part.dayKey === dayKey)
      .reduce((sum, part) => sum + part.minutes, 0);
    if (!minutes) continue;
    details.push({
      id: session.id,
      title: session.title,
      minutes,
      outcome: session.outcome,
      sourcePath: session.sourcePath || "",
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      block: sessionContributesBlock(session) && localDayKey(session.endedAt) === dayKey,
    });
  }
  return details;
}

class TimeboxEngine {
  constructor({
    initialState,
    defaultMin = 30,
    now = () => Date.now(),
    onChange = () => {},
    onComplete = () => {},
    onAbandon = () => {},
  } = {}) {
    this.now = now;
    this.onChange = onChange;
    this.onComplete = onComplete;
    this.onAbandon = onAbandon;
    this.defaultMin = Math.max(1, Math.round(Number(defaultMin) || 30));
    this.state = normalizeTimebox(initialState, this.defaultMin);
  }

  snapshot() {
    return {
      ...this.state,
      recentTitles: this.state.recentTitles.slice(),
    };
  }

  start(title, durationMs, sourcePath) {
    if (this.state.status !== "idle") return false;
    const clean = String(title || "").trim();
    if (!clean) return false;
    const ms = clampDurationMs(durationMs, this.defaultMin * 60_000);
    const now = this.now();
    this.state.status = "running";
    this.state.title = clean;
    this.state.durationMs = ms;
    this.state.remainingMs = ms;
    this.state.startedAt = now;
    this.state.endsAt = now + ms;
    this.state.sourcePath = String(sourcePath || "").trim();
    this.state.focusIntervals = [];
    this.state.openFocusStart = now;
    this.state.recentTitles = rememberTitle(this.state.recentTitles, clean);
    this.emit("start");
    return true;
  }

  closeOpenFocus(now) {
    const start = Number(this.state.openFocusStart);
    if (!Number.isFinite(start) || start <= 0) return;
    if (!Array.isArray(this.state.focusIntervals)) this.state.focusIntervals = [];
    if (now > start) this.state.focusIntervals.push({ start, end: now });
    this.state.openFocusStart = null;
  }

  pause() {
    if (this.state.status !== "running") return false;
    const now = this.now();
    this.closeOpenFocus(now);
    this.state.remainingMs = Math.max(0, this.state.endsAt - now);
    this.state.endsAt = null;
    this.state.status = "paused";
    this.emit("pause");
    return true;
  }

  resume() {
    if (this.state.status !== "paused") return false;
    const now = this.now();
    this.state.openFocusStart = now;
    this.state.endsAt = now + this.state.remainingMs;
    this.state.status = "running";
    this.emit("resume");
    return true;
  }

  extend(ms) {
    if (this.state.status !== "running" && this.state.status !== "paused") {
      return false;
    }
    const addMs = clampDurationMs(ms, TIMEBOX_MIN_MS);
    this.state.durationMs += addMs;
    this.state.remainingMs += addMs;
    if (this.state.status === "running") {
      this.state.endsAt = (this.state.endsAt || this.now()) + addMs;
    }
    this.emit("extend");
    return true;
  }

  finishEarly() {
    if (this.state.status !== "running" && this.state.status !== "paused") {
      return false;
    }
    return this.finish(this.now(), "early");
  }

  abandon() {
    if (this.state.status === "idle") return false;
    const endedAt = this.now();
    if (this.state.status === "running") this.closeOpenFocus(endedAt);
    const payload = buildSessionPayload(this.state, endedAt, "abandoned", this.now);
    this.onAbandon(payload);
    this.resetIdle();
    this.emit("abandon");
    return true;
  }

  tick() {
    if (this.state.status !== "running") return false;
    const now = this.now();
    this.state.remainingMs = Math.max(0, (this.state.endsAt || now) - now);
    if (this.state.remainingMs <= 0) {
      this.finish(now, "completed");
      return true;
    }
    this.emit("tick");
    return false;
  }

  reconcile() {
    if (this.state.status !== "running") return false;
    if (!this.state.endsAt) {
      this.state.endsAt = this.now() + this.state.remainingMs;
    }
    return this.tick();
  }

  remainingNow(now = this.now()) {
    if (this.state.status === "running") {
      return Math.max(0, (this.state.endsAt || now) - now);
    }
    return this.state.remainingMs;
  }

  resetIdle() {
    const durationMs = this.state.durationMs || this.defaultMin * 60_000;
    const recentTitles = this.state.recentTitles;
    this.state = createDefaultTimebox(Math.round(durationMs / 60_000));
    this.state.durationMs = durationMs;
    this.state.remainingMs = durationMs;
    this.state.recentTitles = recentTitles || [];
  }

  finish(endedAt = this.now(), outcome = "completed") {
    if (this.state.status === "running") this.closeOpenFocus(endedAt);
    const payload = buildSessionPayload(this.state, endedAt, outcome, this.now);
    this.state.recentTitles = rememberTitle(
      this.state.recentTitles,
      this.state.title
    );
    this.onComplete(payload);
    this.resetIdle();
    this.emit("complete");
    return true;
  }

  emit(reason) {
    this.onChange(this.snapshot(), reason);
  }
}

module.exports = {
  TIMEBOX_ABANDON_MIN_MS,
  TIMEBOX_MAX_PRESET_MIN,
  TIMEBOX_MIN_MS,
  TIMEBOX_PRESETS,
  TIMEBOX_RECENT_MAX,
  TIMEBOX_SESSION_RETENTION_MS,
  TimeboxEngine,
  clampDurationMs,
  clampPresetMinutes,
  createDefaultTimebox,
  formatFocusDuration,
  formatFocusDurationShort,
  formatRemaining,
  formatTimeboxMinutes,
  formatTimeboxStatusBar,
  localDayKey,
  mergeSessions,
  normalizeSession,
  normalizeTimebox,
  parseTimeboxPresetMinutes,
  barFillRatio,
  buildHistoryBars,
  daySessionDetails,
  minutesOnDay,
  pruneSessions,
  rememberTitle,
  resolveHistoryRange,
  segmentsFromIntervals,
  sessionMinuteParts,
  shiftCustomRange,
  shiftHistoryAnchor,
  summarizeTimeboxStats,
  timeboxProgressRatio,
  timeboxSessionId,
};
