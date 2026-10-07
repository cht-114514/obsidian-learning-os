var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// timebox.js
var require_timebox = __commonJS({
  "timebox.js"(exports2, module2) {
    var TIMEBOX_PRESETS = [5, 10, 15, 25, 45];
    var TIMEBOX_RECENT_MAX = 5;
    var TIMEBOX_MIN_MS = 6e4;
    var TIMEBOX_MAX_PRESET_MIN = 180;
    var TIMEBOX_SESSION_RETENTION_MS = 180 * 24 * 60 * 60 * 1e3;
    var TIMEBOX_ABANDON_MIN_MS2 = 6e4;
    function finitePositive(value, fallback) {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }
    function clampDurationMs(value, fallbackMs = 30 * 6e4) {
      const ms = Math.round(finitePositive(value, fallbackMs));
      return Math.max(TIMEBOX_MIN_MS, ms);
    }
    function clampPresetMinutes(value) {
      const minutes = Math.round(finitePositive(value, 10));
      return Math.min(TIMEBOX_MAX_PRESET_MIN, Math.max(1, minutes));
    }
    function parseTimeboxPresetMinutes2(text, fallback = TIMEBOX_PRESETS) {
      const base = Array.isArray(fallback) ? fallback : TIMEBOX_PRESETS;
      const raw = String(text || "").split(/[,，\s]+/).map((part) => clampPresetMinutes(part)).filter(Boolean);
      const seen = /* @__PURE__ */ new Set();
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
    function createDefaultTimebox2(defaultMin = 30) {
      const durationMs = clampDurationMs(Number(defaultMin) * 6e4);
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
        openFocusStart: null
      };
    }
    function normalizeTimebox2(raw, defaultMin = 30) {
      const defaults = createDefaultTimebox2(defaultMin);
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;
      const durationMs = clampDurationMs(raw.durationMs, defaults.durationMs);
      const recentTitles = Array.isArray(raw.recentTitles) ? raw.recentTitles.map((title2) => String(title2 || "").trim()).filter(Boolean).slice(0, TIMEBOX_RECENT_MAX) : [];
      const title = String(raw.title || "").trim();
      const status = ["idle", "running", "paused"].includes(raw.status) ? raw.status : "idle";
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
      const openFocusStart = Number.isFinite(Number(raw.openFocusStart)) ? Number(raw.openFocusStart) : null;
      if (status === "idle" || !title) {
        return {
          ...defaults,
          durationMs,
          remainingMs: durationMs,
          recentTitles
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
          openFocusStart: null
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
        openFocusStart
      };
    }
    function formatRemaining2(milliseconds) {
      const seconds = Math.max(0, Math.ceil(Number(milliseconds) / 1e3) || 0);
      const minutes = Math.floor(seconds / 60);
      return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    }
    function formatTimeboxMinutes2(milliseconds) {
      const minutes = Math.max(0, Math.round(Number(milliseconds) / 6e4));
      return minutes < 1 ? "<1" : String(minutes);
    }
    function formatTimeboxStatusBar2(state) {
      if (!state || state.status === "idle") return "";
      const title = String(state.title || "").trim() || "Timebox";
      if (state.status === "paused") return `暂停 · ${title}`;
      return `${formatRemaining2(state.remainingMs)} · ${title}`;
    }
    function timeboxProgressRatio2(state) {
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
    var TIMEBOX_WEEKDAY_SHORT = ["一", "二", "三", "四", "五", "六", "日"];
    var TIMEBOX_WEEKDAY_ARIA = [
      "周日",
      "周一",
      "周二",
      "周三",
      "周四",
      "周五",
      "周六"
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
      const end = new Date(weekStartMs + 6 * 864e5);
      const sy = start.getFullYear();
      const ey = end.getFullYear();
      const startPart = `${start.getMonth() + 1}/${start.getDate()}`;
      const endPart = `${end.getMonth() + 1}/${end.getDate()}`;
      if (sy !== ey) return `${sy}/${startPart} – ${ey}/${endPart}`;
      return `${startPart} – ${endPart}`;
    }
    function formatFocusDuration2(minutes) {
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
      const duration = formatFocusDuration2(minutes);
      const blockPart = blocks > 0 ? `，${blocks}块` : "";
      return `${weekday} ${datePart}，${duration}${blockPart}`;
    }
    function timeboxSessionId2() {
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
      const outcome = ["completed", "early", "abandoned"].includes(raw.outcome) ? raw.outcome : raw.completed === false ? "abandoned" : "completed";
      const note = String(raw.note || "").trim();
      const session = {
        id: String(raw.id || timeboxSessionId2()),
        title,
        startedAt,
        endedAt,
        plannedMs,
        focusedMs,
        outcome,
        note,
        deviceId: String(raw.deviceId || "").trim(),
        sourcePath: String(raw.sourcePath || "").trim()
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
        const dayKey = String(item && item.dayKey || "");
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
        const nextMidnight = startOfLocalDay(cursor) + 864e5;
        const sliceEnd = Math.min(end, nextMidnight);
        if (sliceEnd <= cursor) break;
        parts.push({
          dayKey: localDayKey(cursor),
          focusedMs: sliceEnd - cursor
        });
        cursor = sliceEnd;
      }
      return parts;
    }
    function segmentsFromIntervals(intervals) {
      const totals = /* @__PURE__ */ new Map();
      for (const interval of normalizeFocusIntervals(intervals)) {
        for (const part of splitIntervalByLocalDay(interval.start, interval.end)) {
          totals.set(part.dayKey, (totals.get(part.dayKey) || 0) + part.focusedMs);
        }
      }
      return Array.from(totals.entries()).map(([dayKey, focusedMs]) => ({
        dayKey,
        focusedMs
      }));
    }
    function sessionContributesBlock(session) {
      return session.outcome === "completed" || session.outcome === "early";
    }
    function sessionMinuteParts(session) {
      if (Array.isArray(session.segments) && session.segments.length) {
        return session.segments.map((seg) => ({
          dayKey: seg.dayKey,
          minutes: Math.round((Number(seg.focusedMs) || 0) / 6e4)
        }));
      }
      return [
        {
          dayKey: localDayKey(session.endedAt),
          minutes: Math.round((Number(session.focusedMs) || 0) / 6e4)
        }
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
      const map = /* @__PURE__ */ new Map();
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
    function summarizeTimeboxStats2(sessions, now = Date.now(), opts = {}) {
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
        const key = localDayKey(todayStart - offset * 864e5, now);
        if (!dayKeysWithBlocks.has(key)) break;
        streak += 1;
      }
      const weekStartMs = startOfLocalWeek(now);
      const weekEndMs = weekStartMs + 7 * 864e5;
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
        const dayStart = weekStartMs + index * 864e5;
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
          shortLabel: formatFocusDurationShort(minutes)
        });
      }
      const titleStats = /* @__PURE__ */ new Map();
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
        if (sessionContributesBlock(session) && localDayKey(session.endedAt, now) >= weekKeyStart && localDayKey(session.endedAt, now) < weekKeyEnd) {
          prev.blocks += 1;
        }
        titleStats.set(session.title, prev);
      }
      const topTitles = Array.from(titleStats.entries()).map(([title, stat]) => ({
        title,
        minutes: stat.minutes,
        blocks: stat.blocks
      })).sort((a, b) => b.minutes - a.minutes || a.title.localeCompare(b.title)).slice(0, 3);
      let todayLabel = todayMinutes > 0 ? `今天 ${formatFocusDuration2(todayMinutes)}` : "今天还没开始";
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
        weekFocusLabel: weekMinutes > 0 ? formatFocusDuration2(weekMinutes) : "还没有",
        todayLabel,
        streakLabel: streak >= 2 ? `连续 ${streak} 天` : "",
        topTitles,
        todayLine: todayMinutes > 0 ? `今天 ${formatFocusDuration2(todayMinutes)}` : "今天还没有块"
      };
    }
    function buildSessionPayload(state, endedAt, outcome) {
      const plannedMs = Math.max(TIMEBOX_MIN_MS, Number(state.durationMs) || TIMEBOX_MIN_MS);
      const remainingMs = state.status === "running" ? Math.max(0, (state.endsAt || endedAt) - endedAt) : Math.max(0, Number(state.remainingMs) || 0);
      const intervals = normalizeFocusIntervals(state.focusIntervals);
      const intervalMs = intervals.reduce((sum, item) => sum + (item.end - item.start), 0);
      const focusedFromClock = Math.max(0, Math.min(plannedMs, plannedMs - remainingMs));
      const focusedMs = intervals.length ? Math.max(0, Math.min(plannedMs, intervalMs)) : focusedFromClock;
      const segments = intervals.length ? segmentsFromIntervals(intervals) : null;
      const session = {
        id: timeboxSessionId2(),
        title: String(state.title || "").trim(),
        startedAt: Number(state.startedAt) || endedAt,
        endedAt,
        plannedMs,
        focusedMs,
        outcome,
        note: "",
        deviceId: "",
        sourcePath: String(state.sourcePath || "").trim()
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
        const start2 = startOfLocalMonth(point);
        const next = new Date(start2);
        next.setMonth(next.getMonth() + 1);
        return { mode, from: start2, to: next.getTime() };
      }
      if (mode === "year") {
        const start2 = startOfLocalYear(point);
        const next = new Date(start2);
        next.setFullYear(next.getFullYear() + 1);
        return { mode, from: start2, to: next.getTime() };
      }
      if (mode === "custom") {
        const start2 = startOfLocalDay(Number(from) || point);
        const end = startOfLocalDay(Number(to) || point) + 864e5;
        return {
          mode,
          from: Math.min(start2, end - 864e5),
          to: Math.max(end, start2 + 864e5)
        };
      }
      const start = startOfLocalWeek(point);
      return { mode: "week", from: start, to: start + 7 * 864e5 };
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
      const span = Math.max(864e5, Number(to) - Number(from));
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
          for (let day = monthStart; day < next.getTime(); day += 864e5) {
            const key = localDayKey(day);
            minutes += minutesOnDay(merged, key);
            blocks += merged.filter(
              (session) => sessionContributesBlock(session) && localDayKey(session.endedAt) === key
            ).length;
          }
          bars.push({
            key: localDayKey(monthStart).slice(0, 7),
            dayStart: monthStart,
            grain: "month",
            minutes,
            blocks,
            label: `${month + 1}月`,
            durationLabel: formatFocusDuration2(minutes),
            isFuture: monthStart > startOfLocalDay(Date.now())
          });
        }
      } else {
        for (let day = startOfLocalDay(bounds.from); day < bounds.to; day += 864e5) {
          const key = localDayKey(day);
          const minutes = minutesOnDay(merged, key);
          const blocks = merged.filter(
            (session) => sessionContributesBlock(session) && localDayKey(session.endedAt) === key
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
            durationLabel: formatFocusDuration2(minutes),
            isFuture: day > startOfLocalDay(Date.now()),
            ariaLabel: timeboxDayAriaLabel(day, minutes, blocks)
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
          fillRatio: barFillRatio(bar.minutes, maxMinutes)
        }))
      };
    }
    function daySessionDetails(sessions, dayKey) {
      const details = [];
      for (const session of mergeSessions(sessions)) {
        const minutes = sessionMinuteParts(session).filter((part) => part.dayKey === dayKey).reduce((sum, part) => sum + part.minutes, 0);
        if (!minutes) continue;
        details.push({
          id: session.id,
          title: session.title,
          minutes,
          outcome: session.outcome,
          sourcePath: session.sourcePath || "",
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          block: sessionContributesBlock(session) && localDayKey(session.endedAt) === dayKey
        });
      }
      return details;
    }
    var TimeboxEngine2 = class {
      constructor({
        initialState,
        defaultMin = 30,
        now = () => Date.now(),
        onChange = () => {
        },
        onComplete = () => {
        },
        onAbandon = () => {
        }
      } = {}) {
        this.now = now;
        this.onChange = onChange;
        this.onComplete = onComplete;
        this.onAbandon = onAbandon;
        this.defaultMin = Math.max(1, Math.round(Number(defaultMin) || 30));
        this.state = normalizeTimebox2(initialState, this.defaultMin);
      }
      snapshot() {
        return {
          ...this.state,
          recentTitles: this.state.recentTitles.slice()
        };
      }
      start(title, durationMs, sourcePath) {
        if (this.state.status !== "idle") return false;
        const clean = String(title || "").trim();
        if (!clean) return false;
        const ms = clampDurationMs(durationMs, this.defaultMin * 6e4);
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
        const durationMs = this.state.durationMs || this.defaultMin * 6e4;
        const recentTitles = this.state.recentTitles;
        this.state = createDefaultTimebox2(Math.round(durationMs / 6e4));
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
    };
    module2.exports = {
      TIMEBOX_ABANDON_MIN_MS: TIMEBOX_ABANDON_MIN_MS2,
      TIMEBOX_MAX_PRESET_MIN,
      TIMEBOX_MIN_MS,
      TIMEBOX_PRESETS,
      TIMEBOX_RECENT_MAX,
      TIMEBOX_SESSION_RETENTION_MS,
      TimeboxEngine: TimeboxEngine2,
      clampDurationMs,
      clampPresetMinutes,
      createDefaultTimebox: createDefaultTimebox2,
      formatFocusDuration: formatFocusDuration2,
      formatFocusDurationShort,
      formatRemaining: formatRemaining2,
      formatTimeboxMinutes: formatTimeboxMinutes2,
      formatTimeboxStatusBar: formatTimeboxStatusBar2,
      localDayKey,
      mergeSessions,
      normalizeSession,
      normalizeTimebox: normalizeTimebox2,
      parseTimeboxPresetMinutes: parseTimeboxPresetMinutes2,
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
      summarizeTimeboxStats: summarizeTimeboxStats2,
      timeboxProgressRatio: timeboxProgressRatio2,
      timeboxSessionId: timeboxSessionId2
    };
  }
});

// compound.js
var require_compound = __commonJS({
  "compound.js"(exports2, module2) {
    var COMPOUND_DIR2 = "资料库/复利";
    var COMPOUND_TITLE2 = "复利";
    var COMPOUND_FIELD_MAX2 = 2e3;
    var COMPOUND_FIELDS2 = [
      { key: "kept", title: "今天留下了什么？" },
      { key: "found", title: "今天发现了什么问题？" },
      { key: "change", title: "明天因此改变什么？" },
      { key: "note", title: "一句发现或下一步" }
    ];
    var COMPOUND_WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    function parseCompoundDay2(dayKey) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey || ""));
      if (!match) return null;
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
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
    function compoundDayKeyFromTime2(ts = Date.now()) {
      return formatCompoundDay(new Date(ts));
    }
    function addCompoundDays2(dayKey, delta) {
      const date = parseCompoundDay2(dayKey);
      if (!date) return "";
      date.setDate(date.getDate() + Number(delta) || 0);
      return formatCompoundDay(date);
    }
    function compoundWeekStart2(dayKey) {
      const date = parseCompoundDay2(dayKey);
      if (!date) return "";
      const weekday = date.getDay();
      const diff = weekday === 0 ? -6 : 1 - weekday;
      date.setDate(date.getDate() + diff);
      return formatCompoundDay(date);
    }
    function compoundWeekdayLabel2(dayKey) {
      const date = parseCompoundDay2(dayKey);
      if (!date) return "";
      return COMPOUND_WEEKDAYS[date.getDay()];
    }
    function compoundWeekLabel2(weekStart) {
      const start = compoundWeekStart2(weekStart);
      if (!start) return "";
      return `${start} ～ ${addCompoundDays2(start, 6)}`;
    }
    function compoundWeekPath2(weekStart) {
      const start = compoundWeekStart2(weekStart);
      if (!start) return "";
      return `${COMPOUND_DIR2}/${start}.md`;
    }
    function clipCompoundField(value) {
      return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, COMPOUND_FIELD_MAX2);
    }
    function emptyCompoundDay2() {
      return { kept: "", found: "", change: "" };
    }
    function normalizeCompoundDay2(raw) {
      const day = emptyCompoundDay2();
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return day;
      for (const field of COMPOUND_FIELDS2) {
        day[field.key] = clipCompoundField(raw[field.key]);
      }
      return day;
    }
    function compoundDayIsEmpty(day) {
      const normalized = normalizeCompoundDay2(day);
      return COMPOUND_FIELDS2.every((field) => !normalized[field.key]);
    }
    function compoundDayEquals2(left, right) {
      const a = normalizeCompoundDay2(left);
      const b = normalizeCompoundDay2(right);
      return COMPOUND_FIELDS2.every((field) => a[field.key] === b[field.key]);
    }
    function isCompoundWeekNote2(markdown) {
      return /^type:\s*compound-week\s*$/m.test(String(markdown ?? ""));
    }
    function parseCompoundWeek2(markdown) {
      const text = String(markdown ?? "").replace(/\r\n/g, "\n");
      const weekMatch = text.match(/^week_start:\s*(\d{4}-\d{2}-\d{2})\s*$/m);
      const weekStart = weekMatch && parseCompoundDay2(weekMatch[1]) ? weekMatch[1] : "";
      const days = {};
      const marks = [];
      const dayRe = /^## (\d{4}-\d{2}-\d{2})[^\n]*$/gm;
      let dayMatch;
      while (dayMatch = dayRe.exec(text)) {
        marks.push({
          dayKey: dayMatch[1],
          start: dayMatch.index,
          bodyAt: dayMatch.index + dayMatch[0].length
        });
      }
      for (let i = 0; i < marks.length; i += 1) {
        if (!parseCompoundDay2(marks[i].dayKey)) continue;
        const end = i + 1 < marks.length ? marks[i + 1].start : text.length;
        const body = text.slice(marks[i].bodyAt, end);
        const entry = emptyCompoundDay2();
        const fields = [];
        const fieldRe = /^### ([^\n]+)$/gm;
        let fieldMatch;
        while (fieldMatch = fieldRe.exec(body)) {
          fields.push({
            title: fieldMatch[1].trim(),
            start: fieldMatch.index,
            bodyAt: fieldMatch.index + fieldMatch[0].length
          });
        }
        for (let j = 0; j < fields.length; j += 1) {
          const field = COMPOUND_FIELDS2.find((item) => item.title === fields[j].title);
          if (!field) continue;
          const fieldEnd = j + 1 < fields.length ? fields[j + 1].start : body.length;
          entry[field.key] = clipCompoundField(body.slice(fields[j].bodyAt, fieldEnd));
        }
        if (!compoundDayIsEmpty(entry)) days[marks[i].dayKey] = entry;
      }
      return { weekStart, days };
    }
    function renderCompoundWeek2(weekStart, days) {
      const start = compoundWeekStart2(weekStart);
      if (!start) return "";
      const end = addCompoundDays2(start, 6);
      const keys = Object.keys(days || {}).filter((key) => {
        if (!parseCompoundDay2(key) || key < start || key > end) return false;
        return !compoundDayIsEmpty(days[key]);
      }).sort();
      const parts = [
        "---",
        "type: compound-week",
        `week_start: ${start}`,
        "---",
        "",
        `# 复利 · ${start} ～ ${end}`,
        ""
      ];
      for (const key of keys) {
        const day = normalizeCompoundDay2(days[key]);
        parts.push(`## ${key} ${compoundWeekdayLabel2(key)}`);
        parts.push("");
        for (const field of COMPOUND_FIELDS2) {
          parts.push(`### ${field.title}`);
          parts.push("");
          if (day[field.key]) {
            parts.push(day[field.key]);
            parts.push("");
          }
        }
      }
      return `${parts.join("\n").replace(/\n+$/, "")}
`;
    }
    function mergeCompoundDay2(days, dayKey, entry) {
      const next = {};
      const source = days && typeof days === "object" && !Array.isArray(days) ? days : {};
      for (const key of Object.keys(source)) {
        if (!parseCompoundDay2(key)) continue;
        const day = normalizeCompoundDay2(source[key]);
        if (!compoundDayIsEmpty(day)) next[key] = day;
      }
      if (!parseCompoundDay2(dayKey)) return next;
      const incoming = normalizeCompoundDay2(entry);
      if (compoundDayIsEmpty(incoming)) delete next[dayKey];
      else next[dayKey] = incoming;
      return next;
    }
    function yesterdayCompoundChange2(todayKey, sameWeekDays, previousWeekDays) {
      const yesterday = addCompoundDays2(todayKey, -1);
      if (!yesterday) return "";
      const sameWeek = compoundWeekStart2(yesterday) === compoundWeekStart2(todayKey);
      const days = sameWeek ? sameWeekDays : previousWeekDays;
      return normalizeCompoundDay2(days && days[yesterday]).change;
    }
    function summarizeCompoundDay2(day) {
      const normalized = normalizeCompoundDay2(day);
      if (compoundDayIsEmpty(normalized)) {
        return { filled: false, main: "还没记", preview: "" };
      }
      const preview = normalized.kept.split("\n").map((line) => line.trim()).find(Boolean) || "";
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
    function compoundDaysInWeek2(weekStart, days, todayKey) {
      const start = compoundWeekStart2(weekStart);
      const end = addCompoundDays2(start, 6);
      if (!start || !parseCompoundDay2(todayKey)) return [];
      return Object.keys(days || {}).filter((key) => {
        if (!parseCompoundDay2(key) || key < start || key > end || key > todayKey) return false;
        return !compoundDayIsEmpty(days[key]);
      }).sort();
    }
    module2.exports = {
      COMPOUND_DIR: COMPOUND_DIR2,
      COMPOUND_FIELD_MAX: COMPOUND_FIELD_MAX2,
      COMPOUND_FIELDS: COMPOUND_FIELDS2,
      COMPOUND_TITLE: COMPOUND_TITLE2,
      addCompoundDays: addCompoundDays2,
      clipCompoundField,
      compoundDayEquals: compoundDayEquals2,
      compoundDayIsEmpty,
      compoundDayKeyFromTime: compoundDayKeyFromTime2,
      compoundDaysInWeek: compoundDaysInWeek2,
      compoundWeekLabel: compoundWeekLabel2,
      compoundWeekPath: compoundWeekPath2,
      compoundWeekStart: compoundWeekStart2,
      compoundWeekdayLabel: compoundWeekdayLabel2,
      emptyCompoundDay: emptyCompoundDay2,
      isCompoundWeekNote: isCompoundWeekNote2,
      mergeCompoundDay: mergeCompoundDay2,
      normalizeCompoundDay: normalizeCompoundDay2,
      parseCompoundDay: parseCompoundDay2,
      parseCompoundWeek: parseCompoundWeek2,
      renderCompoundWeek: renderCompoundWeek2,
      formatDayRecords,
      summarizeCompoundDay: summarizeCompoundDay2,
      yesterdayCompoundChange: yesterdayCompoundChange2
    };
  }
});

// review-queue.js
var require_review_queue = __commonJS({
  "review-queue.js"(exports2, module2) {
    var REVIEW_LEDGER_PATH2 = "agent-inbox/meinc-home/review-ledger.json";
    var HONGLOU_PUSH_FOLDER2 = "基础学科/语文/红楼梦/每日推送";
    var LIBRARY_ROOT2 = "资料库";
    var LIBRARY_EXCLUDE_DIRS2 = /* @__PURE__ */ new Set(["成绩", "复利", "附件"]);
    var REVIEW_LEXI_BATCH = 4;
    var REVIEW_NEW_RATIO = 3;
    var DAY_START_HOUR = 4;
    var STAGGER_DAYS = 7;
    var REVIEW_MORE_LINKS = [
      { name: "词汇笔记", path: "基础学科/英语/01-词汇", icon: "library" },
      { name: "背诵默写", path: "基础学科/语文", icon: "book-open", filter: "memorization" }
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
      return start + 864e5;
    }
    function addCalendarDays(ts, days) {
      const d = new Date(ts);
      d.setDate(d.getDate() + days);
      return d.getTime();
    }
    function normalizeLedger2(raw) {
      const entries = {};
      if (raw && raw.entries && typeof raw.entries === "object") {
        for (const [path, entry] of Object.entries(raw.entries)) {
          if (!path) continue;
          entries[path] = normalizeLedgerEntry2(entry, path);
        }
      }
      return {
        version: 1,
        staggered: !!(raw && raw.staggered),
        entries
      };
    }
    function normalizeLedgerEntry2(entry, path) {
      let kind = "article";
      const rawKind = entry && entry.kind;
      if (rawKind === "honglou" || rawKind === "article" || rawKind === "passage" || rawKind === "output") {
        kind = rawKind;
      } else if (String(path || "").includes("红楼梦/每日推送")) kind = "honglou";
      const out = {
        kind,
        due: Number(entry && entry.due) || 0,
        addedAt: Number(entry && entry.addedAt) || Date.now()
      };
      const prompt = String(entry && entry.prompt || "").trim();
      const excerpt = String(entry && entry.excerpt || "").trim();
      const title = String(entry && entry.title || "").trim();
      if (prompt) out.prompt = prompt.slice(0, 500);
      if (excerpt) out.excerpt = excerpt.slice(0, 4e3);
      if (title) out.title = title.slice(0, 200);
      return out;
    }
    function proseIntervalDays(rating) {
      if (rating === "good") return 7;
      if (rating === "hard") return 3;
      return 1;
    }
    function proseDueAfterGrade2(rating, now = Date.now()) {
      const days = proseIntervalDays(rating);
      if (days <= 1) return startOfNextDay(now);
      return addCalendarDays(now, days);
    }
    function isProseDue(entry, now = Date.now()) {
      if (!entry) return false;
      const due = Number(entry.due) || 0;
      return !due || due <= now;
    }
    function listDueProseEntries2(ledger, now = Date.now()) {
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
          title: entry.title || ""
        });
      }
      due.sort((a, b) => (a.due || 0) - (b.due || 0));
      return due;
    }
    function pickDueProse2(ledger, now = Date.now(), opts = {}) {
      const maxHonglou = opts.maxHonglou ?? 1;
      const maxArticle = opts.maxArticle ?? 1;
      const due = listDueProseEntries2(ledger, now);
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
    function buildLexiQueueItems2(lexideck, now = Date.now()) {
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
            card
          });
        }
      }
      return out;
    }
    function ledgerEntryForHonglouRead2(now = Date.now()) {
      return {
        kind: "honglou",
        due: startOfNextDay(now),
        addedAt: now
      };
    }
    function ledgerEntryForPassage(excerpt, now = Date.now()) {
      return {
        kind: "passage",
        due: now,
        addedAt: now,
        prompt: "这段在说什么？",
        excerpt: String(excerpt || "").trim().slice(0, 4e3)
      };
    }
    function ledgerEntryForOutput(excerpt, now = Date.now()) {
      return {
        kind: "output",
        due: now,
        addedAt: now,
        prompt: "合上之后，用自己的话再讲一遍",
        excerpt: String(excerpt || "").trim().slice(0, 4e3)
      };
    }
    function ledgerEntryForArticle2(path, now = Date.now()) {
      return {
        kind: "article",
        due: now,
        addedAt: now
      };
    }
    function staggerHonglouBackfill2(inboxDone, paths, now = Date.now()) {
      const done = (paths || []).filter((path) => inboxDone && inboxDone[path]).sort();
      const entries = {};
      if (!done.length) return entries;
      const base = startOfNextDay(now);
      const spanMs = STAGGER_DAYS * 864e5;
      for (let i = 0; i < done.length; i += 1) {
        const offset = Math.floor(i / done.length * STAGGER_DAYS);
        const due = base + Math.min(spanMs - 1, offset * 864e5);
        entries[done[i]] = {
          kind: "honglou",
          due,
          addedAt: now
        };
      }
      return entries;
    }
    function shouldHideSubjectChild2(path, name) {
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
    function isLibraryArticlePath2(path) {
      const p = String(path || "");
      if (!p.startsWith(`${LIBRARY_ROOT2}/`) || !p.endsWith(".md")) return false;
      const rest = p.slice(LIBRARY_ROOT2.length + 1);
      const top = rest.split("/")[0];
      if (!top || LIBRARY_EXCLUDE_DIRS2.has(top)) return false;
      if (rest === "00-入口.md") return false;
      return true;
    }
    function libraryArticleCategory2(path) {
      const rest = String(path || "").slice(LIBRARY_ROOT2.length + 1);
      return rest.split("/")[0] || LIBRARY_ROOT2;
    }
    module2.exports = {
      REVIEW_LEDGER_PATH: REVIEW_LEDGER_PATH2,
      HONGLOU_PUSH_FOLDER: HONGLOU_PUSH_FOLDER2,
      LIBRARY_ROOT: LIBRARY_ROOT2,
      LIBRARY_EXCLUDE_DIRS: LIBRARY_EXCLUDE_DIRS2,
      REVIEW_LEXI_BATCH,
      REVIEW_MORE_LINKS,
      addCalendarDays,
      buildLexiQueueItems: buildLexiQueueItems2,
      interleaveLexideck,
      isLibraryArticlePath: isLibraryArticlePath2,
      isProseDue,
      ledgerEntryForArticle: ledgerEntryForArticle2,
      ledgerEntryForHonglouRead: ledgerEntryForHonglouRead2,
      ledgerEntryForOutput,
      ledgerEntryForPassage,
      libraryArticleCategory: libraryArticleCategory2,
      mixReviewQueue,
      normalizeLedger: normalizeLedger2,
      normalizeLedgerEntry: normalizeLedgerEntry2,
      listDueProseEntries: listDueProseEntries2,
      pickDueProse: pickDueProse2,
      proseDueAfterGrade: proseDueAfterGrade2,
      proseIntervalDays,
      shouldHideSubjectChild: shouldHideSubjectChild2,
      staggerHonglouBackfill: staggerHonglouBackfill2,
      startOfNextDay
    };
  }
});

