// Store mutations behind the calendar: settings, start date, extras pruning,
// and re-mastering a topic. Saves go to a fetch stub.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const saved = [];
globalThis.fetch = async (path, options = {}) => {
  if (options.body) saved.push(JSON.parse(options.body));
  return { ok: true, status: 200, headers: new Headers({ ETag: `"v${saved.length}"` }), json: async () => ({}) };
};

const store = await import('../src/js/store.js');
const { masteredBeforeTrack } = await import('../src/js/scheduler.js');

const id = store.addStudent('Sample Nine', 2017);
let emits = 0;
store.subscribe(() => { emits += 1; });

test('setCalendarSettings normalizes malformed input', async () => {
  store.setCalendarSettings({
    homeDays: ['1', 3, '3', 'x', 9, -1, 2.5],
    breaks: [
      { start: '2026-12-31', end: '2026-12-20', label: 42 },
      { start: '2026-02-30', end: '2026-03-02', label: 'Not a date' },
      { start: 'soon', end: '2026-01-01' },
      null,
      { start: '2026-11-23', end: '2026-11-27', label: '  Thanksgiving  ' },
    ],
  });
  assert.deepEqual(store.calendarSettings(), {
    homeDays: [1, 3],
    breaks: [
      { start: '2026-11-23', end: '2026-11-27', label: 'Thanksgiving' },
      { start: '2026-12-20', end: '2026-12-31', label: '' },
    ],
  });
  store.setCalendarSettings({ homeDays: 'Mon-Fri' });
  assert.deepEqual(store.calendarSettings(), { homeDays: [1, 2, 3, 4, 5], breaks: [] });
  await store.flushSaves();
  assert.deepEqual(saved.at(-1).settings.calendar, { homeDays: [1, 2, 3, 4, 5], breaks: [] });
});

test('setStartDate can clear moves in one mutation', async () => {
  store.moveTopic(id, 't1', '2026-10-20');
  store.moveTopic(id, 't2', '2026-10-21');
  const before = emits;
  store.setStartDate(id, '2026-11-02');
  assert.equal(emits, before + 1);
  assert.equal(store.activeStudent().startDate, '2026-11-02');
  assert.equal(Object.keys(store.planOverrides(id).moves).length, 2);
  store.setStartDate(id, '2026-11-09', { clearMoves: true });
  assert.equal(emits, before + 2);
  assert.deepEqual(store.planOverrides(id).moves, {});
  store.setStartDate(id, 'not-a-date', { clearMoves: true });
  assert.equal(store.activeStudent().startDate, '2026-11-09');
  await store.flushSaves();
  assert.equal(saved.at(-1).students[0].startDate, '2026-11-09');
});

test('pruneExtras drops only the named extras, once', () => {
  store.addExtra(id, '2026-10-01', { kind: 'practice', topicId: 'gone' });
  store.addExtra(id, '2026-10-01', { kind: 'practice', topicId: 'kept' });
  const [gone, kept] = store.extrasOn(id, '2026-10-01');
  const before = emits;
  store.pruneExtras(id, '2026-10-01', [gone.id]);
  assert.deepEqual(store.extrasOn(id, '2026-10-01').map(x => x.id), [kept.id]);
  assert.equal(emits, before + 1);
  store.pruneExtras(id, '2026-10-01', [gone.id]); // nothing left to prune: no save
  assert.equal(emits, before + 1);
  store.pruneExtras(id, '2026-10-01', [kept.id]);
  assert.deepEqual(store.extrasOn(id, '2026-10-01'), []);
  assert.ok(!('2026-10-01' in store.planOverrides(id).extras));
});

test('re-mastering keeps the placement source and the original date', () => {
  const placedAt = Date.parse('2026-09-01T10:00:00');
  store.setStatusBulk(id, ['placed', 'other'], 'mastered', { source: 'placement', updatedAt: placedAt, activity: false });
  store.setStatus(id, 'manual', 'mastered');
  const manual = store.progressFor(id).manual;
  const startKey = '2026-11-09';
  const before = masteredBeforeTrack(store.progressFor(id), startKey);

  // A passed retake or refresher sets 'mastered' again.
  store.setStatus(id, 'placed', 'mastered');
  store.setStatus(id, 'manual', 'mastered');
  assert.deepEqual(store.progressFor(id).placed, { source: 'placement', status: 'mastered', updatedAt: placedAt });
  assert.deepEqual(store.progressFor(id).manual, manual);
  assert.deepEqual(masteredBeforeTrack(store.progressFor(id), startKey), before);

  // A real change still replaces the entry.
  store.setStatus(id, 'placed', 'practicing');
  assert.equal(store.progressFor(id).placed.source, undefined);
  assert.equal(store.statusOf(id, 'placed'), 'practicing');
});
