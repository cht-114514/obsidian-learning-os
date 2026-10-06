import assert from 'node:assert/strict';
import test from 'node:test';
import { clampInputHeight } from '../src/ui/composer.js';

test('clampInputHeight grows up to four lines and then scrolls', () => {
  assert.equal(clampInputHeight(20, 24, 4, 0), 24);
  assert.equal(clampInputHeight(70, 24, 4, 0), 70);
  assert.equal(clampInputHeight(200, 24, 4, 0), 96);
});

test('clampInputHeight respects a short visible frame without hiding the send button', () => {
  assert.equal(clampInputHeight(200, 24, 4, 48), 48);
  assert.equal(clampInputHeight(30, 24, 4, 48), 30);
});
