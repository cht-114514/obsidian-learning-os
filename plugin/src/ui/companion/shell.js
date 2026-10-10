/**
 * Resident companion: capsule, reading card, and full conversation.
 * One composer and one thread stay mounted across states.
 */
import { MarkdownView, Platform } from 'obsidian';
import { mountChatPane } from '../chat-pane.js';
import { mountComposer } from '../composer.js';
import { renderMarkdownWithMath } from '../../markdown-render.js';
import { placeholderFor } from '../connection-view.js';
import { captureContextSnapshot, liveContextLabel } from '../../context-snapshot.js';
import { buildApplyPreview, applyCompanionEdit } from '../../companion-apply.js';
import {
  companionPresentation,
  defaultCapsulePos,
  loadCapsulePos,
  nextCompanionMode,
  placeCard,
  saveCapsulePos,
  shouldThawQuote,
} from './layout.js';
import { bindViewportListeners, navbarReservePx, planViewportBox } from '../mobile-insets.js';
import { macLinkLabel } from '../delivery.js';
import { loadSessionFromPath, SESSION_PATH } from '../../chat-history.js';

const ICON_MORE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="18" cy="12" r="1.5" fill="currentColor"/></svg>';
const ICON_EXPAND =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M10 19H5v-5M19 5l-6 6M5 19l6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_FULL =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_BACK =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function isMobile() {
  return Platform.isMobileApp || Platform.isMobile;
}

/**
 * @param {import('obsidian').App} app
 * @param {any} plugin
 * @param {*} deps
 */
