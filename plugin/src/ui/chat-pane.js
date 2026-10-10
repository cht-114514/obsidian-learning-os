import { renderWorkRun } from './work-run.js';
import { renderMessageBody } from './message-body.js';
import { formatManifest } from '../single-session.js';
import { formatRelativeTime, textOfMessage } from './turns.js';
import { parseApplyResponse } from '../intent.js';
import { deliveryView, isDeliveryPlaceholder, visibleUserText } from './delivery.js';

export { textOfMessage };

function avatarLetter(name) {
  const text = String(name || 'A').trim();
  return text.slice(0, 1) || 'A';
}

/**
 * Incremental thread. Rebuilds only when the message id list changes.
 * @param {HTMLElement} el
 * @param {{
 *   agentName?: string,
 *   quiet?: boolean,
 *   skills?: { id: string }[],
 *   canContinue?: boolean,
 *   renderMarkdown?: (el: HTMLElement, markdown: string) => Promise<void>|void,
 *   onConfirm?: (card: HTMLElement, action: string) => void,
 *   onCopy?: (text: string) => void,
 *   onRegenerate?: (message: any) => void,
 *   onStarter?: (skillId: string) => void,
 *   onContinue?: () => void,
 *   jumpHost?: HTMLElement,
 * }} deps
 */
