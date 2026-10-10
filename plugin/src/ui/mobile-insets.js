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
 * How far the chat shell must lift so its bottom meets the visual viewport.
 *
 * The shell is a flex column. This overlap becomes one CSS variable
 * (`--aos-kb`); the composer is the last flex child and is not `position: fixed`.
 *
 * If Obsidian has already shrunk the leaf to the visual viewport, the gap is 0
 * and we add nothing — we do not stack a second keyboard offset on top of
 * Obsidian's own resize. A stuck gap after the keyboard is dismissed is cleared
 * by `forceClosed` (blur / settle), not by snapping mid-animation.
 *
 * @param {{
 *   shellHeight?: number,
 *   innerHeight?: number,
 *   viewport?: { height?: number, offsetTop?: number, scale?: number } | null,
 *   safeBottom?: number,
 *   focused?: boolean,
 *   forceClosed?: boolean,
 *   cssKeyboard?: number,
 * }} [opts]
 */
export function readShellKeyboard(opts = {}) {
  if (opts.forceClosed) return { overlap: 0, keyboardOpen: false, settled: true };
  const safe = Math.max(0, Number(opts.safeBottom) || 0);
  const slack = safe + 12;
  const vv = opts.viewport || null;
  const scale = Number(vv?.scale);
  if (vv && Number.isFinite(scale) && Math.abs(scale - 1) > 0.02) {
    return { overlap: 0, keyboardOpen: false, settled: true };
  }
  const height0 = Math.max(0, Number(opts.innerHeight) || 0);
  const shell = Math.max(0, Number(opts.shellHeight) || 0);
  if (vv && Number(vv.height) > 0 && height0) {
    const viewH = Math.max(0, Number(vv.height) || 0);
    const gap = Math.max(0, height0 - viewH - (Number(vv.offsetTop) || 0));
    if (gap <= slack) return { overlap: 0, keyboardOpen: false, settled: true };
    // The leaf is already as short as the visual viewport: Obsidian moved it.
    if (shell > 0 && shell <= viewH + slack) return { overlap: 0, keyboardOpen: false, settled: true };
    return { overlap: Math.round(gap), keyboardOpen: true, settled: false };
  }
  if (opts.focused) {
    const gap = Math.max(0, Number(opts.cssKeyboard) || 0);
    if (gap > slack) return { overlap: Math.round(gap), keyboardOpen: true, settled: false };
  }
  return { overlap: 0, keyboardOpen: false, settled: true };
}

/**
 * Panel rectangle pinned to the visual viewport.
 * The viewport already ends above the keyboard, so the keyboard is not
 * subtracted a second time. After blur, `forceClosed` drops a stale gap and
 * the panel uses the full layout height (safe area + navbar once).
 *
 * @param {{
 *   innerWidth?: number,
 *   innerHeight?: number,
 *   viewport?: { width?: number, height?: number, offsetTop?: number, offsetLeft?: number, scale?: number } | null,
 *   safeTop?: number,
 *   safeBottom?: number,
 *   navStack?: number,
 *   margin?: number,
 *   focused?: boolean,
 *   forceClosed?: boolean,
 * }} [opts]
 */
export function planViewportBox(opts = {}) {
  const margin = Math.max(0, opts.margin == null ? 12 : Number(opts.margin) || 0);
  const width0 = Math.max(0, Number(opts.innerWidth) || 0);
  const height0 = Math.max(0, Number(opts.innerHeight) || 0);
  const safeTop = Math.max(0, Number(opts.safeTop) || 0);
  const safeBottom = Math.max(0, Number(opts.safeBottom) || 0);
  const navStack = Math.max(0, Number(opts.navStack) || 0);
  const closed = () => {
    const topInset = margin + safeTop;
    const bottomInset = Math.round(safeBottom + navStack);
    return {
      left: margin,
      top: topInset,
      width: Math.max(0, Math.round(width0 - margin * 2)),
      height: Math.max(0, Math.round(height0 - topInset - bottomInset)),
      keyboardPx: 0,
      keyboardOpen: false,
      bottomInset,
      settled: true,
    };
  };
  if (opts.forceClosed) return closed();
  const vv = opts.viewport || null;
  const scale = Number(vv?.scale);
  const zoomed = vv && Number.isFinite(scale) && Math.abs(scale - 1) > 0.02;
  if (!vv || !width0 || !height0 || zoomed) return closed();
  const originLeft = Number(vv.offsetLeft) || 0;
  const originTop = Number(vv.offsetTop) || 0;
  const viewW = Math.max(0, Number(vv.width) || width0);
  const viewH = Math.max(0, Number(vv.height) || height0);
  const gap = Math.max(0, height0 - viewH - originTop);
  const slack = safeBottom + 12;
  if (gap <= slack) return closed();
  const topInset = margin;
  const bottomInset = 8;
  return {
    left: Math.round(originLeft + margin),
    top: Math.round(originTop + topInset),
    width: Math.max(0, Math.round(viewW - margin * 2)),
    height: Math.max(0, Math.round(viewH - topInset - bottomInset)),
    keyboardPx: Math.round(gap),
    keyboardOpen: true,
    bottomInset,
    settled: false,
  };
}

/**
 * Coalesce viewport events onto one animation frame. Caller removes the listeners.
 * A change that arrives while a frame is already queued is kept and run next,
 * so a keyboard animation is not dropped.
 * @param {() => void} onChange
 */
export function bindViewportListeners(onChange) {
  let frame = 0;
  let timer = 0;
  let dirty = false;
  const schedule = () => {
    if (frame || timer) {
      dirty = true;
      return;
    }
    const run = () => {
      frame = 0;
      timer = 0;
      dirty = false;
      onChange();
      if (dirty) schedule();
    };
    if (typeof requestAnimationFrame === 'function') {
      frame = requestAnimationFrame(run);
      return;
    }
    timer = setTimeout(run, 16);
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
