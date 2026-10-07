const assert = require("node:assert/strict");
const {
  TIMEBOX_PRESETS,
  TimeboxEngine,
  barFillRatio,
  buildHistoryBars,
  formatFocusDuration,
  formatRemaining,
  formatTimeboxStatusBar,
  mergeSessions,
  minutesOnDay,
  normalizeSession,
  normalizeTimebox,
  parseTimeboxPresetMinutes,
  pruneSessions,
  rememberTitle,
  resolveHistoryRange,
  segmentsFromIntervals,
  summarizeTimeboxStats,
} = require("./timebox.js");

function makeEngine(overrides = {}) {
  let now = 1_000_000;
  const completed = [];
  const abandoned = [];
  const engine = new TimeboxEngine({
    defaultMin: 30,
    initialState: overrides.initialState,
    now: () => now,
    onComplete: (session) => completed.push(session),
    onAbandon: (session) => abandoned.push(session),
  });
  return {
    engine,
    completed,
    abandoned,
    advance(milliseconds) {
      now += milliseconds;
      return engine.tick();
    },
    setNow(value) {
      now = value;
    },
    now: () => now,
  };
}

assert.deepEqual(TIMEBOX_PRESETS, [5, 10, 15, 25, 45]);
assert.deepEqual(parseTimeboxPresetMinutes("10, 5, 10, 200"), [5, 10, 180]);
assert.equal(formatRemaining(0), "00:00");
assert.equal(formatRemaining(1000), "00:01");
assert.equal(formatRemaining(25 * 60_000), "25:00");
assert.equal(formatTimeboxStatusBar({ status: "idle" }), "");
assert.equal(
  formatTimeboxStatusBar({
    status: "running",
    title: "数学",
    remainingMs: 12 * 60_000 + 34_000,
  }),
  "12:34 · 数学"
);
assert.equal(
  formatTimeboxStatusBar({ status: "paused", title: "数学" }),
  "暂停 · 数学"
);

assert.deepEqual(rememberTitle(["数学", "英语"], "物理"), [
  "物理",
  "数学",
  "英语",
]);
assert.deepEqual(rememberTitle(["数学", "英语"], "数学"), ["数学", "英语"]);

const cleaned = normalizeTimebox(
  { status: "running", title: "  ", remainingMs: -3 },
  30
);
assert.equal(cleaned.status, "idle");
assert.equal(cleaned.remainingMs, 30 * 60_000);

const idleStart = makeEngine();
assert.equal(idleStart.engine.start("   "), false);
assert.equal(idleStart.engine.start("数学", 25 * 60_000), true);
assert.equal(idleStart.engine.state.status, "running");
assert.equal(idleStart.engine.state.title, "数学");
assert.equal(idleStart.engine.state.durationMs, 25 * 60_000);
assert.deepEqual(idleStart.engine.state.recentTitles, ["数学"]);

idleStart.advance(5 * 60_000);
assert.equal(idleStart.engine.state.remainingMs, 20 * 60_000);
assert.equal(idleStart.engine.pause(), true);
idleStart.advance(10 * 60_000);
assert.equal(idleStart.engine.state.status, "paused");
assert.equal(idleStart.engine.state.remainingMs, 20 * 60_000);
assert.equal(idleStart.engine.resume(), true);
idleStart.advance(20 * 60_000);
assert.equal(idleStart.completed.length, 1);
assert.equal(idleStart.completed[0].title, "数学");
assert.equal(idleStart.completed[0].outcome, "completed");
assert.equal(idleStart.engine.state.status, "idle");
assert.equal(idleStart.engine.state.title, "");
assert.deepEqual(idleStart.engine.state.recentTitles, ["数学"]);

const abandon = makeEngine();
abandon.engine.start("英语", 15 * 60_000);
abandon.advance(3 * 60_000);
assert.equal(abandon.engine.abandon(), true);
assert.equal(abandon.abandoned.length, 1);
assert.equal(abandon.abandoned[0].outcome, "abandoned");
assert.equal(abandon.engine.state.status, "idle");

const extend = makeEngine();
extend.engine.start("地理", 10 * 60_000);
assert.equal(extend.engine.extend(5 * 60_000), true);
assert.equal(extend.engine.state.durationMs, 15 * 60_000);
assert.equal(extend.engine.state.remainingMs, 15 * 60_000);

const early = makeEngine();
early.engine.start("语文", 20 * 60_000);
early.advance(8 * 60_000);
assert.equal(early.engine.finishEarly(), true);
assert.equal(early.completed.length, 1);
assert.equal(early.completed[0].outcome, "early");
assert.equal(early.completed[0].focusedMs, 8 * 60_000);

