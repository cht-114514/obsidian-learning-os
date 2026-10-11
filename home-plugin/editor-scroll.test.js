const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  caretClientFromMirror,
  reconcileEditorScroll,
  visibleBand,
} = require("./editor-scroll.js");

// iOS jumped the pane upward while the caret was already on screen.
assert.equal(
  reconcileEditorScroll({
    pinned: 120,
    scrolled: 40,
    maxScroll: 800,
    caretTop: 300,
    caretBottom: 324,
    viewTop: 100,
    viewBottom: 700,
  }),
  120
);

// Caret is below the visible band (keyboard). Scroll only enough to reveal it.
assert.equal(
  reconcileEditorScroll({
    pinned: 0,
    scrolled: 0,
    maxScroll: 800,
    caretTop: 680,
    caretBottom: 710,
    viewTop: 80,
    viewBottom: 600,
    margin: 12,
  }),
  122
);

// Browser overscrolled. Stay as close as possible to the pre-input position.
assert.equal(
  reconcileEditorScroll({
    pinned: 0,
    scrolled: 200,
    maxScroll: 800,
    caretTop: 400,
    caretBottom: 430,
    viewTop: 80,
    viewBottom: 600,
    margin: 12,
  }),
  42
);

// No caret measurement: undo the jump instead of following it.
assert.equal(
  reconcileEditorScroll({
    pinned: 80,
    scrolled: 10,
    maxScroll: 500,
  }),
  80
);

assert.equal(
  reconcileEditorScroll({
    pinned: 900,
    scrolled: 900,
    maxScroll: 800,
  }),
  800
);

assert.deepEqual(
  caretClientFromMirror({
    areaTop: 100,
    areaScrollTop: 40,
    mirrorTop: 0,
    markTop: 180,
    markHeight: 24,
  }),
  { top: 240, bottom: 264 }
);

// Keyboard covers the bottom of the scroll pane. The visible band stops there.
assert.deepEqual(
  visibleBand({
    boxTop: 40,
    boxBottom: 800,
    viewportOffset: 0,
    viewportHeight: 520,
  }),
  { top: 40, bottom: 520 }
);

const dir = __dirname;
const app = fs.readFileSync(path.join(dir, "src/app.js"), "utf8");
const activity = fs.readFileSync(path.join(dir, "src/activity-ui.js"), "utf8");
const css = fs.readFileSync(path.join(dir, "styles.css"), "utf8");
const bundle = fs.readFileSync(path.join(dir, "main.js"), "utf8");

assert(app.includes("watchEditorScroll(root)"));
assert(app.includes("this.editorArea?.isConnected"));
assert(app.includes("preventScroll: true"));
assert(!/addEventListener\("input"[\s\S]{0,180}this\.render\(\)/.test(activity));
assert(activity.includes("keepScroll(view.editorStatus"));
assert(css.includes("overflow-anchor: none"));
assert(!css.includes("field-sizing"));
assert(bundle.includes("reconcileEditorScroll"));
assert(!bundle.includes('require("../editor-scroll.js")'));

console.log("editor scroll checks passed");
