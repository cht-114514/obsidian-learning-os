import assert from 'node:assert/strict';
import test from 'node:test';
import { navbarReservePx, resolveMobileKeyboardPx, composerOffsetPx, readVisibleFrame } from '../src/ui/mobile-insets.js';

test('resolveMobileKeyboardPx prefers Obsidian --keyboard-height', () => {
  const style = {
    getPropertyValue(name) {
      if (name === '--keyboard-height') return '280px';
      return '';
    },
  };
  assert.equal(resolveMobileKeyboardPx(style, null, 852), 280);
});

test('resolveMobileKeyboardPx ignores small visualViewport gap (safe area)', () => {
  const style = {
    getPropertyValue(name) {
      if (name === '--keyboard-height') return '0px';
      if (name === '--safe-area-inset-bottom') return '34px';
      return '';
    },
  };
  const viewport = { height: 818, offsetTop: 0 };
  assert.equal(resolveMobileKeyboardPx(style, viewport, 852), 0);
});

test('resolveMobileKeyboardPx treats large visualViewport gap as keyboard', () => {
  const style = {
    getPropertyValue(name) {
      if (name === '--keyboard-height') return '0px';
      if (name === '--safe-area-inset-bottom') return '34px';
      return '';
    },
  };
  const viewport = { height: 500, offsetTop: 0 };
  assert.equal(resolveMobileKeyboardPx(style, viewport, 852), 352);
});

test('composerOffsetPx adds safe area once and drops it while the keyboard is open', () => {
  assert.equal(composerOffsetPx({ keyboardPx: 280, safeBottom: 34, hideNavbar: true }), 288);
  assert.equal(composerOffsetPx({ keyboardPx: 0, safeBottom: 34, hideNavbar: true }), 42);
  assert.equal(composerOffsetPx({ keyboardPx: 0, safeBottom: 34, navStack: 96, hideNavbar: false }), 104);
});

test('resolveMobileKeyboardPx drops a stale keyboard height once the page is full again', () => {
  const style = {
    getPropertyValue(name) {
      if (name === '--keyboard-height') return '320px';
      if (name === '--safe-area-inset-bottom') return '34px';
      return '';
    },
  };
  const viewport = { height: 818, offsetTop: 0 };
  assert.equal(resolveMobileKeyboardPx(style, viewport, 852), 0);
  assert.equal(resolveMobileKeyboardPx(style, null, 852, { focused: false }), 0);
});

test('resolveMobileKeyboardPx follows visualViewport gap instead of stale --keyboard-height', () => {
  const style = {
    getPropertyValue(name) {
      if (name === '--keyboard-height') return '320px';
      if (name === '--safe-area-inset-bottom') return '34px';
      return '';
    },
  };
  const viewport = { height: 500, offsetTop: 0 };
  assert.equal(resolveMobileKeyboardPx(style, viewport, 852), 352);
});

test('resolveMobileKeyboardPx ignores a zoomed visualViewport', () => {
  const style = {
    getPropertyValue(name) {
      if (name === '--safe-area-inset-bottom') return '34px';
      return '';
    },
  };
  const viewport = { height: 400, offsetTop: 0, scale: 1.5 };
  assert.equal(resolveMobileKeyboardPx(style, viewport, 844), 0);
});

test('readVisibleFrame uses the visual viewport once and does not subtract the keyboard again', () => {
  const frame = readVisibleFrame({
    innerWidth: 390,
    innerHeight: 844,
    viewport: { width: 390, height: 420, offsetTop: 0, offsetLeft: 0, scale: 1 },
    safeTop: 47,
    safeBottom: 34,
    navStack: 96,
    margin: 12,
  });
  assert.equal(frame.keyboardOpen, true);
  assert.equal(frame.keyboardPx, 424);
  assert.equal(frame.bottomInset, 8);
  assert.equal(frame.left, 12);
  assert.equal(frame.top, 12);
  assert.equal(frame.width, 366);
  assert.equal(frame.height, 400);
  assert.ok(frame.height > frame.keyboardPx / 2);
});

test('readVisibleFrame keeps offsetTop in the origin and not as a second inset', () => {
  const frame = readVisibleFrame({
    innerWidth: 390,
    innerHeight: 844,
    viewport: { width: 390, height: 400, offsetTop: 90, offsetLeft: 0, scale: 1 },
    safeBottom: 34,
    navStack: 96,
    margin: 12,
  });
  assert.equal(frame.keyboardOpen, true);
  assert.equal(frame.top, 102);
  assert.equal(frame.height, 380);
  assert.equal(frame.bottomInset, 8);
});

test('readVisibleFrame does not treat zoom as a keyboard', () => {
  const frame = readVisibleFrame({
    innerWidth: 390,
    innerHeight: 844,
    viewport: { width: 260, height: 500, offsetTop: 0, offsetLeft: 0, scale: 1.4 },
    safeTop: 47,
    safeBottom: 34,
    navStack: 80,
    margin: 12,
  });
  assert.equal(frame.keyboardPx, 0);
  assert.equal(frame.keyboardOpen, false);
  assert.equal(frame.bottomInset, 114);
  assert.equal(frame.top, 59);
  assert.equal(frame.left, 12);
  assert.equal(frame.width, 236);
  assert.equal(frame.height, 500 - 59 - 114);
});

test('readVisibleFrame falls back to --keyboard-height only while focused', () => {
  const style = {
    getPropertyValue(name) {
      if (name === '--keyboard-height') return '280px';
      if (name === '--safe-area-inset-bottom') return '34px';
      return '';
    },
  };
  const open = readVisibleFrame({
    innerWidth: 390,
    innerHeight: 844,
    viewport: null,
    bodyStyle: style,
    focused: true,
    margin: 12,
  });
  assert.equal(open.keyboardPx, 280);
  assert.equal(open.bottomInset, 8);
  assert.equal(open.top, 12);
  assert.equal(open.height, 844 - 280 - 12 - 8);
  const closed = readVisibleFrame({
    innerWidth: 390,
    innerHeight: 844,
    viewport: null,
    bodyStyle: style,
    focused: false,
    safeTop: 47,
    navStack: 88,
    margin: 12,
  });
  assert.equal(closed.keyboardPx, 0);
  assert.equal(closed.keyboardOpen, false);
  assert.equal(closed.bottomInset, 34 + 88);
  assert.equal(closed.height, 844 - (12 + 47) - closed.bottomInset);
});

test('navbarReservePx prefers viewport stack over box estimate', () => {
  const rect = { height: 52, top: 693 };
  const style = { display: 'flex', visibility: 'visible', marginBottom: '20px' };
  assert.equal(navbarReservePx(rect, style, 852), 159);
});