export function createCompanionController(app, plugin, deps) {
  const { Notice, MarkdownRenderer, loadMathJax, renderMath, finishRenderMath } = deps;
  const mobile = isMobile();
  let root = null;
  let capsule = null;
  let capsuleName = null;
  let panel = null;
  let threadHost = null;
  let composerHost = null;
  let contextEl = null;
  let titleEl = null;
  let macEl = null;
  let keyboardSettle = false;
  let quoteWrap = null;
  let quoteTextEl = null;
  let excerptEl = null;
  /** @type {'collapsed'|'peek'|'expanded'} */
  let mode = 'collapsed';
  let inputDraft = '';
  let contextMode = 'follow';
  let pinnedPath = '';
  let unsub = null;
  let detachView = null;
  let thread = null;
  let composer = null;
  let unbindViewport = null;
  let quoteFrozen = false;
  /** @type {any} */
  let frozenSnap = null;
  /** @type {{ left: number, top: number, right: number, bottom: number } | null} */
  let frozenRect = null;
  /** @type {{ bodyOverflow: string, scroller: HTMLElement | null, top: number } | null} */
  let scrollLock = null;
  let seenReplyId = '';
  let threadScroll = 0;
  let measureQueued = false;
  /** @type {Map<string, any>} */
  const turnSnapshots = new Map();

  const ctrl = () => plugin.ensureChatController();

  function notify(msg) {
    try {
      new Notice(msg);
    } catch {
      /* */
    }
  }

  function connectionState() {
    return ctrl().connectionState();
  }

  function draftValue() {
    const live = composerHost?.querySelector('textarea')?.value;
    return live != null ? live : inputDraft || '';
  }

  function rememberDraft() {
    const ta = composerHost?.querySelector('textarea');
    if (ta) inputDraft = ta.value;
  }

  function activeEditor() {
    try {
      return app.workspace.getActiveViewOfType(MarkdownView)?.editor || null;
    } catch {
      return null;
    }
  }

  function coordsFor(editor, cursor) {
    if (!editor || !cursor) return null;
    try {
      if (typeof editor.coordsAtPos === 'function') {
        const box = editor.coordsAtPos(cursor);
        if (box && Number.isFinite(box.top)) return box;
      }
    } catch {
      /* */
    }
    try {
      const cm = editor.cm;
      if (cm && typeof cm.coordsAtPos === 'function' && typeof editor.posToOffset === 'function') {
        const box = cm.coordsAtPos(editor.posToOffset(cursor));
        if (box && Number.isFinite(box.top)) return box;
      }
    } catch {
      /* */
    }
    return null;
  }

  function selectionRect() {
    const editor = activeEditor();
    const text = String(editor?.getSelection?.() || '').trim();
    if (editor && text) {
      const from = editor.getCursor?.('from');
      const to = editor.getCursor?.('to') || from;
      const start = coordsFor(editor, from);
      const end = coordsFor(editor, to) || start;
      if (start && end) {
        return {
          left: Math.min(start.left, end.left),
          top: Math.min(start.top, end.top),
          right: Math.max(start.right ?? start.left, end.right ?? end.left),
          bottom: Math.max(start.bottom ?? start.top, end.bottom ?? end.top),
        };
      }
    }
    const preview = deps.previewSelection;
    if (preview && Number.isFinite(preview.top) && Number.isFinite(preview.bottom)) return preview;
    return null;
  }

  function liveSelectionText() {
    const live = String(activeEditor()?.getSelection?.() || '').trim();
    if (live) return live;
    return String(deps.previewSelection?.text || '').trim();
  }

  function shownQuote() {
    if (quoteFrozen && frozenSnap) return String(frozenSnap.selection || '').trim();
    return liveSelectionText();
  }

  function freezeQuote() {
    if (quoteFrozen) return;
    frozenRect = selectionRect();
    try {
      frozenSnap = captureContextSnapshot(app, {
        mode: contextMode,
        pinnedPath,
        maxChars: plugin.settings.activeNoteMaxChars,
      });
    } catch {
      frozenSnap = null;
    }
    if (frozenSnap && !String(frozenSnap.selection || '').trim()) {
      const text = liveSelectionText();
      if (text) {
        frozenSnap = { ...frozenSnap, selection: text, hasSelection: true };
      }
    }
    quoteFrozen = true;
    paintQuote();
  }

  function latestReply() {
    const messages = ctrl().state?.messages || [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message?.role === 'assistant' && String(message.text || '').trim() && !message.streaming) return message;
    }
    return null;
  }

  function paintQuote() {
    const quote = shownQuote().replace(/\s+/g, ' ').trim();
    if (quoteTextEl) quoteTextEl.setText(quote);
    if (quoteWrap) quoteWrap.hidden = !quote;
    if (!contextEl) return;
    const label = liveContextLabel(app, { mode: contextMode, pinnedPath });
    const parts = [];
    if (contextMode === 'off') parts.push('未附带上下文');
    else if (!label.attached) parts.push(label.title || '未附带正文');
    else parts.push(label.title || '跟随笔记');
    contextEl.setText(parts.join(' '));
    contextEl.hidden = !!quote;
  }

  function paintExcerpt() {
    if (!excerptEl) return;
    const text = String(latestReply()?.text || '').replace(/\s+/g, ' ').trim();
    excerptEl.setText(text);
    excerptEl.hidden = !text;
  }

  function safePx(name) {
    try {
      const parsed = parseFloat(getComputedStyle(document.body).getPropertyValue(name).trim());
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch {
      return 0;
    }
  }

  function currentFrame() {
    const override = typeof deps.previewViewport === 'function' ? deps.previewViewport() : deps.previewViewport;
    let navStack = 0;
    if (mobile && !override) {
      const navEl = document.querySelector('.mobile-navbar');
      if (navEl) {
        navStack = navbarReservePx(navEl.getBoundingClientRect(), getComputedStyle(navEl), window.innerHeight);
      }
      if (!navStack) navStack = 88;
    }
    const focused = !!composerHost?.querySelector('textarea')?.matches?.(':focus');
    if (focused) keyboardSettle = false;
    return planViewportBox({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      viewport: override || window.visualViewport,
      safeTop: safePx('--safe-area-inset-top'),
      safeBottom: safePx('--safe-area-inset-bottom'),
      focused,
      forceClosed: keyboardSettle && !focused,
      navStack,
      margin: 12,
    });
  }

  function lockBackground() {
    if (scrollLock || plugin.isChatViewActive?.()) return;
    const scroller =
      document.querySelector('.workspace-leaf.mod-active .cm-scroller') ||
      document.querySelector('.markdown-source-view .cm-scroller') ||
      document.querySelector('.markdown-preview-view');
    scrollLock = {
      bodyOverflow: document.body.style.overflow,
      scroller,
      top: scroller ? scroller.scrollTop : 0,
    };
    document.body.classList.add('aos-companion-expanded');
    if (scroller) scroller.style.overflow = 'hidden';
  }

  function unlockBackground() {
    document.body.classList.remove('aos-companion-expanded');
    if (!scrollLock) return;
    document.body.style.overflow = scrollLock.bodyOverflow || '';
    if (scrollLock.scroller) {
      scrollLock.scroller.style.overflow = '';
      scrollLock.scroller.scrollTop = scrollLock.top;
    }
    scrollLock = null;
  }

  function placeCapsule() {
    if (!capsule) return;
    if (!mobile) {
      const pos = loadCapsulePos() || defaultCapsulePos(false, window.innerWidth, window.innerHeight);
      if (pos && pos.edge !== 'bottom' && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
        capsule.style.left = `${pos.left}px`;
        capsule.style.top = `${pos.top}px`;
        capsule.style.right = 'auto';
        capsule.style.bottom = 'auto';
        return;
      }
    }
    const frame = currentFrame();
    const height = capsule.offsetHeight || 44;
    capsule.style.right = '16px';
    capsule.style.left = 'auto';
    capsule.style.bottom = 'auto';
    capsule.style.top = `${Math.round(frame.top + frame.height - height)}px`;
  }

  function placePanel() {
    if (!panel || mode === 'collapsed') return;
    const frame = currentFrame();
    panel.toggleClass('is-vv', !!frame.keyboardOpen);
    const room = Math.max(24, Math.min(96, frame.height - 148));
    composer?.setMaxInputHeight?.(room);
    if (mode === 'expanded') {
      panel.removeClass('is-anchored');
      panel.removeClass('is-above');
      panel.removeClass('is-below');
      panel.style.left = `${frame.left}px`;
      panel.style.top = `${frame.top}px`;
      panel.style.width = `${frame.width}px`;
      panel.style.height = `${frame.height}px`;
      panel.style.maxHeight = `${frame.height}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      return;
    }
    const peekWidth = Math.min(frame.width, mobile ? frame.width : 420);
    panel.style.width = `${peekWidth}px`;
    panel.style.height = 'auto';
    panel.style.maxHeight = `${Math.max(120, frame.height)}px`;
    const measured = Math.min(Math.max(panel.offsetHeight || 0, 160), frame.height);
    const placed = placeCard({
      frame,
      selection: quoteFrozen ? frozenRect : selectionRect(),
      card: { width: peekWidth, height: measured },
      gap: 10,
    });
    panel.style.left = `${placed.left}px`;
    panel.style.top = `${placed.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.toggleClass('is-anchored', placed.showPointer);
    panel.toggleClass('is-below', placed.anchor === 'below');
    panel.toggleClass('is-above', placed.anchor === 'above');
    panel.style.setProperty('--aos-pointer-x', `${placed.pointerX}px`);
  }

  function place() {
    placeCapsule();
    placePanel();
    if (mode !== 'peek' || measureQueued) return;
    measureQueued = true;
    const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
    schedule(() => {
      measureQueued = false;
      if (mode === 'peek') placePanel();
    });
  }

  function syncUi() {
    if (!root) return;
    const st = ctrl().state;
    const name = plugin.settings.agentName || 'Agent';
    if (capsuleName) capsuleName.setText(name);
    if (titleEl) titleEl.setText(name);
    const reply = latestReply();
    const unseen = !!(reply && (reply.id || reply.turnId) !== seenReplyId && mode === 'collapsed' && !st.busy);
    capsule?.toggleClass('is-busy', !!st.busy);
    capsule?.toggleClass('has-reply', unseen);
    paintQuote();
    paintExcerpt();
    thread?.update({ messages: st.messages, canContinue: st.sessions.length > 0 });
    composer?.setBusy(st.busy);
    composer?.setThinking?.(plugin.thinkingChoices?.() || [], plugin.resolveOutgoingThinking?.() || '');
    const models = Array.isArray(plugin.kernelModels) ? plugin.kernelModels : [];
    composer?.setModels?.(
      models.map((model) => {
        const id = model.provider && model.id ? `${model.provider}/${model.id}` : model.id;
        const levels = Array.isArray(model.thinkingLevels) ? model.thinkingLevels : [];
        return {
          id,
          label: model.name || model.id,
          provider: model.provider || '',
          thinkingLevels: levels,
        };
      }),
      plugin.connectionPrefs?.().model || ''
    );
    const status = connectionState();
    const link = status.mac || macLinkLabel({
      state: status.state,
      needsPairing: status.needsPairing,
      lastSeenAt: status.lastSeenAt || 0,
      kernel: status.kernel || '',
    });
    if (macEl) {
      macEl.setText(link.text);
      macEl.className = `aos-mac-link is-${link.tone}`;
    }
    const placeholder = status.state === 'live' ? '接着问…' : placeholderFor(status.state, name);
    composer?.setPlaceholder(placeholder);
    const presentation = companionPresentation({ mode }, !!plugin.isChatViewActive?.());
    root.toggleClass('is-covered', presentation.covered);
    root.removeClass('is-hidden');
    document.body.classList.toggle('aos-companion-open', mode !== 'collapsed' && !presentation.covered);
    if (presentation.covered) unlockBackground();
    else if (mode === 'expanded') lockBackground();
  }

  function syncChatCover() {
    syncUi();
  }

  function setMode(next) {
    if (next !== 'collapsed' && plugin.settings.commandBarEnabled === false) return;
    ensureDom();
    if (next !== 'collapsed') attachController();
    if (next === mode) {
      place();
      syncUi();
      return;
    }
    if (mode === 'expanded' && threadHost) threadScroll = threadHost.scrollTop;
    rememberDraft();
    mode = next === 'expanded' || next === 'peek' ? next : 'collapsed';
    root.removeClass('is-collapsed');
    root.removeClass('is-peek');
    root.removeClass('is-expanded');
    root.addClass(`is-${mode}`);
    panel?.setAttr('aria-hidden', mode === 'collapsed' ? 'true' : 'false');
    capsule?.setAttr('aria-expanded', mode === 'collapsed' ? 'false' : 'true');
    if (mode === 'expanded') lockBackground();
    else unlockBackground();
    if (shouldThawQuote(mode, draftValue())) {
      quoteFrozen = false;
      frozenSnap = null;
      frozenRect = null;
    }
    if (mode !== 'collapsed') {
      const reply = latestReply();
      if (reply) seenReplyId = reply.id || reply.turnId || seenReplyId;
    }
    place();
    syncUi();
    if (mode === 'expanded' && threadHost) {
      const restore = threadScroll;
      const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
      schedule(() => {
        if (threadHost && mode === 'expanded') threadHost.scrollTop = restore;
      });
    }
    if (mode !== 'collapsed') ctrl().refreshSessions?.().catch(() => syncUi());
  }

  async function renderMarkdown(el, markdown) {
    await renderMarkdownWithMath({
      app,
      MarkdownRenderer,
      component: plugin,
      el,
      markdown,
      loadMathJax,
      renderMath,
      finishRenderMath,
    });
  }

  function iconButton(parent, cls, label, svg, onClick) {
    const button = parent.createEl('button', {
      cls: `aos-companion-icon ${cls}`,
      attr: { type: 'button', 'aria-label': label },
    });
    button.innerHTML = svg;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  function ensureDom() {
    if (root) return;
    root = document.body.createDiv({ cls: `aos-companion-root is-collapsed${mobile ? ' is-mobile' : ''}` });
    capsule = root.createDiv({
      cls: 'aos-companion-capsule',
      attr: { role: 'button', tabindex: '0', 'aria-expanded': 'false' },
    });
    capsule.createSpan({ cls: 'aos-companion-mark', attr: { 'aria-hidden': 'true' } });
    capsuleName = capsule.createSpan({ cls: 'aos-companion-capsule-name', text: plugin.settings.agentName || 'Agent' });
    capsule.createSpan({ cls: 'aos-companion-capsule-hint', attr: { 'aria-hidden': 'true' } });

    panel = root.createDiv({ cls: 'aos-companion-panel', attr: { 'aria-hidden': 'true' } });
    panel.createDiv({ cls: 'aos-companion-pointer', attr: { 'aria-hidden': 'true' } });
    const head = panel.createDiv({ cls: 'aos-companion-head' });
    head.createSpan({ cls: 'aos-companion-mark', attr: { 'aria-hidden': 'true' } });
    const titleBlock = head.createDiv({ cls: 'aos-companion-titleblock' });
    titleEl = titleBlock.createDiv({ cls: 'aos-companion-title', text: plugin.settings.agentName || 'Agent' });
    macEl = titleBlock.createDiv({ cls: 'aos-mac-link', text: '正在连接 Mac' });
    const headActions = head.createDiv({ cls: 'aos-companion-head-actions' });
    iconButton(headActions, 'aos-companion-more', '更多', ICON_MORE, () => composer?.openMore?.());
    iconButton(headActions, 'aos-companion-expand', '展开对话', ICON_EXPAND, () => setMode('expanded'));
    iconButton(headActions, 'aos-companion-fullscreen', '全屏工作区', ICON_FULL, () => plugin.activateView?.());
    iconButton(headActions, 'aos-companion-back', '收起', ICON_BACK, () => setMode(nextCompanionMode(mode, 'back')));

    quoteWrap = panel.createDiv({ cls: 'aos-companion-quote' });
    quoteWrap.hidden = true;
    const quoteLabel = quoteWrap.createDiv({ cls: 'aos-companion-quote-label', text: '关于这段文字' });
    quoteLabel.addEventListener('click', (event) => {
      event.stopPropagation();
      cycleContextMode();
    });
    quoteTextEl = quoteWrap.createDiv({ cls: 'aos-companion-quote-text' });
    excerptEl = panel.createEl('button', {
      cls: 'aos-companion-excerpt',
      attr: { type: 'button' },
    });
    excerptEl.hidden = true;
    excerptEl.addEventListener('click', () => setMode('expanded'));

    threadHost = panel.createDiv({ cls: 'aos-companion-log' });
    const foot = panel.createDiv({ cls: 'aos-companion-foot' });
    contextEl = foot.createEl('button', {
      cls: 'aos-companion-context',
      attr: { type: 'button' },
    });
    contextEl.addEventListener('click', () => cycleContextMode());
    composerHost = foot.createDiv({ cls: 'aos-companion-composer' });

    thread = mountChatPane(threadHost, {
      agentName: plugin.settings.agentName,
      quiet: plugin.settings.quiet,
      renderMarkdown,
      onCopy: async (text) => {
        try {
          await navigator.clipboard.writeText(text || '');
          notify('已复制');
        } catch {
          notify(text || '');
        }
      },
      onRegenerate: (m) => ctrl().regenerate(m),
      onContinue: () => ctrl().continueRecent(),
      onPendingAction: (m, a) => ctrl().pendingAction(m, a),
      onCompanionApply: async (message, action) => {
        const snap = turnSnapshots.get(message.turnId);
        if (!snap) {
          notify('找不到该轮笔记快照');
          return;
        }
        const preview = await buildApplyPreview(app, snap, message.text);
        const applyMode = action === 'replace' ? 'replace_selection' : 'insert_at_cursor';
        await applyCompanionEdit(app, plugin, {
          snapshot: snap,
          text: preview.cleaned,
          mode: applyMode,
          onNotice: notify,
        });
      },
    });

    composer = mountComposer(composerHost, {
      mobile,
      variant: 'companion',
      onSend: (text) => submit(text),
      onAbort: () => ctrl().abort(),
      onFocus: () => {
        keyboardSettle = false;
        freezeQuote();
        if (mode !== 'expanded') setMode('expanded');
        place();
      },
      onThinking: (id) => plugin.setConnectionPrefs?.({ thinking: id }),
      onModel: (id) => plugin.setKernelModel?.(id),
      onApply: async ({ model, thinking }) => {
        await plugin.setConnectionPrefs?.({ model: model || '', thinking: thinking || '' });
        syncUi();
      },
      onNotice: notify,
    });
    composerHost.addEventListener(
      'pointerdown',
      () => {
        freezeQuote();
      },
      true
    );
    composerHost.addEventListener('focusout', () => {
      place();
      setTimeout(() => {
        if (composerHost?.querySelector('textarea')?.matches?.(':focus')) return;
        keyboardSettle = true;
        place();
      }, 600);
    });

    capsule.addEventListener('click', () => {
      if (capsule.dataset.suppressClick === '1') {
        delete capsule.dataset.suppressClick;
        return;
      }
      setMode(nextCompanionMode(mode, 'capsule'));
    });
    capsule.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      setMode(nextCompanionMode(mode, 'capsule'));
    });
    bindCapsuleDrag();
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('pointerdown', onDocPointerDown, true);
    place();
    if (!unbindViewport) unbindViewport = bindViewportListeners(() => place());
    bindFollowNote();
  }

  function bindCapsuleDrag() {
    if (mobile || !capsule) return;
    let drag = null;
    capsule.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const rect = capsule.getBoundingClientRect();
      drag = {
        id: event.pointerId,
        dx: event.clientX - rect.left,
        dy: event.clientY - rect.top,
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
      capsule.setPointerCapture?.(event.pointerId);
    });
    capsule.addEventListener('pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
      drag.moved = true;
      const maxLeft = Math.max(8, window.innerWidth - capsule.offsetWidth - 8);
      const maxTop = Math.max(8, window.innerHeight - capsule.offsetHeight - 8);
      const left = Math.min(maxLeft, Math.max(8, event.clientX - drag.dx));
      const top = Math.min(maxTop, Math.max(8, event.clientY - drag.dy));
      capsule.style.left = `${left}px`;
      capsule.style.top = `${top}px`;
      capsule.style.right = 'auto';
      capsule.style.bottom = 'auto';
    });
    const end = (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      if (drag.moved) {
        saveCapsulePos({
          left: Math.round(parseFloat(capsule.style.left) || 0),
          top: Math.round(parseFloat(capsule.style.top) || 0),
        });
        capsule.dataset.suppressClick = '1';
      }
      drag = null;
    };
    capsule.addEventListener('pointerup', end);
    capsule.addEventListener('pointercancel', end);
  }

  function cycleContextMode() {
    const order = ['follow', 'pin', 'off'];
    const index = order.indexOf(contextMode);
    contextMode = order[(index + 1) % order.length];
    if (contextMode === 'pin') {
      const view = app.workspace.getActiveViewOfType(MarkdownView);
      pinnedPath = view?.file?.path || pinnedPath || '';
    }
    if (!quoteFrozen) frozenSnap = null;
    paintQuote();
  }

  function onKeydown(event) {
    if (event.key !== 'Escape' || mode === 'collapsed') return;
    if (document.querySelector('.aos-model-mask')) {
      composer?.closeOverlays?.();
      event.preventDefault();
      return;
    }
    event.preventDefault();
    setMode(nextCompanionMode(mode, 'escape'));
  }

  function onDocPointerDown(event) {
    if (mode === 'collapsed' || !root) return;
    const target = event.target;
    if (!(target instanceof Node) || root.contains(target)) return;
    if (target instanceof Element && target.closest('.aos-model-mask, .aos-sheet, .aos-slash')) return;
    const note =
      target instanceof Element &&
      target.closest('.cm-editor, .markdown-source-view, .markdown-preview-view, .markdown-reading-view');
    if (!note) return;
    setMode(nextCompanionMode(mode, 'outside'));
  }

  function bindFollowNote() {
    const onStructure = () => {
      if (!quoteFrozen) paintQuote();
      if (mode === 'peek') place();
      syncChatCover();
    };
    const onEditor = () => {
      if (quoteFrozen) return;
      paintQuote();
      if (mode === 'peek') place();
    };
    const watch = (name, fn) => {
      try {
        const ref = app.workspace.on?.(name, fn);
        if (ref) plugin.registerEvent?.(ref);
      } catch {
        /* */
      }
    };
    watch('active-leaf-change', onStructure);
    watch('file-open', onStructure);
    watch('editor-change', onEditor);
  }

  function attachController() {
    if (unsub) return;
    const controller = ctrl();
    const viewHook = {
      mobile,
      get sidebarOpen() {
        return false;
      },
      onThread: () => syncUi(),
      getDraft: () => draftValue(),
    };
    detachView = controller.attachView(viewHook);
    unsub = controller.subscribe(() => syncUi());
    controller.loadLocalCache();
  }

  async function submit(text) {
    if (!quoteFrozen) freezeQuote();
    const snap =
      frozenSnap ||
      captureContextSnapshot(app, {
        mode: contextMode,
        pinnedPath,
        maxChars: plugin.settings.activeNoteMaxChars,
      });
    const before = ctrl().state.messages.length;
    await ctrl().send(text, { surface: 'companion', contextSnapshot: snap });
    const userRow = ctrl().state.messages.slice(before).find((message) => message.role === 'user');
    if (userRow?.turnId) turnSnapshots.set(userRow.turnId, snap);
    quoteFrozen = false;
    frozenSnap = null;
    frozenRect = null;
    inputDraft = '';
    syncUi();
  }

  function open(opts = {}) {
    if (plugin.settings.commandBarEnabled === false) return;
    ensureDom();
    attachController();
    if (opts.seedText) {
      freezeQuote();
      setMode('expanded');
      const ta = composerHost?.querySelector('textarea');
      if (ta) {
        ta.value = opts.seedText;
        inputDraft = opts.seedText;
        if (!opts.autoSubmit) ta.focus();
      }
      if (opts.autoSubmit) submit(opts.seedText);
      return;
    }
    setMode('peek');
  }

  function close() {
    setMode('collapsed');
  }

  function toggle() {
    if (!root && plugin.settings.commandBarEnabled === false) return;
    setMode(nextCompanionMode(mode, 'capsule'));
  }

  function isOpen() {
    return mode !== 'collapsed';
  }

  function destroy() {
    unsub?.();
    detachView?.();
    unbindViewport?.();
    unbindViewport = null;
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    unlockBackground();
    composer?.destroy?.();
    root?.remove();
    root = null;
    document.body.classList.remove('aos-companion-open');
  }

  async function openLegacyHistory() {
    const session = await loadSessionFromPath(app, SESSION_PATH);
    if (!session?.messages?.length) {
      notify('没有可读的旧命令条历史');
      return;
    }
    notify(`旧会话只读：${session.messages.length} 条消息（agent-inbox/sessions/current.json）`);
  }

  try {
    if (plugin.settings.commandBarEnabled !== false) {
      ensureDom();
      syncUi();
    }
  } catch (error) {
    console.error('Agent companion failed to mount', error);
  }

  return {
    open,
    close,
    toggle,
    isOpen,
    destroy,
    expand: () => setMode('expanded'),
    collapse: () => setMode('collapsed'),
    peek: () => setMode('peek'),
    syncChatCover,
    openLegacyHistory,
  };
}
