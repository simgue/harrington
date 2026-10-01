import assert from 'node:assert/strict';
import { test } from 'node:test';

// store.js persists through backend.js, which only touches fetch when a save
// fires. Stub fetch so the debounced save succeeds quietly in Node.
globalThis.fetch = async () => ({ ok: true, status: 200, headers: new Headers({ ETag: '"v1"' }), json: async () => ({}) });
const store = await import('../src/js/store.js');

test('grading a recall card keeps its topic when the caller passes none', () => {
  const sid = 's-recall';
  store.ensureRecallCard(sid, 'topic-a::0', 'topic-a');
  store.gradeRecall(sid, 'topic-a::0', undefined, 'again');
  assert.equal(store.recallState(sid, 'topic-a::0').topicId, 'topic-a');
  store.recallState(sid, 'topic-a::0').due = 0; // a day later, it is due again
  const due = store.dueRecallCards(sid, { topicId: 'topic-a' });
  assert.deepEqual(due.map(c => c.id), ['topic-a::0']);
  assert.equal(due[0].topicId, 'topic-a');
});

test('grading with an explicit topic id records it', () => {
  const sid = 's-recall-2';
  store.ensureRecallCard(sid, 'topic-b::1', 'topic-b');
  store.gradeRecall(sid, 'topic-b::1', 'topic-b', 'good');
  assert.equal(store.recallState(sid, 'topic-b::1').topicId, 'topic-b');
  assert.equal(store.recallState(sid, 'topic-b::1').box, 1);
});

test('ensureRecallCard repairs a record that lost its topic id', () => {
  const sid = 's-recall-3';
  store.get().recall[sid] = { 'topic-c::0': { topicId: undefined, box: 0, due: 0, reps: 1, lapses: 1, last: 0 } };
  store.ensureRecallCard(sid, 'topic-c::0', 'topic-c');
  assert.equal(store.dueRecallCards(sid)[0].topicId, 'topic-c');
});

test('setStatusBulk writes every topic and emits once', () => {
  const sid = 's-bulk';
  let emits = 0;
  const off = store.subscribe(() => { emits++; });
  store.setStatusBulk(sid, ['t1', 't2', 't3'], 'mastered');
  off();
  assert.equal(emits, 1);
  for (const id of ['t1', 't2', 't3']) assert.equal(store.statusOf(sid, id), 'mastered');
  assert.equal(store.activeToday(sid), true);
});

test('addRecord marks the day active and emits once', () => {
  const sid = 's-record';
  assert.equal(store.activeToday(sid), false);
  let emits = 0;
  const off = store.subscribe(() => { emits++; });
  const rec = store.addRecord(sid, { type: 'observation', note: 'Counted to twenty' });
  off();
  assert.equal(emits, 1);
  assert.equal(store.recordsFor(sid)[0].id, rec.id);
  assert.equal(store.activeToday(sid), true);
  assert.equal(store.activityStreak(sid), 1);
});
