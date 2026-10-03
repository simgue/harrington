import assert from 'node:assert/strict';
import { test } from 'node:test';

// recallDueCount and "Due today" share one orphan helper (dropOrphanRecall).
// The fixture is a legacy family: schedule records saved without a topicId for
// a seven-card set, and a recall cache that is the old bare array of two cards.
const lessons = new Map();
let reads = 0;
const json = (status, body) => ({ ok: status < 400, status, headers: new Headers({ ETag: '"v1"' }), json: async () => body });
globalThis.fetch = async (path) => {
  const url = String(path);
  if (url.startsWith('/api/lessons/')) {
    reads++;
    const key = decodeURIComponent(url.slice('/api/lessons/'.length));
    return lessons.has(key) ? json(200, lessons.get(key)) : json(404, { error: 'Lesson not found' });
  }
  return json(200, {});
};
const store = await import('../src/js/store.js');

const legacyRecord = { box: 0, due: 0, reps: 1, lapses: 0, last: 0 }; // no topicId
const card = (topic, i) => ({ id: `${topic}::${i}`, front: `Q${i}?`, back: `A${i}` });

test('recallDueCount prunes legacy orphan due entries before "Due today" is ever opened', async () => {
  const sid = 's-legacy';
  store.get().recall[sid] = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`legacy-topic::${i}`, { ...legacyRecord }]));
  lessons.set('recall:legacy-topic', [card('legacy-topic', 0), card('legacy-topic', 1)]);

  // The first count has not read the card set yet; reading it prunes the five orphans.
  assert.equal(store.recallDueCount(sid), 7);
  await store.reconcileRecallDue(sid); // the count already started it; this waits for it
  assert.equal(store.recallDueCount(sid), 2);
  assert.deepEqual(Object.keys(store.get().recall[sid]).sort(), ['legacy-topic::0', 'legacy-topic::1']);
  // One cache read per topic per session, however often the count is shown.
  const before = reads;
  store.recallDueCount(sid);
  await store.reconcileRecallDue(sid);
  assert.equal(reads, before);
});

test('a topic whose card set is not saved keeps its due entries', async () => {
  const sid = 's-uncached';
  for (let i = 0; i < 3; i++) store.ensureRecallCard(sid, `uncached-topic::${i}`, 'uncached-topic');
  assert.equal(store.recallDueCount(sid), 3);
  assert.equal(await store.reconcileRecallDue(sid), 0);
  assert.equal(store.recallDueCount(sid), 3);
});

test('a card set already read this session corrects the count at once', async () => {
  const sid = 's-known';
  for (let i = 0; i < 4; i++) store.ensureRecallCard(sid, `known-topic::${i}`, 'known-topic');
  // A malformed card counts as gone too.
  lessons.set('recall:known-topic', { cards: [card('known-topic', 0), { id: 'known-topic::1', front: 'no back' }] });
  await store.getCachedLesson('recall:known-topic');
  assert.equal(store.recallDueCount(sid), 1, 'counted without waiting for the prune');
  await store.reconcileRecallDue(sid);
  assert.deepEqual(Object.keys(store.get().recall[sid]), ['known-topic::0']);
});

test('dropOrphanRecall drops only the given topic\'s records whose card is gone', () => {
  const sid = 's-drop';
  for (let i = 0; i < 3; i++) store.ensureRecallCard(sid, `drop-a::${i}`, 'drop-a');
  store.ensureRecallCard(sid, 'drop-b::5', 'drop-b');
  assert.equal(store.dropOrphanRecall(sid, 'drop-a', [card('drop-a', 1)]), 2);
  assert.deepEqual(Object.keys(store.get().recall[sid]).sort(), ['drop-a::1', 'drop-b::5']);
});

test('"Due today" and the due count prune through the same helper', async () => {
  const { readFile } = await import('node:fs/promises');
  const recall = await readFile(new URL('../src/js/views/recall.js', import.meta.url), 'utf8');
  assert.match(recall, /store\.dropOrphanRecall\(/);
  assert.doesNotMatch(recall, /store\.dropRecallCards\(/, 'no second, inline orphan check in the view');
  const storeSrc = await readFile(new URL('../src/js/store.js', import.meta.url), 'utf8');
  assert.match(storeSrc, /export async function reconcileRecallDue[\s\S]*?dropOrphanRecall\(/);
});
