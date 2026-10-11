/**
 * The home writing editor is a plain <textarea class="meinc-editor-area">.
 * It is not CodeMirror. Nothing in this plugin calls scrollIntoView on it.
 *
 * On iPhone, WebKit still reveals the caret by scrolling the nearest
 * scrollable ancestor (the home page pane):
 *   insertText  → the typed line is placed on the bottom edge of the screen
 *   delete*     → the line is placed on the vertical center
 * That happens even when the line was already visible.
 *
 * While the writing screen is open the page pane is not a scroll container.
 * The textarea fills the area above the keyboard and is the only scroller.
 * planWritingScroll then refuses both native targets whenever the caret line
 * is already inside that box.
 */

function isDeleteInput(inputType) {
  return typeof inputType === "string" && inputType.startsWith("delete");
}

function iosCaretRevealScroll({ inputType, caretOffset = 0, lineHeight = 0, clientHeight = 0 } = {}) {
  const offset = Number.isFinite(caretOffset) ? caretOffset : 0;
  const line = Number.isFinite(lineHeight) ? lineHeight : 0;
  const view = Number.isFinite(clientHeight) ? clientHeight : 0;
  if (isDeleteInput(inputType)) return offset + line / 2 - view / 2;
  return offset + line - view;
}

function planWritingScroll(input = {}) {
  const maxScroll = Number.isFinite(input.maxScroll) ? Math.max(0, input.maxScroll) : Infinity;
  const clamp = (n) => {
    const value = Math.max(0, n);
    return value > maxScroll ? maxScroll : value;
  };
  const pinned = clamp(Number.isFinite(input.pinned) ? input.pinned : 0);
  const { caretOffset, lineHeight, clientHeight } = input;
  if (![caretOffset, lineHeight, clientHeight].every((n) => Number.isFinite(n))) return pinned;
  const line = Math.max(0, lineHeight);
  const view = Math.max(0, clientHeight);
  const room = Math.max(0, (view - line) / 2);
  const margin = Math.min(Number.isFinite(input.margin) ? input.margin : 8, room);
  const caretBottom = caretOffset + line;
  if (caretOffset >= pinned + margin && caretBottom <= pinned + view - margin) return pinned;
  if (caretBottom > pinned + view - margin) return clamp(caretBottom - view + margin);
  return clamp(caretOffset - margin);
}

function planPageScroll(input = {}) {
  return Number.isFinite(input.pinned) ? input.pinned : 0;
}

function writingFrameBox({ parentHeight, viewportHeight, slack = 12 } = {}) {
  if (!Number.isFinite(viewportHeight) || !Number.isFinite(parentHeight)) {
    return { height: null, unchanged: true };
  }
  if (parentHeight <= viewportHeight + slack) return { height: null, unchanged: true };
  return { height: Math.max(0, viewportHeight), unchanged: false };
}

function watchEditorScroll(root) {
  if (!root || root.dataset.editorScroll === "1") return;
  root.dataset.editorScroll = "1";
  if (root.classList.contains("is-writing")) {
    const onResize = () => {
      if (!root.isConnected) {
        window.visualViewport?.removeEventListener("resize", onResize);
        window.removeEventListener("resize", onResize);
        return;
      }
      layoutWriting(root);
    };
    window.visualViewport?.addEventListener("resize", onResize);
    window.addEventListener("resize", onResize);
    layoutWriting(root);
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => layoutWriting(root));
  }
  root.addEventListener("focusin", (event) => {
    const area = event.target;
    if (!area || area.tagName !== "TEXTAREA" || area.dataset.editorScroll === "1") return;
    if (!root.classList.contains("is-writing")) return;
    area.dataset.editorScroll = "1";
    attachWritingScroll(area, root);
  });
}

function layoutWriting(root) {
  if (!root?.isConnected) return;
  const parent = root.parentElement;
  const vv = window.visualViewport;
  const box = writingFrameBox({
    parentHeight: parent ? parent.clientHeight : root.clientHeight,
    viewportHeight: vv ? vv.height : undefined,
  });
  if (box.unchanged) {
    root.style.height = "";
    root.style.bottom = "";
  } else {
    root.style.height = `${box.height}px`;
    root.style.bottom = "auto";
  }
  sizeWritingEditor(root);
}

