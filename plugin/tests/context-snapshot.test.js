import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  contentVersionHash,
  emptyContextSnapshot,
  snapshotFromExplicitContext,
  snapshotStillValid,
  formatSnapshotForPrompt,
} from '../src/context-snapshot-pure.js';

describe('context-snapshot', () => {
  it('contentVersionHash changes when body changes', () => {
    const a = contentVersionHash('hello');
    const b = contentVersionHash('hello!');
    assert.notEqual(a, b);
  });

  it('snapshotStillValid detects version mismatch', () => {
    const snap = { attached: true, path: 'a.md', contentVersion: contentVersionHash('v1') };
    assert.equal(snapshotStillValid(snap, 'v2').ok, false);
    assert.equal(snapshotStillValid(snap, 'v1').ok, true);
  });

  it('formatSnapshotForPrompt marks unattached', () => {
    assert.match(formatSnapshotForPrompt({ attached: false }), /未附带/);
  });

  it('uses the explicit reader or editor context instead of a previous note', () => {
    const snap = snapshotFromExplicitContext({
      path: '手记/草稿/d1.md',
      title: '草稿',
      body: '这一句',
      selection: '这一句',
      version: 'abc',
    });
    assert.equal(snap.path, '手记/草稿/d1.md');
    assert.equal(snap.selection, '这一句');
    assert.equal(snap.contentVersion, 'abc');
    assert.equal(snapshotFromExplicitContext(null), null);
    assert.equal(emptyContextSnapshot().attached, false);
  });
});
