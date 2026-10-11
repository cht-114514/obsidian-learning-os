import assert from 'node:assert/strict';
import test from 'node:test';
import { companionPresentation, nextCompanionMode, placeCard, shouldThawQuote } from '../src/ui/companion/layout.js';

const frame = { left: 12, top: 20, width: 366, height: 700 };

test('placeCard sits below a selection when there is room and does not cover it', () => {
  const selection = { left: 40, right: 180, top: 120, bottom: 148 };
  const placed = placeCard({
    frame,
    selection,
    card: { width: 366, height: 180 },
    gap: 10,
  });
  assert.equal(placed.anchor, 'below');
  assert.equal(placed.showPointer, true);
  assert.equal(placed.top, 158);
  assert.ok(placed.top >= selection.bottom);
  assert.ok(placed.left >= frame.left);
  assert.ok(placed.left + placed.width <= frame.left + frame.width);
});

test('placeCard flips above a selection crowded against the bottom', () => {
  const selection = { left: 30, right: 200, top: 640, bottom: 668 };
  const placed = placeCard({
    frame,
    selection,
    card: { width: 366, height: 180 },
    gap: 10,
  });
  assert.equal(placed.anchor, 'above');
  assert.equal(placed.showPointer, true);
  assert.ok(placed.top + placed.height <= selection.top - 10);
});

test('placeCard docks without a pointer when neither side fits or there is no selection', () => {
  const tight = placeCard({
    frame,
    selection: { left: 20, right: 80, top: 300, bottom: 330 },
    card: { width: 366, height: 680 },
  });
  assert.equal(tight.anchor, 'dock');
  assert.equal(tight.showPointer, false);
  assert.equal(tight.top, frame.top + frame.height - 680);

  const bare = placeCard({
    frame,
    selection: null,
    card: { width: 366, height: 180 },
  });
  assert.equal(bare.anchor, 'dock');
  assert.equal(bare.showPointer, false);
  assert.equal(bare.top, frame.top + frame.height - 180);
});

test('placeCard docks a selection that sits outside the frame', () => {
  const placed = placeCard({
    frame,
    selection: { left: 10, right: 40, top: -80, bottom: -40 },
    card: { width: 200, height: 120 },
  });
  assert.equal(placed.anchor, 'dock');
  assert.equal(placed.showPointer, false);
});

test('placeCard keeps a narrower card inside the frame and docks it to the trailing edge', () => {
  const wide = { left: 0, top: 0, width: 800, height: 600 };
  const placed = placeCard({
    frame: wide,
    selection: null,
    card: { width: 420, height: 180 },
  });
  assert.equal(placed.left, 380);
  assert.equal(placed.top, 420);
  assert.ok(placed.left + placed.width <= wide.left + wide.width);
});

test('nextCompanionMode steps one state at a time and ignores keyboard dismissal', () => {
  assert.equal(nextCompanionMode('collapsed', 'capsule'), 'peek');
  assert.equal(nextCompanionMode('peek', 'input'), 'expanded');
  assert.equal(nextCompanionMode('expanded', 'back'), 'peek');
  assert.equal(nextCompanionMode('peek', 'back'), 'collapsed');
  assert.equal(nextCompanionMode('expanded', 'escape'), 'peek');
  assert.equal(nextCompanionMode('peek', 'outside'), 'collapsed');
  assert.equal(nextCompanionMode('expanded', 'keyboard'), 'expanded');
});

test('fullscreen covers the half-screen panel without changing its mode', () => {
  const open = companionPresentation({ mode: 'expanded' }, true);
  assert.equal(open.mode, 'expanded');
  assert.equal(open.covered, true);
  assert.equal(open.interactive, false);
  const back = companionPresentation({ mode: open.mode }, false);
  assert.equal(back.mode, 'expanded');
  assert.equal(back.covered, false);
  assert.equal(back.interactive, true);
  assert.equal(companionPresentation({ mode: 'peek' }, false).mode, 'peek');
});

test('shouldThawQuote keeps a draft attached to its frozen selection', () => {
  assert.equal(shouldThawQuote('collapsed', ''), true);
  assert.equal(shouldThawQuote('collapsed', '还没发'), false);
  assert.equal(shouldThawQuote('peek', ''), false);
});