// activity.js
var require_activity = __commonJS({
  "activity.js"(exports2, module2) {
    var ACTIVITY_PREFIX = "activity-";
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
        deviceId: String(raw.deviceId || "").trim()
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
        "monthKey"
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
      const map = /* @__PURE__ */ new Map();
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
        } catch (_) {
        }
      }
      return mergeEvents(events);
    }
    function serializeActivityJsonl(events) {
      return mergeEvents(events).map((event) => JSON.stringify(event)).join("\n");
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
      const reads = /* @__PURE__ */ new Map();
      const drafts = /* @__PURE__ */ new Map();
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
          event: review
        });
      }
      for (const event of drafts.values()) {
        items.push({
          kind: "draft",
          title: event.title || "未写完的草稿",
          path: event.path || "",
          draftId: event.draftId || "",
          at: event.at,
          event
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
          event
        });
      }
      if (next && next.text) {
        items.push({
          kind: "next",
          title: next.text,
          path: next.targetPath || next.path || "",
          at: next.at,
          event: next
        });
      }
      return items.sort((a, b) => b.at - a.at).slice(0, Math.max(0, limit));
    }
    function readingShelves(events, paths) {
      const merged = mergeEvents(events);
      const progress = /* @__PURE__ */ new Map();
      const later = /* @__PURE__ */ new Set();
      for (const event of merged) {
        if (event.type === "read" && event.path) progress.set(event.path, event);
        if (event.type === "later" && event.path) later.add(event.path);
        if (event.type === "later-off" && event.path) later.delete(event.path);
      }
      const reading = Array.from(progress.values()).filter((event) => (Number(event.progress) || 0) < 0.98).sort((a, b) => b.at - a.at);
      const readingPaths = new Set(reading.map((event) => event.path));
      const queued = Array.from(later).filter((path) => !readingPaths.has(path));
      const known = /* @__PURE__ */ new Set([...readingPaths, ...queued]);
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
          minutes: part.minutes
        });
      }
      return items;
    }
    module2.exports = {
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
      serializeActivityJsonl
    };
  }
});

// drafts.js
var require_drafts = __commonJS({
  "drafts.js"(exports2, module2) {
    var { contentHash } = require_activity();
    var DRAFT_DIR = "手记/草稿";
    function draftPath(id) {
      return `${DRAFT_DIR}/${id}.md`;
    }
    function conflictPath(id, deviceId) {
      const suffix = String(deviceId || "other").replace(/[^\w-]/g, "").slice(0, 24) || "other";
      return `${DRAFT_DIR}/${id}.conflict-${suffix}.md`;
    }
    function renderDraft({ id, body, baseHash, deviceId, kind, updatedAt }) {
      const hash = baseHash || contentHash(body);
      return [
        "---",
        "type: meinc-draft",
        `draft_id: ${id}`,
        `base_hash: ${hash}`,
        `device_id: ${deviceId || ""}`,
        `kind: ${kind || "writing"}`,
        `updated_at: ${updatedAt || (/* @__PURE__ */ new Date()).toISOString()}`,
        "---",
        "",
        String(body ?? ""),
        ""
      ].join("\n");
    }
    function parseDraft(markdown) {
      const text = String(markdown ?? "");
      const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
      if (!match) {
        return {
          id: "",
          body: text.replace(/\n$/, ""),
          baseHash: "",
          deviceId: "",
          kind: "",
          wrapped: false
        };
      }
      const meta = {};
      for (const line of match[1].split("\n")) {
        const pair = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
        if (pair) meta[pair[1]] = pair[2].trim();
      }
      return {
        id: meta.draft_id || "",
        body: match[2].replace(/^\n/, "").replace(/\n$/, ""),
        baseHash: meta.base_hash || "",
        deviceId: meta.device_id || "",
        kind: meta.kind || "",
        wrapped: meta.type === "meinc-draft"
      };
    }
    function planTextSave({ baseHash, localBody, diskBody, deviceId, conflictTarget }) {
      const local = String(localBody ?? "");
      const disk = diskBody == null ? null : String(diskBody);
      const localHash = contentHash(local);
      if (disk == null) return { action: "write", body: local, hash: localHash };
      const diskHash = contentHash(disk);
      if (diskHash === localHash) return { action: "unchanged", hash: localHash };
      if (!baseHash || diskHash === baseHash) return { action: "write", body: local, hash: localHash };
      return {
        action: "conflict",
        path: conflictTarget,
        body: local,
        hash: localHash,
        deviceId: deviceId || ""
      };
    }
    function planDraftSave({ id, kind, deviceId, baseHash, localBody, diskMarkdown }) {
      const parsed = diskMarkdown == null ? null : parseDraft(diskMarkdown);
      const diskBody = parsed ? parsed.body : null;
      const knownBase = baseHash || parsed && parsed.baseHash || "";
      const decision = planTextSave({
        baseHash: knownBase,
        localBody,
        diskBody,
        deviceId,
        conflictTarget: conflictPath(id, deviceId)
      });
      if (decision.action === "unchanged") return decision;
      if (decision.action === "conflict") {
        return {
          ...decision,
          markdown: renderDraft({
            id,
            body: localBody,
            baseHash: decision.hash,
            deviceId,
            kind
          })
        };
      }
      return {
        action: "write",
        path: draftPath(id),
        hash: decision.hash,
        markdown: renderDraft({
          id,
          body: localBody,
          baseHash: decision.hash,
          deviceId,
          kind
        })
      };
    }
    module2.exports = {
      DRAFT_DIR,
      conflictPath,
      draftPath,
      parseDraft,
      planDraftSave,
      planTextSave,
      renderDraft
    };
  }
});

