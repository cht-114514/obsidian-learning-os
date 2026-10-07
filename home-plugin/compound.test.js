const assert = require("node:assert/strict");
const {
  COMPOUND_FIELD_MAX,
  addCompoundDays,
  compoundDayEquals,
  compoundDaysInWeek,
  compoundWeekLabel,
  compoundWeekPath,
  compoundWeekStart,
  compoundWeekdayLabel,
  isCompoundWeekNote,
  mergeCompoundDay,
  normalizeCompoundDay,
  parseCompoundWeek,
  renderCompoundWeek,
  summarizeCompoundDay,
  yesterdayCompoundChange,
} = require("./compound.js");

assert.equal(compoundWeekStart("2026-09-27"), "2026-09-21");
assert.equal(compoundWeekStart("2026-09-21"), "2026-09-21");
assert.equal(compoundWeekStart("2026-09-20"), "2026-09-14");
assert.equal(compoundWeekStart("2026-01-01"), "2025-12-29");
assert.equal(addCompoundDays("2025-12-29", 6), "2026-01-04");
assert.equal(compoundWeekdayLabel("2026-09-27"), "周日");
assert.equal(compoundWeekdayLabel("2026-09-21"), "周一");
assert.equal(compoundWeekLabel("2026-09-23"), "2026-09-21 ～ 2026-09-27");
assert.equal(compoundWeekPath("2026-09-27"), "资料库/复利/2026-09-21.md");
assert.equal(compoundWeekStart("not-a-day"), "");

const long = "啊".repeat(COMPOUND_FIELD_MAX + 1);
assert.equal(normalizeCompoundDay({ kept: `  ${long}  ` }).kept.length, COMPOUND_FIELD_MAX);
assert.equal(normalizeCompoundDay({ kept: "  " }).kept, "");

const days = {
  "2026-09-21": { kept: "   ", found: "", change: "" },
  "2026-09-22": { kept: "留下一句\n\n\n第二段", found: "问题", change: "" },
  "2026-10-01": { kept: "下周", found: "", change: "" },
};
const markdown = renderCompoundWeek("2026-09-23", days);
assert(isCompoundWeekNote(markdown));
assert(!markdown.includes("2026-09-21 周一"));
assert(!markdown.includes("2026-10-01"));
assert(markdown.includes("留下一句\n\n\n第二段"));
assert.equal(markdown.startsWith("---\ntype: compound-week\nweek_start: 2026-09-21\n"), true);

const parsed = parseCompoundWeek(markdown);
assert.equal(parsed.weekStart, "2026-09-21");
assert.deepEqual(parsed.days, {
  "2026-09-22": {
    kept: "留下一句\n\n\n第二段",
    found: "问题",
    change: "",
    note: "",
  },
});
assert.equal(renderCompoundWeek(parsed.weekStart, parsed.days), markdown);

const merged = mergeCompoundDay(parsed.days, "2026-09-27", {
  kept: "周日留下",
  found: "",
  change: "明天少做一件",
});
assert.equal(merged["2026-09-22"].kept, "留下一句\n\n\n第二段");
assert.equal(merged["2026-09-27"].change, "明天少做一件");
assert.equal(parsed.days["2026-09-27"], undefined);

const cleared = mergeCompoundDay(merged, "2026-09-27", { kept: " ", found: " ", change: "" });
assert.equal(cleared["2026-09-27"], undefined);
assert(compoundDayEquals(cleared["2026-09-22"], merged["2026-09-22"]));

const withChange = mergeCompoundDay(parsed.days, "2026-09-26", {
  kept: "",
  found: "",
  change: "明天少做一件",
});
assert.equal(yesterdayCompoundChange("2026-09-27", withChange, {}), "明天少做一件");
assert.equal(
  yesterdayCompoundChange(
    "2026-09-21",
    {},
    { "2026-09-20": { kept: "", found: "", change: "早起" } }
  ),
  "早起"
);
assert.equal(yesterdayCompoundChange("2026-09-22", merged, {}), "");

assert.deepEqual(summarizeCompoundDay(null), {
  filled: false,
  main: "还没记",
  preview: "",
});
assert.deepEqual(
  summarizeCompoundDay({ kept: "  第一行\n第二行", found: "x", change: "" }),
  { filled: true, main: "已记", preview: "第一行" }
);

assert.deepEqual(compoundDaysInWeek("2026-09-21", merged, "2026-09-26"), ["2026-09-22"]);
assert.deepEqual(compoundDaysInWeek("2026-09-21", merged, "2026-09-27"), [
  "2026-09-22",
  "2026-09-27",
]);
assert.equal(isCompoundWeekNote("# 别的笔记\n"), false);
assert.deepEqual(parseCompoundWeek("").days, {});

console.log("compound week checks passed");
