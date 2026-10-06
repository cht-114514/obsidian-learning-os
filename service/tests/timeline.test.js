import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.js';
import { agentOsSessionKey } from '../src/timeline.js';

let dir;
let store;

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'aos-timeline-'));
  store = createStore(join(dir, 'timeline.sqlite'));
});

after(() => {
  store?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('conversation timeline', () => {
  it('keeps the user text when the process stops before the turn runs', () => {
    const path = join(dir, 'crash-before-run.sqlite');
    const first = createStore(path);
    const received = first.receiveConversationTurn({
      id: 't-crash',
      clientTurnId: 'c-crash',
      deviceId: 'phone',
      message: '先把这句话记下',
      agentId: 'main',
    });
    assert.equal(received.created, true);
    assert.equal(received.turn.status, 'queued');
    first.close();

    const second = createStore(path);
    const turn = second.turnById('t-crash');
    assert.equal(turn.message, '先把这句话记下');
    assert.equal(turn.status, 'queued');
    const page = second.messagesPage(agentOsSessionKey('main'), { limit: 10 });
    assert.equal(page.length, 1);
    assert.equal(page[0].text, '先把这句话记下');
    assert.equal(page[0].role, 'user');
    second.close();
  });

  it('commits the reply and one memory job together, and a repeat does not duplicate either', () => {
    const received = store.receiveConversationTurn({
      id: 't-done',
      clientTurnId: 'c-done',
      deviceId: 'mac',
      message: '你好',
      agentId: 'main',
    });
    assert.equal(received.created, true);
    const done = store.completeTurnWithMemory('t-done', '你好，我在');
    assert.equal(done.duplicate, false);
    assert.equal(done.turn.status, 'completed');
    assert.equal(done.job.id, 'ingest:t-done');
    assert.equal(done.job.status, 'queued');
    const again = store.completeTurnWithMemory('t-done', '你好，我在');
    assert.equal(again.duplicate, true);
    const key = agentOsSessionKey('main');
    const roles = store.messagesPage(key, { limit: 10 }).map((row) => row.role);
    assert.deepEqual(roles.filter((role) => role === 'assistant'), ['assistant']);
    assert.equal(store.memoryJobById('ingest:t-done').id, 'ingest:t-done');
  });

  it('serializes two devices so later writes do not replace earlier text', () => {
    const path = join(dir, 'two-devices.sqlite');
    const phone = createStore(path);
    const mac = createStore(path);
    const a = phone.receiveConversationTurn({
      id: 'dev-a',
      clientTurnId: 'client-a',
      deviceId: 'phone',
      message: '手机先说',
      agentId: 'main',
    });
    const b = mac.receiveConversationTurn({
      id: 'dev-b',
      clientTurnId: 'client-b',
      deviceId: 'mac',
      message: '电脑后说',
      agentId: 'main',
    });
    assert.equal(a.created, true);
    assert.equal(b.created, true);
    const rows = mac.messagesPage(agentOsSessionKey('main'), { limit: 10 });
    assert.deepEqual(
      rows.map((row) => row.text),
      ['手机先说', '电脑后说']
    );
    assert.ok(rows[0].seq < rows[1].seq);
    assert.equal(rows[0].text, '手机先说');
    phone.close();
    mac.close();
  });

  it('pages and searches the original wording', () => {
    store.receiveConversationTurn({
      id: 't-search',
      clientTurnId: 'c-search',
      message: '昨天原话是悬浮窗不要自动发请求',
      agentId: 'main',
    });
    const hits = store.searchTimeline(agentOsSessionKey('main'), '悬浮窗不要自动发请求');
    assert.equal(hits.length, 1);
    assert.match(hits[0].text, /悬浮窗不要自动发请求/);
    const page = store.messagesPage(agentOsSessionKey('main'), { limit: 1 });
    assert.equal(page.length, 1);
  });

  it('appends working state versions without rewriting the previous one', () => {
    const key = agentOsSessionKey('main');
    const first = store.appendWorkingState({
      conversationId: key,
      status: 'active',
      topicKey: 'overlay',
      goal: '悬浮窗',
      decisions: ['打开时不发请求'],
      sources: ['m1'],
    });
    const second = store.appendWorkingState({
      conversationId: key,
      status: 'parked',
      topicKey: 'overlay',
      goal: '悬浮窗',
      decisions: ['打开时不发请求'],
      sources: ['m1'],
      supersedes: first.id,
    });
    assert.ok(second.version > first.version);
    assert.equal(second.supersedes, first.id);
    assert.equal(store.parkedWorkingStates(key)[0].decisions[0], '打开时不发请求');
  });
});