function sizeWritingEditor(root) {
  const area = root.querySelector?.(".meinc-editor-area");
  if (!area) return;
  const style = getComputedStyle(root);
  const pad = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  let used = pad;
  for (const child of root.children) {
    if (child === area) continue;
    const childStyle = getComputedStyle(child);
    used += child.offsetHeight
      + (parseFloat(childStyle.marginTop) || 0)
      + (parseFloat(childStyle.marginBottom) || 0);
  }
  const height = Math.max(96, Math.round(root.clientHeight - used));
  const previous = area.scrollTop;
  area.style.height = `${height}px`;
  area.scrollTop = previous;
}

function attachWritingScroll(area, root) {
  let pinnedArea = area.scrollTop || 0;
  let ancestorSnap = [];
  let pageX = 0;
  let pageY = 0;
  let inputType = "";
  let armed = false;
  let touching = false;
  let writing = false;
  let frame = 0;
  const timers = [];

  const snapshot = () => {
    pinnedArea = area.scrollTop || 0;
    pageX = window.scrollX || 0;
    pageY = window.scrollY || 0;
    const nodes = [];
    let el = root;
    while (el) {
      nodes.push(el);
      el = el.parentElement;
    }
    const doc = document.scrollingElement;
    if (doc && !nodes.includes(doc)) nodes.push(doc);
    ancestorSnap = nodes.map((node) => ({ node, top: node.scrollTop || 0, left: node.scrollLeft || 0 }));
  };

  const restoreAncestors = () => {
    for (const item of ancestorSnap) {
      if (!item.node.isConnected) continue;
      if (Math.abs(item.node.scrollTop - item.top) >= 1) item.node.scrollTop = item.top;
      if (Math.abs(item.node.scrollLeft - item.left) >= 1) item.node.scrollLeft = item.left;
    }
    if (Math.abs((window.scrollX || 0) - pageX) >= 1 || Math.abs((window.scrollY || 0) - pageY) >= 1) {
      window.scrollTo(pageX, pageY);
    }
  };

  const apply = () => {
    if (writing || !area.isConnected) return;
    writing = true;
    try {
      restoreAncestors();
      if (touching || document.activeElement !== area) return;
      const caret = area.dataset.composing === "1" ? null : measureCaretOffset(area);
      const next = planWritingScroll({
        inputType,
        pinned: pinnedArea,
        scrolled: area.scrollTop,
        caretOffset: caret?.offset,
        lineHeight: caret?.lineHeight,
        clientHeight: area.clientHeight,
        maxScroll: Math.max(0, area.scrollHeight - area.clientHeight),
      });
      if (Math.abs(area.scrollTop - next) >= 1) area.scrollTop = next;
    } finally {
      writing = false;
    }
  };

  const disarmLater = () => {
    for (const id of timers) clearTimeout(id);
    timers.length = 0;
    cancelAnimationFrame(frame);
    const kick = () => apply();
    frame = requestAnimationFrame(() => {
      kick();
      frame = requestAnimationFrame(kick);
    });
    for (const delay of [0, 32, 80, 160, 320]) {
      timers.push(setTimeout(kick, delay));
    }
    timers.push(setTimeout(() => {
      kick();
      armed = false;
    }, 420));
  };

  const arm = () => {
    armed = true;
    disarmLater();
  };

  area.addEventListener("keydown", (event) => {
    if (event.key === "Shift" || event.key === "Alt" || event.key === "Control" || event.key === "Meta") return;
    if (!armed) snapshot();
    arm();
  });
  area.addEventListener("beforeinput", (event) => {
    inputType = event.inputType || "";
    if (!armed) snapshot();
    arm();
  });
  area.addEventListener("input", (event) => {
    inputType = event.inputType || inputType;
    if (!armed) snapshot();
    arm();
  });
  area.addEventListener("compositionstart", () => {
    area.dataset.composing = "1";
    if (!armed) snapshot();
    arm();
  });
  area.addEventListener("compositionend", () => {
    delete area.dataset.composing;
    arm();
  });
  area.addEventListener("touchstart", () => {
    touching = true;
  }, { passive: true });
  const release = () => {
    touching = false;
    pinnedArea = area.scrollTop || 0;
    armed = false;
    for (const id of timers) clearTimeout(id);
    timers.length = 0;
  };
  area.addEventListener("touchend", release, { passive: true });
  area.addEventListener("touchcancel", release, { passive: true });

  const onScroll = () => {
    if (!area.isConnected) {
      document.removeEventListener("scroll", onScroll, true);
      window.visualViewport?.removeEventListener("scroll", onScroll);
      for (const id of timers) clearTimeout(id);
      cancelAnimationFrame(frame);
      return;
    }
    if (!armed || writing) return;
    apply();
  };
  document.addEventListener("scroll", onScroll, true);
  window.visualViewport?.addEventListener("scroll", onScroll);
  area.addEventListener("scroll", onScroll, { passive: true });

  layoutWriting(root);
  snapshot();
}

