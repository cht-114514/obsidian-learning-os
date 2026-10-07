const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const dir = __dirname;
const source = [
  "src/app.js",
  "src/activity-ui.js",
  "compound.js",
  "timebox.js",
  "review-queue.js",
  "drafts.js",
  "activity.js",
]
  .map((name) => fs.readFileSync(path.join(dir, name), "utf8"))
  .join("\n");
const bundle = fs.readFileSync(path.join(dir, "main.js"), "utf8");
assert(!bundle.includes('require("./compound.js")'));
assert(!bundle.includes('require("../compound.js")'));
assert(!bundle.includes('require("./timebox.js")'));
assert(!bundle.includes('require("../timebox.js")'));
assert(bundle.includes("继续做"));
assert(bundle.includes("整理归档"));
const css = fs.readFileSync(path.join(dir, "styles.css"), "utf8");
const manifest = JSON.parse(
  fs.readFileSync(path.join(dir, "manifest.json"), "utf8")
);

assert.equal(manifest.id, "meinc-home");
assert.equal(manifest.isDesktopOnly, false);
assert.equal(manifest.name, "首页");

assert(source.includes('VIEW_TYPE_HOME = "meinc-home"'));
assert(source.includes('lexideck:open-library'));
assert(source.includes("reviewMeta"));
assert(source.includes("buildEnglishReviewSession"));
assert(source.includes("buildChineseReviewSession"));
assert(source.includes("renderReviewHub"));
assert(source.includes("renderReview"));
assert(source.includes("appendReviewWordBack"));
assert(source.includes("reviewCardExamples"));
assert(source.includes("entry.examples"));
assert(source.includes("reviewHubCounts"));
assert(source.includes('name: "英语"'));
assert(source.includes('name: "语文"'));
assert(source.includes('英 ${english}'));
assert(source.includes('id: "review"'));
assert(source.includes("REVIEW_LEDGER_PATH"));
assert(source.includes("shouldHideSubjectChild"));
assert(source.includes("getDueCount"));
assert(source.includes('daily-notes:goto-today'));
assert(source.includes("openOnStart"));
assert(source.includes('"语文", "数学", "英语", "物理", "化学", "地理"'));
assert(source.includes("_模板"));
assert(source.includes("PINNED_BOTTOM"));
assert(source.includes('icon: "library"'));
assert(source.includes("meinc-home-row"));
assert(!source.includes("00-首页.md"));

const tilesBlock = source.match(/const HOME_TILES = \[[\s\S]*?\n\];/);
assert(tilesBlock, "HOME_TILES block missing");
assert(
  !tilesBlock[0].includes("agent-inbox"),
  "home tiles must not include agent-inbox"
);
assert(
  source.includes('MAILBOX_NOTE = "agent-inbox/meinc-mailbox/INBOX.md"'),
  "mailbox note path missing"
);

assert(source.includes('id: "agent"'));
assert(source.includes("openAgent"));
assert(source.includes("obsidian-agent-os:obsidian-agent-os-open"));

