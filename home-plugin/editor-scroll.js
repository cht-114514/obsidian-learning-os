/**
 * iPhone WebKit scrolls the writing editor's pane on each insert or delete,
 * even when the caret is already on screen. A moment later scroll anchoring
 * (or the keyboard viewport) pulls that position back. The two adjustments
 * fight, so the page jumps up and down.
 *
 * reconcileEditorScroll undoes a jump when the caret would still be visible
 * at the pre-input scroll position, and otherwise moves the minimum distance
 * that brings the caret into view.
 */

function reconcileEditorScroll(input = {}) {
  const pinned = Number.isFinite(input.pinned) ? input.pinned : 0;
  const scrolled = Number.isFinite(input.scrolled) ? input.scrolled : 0;
  const maxScroll = Number.isFinite(input.maxScroll) ? Math.max(0, input.maxScroll) : Infinity;
  const clamp = (n) => {
    const value = Math.max(0, n);
    return value > maxScroll ? maxScroll : value;
  };
  const { caretTop, caretBottom, viewTop, viewBottom } = input;
  const margin = Number.isFinite(input.margin) ? input.margin : 12;
  if (![caretTop, caretBottom, viewTop, viewBottom].every((n) => Number.isFinite(n))) {
    return clamp(pinned);
  }
  const caretHeight = Math.max(0, caretBottom - caretTop);
  const offsetTop = scrolled + (caretTop - viewTop);
  const viewHeight = viewBottom - viewTop;
  let minS = offsetTop + caretHeight + margin - viewHeight;
  let maxS = offsetTop - margin;
  if (minS > maxS) {
    minS = offsetTop - margin;
    maxS = minS;
  }
  return clamp(Math.min(maxS, Math.max(minS, pinned)));
}

function caretClientFromMirror({ areaTop, areaScrollTop, mirrorTop, markTop, markHeight }) {
  const top = areaTop + (markTop - mirrorTop) - areaScrollTop;
  const height = Number.isFinite(markHeight) ? markHeight : 0;
  return { top, bottom: top + height };
}

function visibleBand({ boxTop, boxBottom, viewportOffset = 0, viewportHeight = Infinity }) {
  const top = Math.max(boxTop, viewportOffset);
  const limit = Number.isFinite(viewportHeight) ? viewportOffset + viewportHeight : Infinity;
  const bottom = Math.min(boxBottom, limit);
  return { top, bottom: Math.max(top, bottom) };
}

function watchEditorScroll(root) {
  if (!root || root.dataset.editorScroll === "1") return;
  root.dataset.editorScroll = "1";
  root.addEventListener("focusin", (event) => {
    const area = event.target;
    if (!area || area.tagName !== "TEXTAREA" || area.dataset.editorScroll === "1") return;
    area.dataset.editorScroll = "1";
    attachEditorScroll(area, root);
  });
}