// archive.js
var require_archive = __commonJS({
  "archive.js"(exports2, module2) {
    var { contentHash } = require_activity();
    function renderArchivePending({
      draftPath,
      draftId,
      hash,
      proposedTitle,
      proposedPath,
      created
    }) {
      return [
        "---",
        "status: pending",
        "type: note-archive",
        `title: ${proposedTitle || "归档草稿"}`,
        `created: ${created || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`,
        `path: ${proposedPath || ""}`,
        `source_paths: ${JSON.stringify([draftPath].filter(Boolean))}`,
        `content_hash: ${hash || ""}`,
        `draft_id: ${draftId || ""}`,
        "---",
        "",
        "只建议标题和存放位置。确认前不要改写正文。",
        ""
      ].join("\n");
    }
    function parseArchivePending(markdown) {
      const text = String(markdown ?? "");
      const match = text.match(/^---\n([\s\S]*?)\n---/);
      const meta = {};
      if (match) {
        for (const line of match[1].split("\n")) {
          const pair = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
          if (pair) meta[pair[1]] = pair[2].trim().replace(/^["']|["']$/g, "");
        }
      }
      return {
        status: meta.status || "pending",
        type: meta.type || "",
        title: meta.title || "",
        path: meta.path || "",
        hash: meta.content_hash || "",
        draftId: meta.draft_id || ""
      };
    }
    function decideArchive({ draftBody, confirmedHash, targetExists, targetBody }) {
      const body = String(draftBody ?? "");
      const hash = contentHash(body);
      if (!confirmedHash || hash !== confirmedHash) return { action: "stale", hash };
      if (targetExists && String(targetBody ?? "") === body) return { action: "noop", hash };
      if (targetExists) return { action: "conflict", hash };
      return { action: "write", hash, body };
    }
    function decideNextWrite({ line, confirmedLine, targetBody, confirmedTargetHash }) {
      const text = String(line || "").trim();
      if (!text || text !== String(confirmedLine || "").trim()) return { action: "stale" };
      const currentHash = contentHash(String(targetBody ?? ""));
      if (confirmedTargetHash && currentHash !== confirmedTargetHash) return { action: "stale" };
      if (String(targetBody || "").includes(text)) return { action: "noop" };
      return { action: "append", line: text, hash: currentHash };
    }
    module2.exports = {
      decideArchive,
      decideNextWrite,
      parseArchivePending,
      renderArchivePending
    };
  }
});

// archive-llm.js
var require_archive_llm = __commonJS({
  "archive-llm.js"(exports2, module2) {
    var ARCHIVE_SYSTEM = `你是笔记归档助手。根据正文只建议标题和存放路径，不改写正文。
只输出一个 JSON 对象，无 markdown 围栏：
{"title":"简短标题","path":"相对路径.md"}

路径必须：
- 以 手记/、项目库/ 或 基础学科/ 开头
- 以 .md 结尾
- 不得使用 手记/草稿
- 优先从用户给出的现有文件夹中选择合适位置`;
    function archiveLlmConfigFromApp(app) {
      const agent = app?.plugins?.plugins?.["obsidian-agent-os"];
      const s = agent?.settings || {};
      const baseUrl = String(s.memoryLlmBaseUrl || s.embedBaseUrl || "").trim().replace(/\/$/, "");
      const apiKey = String(s.memoryLlmApiKey || s.embedApiKey || "").trim();
      const model = String(s.memoryLlmModel || "qwen3.7-flash").trim();
      return { baseUrl, apiKey, model };
    }
    function isAllowedArchivePath(path) {
      const p = String(path || "");
      if (!/^(手记|项目库|基础学科)\/.+\.md$/.test(p) || p.includes("..")) return false;
      if (/^手记\/草稿(\/|$)/.test(p)) return false;
      return true;
    }
    function sanitizeFileStem(title) {
      const stem = String(title || "未命名").trim().replace(/[\\/:*?"<>|#\n\r]/g, "").slice(0, 80);
      return stem || "未命名";
    }
    function fallbackArchivePath(title) {
      return `手记/随记/${sanitizeFileStem(title)}.md`;
    }
    function normalizeArchiveSuggestion(parsed) {
      const title = String(parsed?.title || "").trim() || "未命名";
      let path = String(parsed?.path || "").trim();
      if (!isAllowedArchivePath(path)) path = fallbackArchivePath(title);
      return { title, path };
    }
    function parseArchiveSuggestionJson(text) {
      const s = String(text || "").trim();
      const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
      const body = fenced ? fenced[1].trim() : s;
      const start = body.indexOf("{");
      const end = body.lastIndexOf("}");
      if (start < 0 || end <= start) throw new Error("archive: no JSON object");
      return normalizeArchiveSuggestion(JSON.parse(body.slice(start, end + 1)));
    }
    function bumpArchivePath(path, index) {
      const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const dot = path.lastIndexOf(".md");
      if (dot < 0) return path;
      const stem = path.slice(0, dot);
      if (index <= 0) return `${stem}-${date}.md`;
      return `${stem}-${date}-${index + 1}.md`;
    }
    function avoidPathCollision(path, draftBody, readBody) {
      const existing = readBody(path);
      if (existing == null) return path;
      if (String(existing) === String(draftBody)) return path;
      for (let i = 0; i < 24; i += 1) {
        const candidate = bumpArchivePath(path, i);
        const body = readBody(candidate);
        if (body == null) return candidate;
        if (String(body) === String(draftBody)) return candidate;
      }
      return bumpArchivePath(path, 23);
    }
    async function resolveArchivePath(path, draftBody, readBody) {
      const existing = await readBody(path);
      if (existing == null) return path;
      if (String(existing) === String(draftBody)) return path;
      for (let i = 0; i < 24; i += 1) {
        const candidate = bumpArchivePath(path, i);
        const body = await readBody(candidate);
        if (body == null) return candidate;
        if (String(body) === String(draftBody)) return candidate;
      }
      return bumpArchivePath(path, 23);
    }
    async function callArchiveLlm(opts) {
      const base = String(opts.baseUrl || "").replace(/\/$/, "");
      const apiKey = String(opts.apiKey || "").trim();
      const model = String(opts.model || "").trim();
      if (!base || !apiKey || !model) {
        return { skipped: true, reason: "no-config" };
      }
      const fetchImpl = opts.fetchImpl || globalThis.fetch;
      if (!fetchImpl) return { skipped: true, reason: "no-fetch" };
      const hints = (opts.folderHints || []).slice(0, 80);
      const userParts = [
        hints.length ? `现有文件夹（优先选用）：
${hints.join("\n")}` : "",
        "正文：",
        String(opts.body || "").slice(0, 12e3)
      ].filter(Boolean);
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeoutMs = opts.timeoutMs ?? 2e4;
      const timer = controller && setTimeout(() => {
        try {
          controller.abort();
        } catch {
        }
      }, timeoutMs);
      try {
        const res = await fetchImpl(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model,
            temperature: 0.1,
            max_tokens: 400,
            messages: [
              { role: "system", content: ARCHIVE_SYSTEM },
              { role: "user", content: userParts.join("\n\n") }
            ]
          }),
          signal: opts.signal || controller?.signal
        });
        let body;
        try {
          body = await res.json();
        } catch {
          throw new Error(`archive HTTP ${res.status} non-JSON`);
        }
        if (!res.ok) {
          const msg = body?.error?.message || body?.message || `HTTP ${res.status}`;
          throw new Error(`archive: ${msg}`);
        }
        const content = body?.choices?.[0]?.message?.content || "";
        const suggestion = parseArchiveSuggestionJson(content);
        return { ok: true, suggestion };
      } catch (e) {
        return { ok: false, error: e?.message || String(e) };
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    module2.exports = {
      ARCHIVE_SYSTEM,
      archiveLlmConfigFromApp,
      avoidPathCollision,
      bumpArchivePath,
      callArchiveLlm,
      fallbackArchivePath,
      isAllowedArchivePath,
      normalizeArchiveSuggestion,
      parseArchiveSuggestionJson,
      resolveArchivePath,
      sanitizeFileStem
    };
  }
});

// review-round.js
var require_review_round = __commonJS({
  "review-round.js"(exports2, module2) {
    var ROUND_SIZE = 5;
    function freshRound(items, size = ROUND_SIZE, now = Date.now()) {
      const queue = (Array.isArray(items) ? items : []).slice(0, size);
      return {
        queue,
        index: 0,
        revealed: false,
        note: "",
        skipped: [],
        startedAt: now,
        done: queue.length === 0
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
        note: ""
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
        revealed: false
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
    module2.exports = {
      ROUND_SIZE,
      cardKey,
      currentCard,
      freshRound,
      gradeRound,
      prosePrompt,
      skipRound
    };
  }
});

// projects.js
var require_projects = __commonJS({
  "projects.js"(exports2, module2) {
    function extractNextStep(markdown) {
      const text = String(markdown || "").replace(/\r\n/g, "\n");
      const heading = text.match(/^#{1,4}[ \t]+下一步[ \t]*$/m);
      if (heading) {
        const after = text.slice(heading.index + heading[0].length);
        const stop = after.search(/\n#{1,4}[ \t]/);
        const body = (stop >= 0 ? after.slice(0, stop) : after).trim();
        const line = body.split("\n").map((item) => item.replace(/^[-*]\s*/, "").trim()).find((item) => item && !item.startsWith("#"));
        if (line) return line;
      }
      const lines = text.split("\n");
      let column = -1;
      let last = "";
      for (const line of lines) {
        if (!line.includes("|")) continue;
        const cells = line.split("|").map((cell) => cell.trim());
        const header = cells.findIndex((cell) => cell === "下一步");
        if (header >= 0) {
          column = header;
          continue;
        }
        if (column < 0 || /^[-:\s|]+$/.test(line)) continue;
        const value = cells[column] || "";
        if (value && value !== "---") last = value;
      }
      return last;
    }
    function latestNextLine(markdown) {
      const fromHeading = extractNextStep(markdown);
      if (fromHeading) return fromHeading;
      const lines = String(markdown || "").split("\n").map((line) => line.replace(/^[-*]\s*/, "").trim()).filter((line) => line && !line.startsWith("#") && !line.startsWith("---"));
      return lines.length ? lines[lines.length - 1] : "";
    }
    function appendNextStep(markdown, sentence, dayKey) {
      const clean = String(sentence || "").trim();
      if (!clean) return String(markdown || "");
      const line = `- ${dayKey || ""} ${clean}`.replace("-  ", "- ");
      const text = String(markdown || "");
      if (/^#{1,4}[ \t]+下一步[ \t]*$/m.test(text)) {
        return text.replace(/^(#{1,4}[ \t]+下一步[ \t]*)$/m, `$1

${line}`);
      }
      const base = text.endsWith("\n") || !text ? text : `${text}
`;
      return `${base}
## 下一步

${line}
`;
    }
    function pickWorkPath(paths) {
      const files = (Array.isArray(paths) ? paths : []).filter(
        (path) => String(path).endsWith(".md") && !String(path).includes("/.trash/")
      );
      const prefer = ["04-产出", "草稿", "稿", "00-项目说明", "入口", "README", "about"];
      for (const key of prefer) {
        const hit = files.find((path) => path.includes(key));
        if (hit) return hit;
      }
      return files.find((path) => !path.endsWith("/下一步.md")) || files[0] || "";
    }
    function projectFolderFromPath(path) {
      const parts = String(path || "").split("/");
      if (parts[0] !== "项目库" || parts.length < 2) return "";
      return `项目库/${parts[1]}`;
    }
    function parseProjectLinks(markdown) {
      const links = [];
      const re = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
      let match;
      const text = String(markdown || "");
      while (match = re.exec(text)) {
        const target = match[1].trim();
        if (target.startsWith("项目库/")) links.push(target);
      }
      return links;
    }
    module2.exports = {
      appendNextStep,
      extractNextStep,
      latestNextLine,
      parseProjectLinks,
      pickWorkPath,
      projectFolderFromPath
    };
  }
});

// src/activity-ui.js
var require_activity_ui = __commonJS({
  "src/activity-ui.js"(exports2, module2) {
    var { MarkdownRenderer, Notice: Notice2, TFile: TFile2, TFolder: TFolder2, setIcon: setIcon2 } = require("obsidian");
    var {
      contentHash,
      continueItems,
      dayKeyFromTime,
      mergeEvents,
      parseActivityJsonl,
      readingShelves,
      recordsForDay,
      serializeActivityJsonl
    } = require_activity();
    var { DRAFT_DIR, parseDraft, planDraftSave, planTextSave } = require_drafts();
    var { decideArchive, renderArchivePending, parseArchivePending } = require_archive();
    var {
      archiveLlmConfigFromApp,
      callArchiveLlm,
      resolveArchivePath
    } = require_archive_llm();
    var { freshRound, gradeRound, prosePrompt, skipRound } = require_review_round();
    var {
      appendNextStep,
      extractNextStep,
      latestNextLine,
      pickWorkPath,
      projectFolderFromPath
    } = require_projects();
    var { COMPOUND_FIELDS: COMPOUND_FIELDS2, formatDayRecords } = require_compound();
    var {
      buildHistoryBars,
      daySessionDetails,
      resolveHistoryRange,
      sessionMinuteParts,
      shiftCustomRange,
      shiftHistoryAnchor
    } = require_timebox();
    var {
      buildLexiQueueItems: buildLexiQueueItems2,
      ledgerEntryForOutput,
      ledgerEntryForPassage,
      listDueProseEntries: listDueProseEntries2
    } = require_review_queue();
    var ACTIVITY_DIR = "agent-inbox/meinc-home";
    var OUTPUT_PROMPTS = [
      { label: "解释", text: "用自己的话解释：" },
      { label: "复述", text: "合上原文，复述：" },
      { label: "推导", text: "写下推导：" }
    ];
    function weeksAndDate(now = /* @__PURE__ */ new Date()) {
      const weeks = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
      return {
        weekday: weeks[now.getDay()],
        date: `${now.getMonth() + 1} 月 ${now.getDate()} 日`
      };
    }
    function splitFrontmatter(markdown) {
      const text = String(markdown ?? "");
      const match = text.match(/^---\n[\s\S]*?\n---\n?/);
      if (!match) return { meta: "", body: text };
      return { meta: match[0], body: text.slice(match[0].length) };
    }
    function allowedTarget(path) {
      return /^(手记|项目库|基础学科)\/.+\.md$/.test(String(path || "")) && !path.includes("..");
    }
    function collectArchiveFolderHints(app) {
      const roots = ["手记", "项目库", "基础学科"];
      const skip = /* @__PURE__ */ new Set(["手记/草稿", "项目库/_模板"]);
      const hints = [];
      const walk = (folderPath, depth) => {
        const folder = app.vault.getAbstractFileByPath(folderPath);
        if (!(folder instanceof TFolder2) || depth > 2) return;
        for (const child of folder.children) {
          if (!(child instanceof TFolder2)) continue;
          const path = `${folderPath}/${child.name}`;
          if (skip.has(path) || path.includes(".trash") || child.name.startsWith(".")) continue;
          hints.push(path);
          if (depth < 2) walk(path, depth + 1);
        }
      };
      for (const root of roots) walk(root, 1);
      return hints;
    }
    async function writeText(plugin, path, text) {
      await plugin.ensureFolders(path);
      const file = plugin.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile2) await plugin.app.vault.modify(file, text);
      else await plugin.app.vault.create(path, text);
    }
    async function readText(plugin, path) {
      const file = plugin.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile2)) return null;
      return plugin.app.vault.read(file);
    }
    function header(view, root, title, onBack) {
      const bar = root.createDiv({ cls: "meinc-home-header" });
      const back = bar.createEl("button", {
        cls: "meinc-home-back",
        attr: { "aria-label": "返回", type: "button" }
      });
      setIcon2(back, "chevron-left");
      back.onclick = () => {
        if (onBack) onBack();
        else view.back();
      };
      bar.createEl("h1", { cls: "meinc-home-title", text: title });
      return bar;
    }
    function renderActivityHome(view, root) {
      const { weekday, date } = weeksAndDate();
      const hero = root.createDiv({ cls: "meinc-home-hero" });
      const dateCol = hero.createDiv({ cls: "meinc-home-hero-date" });
      dateCol.createDiv({ cls: "meinc-home-kicker", text: weekday });
      dateCol.createEl("h1", { cls: "meinc-home-date", text: date });
      const focus = hero.createDiv({ cls: "meinc-home-focus" });
      view.mountCompoundChip(focus);
      view.mountTimebox(focus);
      const items = continueItems(view.plugin.activityEvents || []);
      const cont = root.createDiv({ cls: "meinc-home-continue" });
      cont.createDiv({ cls: "meinc-home-kicker", text: "继续做" });
      if (!items.length) {
        const row = cont.createDiv({ cls: "meinc-home-empty-actions" });
        row.createEl("button", { text: "开始写", attr: { type: "button" } }).onclick = () => view.openDraft({ kind: "writing" });
        row.createEl("button", { text: "选篇文章", attr: { type: "button" } }).onclick = () => view.openLibrary();
        row.createEl("button", { text: "开始复习", attr: { type: "button" } }).onclick = () => view.startStudyRound();
      } else {
        const group = cont.createDiv({ cls: "meinc-home-group" });
        items.forEach((item, index) => {
          view.addRow(group, {
            name: item.title,
            meta: item.kind === "read" ? "接着读" : item.kind === "review" ? "接着复习" : "接着写",
            icon: item.kind === "read" ? "book-open" : item.kind === "review" ? "rotate-cw" : "pencil",
            tint: "orange",
            index,
            onClick: () => openContinue(view, item)
          });
        });
      }
      const activities = root.createDiv({ cls: "meinc-home-group" });
      const actions = [
        ["阅读", "book-open", () => view.openLibrary()],
        ["复习", "rotate-cw", () => view.startStudyRound()],
        ["输出", "pen-line", () => view.openDraft({ kind: "output", resume: true })],
        ["写作", "pencil", () => view.openWriting()],
        ["项目", "folder", () => view.openProjects()]
      ];
      actions.forEach(([name, icon, onClick], index) => {
        view.addRow(activities, { name, icon, tint: "blue", index, onClick });
      });
      const aux = root.createDiv({ cls: "meinc-home-group" });
      [
        ["Timebox", "timer", () => view.plugin.openTimeboxStart()],
        ["时间记录", "bar-chart-3", () => view.openTimeboxHistory()],
        ["复利", "sprout", () => view.openCompound()],
        ["Agent", "sparkles", () => view.plugin.openAgent()],
        ["AI 信箱", "inbox", () => view.push({ type: "inbox", title: "AI 信箱" })]
      ].forEach(([name, icon, onClick], index) => {
        view.addRow(aux, { name, icon, tint: "teal", index, onClick });
      });
    }
    function openContinue(view, item) {
      if (item.kind === "review") {
        view.reviewSession = rehydrateRound(view, {
          queue: item.event.queue || [],
          index: item.event.index || 0,
          revealed: false,
          skipped: [],
          done: false
        });
        view.push({ type: "review", mode: "round", title: "复习" });
        return;
      }
      if (item.kind === "read" && item.path) {
        view.push({ type: "reader", path: item.path, title: item.title });
        return;
      }
      if (item.path) view.openDraft({ path: item.path, draftId: item.draftId, kind: "writing" });
    }
    function renderLibrary(view, root) {
      header(view, root, "阅读");
      const shelves = readingShelves(view.plugin.activityEvents || [], view.plugin.listLibraryArticlePaths());
      const query = root.createEl("input", {
        cls: "meinc-home-name-input",
        attr: { type: "search", placeholder: "搜索" }
      });
      const host = root.createDiv();
      const draw = () => {
        host.empty();
        const q = query.value.trim();
        const match = (path) => !q || path.toLowerCase().includes(q.toLowerCase());
        section(view, host, "正在读", shelves.reading.filter((item) => match(item.path)).map((item) => item.path));
        section(view, host, "稍后读", shelves.later.filter(match));
        const categories = new Set(shelves.all.map((path) => path.split("/")[1]).filter(Boolean));
        if (categories.size) {
          const chips = host.createDiv({ cls: "meinc-home-compose-to" });
          for (const name of categories) {
            chips.createEl("button", { cls: "meinc-home-chip", text: name, attr: { type: "button" } }).onclick = () => {
              query.value = name;
              draw();
            };
          }
        }
        section(view, host, "全部材料", shelves.all.filter(match));
      };
      query.addEventListener("input", draw);
      draw();
    }
    function section(view, host, title, paths) {
      if (!paths.length) return;
      host.createDiv({ cls: "meinc-home-kicker", text: title });
      const group = host.createDiv({ cls: "meinc-home-group" });
      paths.slice(0, 40).forEach((path, index) => {
        const name = path.split("/").pop().replace(/\.md$/, "");
        view.addRow(group, {
          name,
          meta: path.split("/")[1] || "",
          icon: "file-text",
          tint: "purple",
          index,
          onClick: () => view.push({ type: "reader", path, title: name })
        });
      });
    }
    function renderReader(view, root) {
      const screen = view.current();
      header(view, root, screen.title || "阅读");
      const page = root.createDiv({ cls: "meinc-reader" });
      const tools = page.createDiv({ cls: "meinc-reader-tools" });
      tools.createEl("button", { text: "目录", attr: { type: "button" } });
      const status = page.createDiv({ cls: "meinc-reader-status", text: "正在打开" });
      void loadReader(view, page, status, tools);
    }
    async function loadReader(view, page, status, tools) {
      const screen = view.current();
      const text = await readText(view.plugin, screen.path);
      if (view.current().path !== screen.path) return;
      if (text == null) {
        status.setText("没有找到这篇");
        return;
      }
      if (/\.(pdf|epub)$/i.test(screen.path)) {
        const file = view.app.vault.getAbstractFileByPath(screen.path);
        if (file instanceof TFile2) await view.plugin.openFile(file);
        return;
      }
      status.remove();
      const parts = splitFrontmatter(text);
      view.readerState = {
        path: screen.path,
        title: screen.title || screen.path,
        markdown: text,
        progress: 0
      };
      if (parts.meta) {
        const meta = page.createEl("details", { cls: "meinc-reader-meta" });
        meta.createEl("summary", { text: "来源" });
        meta.createEl("pre", { text: parts.meta });
      }
      const body = page.createDiv({ cls: "meinc-reader-page" });
      await MarkdownRenderer.render(view.app, parts.body, body, screen.path, view);
      const saved = (view.plugin.activityEvents || []).find(
        (event) => event.id === `read:${screen.path}`
      );
      const scroller = page.closest(".meinc-home-scroll");
      if (scroller && saved && Number.isFinite(saved.progress)) {
        requestAnimationFrame(() => {
          scroller.scrollTop = saved.progress * scroller.scrollHeight;
        });
      }
      const bar = page.createDiv({ cls: "meinc-reader-selection" });
      bar.hidden = true;
      const remember = () => {
        const ratio = scroller && scroller.scrollHeight ? scroller.scrollTop / scroller.scrollHeight : 0;
        view.readerState.progress = ratio;
        view.plugin.scheduleActivity({
          id: `read:${screen.path}`,
          type: "read",
          path: screen.path,
          title: view.readerState.title,
          progress: ratio
        });
      };
      if (view._readerScroll && scroller) {
        scroller.removeEventListener("scroll", view._readerScroll);
      }
      view._readerScroll = remember;
      scroller?.addEventListener("scroll", view._readerScroll, { passive: true });
      body.addEventListener("pointerup", () => {
        const selected = String(window.getSelection?.() || "").trim();
        view.readerSelection = selected;
        bar.hidden = !selected;
        bar.empty();
        if (!selected) return;
        bar.createEl("button", { text: "写几句", attr: { type: "button" } }).onclick = () => {
          view.openDraft({
            kind: "output",
            seed: `> ${selected}

`
          });
        };
        bar.createEl("button", { text: "加入复习", attr: { type: "button" } }).onclick = () => {
          void view.plugin.addPassageToReview(screen.path, selected);
          new Notice2("已加入复习");
        };
        bar.createEl("button", { text: "问 Agent", attr: { type: "button" } }).onclick = () => {
          void askAgent(view.plugin, "请根据我正在读的这一篇和选中的段落回答。不要改文件。");
        };
      });
      tools.querySelector("button").onclick = () => {
        const headings = Array.from(body.querySelectorAll("h1, h2, h3"));
        if (!headings.length) {
          new Notice2("这篇没有目录");
          return;
        }
        headings[0].scrollIntoView({ block: "start" });
      };
      page.createEl("button", { text: "稍后读", attr: { type: "button" } }).onclick = () => {
        void view.plugin.appendActivity({
          id: `later:${screen.path}`,
          type: "later",
          path: screen.path,
          title: view.readerState.title
        });
        new Notice2("已放进稍后读");
      };
      const size = page.createDiv({ cls: "meinc-reader-tools" });
      size.createEl("button", { text: "字号", attr: { type: "button" } }).onclick = () => {
        const current = Number(body.dataset.size || 18);
        const next = current >= 22 ? 16 : current + 2;
        body.dataset.size = String(next);
        body.style.fontSize = `${next}px`;
      };
      size.createEl("button", { text: "行距", attr: { type: "button" } }).onclick = () => {
        body.style.lineHeight = body.style.lineHeight === "2" ? "1.75" : "2";
      };
      size.createEl("button", { text: "深色", attr: { type: "button" } }).onclick = () => {
        page.classList.toggle("is-reader-dark");
      };
      const clock = page.createEl("button", { text: "开始计时", attr: { type: "button" } });
      clock.onclick = () => {
        view.plugin.pendingTimeboxSource = screen.path;
        view.plugin.openTimeboxStart({ title: view.readerState.title });
      };
    }
    function renderEditor(view, root) {
      const state = view.editorState;
      header(view, root, state?.title || "写作", () => {
        void view.flushEditor().then(() => view.back());
      });
      if (!state) {
        root.createDiv({ cls: "meinc-home-empty", text: "正在打开" });
        return;
      }
      if (state.kind === "output") {
        const prompts = root.createEl("details", { cls: "meinc-editor-prompts" });
        prompts.createEl("summary", { text: "需要提示时再打开" });
        for (const prompt of OUTPUT_PROMPTS) {
          prompts.createEl("button", { text: prompt.label, attr: { type: "button" } }).onclick = () => {
            if (!state.body.includes(prompt.text)) {
              state.body = `${prompt.text}
${state.body}`;
              area.value = state.body;
              scheduleEditorSave(view);
            }
          };
        }
      }
      const area = root.createEl("textarea", {
        cls: "meinc-editor-area",
        attr: { placeholder: "直接写" }
      });
      area.value = state.body || "";
      const note = root.createDiv({ cls: "meinc-editor-status", text: state.saveError || "" });
      area.addEventListener("compositionstart", () => {
        state.composing = true;
      });
      area.addEventListener("compositionend", () => {
        state.composing = false;
        state.body = area.value;
        scheduleEditorSave(view);
      });
      area.addEventListener("input", () => {
        state.body = area.value;
        view.editorSelection = "";
        if (!state.composing) scheduleEditorSave(view);
      });
      area.addEventListener("select", () => {
        const start = area.selectionStart || 0;
        const end = area.selectionEnd || 0;
        view.editorSelection = area.value.slice(start, end);
      });
      const actions = root.createDiv({ cls: "meinc-home-empty-actions" });
      actions.createEl("button", { text: "整理归档", attr: { type: "button" } }).onclick = () => {
        void requestArchive(view, note);
      };
      actions.createEl("button", { text: "加入复习", attr: { type: "button" } }).onclick = () => {
        void view.plugin.addOutputToReview(state.body);
        new Notice2("已加入复习");
      };
      actions.createEl("button", { text: "开始计时", attr: { type: "button" } }).onclick = () => {
        view.plugin.pendingTimeboxSource = state.path || "";
        view.plugin.openTimeboxStart({ title: state.title || "写作" });
      };
      const card = root.createDiv({ cls: "meinc-archive-card" });
      view.archiveCardEl = card;
      if (state.pendingPath) void paintArchiveCard(view, card);
      view.editorArea = area;
      view.editorStatus = note;
    }
    function scheduleEditorSave(view) {
      clearTimeout(view._draftTimer);
      view._draftTimer = setTimeout(() => {
        void view.flushEditor();
      }, 600);
    }
    async function flushEditor(view) {
      const state = view.editorState;
      if (!state || state.composing) return;
      try {
        if (state.wrapped) {
          const decision = planDraftSave({
            id: state.draftId,
            kind: state.kind,
            deviceId: view.plugin.ensureTimeboxDeviceId(),
            baseHash: state.baseHash,
            localBody: state.body,
            diskMarkdown: state.path ? await readText(view.plugin, state.path) : null
          });
          if (decision.action === "unchanged") return;
          const path = decision.path || state.path;
          await writeText(view.plugin, path, decision.markdown);
          state.path = decision.action === "conflict" ? path : state.path || path;
          state.baseHash = decision.hash;
          if (decision.action === "conflict") {
            new Notice2("另一端也改过这篇，两份都留着");
          }
        } else {
          const disk = await readText(view.plugin, state.path);
          const decision = planTextSave({
            baseHash: state.baseHash,
            localBody: state.body,
            diskBody: disk,
            deviceId: view.plugin.ensureTimeboxDeviceId(),
            conflictTarget: `${state.path}.conflict-${view.plugin.ensureTimeboxDeviceId()}.md`
          });
          if (decision.action === "unchanged") return;
          if (decision.action === "conflict") {
            await writeText(view.plugin, decision.path, state.body);
            new Notice2("另一端也改过这篇，两份都留着");
          } else {
            await writeText(view.plugin, state.path, state.body);
            state.baseHash = decision.hash;
          }
        }
        state.saveError = "";
        if (view.editorStatus) view.editorStatus.setText("已保存");
        await view.plugin.appendActivity({
          id: `draft:${state.draftId || state.path}`,
          type: "draft",
          draftId: state.draftId || "",
          path: state.path,
          title: state.title || "草稿",
          kind: state.kind
        });
      } catch (_) {
        state.saveError = "没保存上";
        if (view.editorStatus) view.editorStatus.setText("没保存上，字还在这里");
        new Notice2("草稿没保存上，字还在编辑器里");
      }
    }
    async function requestArchive(view, note) {
      const state = view.editorState;
      if (!state) return;
      await view.flushEditor();
      const body = String(state.body || "").trim();
      if (!body) {
        note.setText("先写点什么再归档");
        new Notice2("正文是空的");
        return;
      }
      const hash = contentHash(state.body || "");
      note.setText("正在看这篇…");
      if (view.archiveCardEl) {
        view.archiveCardEl.empty();
        view.archiveCardEl.createDiv({ text: "正在看这篇…" });
      }
      const cfg = archiveLlmConfigFromApp(view.plugin.app);
      if (!cfg.baseUrl || !cfg.apiKey) {
        note.setText("记忆模型还没配好");
        new Notice2("记忆模型还没配好");
        if (view.archiveCardEl) {
          view.archiveCardEl.empty();
          view.archiveCardEl.createDiv({ text: "在 Agent OS 设置里配好 Embed 或记忆模型 API" });
        }
        return;
      }
      const folderHints = collectArchiveFolderHints(view.plugin.app);
      const result = await callArchiveLlm({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model: cfg.model,
        body: state.body,
        folderHints
      });
      if (result.skipped || !result.ok) {
        const msg = result.skipped ? "记忆模型还没配好" : "没能出归档建议";
        note.setText(msg);
        new Notice2(result.error ? `${msg}：${result.error}` : msg);
        if (view.archiveCardEl) {
          view.archiveCardEl.empty();
          view.archiveCardEl.createDiv({ text: result.error || msg });
        }
        state.pendingPath = "";
        return;
      }
      const { title } = result.suggestion;
      let path = result.suggestion.path;
      path = await resolveArchivePath(path, state.body, (p) => readText(view.plugin, p));
      const pendingPath = `agent-inbox/pending/${dayKeyFromTime(Date.now())}-note-archive-${state.draftId || "note"}.md`;
      await writeText(
        view.plugin,
        pendingPath,
        renderArchivePending({
          draftPath: state.path,
          draftId: state.draftId,
          hash,
          proposedTitle: title,
          proposedPath: path
        })
      );
      state.pendingPath = pendingPath;
      state.pendingHash = hash;
      note.setText("看一下标题和位置，确认后归档");
      if (view.archiveCardEl) await paintArchiveCard(view, view.archiveCardEl);
    }
    async function paintArchiveCard(view, card) {
      const state = view.editorState;
      card.empty();
      if (!state?.pendingPath) return;
      const pending = parseArchivePending(await readText(view.plugin, state.pendingPath) || "");
      card.createDiv({ text: pending.title && pending.path ? `${pending.title} → ${pending.path}` : "还在等归档建议" });
      const button = card.createEl("button", { text: "确认归档", attr: { type: "button" } });
      button.disabled = !pending.path;
      button.onclick = () => void applyArchive(view, pending);
    }
    async function applyArchive(view, pending) {
      const state = view.editorState;
      const target = pending.path;
      if (!allowedTarget(target)) {
        new Notice2("位置需要落在手记、项目库或基础学科");
        return;
      }
      const disk = state.path ? await readText(view.plugin, state.path) : state.body;
      const parsed = state.wrapped ? parseDraft(disk || "") : { body: disk || state.body };
      const existing = await readText(view.plugin, target);
      const decision = decideArchive({
        draftBody: parsed.body,
        confirmedHash: pending.hash,
        targetExists: existing != null,
        targetBody: existing
      });
      if (decision.action === "stale") {
        new Notice2("正文已经变了，需要重新看一遍建议");
        return;
      }
      if (decision.action === "conflict") {
        new Notice2("那个位置已经有不同的内容，没有覆盖");
        return;
      }
      if (decision.action === "write") await writeText(view.plugin, target, decision.body);
      await view.plugin.appendActivity({
        id: `draft:${state.draftId || state.path}`,
        type: "draft",
        draftId: state.draftId || "",
        path: state.path,
        done: true
      });
      new Notice2(decision.action === "noop" ? "已经在那里了" : "已归档");
    }
    function renderWriting(view, root) {
      header(view, root, "写作");
      const actions = root.createDiv({ cls: "meinc-home-empty-actions" });
      actions.createEl("button", { text: "新的一篇", attr: { type: "button" } }).onclick = () => view.openDraft({ kind: "writing" });
      actions.createEl("button", { text: "今日日记", attr: { type: "button" } }).onclick = () => view.plugin.openToday();
      const folder = view.app.vault.getAbstractFileByPath("手记");
      const group = root.createDiv({ cls: "meinc-home-group" });
      const files = [];
      const walk = (node) => {
        if (!(node instanceof TFolder2)) return;
        for (const child of node.children) {
          if (child instanceof TFolder2) walk(child);
          else if (child instanceof TFile2 && child.extension === "md") files.push(child);
        }
      };
      walk(folder);
      files.sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 30).forEach((file, index) => {
        view.addRow(group, {
          name: file.basename,
          meta: file.parent?.name || "",
          icon: "pencil",
          tint: "orange",
          index,
          onClick: () => view.openDraft({ path: file.path, kind: "writing", existing: true })
        });
      });
    }
    function renderRound(view, root) {
      header(view, root, "复习");
      const session = view.reviewSession;
      if (!session || session.done || !session.queue.length) {
        const empty = root.createDiv({ cls: "meinc-home-empty" });
        empty.createDiv({ text: session && session.done ? "这一组做完了" : "现在没有待复习" });
        const actions = empty.createDiv({ cls: "meinc-home-empty-actions" });
        actions.createEl("button", { text: "再来一组", attr: { type: "button" } }).onclick = () => view.startStudyRound({ fresh: true });
        actions.createEl("button", { text: "先停", attr: { type: "button" } }).onclick = () => view.resetToHome();
        return;
      }
      const card = session.queue[session.index];
      root.createDiv({
        cls: "meinc-home-review-progress",
        text: `${Math.min(session.index + 1, session.queue.length)} / ${session.queue.length}`
      });
      const stage = root.createDiv({ cls: "meinc-home-review-stage" });
      const face = stage.createDiv({ cls: "meinc-home-review-card" });
      if (card.type === "word" || card.type === "sentence") {
        const entry = card.card || {};
        face.createDiv({
          cls: "meinc-home-review-main",
          text: card.type === "word" ? entry.word || "" : entry.text || ""
        });
        if (!session.revealed) {
          face.createDiv({ cls: "meinc-home-review-hint", text: "点一下看背面" });
          face.onclick = () => {
            session.revealed = true;
            view.render();
          };
        } else if (card.type === "word") {
          face.createDiv({
            cls: "meinc-home-review-body",
            text: (entry.definitions || []).join("；") || entry.note || "暂无释义"
          });
        } else {
          face.createDiv({
            cls: "meinc-home-review-body",
            text: entry.translation || entry.note || "暂无译文"
          });
        }
      } else {
        face.createDiv({ cls: "meinc-home-review-kicker", text: "回想" });
        face.createDiv({ cls: "meinc-home-review-main", text: prosePrompt(card) });
        const source = face.createEl("details");
        source.createEl("summary", { text: "原文" });
        source.createDiv({ text: card.excerpt || card.title || card.path || "" });
        const box = face.createEl("textarea", {
          cls: "meinc-editor-area",
          attr: { placeholder: "可以写几句，也可以只在心里答" }
        });
        box.value = session.note || "";
        box.addEventListener("input", () => {
          session.note = box.value;
        });
        face.createEl("button", { text: "生成复习问题", attr: { type: "button" } }).onclick = () => {
          void requestReviewQuestion(view, card);
        };
      }
      const grades = root.createDiv({ cls: "meinc-home-review-grades" });
      for (const item of [
        ["again", "不会"],
        ["hard", "模糊"],
        ["good", "会了"]
      ]) {
        grades.createEl("button", {
          cls: `meinc-home-review-grade is-${item[0]}`,
          text: item[1],
          attr: { type: "button" }
        }).onclick = () => void gradeCurrent(view, item[0]);
      }
      grades.createEl("button", { text: "跳过", attr: { type: "button" } }).onclick = () => {
        view.reviewSession = skipRound(session);
        void persistRound(view);
        view.render();
      };
    }
    async function gradeCurrent(view, rating) {
      const session = view.reviewSession;
      const card = session.queue[session.index];
      if (!card) return;
      if (card.type === "word" || card.type === "sentence") {
        const lexideck = view.app.plugins?.plugins?.lexideck;
        if (!lexideck || typeof lexideck.gradeEntry !== "function") {
          new Notice2("LexiDeck 未就绪");
          return;
        }
        const ok = await lexideck.gradeEntry(card.kind, card.id, rating);
        if (!ok) {
          new Notice2("评分失败");
          return;
        }
      } else if (card.path) {
        await view.plugin.gradeReviewProse(card.path, rating);
      }
      await view.plugin.appendActivity({
        id: `review-grade:${Date.now()}`,
        type: "review-grade",
        path: card.path || "",
        title: card.title || ""
      });
      const graded = gradeRound(session, rating);
      view.reviewSession = graded.round;
      await persistRound(view);
      view.render();
    }
    async function persistRound(view) {
      const session = view.reviewSession;
      if (!session) return;
      await view.plugin.appendActivity({
        id: "review:current",
        type: "review",
        index: session.index || 0,
        done: !!session.done,
        queue: (session.queue || []).map((card) => ({
          type: card.type,
          id: card.id,
          kind: card.kind,
          path: card.path,
          title: card.title,
          prompt: card.prompt,
          excerpt: card.excerpt,
          source: card.source
        }))
      });
    }
    function rehydrateRound(view, session) {
      const lexideck = view.app.plugins?.plugins?.lexideck;
      for (const card of session.queue || []) {
        if (card.card || card.type !== "word" && card.type !== "sentence" || !lexideck) continue;
        const list = card.type === "word" ? lexideck.getWords?.() : lexideck.getSentences?.();
        card.card = (list || []).find((item) => item.id === card.id) || {};
      }
      return session;
    }
    async function startStudyRound(view, opts = {}) {
      const saved = (view.plugin.activityEvents || []).filter((event) => event.type === "review").pop();
      if (!opts.fresh && saved && !saved.done && Array.isArray(saved.queue) && saved.index < saved.queue.length) {
        view.reviewSession = rehydrateRound(view, {
          queue: saved.queue,
          index: saved.index || 0,
          revealed: false,
          skipped: [],
          done: false
        });
      } else {
        await view.plugin.ensureReviewLedgerReady();
        const now = Date.now();
        const lexideck = view.app.plugins?.plugins?.lexideck;
        const prose = listDueProseEntries2(view.plugin.reviewLedger, now).map((item) => ({
          type: "prose",
          path: item.path,
          title: item.title || item.path,
          prompt: item.prompt,
          excerpt: item.excerpt,
          kind: item.kind
        }));
        view.reviewSession = freshRound(buildLexiQueueItems2(lexideck, now).concat(prose));
        await persistRound(view);
      }
      if (view.current().type === "review" && view.current().mode === "round") view.render();
      else view.push({ type: "review", mode: "round", title: "复习" });
    }
    async function requestReviewQuestion(view, card) {
      const excerpt = card.excerpt || card.title || "";
      const path = `agent-inbox/pending/${dayKeyFromTime(Date.now())}-review-${contentHash(excerpt).slice(0, 8)}.md`;
      await writeText(
        view.plugin,
        path,
        ["---", "status: pending", "type: review-question", `source_paths: ${JSON.stringify([card.path || ""])}`, "---", "", "原文依据：", "", excerpt, "", "### 问题", ""].join("\n")
      );
      const sent = await askAgent(view.plugin, `请只根据下面的原文出一道回想题，并把题目写进 ${path} 的「问题」下面。不要脱离原文。

${excerpt}`);
      new Notice2(sent ? "题目会留在待确认里" : "Agent 还没接上，原文依据已经留下");
    }
    function renderProjects(view, root) {
      header(view, root, "项目");
      if (!view.projectRows) {
        root.createDiv({ cls: "meinc-home-empty", text: "正在打开" });
        void loadProjects(view);
        return;
      }
      const group = root.createDiv({ cls: "meinc-home-group" });
      view.projectRows.forEach((row, index) => {
        const block = root.createDiv({ cls: "meinc-project-card" });
        block.createDiv({ cls: "meinc-home-title", text: row.name });
        block.createDiv({
          cls: "meinc-home-kicker",
          text: row.next ? `下一步：${row.next}` : "还没有下一步"
        });
        if (row.workPath) {
          block.createEl("button", { text: "打开当前稿件", attr: { type: "button" } }).onclick = () => {
            view.plugin.pendingTimeboxSource = row.workPath;
            view.push({ type: "reader", path: row.workPath, title: row.name });
          };
        }
        if (!row.next) {
          const input = block.createEl("input", {
            cls: "meinc-home-name-input",
            attr: { type: "text", placeholder: "写一句下一步" }
          });
          block.createEl("button", { text: "记下", attr: { type: "button" } }).onclick = () => {
            void saveProjectNext(view, row, input.value);
          };
        }
        block.createEl("button", { text: "帮我找下一步", attr: { type: "button" } }).onclick = () => {
          void askAgent(
            view.plugin,
            `请根据项目「${row.name}」里已经写下的材料，只建议一句下一步。不要改文件，除非我确认。`
          );
        };
        if (row.files.length) {
          const details = block.createEl("details");
          details.createEl("summary", { text: "资料" });
          row.files.slice(0, 8).forEach((path) => {
            details.createEl("div", { text: path.split("/").pop() });
          });
        }
        group.appendChild(block);
        void index;
      });
    }
    async function loadProjects(view) {
      const root = view.app.vault.getAbstractFileByPath("项目库");
      const rows = [];
      if (root instanceof TFolder2) {
        for (const child of root.children) {
          if (!(child instanceof TFolder2) || child.name.startsWith("_") || child.name.startsWith(".")) continue;
          const files = [];
          const walk = (folder) => {
            for (const item of folder.children) {
              if (item instanceof TFolder2) walk(item);
              else if (item instanceof TFile2 && item.extension === "md") files.push(item.path);
            }
          };
          walk(child);
          let next = "";
          const nextFile = files.find((path) => path.endsWith("/下一步.md"));
          if (nextFile) next = latestNextLine(await readText(view.plugin, nextFile) || "");
          if (!next) {
            for (const path of files) {
              if (path.endsWith("/下一步.md")) continue;
              next = extractNextStep(await readText(view.plugin, path) || "");
              if (next) break;
            }
          }
          rows.push({
            name: child.name,
            folder: child.path,
            next,
            workPath: pickWorkPath(files),
            files
          });
        }
      }
      view.projectRows = rows;
      if (view.current().type === "projects") view.render();
    }
    async function saveProjectNext(view, row, sentence) {
      const text = String(sentence || "").trim();
      if (!text) return;
      const path = `${projectFolderFromPath(row.folder + "/x")}/下一步.md`;
      const current = await readText(view.plugin, path) || "";
      await writeText(view.plugin, path, appendNextStep(current, text, dayKeyFromTime(Date.now())));
      row.next = text;
      new Notice2("已记下下一步");
      view.render();
    }
    function renderTimeboxHistory(view, root) {
      header(view, root, "时间记录");
      const state = view.historyState || {
        mode: "week",
        anchor: Date.now(),
        from: Date.now(),
        to: Date.now()
      };
      view.historyState = state;
      const modes = root.createDiv({ cls: "meinc-home-empty-actions" });
      for (const mode of [
        ["week", "周"],
        ["month", "月"],
        ["year", "年"],
        ["custom", "自选"]
      ]) {
        modes.createEl("button", { text: mode[1], attr: { type: "button" } }).onclick = () => {
          state.mode = mode[0];
          state.detailKey = "";
          view.render();
        };
      }
      const nav = root.createDiv({ cls: "meinc-home-empty-actions" });
      nav.createEl("button", { text: "上一页", attr: { type: "button" } }).onclick = () => shiftHistory(view, -1);
      nav.createEl("button", { text: "下一页", attr: { type: "button" } }).onclick = () => shiftHistory(view, 1);
      const range = resolveHistoryRange(state);
      const history = buildHistoryBars(view.plugin.timeboxSessions || [], { ...range, mode: state.mode });
      root.createDiv({ cls: "meinc-home-kicker", text: history.label });
      const chart = root.createDiv({ cls: "meinc-history-chart" });
      history.bars.forEach((bar) => {
        const col = chart.createEl("button", {
          cls: "meinc-history-col",
          attr: { type: "button", "aria-label": `${bar.label} ${bar.durationLabel}` }
        });
        const track = col.createDiv({ cls: "meinc-history-track" });
        if (bar.fillRatio > 0) {
          track.createDiv({
            cls: "meinc-history-fill",
            attr: { style: `height:${Math.round(bar.fillRatio * 100)}%` }
          });
        }
        col.createDiv({ cls: "meinc-history-label", text: bar.label });
        col.createDiv({ cls: "meinc-history-duration", text: bar.durationLabel });
        col.onclick = () => {
          state.detailKey = bar.grain === "month" ? "" : bar.key;
          state.detailMonth = bar.grain === "month" ? bar.key : "";
          view.render();
        };
      });
      if (state.detailKey) {
        const details = daySessionDetails(view.plugin.timeboxSessions || [], state.detailKey);
        root.createDiv({ cls: "meinc-home-kicker", text: state.detailKey });
        if (!details.length) root.createDiv({ text: "这一天没有记录" });
        for (const item of details) {
          root.createDiv({
            text: `${item.title} · ${item.minutes} 分 · ${item.outcome === "abandoned" ? "中止" : item.outcome === "early" ? "提前结束" : "完成"}`
          });
        }
      }
    }
    function shiftHistory(view, direction) {
      const state = view.historyState;
      if (state.mode === "custom") {
        const next = shiftCustomRange(state.from, state.to, direction);
        state.from = next.from;
        state.to = next.to;
        state.anchor = next.from;
      } else {
        state.anchor = shiftHistoryAnchor(state.mode, state.anchor, direction);
      }
      view.render();
    }
    function renderCompoundPage(view, root) {
      const editor = view.compoundEditor;
      header(view, root, "复利");
      if (!editor) {
        root.createDiv({ cls: "meinc-home-empty", text: "正在打开" });
        return;
      }
      if (editor.yesterday) {
        const box = root.createDiv({ cls: "meinc-home-compound-yesterday" });
        box.createDiv({ cls: "meinc-home-compound-yesterday-kicker", text: "昨天要改的" });
        box.createDiv({ text: editor.yesterday });
      }
      const records = formatDayRecords(
        recordsForDay(
          view.plugin.activityEvents || [],
          (view.plugin.timeboxSessions || []).flatMap(
            (session) => sessionMinuteParts(session).map((part) => ({
              dayKey: part.dayKey,
              title: session.title,
              minutes: part.minutes
            }))
          ),
          editor.dayKey
        )
      );
      const list = root.createDiv({ cls: "meinc-compound-activity" });
      list.createDiv({ cls: "meinc-home-kicker", text: "今天留下了什么" });
      if (!records.length) list.createDiv({ text: "今天还没有阅读、写作、复习或专注记录" });
      for (const line of records) list.createDiv({ text: line });
      const note = COMPOUND_FIELDS2.find((field) => field.key === "note");
      const wrap = root.createDiv({ cls: "meinc-home-compound-field" });
      wrap.createDiv({ cls: "meinc-home-compound-label", text: note.title });
      const area = wrap.createEl("textarea", { cls: "meinc-home-compound-input" });
      area.value = editor.draft.note || "";
      area.addEventListener("input", () => {
        editor.draft.note = area.value;
      });
      const save = root.createEl("button", { text: "记下", attr: { type: "button" } });
      save.onclick = () => void view.saveCompoundEditor();
      root.createEl("button", { text: "打开本周笔记", attr: { type: "button" } }).onclick = () => view.openCompoundNote();
      root.createEl("button", { text: "带回首页", attr: { type: "button" } }).onclick = async () => {
        await view.saveCompoundEditor({ quiet: true });
        const recent = continueItems(view.plugin.activityEvents || [], 1)[0];
        await view.plugin.appendActivity({
          id: `next:${editor.dayKey}`,
          type: "next",
          text: editor.draft.note || "明天从首页继续",
          targetPath: recent?.path || ""
        });
        new Notice2("首页可以接着打开");
      };
      const more = root.createEl("details");
      more.createEl("summary", { text: "原来的三问" });
      for (const field of COMPOUND_FIELDS2.filter((item) => item.key !== "note")) {
        more.createDiv({ text: field.title });
        const input = more.createEl("textarea", { cls: "meinc-home-compound-input" });
        input.value = editor.draft[field.key] || "";
        input.addEventListener("input", () => {
          editor.draft[field.key] = input.value;
        });
      }
    }
    async function askAgent(plugin, prompt) {
      const agent = plugin.app.plugins?.plugins?.["obsidian-agent-os"];
      const send = agent?.chatController?.send;
      if (typeof send !== "function") {
        new Notice2("Agent 还不可用");
        return false;
      }
      const leaf = plugin.app.workspace.getLeavesOfType("meinc-home")[0];
      const ctx = leaf?.view?.getAgentContext?.() || null;
      const body = String(ctx?.body || "");
      const snap = ctx ? {
        attached: true,
        path: ctx.path || "",
        title: ctx.title || "",
        selection: ctx.selection || "",
        hasSelection: !!String(ctx.selection || "").trim(),
        cursor: { line: 0, ch: 0 },
        contentVersion: ctx.version || "",
        noteExcerpt: body.slice(0, 8e3),
        truncated: body.length > 8e3,
        capturedAt: Date.now()
      } : null;
      try {
        const result = await send.call(agent.chatController, prompt, {
          surface: "companion",
          contextSnapshot: snap
        });
        agent.companion?.open?.({ forceOpen: true });
        if (result && result.ok === false) {
          new Notice2("没能发给 Agent");
          return false;
        }
        return true;
      } catch (_) {
        new Notice2("没能发给 Agent");
        return false;
      }
    }
    function agentContext(view) {
      const screen = view.current();
      if (screen.type === "editor" && view.editorState) {
        const body = String(view.editorState.body || "");
        return {
          path: view.editorState.path || "",
          title: view.editorState.title || "草稿",
          body,
          selection: view.editorSelection || "",
          version: contentHash(body)
        };
      }
      if (screen.type === "reader" && view.readerState) {
        const body = String(view.readerState.markdown || "");
        return {
          path: view.readerState.path,
          title: view.readerState.title || "",
          body,
          selection: view.readerSelection || "",
          version: contentHash(body)
        };
      }
      return null;
    }
    function install(HomeView2, PluginClass) {
      const plugin = PluginClass.prototype;
      plugin.loadActivityLog = async function loadActivityLog() {
        const folder = this.app.vault.getAbstractFileByPath(ACTIVITY_DIR);
        const lists = [];
        if (folder instanceof TFolder2) {
          for (const child of folder.children) {
            if (!(child instanceof TFile2)) continue;
            if (!child.name.startsWith("activity-") || !child.name.endsWith(".jsonl")) continue;
            try {
              lists.push(parseActivityJsonl(await this.app.vault.read(child)));
            } catch (_) {
            }
          }
        }
        this.activityEvents = mergeEvents(...lists);
      };
      plugin.appendActivity = async function appendActivity(event) {
        const deviceId = this.ensureTimeboxDeviceId();
        const full = {
          ...event,
          id: event.id || `${event.type}-${Date.now()}`,
          at: event.at || Date.now(),
          deviceId
        };
        this.activityEvents = mergeEvents(this.activityEvents || [], [full]);
        const mine = this.activityEvents.filter((item) => item.deviceId === deviceId);
        await writeText(this, `${ACTIVITY_DIR}/activity-${deviceId}.jsonl`, `${serializeActivityJsonl(mine)}
`);
      };
      plugin.scheduleActivity = function scheduleActivity(event) {
        this._pendingActivity = event;
        clearTimeout(this._activityTimer);
        this._activityTimer = setTimeout(() => {
          const item = this._pendingActivity;
          this._pendingActivity = null;
          if (item) void this.appendActivity(item);
        }, 800);
      };
      plugin.addPassageToReview = async function addPassageToReview(path, excerpt) {
        await this.ensureReviewLedgerReady();
        const key = `${path}#${contentHash(excerpt).slice(0, 8)}`;
        this.reviewLedger.entries[key] = {
          ...ledgerEntryForPassage(excerpt),
          title: path.split("/").pop()
        };
        await this.saveReviewLedger();
        await this.appendActivity({
          id: `highlight:${key}`,
          type: "highlight",
          path,
          excerpt
        });
      };
      plugin.addOutputToReview = async function addOutputToReview(excerpt) {
        await this.ensureReviewLedgerReady();
        const key = `output#${contentHash(excerpt).slice(0, 8)}`;
        this.reviewLedger.entries[key] = ledgerEntryForOutput(excerpt);
        await this.saveReviewLedger();
      };
      const origOnload = plugin.onload;
      plugin.onload = async function onload() {
        await origOnload.call(this);
        try {
          await this.loadActivityLog();
        } catch (err) {
          console.error(err);
          this.activityEvents = [];
        }
        this.registerDomEvent(document, "visibilitychange", () => {
          if (document.visibilityState === "hidden") void this.flushOpenEditors();
        });
        this.registerDomEvent(window, "pagehide", () => {
          void this.flushOpenEditors();
        });
        this.registerEvent(
          this.app.workspace.on("active-leaf-change", () => {
            void this.flushOpenEditors();
          })
        );
      };
      plugin.flushOpenEditors = async function flushOpenEditors() {
        for (const leaf of this.app.workspace.getLeavesOfType("meinc-home")) {
          if (leaf.view?.flushEditor) await leaf.view.flushEditor();
        }
      };
      const view = HomeView2.prototype;
      view.renderActivityHome = function renderHome(root) {
        renderActivityHome(this, root);
      };
      view.renderHome = function renderHome(root) {
        this.renderActivityHome(root);
      };
      view.renderLibrary = function renderLibraryScreen(root) {
        renderLibrary(this, root);
      };
      view.renderReader = function renderReaderScreen(root) {
        renderReader(this, root);
      };
      view.renderEditor = function renderEditorScreen(root) {
        renderEditor(this, root);
      };
      view.renderWritingList = function renderWritingScreen(root) {
        renderWriting(this, root);
      };
      view.renderProjects = function renderProjectScreen(root) {
        renderProjects(this, root);
      };
      view.renderTimeboxHistory = function renderHistoryScreen(root) {
        renderTimeboxHistory(this, root);
      };
      view.openLibrary = function openLibrary() {
        this.push({ type: "library", title: "阅读" });
      };
      view.openWriting = function openWriting() {
        this.push({ type: "writing-list", title: "写作" });
      };
      view.openProjects = function openProjects() {
        this.projectRows = null;
        this.push({ type: "projects", title: "项目" });
      };
      view.openTimeboxHistory = function openTimeboxHistory() {
        this.historyState = { mode: "week", anchor: Date.now(), from: Date.now(), to: Date.now() };
        this.push({ type: "timebox-history", title: "时间记录" });
      };
      view.openDraft = async function openDraft(opts = {}) {
        const kind = opts.kind || "writing";
        if (opts.resume && !opts.path) {
          const latest = (this.plugin.activityEvents || []).filter((event) => event.type === "draft" && !event.done && event.kind === "output").pop();
          if (latest?.path) opts.path = latest.path;
        }
        if (opts.path && opts.existing) {
          const text = await readText(this.plugin, opts.path) || "";
          this.editorState = {
            path: opts.path,
            title: opts.path.split("/").pop().replace(/\.md$/, ""),
            body: text,
            baseHash: contentHash(text),
            kind,
            wrapped: false,
            draftId: opts.path
          };
        } else if (opts.path) {
          const raw = await readText(this.plugin, opts.path) || "";
          const parsed = parseDraft(raw);
          this.editorState = {
            path: opts.path,
            draftId: parsed.id || opts.draftId || opts.path,
            title: "草稿",
            body: parsed.wrapped ? parsed.body : raw,
            baseHash: parsed.baseHash || contentHash(parsed.wrapped ? parsed.body : raw),
            kind: parsed.kind || kind,
            wrapped: parsed.wrapped,
            seed: opts.seed || ""
          };
          if (opts.seed && !this.editorState.body.includes(opts.seed.trim())) {
            this.editorState.body = `${opts.seed}${this.editorState.body}`;
          }
        } else {
          const id = `d${Date.now().toString(36)}`;
          this.editorState = {
            path: `${DRAFT_DIR}/${id}.md`,
            draftId: id,
            title: kind === "output" ? "输出" : "草稿",
            body: opts.seed || "",
            baseHash: "",
            kind,
            wrapped: true
          };
        }
        this.editorSelection = "";
        this.push({ type: "editor", title: this.editorState.title, path: this.editorState.path });
      };
      view.flushEditor = function flush() {
        return flushEditor(this);
      };
      view.startStudyRound = function start(opts) {
        return startStudyRound(this, opts);
      };
      view.getAgentContext = function getAgentContext() {
        return agentContext(this);
      };
      const origReview = view.renderReview;
      view.renderReview = function renderReview(root) {
        if (this.current().mode === "round") return renderRound(this, root);
        return origReview.call(this, root);
      };
      const origCompound = view.renderCompound;
      view.renderCompound = function renderCompound(root) {
        if (!this.compoundEditor) {
          origCompound.call(this, root);
          return;
        }
        renderCompoundPage(this, root);
      };
      const origOpen = view.openReview;
      view.openReview = function openReview() {
        return this.startStudyRound();
      };
      view.refreshListing = function refreshListing() {
        const type = this.current().type;
        if (type === "editor" || type === "reader") return;
        this.render();
      };
      const origBack = view.back;
      view.back = function back() {
        if (this.current().type === "editor") {
          void this.flushEditor().then(() => origBack.call(this));
          return;
        }
        return origBack.call(this);
      };
      const origClose = view.onClose;
      view.onClose = async function onClose() {
        if (this.flushEditor) await this.flushEditor();
        return origClose.call(this);
      };
    }
    module2.exports = { install };
  }
});

// src/app.js
var {
  Plugin,
  ItemView,
  Modal,
  Notice,
  PluginSettingTab,
  Setting,
  TFolder,
  TFile,
  Platform,
  setIcon,
  requestUrl
} = require("obsidian");
var {
  TIMEBOX_ABANDON_MIN_MS,
  TimeboxEngine,
  clampDurationMs: clampTimeboxDurationMs,
  clampPresetMinutes: clampTimeboxPresetMinutes,
  createDefaultTimebox,
  formatFocusDuration,
  formatRemaining,
  formatTimeboxMinutes,
  formatTimeboxStatusBar,
  normalizeTimebox,
  mergeSessions: mergeTimeboxSessions,
  normalizeSession: normalizeTimeboxSession,
  parseTimeboxPresetMinutes,
  pruneSessions: pruneTimeboxSessions,
  summarizeTimeboxStats,
  timeboxProgressRatio,
  timeboxSessionId
} = require_timebox();
var {
  COMPOUND_DIR,
  COMPOUND_FIELD_MAX,
  COMPOUND_FIELDS,
  COMPOUND_TITLE,
  addCompoundDays,
  compoundDayEquals,
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
  summarizeCompoundDay,
  yesterdayCompoundChange
} = require_compound();
var {
  HONGLOU_PUSH_FOLDER,
  LIBRARY_EXCLUDE_DIRS,
  LIBRARY_ROOT,
  REVIEW_LEDGER_PATH,
  buildLexiQueueItems,
  isLibraryArticlePath,
  ledgerEntryForArticle,
  ledgerEntryForHonglouRead,
  libraryArticleCategory,
  normalizeLedgerEntry,
  listDueProseEntries,
  normalizeLedger,
  pickDueProse,
  proseDueAfterGrade,
  shouldHideSubjectChild,
  staggerHonglouBackfill
} = require_review_queue();
var VIEW_TYPE_HOME = "meinc-home";
var MAILBOX_NOTE = "agent-inbox/meinc-mailbox/INBOX.md";
var MAILBOX_THREADS = "agent-inbox/meinc-mailbox/threads";
var MAILBOX_ACK = "agent-inbox/meinc-mailbox/ACK.md";
var MAILBOX_INBOX_DONE = "agent-inbox/meinc-mailbox/inbox-done.json";
var MAILBOX_TITLE = "AI 信箱";
var MAILBOX_WAKE_DEBOUNCE_MS = 1500;
var WAKE_ON_READ_STREAMS = /* @__PURE__ */ new Set(["check-push"]);
var MAILBOX_RECIPIENTS = [
  "CEO",
  "Critic",
  "语文",
  "数理化",
  "首席信息官",
  "all"
];
var SUBJECTS = ["语文", "数学", "英语", "物理", "化学", "地理"];
var HOME_TILES = [
  { id: "agent", name: "Agent", icon: "sparkles", tint: "indigo", size: "wide" },
  { id: "review", name: "复习", icon: "rotate-cw", tint: "blue", size: "hero" },
  {
    id: "subjects",
    name: "学习/输出",
    path: "基础学科",
    icon: "graduation-cap",
    tint: "indigo",
    size: "hero"
  },
  { id: "inbox", name: "AI 信箱", icon: "inbox", tint: "teal", size: "wide" },
  { id: "folder", name: "手记", path: "手记", icon: "pencil", tint: "orange" },
  { id: "folder", name: "项目库", path: "项目库", icon: "folder", tint: "green" },
  { id: "today", name: "今日日记", icon: "calendar", tint: "red" },
  { id: "folder", name: "资料库", path: "资料库", icon: "archive", tint: "purple" }
];
var INBOX_STREAMS = [
  {
    id: "honglou",
    name: "红楼梦",
    folder: "基础学科/语文/红楼梦/每日推送",
    type: "read",
    tint: "orange",
    icon: "book-open"
  },
  {
    id: "check-push",
    name: "核验推送",
    folder: "项目库/高考工程/核验推送",
    type: "read",
    tint: "red",
    icon: "list-checks"
  },
  {
    id: "hotbrief",
    name: "热点早报",
    folder: "项目库/信息收集",
    type: "read",
    tint: "blue",
    icon: "newspaper",
    match: "每日热点早报"
  },
  {
    id: "grok-reply",
    name: "Grokbot 回信",
    folder: MAILBOX_THREADS,
    type: "read",
    tint: "indigo",
    icon: "mail",
    skipNames: ["README"]
  }
];
var SUBJECT_TINTS = ["orange", "blue", "green", "indigo", "teal", "yellow"];
var SKIP_NAMES = /* @__PURE__ */ new Set([".DS_Store"]);
var PINNED_BOTTOM = /* @__PURE__ */ new Set(["_模板"]);
var NOTE_EXT = /* @__PURE__ */ new Set(["md", "canvas"]);
var WRITE_ROOTS = ["基础学科", "手记", "项目库", "资料库"];
var INBOX_SEED_KEEP_UNREAD = 4;
var TIMEBOX_SESSIONS_DIR = "agent-inbox/meinc-timebox";
var TIMEBOX_SESSION_SAVE_DEBOUNCE_MS = 800;
var DEFAULT_SETTINGS = {
  openOnStart: true,
  inboxSeeded: false,
  inboxBackfillRecent: false,
  inboxDone: {},
  mailboxWebhookUrl: "",
  mailboxSenderKey: "",
  timeboxDefaultMin: 15,
  timeboxPresetsText: "5, 10, 15, 25, 45",
  timeboxRememberLastDuration: true,
  timeboxLastDurationMs: null,
  timeboxDailyGoal: 4,
  timeboxExtendStepMin: 5,
  timeboxStartSoundOn: true,
  timeboxEndSoundOn: true,
  timeboxSoundOn: true,
  timeboxDeviceId: "",
  timebox: createDefaultTimebox(15)
};
function applyMeincHomeTheme(el) {
  if (!el) return;
  el.style.setProperty("--home-text", "var(--text-normal, #1d1d1f)");
  el.style.setProperty("--home-muted", "var(--text-muted, var(--text-faint, #6e6e73))");
  el.style.setProperty("--home-surface", "var(--background-primary, #ffffff)");
  el.style.setProperty("--home-line", "var(--background-modifier-border, rgba(0, 0, 0, 0.08))");
  el.style.setProperty(
    "--home-track",
    "color-mix(in srgb, var(--home-muted) 18%, transparent)"
  );
}
function formatHomeDate(now = /* @__PURE__ */ new Date()) {
  const weeks = [
    "星期日",
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六"
  ];
  return {
    weekday: weeks[now.getDay()],
    date: `${now.getMonth() + 1} 月 ${now.getDate()} 日`
  };
}
function displayName(file) {
  if (file instanceof TFolder) return file.name;
  if (file instanceof TFile) return file.basename;
  return String(file?.name || "").replace(/\.(md|canvas)$/i, "");
}
function isHiddenName(name) {
  return !name || name.startsWith(".") || SKIP_NAMES.has(name);
}
function childCount(folder) {
  if (!(folder instanceof TFolder)) return 0;
  return folder.children.filter((c) => !isHiddenName(c.name)).length;
}
function descendantCount(folder) {
  if (!(folder instanceof TFolder)) return 0;
  let n = 0;
  for (const child of folder.children) {
    if (isHiddenName(child.name)) continue;
    n += 1;
    if (child instanceof TFolder) n += descendantCount(child);
  }
  return n;
}
function inboxDateFromFile(app, file) {
  const fromName = String(file?.basename || "").match(/^(\d{4}-\d{2}-\d{2})/);
  if (fromName) return fromName[1];
  const raw = app.metadataCache.getFileCache(file)?.frontmatter?.date;
  if (!raw) return "";
  const match = String(raw).match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : String(raw).slice(0, 10);
}
function inboxTitle(file, dateStr) {
  let name = file instanceof TFile ? file.basename : displayName(file);
  if (dateStr && name.startsWith(dateStr)) {
    name = name.slice(dateStr.length).replace(/^[-_\s]+/, "");
  }
  return name || displayName(file);
}
function formatInboxDate(dateStr) {
  const match = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateStr || "";
  return `${Number(match[2])}月${Number(match[3])}日`;
}
function inboxStreamAccepts(stream, file) {
  const name = String(file?.basename || "");
  if (stream.skipNames && stream.skipNames.includes(name)) return false;
  if (stream.match && !name.includes(stream.match)) return false;
  return true;
}
function inboxStreamForFile(file) {
  const path = String(file?.path || "");
  if (!path) return null;
  for (const stream of INBOX_STREAMS) {
    const folder = stream.folder;
    if (path !== folder && !path.startsWith(`${folder}/`)) continue;
    if (!inboxStreamAccepts(stream, file)) continue;
    return stream;
  }
  return null;
}
function formatInboxAckStamp(now = /* @__PURE__ */ new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(
    now.getSeconds()
  )}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
function formatInboxAckLine({ stream, path, now }) {
  const id = stream?.id || "unknown";
  return `- ${formatInboxAckStamp(now)} inbox_read ${id} ${path}`;
}
function formatMailboxStamp(now = /* @__PURE__ */ new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
function formatMailboxBlock({ to, body, notePath, now }) {
  const who = String(to || "CEO").replace(/^@/, "");
  const lines = [`---`, `### ${formatMailboxStamp(now)} @${who}`, body.trim()];
  const path = String(notePath || "").trim();
  if (path) lines.push(`相关笔记路径：${path}`);
  lines.push("---", "");
  return lines.join("\n");
}
function mailboxContentHash(text) {
  let h = 5381;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) + h ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}
function mailboxPreview(text) {
  return String(text || "").slice(-200);
}
function normalizeMailboxWebhookUrl(raw) {
  return String(raw || "").trim();
}
function normalizeMailboxSenderKey(raw) {
  return String(raw || "").trim().replace(/^Authorization:\s*/i, "").replace(/^Bearer\s+/i, "").trim();
}
function mailboxWebhookProblem(url, key) {
  const u = normalizeMailboxWebhookUrl(url);
  const k = normalizeMailboxSenderKey(key);
  if (!u || !k) return "先在设置里贴 Grokbot Webhook URL 和 key";
  if (/^grokbot:/i.test(u) || /target=webhook-url/i.test(u)) {
    return "这是 Grok Bot 跳转链接，不是 POST 地址。请复制 https://api2.cursor.sh/automations/webhook/…";
  }
  if (!/^https:\/\//i.test(u)) return "Webhook URL 必须是 https:// 开头";
  if (/^grokbot:/i.test(k) || /target=webhook-key/i.test(k)) {
    return "这是 key 的跳转链接。请复制 crsr_ 开头的 sender key";
  }
  return "";
}
function countMeta(n) {
  if (!n) return "";
  return `${n} 项`;
}
function sortByName(a, b) {
  return displayName(a).localeCompare(displayName(b), "zh-CN");
}
function cloneNav(nav) {
  return (nav || []).map((s) => Object.assign({}, s));
}
function isWritablePath(p) {
  if (!p) return false;
  return WRITE_ROOTS.some((root) => p === root || p.startsWith(root + "/"));
}
function sanitizeName(raw) {
  return String(raw || "").trim().replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ");
}
function uniquePath(app, folderPath, name, ext) {
  const base = ext ? `${folderPath}/${name}.${ext}` : `${folderPath}/${name}`;
  if (!app.vault.getAbstractFileByPath(base)) return base;
  let i = 2;
  while (app.vault.getAbstractFileByPath(
    ext ? `${folderPath}/${name} ${i}.${ext}` : `${folderPath}/${name} ${i}`
  )) {
    i++;
  }
  return ext ? `${folderPath}/${name} ${i}.${ext}` : `${folderPath}/${name} ${i}`;
}
function isSelfOrDescendant(fromPath, destPath) {
  return destPath === fromPath || destPath.startsWith(fromPath + "/");
}
var ReviewArticlePickerModal = class extends Modal {
  constructor(app, plugin, paths, onPick) {
    super(app);
    this.plugin = plugin;
    this.paths = paths;
    this.onPick = onPick;
  }
  onOpen() {
    this.modalEl.addClass("meinc-home-modal", "meinc-home-review-picker");
    applyMeincHomeTheme(this.modalEl);
    this.titleEl.setText("加入文章");
    const { contentEl } = this;
    const list = contentEl.createDiv({ cls: "meinc-home-group" });
    const max = 80;
    const shown = this.paths.slice(0, max);
    shown.forEach((path, index) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      const row = list.createDiv({
        cls: "meinc-home-row",
        attr: { role: "button", tabindex: "0" }
      });
      row.style.setProperty("--i", String(index));
      const body = row.createDiv({ cls: "meinc-home-row-body" });
      body.createDiv({
        cls: "meinc-home-row-name",
        text: file instanceof TFile ? displayName(file) : path
      });
      body.createDiv({
        cls: "meinc-home-row-meta",
        text: libraryArticleCategory(path)
      });
      row.onclick = () => {
        this.close();
        void this.onPick(path);
      };
    });
    if (this.paths.length > max) {
      contentEl.createDiv({
        cls: "meinc-home-empty-sub",
        text: `只显示前 ${max} 篇，可在资料库搜索后从笔记菜单加入`
      });
    }
  }
  onClose() {
    this.contentEl.empty();
  }
};
var NameModal = class extends Modal {
  constructor(app, opts) {
    super(app);
    this.opts = opts;
    this.value = opts.initial || "";
  }
  onOpen() {
    this.modalEl.addClass("meinc-home-modal");
    this.titleEl.setText(this.opts.title || "名称");
    const { contentEl } = this;
    const input = contentEl.createEl("input", {
      cls: "meinc-home-name-input",
      type: "text",
      attr: { placeholder: this.opts.placeholder || "" }
    });
    input.value = this.value;
    input.addEventListener("input", () => {
      this.value = input.value;
    });
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        this.submit();
      }
    });
    const actions = contentEl.createDiv({ cls: "meinc-home-modal-actions" });
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.onclick = () => this.close();
    const ok = actions.createEl("button", {
      cls: "mod-cta",
      text: this.opts.confirm || "创建"
    });
    ok.onclick = () => this.submit();
    if (!Platform.isMobile) setTimeout(() => input.focus(), 20);
  }
  submit() {
    const name = sanitizeName(this.value);
    if (!name) {
      new Notice("名称不能为空");
      return;
    }
    this.close();
    this.opts.onSubmit(name);
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ActionSheet = class extends Modal {
  constructor(app, title, actions) {
    super(app);
    this.sheetTitle = title;
    this.actions = actions;
  }
  onOpen() {
    this.modalEl.addClass("meinc-home-modal", "meinc-home-sheet");
    applyMeincHomeTheme(this.modalEl);
    this.titleEl.setText(this.sheetTitle || "");
    const { contentEl } = this;
    for (const action of this.actions) {
      const btn = contentEl.createEl("button", {
        cls: "meinc-home-sheet-btn" + (action.danger ? " is-danger" : ""),
        text: action.name
      });
      btn.onclick = async () => {
        this.close();
        await action.onClick();
      };
    }
    const cancel = contentEl.createEl("button", {
      cls: "meinc-home-sheet-cancel",
      text: "取消"
    });
    cancel.onclick = () => this.close();
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ConfirmModal = class extends Modal {
  constructor(app, opts) {
    super(app);
    this.opts = opts || {};
  }
  onOpen() {
    this.modalEl.addClass("meinc-home-modal");
    this.titleEl.setText(this.opts.title || "确认");
    const { contentEl } = this;
    if (this.opts.message) {
      contentEl.createEl("p", {
        cls: "meinc-home-confirm-msg",
        text: this.opts.message
      });
    }
    const actions = contentEl.createDiv({ cls: "meinc-home-modal-actions" });
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.onclick = () => this.close();
    const ok = actions.createEl("button", {
      cls: this.opts.danger ? "mod-warning" : "mod-cta",
      text: this.opts.confirmText || "确认"
    });
    ok.onclick = async () => {
      this.close();
      if (this.opts.onConfirm) await this.opts.onConfirm();
    };
  }
  onClose() {
    this.contentEl.empty();
  }
};
var MovePickerModal = class extends Modal {
  constructor(app, plugin, file) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.folderPath = file.parent?.path || "";
    if (!isWritablePath(this.folderPath)) this.folderPath = "";
  }
  onOpen() {
    this.modalEl.addClass("meinc-home-modal");
    this.render();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    this.titleEl.setText("移动到");
    const here = this.folderPath || "选择位置";
    contentEl.createDiv({
      cls: "meinc-home-move-here",
      text: here
    });
    const list = contentEl.createDiv({ cls: "meinc-home-group" });
    if (this.folderPath) {
      const up = list.createEl("button", { cls: "meinc-home-row", type: "button" });
      const ico = up.createDiv({ cls: "meinc-home-icon" });
      ico.style.background = "var(--home-gray)";
      setIcon(ico, "arrow-up");
      up.createDiv({ cls: "meinc-home-row-body" }).createDiv({
        cls: "meinc-home-row-name",
        text: "上一级"
      });
      up.onclick = () => {
        const parent = this.folderPath.split("/").slice(0, -1).join("/");
        this.folderPath = isWritablePath(parent) ? parent : "";
        this.render();
      };
    }
    const folders = this.listFolders();
    for (const folder of folders) {
      const blocked = this.file instanceof TFolder && isSelfOrDescendant(this.file.path, folder.path);
      const row = list.createEl("button", {
        cls: "meinc-home-row" + (blocked ? " is-muted" : ""),
        type: "button"
      });
      const well = row.createDiv({ cls: "meinc-home-icon" });
      well.style.background = "var(--home-blue)";
      setIcon(well, "folder");
      const body = row.createDiv({ cls: "meinc-home-row-body" });
      body.createDiv({ cls: "meinc-home-row-name", text: folder.name });
      const chev = row.createDiv({ cls: "meinc-home-chevron" });
      setIcon(chev, "chevron-right");
      row.onclick = () => {
        if (blocked) {
          new Notice("不能移进自己里面");
          return;
        }
        this.folderPath = folder.path;
        this.render();
      };
    }
    const actions = contentEl.createDiv({ cls: "meinc-home-modal-actions" });
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.onclick = () => this.close();
    const ok = actions.createEl("button", {
      cls: "mod-cta",
      text: "移到这里"
    });
    ok.disabled = !this.canDropHere();
    ok.onclick = () => this.confirm();
  }
  listFolders() {
    if (!this.folderPath) {
      return WRITE_ROOTS.map(
        (root) => this.app.vault.getAbstractFileByPath(root)
      ).filter((f) => f instanceof TFolder);
    }
    const folder = this.app.vault.getAbstractFileByPath(this.folderPath);
    if (!(folder instanceof TFolder)) return [];
    return folder.children.filter(
      (c) => c instanceof TFolder && !isHiddenName(c.name) && !PINNED_BOTTOM.has(c.name)
    ).sort(sortByName);
  }
  canDropHere() {
    if (!isWritablePath(this.folderPath)) return false;
    if (this.file.parent?.path === this.folderPath) return false;
    if (this.file instanceof TFolder && isSelfOrDescendant(this.file.path, this.folderPath)) {
      return false;
    }
    return true;
  }
  async confirm() {
    if (!this.canDropHere()) return;
    const dest = `${this.folderPath}/${this.file.name}`;
    if (this.app.vault.getAbstractFileByPath(dest)) {
      new Notice("那里已经有同名文件");
      return;
    }
    try {
      await this.app.fileManager.renameFile(this.file, dest);
      new Notice("已移动");
      this.close();
    } catch (err) {
      new Notice("移动失败");
    }
  }
  onClose() {
    this.contentEl.empty();
  }
};
function mountTimeboxStatsBar(parent, plugin) {
  const stats = plugin.getTimeboxStats();
  const bar = parent.createDiv({ cls: "meinc-timebox-stats" });
  const weekHead = bar.createDiv({ cls: "meinc-timebox-stats-week-head" });
  weekHead.createDiv({ cls: "meinc-timebox-stats-week-kicker", text: "本周" });
  weekHead.createDiv({
    cls: "meinc-timebox-stats-week-total",
    text: stats.weekFocusLabel
  });
  bar.createDiv({
    cls: "meinc-timebox-stats-week-range",
    text: stats.weekRangeLabel
  });
  const todayRow = bar.createDiv({ cls: "meinc-timebox-stats-today-row" });
  todayRow.createDiv({ cls: "meinc-timebox-stats-today-label", text: stats.todayLabel });
  if (stats.streakLabel) {
    todayRow.createDiv({
      cls: "meinc-timebox-stats-streak",
      text: stats.streakLabel
    });
  }
  const chart = bar.createDiv({ cls: "meinc-timebox-week-chart" });
  const maxMinutes = Math.max(1, ...stats.weekBars.map((item) => item.minutes));
  for (const item of stats.weekBars) {
    const col = chart.createDiv({
      cls: "meinc-timebox-week-col" + (item.isToday ? " is-today" : "") + (item.isFuture ? " is-future" : ""),
      attr: { "aria-label": item.ariaLabel }
    });
    col.createDiv({ cls: "meinc-timebox-week-weekday", text: item.weekday });
    const track = col.createDiv({ cls: "meinc-timebox-week-track" });
    if (item.minutes > 0 && !item.isFuture) {
      track.createDiv({
        cls: "meinc-timebox-week-fill",
        attr: {
          style: `height:${Math.round(item.minutes / maxMinutes * 100)}%`
        }
      });
    }
    col.createDiv({ cls: "meinc-timebox-week-date", text: item.dateLabel });
    if (item.shortLabel && !item.isFuture) {
      col.createDiv({ cls: "meinc-timebox-week-mini", text: item.shortLabel });
    }
  }
  if (stats.topTitles.length) {
    const top = bar.createDiv({ cls: "meinc-timebox-stats-top" });
    top.createDiv({ cls: "meinc-timebox-stats-top-kicker", text: "常做" });
    const maxTop = Math.max(1, stats.topTitles[0].minutes);
    for (const item of stats.topTitles) {
      const row = top.createDiv({ cls: "meinc-timebox-top-row" });
      row.createDiv({ cls: "meinc-timebox-top-title", text: item.title });
      const meter = row.createDiv({ cls: "meinc-timebox-top-meter" });
      meter.createDiv({
        cls: "meinc-timebox-top-fill",
        attr: {
          style: `width:${Math.round(item.minutes / maxTop * 100)}%`
        }
      });
      row.createDiv({
        cls: "meinc-timebox-top-duration",
        text: formatFocusDuration(item.minutes)
      });
    }
  }
  return bar;
}
function mountTimeboxDurationPicker(parent, plugin, initialMinutes, onChange) {
  const presets = plugin.getTimeboxPresetMinutes();
  let minutes = clampTimeboxPresetMinutes(initialMinutes);
  const row = parent.createDiv({ cls: "meinc-timebox-duration" });
  const presetRow = row.createDiv({ cls: "meinc-timebox-presets" });
  const presetButtons = presets.map((value) => {
    const btn = presetRow.createEl("button", {
      cls: "meinc-timebox-chip",
      text: `${value} 分`,
      attr: { type: "button" }
    });
    btn.onclick = () => {
      minutes = value;
      sync();
    };
    return { value, btn };
  });
  const stepper = row.createDiv({ cls: "meinc-timebox-stepper" });
  const minus = stepper.createEl("button", {
    cls: "meinc-timebox-step",
    text: "−",
    attr: { type: "button", "aria-label": "减少分钟" }
  });
  const valueEl = stepper.createDiv({ cls: "meinc-timebox-step-value" });
  const plus = stepper.createEl("button", {
    cls: "meinc-timebox-step",
    text: "+",
    attr: { type: "button", "aria-label": "增加分钟" }
  });
  const sync = () => {
    valueEl.setText(`${minutes} 分`);
    for (const item of presetButtons) {
      item.btn.classList.toggle("is-on", item.value === minutes);
    }
    onChange(minutes);
  };
  minus.onclick = () => {
    minutes = clampTimeboxPresetMinutes(minutes - 1);
    sync();
  };
  plus.onclick = () => {
    minutes = clampTimeboxPresetMinutes(minutes + 1);
    sync();
  };
  sync();
  return {
    getMinutes: () => minutes,
    setMinutes: (value) => {
      minutes = clampTimeboxPresetMinutes(value);
      sync();
    }
  };
}
var TimeboxStartModal = class extends Modal {
  constructor(app, plugin, opts = {}) {
    super(app);
    this.plugin = plugin;
    this.titleValue = String(opts.title || "").trim();
    this.initialMinutes = plugin.resolveTimeboxStartMinutes(opts.durationMs);
  }
  onOpen() {
    this.modalEl.addClass("meinc-home-modal", "meinc-timebox-modal");
    applyMeincHomeTheme(this.modalEl);
    this.titleEl.setText("Timebox");
    const { contentEl } = this;
    mountTimeboxStatsBar(contentEl, this.plugin);
    const history = contentEl.createEl("button", {
      cls: "meinc-timebox-chip",
      text: "时间记录",
      attr: { type: "button" }
    });
    history.onclick = () => {
      this.close();
      const leaf = this.app.workspace.getLeavesOfType("meinc-home")[0];
      leaf?.view?.openTimeboxHistory?.();
    };
    const input = contentEl.createEl("input", {
      cls: "meinc-home-name-input meinc-timebox-title-input",
      type: "text",
      attr: { placeholder: "这块做什么" }
    });
    input.value = this.titleValue;
    input.addEventListener("input", () => {
      this.titleValue = input.value;
    });
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        this.submit();
        return;
      }
      if (ev.key === "ArrowUp") {
        ev.preventDefault();
        this.picker.setMinutes(this.picker.getMinutes() + 1);
      }
      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        this.picker.setMinutes(this.picker.getMinutes() - 1);
      }
    });
    contentEl.createDiv({ cls: "meinc-timebox-recent-label", text: "时长" });
    this.minutes = this.initialMinutes;
    this.picker = mountTimeboxDurationPicker(contentEl, this.plugin, this.minutes, (m) => {
      this.minutes = m;
      this.syncSubmitLabel();
    });
    const fillTitle = (title) => {
      this.titleValue = title;
      input.value = title;
      if (!Platform.isMobile) input.focus();
    };
    const recent = this.plugin.timebox?.state.recentTitles || [];
    if (recent.length) {
      contentEl.createDiv({ cls: "meinc-timebox-recent-label", text: "最近" });
      const row = contentEl.createDiv({ cls: "meinc-timebox-recent" });
      for (const title of recent) {
        const chip = row.createEl("button", {
          cls: "meinc-timebox-chip",
          text: title,
          attr: { type: "button" }
        });
        chip.onclick = () => fillTitle(title);
      }
    }
    const actions = contentEl.createDiv({ cls: "meinc-home-modal-actions" });
    const cancel = actions.createEl("button", { text: "取消", attr: { type: "button" } });
    cancel.onclick = () => this.close();
    this.okBtn = actions.createEl("button", {
      cls: "mod-cta meinc-timebox-start-btn",
      attr: { type: "button" }
    });
    this.okBtn.onclick = () => this.submit();
    this.syncSubmitLabel();
    if (!Platform.isMobile) setTimeout(() => input.focus(), 20);
  }
  syncSubmitLabel() {
    if (this.okBtn) this.okBtn.setText(`开始 ${this.minutes} 分钟`);
  }
  submit() {
    const title = String(this.titleValue || "").trim();
    if (!title) {
      new Notice("先写这块要做什么");
      return;
    }
    const minutes = this.picker?.getMinutes() || this.minutes;
    if (!this.plugin.startTimebox(title, minutes * 6e4)) return;
    this.close();
  }
  onClose() {
    this.contentEl.empty();
  }
};
var TimeboxControlModal = class extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.abandonArmed = false;
    this.abandonTimer = null;
    this.tickTimer = null;
  }
  onOpen() {
    this.modalEl.addClass("meinc-home-modal", "meinc-timebox-modal", "is-control");
    applyMeincHomeTheme(this.modalEl);
    this.titleEl.setText("Timebox");
    this.renderBody();
    this.tickTimer = window.setInterval(() => this.renderBody(true), 500);
  }
  renderBody(soft = false) {
    const state = this.plugin.timebox?.state;
    if (!state || state.status === "idle") {
      this.close();
      return;
    }
    if (!soft || !this.ringEl) {
      this.contentEl.empty();
      this.abandonArmed = false;
      if (this.abandonTimer) window.clearTimeout(this.abandonTimer);
      const { contentEl } = this;
      const ringWrap = contentEl.createDiv({ cls: "meinc-timebox-ring-wrap" });
      this.ringEl = ringWrap.createDiv({ cls: "meinc-timebox-ring" });
      this.timeEl = ringWrap.createDiv({ cls: "meinc-timebox-ring-time" });
      this.titleEl2 = ringWrap.createDiv({ cls: "meinc-timebox-ring-title" });
      const actions = contentEl.createDiv({ cls: "meinc-timebox-control-actions" });
      const primary = actions.createEl("button", {
        cls: "meinc-timebox-control-primary",
        attr: { type: "button" }
      });
      primary.onclick = () => {
        if (state.status === "running") this.plugin.pauseTimebox();
        else this.plugin.resumeTimebox();
        this.renderBody(false);
      };
      this.primaryBtn = primary;
      const extend = actions.createEl("button", {
        cls: "meinc-timebox-control-secondary",
        text: `+${this.plugin.settings.timeboxExtendStepMin || 5} 分`,
        attr: { type: "button" }
      });
      extend.onclick = () => {
        this.plugin.extendTimebox(
          (this.plugin.settings.timeboxExtendStepMin || 5) * 6e4
        );
        this.renderBody(false);
      };
      const early = actions.createEl("button", {
        cls: "meinc-timebox-control-secondary",
        text: "提前完成",
        attr: { type: "button" }
      });
      early.onclick = () => {
        this.plugin.finishTimeboxEarly();
        this.close();
      };
      this.abandonBtn = actions.createEl("button", {
        cls: "meinc-timebox-control-danger",
        text: "放弃",
        attr: { type: "button" }
      });
      this.abandonBtn.onclick = () => {
        if (!this.abandonArmed) {
          this.abandonArmed = true;
          this.abandonBtn.setText("再点放弃");
          this.abandonTimer = window.setTimeout(() => {
            this.abandonArmed = false;
            if (this.abandonBtn) this.abandonBtn.setText("放弃");
          }, 2500);
          return;
        }
        this.plugin.abandonTimebox();
        this.close();
      };
    }
    const ratio = timeboxProgressRatio(state);
    const deg = Math.round(ratio * 360);
    this.ringEl.style.background = `conic-gradient(var(--home-blue) ${deg}deg, var(--home-track, transparent) 0)`;
    this.timeEl.setText(formatRemaining(state.remainingMs));
    this.titleEl2.setText(state.title || "Timebox");
    if (this.primaryBtn) {
      this.primaryBtn.setText(state.status === "running" ? "暂停" : "继续");
    }
  }
  onClose() {
    if (this.tickTimer) window.clearInterval(this.tickTimer);
    if (this.abandonTimer) window.clearTimeout(this.abandonTimer);
    this.contentEl.empty();
    this.ringEl = null;
  }
};
var TimeboxDoneModal = class extends Modal {
  constructor(app, plugin, payload) {
    super(app);
    this.plugin = plugin;
    this.payload = payload;
    this.saved = false;
  }
  onOpen() {
    this.modalEl.addClass("meinc-home-modal", "meinc-timebox-modal", "is-done");
    applyMeincHomeTheme(this.modalEl);
    this.titleEl.setText("这块完成了");
    const { contentEl } = this;
    const stats = this.plugin.getTimeboxStats([this.payload]);
    contentEl.createDiv({
      cls: "meinc-timebox-done-title",
      text: this.payload.title || "Timebox"
    });
    contentEl.createDiv({
      cls: "meinc-timebox-done-meta",
      text: `${formatTimeboxMinutes(this.payload.focusedMs || this.payload.plannedMs)} 分钟 · 今天第 ${stats.todayBlocks} 块`
    });
    if (stats.goal > 0) {
      const dots = contentEl.createDiv({ cls: "meinc-timebox-goal-dots is-large" });
      for (let i = 0; i < stats.goal; i += 1) {
        dots.createSpan({
          cls: "meinc-timebox-goal-dot" + (i < stats.goalDots ? " is-on" : "")
        });
      }
    }
    const note = contentEl.createEl("input", {
      cls: "meinc-home-name-input meinc-timebox-done-input",
      type: "text",
      attr: { placeholder: "做到哪了（可选）", maxlength: "120" }
    });
    const actions = contentEl.createDiv({ cls: "meinc-home-modal-actions" });
    const rest = actions.createEl("button", { text: "休息", attr: { type: "button" } });
    rest.onclick = () => {
      this.save(note.value);
      this.close();
    };
    const again = actions.createEl("button", {
      cls: "mod-cta",
      text: "再来一块",
      attr: { type: "button" }
    });
    again.onclick = () => {
      this.save(note.value);
      this.close();
      this.plugin.openTimeboxStart({
        title: this.payload.title,
        durationMs: this.payload.plannedMs
      });
    };
  }
  save(noteValue) {
    if (this.saved) return;
    this.payload.note = String(noteValue || "").trim();
    this.plugin.finalizeTimeboxSession(this.payload);
    this.saved = true;
  }
  onClose() {
    if (!this.saved) this.save("");
    this.contentEl.empty();
  }
};
function reviewCardExamples(entry) {
  if (!entry || !Array.isArray(entry.examples)) return [];
  return entry.examples.filter((item) => item && String(item.text || "").trim());
}
function appendReviewWordBack(parent, entry) {
  if (entry.pos) {
    parent.createDiv({ cls: "meinc-home-review-pos", text: entry.pos });
  }
  if (entry.phonetic) {
    parent.createDiv({ cls: "meinc-home-review-meta", text: entry.phonetic });
  }
  const defs = Array.isArray(entry.definitions) ? entry.definitions.filter(Boolean) : [];
  const body = parent.createDiv({ cls: "meinc-home-review-body" });
  if (defs.length) {
    const ul = body.createEl("ul", { cls: "meinc-home-review-defs" });
    defs.forEach((line) => ul.createEl("li", { text: line }));
  } else {
    body.createDiv({ text: entry.note || "暂无释义" });
  }
  const examples = reviewCardExamples(entry);
  if (examples.length) {
    const quotes = parent.createDiv({ cls: "meinc-home-review-examples" });
    examples.forEach((item) => {
      quotes.createDiv({ cls: "meinc-home-review-example", text: item.text });
    });
  }
  if (entry.deck) {
    parent.createDiv({ cls: "meinc-home-review-source", text: entry.deck });
  }
}
var HomeView = class extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.nav = [{ type: "home" }];
    this.mailboxDraft = { to: "CEO", body: "", notePath: "" };
    this._scrollKey = "";
    this._renderSeq = 0;
    this.timeboxRefs = null;
    this.compoundEditor = null;
    this.reviewSession = null;
    this.onTimebox = (reason) => this.refreshTimebox(reason);
  }
  getViewType() {
    return VIEW_TYPE_HOME;
  }
  getDisplayText() {
    return "首页";
  }
  getIcon() {
    return "home";
  }
  async onOpen() {
    this.containerEl.addClass("meinc-home-view");
    this.registerEvent(this.app.vault.on("create", () => this.refreshListing()));
    this.registerEvent(this.app.vault.on("delete", () => this.refreshListing()));
    this.registerEvent(this.app.vault.on("rename", () => this.refreshListing()));
    this.plugin.addTimeboxListener(this.onTimebox);
    this.render();
  }
  refreshListing() {
    this.render();
  }
  async onClose() {
    if (this.current().type === "compound") {
      await this.saveCompoundEditor({ quiet: true });
    }
    this.plugin.removeTimeboxListener(this.onTimebox);
    this.timeboxRefs = null;
    this.contentEl.empty();
  }
  async resetToHome() {
    if (this.current().type === "compound") {
      const ok = await this.saveCompoundEditor({ quiet: true });
      if (!ok) return false;
    }
    this.nav = [{ type: "home" }];
    this.compoundEditor = null;
    this.render();
    return true;
  }
  current() {
    return this.nav[this.nav.length - 1] || { type: "home" };
  }
  push(screen) {
    this.nav.push(screen);
    this.render();
  }
  back() {
    if (this.current().type === "compound") {
      void this.leaveCompound();
      return;
    }
    if (this.nav.length > 1) this.nav.pop();
    this.render();
  }
  async leaveCompound() {
    const ok = await this.saveCompoundEditor({ quiet: true });
    if (!ok) return;
    if (this.current().type === "compound" && this.nav.length > 1) this.nav.pop();
    this.compoundEditor = null;
    this.render();
  }
  screenKey(screen) {
    if (screen.type === "review") {
      return `review:${screen.mode || "hub"}`;
    }
    if (screen.type === "editor") return `editor:${screen.path || ""}`;
    if (screen.type === "reader") return `reader:${screen.path || ""}`;
    return `${screen.type}:${screen.path || screen.folder || ""}`;
  }
  async render() {
    const token = this._renderSeq += 1;
    const screen = this.current();
    const key = this.screenKey(screen);
    const prevScroll = key === this._scrollKey ? this.contentEl.querySelector(".meinc-home-scroll")?.scrollTop || 0 : 0;
    if (token !== this._renderSeq) return;
    const host = this.contentEl;
    host.empty();
    host.addClass("meinc-home");
    const root = host.createDiv({ cls: "meinc-home-scroll" });
    if (screen.type === "home") this.renderHome(root);
    else if (screen.type === "inbox") this.renderInbox(root);
    else if (screen.type === "review") this.renderReview(root);
    else if (screen.type === "compound") this.renderCompound(root);
    else if (screen.type === "editor") this.renderEditor(root);
    else if (screen.type === "reader") this.renderReader(root);
    else if (screen.type === "library") this.renderLibrary(root);
    else if (screen.type === "writing-list") this.renderWritingList(root);
    else if (screen.type === "projects") this.renderProjects(root);
    else if (screen.type === "timebox-history") this.renderTimeboxHistory(root);
    else this.renderFolder(root, screen);
    this._scrollKey = key;
    root.scrollTop = prevScroll;
  }
  renderHome(root) {
    const { weekday, date } = formatHomeDate();
    const hero = root.createDiv({ cls: "meinc-home-hero" });
    const dateCol = hero.createDiv({ cls: "meinc-home-hero-date" });
    dateCol.createDiv({ cls: "meinc-home-kicker", text: weekday });
    dateCol.createEl("h1", { cls: "meinc-home-date", text: date });
    const focus = hero.createDiv({ cls: "meinc-home-focus" });
    this.mountCompoundChip(focus);
    this.mountTimebox(focus);
    const grid = root.createDiv({ cls: "meinc-home-grid" });
    HOME_TILES.forEach((tile, index) => {
      const agentPlugin = this.app.plugins?.plugins?.["obsidian-agent-os"];
      this.addTile(grid, {
        name: tile.id === "agent" ? agentPlugin?.settings?.agentName || tile.name : tile.name,
        icon: tile.icon,
        tint: tile.tint,
        size: tile.size,
        index,
        meta: tile.id === "review" ? this.plugin.reviewMeta() : tile.id === "inbox" ? this.plugin.inboxMeta() : tile.id === "agent" ? "OpenClaw" : void 0,
        onClick: () => this.handleHomeTile(tile)
      });
    });
  }
  mountTimebox(hero) {
    hero.querySelector(".meinc-home-timebox")?.remove();
    this.buildTimeboxChip(hero);
  }
  buildTimeboxChip(parent) {
    const state = this.plugin.timebox?.state || createDefaultTimebox();
    const chip = parent.createDiv({
      cls: `meinc-home-timebox is-${state.status}`,
      attr: { role: "button", tabindex: "0" }
    });
    const ring = chip.createDiv({ cls: "meinc-home-timebox-ring" });
    const inner = chip.createDiv({ cls: "meinc-home-timebox-inner" });
    const copy = inner.createDiv({ cls: "meinc-home-timebox-copy" });
    const kicker = copy.createDiv({ cls: "meinc-home-timebox-kicker" });
    const main = copy.createDiv({ cls: "meinc-home-timebox-main" });
    const title = copy.createDiv({ cls: "meinc-home-timebox-title" });
    if (state.status === "idle") {
      kicker.setText("Timebox");
      main.setText("开始一块");
      title.setText(this.plugin.getTimeboxStats().todayLine);
      title.hidden = false;
      ring.style.background = "";
    } else if (state.status === "paused") {
      kicker.setText("已暂停");
      main.setText(formatRemaining(state.remainingMs));
      title.setText(state.title);
      title.hidden = !state.title;
      this.paintTimeboxRing(ring, state);
    } else {
      kicker.setText(state.title || "Timebox");
      main.setText(formatRemaining(state.remainingMs));
      title.setText("进行中");
      title.hidden = false;
      this.paintTimeboxRing(ring, state);
    }
    chip.addEventListener("click", () => this.handleTimeboxClick());
    chip.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        this.handleTimeboxClick();
      }
    });
    this.timeboxRefs = { chip, ring, kicker, main, title };
    return chip;
  }
  paintTimeboxRing(ringEl, state) {
    if (!ringEl || !state || state.status === "idle") return;
    const ratio = timeboxProgressRatio(state);
    const deg = Math.round(ratio * 360);
    ringEl.style.background = `conic-gradient(var(--home-blue) ${deg}deg, var(--home-track, transparent) 0)`;
  }
  handleTimeboxClick() {
    const status = this.plugin.timebox?.state.status || "idle";
    if (status === "idle") this.showTimeboxStart();
    else this.plugin.openTimeboxControl();
  }
  showTimeboxStart(title) {
    this.plugin.openTimeboxStart({ title });
  }
  mountCompoundChip(parent) {
    parent.querySelector(".meinc-home-compound-chip")?.remove();
    const summary = summarizeCompoundDay(this.plugin.compoundToday);
    const chip = parent.createDiv({
      cls: "meinc-home-compound-chip" + (summary.filled ? " has-entry" : ""),
      attr: { role: "button", tabindex: "0" }
    });
    const copy = chip.createDiv({ cls: "meinc-home-timebox-copy" });
    copy.createDiv({ cls: "meinc-home-timebox-kicker", text: COMPOUND_TITLE });
    copy.createDiv({ cls: "meinc-home-timebox-main", text: summary.main });
    const preview = copy.createDiv({ cls: "meinc-home-timebox-title" });
    preview.setText(summary.preview);
    preview.hidden = !summary.preview;
    chip.addEventListener("click", () => {
      void this.openCompound();
    });
    chip.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        void this.openCompound();
      }
    });
    return chip;
  }
  async openCompound() {
    if (this.current().type === "compound") return;
    const today = compoundDayKeyFromTime(Date.now());
    await this.loadCompoundEditor(today);
    this.push({ type: "compound", title: COMPOUND_TITLE });
  }
  async loadCompoundEditor(dayKey) {
    const today = compoundDayKeyFromTime(Date.now());
    const key = !parseCompoundDay(dayKey) || dayKey > today ? today : dayKey;
    const weekStart = compoundWeekStart(key);
    const path = compoundWeekPath(weekStart);
    const file = this.app.vault.getAbstractFileByPath(path);
    let text = "";
    if (file instanceof TFile) {
      try {
        text = await this.app.vault.read(file);
      } catch (_) {
      }
    }
    const parsed = parseCompoundWeek(text);
    const saved = normalizeCompoundDay(parsed.days[key]);
    let yesterday = "";
    if (key === today) {
      const previousKey = addCompoundDays(today, -1);
      if (compoundWeekStart(previousKey) === weekStart) {
        yesterday = yesterdayCompoundChange(today, parsed.days, {});
      } else {
        const prevPath = compoundWeekPath(previousKey);
        const prev = this.app.vault.getAbstractFileByPath(prevPath);
        let prevDays = {};
        if (prev instanceof TFile) {
          try {
            prevDays = parseCompoundWeek(await this.app.vault.read(prev)).days;
          } catch (_) {
          }
        }
        yesterday = yesterdayCompoundChange(today, parsed.days, prevDays);
      }
    }
    this.compoundEditor = {
      dayKey: key,
      today,
      weekStart,
      path,
      days: parsed.days,
      exists: file instanceof TFile,
      yesterday,
      draft: { ...saved },
      saved: { ...saved },
      saving: null,
      writing: false
    };
  }
  compoundDirty() {
    const editor = this.compoundEditor;
    if (!editor) return false;
    return !compoundDayEquals(editor.draft, editor.saved);
  }
  async saveCompoundEditor(opts = {}) {
    const editor = this.compoundEditor;
    if (!editor) return true;
    if (compoundDayEquals(editor.draft, editor.saved)) {
      if (!opts.quiet) new Notice("已记下");
      return true;
    }
    if (editor.saving) return editor.saving;
    const job = (async () => {
      editor.writing = true;
      try {
        const result = await this.plugin.saveCompoundDay(editor.dayKey, editor.draft);
        if (result.skipped) return false;
        const saved = normalizeCompoundDay(editor.draft);
        editor.saved = saved;
        editor.draft = { ...saved };
        editor.days = result.days || {};
        editor.exists = !result.deleted;
        editor.path = result.path;
        if (!opts.quiet) new Notice(result.deleted ? "这一天已清空" : "已记下");
        this.refreshCompoundChip();
        if (!opts.quiet && this.current().type === "compound") this.render();
        return true;
      } catch (_) {
        new Notice("没记下，再试一次");
        return false;
      } finally {
        editor.writing = false;
      }
    })();
    editor.saving = job;
    try {
      return await job;
    } finally {
      if (editor.saving === job) editor.saving = null;
    }
  }
  async switchCompoundDay(dayKey) {
    const today = compoundDayKeyFromTime(Date.now());
    if (!parseCompoundDay(dayKey) || dayKey > today) return;
    const ok = await this.saveCompoundEditor({ quiet: true });
    if (!ok) return;
    await this.loadCompoundEditor(dayKey);
    if (this.current().type === "compound") this.render();
  }
  async openCompoundNote() {
    const ok = await this.saveCompoundEditor({ quiet: true });
    if (!ok) return;
    const editor = this.compoundEditor;
    if (!editor?.exists) return;
    const file = this.app.vault.getAbstractFileByPath(editor.path);
    if (file instanceof TFile) await this.plugin.openFile(file);
  }
  renderCompound(root) {
    const header = root.createDiv({ cls: "meinc-home-header" });
    const back = header.createEl("button", {
      cls: "meinc-home-back",
      attr: { "aria-label": "返回", type: "button" }
    });
    setIcon(back, "chevron-left");
    back.onclick = () => this.back();
    header.createEl("h1", {
      cls: "meinc-home-title",
      text: COMPOUND_TITLE
    });
    const editor = this.compoundEditor;
    const page = root.createDiv({ cls: "meinc-home-compound-page" });
    if (!editor) {
      page.createDiv({ cls: "meinc-home-empty", text: "正在打开" });
      const today = compoundDayKeyFromTime(Date.now());
      void this.loadCompoundEditor(today).then(() => {
        if (this.current().type === "compound") this.render();
      });
      return;
    }
    page.createDiv({
      cls: "meinc-home-compound-range",
      text: compoundWeekLabel(editor.weekStart)
    });
    page.createDiv({
      cls: "meinc-home-compound-day-label",
      text: `${editor.dayKey} ${compoundWeekdayLabel(editor.dayKey)}`
    });
    if (editor.yesterday) {
      const box = page.createDiv({ cls: "meinc-home-compound-yesterday" });
      box.createDiv({ cls: "meinc-home-compound-yesterday-kicker", text: "昨天要改的" });
      box.createDiv({ cls: "meinc-home-compound-yesterday-body", text: editor.yesterday });
    }
    for (const field of COMPOUND_FIELDS) {
      const wrap = page.createDiv({ cls: "meinc-home-compound-field" });
      wrap.createDiv({ cls: "meinc-home-compound-label", text: field.title });
      const area = wrap.createEl("textarea", {
        cls: "meinc-home-compound-input",
        attr: { maxlength: String(COMPOUND_FIELD_MAX) }
      });
      area.value = editor.draft[field.key] || "";
      area.addEventListener("input", () => {
        editor.draft[field.key] = area.value;
      });
    }
    const save = page.createEl("button", {
      cls: "meinc-home-compound-save",
      text: "记下",
      attr: { type: "button" }
    });
    save.onclick = () => {
      void this.saveCompoundEditor();
    };
    if (editor.dayKey !== editor.today) {
      const backToday = page.createEl("button", {
        cls: "meinc-home-compound-day",
        text: "回到今天",
        attr: { type: "button" }
      });
      backToday.onclick = () => {
        void this.switchCompoundDay(editor.today);
      };
    }
    const others = compoundDaysInWeek(editor.weekStart, editor.days, editor.today).filter(
      (key) => key !== editor.dayKey
    );
    if (others.length) {
      page.createDiv({ cls: "meinc-home-compound-days-label", text: "本周已记" });
      const list = page.createDiv({ cls: "meinc-home-compound-days" });
      for (const key of others) {
        const preview = summarizeCompoundDay(editor.days[key]).preview;
        const btn = list.createEl("button", {
          cls: "meinc-home-compound-day",
          attr: { type: "button" }
        });
        btn.createSpan({
          cls: "meinc-home-compound-day-date",
          text: `${key.slice(5)} ${compoundWeekdayLabel(key)}`
        });
        if (preview) {
          btn.createSpan({ cls: "meinc-home-compound-day-preview", text: preview });
        }
        btn.onclick = () => {
          void this.switchCompoundDay(key);
        };
      }
    }
    if (editor.exists) {
      const open = page.createEl("button", {
        cls: "meinc-home-compound-open",
        text: "打开本周笔记",
        attr: { type: "button" }
      });
      open.onclick = () => {
        void this.openCompoundNote();
      };
    }
  }
  refreshCompoundChip() {
    const screen = this.current();
    if (screen.type !== "home") return;
    const focus = this.contentEl.querySelector(".meinc-home-focus");
    if (!focus) return;
    focus.empty();
    this.mountCompoundChip(focus);
    this.mountTimebox(focus);
  }
  updateTimeboxChip() {
    const refs = this.timeboxRefs;
    const state = this.plugin.timebox?.state;
    if (!refs || !state) return;
    refs.chip?.classList.remove("is-idle", "is-running", "is-paused");
    refs.chip?.classList.add(`is-${state.status}`);
    if (state.status === "idle") {
      refs.kicker.setText("Timebox");
      refs.main.setText("开始一块");
      if (refs.title) {
        refs.title.setText(this.plugin.getTimeboxStats().todayLine);
        refs.title.hidden = false;
      }
      if (refs.ring) refs.ring.style.background = "";
      return;
    }
    if (state.status === "paused") {
      refs.kicker.setText("已暂停");
      refs.main.setText(formatRemaining(state.remainingMs));
      if (refs.title) {
        refs.title.setText(state.title || "");
        refs.title.hidden = !state.title;
      }
      this.paintTimeboxRing(refs.ring, state);
      return;
    }
    refs.kicker.setText(state.title || "Timebox");
    refs.main.setText(formatRemaining(state.remainingMs));
    if (refs.title) {
      refs.title.setText("进行中");
      refs.title.hidden = false;
    }
    this.paintTimeboxRing(refs.ring, state);
  }
  refreshTimebox(reason) {
    const screen = this.current();
    if (screen.type !== "home") {
      this.timeboxRefs = null;
      return;
    }
    if (reason === "tick") {
      this.updateTimeboxChip();
      return;
    }
    if (reason === "sessions") {
      this.updateTimeboxChip();
      return;
    }
    const focus = this.contentEl.querySelector(".meinc-home-focus");
    if (!focus) return;
    focus.empty();
    this.mountCompoundChip(focus);
    this.mountTimebox(focus);
  }
  handleHomeTile(tile) {
    if (tile.id === "agent") {
      this.plugin.openAgent();
      return;
    }
    if (tile.id === "review") {
      void this.openReview();
      return;
    }
    if (tile.id === "today") {
      this.plugin.openToday();
      return;
    }
    if (tile.id === "inbox") {
      this.push({ type: "inbox", title: MAILBOX_TITLE });
      return;
    }
    if (tile.id === "subjects") {
      this.push({
        type: "folder",
        path: "基础学科",
        title: "学习/输出",
        mode: "subjects"
      });
      return;
    }
    this.push({
      type: "folder",
      path: tile.path,
      title: tile.name
    });
  }
  renderInbox(root) {
    const header = root.createDiv({ cls: "meinc-home-header" });
    const back = header.createEl("button", {
      cls: "meinc-home-back",
      attr: { "aria-label": "返回", type: "button" }
    });
    setIcon(back, "chevron-left");
    back.onclick = () => this.back();
    header.createEl("h1", {
      cls: "meinc-home-title",
      text: MAILBOX_TITLE
    });
    this.renderMailboxCompose(root);
    const items = this.plugin.listInboxItems();
    if (!items.length) {
      const empty = root.createDiv({ cls: "meinc-home-empty" });
      empty.createDiv({ text: "收件箱是空的" });
      empty.createDiv({
        cls: "meinc-home-empty-sub",
        text: "今天没有待处理的推送"
      });
      return;
    }
    const group = root.createDiv({ cls: "meinc-home-group" });
    items.forEach((item, index) => {
      this.addRow(group, {
        name: item.title,
        meta: `${item.stream.name} · ${formatInboxDate(item.date) || "未标日期"}`,
        icon: item.stream.icon || "inbox",
        tint: item.stream.tint || "teal",
        index,
        file: item.file,
        sheet: "inbox",
        onClick: () => this.plugin.openFile(item.file)
      });
    });
  }
  openReview() {
    this.reviewSession = null;
    this.push({ type: "review", title: "复习", mode: "hub" });
  }
  async startEnglishReview() {
    this.reviewSession = await this.plugin.buildEnglishReviewSession();
    this.push({ type: "review", title: "英语", mode: "english" });
  }
  async startChineseReview() {
    this.reviewSession = await this.plugin.buildChineseReviewSession();
    this.push({ type: "review", title: "语文", mode: "chinese" });
  }
  renderReviewHub(root) {
    const header = root.createDiv({ cls: "meinc-home-header meinc-home-review-header" });
    const back = header.createEl("button", {
      cls: "meinc-home-back",
      attr: { "aria-label": "返回", type: "button" }
    });
    setIcon(back, "chevron-left");
    back.onclick = () => this.back();
    header.createEl("h1", { cls: "meinc-home-title", text: "复习" });
    const moreBtn = header.createEl("button", {
      cls: "meinc-home-add",
      attr: { type: "button", "aria-label": "更多" }
    });
    setIcon(moreBtn, "more-horizontal");
    moreBtn.onclick = (ev) => this.showReviewMoreMenu(ev);
    const counts = this.plugin.reviewHubCounts();
    const group = root.createDiv({ cls: "meinc-home-group" });
    this.addRow(group, {
      name: "英语",
      meta: counts.english > 0 ? `今日 ${counts.english}` : "暂无待复习",
      icon: "languages",
      tint: "blue",
      index: 0,
      onClick: () => void this.startEnglishReview()
    });
    this.addRow(group, {
      name: "语文",
      meta: counts.chinese > 0 ? `今日 ${counts.chinese}` : "暂无待复习",
      icon: "book-open",
      tint: "orange",
      index: 1,
      onClick: () => void this.startChineseReview()
    });
  }
  currentReviewItem() {
    const session = this.reviewSession;
    if (!session || !Array.isArray(session.queue)) return null;
    return session.queue[session.index] || null;
  }
  renderReview(root) {
    const screen = this.current();
    if (screen.mode === "hub" || !screen.mode) {
      this.renderReviewHub(root);
      return;
    }
    const session = this.reviewSession;
    const header = root.createDiv({ cls: "meinc-home-header meinc-home-review-header" });
    const back = header.createEl("button", {
      cls: "meinc-home-back",
      attr: { "aria-label": "返回", type: "button" }
    });
    setIcon(back, "chevron-left");
    back.onclick = () => this.back();
    header.createEl("h1", {
      cls: "meinc-home-title",
      text: screen.title || "复习"
    });
    if (screen.mode === "english") {
      const libBtn = header.createEl("button", {
        cls: "meinc-home-add",
        attr: { type: "button", "aria-label": "词库" }
      });
      setIcon(libBtn, "library");
      libBtn.onclick = () => this.plugin.openLexiDeck();
    }
    const moreBtn = header.createEl("button", {
      cls: "meinc-home-add",
      attr: { type: "button", "aria-label": "更多" }
    });
    setIcon(moreBtn, "more-horizontal");
    moreBtn.onclick = (ev) => this.showReviewMoreMenu(ev);
    if (!session || !session.queue.length) {
      const empty = root.createDiv({ cls: "meinc-home-empty" });
      empty.createDiv({ text: "今天没有待复习" });
      const actions = empty.createDiv({ cls: "meinc-home-review-actions" });
      const addArticle = actions.createEl("button", {
        cls: "mod-cta",
        text: "加入文章",
        attr: { type: "button" }
      });
      addArticle.onclick = () => this.showReviewArticlePicker();
      const openLexi = actions.createEl("button", {
        text: "打开词库",
        attr: { type: "button" }
      });
      openLexi.onclick = () => this.plugin.openLexiDeck();
      return;
    }
    const total = session.queue.length;
    root.createDiv({
      cls: "meinc-home-review-progress",
      text: `${Math.min(session.index + 1, total)} / ${total}`
    });
    const stage = root.createDiv({ cls: "meinc-home-review-stage" });
    const card = this.currentReviewItem();
    if (!card) {
      session.queue = [];
      const done = root.createDiv({ cls: "meinc-home-empty" });
      done.createDiv({ text: "今天的复习刷完了" });
      return;
    }
    const flash = stage.createDiv({
      cls: "meinc-home-review-card" + (session.flipped ? " is-flipped" : "") + (card.type === "prose" ? " is-prose" : ""),
      attr: { role: "button", tabindex: "0" }
    });
    flash.onclick = () => {
      session.flipped = !session.flipped;
      this.render();
    };
    flash.onkeydown = (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        session.flipped = !session.flipped;
        this.render();
      }
    };
    if (card.type === "word" || card.type === "sentence") {
      const entry = card.card || {};
      if (!session.flipped) {
        flash.createDiv({
          cls: "meinc-home-review-main",
          text: card.type === "word" ? entry.word || "" : entry.text || ""
        });
        flash.createDiv({
          cls: "meinc-home-review-hint",
          text: "点一下翻面"
        });
      } else if (card.type === "word") {
        appendReviewWordBack(flash, entry);
      } else {
        flash.createDiv({
          cls: "meinc-home-review-body",
          text: entry.translation || entry.note || "暂无译文"
        });
        if (entry.source) {
          flash.createDiv({ cls: "meinc-home-review-source", text: entry.source });
        }
      }
    } else {
      flash.createDiv({ cls: "meinc-home-review-kicker", text: card.source || "文章" });
      flash.createDiv({ cls: "meinc-home-review-main", text: card.title || card.path });
      if (session.flipped) {
        const open = flash.createEl("button", {
          cls: "meinc-home-review-open",
          text: "打开原文",
          attr: { type: "button" }
        });
        open.onclick = (ev) => {
          ev.stopPropagation();
          const file = this.app.vault.getAbstractFileByPath(card.path);
          if (file instanceof TFile) void this.plugin.openFile(file);
        };
        flash.createDiv({
          cls: "meinc-home-review-hint",
          text: "读完再选间隔"
        });
      } else {
        flash.createDiv({
          cls: "meinc-home-review-hint",
          text: "点一下翻面"
        });
      }
    }
    const grades = root.createDiv({ cls: "meinc-home-review-grades" });
    const gradeDefs = card.type === "prose" ? [
      { id: "again", label: "明天" },
      { id: "hard", label: "3 天" },
      { id: "good", label: "7 天" }
    ] : [
      { id: "again", label: "不会" },
      { id: "hard", label: "模糊" },
      { id: "good", label: "会了" }
    ];
    for (const g of gradeDefs) {
      const btn = grades.createEl("button", {
        cls: `meinc-home-review-grade is-${g.id}`,
        text: g.label,
        attr: { type: "button" }
      });
      btn.onclick = () => void this.gradeReviewCard(g.id);
    }
    if (screen.mode === "chinese") {
      const foot = root.createDiv({ cls: "meinc-home-review-foot" });
      const addArticle = foot.createEl("button", {
        text: "加入文章",
        attr: { type: "button" }
      });
      addArticle.onclick = () => this.showReviewArticlePicker();
    }
  }
  async gradeReviewCard(rating) {
    const session = this.reviewSession;
    const card = this.currentReviewItem();
    if (!session || !card) return;
    if (card.type === "word" || card.type === "sentence") {
      const lexideck = this.app.plugins?.plugins?.lexideck;
      if (!lexideck || typeof lexideck.gradeEntry !== "function") {
        new Notice("LexiDeck 未就绪");
        return;
      }
      const ok = await lexideck.gradeEntry(card.kind, card.id, rating);
      if (!ok) {
        new Notice("评分失败");
        return;
      }
    } else {
      await this.plugin.gradeReviewProse(card.path, rating);
    }
    session.queue.splice(session.index, 1);
    if (session.index >= session.queue.length) session.index = 0;
    session.flipped = false;
    this.render();
  }
  showReviewMoreMenu(evt) {
    const menu = document.createElement("div");
    menu.className = "meinc-home-review-menu";
    const add = (label, onClick) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.className = "meinc-home-review-menu-btn";
      btn.onclick = () => {
        menu.remove();
        onClick();
      };
      menu.appendChild(btn);
    };
    add("加入文章", () => this.showReviewArticlePicker());
    add("词汇笔记", () => {
      this.push({
        type: "folder",
        path: "基础学科/英语/01-词汇",
        title: "词汇笔记"
      });
    });
    add("背诵默写", () => {
      this.push({
        type: "folder",
        path: "基础学科/语文",
        title: "背诵默写",
        mode: "memorization"
      });
    });
    add("打开词库", () => this.plugin.openLexiDeck());
    document.body.appendChild(menu);
    const rect = evt.currentTarget.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    const close = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener("click", close, true);
      }
    };
    window.setTimeout(() => document.addEventListener("click", close, true), 0);
  }
  showReviewArticlePicker() {
    const paths = this.plugin.listLibraryArticlePaths();
    if (!paths.length) {
      new Notice("资料库里没有可加的文章");
      return;
    }
    new ReviewArticlePickerModal(this.app, this.plugin, paths, async (path) => {
      await this.plugin.addArticleToReview(path);
      const screen = this.current();
      if (screen.mode === "chinese") {
        this.reviewSession = await this.plugin.buildChineseReviewSession();
      }
      this.render();
      new Notice("已加入复习");
    }).open();
  }
  renderMailboxCompose(root) {
    const card = root.createDiv({ cls: "meinc-home-compose" });
    card.createDiv({ cls: "meinc-home-compose-label", text: "写信" });
    const chips = card.createDiv({ cls: "meinc-home-compose-to" });
    for (const name of MAILBOX_RECIPIENTS) {
      const chip = chips.createEl("button", {
        cls: "meinc-home-chip" + (this.mailboxDraft.to === name ? " is-on" : ""),
        attr: { type: "button" },
        text: `@${name}`
      });
      chip.onclick = () => {
        this.mailboxDraft.to = name;
        chips.querySelectorAll(".meinc-home-chip").forEach((el) => {
          el.classList.toggle("is-on", el.textContent === `@${name}`);
        });
      };
    }
    const body = card.createEl("textarea", {
      cls: "meinc-home-compose-body",
      attr: { rows: "4", placeholder: "题干或问题……" }
    });
    body.value = this.mailboxDraft.body;
    body.addEventListener("input", () => {
      this.mailboxDraft.body = body.value;
    });
    const path = card.createEl("input", {
      cls: "meinc-home-compose-path",
      type: "text",
      attr: { placeholder: "相关笔记路径（可选）" }
    });
    path.value = this.mailboxDraft.notePath;
    path.addEventListener("input", () => {
      this.mailboxDraft.notePath = path.value;
    });
    const send = card.createEl("button", {
      cls: "meinc-home-compose-send",
      attr: { type: "button" },
      text: "发送"
    });
    send.onclick = async () => {
      const text = String(this.mailboxDraft.body || "").trim();
      if (!text) {
        new Notice("先写正文");
        return;
      }
      send.disabled = true;
      try {
        await this.plugin.appendMailboxMessage({
          to: this.mailboxDraft.to,
          body: text,
          notePath: this.mailboxDraft.notePath
        });
        this.mailboxDraft.body = "";
        this.mailboxDraft.notePath = "";
        body.value = "";
        path.value = "";
        if (this.plugin.hasMailboxWebhook()) new Notice("已投递");
        else new Notice("已写入信箱。去设置里贴 Webhook，否则要等定时扫");
      } catch (_) {
        new Notice("发送失败");
      } finally {
        send.disabled = false;
      }
    };
  }
  renderFolder(root, screen) {
    const header = root.createDiv({ cls: "meinc-home-header" });
    const back = header.createEl("button", {
      cls: "meinc-home-back",
      attr: { "aria-label": "返回", type: "button" }
    });
    setIcon(back, "chevron-left");
    back.onclick = () => this.back();
    header.createEl("h1", {
      cls: "meinc-home-title",
      text: screen.title || screen.path
    });
    if (isWritablePath(screen.path)) {
      const add = header.createEl("button", {
        cls: "meinc-home-add",
        attr: { type: "button", "aria-label": "新建" }
      });
      setIcon(add, "plus");
      add.onclick = () => this.showCreateSheet(screen);
    }
    const tiles = this.listTiles(screen);
    if (!tiles.length) {
      const empty = root.createDiv({ cls: "meinc-home-empty" });
      empty.createDiv({ text: "这里还没有内容" });
      if (isWritablePath(screen.path)) {
        const btn = empty.createEl("button", {
          cls: "mod-cta",
          text: "新建笔记"
        });
        btn.onclick = () => this.createNote(screen.path);
      }
      return;
    }
    if (screen.mode === "subjects") {
      const grid = root.createDiv({ cls: "meinc-home-grid" });
      tiles.forEach((tile, index) => this.addTile(grid, { ...tile, index }));
      return;
    }
    const group = root.createDiv({ cls: "meinc-home-group" });
    tiles.forEach((tile, index) => this.addRow(group, { ...tile, index }));
  }
  listTiles(screen) {
    if (screen.mode === "subjects") {
      return SUBJECTS.map((name, i) => {
        const path = `基础学科/${name}`;
        const folder2 = this.app.vault.getAbstractFileByPath(path);
        if (!(folder2 instanceof TFolder)) return null;
        return {
          name,
          meta: countMeta(childCount(folder2)),
          icon: "book-open",
          tint: SUBJECT_TINTS[i % SUBJECT_TINTS.length],
          onClick: () => this.push({
            type: "folder",
            path,
            title: name
          })
        };
      }).filter(Boolean);
    }
    const folder = this.app.vault.getAbstractFileByPath(screen.path);
    if (!(folder instanceof TFolder)) return [];
    const folders = [];
    const bottom = [];
    const notes = [];
    const underSubjects = String(screen.path || "").startsWith("基础学科");
    for (const child of folder.children) {
      if (isHiddenName(child.name)) continue;
      if (screen.mode === "memorization") {
        if (!(child instanceof TFile) || !NOTE_EXT.has(child.extension)) continue;
        if (!child.name.startsWith("高考背诵默写")) continue;
      } else if (underSubjects && shouldHideSubjectChild(child.path, child.name)) {
        continue;
      }
      if (child instanceof TFolder) {
        if (PINNED_BOTTOM.has(child.name)) bottom.push(child);
        else folders.push(child);
      } else if (child instanceof TFile && NOTE_EXT.has(child.extension)) {
        notes.push(child);
      }
    }
    folders.sort(sortByName);
    bottom.sort(sortByName);
    notes.sort(sortByName);
    const tiles = [];
    const addFolder = (item, muted = false) => {
      tiles.push({
        name: item.name,
        meta: countMeta(childCount(item)),
        muted,
        icon: "folder",
        tint: muted ? "gray" : "blue",
        file: item,
        onClick: () => this.push({
          type: "folder",
          path: item.path,
          title: item.name
        })
      });
    };
    folders.forEach((item) => addFolder(item));
    notes.forEach((item) => {
      tiles.push({
        name: displayName(item),
        icon: "file-text",
        tint: "gray",
        file: item,
        onClick: () => this.plugin.openFile(item)
      });
    });
    bottom.forEach((item) => addFolder(item, true));
    return tiles;
  }
  addTile(grid, { name, meta, muted, icon, tint, size, index, due, onClick }) {
    const cls = [
      "meinc-home-tile",
      muted ? "is-muted" : "",
      due ? "is-due" : "",
      size === "hero" ? "is-hero" : "",
      size === "wide" ? "is-wide" : "",
      tint ? `is-${tint}` : ""
    ].filter(Boolean).join(" ");
    const btn = grid.createEl("button", {
      cls,
      attr: { type: "button" }
    });
    btn.style.setProperty("--i", String(index || 0));
    if (icon) {
      const well = btn.createDiv({ cls: "meinc-home-icon" });
      setIcon(well, icon);
    }
    if (size === "wide") {
      const body = btn.createDiv({ cls: "meinc-home-tile-body" });
      body.createDiv({ cls: "meinc-home-tile-name", text: name });
      if (meta) body.createDiv({ cls: "meinc-home-tile-meta", text: meta });
    } else {
      btn.createDiv({ cls: "meinc-home-tile-name", text: name });
      if (meta) {
        btn.createDiv({ cls: "meinc-home-tile-meta", text: meta });
      }
    }
    btn.onclick = onClick;
  }
  addRow(group, { name, meta, muted, icon, tint, index, file, sheet, onClick }) {
    const row = group.createDiv({
      cls: "meinc-home-row" + (muted ? " is-muted" : ""),
      attr: { role: "button", tabindex: "0" }
    });
    row.style.setProperty("--i", String(index || 0));
    if (tint) row.addClass(`is-${tint}`);
    if (icon) {
      const well = row.createDiv({
        cls: "meinc-home-icon" + (tint ? ` is-${tint}` : "")
      });
      if (tint) well.style.background = `var(--home-${tint})`;
      setIcon(well, icon);
    }
    const body = row.createDiv({ cls: "meinc-home-row-body" });
    body.createDiv({ cls: "meinc-home-row-name", text: name });
    if (meta) body.createDiv({ cls: "meinc-home-row-meta", text: meta });
    if (file && (sheet === "inbox" || isWritablePath(file.path))) {
      const more = row.createEl("button", {
        cls: "meinc-home-more",
        attr: { type: "button", "aria-label": "更多" }
      });
      setIcon(more, "ellipsis");
      more.onclick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (sheet === "inbox") this.showInboxSheet(file);
        else this.showItemSheet(file);
      };
    }
    const chevron = row.createDiv({ cls: "meinc-home-chevron" });
    setIcon(chevron, "chevron-right");
    row.addEventListener("click", onClick);
    row.addEventListener("keydown", (ev) => {
      if (ev.target !== row) return;
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        onClick(ev);
      }
    });
  }
  showCreateSheet(screen) {
    new ActionSheet(this.app, "新建", [
      {
        name: "笔记",
        onClick: () => this.createNote(screen.path)
      },
      {
        name: "文件夹",
        onClick: () => this.createFolder(screen.path)
      }
    ]).open();
  }
  showItemSheet(file) {
    new ActionSheet(this.app, displayName(file), [
      {
        name: "移动",
        onClick: () => new MovePickerModal(this.app, this.plugin, file).open()
      },
      {
        name: "重命名",
        onClick: () => this.renameItem(file)
      },
      {
        name: "删除",
        danger: true,
        onClick: () => this.deleteItem(file)
      }
    ]).open();
  }
  showInboxSheet(file) {
    new ActionSheet(this.app, displayName(file), [
      {
        name: "已读",
        onClick: async () => {
          await this.plugin.markInboxRead(file);
          new Notice("已读");
          this.render();
        }
      }
    ]).open();
  }
  deleteItem(file) {
    if (!isWritablePath(file.path)) return;
    const name = displayName(file);
    let message = `确定删除「${name}」？可在废纸篓找回。`;
    if (file instanceof TFolder) {
      const n = descendantCount(file);
      message = n ? `将删除文件夹「${name}」及其中 ${n} 项。可在废纸篓找回。` : `确定删除文件夹「${name}」？可在废纸篓找回。`;
    }
    new ConfirmModal(this.app, {
      title: "删除",
      message,
      confirmText: "删除",
      danger: true,
      onConfirm: async () => {
        try {
          await this.app.fileManager.trashFile(file);
          new Notice("已删除");
        } catch (_) {
          new Notice("删除失败");
        }
      }
    }).open();
  }
  createNote(folderPath) {
    if (!isWritablePath(folderPath)) return;
    new NameModal(this.app, {
      title: "新建笔记",
      placeholder: "笔记名称",
      confirm: "创建",
      onSubmit: async (name) => {
        const path = uniquePath(this.app, folderPath, name, "md");
        try {
          const file = await this.app.vault.create(path, "");
          if (file instanceof TFile) await this.plugin.openFile(file);
        } catch (_) {
          new Notice("创建失败");
        }
      }
    }).open();
  }
  createFolder(folderPath) {
    if (!isWritablePath(folderPath)) return;
    new NameModal(this.app, {
      title: "新建文件夹",
      placeholder: "文件夹名称",
      confirm: "创建",
      onSubmit: async (name) => {
        const path = uniquePath(this.app, folderPath, name, "");
        try {
          await this.app.vault.createFolder(path);
          new Notice("已创建文件夹");
          this.render();
        } catch (_) {
          new Notice("创建失败");
        }
      }
    }).open();
  }
  renameItem(file) {
    if (!isWritablePath(file.path)) return;
    new NameModal(this.app, {
      title: "重命名",
      placeholder: "新名称",
      initial: displayName(file),
      confirm: "完成",
      onSubmit: async (name) => {
        const parent = file.parent?.path;
        if (!parent) return;
        const dest = file instanceof TFile ? `${parent}/${name}.${file.extension}` : `${parent}/${name}`;
        if (dest === file.path) return;
        if (this.app.vault.getAbstractFileByPath(dest)) {
          new Notice("已有同名文件");
          return;
        }
        try {
          await this.app.fileManager.renameFile(file, dest);
          new Notice("已重命名");
        } catch (_) {
          new Notice("重命名失败");
        }
      }
    }).open();
  }
};
var HomeDock = class {
  constructor(plugin) {
    this.plugin = plugin;
    this.el = null;
  }
  mount() {
    if (this.el) return;
    const btn = document.createElement("button");
    btn.className = "meinc-home-dock";
    btn.type = "button";
    btn.setAttribute("aria-label", "打开首页");
    setIcon(btn, "home");
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (this.plugin.folderResume()) {
        this.plugin.activateHome({ restore: true });
      } else {
        this.plugin.activateHome();
      }
    });
    document.body.appendChild(btn);
    this.el = btn;
    this._onViewport = () => this.position();
    window.visualViewport?.addEventListener("resize", this._onViewport);
    window.visualViewport?.addEventListener("scroll", this._onViewport);
    this.plugin.registerEvent(
      this.plugin.app.workspace.on("active-leaf-change", () => this.sync())
    );
    this.plugin.registerEvent(
      this.plugin.app.workspace.on("layout-change", () => this.sync())
    );
    this.sync();
    this.position();
  }
  position() {
    if (!this.el) return;
    const vv = window.visualViewport;
    if (!vv) {
      this.el.style.bottom = "calc(12px + env(safe-area-inset-bottom))";
      return;
    }
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    this.el.style.bottom = `${12 + kb}px`;
  }
  sync() {
    if (!this.el) return;
    const onHome = !!this.plugin.app.workspace.getActiveViewOfType(HomeView);
    const resume = this.plugin.folderResume();
    if (onHome) {
      this.el.classList.add("is-hidden");
      this.el.classList.remove("is-back");
      return;
    }
    this.el.classList.remove("is-hidden");
    this.el.replaceChildren();
    if (resume) {
      this.el.classList.add("is-back");
      const ico = document.createElement("span");
      ico.className = "meinc-home-dock-ico";
      setIcon(ico, "chevron-left");
      const lab = document.createElement("span");
      lab.className = "meinc-home-dock-label";
      lab.textContent = resume.title;
      this.el.appendChild(ico);
      this.el.appendChild(lab);
      this.el.setAttribute("aria-label", `返回${resume.title}`);
    } else {
      this.el.classList.remove("is-back");
      setIcon(this.el, "home");
      this.el.setAttribute("aria-label", "打开首页");
    }
  }
  unmount() {
    window.visualViewport?.removeEventListener("resize", this._onViewport);
    window.visualViewport?.removeEventListener("scroll", this._onViewport);
    this.el?.remove();
    this.el = null;
  }
};
var HomeSettingTab = class extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "首页" });
    new Setting(containerEl).setName("启动时打开首页").setDesc("打开这个库时，先进入 App 首页").addToggle(
      (t) => t.setValue(this.plugin.settings.openOnStart).onChange(async (v) => {
        this.plugin.settings.openOnStart = v;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "Timebox" });
    new Setting(containerEl).setName("时长预设").setDesc("逗号分隔，例如 5, 10, 15, 25, 45").addText((t) => {
      t.setValue(String(this.plugin.settings.timeboxPresetsText || "")).onChange(
        async (v) => {
          this.plugin.settings.timeboxPresetsText = String(v || "").trim();
          await this.plugin.saveSettings();
        }
      );
    });
    new Setting(containerEl).setName("默认分钟").setDesc("未记住上次时，开始一块预选的时长").addText((t) => {
      t.inputEl.type = "number";
      t.setValue(String(this.plugin.settings.timeboxDefaultMin)).onChange(
        async (v) => {
          const minutes = clampTimeboxPresetMinutes(Number(v) || 15);
          this.plugin.settings.timeboxDefaultMin = minutes;
          if (this.plugin.timebox?.state.status === "idle") {
            this.plugin.timebox.defaultMin = minutes;
            this.plugin.timebox.state.durationMs = minutes * 6e4;
            this.plugin.timebox.state.remainingMs = minutes * 6e4;
            this.plugin.settings.timebox = this.plugin.timebox.snapshot();
          }
          await this.plugin.saveSettings();
        }
      );
    });
    new Setting(containerEl).setName("记住上次时长").setDesc("打开开始小窗时优先选中上一次用的分钟数").addToggle(
      (t) => t.setValue(this.plugin.settings.timeboxRememberLastDuration !== false).onChange(async (v) => {
        this.plugin.settings.timeboxRememberLastDuration = v;
        await this.plugin.saveSettings();
      })
    );
    new Setting(containerEl).setName("每日目标（块）").setDesc("0 表示关闭目标圆点").addText((t) => {
      t.inputEl.type = "number";
      t.setValue(String(this.plugin.settings.timeboxDailyGoal ?? 4)).onChange(
        async (v) => {
          this.plugin.settings.timeboxDailyGoal = Math.max(
            0,
            Math.round(Number(v) || 0)
          );
          await this.plugin.saveSettings();
        }
      );
    });
    new Setting(containerEl).setName("加时步长（分）").setDesc("控制小窗里「+N 分」的 N").addText((t) => {
      t.inputEl.type = "number";
      t.setValue(String(this.plugin.settings.timeboxExtendStepMin ?? 5)).onChange(
        async (v) => {
          this.plugin.settings.timeboxExtendStepMin = clampTimeboxPresetMinutes(
            Number(v) || 5
          );
          await this.plugin.saveSettings();
        }
      );
    });
    new Setting(containerEl).setName("开始提示音").setDesc("点「开始」时轻响一声").addToggle(
      (t) => t.setValue(this.plugin.settings.timeboxStartSoundOn !== false).onChange(async (v) => {
        this.plugin.settings.timeboxStartSoundOn = v;
        await this.plugin.saveSettings();
      })
    );
    new Setting(containerEl).setName("结束提示音").setDesc("一块走完时响一声").addToggle(
      (t) => t.setValue(this.plugin.settings.timeboxEndSoundOn !== false).onChange(
        async (v) => {
          this.plugin.settings.timeboxEndSoundOn = v;
          this.plugin.settings.timeboxSoundOn = v;
          await this.plugin.saveSettings();
        }
      )
    );
    containerEl.createEl("h3", { text: "Grokbot 信箱" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "桌面版打开 routine「Me.Inc 信箱唤醒」，点 POST to / key 字段本身复制。要的是 https://api2.cursor.sh/… 和 crsr_…，不要复制 grokbot:// 跳转链接。不要写进笔记。"
    });
    new Setting(containerEl).setName("Webhook URL").setDesc("https://api2.cursor.sh/automations/webhook/…").addText((t) => {
      t.setPlaceholder("https://api2.cursor.sh/automations/webhook/…").setValue(this.plugin.settings.mailboxWebhookUrl).onChange(async (v) => {
        this.plugin.settings.mailboxWebhookUrl = normalizeMailboxWebhookUrl(v);
        await this.plugin.saveSettings();
      });
      t.inputEl.setAttribute("autocomplete", "off");
    });
    new Setting(containerEl).setName("Sender key").setDesc("crsr_ 开头；若复制了整段 header，会自动去掉 Bearer").addText((t) => {
      t.setPlaceholder("crsr_…").setValue(this.plugin.settings.mailboxSenderKey).onChange(async (v) => {
        this.plugin.settings.mailboxSenderKey = normalizeMailboxSenderKey(v);
        await this.plugin.saveSettings();
      });
      t.inputEl.type = "password";
      t.inputEl.setAttribute("autocomplete", "off");
    });
    new Setting(containerEl).setName("测试唤醒").setDesc("立刻 POST 一次。200 只表示开始跑，不表示回信写完。").addButton(
      (b) => b.setButtonText("测试").onClick(async () => {
        await this.plugin.testMailboxWake();
      })
    );
  }
};
var MeincHomePlugin = class extends Plugin {
  async onload() {
    await this.loadSettings();
    this.resumeState = null;
    this.mailboxWakeTimer = null;
    this.inboxReadWakeTimer = null;
    this.inboxReadWakePending = null;
    this.mailboxLastHash = "";
    this.timeboxListeners = /* @__PURE__ */ new Set();
    this.timeboxSessions = [];
    this.timeboxSessionSaveTimer = null;
    this.timeboxPendingReconcile = false;
    this.timeboxControlModal = null;
    this.ensureTimeboxDeviceId();
    this.timebox = new TimeboxEngine({
      initialState: this.settings.timebox,
      defaultMin: this.settings.timeboxDefaultMin,
      onChange: (state, reason) => this.handleTimeboxChange(state, reason),
      onComplete: (session) => this.handleTimeboxComplete(session, { reconcile: false }),
      onAbandon: (session) => this.handleTimeboxAbandon(session)
    });
    this.timeboxPendingReconcile = true;
    this.timebox.reconcile();
    this.timeboxPendingReconcile = false;
    this.settings.timebox = this.timebox.snapshot();
    this.compoundToday = emptyCompoundDay();
    this.reviewLedger = null;
    void this.reloadTimeboxSessions();
    void this.reloadCompoundToday();
    this.registerView(VIEW_TYPE_HOME, (leaf) => new HomeView(leaf, this));
    this.addRibbonIcon("home", "打开首页", () => {
      this.activateHome();
    });
    this.addCommand({
      id: "open-home",
      name: "打开首页",
      icon: "home",
      callback: () => this.activateHome()
    });
    this.addCommand({
      id: "start-pause-timebox",
      name: "开始或暂停 Timebox",
      icon: "timer",
      callback: () => this.toggleTimebox()
    });
    this.addCommand({
      id: "abandon-timebox",
      name: "放弃 Timebox",
      callback: () => this.abandonTimebox()
    });
    this.statusBar = this.addStatusBarItem();
    this.statusBar.addClass("meinc-home-timebox-status");
    this.statusBar.addEventListener("click", () => this.handleTimeboxStatusBarClick());
    this.updateTimeboxStatusBar();
    this.registerInterval(window.setInterval(() => this.timebox.tick(), 500));
    this.addCommand({
      id: "back",
      name: "返回上一层",
      icon: "chevron-left",
      callback: () => {
        if (this.folderResume()) this.activateHome({ restore: true });
        else this.activateHome();
      }
    });
    this.addSettingTab(new HomeSettingTab(this.app, this));
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.migrateInboxDone(oldPath, file?.path);
        void this.migrateReviewLedgerPath(oldPath, file?.path);
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.clearInboxDone(file?.path);
      })
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!(file instanceof TFile) || file.path !== MAILBOX_NOTE) return;
        this.scheduleMailboxWake(file);
      })
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (!(file instanceof TFile) || file.path !== MAILBOX_NOTE) return;
        this.scheduleMailboxWake(file);
      })
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!(file instanceof TFile)) return;
        if (!file.path.startsWith(`${TIMEBOX_SESSIONS_DIR}/sessions-`)) return;
        void this.reloadTimeboxSessions();
      })
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (!(file instanceof TFile)) return;
        if (!file.path.startsWith(`${TIMEBOX_SESSIONS_DIR}/sessions-`)) return;
        void this.reloadTimeboxSessions();
      })
    );
    const onCompoundFile = (file, oldPath) => {
      const paths = [file?.path, oldPath].filter(Boolean);
      for (const item of paths) void this.handleCompoundVaultChange(item);
    };
    this.registerEvent(this.app.vault.on("modify", (file) => onCompoundFile(file)));
    this.registerEvent(this.app.vault.on("create", (file) => onCompoundFile(file)));
    this.registerEvent(this.app.vault.on("delete", (file) => onCompoundFile(file)));
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => onCompoundFile(file, oldPath))
    );
    this.dock = new HomeDock(this);
    this.app.workspace.onLayoutReady(async () => {
      await this.primeMailboxHash();
      await this.seedInboxIfNeeded();
      await this.backfillRecentInboxIfNeeded();
      await this.syncInboxDoneMirror();
      await this.ensureReviewLedgerReady();
      this.dock.mount();
      if (!this.settings.openOnStart) return;
      window.setTimeout(() => this.activateHome(), 80);
    });
  }
  onunload() {
    if (this.mailboxWakeTimer) {
      window.clearTimeout(this.mailboxWakeTimer);
      this.mailboxWakeTimer = null;
    }
    if (this.inboxReadWakeTimer) {
      window.clearTimeout(this.inboxReadWakeTimer);
      this.inboxReadWakeTimer = null;
    }
    if (this.timeboxSessionSaveTimer) {
      window.clearTimeout(this.timeboxSessionSaveTimer);
      this.timeboxSessionSaveTimer = null;
    }
    this.inboxReadWakePending = null;
    this.dock?.unmount();
  }
  hasMailboxWebhook() {
    return !mailboxWebhookProblem(
      this.settings.mailboxWebhookUrl,
      this.settings.mailboxSenderKey
    );
  }
  async primeMailboxHash() {
    const file = this.app.vault.getAbstractFileByPath(MAILBOX_NOTE);
    if (!(file instanceof TFile)) return;
    try {
      const text = await this.app.vault.read(file);
      this.mailboxLastHash = mailboxContentHash(text);
    } catch (_) {
    }
  }
  scheduleMailboxWake(file) {
    if (this.mailboxWakeTimer) window.clearTimeout(this.mailboxWakeTimer);
    this.mailboxWakeTimer = window.setTimeout(() => {
      this.mailboxWakeTimer = null;
      this.wakeMailbox(file, { silentIfUnchanged: true });
    }, MAILBOX_WAKE_DEBOUNCE_MS);
  }
  async wakeMailbox(file, opts = {}) {
    if (!(file instanceof TFile)) return false;
    let text = "";
    try {
      text = await this.app.vault.read(file);
    } catch (_) {
      return false;
    }
    const etag = mailboxContentHash(text);
    if (opts.silentIfUnchanged && etag === this.mailboxLastHash) return false;
    this.mailboxLastHash = etag;
    return this.postMailboxWebhook(
      {
        path: MAILBOX_NOTE,
        etag,
        preview: mailboxPreview(text)
      },
      {
        notifyOk: opts.notifyOk,
        notifyProblem: !opts.silentIfUnchanged
      }
    );
  }
  async postMailboxWebhook(body, opts = {}) {
    const url = normalizeMailboxWebhookUrl(this.settings.mailboxWebhookUrl);
    const key = normalizeMailboxSenderKey(this.settings.mailboxSenderKey);
    const problem = mailboxWebhookProblem(url, key);
    if (problem) {
      if (opts.notifyProblem) new Notice(problem);
      return false;
    }
    try {
      const res = await requestUrl({
        url,
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      if (res.status !== 200) {
        new Notice(`唤醒失败：${res.status}`);
        return false;
      }
      if (opts.notifyOk) new Notice("已唤醒 Grokbot");
      return true;
    } catch (err) {
      const status = err && err.status;
      const hint = status ? `唤醒失败：${status}` : "唤醒失败：网络或地址无效";
      new Notice(hint);
      return false;
    }
  }
  scheduleInboxReadWake(stream, path) {
    if (!stream || !WAKE_ON_READ_STREAMS.has(stream.id)) return;
    this.inboxReadWakePending = {
      event: "inbox_read",
      stream: stream.id,
      path
    };
    if (this.inboxReadWakeTimer) window.clearTimeout(this.inboxReadWakeTimer);
    this.inboxReadWakeTimer = window.setTimeout(() => {
      this.inboxReadWakeTimer = null;
      const pending = this.inboxReadWakePending;
      this.inboxReadWakePending = null;
      if (!pending) return;
      this.postMailboxWebhook(pending);
    }, MAILBOX_WAKE_DEBOUNCE_MS);
  }
  async testMailboxWake() {
    const file = this.app.vault.getAbstractFileByPath(MAILBOX_NOTE);
    if (!(file instanceof TFile)) {
      new Notice("找不到 INBOX.md");
      return;
    }
    this.mailboxLastHash = "";
    await this.wakeMailbox(file, { notifyOk: true });
  }
  async appendMailboxMessage({ to, body, notePath }) {
    const block = formatMailboxBlock({ to, body, notePath });
    await this.ensureFolders(MAILBOX_NOTE);
    let file = this.app.vault.getAbstractFileByPath(MAILBOX_NOTE);
    if (!(file instanceof TFile)) {
      const seed = [
        "# Me.Inc ↔ Obsidian 异步信箱",
        "",
        "<!-- 新问题从下面 append -->",
        "",
        block
      ].join("\n");
      await this.app.vault.create(MAILBOX_NOTE, seed);
      return;
    }
    const current = await this.app.vault.read(file);
    const sep = current.endsWith("\n") ? "\n" : "\n\n";
    await this.app.vault.modify(file, current + sep + block);
  }
  async loadSettings() {
    const saved = await this.loadData() || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    this.settings.inboxDone = saved.inboxDone && typeof saved.inboxDone === "object" ? Object.assign({}, saved.inboxDone) : {};
    this.settings.mailboxWebhookUrl = normalizeMailboxWebhookUrl(
      this.settings.mailboxWebhookUrl
    );
    this.settings.mailboxSenderKey = normalizeMailboxSenderKey(
      this.settings.mailboxSenderKey
    );
    this.settings.timeboxDefaultMin = clampTimeboxPresetMinutes(
      this.settings.timeboxDefaultMin || 15
    );
    if (!String(this.settings.timeboxPresetsText || "").trim()) {
      this.settings.timeboxPresetsText = DEFAULT_SETTINGS.timeboxPresetsText;
    }
    this.settings.timeboxRememberLastDuration = this.settings.timeboxRememberLastDuration !== false;
    this.settings.timeboxDailyGoal = Math.max(
      0,
      Math.round(Number(this.settings.timeboxDailyGoal) || 0)
    );
    this.settings.timeboxExtendStepMin = clampTimeboxPresetMinutes(
      this.settings.timeboxExtendStepMin || 5
    );
    this.settings.timeboxStartSoundOn = this.settings.timeboxStartSoundOn !== false;
    if (saved.timeboxEndSoundOn == null && saved.timeboxSoundOn != null) {
      this.settings.timeboxEndSoundOn = saved.timeboxSoundOn !== false;
    } else {
      this.settings.timeboxEndSoundOn = this.settings.timeboxEndSoundOn !== false;
    }
    this.settings.timeboxSoundOn = this.settings.timeboxEndSoundOn;
    if (this.settings.timeboxLastDurationMs != null) {
      this.settings.timeboxLastDurationMs = clampTimeboxDurationMs(
        this.settings.timeboxLastDurationMs
      );
    }
    this.settings.timebox = normalizeTimebox(
      saved.timebox,
      this.settings.timeboxDefaultMin
    );
    if (Object.prototype.hasOwnProperty.call(saved, "timeboxTodos")) {
      delete this.settings.timeboxTodos;
      await this.saveSettings();
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  addTimeboxListener(fn) {
    if (!this.timeboxListeners) this.timeboxListeners = /* @__PURE__ */ new Set();
    this.timeboxListeners.add(fn);
  }
  removeTimeboxListener(fn) {
    this.timeboxListeners?.delete(fn);
  }
  notifyTimebox(reason) {
    for (const fn of this.timeboxListeners || []) {
      try {
        fn(reason);
      } catch (_) {
      }
    }
  }
  handleTimeboxChange(state, reason) {
    this.settings.timebox = state;
    this.updateTimeboxStatusBar();
    this.notifyTimebox(reason);
    if (reason !== "tick") void this.saveSettings();
  }
  handleTimeboxComplete(session, opts = {}) {
    const payload = normalizeTimeboxSession(session);
    if (!payload) return;
    payload.deviceId = this.ensureTimeboxDeviceId();
    if (this.timeboxPendingReconcile || opts.reconcile) {
      this.appendTimeboxSession(payload);
      void this.flushTimeboxSessions();
      return;
    }
    this.settings.timeboxLastDurationMs = payload.plannedMs;
    void this.saveSettings();
    if (this.settings.timeboxEndSoundOn !== false) this.playTimeboxChime();
    this.timeboxControlModal?.close();
    this.timeboxControlModal = null;
    new TimeboxDoneModal(this.app, this, payload).open();
  }
  handleTimeboxAbandon(session) {
    const payload = normalizeTimeboxSession(session);
    if (!payload) return;
    if (payload.focusedMs < TIMEBOX_ABANDON_MIN_MS) return;
    payload.deviceId = this.ensureTimeboxDeviceId();
    this.appendTimeboxSession(payload);
    void this.flushTimeboxSessions();
    this.timeboxControlModal?.close();
    this.timeboxControlModal = null;
  }
  ensureTimeboxDeviceId() {
    if (!this.settings.timeboxDeviceId) {
      this.settings.timeboxDeviceId = timeboxSessionId();
      void this.saveSettings();
    }
    return this.settings.timeboxDeviceId;
  }
  timeboxSessionsFilePath() {
    return `${TIMEBOX_SESSIONS_DIR}/sessions-${this.ensureTimeboxDeviceId()}.json`;
  }
  async ensureTimeboxSessionsFolder() {
    const parts = TIMEBOX_SESSIONS_DIR.split("/");
    let path = "";
    for (const part of parts) {
      path = path ? `${path}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(path)) {
        await this.app.vault.createFolder(path);
      }
    }
  }
  getTimeboxPresetMinutes() {
    return parseTimeboxPresetMinutes(this.settings.timeboxPresetsText);
  }
  resolveTimeboxStartMinutes(durationMs) {
    if (durationMs) {
      return clampTimeboxPresetMinutes(Math.round(Number(durationMs) / 6e4));
    }
    if (this.settings.timeboxRememberLastDuration !== false && this.settings.timeboxLastDurationMs) {
      return clampTimeboxPresetMinutes(
        Math.round(this.settings.timeboxLastDurationMs / 6e4)
      );
    }
    return clampTimeboxPresetMinutes(this.settings.timeboxDefaultMin || 15);
  }
  getTimeboxStats(extraSessions = []) {
    return summarizeTimeboxStats(
      mergeTimeboxSessions(this.timeboxSessions, extraSessions),
      Date.now(),
      { goal: this.settings.timeboxDailyGoal || 0 }
    );
  }
  async reloadTimeboxSessions() {
    const folder = this.app.vault.getAbstractFileByPath(TIMEBOX_SESSIONS_DIR);
    if (!(folder instanceof TFolder)) {
      this.timeboxSessions = [];
      this.notifyTimebox("sessions");
      return;
    }
    const lists = [];
    for (const child of folder.children) {
      if (!(child instanceof TFile)) continue;
      if (!child.name.startsWith("sessions-") || !child.name.endsWith(".json")) {
        continue;
      }
      try {
        const raw = JSON.parse(await this.app.vault.read(child));
        if (Array.isArray(raw)) lists.push(raw);
      } catch (_) {
      }
    }
    this.timeboxSessions = pruneTimeboxSessions(mergeTimeboxSessions(...lists));
    this.notifyTimebox("sessions");
  }
  appendTimeboxSession(session) {
    const normalized = normalizeTimeboxSession(session);
    if (!normalized) return;
    this.timeboxSessions = pruneTimeboxSessions(
      mergeTimeboxSessions(this.timeboxSessions, [normalized])
    );
  }
  scheduleTimeboxSessionSave() {
    if (this.timeboxSessionSaveTimer) {
      window.clearTimeout(this.timeboxSessionSaveTimer);
    }
    this.timeboxSessionSaveTimer = window.setTimeout(() => {
      this.timeboxSessionSaveTimer = null;
      void this.flushTimeboxSessions();
    }, TIMEBOX_SESSION_SAVE_DEBOUNCE_MS);
  }
  async flushTimeboxSessions() {
    await this.ensureTimeboxSessionsFolder();
    const deviceId = this.ensureTimeboxDeviceId();
    const mine = this.timeboxSessions.filter(
      (session) => !session.deviceId || session.deviceId === deviceId
    );
    const path = this.timeboxSessionsFilePath();
    const payload = JSON.stringify(
      pruneTimeboxSessions(mine).map((session) => ({
        ...session,
        deviceId
      })),
      null,
      2
    );
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      await this.app.vault.create(path, payload);
      return;
    }
    if (file instanceof TFile) await this.app.vault.modify(file, payload);
  }
  finalizeTimeboxSession(session) {
    const payload = normalizeTimeboxSession(session);
    if (!payload) return;
    payload.deviceId = this.ensureTimeboxDeviceId();
    this.appendTimeboxSession(payload);
    this.scheduleTimeboxSessionSave();
    this.notifyTimebox("sessions");
  }
  openTimeboxStart(opts = {}) {
    if ((this.timebox?.state.status || "idle") !== "idle") {
      new Notice("先停掉当前这块");
      return;
    }
    new TimeboxStartModal(this.app, this, opts).open();
  }
  openTimeboxControl() {
    const status = this.timebox?.state.status || "idle";
    if (status === "idle") {
      this.openTimeboxStart();
      return;
    }
    this.timeboxControlModal?.close();
    this.timeboxControlModal = new TimeboxControlModal(this.app, this);
    this.timeboxControlModal.open();
  }
  handleTimeboxStatusBarClick() {
    const status = this.timebox?.state.status || "idle";
    if (status === "idle") {
      void this.activateHome();
      return;
    }
    this.openTimeboxControl();
  }
  isCompoundNotePath(filePath) {
    return typeof filePath === "string" && filePath.startsWith(`${COMPOUND_DIR}/`) && filePath.endsWith(".md");
  }
  refreshCompoundViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_HOME)) {
      if (leaf.view instanceof HomeView) leaf.view.refreshCompoundChip();
    }
  }
  async reloadCompoundToday() {
    const today = compoundDayKeyFromTime(Date.now());
    const path = compoundWeekPath(today);
    const file = this.app.vault.getAbstractFileByPath(path);
    let day = emptyCompoundDay();
    if (file instanceof TFile) {
      try {
        const parsed = parseCompoundWeek(await this.app.vault.read(file));
        day = normalizeCompoundDay(parsed.days[today]);
      } catch (_) {
      }
    }
    this.compoundToday = day;
    this.refreshCompoundViews();
  }
  async handleCompoundVaultChange(filePath) {
    if (!this.isCompoundNotePath(filePath)) return;
    await this.reloadCompoundToday();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_HOME)) {
      const view = leaf.view;
      if (!(view instanceof HomeView)) continue;
      const editor = view.compoundEditor;
      if (view.current().type !== "compound" || !editor || editor.writing || view.compoundDirty()) {
        continue;
      }
      const weekPath = compoundWeekPath(editor.weekStart);
      const yesterdayPath = compoundWeekPath(addCompoundDays(editor.today, -1));
      if (filePath !== weekPath && filePath !== yesterdayPath) continue;
      await view.loadCompoundEditor(editor.dayKey);
      if (view.current().type === "compound") view.render();
    }
  }
  async saveCompoundDay(dayKey, entry) {
    const weekStart = compoundWeekStart(dayKey);
    const path = compoundWeekPath(weekStart);
    if (!weekStart || !path) throw new Error("bad compound day");
    await this.ensureFolders(path);
    let file = this.app.vault.getAbstractFileByPath(path);
    let existing = "";
    if (file instanceof TFile) existing = await this.app.vault.read(file);
    if (file instanceof TFile && existing.trim() && !isCompoundWeekNote(existing)) {
      new Notice("这周的笔记不是复利格式，没有覆盖");
      return { path, deleted: false, skipped: true };
    }
    const parsed = parseCompoundWeek(existing);
    const days = mergeCompoundDay(parsed.days, dayKey, entry);
    const payload = renderCompoundWeek(weekStart, days);
    const kept = parseCompoundWeek(payload).days;
    if (!Object.keys(kept).length) {
      if (file instanceof TFile && isCompoundWeekNote(existing)) {
        if (typeof this.app.vault.trash === "function") await this.app.vault.trash(file);
        else await this.app.vault.delete(file);
      }
      if (dayKey === compoundDayKeyFromTime(Date.now())) {
        this.compoundToday = emptyCompoundDay();
        this.refreshCompoundViews();
      }
      return { path, deleted: true, days: {} };
    }
    if (!(file instanceof TFile)) {
      try {
        await this.app.vault.create(path, payload);
      } catch (_) {
        file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) throw new Error("create compound week failed");
        await this.app.vault.modify(file, payload);
      }
    } else if (existing !== payload) {
      await this.app.vault.modify(file, payload);
    }
    if (dayKey === compoundDayKeyFromTime(Date.now())) {
      this.compoundToday = normalizeCompoundDay(entry);
      this.refreshCompoundViews();
    }
    return { path, deleted: false, days: kept };
  }
  playTimeboxStartSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.value = 392;
      gain.gain.setValueAtTime(1e-4, start);
      gain.gain.exponentialRampToValueAtTime(0.06, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(1e-4, start + 0.18);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.2);
      window.setTimeout(() => context.close(), 400);
    } catch (_) {
    }
  }
  playTimeboxChime() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = new AudioContext();
      const notes = [523.25, 659.25];
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + index * 0.16;
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(1e-4, start);
        gain.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(1e-4, start + 0.42);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.44);
      });
      window.setTimeout(() => context.close(), 1e3);
    } catch (_) {
    }
  }
  updateTimeboxStatusBar() {
    if (!this.statusBar || !this.timebox) return;
    const text = formatTimeboxStatusBar(this.timebox.state);
    this.statusBar.textContent = text;
    this.statusBar.style.display = text ? "" : "none";
    this.statusBar.setAttribute("aria-label", text || "Timebox");
  }
  startTimebox(title, durationMs) {
    const source = this.pendingTimeboxSource || "";
    this.pendingTimeboxSource = "";
    const ok = this.timebox.start(title, durationMs, source);
    if (!ok) return false;
    this.settings.timeboxLastDurationMs = clampTimeboxDurationMs(durationMs);
    if (this.settings.timeboxStartSoundOn !== false) this.playTimeboxStartSound();
    void this.saveSettings();
    return true;
  }
  extendTimebox(ms) {
    return this.timebox.extend(ms);
  }
  finishTimeboxEarly() {
    return this.timebox.finishEarly();
  }
  pauseTimebox() {
    return this.timebox.pause();
  }
  resumeTimebox() {
    return this.timebox.resume();
  }
  abandonTimebox() {
    if (!this.timebox.abandon()) {
      new Notice("现在没有进行中的 Timebox");
      return false;
    }
    return true;
  }
  async toggleTimebox() {
    const status = this.timebox?.state.status || "idle";
    if (status === "running" || status === "paused") {
      this.openTimeboxControl();
      return;
    }
    this.openTimeboxStart();
  }
  newestInboxPaths(items, n) {
    return new Set(items.slice(-n).map((item) => item.file.path));
  }
  async seedInboxIfNeeded() {
    if (this.settings.inboxSeeded) return;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const items = this.listInboxItems({ includeDone: true });
    const keepUnread = this.newestInboxPaths(items, INBOX_SEED_KEEP_UNREAD);
    for (const item of items) {
      if (keepUnread.has(item.file.path)) continue;
      if (!this.settings.inboxDone[item.file.path]) {
        this.settings.inboxDone[item.file.path] = now;
      }
    }
    this.settings.inboxSeeded = true;
    this.settings.inboxBackfillRecent = true;
    await this.saveSettings();
    await this.syncInboxDoneMirror();
  }
  async backfillRecentInboxIfNeeded() {
    if (this.settings.inboxBackfillRecent) return;
    const items = this.listInboxItems({ includeDone: true });
    for (const path of this.newestInboxPaths(items, INBOX_SEED_KEEP_UNREAD)) {
      delete this.settings.inboxDone[path];
    }
    this.settings.inboxBackfillRecent = true;
    await this.saveSettings();
    await this.syncInboxDoneMirror();
  }
  listInboxItems(opts = {}) {
    const includeDone = !!opts.includeDone;
    const items = [];
    for (const stream of INBOX_STREAMS) {
      const folder = this.app.vault.getAbstractFileByPath(stream.folder);
      if (!(folder instanceof TFolder)) continue;
      for (const child of folder.children) {
        if (!(child instanceof TFile) || !NOTE_EXT.has(child.extension)) continue;
        if (isHiddenName(child.name)) continue;
        if (!inboxStreamAccepts(stream, child)) continue;
        const done = !!this.settings.inboxDone[child.path];
        if (!includeDone && done) continue;
        const date = inboxDateFromFile(this.app, child);
        items.push({
          file: child,
          stream,
          date,
          done,
          title: inboxTitle(child, date)
        });
      }
    }
    items.sort((a, b) => {
      if (a.date && b.date && a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.date && !b.date) return -1;
      if (!a.date && b.date) return 1;
      return displayName(a.file).localeCompare(displayName(b.file), "zh-CN");
    });
    return items;
  }
  inboxMeta() {
    const n = this.listInboxItems().length;
    return n > 0 ? `${n} 则未读` : "";
  }
  reviewHubCounts(now = Date.now()) {
    const lexideck = this.app.plugins?.plugins?.lexideck;
    const english = buildLexiQueueItems(lexideck, now).length;
    const ledger = this.reviewLedger || normalizeLedger({});
    const chinese = listDueProseEntries(ledger, now).length;
    return { english, chinese };
  }
  reviewMeta() {
    const now = Date.now();
    const { english, chinese } = this.reviewHubCounts(now);
    const lexideck = this.app.plugins?.plugins?.lexideck;
    const streak = lexideck && typeof lexideck.getDueCount === "function" ? lexideck.getDueCount(now).streak : 0;
    const parts = [];
    if (english > 0) parts.push(`英 ${english}`);
    if (chinese > 0) parts.push(`语 ${chinese}`);
    if (!parts.length) {
      if (streak > 0) return `已刷完 · 🔥${streak}`;
      return "";
    }
    let line = parts.join(" · ");
    if (streak > 0) line += ` · 🔥${streak}`;
    return line;
  }
  async loadReviewLedger() {
    let raw = {};
    const file = this.app.vault.getAbstractFileByPath(REVIEW_LEDGER_PATH);
    if (file instanceof TFile) {
      try {
        raw = JSON.parse(await this.app.vault.read(file));
      } catch (_) {
      }
    }
    this.reviewLedger = normalizeLedger(raw);
  }
  async saveReviewLedger() {
    if (!this.reviewLedger) this.reviewLedger = normalizeLedger({});
    const payload = `${JSON.stringify(this.reviewLedger, null, 2)}
`;
    await this.ensureFolders(REVIEW_LEDGER_PATH);
    let file = this.app.vault.getAbstractFileByPath(REVIEW_LEDGER_PATH);
    if (!(file instanceof TFile)) {
      await this.app.vault.create(REVIEW_LEDGER_PATH, payload);
      return;
    }
    await this.app.vault.modify(file, payload);
  }
  listHonglouPushPaths() {
    const folder = this.app.vault.getAbstractFileByPath(HONGLOU_PUSH_FOLDER);
    if (!(folder instanceof TFolder)) return [];
    const paths = [];
    for (const child of folder.children) {
      if (!(child instanceof TFile) || child.extension !== "md") continue;
      if (isHiddenName(child.name)) continue;
      paths.push(child.path);
    }
    return paths.sort();
  }
  listLibraryArticlePaths() {
    const root = this.app.vault.getAbstractFileByPath(LIBRARY_ROOT);
    if (!(root instanceof TFolder)) return [];
    const out = [];
    const walk = (folder) => {
      for (const child of folder.children) {
        if (isHiddenName(child.name)) continue;
        if (child instanceof TFolder) {
          const top = child.path.slice(LIBRARY_ROOT.length + 1).split("/")[0];
          if (LIBRARY_EXCLUDE_DIRS.has(top) || LIBRARY_EXCLUDE_DIRS.has(child.name)) {
            continue;
          }
          walk(child);
        } else if (child instanceof TFile && child.extension === "md") {
          if (isLibraryArticlePath(child.path)) out.push(child.path);
        }
      }
    };
    walk(root);
    return out.sort((a, b) => a.localeCompare(b, "zh-CN"));
  }
  buildDueProseItems(now = Date.now(), opts = {}) {
    const ledger = this.reviewLedger || normalizeLedger({});
    const picked = opts.allDue ? listDueProseEntries(ledger, now) : pickDueProse(ledger, now);
    return picked.map((item) => {
      const file = this.app.vault.getAbstractFileByPath(item.path);
      const title = file instanceof TFile ? displayName(file) : item.path;
      const source = item.kind === "honglou" ? "红楼梦" : libraryArticleCategory(item.path);
      return {
        type: "prose",
        path: item.path,
        kind: item.kind,
        title,
        source
      };
    });
  }
  async buildEnglishReviewSession() {
    const now = Date.now();
    const lexideck = this.app.plugins?.plugins?.lexideck;
    const queue = buildLexiQueueItems(lexideck, now);
    return { track: "english", queue, index: 0, flipped: false };
  }
  async buildChineseReviewSession() {
    await this.ensureReviewLedgerReady();
    const now = Date.now();
    const queue = this.buildDueProseItems(now, { allDue: true });
    return { track: "chinese", queue, index: 0, flipped: false };
  }
  async ensureReviewLedgerReady() {
    if (!this.reviewLedger) await this.loadReviewLedger();
    if (this.reviewLedger.staggered) return;
    const paths = this.listHonglouPushPaths();
    const backfill = staggerHonglouBackfill(
      this.settings.inboxDone,
      paths,
      Date.now()
    );
    for (const [path, entry] of Object.entries(backfill)) {
      if (!this.reviewLedger.entries[path]) {
        this.reviewLedger.entries[path] = entry;
      }
    }
    this.reviewLedger.staggered = true;
    await this.saveReviewLedger();
  }
  async registerHonglouRead(path, now = Date.now()) {
    if (!path) return;
    await this.ensureReviewLedgerReady();
    this.reviewLedger.entries[path] = ledgerEntryForHonglouRead(now);
    await this.saveReviewLedger();
  }
  async gradeReviewProse(path, rating) {
    if (!path) return;
    await this.ensureReviewLedgerReady();
    const prev = this.reviewLedger.entries[path] || normalizeLedgerEntry({ kind: "article" }, path);
    this.reviewLedger.entries[path] = {
      ...prev,
      kind: prev.kind,
      due: proseDueAfterGrade(rating, Date.now()),
      addedAt: prev.addedAt || Date.now()
    };
    await this.saveReviewLedger();
  }
  async addArticleToReview(path) {
    if (!path || !isLibraryArticlePath(path)) return;
    await this.ensureReviewLedgerReady();
    this.reviewLedger.entries[path] = ledgerEntryForArticle(path);
    await this.saveReviewLedger();
  }
  async migrateReviewLedgerPath(oldPath, newPath) {
    if (!oldPath || !newPath || oldPath === newPath) return;
    if (!this.reviewLedger) await this.loadReviewLedger();
    if (!this.reviewLedger.entries[oldPath]) return;
    this.reviewLedger.entries[newPath] = this.reviewLedger.entries[oldPath];
    delete this.reviewLedger.entries[oldPath];
    await this.saveReviewLedger();
  }
  async markInboxRead(file) {
    if (!(file instanceof TFile)) return;
    const now = /* @__PURE__ */ new Date();
    this.settings.inboxDone[file.path] = now.toISOString();
    await this.saveSettings();
    await this.syncInboxDoneMirror();
    const stream = inboxStreamForFile(file);
    if (stream?.id === "honglou") {
      await this.registerHonglouRead(file.path, now.getTime());
    }
    await this.appendInboxAck(file, stream, now);
    this.scheduleInboxReadWake(stream, file.path);
  }
  async migrateInboxDone(oldPath, newPath) {
    if (!oldPath || !newPath || oldPath === newPath) return;
    if (!this.settings.inboxDone[oldPath]) return;
    this.settings.inboxDone[newPath] = this.settings.inboxDone[oldPath];
    delete this.settings.inboxDone[oldPath];
    await this.saveSettings();
    await this.syncInboxDoneMirror();
  }
  async clearInboxDone(filePath) {
    if (!filePath || !this.settings.inboxDone[filePath]) return;
    delete this.settings.inboxDone[filePath];
    await this.saveSettings();
    await this.syncInboxDoneMirror();
  }
  async syncInboxDoneMirror() {
    try {
      const payload = `${JSON.stringify(this.settings.inboxDone || {}, null, 2)}
`;
      await this.ensureFolders(MAILBOX_INBOX_DONE);
      let file = this.app.vault.getAbstractFileByPath(MAILBOX_INBOX_DONE);
      if (!(file instanceof TFile)) {
        await this.app.vault.create(MAILBOX_INBOX_DONE, payload);
        return;
      }
      await this.app.vault.modify(file, payload);
    } catch (_) {
    }
  }
  async appendInboxAck(file, stream, now) {
    if (!(file instanceof TFile)) return;
    const line = formatInboxAckLine({
      stream,
      path: file.path,
      now: now || /* @__PURE__ */ new Date()
    });
    try {
      await this.ensureFolders(MAILBOX_ACK);
      let ack = this.app.vault.getAbstractFileByPath(MAILBOX_ACK);
      if (!(ack instanceof TFile)) {
        await this.app.vault.create(
          MAILBOX_ACK,
          ["# AI 信箱已读", "", line, ""].join("\n")
        );
        return;
      }
      const current = await this.app.vault.read(ack);
      const sep = current.endsWith("\n") ? "" : "\n";
      await this.app.vault.modify(ack, `${current}${sep}${line}
`);
    } catch (_) {
    }
  }
  folderResume() {
    const nav = this.resumeState?.nav;
    if (!nav || nav.length < 2) return null;
    const last = nav[nav.length - 1];
    return {
      title: last.title || last.path || "返回",
      nav
    };
  }
  captureResumeFromHome() {
    const home = this.app.workspace.getActiveViewOfType(HomeView);
    if (!home || !Array.isArray(home.nav)) {
      return;
    }
    this.resumeState = { nav: cloneNav(home.nav) };
  }
  async activateHome(opts = {}) {
    const restore = !!(opts.restore && this.folderResume());
    const saved = restore ? cloneNav(this.resumeState.nav) : null;
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_HOME)[0];
    if (!leaf) {
      leaf = workspace.getLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE_HOME, active: true });
    }
    if (leaf.view instanceof HomeView) {
      if (saved) {
        leaf.view.nav = saved;
        leaf.view.render();
      } else {
        const ok = await leaf.view.resetToHome();
        if (ok === false) {
          workspace.revealLeaf(leaf);
          this.dock?.sync();
          return;
        }
      }
    }
    this.resumeState = null;
    workspace.revealLeaf(leaf);
    this.dock?.sync();
  }
  openLexiDeck() {
    const ok = this.app.commands.executeCommandById("lexideck:open-library");
    if (!ok) new Notice("还没有启用 LexiDeck");
  }
  openAgent() {
    const plugin = this.app.plugins?.plugins?.["obsidian-agent-os"];
    if (plugin && typeof plugin.activateView === "function") {
      void plugin.activateView();
      return;
    }
    const ok = this.app.commands.executeCommandById(
      "obsidian-agent-os:obsidian-agent-os-open"
    );
    if (!ok) new Notice("还没有启用 Obsidian Agent OS");
  }
  async openFile(file, mode) {
    if (!(file instanceof TFile)) return;
    this.captureResumeFromHome();
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState(
      {
        type: "markdown",
        state: {
          file: file.path,
          mode: mode || "source",
          source: false
        },
        active: true
      },
      { history: true }
    );
    this.app.workspace.revealLeaf(leaf);
    this.dock?.sync();
  }
  async openToday() {
    const ids = [
      "daily-notes:goto-today",
      "daily-notes:open-todays-daily-note"
    ];
    for (const id of ids) {
      if (this.app.commands.executeCommandById(id)) return;
    }
    await this.openTodayFallback();
  }
  async openTodayFallback() {
    const plugin = this.app.internalPlugins?.plugins?.["daily-notes"];
    const opts = plugin?.instance?.options || {};
    const folder = String(opts.folder || "手记/日记").replace(/\/$/, "");
    const format = opts.format || "YYYY/MM-MMMM/YYYY-MM-DD";
    const moment = window.moment;
    if (!moment) {
      new Notice("无法打开今日日记");
      return;
    }
    const path = `${folder}/${moment().format(format)}.md`;
    await this.ensureFolders(path);
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      try {
        file = await this.app.vault.create(path, "");
      } catch (err) {
        file = this.app.vault.getAbstractFileByPath(path);
        if (!file) {
          new Notice("无法创建今日日记");
          return;
        }
      }
    }
    if (file instanceof TFile) await this.openFile(file);
  }
  async ensureFolders(filePath) {
    const parts = filePath.split("/");
    parts.pop();
    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      if (this.app.vault.getAbstractFileByPath(acc)) continue;
      try {
        await this.app.vault.createFolder(acc);
      } catch (_) {
      }
    }
  }
};
require_activity_ui().install(HomeView, MeincHomePlugin);
module.exports = MeincHomePlugin;