const expired = makeEngine({
  initialState: {
    status: "running",
    title: "物理",
    durationMs: 30 * 60_000,
    startedAt: 1_000_000,
    endsAt: 1_000_000 + 30 * 60_000,
    remainingMs: 30 * 60_000,
    recentTitles: ["物理"],
  },
});
expired.setNow(1_000_000 + 31 * 60_000);
assert.equal(expired.engine.reconcile(), true);
assert.equal(expired.completed.length, 1);
assert.equal(expired.engine.state.status, "idle");

const midRun = makeEngine({
  initialState: {
    status: "running",
    title: "化学",
    durationMs: 30 * 60_000,
    startedAt: 1_000_000,
    endsAt: 1_000_000 + 30 * 60_000,
    remainingMs: 30 * 60_000,
    recentTitles: ["化学"],
  },
});
midRun.setNow(1_000_000 + 10 * 60_000);
assert.equal(midRun.engine.reconcile(), false);
assert.equal(midRun.engine.state.status, "running");
assert.equal(midRun.engine.state.remainingMs, 20 * 60_000);

assert.equal(normalizeSession({ title: "x" }), null);
const merged = mergeSessions(
  [{ id: "a", title: "数学", startedAt: 1, endedAt: 2, plannedMs: 60_000, focusedMs: 60_000, outcome: "completed" }],
  [{ id: "a", title: "数学", startedAt: 1, endedAt: 3, plannedMs: 60_000, focusedMs: 60_000, outcome: "completed", note: "ok" }]
);
assert.equal(merged.length, 1);
assert.equal(merged[0].note, "ok");

const now = new Date("2026-09-26T15:00:00").getTime();
const stats = summarizeTimeboxStats(
  [
    {
      id: "1",
      title: "数学",
      startedAt: now - 20 * 60_000,
      endedAt: now - 5 * 60_000,
      plannedMs: 15 * 60_000,
      focusedMs: 15 * 60_000,
      outcome: "completed",
    },
  ],
  now,
  { goal: 4 }
);
assert.equal(stats.todayBlocks, 1);
assert.equal(stats.goalDots, 1);

assert.equal(formatFocusDuration(153), "2 小时 33 分");
assert.equal(formatFocusDuration(60), "1 小时");
assert.equal(formatFocusDuration(45), "45 分");

const thursday = new Date("2026-10-01T12:00:00").getTime();
const weekStats = summarizeTimeboxStats(
  [
    {
      id: "w1",
      title: "书稿撰写（化学）",
      startedAt: new Date("2026-09-30T17:00:00").getTime(),
      endedAt: new Date("2026-09-30T17:30:00").getTime(),
      plannedMs: 30 * 60_000,
      focusedMs: 30 * 60_000,
      outcome: "completed",
    },
    {
      id: "w2",
      title: "作业",
      startedAt: new Date("2026-10-01T10:00:00").getTime(),
      endedAt: new Date("2026-10-01T10:58:00").getTime(),
      plannedMs: 60 * 60_000,
      focusedMs: 58 * 60_000,
      outcome: "early",
    },
    {
      id: "w3",
      title: "化学",
      startedAt: new Date("2026-10-01T11:00:00").getTime(),
      endedAt: new Date("2026-10-01T11:16:00").getTime(),
      plannedMs: 20 * 60_000,
      focusedMs: 16 * 60_000,
      outcome: "completed",
    },
    {
      id: "w4",
      title: "化学",
      startedAt: new Date("2026-10-01T14:00:00").getTime(),
      endedAt: new Date("2026-10-01T14:16:00").getTime(),
      plannedMs: 20 * 60_000,
      focusedMs: 16 * 60_000,
      outcome: "completed",
    },
    {
      id: "w5",
      title: "摸鱼",
      startedAt: new Date("2026-09-25T10:00:00").getTime(),
      endedAt: new Date("2026-09-25T11:00:00").getTime(),
      plannedMs: 60 * 60_000,
      focusedMs: 10 * 60_000,
      outcome: "abandoned",
    },
  ],
  thursday,
  { goal: 4 }
);
assert.equal(weekStats.weekRangeLabel, "9/28 – 10/4");
assert.equal(weekStats.weekFocusLabel, "2 小时");
assert.equal(weekStats.weekMinutes, 120);
assert.equal(weekStats.todayBlocks, 3);
assert.equal(weekStats.todayLabel, "今天 1 小时 30 分 · 3/4");
assert.equal(weekStats.topTitles[0].title, "作业");
assert.equal(weekStats.topTitles[0].minutes, 58);
assert.equal(weekStats.topTitles[1].title, "化学");
assert.equal(weekStats.topTitles[1].minutes, 32);
const thuBar = weekStats.weekBars.find((bar) => bar.isToday);
assert.equal(thuBar.minutes, 90);
assert.equal(thuBar.blocks, 3);
const sunBar = weekStats.weekBars[6];
assert.equal(sunBar.isFuture, true);
assert.equal(sunBar.minutes, 0);
assert.equal(weekStats.weekBars[2].minutes, 30);

