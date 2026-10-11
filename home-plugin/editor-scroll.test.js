const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  iosCaretRevealScroll,
  planPageScroll,
  planWritingScroll,
  writingFrameBox,
} = require("./editor-scroll.js");

const line = { caretOffset: 300, lineHeight: 24, clientHeight: 400, maxScroll: 2000, margin: 8 };
const insertNative = iosCaretRevealScroll({ inputType: "insertText", ...line });
const deleteNative = iosCaretRevealScroll({ inputType: "deleteContentBackward", ...line });

// WebKit's two reveal targets are different: bottom edge vs vertical center.
assert.equal(insertNative, 300 + 24 - 400);
assert.equal(deleteNative, 300 + 24 / 2 - 400 / 2);
assert.notEqual(insertNative, deleteNative);

// The line is already inside the editor. Neither insert nor delete may move it,
// even if WebKit has already scrolled to its native target.
for (const inputType of ["insertText", "insertLineBreak", "deleteContentBackward", "deleteContentForward"]) {
  const native = iosCaretRevealScroll({ inputType, ...line });
  assert.equal(
    planWritingScroll({ inputType, pinned: 200, scrolled: native, ...line }),
    200
  );
  assert.notEqual(200, native);
  assert.equal(planPageScroll({ inputType, pinned: 0 }), 0);
  assert.equal(planPageScroll({ inputType, pinned: 16 }), 16);
}

// Insert of a line that is actually below the box nudges just enough, not to
// the bare bottom edge WebKit would use.
assert.equal(
  planWritingScroll({
    inputType: "insertText",
    pinned: 0,
    scrolled: 124,
    caretOffset: 500,
    lineHeight: 24,
    clientHeight: 400,
    maxScroll: 2000,
    margin: 8,
  }),
  132
);
assert.equal(
  iosCaretRevealScroll({ inputType: "insertText", caretOffset: 500, lineHeight: 24, clientHeight: 400 }),
  124
);

// Delete when the line is above the box brings it to the top, not the center.
const deleteAboveNative = iosCaretRevealScroll({
  inputType: "deleteContentBackward",
  caretOffset: 100,
  lineHeight: 24,
  clientHeight: 400,
});
assert.equal(
  planWritingScroll({
    inputType: "deleteContentBackward",
    pinned: 400,
    scrolled: deleteAboveNative,
    caretOffset: 100,
    lineHeight: 24,
    clientHeight: 400,
    maxScroll: 2000,
    margin: 8,
  }),
  92
);
assert.notEqual(92, deleteAboveNative);

// No caret measurement: put the scroll back. Do not keep a bottom or center jump.
assert.equal(
  planWritingScroll({ inputType: "insertText", pinned: 80, scrolled: insertNative, maxScroll: 500 }),
  80
);
assert.equal(
  planWritingScroll({
    inputType: "deleteContentBackward",
    pinned: 80,
    scrolled: deleteNative,
    maxScroll: 500,
  }),
  80
);

// Keyboard may cover the pane. Clip to the visual height and ignore any
// viewport offset, so a caret reveal cannot shift the frame.
assert.deepEqual(writingFrameBox({ parentHeight: 844, viewportHeight: 500 }), {
  height: 500,
  unchanged: false,
});
assert.deepEqual(writingFrameBox({ parentHeight: 480, viewportHeight: 500 }), {
  height: null,
  unchanged: true,
});

const dir = __dirname;
const app = fs.readFileSync(path.join(dir, "src/app.js"), "utf8");
const activity = fs.readFileSync(path.join(dir, "src/activity-ui.js"), "utf8");
const css = fs.readFileSync(path.join(dir, "styles.css"), "utf8");
const bundle = fs.readFileSync(path.join(dir, "main.js"), "utf8");
const editorFn = activity.slice(
  activity.indexOf("function renderEditor"),
  activity.indexOf("function scheduleEditorSave")
);

assert(editorFn.includes('cls: "meinc-editor-area"'));
assert(editorFn.includes('createEl("textarea"'));
assert(!editorFn.includes("scrollIntoView"));
assert(!editorFn.includes("CodeMirror"));
assert(!editorFn.includes("contenteditable"));
assert(app.includes("meinc-home-scroll is-writing"));
assert(app.includes("watchEditorScroll(root)"));
assert(css.includes(".meinc-home-scroll.is-writing"));
assert(css.includes("overflow: hidden"));
assert(!/scrollIntoView\(\s*\{[^}]*center/.test(activity));
assert(!/scrollIntoView\(\s*\{[^}]*end/.test(activity));
assert(bundle.includes("planWritingScroll"));
assert(bundle.includes("iosCaretRevealScroll"));
assert(!bundle.includes('require("../editor-scroll.js")'));

console.log("editor scroll checks passed");
