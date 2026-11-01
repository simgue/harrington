// The app's start-up (app.js boot) with a slow Australian Curriculum list:
// the first render does not wait for it, and the page renders again when it
// arrives (data.js loadStandards). The case where the parent is typing when
// it arrives is in startup-editing.test.mjs (a boot of its own).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootWithHeldStandards, until } from './support/held-standards-app.mjs';

test('the app renders without waiting for the standards list, and again when it arrives', async () => {
  const { app, data, release } = await bootWithHeldStandards({ hash: '#topic/t-order' });
  // The topic page is up while the list is still on its way: no codes yet.
  await until(() => app.textContent.includes('Ordering numbers'), 'the first render');
  assert.equal(data.standardsPending(), true);
  assert.equal(data.getData().standards, null);
  assert.equal(app.textContent.includes('AC9M2N01 · Year 2'), false);

  // Nothing is being typed: when the list arrives, the page renders again,
  // now with the chip.
  release();
  await until(() => app.textContent.includes('AC9M2N01 · Year 2 · Number'), 'the render after the list arrived');
  assert.equal(data.standardsPending(), false);
});
