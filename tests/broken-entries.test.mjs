import assert from 'node:assert/strict';
import { test } from 'node:test';

// HAR-38: a null (or other non-object) entry in a learner's lists or maps
// once hung the landing route on the loading screen (dueRecallCards threw).
// Every walker sees only object entries, whatever the stored document holds,
// and loading a current document never writes, even to clean it.

const ID = 's_broken';
const BROKEN = {
  version: 4,
  schemaVersion: 3,
  students: [{ id: ID, name: 'Sample Broken', birthYear: 2019, color: '#3f6b3b' }],
  activeStudentId: ID,
  progress: { [ID]: { t1: { status: 'learning', updatedAt: 1 }, t2: null } },
  records: { [ID]: [null, { id: 'r1', type: 'note', title: 'Kept', createdAt: 1 }, 7] },
  tests: { [ID]: [null, { id: 't1', scope: 'subject', subject: 'Mathematics', pct: 90, passed: true }] },
  challenges: { [ID]: ['x', { id: 'c1', topicId: 't1', correct: 5, total: 6 }] },
  suggestions: { [ID]: [null, { id: 'g1', status: 'pending', subject: 'Mathematics', domain: 'Counting' }] },
  recall: { [ID]: { 'a::0': null, 'a::1': { topicId: 'a', box: 0, due: 0, reps: 2, lapses: 0 } } },
  practice: { [ID]: { p0: null, p1: { topicId: 'a', q: 'q', box: 0, due: 0 } } },
  adaptations: { [ID]: { 'Mathematics|Counting': null, 'English|Phonics': { level: 'advanced', since: 1 } } },
  plan: { [ID]: { moves: {}, done: {}, extras: { '2026-10-07': [null, { id: 'x1', title: 'Kept extra' }] } } },
  daily: { [ID]: { '2026-10-06': null, '2026-10-07': { offers: { literacy: ['a'] }, picks: {} } } },
};

const writes = [];
const reply = (status, body, version) => ({
  ok: status < 300, status,
  headers: new Headers(version ? { ETag: `"v${version}"` } : {}),
  json: async () => body,
});
globalThis.fetch = async (path, options = {}) => {
  if (path === '/api/health') return reply(200, { aiConfigured: false });
  if (path === '/api/state' && options.method === 'PUT') { writes.push(JSON.parse(options.body)); return reply(204, null, 5); }
  if (path === '/api/state') return reply(200, structuredClone(BROKEN), 4);
  return reply(200, {});
};

const store = await import('../src/js/store.js');
const { dropBrokenEntries, validateDocument } = await import('../src/js/document.js');
await store.loadAll();
await new Promise((resolve) => setTimeout(resolve, 20));

const allObjects = (list) => list.every((x) => x && typeof x === 'object' && !Array.isArray(x));

test('loading a current document with broken entries writes nothing', () => {
  assert.equal(writes.length, 0);
});

test('records skip non-object entries', () => {
  assert.deepEqual(store.recordsFor(ID).map((r) => r.id), ['r1']);
});
test('tests skip non-object entries', () => {
  assert.deepEqual(store.testsFor(ID).map((t) => t.id), ['t1']);
});
test('challenges skip non-object entries', () => {
  assert.deepEqual(store.challengesFor(ID).map((c) => c.id), ['c1']);
});
test('suggestions skip non-object entries', () => {
  assert.deepEqual(store.pendingSuggestions(ID).map((s) => s.id), ['g1']);
});
test('recall cards skip non-object entries (the landing route\'s TypeError)', () => {
  assert.deepEqual(store.dueRecallCards(ID).map((c) => c.id), ['a::1']);
  assert.equal(store.recallDueCount(ID), 1);
});
test('practice items skip non-object entries', () => {
  assert.deepEqual(store.duePracticeItems(ID).map((p) => p.id), ['p1']);
});
test('progress skips non-object entries', () => {
  assert.deepEqual(Object.keys(store.progressFor(ID)), ['t1']);
  assert.equal(store.statusOf(ID, 't2'), 'none');
});
test('adaptations skip non-object entries', () => {
  assert.deepEqual(Object.keys(store.allAdaptations(ID)), ['English|Phonics']);
});
test('plan extras skip non-object entries', () => {
  assert.deepEqual(store.extrasOn(ID, '2026-10-07').map((x) => x.id), ['x1']);
});
test('daily days skip non-object entries', () => {
  assert.equal(store.dailyFor(ID, '2026-10-06'), null);
  assert.deepEqual(store.dailyFor(ID, '2026-10-07').offers, { literacy: ['a'] });
});

test('the next save carries the cleaned document, which the server accepts', async () => {
  store.setStatus(ID, 't3', 'learning');
  await store.flushSaves();
  assert.equal(writes.length, 1);
  assert.equal(validateDocument(writes[0]), null);
  for (const key of ['records', 'tests', 'challenges', 'suggestions']) assert.ok(allObjects(writes[0][key][ID]), key);
});

test('a learner that is not an object is dropped too', () => {
  const { doc, dropped } = dropBrokenEntries({ students: [null, { id: 'a', name: 'Kept' }, 3] });
  assert.deepEqual(doc.students, [{ id: 'a', name: 'Kept' }]);
  assert.equal(dropped, 2);
});

test('dropBrokenEntries returns the same document when nothing is broken', () => {
  const clean = { students: [], records: { a: [{ id: 'r' }] }, recall: { a: { c: { due: 0 } } } };
  const out = dropBrokenEntries(clean);
  assert.equal(out.doc, clean);
  assert.equal(out.dropped, 0);
  // A learner list that is not a list at all becomes empty; a plan that is not
  // an object is dropped.
  const odd = dropBrokenEntries({ records: { a: 'text' }, plan: { a: 3 }, recall: { a: [] } });
  assert.deepEqual(odd.doc, { records: { a: [] }, plan: {}, recall: { a: {} } });
  assert.equal(odd.dropped, 3);
});
