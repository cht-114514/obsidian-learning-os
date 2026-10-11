const CAPSULE_KEY = 'aos:companion:capsule';
const PANEL_KEY = 'aos:companion:panel';

export function loadCapsulePos() {
  try {
    const raw = localStorage.getItem(CAPSULE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveCapsulePos(pos) {
  try {
    localStorage.setItem(CAPSULE_KEY, JSON.stringify(pos));
  } catch {
    /* */
  }
}

export function loadPanelGeom() {
  try {
    const raw = localStorage.getItem(PANEL_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function savePanelGeom(geom) {
  try {
    localStorage.setItem(PANEL_KEY, JSON.stringify(geom));
  } catch {
    /* */
  }
}

export function defaultCapsulePos(mobile, w, h) {
  if (mobile) return { edge: 'bottom', offset: 88, side: 'right' };
  return { left: Math.max(16, w - 72), top: Math.max(16, h - 88) };
}

export function defaultPanelGeom(mobile, w, h) {
  if (mobile) return { heightPct: 0.6 };
  const width = Math.min(420, w - 32);
  const height = Math.min(520, h - 48);
  return {
    width,
    height,
    left: Math.max(16, w - width - 24),
    top: Math.max(16, h - height - 96),
  };
}

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function usableSelection(selection, frame) {
  if (!selection) return null;
  const top = Number(selection.top);
  const bottom = Number(selection.bottom);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom - top < 1) return null;
  const frameBottom = frame.top + frame.height;
  if (bottom < frame.top || top > frameBottom) return null;
  const left = Number(selection.left);
  const right = Number(selection.right);
  return {
    top,
    bottom,
    left: Number.isFinite(left) ? left : frame.left,
    right: Number.isFinite(right) ? right : frame.left + 24,
  };
}

/**
 * Place a peek card inside the visible frame.
 * Prefer under a real selection, then above it. Otherwise dock to the bottom
 * and hide the pointer so a bottom sheet does not pretend to point at text.
 * The card never covers the quoted line when it is anchored above or below.
 *
 * @param {{
 *   frame: { left: number, top: number, width: number, height: number },
 *   selection?: { left?: number, top?: number, right?: number, bottom?: number } | null,
 *   card: { width: number, height: number },
 *   gap?: number,
 * }} opts
 */
export function placeCard({ frame, selection, card, gap = 10 } = {}) {
  const width = Math.max(0, Math.min(Number(card?.width) || 0, frame.width));
  const height = Math.max(0, Math.min(Number(card?.height) || 0, frame.height));
  const sel = usableSelection(selection, frame);

  const finish = (left, top, anchor, showPointer) => {
    const maxLeft = frame.left + Math.max(0, frame.width - width);
    const maxTop = frame.top + Math.max(0, frame.height - height);
    let clampedTop = clamp(top, frame.top, maxTop);
    let nextAnchor = anchor;
    let pointer = showPointer;
    if (pointer && sel && nextAnchor === 'below' && clampedTop < sel.bottom) {
      nextAnchor = 'dock';
      pointer = false;
      clampedTop = clamp(frame.top + frame.height - height, frame.top, maxTop);
    }
    if (pointer && sel && nextAnchor === 'above' && clampedTop + height > sel.top - gap) {
      nextAnchor = 'dock';
      pointer = false;
      clampedTop = clamp(frame.top + frame.height - height, frame.top, maxTop);
    }
    const clampedLeft = clamp(left, frame.left, maxLeft);
    let pointerX = width / 2;
    if (pointer && sel) {
      const center = (sel.left + sel.right) / 2;
      pointerX = clamp(center - clampedLeft, 20, Math.max(20, width - 20));
    }
    return {
      left: Math.round(clampedLeft),
      top: Math.round(clampedTop),
      width: Math.round(width),
      height: Math.round(height),
      anchor: nextAnchor,
      showPointer: pointer,
      pointerX: Math.round(pointerX),
    };
  };

  const alignedLeft = (target) => {
    if (width >= frame.width - 1) return frame.left;
    const preferred = target ? target.left : frame.left + frame.width - width;
    return preferred;
  };

  if (!sel) {
    return finish(alignedLeft(null), frame.top + frame.height - height, 'dock', false);
  }
  const frameBottom = frame.top + frame.height;
  const spaceBelow = frameBottom - sel.bottom - gap;
  const spaceAbove = sel.top - frame.top - gap;
  if (spaceBelow >= height) {
    return finish(alignedLeft(sel), sel.bottom + gap, 'below', true);
  }
  if (spaceAbove >= height) {
    return finish(alignedLeft(sel), sel.top - gap - height, 'above', true);
  }
  return finish(alignedLeft(null), frame.top + frame.height - height, 'dock', false);
}

/**
 * @param {'collapsed'|'peek'|'expanded'} mode
 * @param {'capsule'|'input'|'expand'|'back'|'escape'|'outside'|'close'|string} action
 */
export function nextCompanionMode(mode, action) {
  const current = mode === 'expanded' || mode === 'peek' ? mode : 'collapsed';
  if (action === 'capsule') return current === 'collapsed' ? 'peek' : 'collapsed';
  if (action === 'input' || action === 'expand') return 'expanded';
  if (action === 'back' || action === 'escape') {
    if (current === 'expanded') return 'peek';
    return 'collapsed';
  }
  if (action === 'outside' || action === 'close') return 'collapsed';
  return current;
}

/** Drop a frozen quote only after the card is fully closed and the draft is empty. */
export function shouldThawQuote(mode, draft) {
  return mode === 'collapsed' && !String(draft || '').trim();
}

/**
 * Fullscreen and the half-screen panel are one conversation.
 * Opening fullscreen covers the panel; it does not open a second copy.
 * Mode, draft, and scroll stay put so leaving fullscreen uncovers the same view.
 *
 * @param {{ mode?: string }} state
 * @param {boolean} chatActive
 */
export function companionPresentation(state, chatActive) {
  const mode = state?.mode === 'expanded' || state?.mode === 'peek' ? state.mode : 'collapsed';
  const covered = !!chatActive;
  return {
    mode,
    covered,
    interactive: !covered,
  };
}
