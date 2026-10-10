/**
 * OpenClaw-style shell: drawer, thread, composer, connection banner.
 *
 * Outbound turns never bypass the store: `send()` writes the transcript and the
 * pending record, then the outbox runner delivers it. Switching sessions,
 * closing the view, or replacing the socket cannot drop a pending message.
 */
import { handleConfirmAccept, handleConfirmReject } from '../confirm-actions.js';
import { renderMarkdownWithMath } from '../markdown-render.js';
import { mountSidebar, sessionKey } from './sidebar.js';
import { mountChatPane } from './chat-pane.js';
import { mountComposer } from './composer.js';
import { placeholderFor, renderConnection } from './connection-view.js';
import { bindViewportListeners, navbarReservePx, readShellKeyboard, resolveMobileKeyboardPx } from './mobile-insets.js';
import { macLinkLabel } from './delivery.js';
import { phaseLabel } from './turn-phase.js';
import { AOS_BUILD } from './build-id.js';
import { createChatController } from '../kernel/chat-controller.js';

const ICON_MENU =
  '<svg class="aos-svg-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';

function isMobileApp(app) {
  const body = typeof document !== 'undefined' ? document.body : null;
  return !!(
    app?.isMobile ||
    app?.isPhone ||
    body?.classList?.contains('is-mobile') ||
    body?.classList?.contains('is-phone')
  );
}

function usageOf(row) {
  const used = Number(row?.totalTokens);
  const limit = Number(row?.contextTokens);
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return null;
  return { used, limit };
}

