import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SEND_TIMEOUT_MS,
  PROCESS_TIMEOUT_MS,
  deliveryView,
  explicitRetryAllowed,
  isDeliveryPlaceholder,
  macLinkLabel,
  visibleUserText,
} from '../src/ui/delivery.js';

const now = 1_700_000_000_000;

test('deliveryView reports each send-to-Mac state without touching the user text', () => {
  assert.deepEqual(deliveryView({ status: 'queued' }, now).state, 'queued');
  assert.equal(deliveryView({ status: 'preparing' }, now).label, '准备中');
  assert.equal(
    deliveryView({ status: 'sending', sendingAt: now - 1000 }, now).state,
    'sending'
  );
  assert.equal(
    deliveryView({ status: 'sending', serverTurnId: 'srv-1', sendingAt: now - 1000 }, now).state,
    'delivered'
  );
  assert.equal(deliveryView({ status: 'sending', serverTurnId: 'srv-1', sendingAt: now - 1000 }, now).label, '已送达 Mac');
  assert.equal(
    deliveryView(
      { status: 'sending', serverTurnId: 'srv-1', text: '正在写', sendingAt: now - 1000, lastProgressAt: now - 500 },
      now
    ).state,
    'processing'
  );
  assert.equal(deliveryView({ status: 'sent', text: '好' }, now).state, 'sent');
  assert.equal(deliveryView({ status: 'sent', text: '好' }, now).label, '');
});

test('a failed or timed-out send keeps the original text and can be retried', () => {
  const failed = deliveryView({ status: 'failed', reason: '连不上 Mac 服务' }, now);
  assert.equal(failed.state, 'failed');
  assert.equal(failed.canRetry, true);
  assert.match(failed.detail, /连不上 Mac 服务/);
  const user = { text: '帮我记一下这句' };
  assert.equal(visibleUserText(user, { message: '别的' }), '帮我记一下这句');
  assert.equal(visibleUserText({ text: '  ' }, { message: '帮我记一下这句' }), '帮我记一下这句');
  assert.equal(isDeliveryPlaceholder('待发出（已排队）'), true);
  assert.equal(isDeliveryPlaceholder('出错了：超时'), true);
  assert.equal(isDeliveryPlaceholder('帮我记一下这句'), false);

  const timed = deliveryView(
    { status: 'sending', sendingAt: now - SEND_TIMEOUT_MS - 1, reason: '' },
    now
  );
  assert.equal(timed.state, 'failed');
  assert.equal(timed.timedOut, true);
  assert.equal(timed.label, '发送超时');
  assert.equal(timed.canRetry, true);

  const processing = deliveryView(
    {
      status: 'sending',
      serverTurnId: 'srv-9',
      sendingAt: now - PROCESS_TIMEOUT_MS - 5,
      lastProgressAt: now - PROCESS_TIMEOUT_MS - 1,
    },
    now
  );
  assert.equal(processing.label, '处理超时');
  assert.equal(processing.canRetry, true);
});

test('explicit retry is refused while a send is still inside its window', () => {
  const fresh = { status: 'sending', sendingAt: now - 1000 };
  assert.equal(explicitRetryAllowed(fresh, now).ok, false);
  const stale = { status: 'sending', sendingAt: now - SEND_TIMEOUT_MS - 10 };
  assert.equal(explicitRetryAllowed(stale, now).ok, true);
  assert.equal(explicitRetryAllowed({ status: 'failed', message: '原文' }, now).ok, true);
  assert.equal(explicitRetryAllowed({ status: 'sent' }, now).ok, false);
  assert.equal(explicitRetryAllowed(null, now).ok, false);
});

test('mac link label shows online, offline, and last seen', () => {
  assert.deepEqual(macLinkLabel({ state: 'live', now }), { text: 'Mac 在线', tone: 'live' });
  assert.equal(macLinkLabel({ state: 'live', kernel: 'down', now }).text, 'Mac 在线 · 模型未连接');
  assert.equal(macLinkLabel({ state: 'live', syncing: true, now }).text, 'Mac 在线 · 同步中');
  assert.equal(macLinkLabel({ state: 'offline', now }).text, 'Mac 离线');
  assert.equal(macLinkLabel({ needsPairing: true, state: 'offline', now }).text, '还没配对 Mac');
  assert.equal(macLinkLabel({ state: 'connecting', now }).tone, 'wait');
  const recent = macLinkLabel({ state: 'offline', lastSeenAt: now - 30_000, now });
  assert.equal(recent.text, 'Mac 离线 · 刚刚还在');
  const older = macLinkLabel({ state: 'offline', lastSeenAt: now - 5 * 60_000, now });
  assert.equal(older.text, 'Mac 离线 · 上次连上 5 分钟前');
  assert.equal(older.tone, 'off');
});
