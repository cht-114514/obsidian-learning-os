const assert = require("node:assert/strict");
const {
  buildLexiQueueItems,
  ledgerEntryForHonglouRead,
  mixReviewQueue,
  normalizeLedger,
  pickDueProse,
  proseDueAfterGrade,
  shouldHideSubjectChild,
  staggerHonglouBackfill,
  startOfNextDay,
} = require("./review-queue.js");

const now = Date.UTC(2026, 9, 4, 12, 0, 0);

assert.equal(shouldHideSubjectChild("基础学科/语文/红楼梦", "红楼梦"), true);
assert.equal(shouldHideSubjectChild("基础学科/语文/写作", "微写作框架.md"), false);
assert.equal(shouldHideSubjectChild("基础学科/语文", "高考背诵默写_必修上册.md"), true);

const mixed = mixReviewQueue(
  [{ type: "word" }, { type: "word" }, { type: "word" }, { type: "word" }, { type: "word" }],
  [{ type: "prose" }, { type: "prose" }]
);
assert.deepEqual(
  mixed.map((item) => item.type),
  ["word", "word", "word", "word", "prose", "word", "prose"]
);

const proseOnly = mixReviewQueue([], [{ type: "prose" }]);
assert.equal(proseOnly.length, 1);

const ledger = normalizeLedger({
  entries: {
    "a.md": { kind: "honglou", due: now - 1 },
    "b.md": { kind: "article", due: now - 1 },
    "c.md": { kind: "honglou", due: now + 99999 },
  },
});
const picked = pickDueProse(ledger, now);
assert.equal(picked.length, 2);
assert.equal(picked.filter((p) => p.kind === "honglou").length, 1);

const backfill = staggerHonglouBackfill(
  { "h1.md": "x", "h2.md": "y" },
  ["h2.md", "h1.md"],
  now
);
assert.equal(Object.keys(backfill).length, 2);
assert.ok(backfill["h1.md"].due >= startOfNextDay(now));

const fakeLexi = {
  getDueItems(kind) {
    if (kind === "words") return { due: [{ id: "w1" }], fresh: [] };
    return { due: [], fresh: [{ id: "s1" }] };
  },
};
const lexi = buildLexiQueueItems(fakeLexi, now);
assert.equal(lexi.length, 2);
assert.equal(lexi[0].type, "word");
assert.equal(lexi[1].type, "sentence");

const honglou = ledgerEntryForHonglouRead(now);
assert.ok(honglou.due > now);
assert.ok(proseDueAfterGrade("good", now) > proseDueAfterGrade("again", now));

console.log("review-queue.test.js ok");