function attachEditorScroll(area, root) {
  let pinnedScroll = root.scrollTop || 0;
  let pinnedArea = area.scrollTop || 0;
  let fresh = false;
  let touching = false;
  let frame = 0;
  let timer = 0;
  let writing = false;
  let typing = false;

  const snapshot = () => {
    if (fresh || !area.isConnected) return;
    pinnedScroll = root.isConnected ? root.scrollTop : pinnedScroll;
    pinnedArea = area.scrollTop;
    fresh = true;
  };

  const measure = () => measureTextareaCaret(area);

  const apply = () => {
    if (writing || touching || !area.isConnected || !root.isConnected) return;
    if (typeof document !== "undefined" && document.activeElement !== area) return;
    writing = true;
    try {
      if (area.dataset.composing === "1") {
        writeScroll(root, pinnedScroll);
        writeScroll(area, pinnedArea);
        return;
      }
      const caret = measure();
      const areaBox = area.getBoundingClientRect();
      const areaNext = reconcileEditorScroll({
        pinned: pinnedArea,
        scrolled: area.scrollTop,
        maxScroll: Math.max(0, area.scrollHeight - area.clientHeight),
        caretTop: caret?.top,
        caretBottom: caret?.bottom,
        viewTop: areaBox.top,
        viewBottom: areaBox.bottom,
      });
      const areaDelta = areaNext - area.scrollTop;
      writeScroll(area, areaNext);
      const shifted = caret
        ? { top: caret.top - areaDelta, bottom: caret.bottom - areaDelta }
        : null;
      const band = readVisibleBand(root);
      const next = reconcileEditorScroll({
        pinned: pinnedScroll,
        scrolled: root.scrollTop,
        maxScroll: Math.max(0, root.scrollHeight - root.clientHeight),
        caretTop: shifted?.top,
        caretBottom: shifted?.bottom,
        viewTop: band.top,
        viewBottom: band.bottom,
      });
      writeScroll(root, next);
      // Remember the position we chose, not a jump iOS may still be showing.
      pinnedArea = areaNext;
      pinnedScroll = next;
    } finally {
      writing = false;
    }
  };

  const schedule = () => {
    if (typeof requestAnimationFrame !== "function") {
      apply();
      fresh = false;
      typing = false;
      return;
    }
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    frame = requestAnimationFrame(() => {
      apply();
      frame = requestAnimationFrame(apply);
    });
    timer = setTimeout(() => {
      apply();
      fresh = false;
      typing = false;
    }, 50);
  };

  area._syncEditorScroll = schedule;
  area.addEventListener("focus", () => {
    fresh = false;
    snapshot();
  });
  area.addEventListener("keydown", snapshot);
  area.addEventListener("beforeinput", snapshot);
  area.addEventListener("compositionstart", () => {
    area.dataset.composing = "1";
    snapshot();
  });
  area.addEventListener("compositionend", () => {
    delete area.dataset.composing;
    typing = true;
    schedule();
  });
  area.addEventListener("input", () => {
    typing = true;
    schedule();
  });
  const hold = () => {
    touching = true;
  };
  const release = () => {
    touching = false;
    fresh = false;
    snapshot();
  };
  area.addEventListener("touchstart", hold, { passive: true });
  area.addEventListener("touchend", release, { passive: true });
  area.addEventListener("touchcancel", release, { passive: true });
  root.addEventListener("touchstart", hold, { passive: true });
  root.addEventListener("touchend", release, { passive: true });
  root.addEventListener("touchcancel", release, { passive: true });
  snapshot();

  const onViewport = () => {
    if (!area.isConnected) {
      window.visualViewport?.removeEventListener("scroll", onViewport);
      window.visualViewport?.removeEventListener("resize", onViewport);
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      return;
    }
    if (!typing || document.activeElement !== area) return;
    schedule();
  };
  window.visualViewport?.addEventListener("scroll", onViewport);
  window.visualViewport?.addEventListener("resize", onViewport);
}

function writeScroll(el, next) {
  if (!el || !Number.isFinite(next) || Math.abs(el.scrollTop - next) < 1) return;
  el.scrollTop = next;
}

function readVisibleBand(scroller) {
  const box = scroller.getBoundingClientRect();
  const vv = window.visualViewport;
  if (!vv) return { top: box.top, bottom: box.bottom };
  return visibleBand({
    boxTop: box.top,
    boxBottom: box.bottom,
    viewportOffset: vv.offsetTop,
    viewportHeight: vv.height,
  });
}

let mirrorHost = null;
let mirror = null;
let mirrorText = null;
let mirrorMark = null;

function measureTextareaCaret(area) {
  if (typeof document === "undefined") return null;
  ensureMirror();
  const style = getComputedStyle(area);
  const width = area.getBoundingClientRect().width;
  if (width < 1) return null;
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
  mirrorMark.textContent = area.value.slice(end, end + 1) || "\u200b";
  const markRect = mirrorMark.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  const areaRect = area.getBoundingClientRect();
  return caretClientFromMirror({
    areaTop: areaRect.top,
    areaScrollTop: area.scrollTop,
    mirrorTop: mirrorRect.top,
    markTop: markRect.top,
    markHeight: markRect.height,
  });
}

function ensureMirror() {
  if (mirrorHost?.isConnected) return;
  mirrorHost = document.createElement("div");
  mirrorHost.setAttribute("aria-hidden", "true");
  mirrorHost.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none;";
  mirror = document.createElement("div");
  mirror.style.position = "absolute";
  mirror.style.left = "0";
  mirror.style.top = "0";
  mirrorText = document.createTextNode("");
  mirrorMark = document.createElement("span");
  mirror.appendChild(mirrorText);
  mirror.appendChild(mirrorMark);
  mirrorHost.appendChild(mirror);
  document.body.appendChild(mirrorHost);
}

function keepScroll(node, fn) {
  const scroller = node?.closest?.(".meinc-home-scroll");
  const top = scroller ? scroller.scrollTop : null;
  fn();
  if (scroller && top != null && Math.abs(scroller.scrollTop - top) >= 1) {
    scroller.scrollTop = top;
  }
}

module.exports = {
  caretClientFromMirror,
  keepScroll,
  reconcileEditorScroll,
  visibleBand,
  watchEditorScroll,
};
