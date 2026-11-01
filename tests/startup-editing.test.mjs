// The standards list arriving while the parent is typing (app.js editingNow):
// no re-render, so the field keeps its text and focus; the list shows from
// the next navigation.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootWithHeldStandards, settle, until } from './support/held-standards-app.mjs';

test('a focused field in the page holds the late re-render until the next navigation', async () => {
  const { document, app, data, release } = await bootWithHeldStandards({ hash: '#find' });
  await until(() => app.textContent.includes('Find a topic'), 'the first render');
  const input = app.querySelector('input');
  assert.ok(input, 'the finder has a text field');
  input.value = 'order numb';
  input.focus();
  assert.equal(document.activeElement, input);

  release();
  await until(() => !data.standardsPending(), 'the list to arrive');
  await settle();
  // Not re-rendered: the same field, still focused, still holding the text.
  assert.equal(app.querySelector('input'), input);
  assert.equal(document.activeElement, input);
  assert.equal(input.value, 'order numb');
  assert.ok(data.getData().standards, 'the list is loaded, ready for the next render');

  // Blurred and on to another page: that render has the list.
  input.blur();
  window.location.hash = '#topic/t-order';
  window.dispatchEvent(new Event('hashchange'));
  await until(() => app.textContent.includes('AC9M2N01 · Year 2 · Number'), 'the next navigation to show the chip');
});
