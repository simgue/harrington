import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rememberFailures } from '../lib/remembered.mjs';

test('a failure is answered from memory for retryMs, then loaded afresh; a success is not kept', async () => {
  let clock = 0;
  let calls = 0;
  let fail = true;
  const get = rememberFailures(async (key) => {
    calls += 1;
    if (fail) throw new Error(`no ${key}`);
    return `${key} list`;
  }, { retryMs: 5 * 60_000, now: () => clock });

  await assert.rejects(get('acara-v9'), /no acara-v9/);
  assert.equal(calls, 1);
  // Within five minutes: the same failure, at once, without loading again.
  clock = 5 * 60_000 - 1;
  await assert.rejects(get('acara-v9'), /no acara-v9/);
  assert.equal(calls, 1);

  // Five minutes after the failure: loaded afresh.
  fail = false;
  clock = 5 * 60_000;
  assert.equal(await get('acara-v9'), 'acara-v9 list');
  assert.equal(calls, 2);
  // A success is not kept: the next call loads again (the caller caches).
  assert.equal(await get('acara-v9'), 'acara-v9 list');
  assert.equal(calls, 3);
});

test('callers arriving during a load share it; keys are separate', async () => {
  let calls = 0;
  let release;
  const get = rememberFailures((key) => { calls += 1; return new Promise((resolve) => { release = () => resolve(key); }); }, { retryMs: 1000 });
  const a = get('x');
  const b = get('x');
  assert.equal(a, b);
  await Promise.resolve(); // the load starts on the next tick
  release();
  assert.equal(await a, 'x');
  assert.equal(calls, 1);
  get('y');
  await Promise.resolve();
  assert.equal(calls, 2);
});