for (const label of [
  "Agent",
  "复习",
  "学习/输出",
  "AI 信箱",
  "手记",
  "项目库",
  "今日日记",
  "资料库",
]) {
  assert(source.includes(`name: "${label}"`), `missing home tile ${label}`);
}
assert(!source.includes("待办清单.md"));
assert(source.includes('path: "资料库"'));
assert(source.includes('icon: "archive"'));
assert(!source.includes('PROBLEMS_FOLDER = "手记/问题"'));
assert(!source.includes('id: "problems"'));
assert(!source.includes("renderProblems"));
assert(!source.includes("captureProblem"));
assert(!source.includes("问题：快速捕获"));
assert(!source.includes("require(\"./problem-note.js\")"));
assert(source.includes('"资料库"'));
assert(source.includes("class HomeDock"));
assert(source.includes("captureResumeFromHome"));
assert(source.includes("folderResume"));
assert(source.includes("opts.restore"));
assert(css.includes("meinc-home-dock.is-back"));
assert(source.includes("WRITE_ROOTS"));
assert(source.includes("class NameModal"));
assert(source.includes("class MovePickerModal"));
assert(source.includes("createNote"));
assert(source.includes("fileManager.renameFile"));
assert(source.includes("showCreateSheet"));
assert(source.includes("class ConfirmModal"));
assert(source.includes("fileManager.trashFile"));
assert(source.includes('name: "删除"'));
assert(source.includes("INBOX_STREAMS"));
assert(source.includes('id: "honglou"'));
assert(source.includes("基础学科/语文/红楼梦/每日推送"));
assert(source.includes('id: "check-push"'));
assert(source.includes("项目库/高考工程/核验推送"));
assert(source.includes('id: "hotbrief"'));
assert(source.includes("项目库/信息收集"));
assert(source.includes('match: "每日热点早报"'));
assert(source.includes('id: "grok-reply"'));
assert(source.includes("MAILBOX_THREADS"));
assert(source.includes('skipNames: ["README"]'));
assert(source.includes("inboxStreamAccepts"));
assert(source.includes("inboxDone"));
assert(source.includes("inboxSeeded"));
assert(source.includes("markInboxRead"));
assert(source.includes("listInboxItems"));
assert(source.includes("seedInboxIfNeeded"));
assert(source.includes("INBOX_SEED_KEEP_UNREAD = 4"));
assert(source.includes("backfillRecentInboxIfNeeded"));
assert(source.includes('type: "inbox"'));
assert(source.includes("收件箱是空的"));
assert(source.includes("showInboxSheet"));
assert(source.includes('name: "已读"'));
assert(source.includes("inboxMeta"));
assert(source.includes('size: "wide"'));
assert(source.includes("renderMailboxCompose"));
assert(source.includes("appendMailboxMessage"));
assert(source.includes("scheduleMailboxWake"));
assert(source.includes("wakeMailbox"));
assert(source.includes("MAILBOX_WAKE_DEBOUNCE_MS = 1500"));
assert(source.includes("Authorization: `Bearer ${key}`"));
assert(source.includes("mailboxWebhookUrl"));
assert(source.includes("mailboxSenderKey"));
assert(source.includes("testMailboxWake"));
assert(source.includes("primeMailboxHash"));
assert(source.includes("file.path !== MAILBOX_NOTE"));
assert(source.includes("mailboxWebhookProblem"));
assert(source.includes("normalizeMailboxSenderKey"));
assert(source.includes("grokbot:"));
assert(source.includes("https://api2.cursor.sh/automations/webhook/"));
assert(source.includes("inboxStreamForFile"));
assert(source.includes("scheduleInboxReadWake"));
assert(source.includes("postMailboxWebhook"));
assert(source.includes("syncInboxDoneMirror"));
assert(source.includes("appendInboxAck"));
assert(source.includes('event: "inbox_read"'));
assert(source.includes('MAILBOX_ACK = "agent-inbox/meinc-mailbox/ACK.md"'));
assert(
  source.includes(
    'MAILBOX_INBOX_DONE = "agent-inbox/meinc-mailbox/inbox-done.json"'
  )
);
assert(source.includes("WAKE_ON_READ_STREAMS"));
assert(source.includes('new Set(["check-push"])'));
assert(source.includes("WAKE_ON_READ_STREAMS.has(stream.id)"));
assert.equal(manifest.version, "0.12.0");
assert(source.includes("scrollTop"));
assert(source.includes("class TimeboxEngine"));
assert(source.includes("class TimeboxStartModal"));
assert(source.includes("class TimeboxControlModal"));
assert(source.includes("class TimeboxDoneModal"));
assert(source.includes("meinc-home-timebox"));
assert(source.includes('cls: "meinc-timebox-chip"'));
assert(source.includes("meinc-home-hero-date"));
assert(source.includes("meinc-home-focus"));
assert(source.includes("meinc-home-compound-chip"));
assert(source.includes('type: "compound"'));
assert(source.includes("renderCompound"));
assert(source.includes("start-pause-timebox"));
assert(source.includes("abandon-timebox"));
assert(source.includes("这块完成了"));
assert(source.includes("TIMEBOX_SESSIONS_DIR"));
assert(source.includes("summarizeTimeboxStats"));
assert(source.includes("formatFocusDuration"));
assert(source.includes("weekRangeLabel"));
assert(css.includes(".meinc-timebox-week-chart"));
assert(source.includes("openTimeboxControl"));
assert(source.includes("TIMEBOX_PRESETS"));
assert(source.includes("开始一块"));
assert(source.includes("记下"));
assert(source.includes("昨天要改的"));
assert(source.includes("打开本周笔记"));
assert(source.includes("还没记"));
assert(source.includes('COMPOUND_DIR = "资料库/复利"'));
assert(source.includes("timeboxDefaultMin"));
assert(source.includes("timeboxSoundOn"));
assert(source.includes("saveCompoundDay"));
assert(source.includes("summarizeCompoundDay"));
assert(!source.includes("timeboxTodos:"));
assert(!source.includes("添加待办"));
assert(!source.includes("还没有待办"));
assert(!source.includes("completeTimeboxTodoByTitle"));
assert(!source.includes('require("./compound.js")'));
assert(source.includes("继续做"));
assert(source.includes("整理归档"));
assert(source.includes("getAgentContext"));
assert(source.includes("手记/草稿"));
assert(source.includes("registerHonglouRead"));
assert(source.includes('name: "学习/输出"'));
assert(source.includes("先停掉当前这块"));
assert(source.includes("addTimeboxListener"));
assert(source.includes("meinc-home-timebox-status"));
assert(!source.includes("require(\"./timebox.js\")"));
assert(source.includes("require(\"../timebox.js\")"));
assert(!source.includes("focusflow"));
assert(!source.includes("FocusFlow"));
assert(css.includes(".meinc-home-timebox"));
assert(css.includes(".meinc-home-hero-date"));
assert(css.includes(".meinc-home-focus"));
assert(css.includes(".meinc-home-compound-chip"));
assert(css.includes(".meinc-home-compound-page"));
assert(css.includes(".meinc-home-compound-input"));
assert(!css.includes(".meinc-home-todo"));
assert(css.includes(".meinc-home-timebox.is-running"));
assert(css.includes(".meinc-timebox-chip.is-on"));
assert(css.includes(".meinc-timebox-modal"));
assert(css.includes("align-items: center"));
assert(css.includes("width: 100%"));
assert(css.includes(".meinc-home .meinc-home-compose-send"));

