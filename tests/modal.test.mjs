import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createModalStack } from '../src/js/ui.js';

const repoRoot = new URL('..', import.meta.url);
const source = (path) => readFile(new URL(path, repoRoot), 'utf8');

// A fake keydown target so the stack can be driven without a DOM.
function fakeDocument() {
  const listeners = new Set();
  return {
    listeners,
    listen: (fn) => listeners.add(fn),
    unlisten: (fn) => listeners.delete(fn),
    press(key) {
      const e = { key, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      for (const fn of [...listeners]) fn(e);
      return e;
    },
  };
}

test('Escape and backdrop dismissal run an overridden close', () => {
  const doc = fakeDocument();
  const modals = createModalStack(doc.listen, doc.unlisten);
  let tornDown = 0, cleaned = 0;
  const m = modals.open(() => { tornDown += 1; });
  const original = m.close;
  m.close = () => { cleaned += 1; original(); };

  doc.press('Escape');
  assert.equal(cleaned, 1);
  assert.equal(tornDown, 1);
  assert.equal(m.isOpen(), false);

  // A backdrop tap (dismiss) on a second modal also goes through the override.
  const m2 = modals.open(() => { tornDown += 1; });
  const original2 = m2.close;
  m2.close = () => { cleaned += 1; original2(); };
  assert.equal(m2.dismiss(), true);
  assert.equal(cleaned, 2);
  assert.equal(tornDown, 2);
});

test('the Escape listener is removed on every close path', () => {
  const doc = fakeDocument();
  const modals = createModalStack(doc.listen, doc.unlisten);

  const viaButton = modals.open(() => {});
  assert.equal(doc.listeners.size, 1);
  viaButton.close();
  assert.equal(doc.listeners.size, 0);

  const viaBackdrop = modals.open(() => {});
  viaBackdrop.dismiss();
  assert.equal(doc.listeners.size, 0);

  modals.open(() => {});
  doc.press('Escape');
  assert.equal(doc.listeners.size, 0);
  assert.equal(modals.size(), 0);
});

test('only the top-most modal closes on Escape', () => {
  const doc = fakeDocument();
  const modals = createModalStack(doc.listen, doc.unlisten);
  const folder = modals.open(() => {});
  const recorder = modals.open(() => {});
  assert.equal(doc.listeners.size, 1);

  doc.press('Escape');
  assert.equal(recorder.isOpen(), false);
  assert.equal(folder.isOpen(), true);

  doc.press('Escape');
  assert.equal(folder.isOpen(), false);
  assert.equal(doc.listeners.size, 0);
});

test('beforeClose returning false cancels dismissal but not an explicit close', () => {
  const doc = fakeDocument();
  const modals = createModalStack(doc.listen, doc.unlisten);
  let allow = false, asked = 0, tornDown = 0;
  const m = modals.open(() => { tornDown += 1; }, () => { asked += 1; return allow; });

  doc.press('Escape');
  assert.equal(m.dismiss(), false);
  assert.equal(asked, 2);
  assert.equal(m.isOpen(), true);
  assert.equal(tornDown, 0);

  allow = true;
  doc.press('Escape');
  assert.equal(m.isOpen(), false);
  assert.equal(tornDown, 1);

  // Closing twice is a no-op; a Save button's close skips the guard.
  m.close();
  assert.equal(tornDown, 1);
  const saved = modals.open(() => { tornDown += 1; }, () => false);
  saved.close();
  assert.equal(tornDown, 2);
});

test('openModal routes Escape and backdrop through the dismissable handle', async () => {
  const ui = await source('src/js/ui.js');
  const openModal = ui.slice(ui.indexOf('export function openModal'));
  assert.match(openModal, /e\.target === overlay\) handle\.dismiss\(\)/);
  assert.match(openModal, /opts\.beforeClose/);
  assert.match(ui, /stack\[stack\.length - 1\]\.dismiss\(\)/);
  assert.match(ui, /handle\.close\(\);/, 'dismiss must call the (overridable) handle.close');
});

test('views guard dismissal and clean up on close', async () => {
  const [recorder, challenge, masterytest] = await Promise.all([
    source('src/js/recorder.js'),
    source('src/js/views/challenge.js'),
    source('src/js/views/masterytest.js'),
  ]);

  assert.doesNotMatch(recorder, /modal-close/, 'the dead modal-close hook should be gone');
  for (const [name, code] of [['recorder', recorder], ['challenge', challenge], ['masterytest', masterytest]]) {
    assert.match(code, /beforeClose:[^\n]*\n?[^\n]*confirm\(/, `${name} should confirm before discarding`);
  }

  const recorderClose = recorder.slice(recorder.indexOf('m.close = () => {'));
  assert.match(recorderClose, /cleanupStream\(\)/);
  assert.match(recorderClose, /transcriber\.stop\(\)/);
  assert.match(recorderClose, /clearInterval\(timerId\)/);

  assert.match(challenge, /function finish\(\) \{\s*if \(finished \|\| closed\) return;\s*finished = true;/);
});
