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

test('applyPlacement writes once with a placement source and undoPlacement restores previous statuses', () => {
  const sid = 's-place';
  store.setStatus(sid, 'p-learning', 'learning');
  const before = store.progressFor(sid)['p-learning'];
  let emits = 0;
  const off = store.subscribe(() => { emits++; });
  const rec = store.applyPlacement(sid, { topicIds: ['p-new', 'p-learning'], title: 'Placement: test', subject: 'Mathematics', maxAge: 8 });
  off();
  assert.equal(emits, 1);
  assert.equal(store.statusOf(sid, 'p-new'), 'mastered');
  assert.equal(store.progressFor(sid)['p-new'].source, 'placement');
  assert.equal(store.statusOf(sid, 'p-learning'), 'mastered');

  const saved = store.recordsFor(sid)[0];
  assert.equal(saved.id, rec.id);
  assert.equal(saved.type, 'assessment');
  assert.deepEqual(saved.placement.topicIds, ['p-new', 'p-learning']);
  assert.equal(saved.placement.previous['p-learning'].status, 'learning');
  assert.equal(saved.placement.previous['p-new'], null);

  assert.deepEqual(store.undoPlacement(sid, rec.id), { reverted: 2, kept: 0 });
  assert.equal(store.statusOf(sid, 'p-new'), 'none');
  assert.equal(store.progressFor(sid)['p-new'], undefined);
  assert.deepEqual(store.progressFor(sid)['p-learning'], before);
  assert.ok(saved.placement.undoneAt);
  assert.equal(store.undoPlacement(sid, rec.id), null, 'a placement undoes only once');
});

test('the placement record is complete when the single emit fires and in the saved snapshot', async () => {
  const sid = 's-place-3';
  let seen = null;
  const off = store.subscribe((state) => {
    const rec = state.records[sid][0];
    seen = { at: rec.placement.at, stamps: rec.placement.topicIds.map(id => state.progress[sid][id].updatedAt) };
  });
  const rec = store.applyPlacement(sid, { topicIds: ['z1', 'z2', 'z3'], title: 'Placement: test', subject: 'Science', maxAge: 7 });
  off();
  assert.ok(seen && typeof seen.at === 'number', 'emit sees placement.at');
  assert.deepEqual(seen.stamps, [seen.at, seen.at, seen.at]);
  assert.equal(rec.placement.at, seen.at);

  // The save that follows carries the same complete record.
  const stub = globalThis.fetch;
  let body = null;
  globalThis.fetch = async (path, options = {}) => {
    if (options.method === 'PUT') body = JSON.parse(options.body);
    return stub(path, options);
  };
  try { await store.flushSaves(); } finally { globalThis.fetch = stub; }
  const saved = body.records[sid].find(r => r.id === rec.id);
  assert.equal(saved.placement.at, seen.at);
  for (const id of ['z1', 'z2', 'z3']) assert.equal(body.progress[sid][id].updatedAt, seen.at);
});

test('a placement is not a learning day and resets today\'s daily choices', () => {
  const sid = 's-place-4';
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  store.saveDailyOffers(sid, today, { literacy: [], numeracy: ['n1', 'n2'] });
  store.pickDaily(sid, today, 'numeracy', 'n1');
  store.get().activity[sid] = {};
  let emits = 0;
  const off = store.subscribe(() => { emits++; });
  const rec = store.applyPlacement(sid, { topicIds: ['n1', 'n2'], title: 'Placement: test', subject: 'Mathematics', maxAge: 8 });
  off();
  assert.equal(emits, 1);
  assert.equal(store.activeToday(sid), false, 'placement does not mark the day active');
  assert.equal(store.dailyFor(sid, today), null, 'offers built before the placement are dropped');

  store.saveDailyOffers(sid, today, { literacy: [], numeracy: ['n3'] });
  store.undoPlacement(sid, rec.id);
  assert.equal(store.dailyFor(sid, today), null, 'undo drops them too');
  assert.equal(store.activeToday(sid), false);
});

test('undoPlacement leaves topics changed after the placement alone', () => {
  const sid = 's-place-2';
  const rec = store.applyPlacement(sid, { topicIds: ['q1', 'q2'], title: 'Placement: test', subject: 'English', maxAge: 6 });
  store.setStatus(sid, 'q2', 'practicing');
  assert.deepEqual(store.undoPlacement(sid, rec.id), { reverted: 1, kept: 1 });
  assert.equal(store.statusOf(sid, 'q1'), 'none');
  assert.equal(store.statusOf(sid, 'q2'), 'practicing');
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

test('resetRecallTopic drops every learner\'s schedule for a regenerated card set', () => {
  for (const sid of ['s-reset-a', 's-reset-b']) {
    for (let i = 0; i < 7; i++) store.ensureRecallCard(sid, `topic-r::${i}`, 'topic-r');
    store.ensureRecallCard(sid, 'topic-other::0', 'topic-other');
  }
  store.gradeRecall('s-reset-a', 'topic-r::0', 'topic-r', 'again');
  assert.equal(store.recallState('s-reset-a', 'topic-r::0').lapses, 1);
  store.resetRecallTopic('topic-r');
  for (const sid of ['s-reset-a', 's-reset-b']) {
    assert.equal(store.dueRecallCards(sid, { topicId: 'topic-r' }).length, 0);
    assert.ok(store.recallState(sid, 'topic-other::0'), 'other topics are kept');
  }
  // The new two-card set starts fresh; nothing is inherited.
  store.ensureRecallCard('s-reset-a', 'topic-r::0', 'topic-r');
  store.ensureRecallCard('s-reset-a', 'topic-r::1', 'topic-r');
  assert.equal(store.recallState('s-reset-a', 'topic-r::0').lapses, 0);
  assert.equal(store.dueRecallCards('s-reset-a', { topicId: 'topic-r' }).length, 2);
});

test('dropRecallCards removes due entries whose card no longer exists', () => {
  const sid = 's-orphan';
  for (let i = 0; i < 3; i++) store.ensureRecallCard(sid, `topic-o::${i}`, 'topic-o');
  const before = store.recallDueCount(sid);
  store.dropRecallCards(sid, ['topic-o::2', 'topic-o::9']);
  assert.equal(store.recallDueCount(sid), before - 1);
  assert.equal(store.recallState(sid, 'topic-o::2'), null);
});