export function mountChatPane(el, deps) {
  el.empty();
  const groups = el.createDiv({ cls: 'aos-groups' });
  const jumpHost = deps.jumpHost || el;
  const jump = jumpHost.createEl('button', {
    cls: 'aos-jump',
    text: '回到底部',
    attr: { type: 'button' },
  });
  jump.hidden = true;
  /** @type {Map<string, any>} */
  const nodes = new Map();
  let signature = '';
  let stick = true;
  let clock = 0;
  let lastState = { messages: [], canContinue: false };

  const onScroll = () => {
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    stick = gap < 80;
    jump.hidden = gap < 140;
  };
  el.addEventListener('scroll', onScroll, { passive: true });
  jump.onclick = () => {
    stick = true;
    el.scrollTop = el.scrollHeight;
    jump.hidden = true;
  };

  function build(message) {
    const role = message.role === 'user' ? 'user' : 'assistant';
    const group = groups.createDiv({ cls: `aos-group is-${role}` });
    if (role === 'assistant') {
      group.createDiv({ cls: 'aos-avatar-sm', text: avatarLetter(deps.agentName) });
    }
    const msg = group.createDiv({ cls: 'aos-msg' });
    const work = role === 'assistant' ? msg.createDiv({ cls: 'aos-work-host' }) : null;
    const bubble = msg.createDiv({ cls: `aos-bubble is-${role}` });
    const foot = msg.createDiv({ cls: 'aos-foot' });
    const time = foot.createEl('button', {
      cls: 'aos-time',
      attr: { type: 'button' },
    });
    const actions = foot.createDiv({ cls: 'aos-actions' });
    const copy = actions.createEl('button', { text: '复制', attr: { type: 'button' } });
    copy.onclick = () => deps.onCopy?.(message.text || '');
    let regen = null;
    if (role === 'assistant') {
      regen = actions.createEl('button', { text: '重新生成', attr: { type: 'button' } });
      regen.onclick = () => deps.onRegenerate?.(message);
    }
    // A turn whose delivery outcome is unknown is resolved by the user, never
    // re-sent automatically.
    const pending = actions.createDiv({ cls: 'aos-pending-actions' });
    const retry = pending.createEl('button', { text: '重发', attr: { type: 'button' } });
    retry.onclick = () => deps.onPendingAction?.(message, 'retry');
    const discard = pending.createEl('button', { text: '忽略', attr: { type: 'button' } });
    discard.onclick = () => deps.onPendingAction?.(message, 'discard');
    const note = msg.createDiv({ cls: 'aos-pending-note' });
    const delivery = role === 'user' ? msg.createDiv({ cls: 'aos-delivery' }) : null;
    if (delivery) {
      delivery.createSpan({ cls: 'aos-delivery-dot', attr: { 'aria-hidden': 'true' } });
      delivery.createSpan({ cls: 'aos-delivery-label' });
      delivery.createSpan({ cls: 'aos-delivery-detail' });
      const retry = delivery.createEl('button', {
        cls: 'aos-delivery-retry',
        text: '重试',
        attr: { type: 'button' },
      });
      retry.hidden = true;
    }
    let manifest = null;
    let manifestBody = null;
    if (role === 'assistant') {
      manifest = msg.createEl('details', { cls: 'aos-manifest' });
      manifest.createEl('summary', { text: '本次参考了什么' });
      manifestBody = manifest.createDiv({ cls: 'aos-manifest-body' });
      manifest.hidden = true;
    }
    const applyRow = role === 'assistant' ? actions.createDiv({ cls: 'aos-apply-actions' }) : null;
    time.onclick = () => foot.toggleClass('is-open', !foot.hasClass('is-open'));
    const node = {
      group,
      work,
      bubble,
      time,
      copy,
      regen,
      pending,
      note,
      delivery,
      manifest,
      manifestBody,
      applyRow,
      text: '',
      done: false,
      gen: 0,
      timer: 0,
    };
    group._node = node;
    return node;
  }

  function paintBody(node, message, immediate) {
    const run = () => {
      const gen = ++node.gen;
      node.text = message.text || '';
      node.done = !message.streaming;
      renderMessageBody(node.bubble, message.text || '', {
        quiet: !!deps.quiet,
        isCurrent: () => node.gen === gen,
        renderMarkdown: deps.renderMarkdown,
        onConfirm: deps.onConfirm,
      })
        .then(() => {
          if (node.gen !== gen || !stick) return;
          el.scrollTop = el.scrollHeight;
          onScroll();
        })
        .catch(() => {});
    };
    if (message.streaming && !immediate) {
      clearTimeout(node.timer);
      node.timer = setTimeout(run, 120);
      return;
    }
    clearTimeout(node.timer);
    run();
  }

  /** @type {Map<string, any>} */
  let assistants = new Map();

  function paintDelivery(node, message) {
    const host = node.delivery;
    if (!host) return;
    const assistant = message.turnId ? assistants.get(message.turnId) : null;
    const source = assistant || message;
    const view = deliveryView(
      {
        status: source.turnStatus || message.turnStatus || '',
        text: assistant?.text || '',
        serverTurnId: source.serverTurnId || '',
        reason: source.errorHint || source.reason || '',
        errorHint: source.errorHint || '',
        sendingAt: source.sendingAt || source.activity?.startedAt || message.ts || 0,
        lastProgressAt: source.lastProgressAt || 0,
      },
      Date.now()
    );
    const show = view.state !== 'sent' && !!view.label;
    host.hidden = !show;
    host.className = `aos-delivery${show ? ` is-${view.state}` : ''}`;
    const label = host.querySelector('.aos-delivery-label');
    const detail = host.querySelector('.aos-delivery-detail');
    const retry = host.querySelector('.aos-delivery-retry');
    if (label) label.textContent = view.label || '';
    if (detail) {
      detail.textContent = view.detail || '';
      detail.hidden = !view.detail;
    }
    if (retry) {
      retry.hidden = !view.canRetry;
      retry.onclick = () => deps.onPendingAction?.(assistant || message, 'retry');
    }
  }

  function armClock(messages) {
    const live = (messages || []).some((message) => {
      const status = message?.turnStatus;
      return status === 'sending' || status === 'queued' || status === 'preparing';
    });
    if (live && !clock) {
      clock = setInterval(() => {
        update(lastState);
      }, 1000);
    }
    if (!live && clock) {
      clearInterval(clock);
      clock = 0;
    }
  }

  function refresh(node, message, prev) {
    const role = message.role === 'user' ? 'user' : 'assistant';
    const prevRole = prev?.role === 'user' ? 'user' : prev ? 'assistant' : '';
    const gap = message.ts && prev?.ts ? message.ts - prev.ts : Infinity;
    node.group.toggleClass('is-continued', prevRole === role && gap < 5 * 60 * 1000);
    node.group.toggleClass('is-streaming', !!message.streaming);
    node.group.toggleClass('is-error', role === 'assistant' && String(message.text || '').startsWith('出错了'));
    if (node.work) renderWorkRun(node.work, message.activity, { streaming: !!message.streaming });
    node.time.setText(formatRelativeTime(message.ts) || '');
    node.time.toggleClass('is-hidden', !(message.ts && gap >= 5 * 60 * 1000));
    if (node.regen) node.regen.onclick = () => deps.onRegenerate?.(message);
    node.copy.onclick = () => deps.onCopy?.(message.text || '');
    if (node.pending) {
      const pendingButtons = node.pending.querySelectorAll('button');
      if (pendingButtons[0]) pendingButtons[0].onclick = () => deps.onPendingAction?.(message, 'retry');
      if (pendingButtons[1]) pendingButtons[1].onclick = () => deps.onPendingAction?.(message, 'discard');
      const turnStatus = message.turnStatus || '';
      const canRetry = turnStatus === 'unknown' || turnStatus === 'error' || turnStatus === 'failed' || turnStatus === 'prep_failed' || turnStatus === 'unconfirmed';
      node.pending.toggleClass('is-open', canRetry);
      node.note.toggleClass('is-open', canRetry && !!(message.errorHint || turnStatus === 'unknown' || turnStatus === 'unconfirmed' || turnStatus === 'prep_failed'));
      node.note.setText(
        message.errorHint ||
          (turnStatus === 'unknown' ? '这条消息可能已经发出，但没拿到回执。先检查结果，确认没有执行过再重试。' : '')
      );
    }
    if (node.manifest) {
      const detail = formatManifest(message.manifest);
      node.manifest.hidden = !detail;
      if (node.manifestBody) node.manifestBody.setText(detail);
    }
    const text = message.text || '';
    const placeholder = role === 'assistant' && isDeliveryPlaceholder(text) && message.turnStatus && message.turnStatus !== 'sent';
    node.group.hidden = !!placeholder;
    if (role === 'user') {
      const shown = visibleUserText(message);
      if (node.text !== shown) {
        node.bubble.empty();
        node.bubble.createDiv({ cls: 'aos-user-text', text: shown });
        node.text = shown;
      }
      paintDelivery(node, message);
      return;
    }
    if (node.applyRow && deps.onCompanionApply) {
      node.applyRow.empty();
      if (!message.streaming && text) {
        const parsed = parseApplyResponse(text);
        if (parsed.mode === 'insert_at_cursor') {
          const btn = node.applyRow.createEl('button', {
            text: '插入原位置',
            attr: { type: 'button' },
          });
          btn.onclick = () => deps.onCompanionApply(message, 'insert');
        } else if (parsed.mode === 'replace_selection') {
          const btn = node.applyRow.createEl('button', {
            text: '替换原选区',
            attr: { type: 'button' },
          });
          btn.onclick = () => deps.onCompanionApply(message, 'replace');
        }
      }
    }
    const textChanged = node.text !== text || node.done === !!message.streaming;
    if (!textChanged) return;
    paintBody(node, message, !message.streaming);
  }

  function showEmpty(canContinue) {
    const empty = groups.createDiv({ cls: 'aos-empty' });
    empty.createDiv({ cls: 'aos-avatar aos-empty-mark', text: avatarLetter(deps.agentName) });
    empty.createDiv({ cls: 'aos-empty-title', text: '从一个问题开始' });
    empty.createEl('p', { text: '发消息，或继续之前的会话。' });
    if (canContinue) {
      const cont = empty.createEl('button', {
        cls: 'aos-continue',
        text: '继续最近会话',
        attr: { type: 'button' },
      });
      cont.onclick = () => deps.onContinue?.();
    }
  }

  function update(state) {
    lastState = state || lastState;
    const messages = state?.messages || [];
    assistants = new Map();
    for (const message of messages) {
      if (message?.role === 'assistant' && message.turnId) assistants.set(message.turnId, message);
    }
    if (!messages.length) {
      for (const node of nodes.values()) clearTimeout(node.timer);
      groups.empty();
      nodes.clear();
      signature = '';
      showEmpty(!!state?.canContinue);
      onScroll();
      armClock(messages);
      return;
    }
    const ids = messages.map((message) => message.id).join('|');
    const force = ids !== signature;
    if (force) {
      for (const node of nodes.values()) clearTimeout(node.timer);
      groups.empty();
      nodes.clear();
      signature = ids;
      for (const message of messages) nodes.set(message.id, build(message));
    }
    let prev = null;
    for (const message of messages) {
      const node = nodes.get(message.id);
      if (node) refresh(node, message, prev);
      prev = message;
    }
    if (stick || force) el.scrollTop = el.scrollHeight;
    onScroll();
    armClock(messages);
  }

  function scrollToEnd() {
    stick = true;
    el.scrollTop = el.scrollHeight;
  }

  function destroy() {
    if (clock) clearInterval(clock);
    clock = 0;
    for (const node of nodes.values()) clearTimeout(node.timer);
    el.removeEventListener('scroll', onScroll);
  }

  return { update, scrollToEnd, destroy };
}