function measureCaretOffset(area) {
  if (typeof document === "undefined") return null;
  const width = area.clientWidth;
  if (width < 1) return null;
  ensureMirror();
  const style = getComputedStyle(area);
  mirror.style.boxSizing = "border-box";
  mirror.style.width = `${width}px`;
  mirror.style.padding = style.padding;
  mirror.style.borderStyle = "solid";
  mirror.style.borderColor = "transparent";
  mirror.style.borderWidth = `${style.borderTopWidth} ${style.borderRightWidth} ${style.borderBottomWidth} ${style.borderLeftWidth}`;
  mirror.style.fontFamily = style.fontFamily;
  mirror.style.fontSize = style.fontSize;
  mirror.style.fontWeight = style.fontWeight;
  mirror.style.fontStyle = style.fontStyle;
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.wordBreak = "break-word";
  const end = area.selectionStart ?? 0;
  mirrorText.data = area.value.slice(0, end);
  mirrorMark.textContent = "\u200b";
  const lineHeight = mirrorMark.offsetHeight || parseFloat(style.lineHeight) || 24;
  if ((area.selectionStart ?? 0) > 0 && mirror.offsetHeight < 1) return null;
  return { offset: mirrorMark.offsetTop, lineHeight };
}

let mirrorHost = null;
let mirror = null;
let mirrorText = null;
let mirrorMark = null;

function ensureMirror() {
  if (mirrorHost?.isConnected) return;
  mirrorHost = document.createElement("div");
  mirrorHost.setAttribute("aria-hidden", "true");
  mirrorHost.style.cssText = "position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;z-index:-1;";
  mirror = document.createElement("div");
  mirror.style.position = "relative";
  mirrorText = document.createTextNode("");
  mirrorMark = document.createElement("span");
  mirror.appendChild(mirrorText);
  mirror.appendChild(mirrorMark);
  mirrorHost.appendChild(mirror);
  document.body.appendChild(mirrorHost);
}

function keepScroll(node, fn) {
  const scroller = node?.closest?.(".meinc-home-scroll");
  const area = scroller?.querySelector?.(".meinc-editor-area");
  const top = scroller ? scroller.scrollTop : null;
  const areaTop = area ? area.scrollTop : null;
  fn();
  if (scroller?.classList.contains("is-writing")) layoutWriting(scroller);
  if (area && areaTop != null && Math.abs(area.scrollTop - areaTop) >= 1) area.scrollTop = areaTop;
  if (scroller && top != null && Math.abs(scroller.scrollTop - top) >= 1) scroller.scrollTop = top;
}

module.exports = {
  iosCaretRevealScroll,
  isDeleteInput,
  keepScroll,
  planPageScroll,
  planWritingScroll,
  watchEditorScroll,
  writingFrameBox,
};
