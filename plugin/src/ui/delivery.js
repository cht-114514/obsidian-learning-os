/**
 * What one outbound message should show while it travels to the Mac.
 * Pure: no DOM. The user's text is never rewritten by these helpers.
 */
import { formatRelativeTime } from './turns.js';

/** No Mac receipt yet. */
export const SEND_TIMEOUT_MS = 20_000;
/** Mac accepted the turn but has not produced an answer. */
export const PROCESS_TIMEOUT_MS = 90_000;

const PLACEHOLDERS = new Set([
  '待发出（已排队）',
  '状态未知，需要核对',
  '未确认发送',
  '上下文读取失败',
  '已停止',
]);

/** Status copy written into the assistant draft is not an answer. */
export function isDeliveryPlaceholder(text) {
  const value = String(text || '').trim();
  if (!value) return true;
  if (value.startsWith('出错了')) return true;
  return PLACEHOLDERS.has(value);
}

/**
 * Text to keep on screen for a user turn. Prefer what they typed; fall back
 * to the durable outbox payload so a failed send cannot go blank.
 * @param {{ text?: string } | null | undefined} message
 * @param {{ message?: string, prompt?: string } | null | undefined} pending
 */
export function visibleUserText(message, pending) {
  const typed = String(message?.text || '');
  if (typed.trim()) return typed;
  const saved = String(pending?.message || pending?.prompt || '');
  return saved;
}

function fail(label, detail, timedOut = false) {
  return { state: 'failed', label, detail, canRetry: true, timedOut };
}

/**
 * @param {{
 *   status?: string,
 *   text?: string,
 *   answer?: string,
 *   serverTurnId?: string,
 *   reason?: string,
 *   errorHint?: string,
 *   sendingAt?: number,
 *   startedAt?: number,
 *   updatedAt?: number,
 *   lastProgressAt?: number,
 * }} [input]
 * @param {number} [now]
 * @returns {{ state: 'sending'|'queued'|'delivered'|'processing'|'failed'|'sent', label: string, detail: string, canRetry: boolean, timedOut: boolean }}
 */
export function deliveryView(input = {}, now = Date.now()) {
  const status = String(input.status || '');
  const reason = String(input.reason || input.errorHint || '').trim();
  const answer = input.answer != null ? input.answer : input.text;
  const hasAnswer = !isDeliveryPlaceholder(answer);
  const acked = !!input.serverTurnId;
  const started = Number(input.sendingAt || input.startedAt || input.updatedAt || 0);
  const progressAt = Number(input.lastProgressAt || 0) || started;
  const idle = progressAt ? Math.max(0, now - progressAt) : 0;

  if (status === 'failed' || status === 'error' || status === 'prep_failed') {
    return fail('发送失败', reason || '没有送到 Mac。原文还在，可以重试。');
  }
  if (status === 'unknown' || status === 'unconfirmed' || status === 'needs_verification') {
    return fail('没有送到', reason || '没拿到 Mac 的回执。原文还在。确认那边没有执行过，再重试。');
  }
  if (status === 'aborted') {
    return fail('已停止', reason || '这条已停止。原文还在，可以重试。');
  }
  if (status === 'preparing') {
    return {
      state: 'queued',
      label: '准备中',
      detail: '正在准备，随后发到 Mac。',
      canRetry: false,
      timedOut: false,
    };
  }
  if (status === 'queued') {
    return {
      state: 'queued',
      label: '已排队',
      detail: '保存在手机上，连上 Mac 后会自动发出。',
      canRetry: false,
      timedOut: false,
    };
  }
  if (status === 'sending' && !acked && idle >= SEND_TIMEOUT_MS) {
    return fail('发送超时', reason || 'Mac 太久没有回应。原文还在，可以重试。', true);
  }
  if (status === 'sending' && !acked) {
    return { state: 'sending', label: '发送中', detail: '正在发到 Mac…', canRetry: false, timedOut: false };
  }
  if (status === 'sending' && acked && !hasAnswer && idle >= PROCESS_TIMEOUT_MS) {
    return fail('处理超时', reason || 'Mac 已收到，但一直没有回复。原文还在，可以重试。', true);
  }
  if (status === 'sending' && acked && !hasAnswer) {
    return {
      state: 'delivered',
      label: '已送达 Mac',
      detail: 'Mac 已收到，正在处理。',
      canRetry: false,
      timedOut: false,
    };
  }
  if (status === 'sending' && hasAnswer) {
    return { state: 'processing', label: 'Mac 正在回复', detail: '', canRetry: false, timedOut: false };
  }
  return { state: 'sent', label: '', detail: '', canRetry: false, timedOut: false };
}

/**
 * Whether the user may ask for another attempt.
 * A turn that is still inside the send window cannot be retried.
 * A timed-out send can: the click is explicit, and the Mac dedupes by turn id.
 * @param {{ status?: string, serverTurnId?: string, sendingAt?: number, updatedAt?: number, lastProgressAt?: number } | null} turn
 * @param {number} [now]
 */
export function explicitRetryAllowed(turn, now = Date.now()) {
  if (!turn) return { ok: false, reason: '找不到这条消息' };
  if (turn.status === 'sent') return { ok: false, reason: '这条已经送达' };
  if (turn.status === 'sending') {
    const view = deliveryView({ ...turn, status: 'sending', answer: '' }, now);
    if (!view.canRetry) return { ok: false, reason: '正在发送中' };
  }
  return { ok: true };
}

/**
 * Header line for the link to the Mac.
 * @param {{
 *   state?: string,
 *   needsPairing?: boolean,
 *   lastSeenAt?: number,
 *   kernel?: string,
 *   syncing?: boolean,
 *   now?: number,
 * }} [input]
 * @returns {{ text: string, tone: 'live'|'wait'|'off' }}
 */
export function macLinkLabel(input = {}) {
  const now = input.now || Date.now();
  const state = String(input.state || 'offline');
  if (input.needsPairing) return { text: '还没配对 Mac', tone: 'off' };
  if (state === 'pairing') return { text: '等待 Mac 批准', tone: 'wait' };
  if (state === 'connecting' || (input.syncing && state !== 'live')) {
    return { text: '正在连接 Mac', tone: 'wait' };
  }
  if (state === 'live' || state === 'online') {
    const kernel = String(input.kernel || '');
    const kernelDown = kernel && !/^(live|ok|open|connected)$/i.test(kernel);
    if (kernelDown) return { text: 'Mac 在线 · 模型未连接', tone: 'wait' };
    if (input.syncing) return { text: 'Mac 在线 · 同步中', tone: 'live' };
    return { text: 'Mac 在线', tone: 'live' };
  }
  const seen = Number(input.lastSeenAt) || 0;
  if (seen > 0) {
    const when = formatRelativeTime(seen, now);
    const text = when === '刚刚' ? 'Mac 离线 · 刚刚还在' : `Mac 离线 · 上次连上 ${when}`;
    return { text, tone: 'off' };
  }
  return { text: 'Mac 离线', tone: 'off' };
}
