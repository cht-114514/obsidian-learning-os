import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalSessionKey, formatManifest, timelineChrome } from '../src/single-session.js';

describe('single session chrome', () => {
  it('keeps one main session and does not offer a session manager', () => {
    const chrome = timelineChrome();
    assert.equal(chrome.showNew, false);
    assert.equal(chrome.showSessions, false);
    assert.equal(chrome.showDelete, false);
    assert.equal(chrome.title, '主会话');
    assert.equal(chrome.searchPlaceholder, '搜索原文');
    assert.equal(canonicalSessionKey('main'), 'agent:main:agent-os');
    assert.match(formatManifest({ stateVersion: 2, memoryIds: ['a'], degradations: ['vector-unavailable'], tokenCounts: { recent: 10 } }), /状态 v2/);
  });
});