assert(css.includes(".meinc-home-tile"));
assert(css.includes(".meinc-home-icon"));
assert(css.includes(".meinc-home-group"));
assert(!css.includes("SF Pro Display"), "inherit vault font, not iOS stack");
assert(css.includes("--hv-radius-lg"));
assert(css.includes("body.is-translucent .meinc-home"));
assert(!css.includes("backdrop-filter"), "native translucency already blurs; a second blur ghosts the window");
assert(!css.includes("#70e8ff"), "must not reuse cockpit neon palette");
assert(css.includes("-webkit-overflow-scrolling: touch"));
assert(css.includes("flex: 1 1 0%"));
assert(css.includes("touch-action: pan-y"));
assert(css.includes("min-height: 0"));
assert(css.includes(".meinc-home-scroll"));
assert(css.includes("inset: 0"));
assert(css.includes(".meinc-home-empty-sub"));
assert(css.includes(".meinc-home-confirm-msg"));
assert(css.includes(".meinc-home-tile-body"));
assert(css.includes(".meinc-home-compose"));
assert(css.includes(".meinc-home-chip"));
assert(!css.includes(".meinc-problem-card"));
assert(css.includes("font-size: 1rem"));
assert(source.includes("meinc-home-scroll"));
assert(source.includes('role: "button"'));
assert(source.includes("addEventListener(\"keydown\""));
assert(!/\.meinc-home \{[\s\S]*?min-height:\s*100%/.test(css));

const problems = require("./problem-note.js");
const sample = [
  "---",
  "type: problem",
  "status: open",
  "created: 2026-09-13T17:54:00+08:00",
  "updated: 2026-09-13T18:20:00+08:00",
  "---",
  "",
  "# 模型路由器怎么切 API",
  "",
  "可切换 provider。",
  "",
  "## 2026-09-13 17:54",
  "",
  "先做一张路由表。",
  "",
  "## 2026-09-13 18:20",
  "",
  "改成按 provider 分适配器。",
  "",
].join("\n");

const parsed = problems.parseProblemNote(sample, "手记/问题/demo.md");
assert.equal(parsed.title, "模型路由器怎么切 API");
assert.equal(parsed.statement, "可切换 provider。");
assert.equal(parsed.status, "open");
assert.equal(parsed.rounds.length, 2);
assert.equal(parsed.rounds[0].heading, "2026-09-13 17:54");
assert.equal(parsed.rounds[1].body, "改成按 provider 分适配器。");

const again = problems.parseProblemNote(problems.serializeProblemNote(parsed));
assert.equal(again.title, parsed.title);
assert.equal(again.statement, parsed.statement);
assert.equal(again.rounds.length, 2);
assert.equal(again.rounds[1].body, parsed.rounds[1].body);

assert.equal(problems.problemPreview("  hello   world  "), "hello world");
assert.ok(problems.isLongRound(`${"很长。".repeat(120)}`));
assert.ok(!problems.isLongRound("短回答"));
assert.match(
  problems.formatProblemWhen("2026-09-13 17:54", new Date(2026, 8, 13, 18)),
  /今天 17:54/
);

const worksheet = [
  "---",
  "type: problem",
  "kind: stuck",
  "status: resolved",
  "subject: 物理",
  "created: 2026-09-19T08:00:00+08:00",
  "updated: 2026-09-19T08:30:00+08:00",
  "due: 2026-09-21",
  "---",
  "",
  "# 传送带交接处摩擦力方向",
  "",
  "## 表征",
  "",
  "- 已知：光滑传送带",
  "- 求：交接处摩擦力方向",
  "- 约束：共速前相对运动未知",
  "- 卡在：不知道谁主动",
  "",
  "## 算子",
  "",
  "- [[受力分析]]",
  "",
  "## 策略",
  "",
  "- 反向：从共速倒推",
  "",
  "## 执行",
  "",
  "- 2026-09-19 20:31 · 半 · 方程列不出",
  "",
  "## 验证",
  "",
  "- 2026-09-21 · 闭卷 · 成 · TTFC 95s",
  "",
  "## 存招",
  "",
  "- 触发：交接处看不清谁带谁",
  "- 动作：先判谁主动",
  "",
  "## 随手",
  "",
  "这是未知区块，应原样保留。",
  "",
].join("\n");

const sheet = problems.parseProblemNote(worksheet, "手记/问题/demo.md");
assert.equal(sheet.kind, "stuck");
assert.equal(sheet.status, "resolved");
assert.equal(sheet.subject, "物理");
assert.equal(sheet.due, "2026-09-21");
assert.deepEqual(sheet.represent.known, ["光滑传送带"]);
assert.deepEqual(sheet.represent.want, ["交接处摩擦力方向"]);
assert.deepEqual(sheet.operators[0], { summary: "", link: "[[受力分析]]" });
assert.equal(sheet.strategies[0].action, "反向：从共速倒推");
assert.equal(sheet.strategies[1].structure, "交接处看不清谁带谁");
assert.equal(sheet.strategies[1].action, "先判谁主动");
assert.equal(sheet.feedback[0].result, "half");
assert.equal(sheet.feedback[0].note, "方程列不出");
assert.equal(sheet.feedback[1].result, "win");
assert.equal(sheet.feedback[1].note, "闭卷 · TTFC 95s");
assert.equal(sheet.extras[0].heading, "随手");
assert.equal(sheet.attempts, undefined);
assert.equal(sheet.move, undefined);

const againSheet = problems.parseProblemNote(
  problems.serializeProblemNote(sheet)
);
assert.deepEqual(againSheet.represent.stuck, sheet.represent.stuck);
assert.equal(againSheet.strategies[1].action, "先判谁主动");
assert.equal(againSheet.extras[0].body, "这是未知区块，应原样保留。");
assert.equal(againSheet.due, "2026-09-21");
assert.ok(!problems.serializeProblemNote(sheet).includes("## 存招"));
assert.ok(!problems.serializeProblemNote(sheet).includes("## 执行"));

assert.equal(problems.problemProgress(sheet).done, 4);
assert.equal(problems.problemProgress(sheet).total, 4);
assert.equal(problems.firstIncomplete(sheet), -1);

const multiText = [
  "## 表征",
  "",
  "- 已知：文体/内容概要（锁定整体时间线）",
  "- 已知：提示词状态",
  "- 已知：句法结构",
  "- 求：判断谓语归属",
  "- 约束：独立分句只能有一个谓语",
  "- 卡在：新增谓语怎么挂",
  "",
  "## 算子",
  "",
  "- 先拆谓语再看非谓语 · [[英语语法答题体系]]",
  "",
  "## 策略",
  "",
  "- 结构：说明/记叙 + 要判时间线 · 算子：先拆谓语再看非谓语 · 做法：先抓语境框架，再拆句",
  "",
  "## 验证",
  "",
  "- 2026-09-19 20:31 · 半 · 先拆谓语再看非谓语 · 做到第二步方程列不出",
  "",
].join("\n");
const multi = problems.parseProblemNote(multiText, "手记/问题/demo.md");
assert.deepEqual(multi.represent.known, [
  "文体/内容概要（锁定整体时间线）",
  "提示词状态",
  "句法结构",
]);
assert.deepEqual(multi.operators[0], {
  summary: "先拆谓语再看非谓语",
  link: "[[英语语法答题体系]]",
});
assert.equal(multi.strategies[0].structure, "说明/记叙 + 要判时间线");
assert.deepEqual(multi.strategies[0].operators, ["先拆谓语再看非谓语"]);
assert.equal(multi.strategies[0].action, "先抓语境框架，再拆句");
assert.equal(multi.feedback[0].strategy, "先拆谓语再看非谓语");
assert.equal(multi.feedback[0].note, "做到第二步方程列不出");

const multiAgain = problems.parseProblemNote(
  problems.serializeProblemNote(multi)
);
assert.deepEqual(multiAgain.represent.known, multi.represent.known);
assert.equal(multiAgain.operators[0].summary, "先拆谓语再看非谓语");

assert.deepEqual(problems.parseOperatorLine("[[受力分析]]"), {
  summary: "",
  link: "[[受力分析]]",
});
assert.deepEqual(problems.parseStrategyLine("正向："), {
  structure: "",
  operators: [],
  action: "正向：",
});
assert.equal(
  problems.formatOperatorLine("[[受力分析]]"),
  "[[受力分析]]"
);
assert.ok(
  problems.representFilled({
    known: "光滑传送带",
    want: "",
    constraint: "",
    stuck: "",
  })
);
assert.deepEqual(problems.asStringList("光滑传送带"), ["光滑传送带"]);
assert.equal(problems.shouldNudge([]), false);
assert.equal(
  problems.shouldNudge([
    { result: "lose" },
    { result: "half" },
  ]),
  true
);
assert.equal(
  problems.shouldNudge([
    { result: "lose" },
    { result: "win" },
  ]),
  false
);
assert.equal(
  problems.isProblemDue(sheet, new Date(2026, 8, 21)),
  true
);
assert.equal(
  problems.isProblemDue(
    { status: "stored", due: "2026-09-21" },
    new Date(2026, 8, 21)
  ),
  false
);
assert.equal(problems.addDays(new Date(2026, 8, 19), 2), "2026-09-21");

console.log("meinc-home source checks passed");