const oldSession = {
  id: "old",
  title: "旧记录",
  startedAt: new Date(2026, 9, 3, 23, 30).getTime(),
  endedAt: new Date(2026, 9, 4, 0, 30).getTime(),
  plannedMs: 60 * 60_000,
  focusedMs: 60 * 60_000,
  outcome: "completed",
};
assert.equal(minutesOnDay([oldSession], "2026-10-04"), 60);
assert.equal(minutesOnDay([oldSession], "2026-10-03"), 0);

const split = segmentsFromIntervals([
  {
    start: new Date(2026, 9, 3, 23, 30).getTime(),
    end: new Date(2026, 9, 4, 0, 30).getTime(),
  },
]);
assert.equal(split.find((part) => part.dayKey === "2026-10-03").focusedMs, 30 * 60_000);
assert.equal(split.find((part) => part.dayKey === "2026-10-04").focusedMs, 30 * 60_000);

const midnight = makeEngine();
midnight.setNow(new Date(2026, 9, 3, 23, 50).getTime());
assert.equal(midnight.engine.start("跨夜", 40 * 60_000), true);
midnight.setNow(new Date(2026, 9, 4, 0, 30).getTime());
assert.equal(midnight.engine.finishEarly(), true);
const parts = midnight.completed[0].segments;
assert.equal(parts.find((part) => part.dayKey === "2026-10-03").focusedMs, 10 * 60_000);
assert.equal(parts.find((part) => part.dayKey === "2026-10-04").focusedMs, 30 * 60_000);

const paused = makeEngine();
paused.engine.start("暂停", 30 * 60_000);
paused.advance(10 * 60_000);
paused.engine.pause();
paused.advance(60 * 60_000);
paused.engine.finishEarly();
assert.equal(paused.completed[0].focusedMs, 10 * 60_000);

const abandonedToday = summarizeTimeboxStats(
  [
    {
      id: "ab",
      title: "中止",
      startedAt: thursday - 20 * 60_000,
      endedAt: thursday - 5 * 60_000,
      plannedMs: 20 * 60_000,
      focusedMs: 15 * 60_000,
      outcome: "abandoned",
    },
  ],
  thursday
);
assert.equal(abandonedToday.todayBlocks, 0);
assert.equal(abandonedToday.todayMinutes, 15);

const kept = pruneSessions([
  {
    id: "ancient",
    title: "很早",
    startedAt: new Date(2024, 0, 1).getTime(),
    endedAt: new Date(2024, 0, 1, 1).getTime(),
    plannedMs: 60 * 60_000,
    focusedMs: 60 * 60_000,
    outcome: "completed",
  },
]);
assert.equal(kept.length, 1);

const history = buildHistoryBars(
  [
    {
      id: "oct4",
      title: "专注",
      startedAt: new Date(2026, 9, 4, 9).getTime(),
      endedAt: new Date(2026, 9, 4, 10, 30).getTime(),
      plannedMs: 90 * 60_000,
      focusedMs: 90 * 60_000,
      outcome: "completed",
    },
  ],
  resolveHistoryRange({
    mode: "custom",
    from: new Date(2026, 9, 3).getTime(),
    to: new Date(2026, 9, 4).getTime(),
  })
);
const oct3 = history.bars.find((bar) => bar.key === "2026-10-03");
const oct4 = history.bars.find((bar) => bar.key === "2026-10-04");
assert.equal(oct3.minutes, 0);
assert.equal(oct3.fillRatio, 0);
assert.equal(oct4.minutes, 90);
assert.equal(oct4.fillRatio, 1);
assert.equal(barFillRatio(30, 90) * 3, barFillRatio(90, 90));
assert.equal(barFillRatio(60, 90) * 1.5, barFillRatio(90, 90));
assert.equal(barFillRatio(0, 90), 0);

console.log("timebox engine checks passed");
