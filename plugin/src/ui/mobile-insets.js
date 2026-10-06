/**
 * Mobile keyboard inset: with visualViewport, track the live gap each frame.
 * --keyboard-height is only used when visualViewport is unavailable.
 * @param {CSSStyleDeclaration} bodyStyle
 * @param {VisualViewport|null} viewport
 * @param {number} innerHeight
 * @returns {number}
 */
export function resolveMobileKeyboardPx(bodyStyle, viewport, innerHeight, opts = {}) {
  const focused = opts.focused !== false;
  let safeBottom = 0;
  try {
    const safeRaw = bodyStyle.getPropertyValue('--safe-area-inset-bottom').trim();
    const safeParsed = parseFloat(safeRaw);
    if (Number.isFinite(safeParsed) && safeParsed > 0) safeBottom = safeParsed;
  } catch {
    /* ignore */
  }
  const threshold = Math.max(80, safeBottom + 48);

  if (viewport && innerHeight) {
    const scale = Number(viewport.scale);
    // Pinch-zoom also shrinks visualViewport. That gap is not a keyboard.
    if (Number.isFinite(scale) && Math.abs(scale - 1) > 0.02) return 0;
    const gap = Math.max(0, innerHeight - viewport.height - (viewport.offsetTop || 0));
    if (gap <= threshold) return 0;
    return Math.round(gap);
  }

  let css = 0;
  try {
    const raw = bodyStyle.getPropertyValue('--keyboard-height').trim();
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed) && parsed > 0) css = Math.round(parsed);
  } catch {
    /* ignore */
  }
  if (!focused) return 0;
  if (css > 0) return css;
  return 0;
}

/**
 * @param {DOMRect} rect
 * @param {CSSStyleDeclaration} style
 * @param {number} [viewportHeight]
 * @returns {number}
 */
/**
 * One bottom offset for the composer.
 * Keyboard open: 8px above the keyboard, no home-indicator padding.
 * Keyboard closed: safe area once. A visible navbar already includes it.
 */
export function composerOffsetPx({ keyboardPx = 0, safeBottom = 0, navStack = 0, hideNavbar = false } = {}) {
  const keyboard = Number(keyboardPx) || 0;
  if (keyboard > 0) return Math.round(keyboard + 8);
  if (hideNavbar) return Math.round(8 + Math.max(0, Number(safeBottom) || 0));
  return Math.round(Math.max(0, Number(navStack) || 0) + 8);
}

function cssPx(style, name) {
  if (!style || typeof style.getPropertyValue !== 'function') return 0;
  try {
    const parsed = parseFloat(String(style.getPropertyValue(name) || '').trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

/**
 * Usable rectangle for the companion card.
 * A live visualViewport already ends above the keyboard, so the frame only
 * keeps an 8px gap — it does not subtract the keyboard a second time.
 * Without visualViewport, --keyboard-height applies only while the input is focused.
 * Zoom (scale away from 1) is not treated as a keyboard.
 *
 * @param {{
 *   innerWidth?: number,
 *   innerHeight?: number,
 *   viewport?: { width?: number, height?: number, offsetTop?: number, offsetLeft?: number, scale?: number } | null,
 *   bodyStyle?: CSSStyleDeclaration | { getPropertyValue: (name: string) => string } | null,
 *   focused?: boolean,
 *   safeTop?: number,
 *   safeBottom?: number,
 *   navStack?: number,
 *   margin?: number,
 * }} [opts]
 */
export function readVisibleFrame(opts = {}) {
  const style = opts.bodyStyle || { getPropertyValue: () => '' };
  const safeTopPx = (Number(opts.safeTop) > 0 ? Number(opts.safeTop) : 0) || cssPx(style, '--safe-area-inset-top');
  const safeBottomPx =
    (Number(opts.safeBottom) > 0 ? Number(opts.safeBottom) : 0) || cssPx(style, '--safe-area-inset-bottom');
  const gutter = Math.max(0, opts.margin == null ? 12 : Number(opts.margin) || 0);
  const width0 = Math.max(0, Number(opts.innerWidth) || 0);
  const height0 = Math.max(0, Number(opts.innerHeight) || 0);
  const viewport = opts.viewport || null;
  const focused = !!opts.focused;

  let originLeft = 0;
  let originTop = 0;
  let viewW = width0;
  let viewH = height0;
  let keyboardPx = 0;

  if (viewport && width0 && height0) {
    originLeft = Number(viewport.offsetLeft) || 0;
    originTop = Number(viewport.offsetTop) || 0;
    viewW = Math.max(0, Number(viewport.width) || width0);
    viewH = Math.max(0, Number(viewport.height) || height0);
    keyboardPx = resolveMobileKeyboardPx(style, viewport, height0, { focused });
  } else {
    keyboardPx = resolveMobileKeyboardPx(style, null, height0, { focused });
    if (keyboardPx > 0) viewH = Math.max(0, height0 - keyboardPx);
  }

  const keyboardOpen = keyboardPx > 0;
  const topInset = keyboardOpen ? gutter : gutter + safeTopPx;
  const bottomInset = keyboardOpen
    ? 8
    : Math.round(safeBottomPx + Math.max(0, Number(opts.navStack) || 0));
  return {
    left: Math.round(originLeft + gutter),
    top: Math.round(originTop + topInset),
    width: Math.max(0, Math.round(viewW - gutter * 2)),
    height: Math.max(0, Math.round(viewH - topInset - bottomInset)),
    keyboardPx,
    keyboardOpen,
    bottomInset,
  };
}

/**
 * Coalesce viewport events onto one animation frame. Caller removes the listeners.
 * @param {() => void} onChange
 */
export function bindViewportListeners(onChange) {
  let frame = 0;
  let timer = 0;
  const schedule = () => {
    if (frame || timer) return;
    if (typeof requestAnimationFrame === 'function') {
      frame = requestAnimationFrame(() => {
        frame = 0;
        onChange();
      });
      return;
    }
    timer = setTimeout(() => {
      timer = 0;
      onChange();
    }, 16);
  };
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  vv?.addEventListener('resize', schedule);
  vv?.addEventListener('scroll', schedule);
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
  }
  schedule();
  return () => {
    if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    if (timer) clearTimeout(timer);
    frame = 0;
    timer = 0;
    vv?.removeEventListener('resize', schedule);
    vv?.removeEventListener('scroll', schedule);
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
    }
  };
}

export function navbarReservePx(rect, style, viewportHeight = 0) {
  const visible =
    style.display !== 'none' && style.visibility !== 'hidden' && rect.height > 8;
  if (!visible) return 0;
  let fromTop = 0;
  if (viewportHeight > 0 && rect.top > 0 && rect.top < viewportHeight) {
    fromTop = Math.round(viewportHeight - rect.top);
  }
  const marginBottom = parseFloat(style.marginBottom) || 0;
  const fromBox = Math.round(rect.height + marginBottom);
  return Math.max(fromTop, fromBox);
}
