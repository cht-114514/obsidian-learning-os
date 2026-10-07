const assert = require("node:assert/strict");
const { contentHash, continueItems, mergeEvents, readingShelves, recordsForDay } = require("./activity.js");
const { parseDraft, planDraftSave, planTextSave } = require("./drafts.js");
const { decideArchive, decideNextWrite, parseArchivePending, renderArchivePending } = require("./archive.js");
const {
  avoidPathCollision,
  callArchiveLlm,
  isAllowedArchivePath,
  normalizeArchiveSuggestion,
  parseArchiveSuggestionJson,
  resolveArchivePath,
} = require("./archive-llm.js");
const { freshRound, gradeRound, skipRound } = require("./review-round.js");
const { appendNextStep, extractNextStep, pickWorkPath, projectFolderFromPath } = require("./projects.js");
const { formatDayRecords } = require("./compound.js");

assert.equal(mergeEvents([{ id: "a", type: "read", at: 1 }], [{ id: "a", type: "read", at: 2, path: "资料库/数学/a.md" }])[0].path, "资料库/数学/a.md");

const continued = continueItems([
  { id: "r", type: "read", at: 10, path: "资料库/数学/a.md", title: "极限", progress: 0.2 },
  { id: "d", type: "draft", at: 20, draftId: "d1", path: "手记/草稿/d1.md", title: "草稿" },
  { id: "v", type: "review", at: 30, index: 1, queue: [{ id: "1" }, { id: "2" }] },
  { id: "n", type: "next", at: 5, text: "接着写极限", targetPath: "资料库/数学/a.md" },
]);
assert.equal(continued.length, 3);
assert.equal(continued[0].kind, "review");
assert.equal(continued.some((item) => item.kind === "read"), true);

const shelves = readingShelves(
  [
    { id: "1", type: "read", at: 1, path: "资料库/数学/a.md", progress: 0.4 },
    { id: "2", type: "later", at: 2, path: "资料库/数学/b.md" },
  ],
  ["资料库/数学/a.md", "资料库/数学/b.md", "资料库/数学/c.md"]
);
assert.equal(shelves.reading[0].path, "资料库/数学/a.md");
assert.deepEqual(shelves.later, ["资料库/数学/b.md"]);
assert.deepEqual(shelves.all, ["资料库/数学/c.md"]);

const records = formatDayRecords(recordsForDay(
  [{ id: "g", type: "review-grade", at: new Date(2026, 9, 4, 8).getTime() }],
  [{ dayKey: "2026-10-04", title: "数学", minutes: 90 }],
  "2026-10-04"
));
assert.deepEqual(records, ["复习 1 项", "专注 数学 90 分"]);

const created = planDraftSave({
  id: "d1",
  kind: "output",
  deviceId: "mac",
  localBody: "先写这一句",
  diskMarkdown: null,
});
assert.equal(created.action, "write");
assert.equal(parseDraft(created.markdown).body, "先写这一句");

const again = planDraftSave({
  id: "d1",
  kind: "output",
  deviceId: "phone",
  baseHash: contentHash("先写这一句"),
  localBody: "手机上的另一句",
  diskMarkdown: created.markdown.replace("先写这一句", "电脑上又改了"),
});
assert.equal(again.action, "conflict");
assert.match(again.path, /conflict-phone/);

const quiet = planTextSave({
  baseHash: contentHash("旧"),
  localBody: "新",
  diskBody: "旧",
});
assert.equal(quiet.action, "write");

const pending = renderArchivePending({
  draftPath: "手记/草稿/d1.md",
  draftId: "d1",
  hash: "abc",
  proposedTitle: "极限",
  proposedPath: "手记/随记/极限.md",
});
assert.equal(parseArchivePending(pending).path, "手记/随记/极限.md");
assert.equal(decideArchive({ draftBody: "正文", confirmedHash: contentHash("正文"), targetExists: false }).action, "write");
assert.equal(
  decideArchive({
    draftBody: "正文",
    confirmedHash: contentHash("正文"),
    targetExists: true,
    targetBody: "正文",
  }).action,
  "noop"
);
assert.equal(
  decideArchive({
    draftBody: "正文",
    confirmedHash: contentHash("旧"),
    targetExists: false,
  }).action,
  "stale"
);
assert.equal(
  decideArchive({
    draftBody: "正文",
    confirmedHash: contentHash("正文"),
    targetExists: true,
    targetBody: "别的",
  }).action,
  "conflict"
);
assert.equal(
  decideNextWrite({
    line: "明天写完",
    confirmedLine: "明天写完",
    targetBody: "",
    confirmedTargetHash: contentHash(""),
  }).action,
  "append"
);

const round = freshRound([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }, { id: "f" }]);
assert.equal(round.queue.length, 5);
const graded = gradeRound(round, "good");
assert.equal(graded.round.queue.length, 4);
assert.equal(graded.card.id, "a");
const skipped = skipRound(freshRound([{ id: "a" }, { id: "b" }]));
assert.equal(skipped.queue[0].id, "b");
assert.equal(skipped.queue[1].id, "a");

const note = ["## 02-行动日志", "", "| 日期 | 下一步 |", "| --- | --- |", "| 10-01 | 先写提纲 |", ""].join("\n");
assert.equal(extractNextStep(note), "先写提纲");
assert.equal(projectFolderFromPath("项目库/高考工程/00-入口.md"), "项目库/高考工程");
assert.equal(pickWorkPath(["项目库/网站/笔记.md", "项目库/网站/04-产出/稿.md"]), "项目库/网站/04-产出/稿.md");
assert.match(appendNextStep("", "接着做", "2026-10-04"), /2026-10-04 接着做/);

assert.equal(isAllowedArchivePath("手记/随记/一篇.md"), true);
assert.equal(isAllowedArchivePath("手记/草稿/x.md"), false);
assert.equal(isAllowedArchivePath("资料库/x.md"), false);
assert.deepEqual(
  normalizeArchiveSuggestion({ title: "极限", path: "手记/草稿/x.md" }),
  { title: "极限", path: "手记/随记/极限.md" }
);
assert.deepEqual(parseArchiveSuggestionJson('{"title":"A","path":"项目库/高考工程/a.md"}'), {
  title: "A",
  path: "项目库/高考工程/a.md",
});
assert.match(
  avoidPathCollision("手记/随记/a.md", "新正文", (p) => (p === "手记/随记/a.md" ? "旧" : null)),
  /^手记\/随记\/a-\d{4}-\d{2}-\d{2}\.md$/
);
assert.equal(avoidPathCollision("手记/随记/a.md", "同", () => "同"), "手记/随记/a.md");

(async () => {
  const resolved = await resolveArchivePath(
    "手记/随记/b.md",
    "正文",
    async (p) => (p === "手记/随记/b.md" ? "别的" : null)
  );
  assert.match(resolved, /^手记\/随记\/b-\d{4}-\d{2}-\d{2}\.md$/);

  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: '{"title":"测试","path":"基础学科/数学/测试.md"}' } }],
    }),
  });
  const llm = await callArchiveLlm({
    baseUrl: "https://example.com/v1",
    apiKey: "k",
    model: "qwen3.7-flash",
    body: "一些内容",
    folderHints: ["基础学科/数学"],
    fetchImpl: mockFetch,
    timeoutMs: 5000,
  });
  assert.equal(llm.ok, true);
  assert.equal(llm.suggestion.path, "基础学科/数学/测试.md");

  const skip = await callArchiveLlm({ baseUrl: "", apiKey: "", model: "" });
  assert.equal(skip.skipped, true);
})().then(() => {
  console.log("home logic checks passed");
});