export function mountAgentApp(container, deps) {
  const plugin = deps.plugin;
  const app = deps.app;
  const mobile = isMobileApp(app);
  const root = container.createDiv({
    cls: `aos-root${mobile ? ' is-mobile' : ''}`,
  });
  const shell = root.createDiv({ cls: 'aos-shell' });
  const backdrop = shell.createDiv({ cls: 'aos-backdrop' });
  const sidebarEl = shell.createDiv({ cls: mobile ? 'aos-sidebar' : 'aos-sidebar is-open' });
  const main = shell.createDiv({ cls: 'aos-main' });
  const top = main.createDiv({ cls: 'aos-topbar' });
  const menuBtn = top.createEl('button', {
    cls: 'aos-icon-btn aos-top-menu',
    attr: { type: 'button', 'aria-label': '会话' },
  });
  menuBtn.innerHTML = ICON_MENU;
  const titleWrap = top.createDiv({ cls: 'aos-top-copy' });
  const titleEl = titleWrap.createDiv({ cls: 'aos-top-title', text: '主会话' });
  const macEl = titleWrap.createDiv({ cls: 'aos-mac-link', text: '正在连接 Mac' });

  const connection = main.createDiv({ cls: 'aos-connection' });
  const log = main.createDiv({ cls: 'aos-log' });
  const jumpHost = main.createDiv({ cls: 'aos-jump-host' });
  const composerHost = main.createDiv({ cls: 'aos-composer-host' });
  const ctrl = deps.plugin.ensureChatController();
  ctrl.loadLocalCache();
  const state = ctrl.state;
  const ui = { sidebarOpen: !mobile };
  Object.defineProperty(state, 'sidebarOpen', {
    get: () => ui.sidebarOpen,
    set: (v) => { ui.sidebarOpen = !!v; },
    enumerable: true,
    configurable: true,
  });
  let viewHook = {
    mobile,
    get sidebarOpen() { return ui.sidebarOpen; },
    onThread: () => paintThread(),
    onComposerFocus: () => composer?.focus?.(),
    onCloseSidebar: () => { ui.sidebarOpen = false; },
    getDraft: () => composerHost.querySelector('textarea')?.value || '',
  };
  let detachCtrl = () => {};
  let unsubCtrl = () => {};
  const send = (text, opts) => ctrl.send(text, opts);
  const abort = () => ctrl.abort();
  const openSession = (k, o) => ctrl.openSession(k, o);
  const refreshSessions = () => ctrl.refreshSessions();
  const flushOutbox = () => ctrl.flushOutbox();
  const recoverFromBackground = () => ctrl.recoverFromBackground();
  const pendingAction = (m, a) => ctrl.pendingAction(m, a);
  const regenerate = (m) => ctrl.regenerate(m);
  const connectionState = () => ctrl.connectionState();
  const continueRecent = () => ctrl.continueRecent();
  const entryMode = () => ctrl.entryMode();
  const showDiagnosis = () => ctrl.showDiagnosis();
  const checkService = () => ctrl.checkService();
  const confirm = async (card, action) => {
    const p = card.getAttribute('data-path') || '';
    if (!p) return;
    const file = app.vault.getAbstractFileByPath(p);
    if (!file) { deps.Notice?.(`找不到 ${p}`); return; }
    const markdown = await app.vault.read(file);
    const result = action === 'accept' ? handleConfirmAccept(markdown) : handleConfirmReject(markdown);
    if (!result.ok) { deps.Notice?.(result.reason || '无法更新确认卡'); return; }
    await app.vault.modify(file, result.markdown);
    deps.Notice?.(action === 'accept' ? '已接受' : '已拒绝');
  };
  const sidebar = mountSidebar(sidebarEl, {
    onSelect: (key) => openSession(key),
    onSearch: (query) => ctrl.searchTimeline?.(query),
    onBack: () => {
      state.sidebarOpen = false;
      paintChrome();
      deps.onReturnToNotes?.();
    },
  });

  const thread = mountChatPane(log, {
    agentName: plugin.settings.agentName,
    quiet: plugin.settings.quiet,
    jumpHost,
    renderMarkdown: (el, markdown) => renderMarkdown(el, markdown),
    onConfirm: (card, action) => confirm(card, action),
    onCopy: async (text) => {
      try {
        await navigator.clipboard.writeText(text || '');
        deps.Notice?.('已复制');
      } catch {
        deps.Notice?.(text || '');
      }
    },
    onRegenerate: (message) => regenerate(message),
    onContinue: () => continueRecent(),
    onPendingAction: (message, action) => pendingAction(message, action),
  });

  const composer = mountComposer(composerHost, {
    mobile,
    onSend: (text) => send(text),
    onAbort: () => abort(),
    onThinking: (id) => plugin.setConnectionPrefs?.({ thinking: id }),
    onModel: (id) => plugin.setKernelModel?.(id),
    onApply: async ({ model, thinking }) => {
      await plugin.setConnectionPrefs?.({ model: model || '', thinking: thinking || '' });
      paintChrome();
    },
    onNotice: (message) => deps.Notice?.(message),
  });
  detachCtrl = ctrl.attachView(viewHook);
  unsubCtrl = ctrl.subscribe(() => paintChrome());

  function chatAnchorEl() {
    return (
      container.closest?.('.workspace-leaf-content[data-type="me-soul-chat"]') ||
      container.closest?.('.workspace-leaf-content') ||
      container
    );
  }

  function chatLeafActive() {
    const leaf = deps.view?.leaf;
    if (leaf && app?.workspace?.activeLeaf) {
      return app.workspace.activeLeaf === leaf;
    }
    const anchor = chatAnchorEl();
    const activeView = app?.workspace?.activeLeaf?.view;
    if (!anchor || !activeView) return true;
    const host = activeView.containerEl || activeView.contentEl;
    return !!(host && (host === container || host.contains(container)));
  }

  function syncChatActive() {
    const active = chatLeafActive();
    document.body.classList.toggle('aos-chat-active', !!(mobile && active));
  }

  let unbindLeafWatch = () => {};
  if (mobile && app?.workspace?.on) {
    const onLeaf = () => {
      syncChatActive();
      applyNavbar();
    };
    const ref = app.workspace.on('active-leaf-change', onLeaf);
    unbindLeafWatch = () => ref?.();
    syncChatActive();
  }

  function shouldHideNavbar() {
    return !!(mobile && chatLeafActive());
  }

  backdrop.onclick = () => {
    state.sidebarOpen = false;
    paintChrome();
  };
  menuBtn.onclick = () => toggleDrawer();

  function activeRow() {
    return state.sessions.find((row) => sessionKey(row) === state.activeKey) || null;
  }

  function emitTitle() {
    const title = '主会话';
    if (titleEl) titleEl.setText(title);
    deps.onTitle?.(title);
  }

  function paintChrome() {
    viewHook.sidebarOpen = ui.sidebarOpen;
    const drawerOpen = !!(mobile && state.sidebarOpen);
    root.toggleClass('is-drawer', drawerOpen);
    document.body.classList.toggle('aos-drawer-open', drawerOpen);
    if (drawerOpen) {
      composer.closeOverlays?.();
      composer.blur?.();
    }
    const status = connectionState();
    sidebar.update({
      agentName: plugin.settings.agentName,
      sessions: state.sessions,
      activeKey: state.activeKey,
      open: state.sidebarOpen || !mobile,
      connection: status.state,
      syncHint: state.syncHint || '',
      now: Date.now(),
      singleSession: !!plugin.settings.singleSession,
      timelineHits: state.timelineHits || [],
    });
    thread.update({
      messages: state.messages,
      canContinue: state.sessions.length > 0,
    });
    composer.setBusy(state.busy);
    composer.setProgress({
      on: state.busy,
      label: state.progressLabel || phaseLabel({ status: 'sending' }),
      startedAt: state.startedAt,
      check: state.progressCheck || null,
    });
    composer.setPlaceholder(placeholderFor(status.state, plugin.settings.agentName));
    composer.setUsage(usageOf(activeRow()));
    composer.setThinking(plugin.thinkingChoices?.() || [], plugin.resolveOutgoingThinking?.() || '');
    const models = Array.isArray(plugin.kernelModels) ? plugin.kernelModels : [];
    composer.setModels(
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
    renderConnection(connection, status, {
      onRetry: () => {
        if (entryMode() === 'service') {
          checkService()
            .then(() => refreshSessions())
            .catch(() => paintChrome());
          return;
        }
        plugin.ensureOperator?.().then(() => refreshSessions());
      },
      onPair: () => deps.onPairDevice?.(),
      onCopy: async (text) => {
        try {
          await navigator.clipboard.writeText(text);
          deps.Notice?.('已复制');
        } catch {
          deps.Notice?.(text);
        }
      },
      onDetails: () => showDiagnosis(),
    });
    const link = status.mac || macLinkLabel({
      state: status.state,
      needsPairing: status.needsPairing,
      lastSeenAt: status.lastSeenAt || 0,
      kernel: status.kernel || '',
      syncing: !!state.sessionsLoading,
    });
    macEl.setText(link.text);
    macEl.className = `aos-mac-link is-${link.tone}`;
    macEl.setAttr('aria-label', link.text);
    emitTitle();
    applyNavbar();
  }

  function paintThread() {
    thread.update({ messages: state.messages });
    if (state.busy) {
      composer.setProgress({
        on: true,
        label: state.progressLabel || phaseLabel({ status: 'sending', hasText: true }),
        startedAt: state.startedAt,
      });
    }
  }

  async function renderMarkdown(el, markdown) {
    if (!deps.MarkdownRenderer && !deps.renderMath) {
      el.setText(markdown);
      return;
    }
    await renderMarkdownWithMath({
      app,
      MarkdownRenderer: deps.MarkdownRenderer,
      component: deps.view || plugin,
      el,
      markdown,
      loadMathJax: deps.loadMathJax,
      renderMath: deps.renderMath,
      finishRenderMath: deps.finishRenderMath,
    });
  }

  function applySafeTop() {
    let px = 0;
    try {
      const raw = getComputedStyle(document.body).getPropertyValue('--safe-area-inset-top').trim();
      const parsed = parseFloat(raw);
      if (parsed > 0) px = parsed;
    } catch {
      /* ignore */
    }
    if (!px && mobile) px = 54;
    if (!mobile) px = 0;
    root.style.setProperty('--aos-safe-top', `${Math.round(px)}px`);
  }

  function applyNavbar() {
    applySafeTop();
    const hide = shouldHideNavbar();
    document.body.classList.toggle('aos-hide-navbar', hide);
    let navStack = 0;
    let navEl = null;
    if (hide) {
      root.style.setProperty('--aos-navbar-h', '0px');
      root.style.removeProperty('--aos-nav-clearance');
    } else {
      navEl = document.querySelector('.mobile-navbar');
      if (navEl) {
        const rect = navEl.getBoundingClientRect();
        const style = getComputedStyle(navEl);
        navStack = navbarReservePx(rect, style, window.innerHeight);
      }
      if (!navStack) navStack = 96;
      root.style.setProperty('--aos-navbar-h', `${navStack}px`);
      root.style.setProperty('--aos-nav-clearance', `${navStack}px`);
    }
    applyKeyboardInset();
    if (navEl && navStack < 120 && typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        const rect2 = navEl.getBoundingClientRect();
        if (rect2.top < 8) return;
        const next = navbarReservePx(rect2, getComputedStyle(navEl), window.innerHeight);
        if (next > navStack) {
          root.style.setProperty('--aos-navbar-h', `${next}px`);
          root.style.setProperty('--aos-nav-clearance', `${next}px`);
        }
      });
    }
  }

  let forceKeyboardClosed = false;
  let settleTimer = 0;

  function composerFocused() {
    return !!composerHost.querySelector('textarea')?.matches?.(':focus');
  }

  function safeBottomPx() {
    try {
      const raw = getComputedStyle(document.body).getPropertyValue('--safe-area-inset-bottom').trim();
      const parsed = parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    } catch {
      return 0;
    }
  }

  function applyKeyboardInset() {
    if (!mobile) return;
    const focused = composerFocused();
    if (focused) forceKeyboardClosed = false;
    const rect = root.getBoundingClientRect();
    let cssKeyboard = 0;
    if (!window.visualViewport && focused) {
      cssKeyboard = resolveMobileKeyboardPx(getComputedStyle(document.body), null, window.innerHeight, { focused: true });
    }
    const frame = readShellKeyboard({
      shellHeight: rect.height,
      innerHeight: window.innerHeight,
      viewport: window.visualViewport,
      safeBottom: safeBottomPx(),
      focused,
      forceClosed: forceKeyboardClosed && !focused,
      cssKeyboard,
    });
    root.style.setProperty('--aos-kb', `${frame.overlap}px`);
    root.style.setProperty('--aos-keyboard', `${frame.overlap}px`);
    root.classList.toggle('is-keyboard', frame.keyboardOpen);
  }

  function settleKeyboard() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (composerFocused()) return;
      forceKeyboardClosed = true;
      applyKeyboardInset();
    }, 600);
  }

  composerHost.addEventListener('focusin', () => {
    forceKeyboardClosed = false;
    clearTimeout(settleTimer);
    applyKeyboardInset();
  });
  composerHost.addEventListener('focusout', () => {
    applyKeyboardInset();
    settleKeyboard();
  });

  function bindNavbar() {
    const nav = document.querySelector('.mobile-navbar');
    if (!nav || typeof ResizeObserver === 'undefined') return () => {};
    const observer = new ResizeObserver(() => applyNavbar());
    observer.observe(nav);
    return () => observer.disconnect();
  }

  const unbindKeyboard = mobile ? bindViewportListeners(() => applyKeyboardInset()) : () => {};
  const unbindNavbar = mobile ? bindNavbar() : () => {};

  function toggleDrawer() {
    state.sidebarOpen = !state.sidebarOpen;
    paintChrome();
    if (state.sidebarOpen) {
      composerHost.querySelector('textarea')?.blur();
      refreshSessions();
    }
  }

  if (deps.preview) {
    state.sessions = deps.preview.sessions || [];
    state.messages = deps.preview.messages || [];
    state.activeKey = deps.preview.activeKey || sessionKey(state.sessions[0]) || '';
    state.sidebarOpen = !!deps.preview.drawer;
    if (deps.preview.keyboard) {
      root.style.setProperty('--aos-kb', deps.preview.keyboard);
      root.style.setProperty('--aos-keyboard', deps.preview.keyboard);
      root.classList.toggle('is-keyboard', parseFloat(deps.preview.keyboard) > 0);
    }
  }

  
  const offStatus = plugin.operator?.onStatus?.((status) => {
    // The legacy socket only matters in direct mode; in service mode the
    // operator is not started at all.
    if (entryMode() === 'service') return;
    paintChrome();
    if (status?.state === 'live') {
      refreshSessions().catch(() => paintChrome());
    }
  });
  paintChrome();
  if (mobile && typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => applyNavbar());
  }
  if (!deps.preview) {
    // Cold start: reconcile delivered/executed state before sending anything,
    // then flush whatever the phone still owes the Mac.
    if (entryMode() === 'service') {
      checkService()
        .then(() => refreshSessions())
        .catch(() => paintChrome());
    } else {
      plugin
        .ensureOperator?.()
        .then(() => refreshSessions())
        .catch(() => paintChrome());
    }
  }

  return {
    destroy() {
      unsubCtrl?.();
      detachCtrl?.();
      clearTimeout(settleTimer);
      unbindKeyboard();
      unbindNavbar();
      unbindLeafWatch();
      offStatus?.();
      thread.destroy();
      composer.destroy();
      document.body.classList.remove('aos-hide-navbar');
      document.body.classList.remove('aos-chat-active');
      document.body.classList.remove('aos-drawer-open');
      root.remove();
    },
    toggleDrawer,
    async reloadSession() {
      if (state.activeKey) await openSession(state.activeKey);
      await flushOutbox();
    },
    async recover() {
      await recoverFromBackground();
    },
    async consumeQueuedLaunch() {
      const launch = plugin.takeChatLaunch?.();
      if (!launch?.skillId) return;
      const text = `/${launch.skillId}${launch.text ? ` ${launch.text}` : ''}`;
      if (launch.autoSend !== false) await send(text);
    },
  };
}
