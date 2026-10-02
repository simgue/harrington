import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  planTrack, pickExtras, onRampTopics, normalizeCalendar, restInfo, nextHomeDayKey, parseKey,
} from '../src/js/scheduler.js';

const topic = (id, subject, domain, ageRangeStart, centrality = 0) => ({ id, name: id, subject, domain, ageRangeStart, centrality });

// Age-8 band: 360 topics across two subjects, so two per home day.
const band = Array.from({ length: 360 }, (_, i) => topic(`b8-${i}`, i % 2 ? 'Mathematics' : 'Science', 'Band', 8));
const spine = [
  topic('phon-5', 'English', 'Phonics & Word Reading', 5),
  topic('phon-6', 'English', 'Phonics & Word Reading', 6),
  topic('read-6', 'English', 'Reading Comprehension', 6),
  topic('count-5', 'Mathematics', 'Counting & Cardinality', 5),
  topic('add-7', 'Mathematics', 'Addition & Subtraction', 7),
  topic('add-6', 'Mathematics', 'Addition & Subtraction', 6),
];
const offSpine = [topic('geo-5', 'Mathematics', 'Geometry', 5), topic('hist-6', 'History', 'Ancient', 6)];
const topics = [...band, ...spine, ...offSpine];

const base = { startKey: '2026-09-07', age: 8, subjects: ['Mathematics', 'English', 'Science', 'History'] }; // a Monday
const dayOf = (plan, id) => plan.topicDate.get(id);
const perDayMax = (plan) => Math.max(...[...plan.byDate.values()].map(l => l.length));

test('default calendar is Monday to Friday with no breaks', () => {
  assert.deepEqual(normalizeCalendar(null), { homeDays: [1, 2, 3, 4, 5], breaks: [] });
  assert.deepEqual(normalizeCalendar({ homeDays: [] }).homeDays, [1, 2, 3, 4, 5]);
  const c = normalizeCalendar({ homeDays: [3, 1, 1, 9, 'x'], breaks: [{ start: '2026-12-31', end: '2026-12-20', label: ' Winter ' }, { start: 'bad', end: '2026-01-01' }] });
  assert.deepEqual(c.homeDays, [1, 3]);
  assert.deepEqual(c.breaks, [{ start: '2026-12-20', end: '2026-12-31', label: 'Winter' }]);
});

test('rest days: outside home days or inside a break', () => {
  const cal = { homeDays: [1, 2, 3, 4], breaks: [{ start: '2026-10-12', end: '2026-10-16', label: 'Fall break' }] };
  assert.equal(restInfo('2026-10-05', cal), null); // Monday
  assert.deepEqual(restInfo('2026-10-09', cal), { kind: 'off' }); // Friday is not a home day here
  assert.deepEqual(restInfo('2026-10-10', cal), { kind: 'off' });
  assert.deepEqual(restInfo('2026-10-14', cal), { kind: 'break', label: 'Fall break' });
  assert.equal(nextHomeDayKey('2026-10-09', cal), '2026-10-19');
  assert.equal(nextHomeDayKey('2026-10-05', cal, { after: true }), '2026-10-06');
});

test('nothing is scheduled on rest days', () => {
  const calendar = { homeDays: [1, 3, 5], breaks: [{ start: '2026-11-23', end: '2026-11-27', label: 'Thanksgiving' }] };
  const plan = planTrack(topics, { ...base, calendar });
  for (const k of plan.byDate.keys()) assert.equal(restInfo(k, calendar), null, k);
  assert.ok([...plan.byDate.keys()].every(k => ![0, 2, 4, 6].includes(parseKey(k).getDay())));
});

test('a break pushes the track later rather than dropping topics', () => {
  const plain = planTrack(topics, { ...base });
  const withBreak = planTrack(topics, { ...base, calendar: { breaks: [{ start: '2026-12-21', end: '2027-01-01', label: 'Winter' }] } });
  assert.equal(withBreak.topicDate.size, plain.topicDate.size);
  assert.ok(withBreak.lastKey > plain.lastKey);
});

test('a move onto a rest day slides to the next home day', () => {
  const plan = planTrack(topics, { ...base, moves: { 'b8-0': '2026-09-12' } }); // a Saturday
  assert.equal(dayOf(plan, 'b8-0'), '2026-09-14');
});

test('on-ramp: unmastered spine topics below the age come first, youngest age first', () => {
  const ramp = onRampTopics(topics, { age: 8, mastered: id => id === 'count-5' });
  assert.deepEqual(ramp.map(t => t.id), ['phon-5', 'phon-6', 'read-6', 'add-6', 'add-7']);

  const plan = planTrack(topics, { ...base, mastered: id => id === 'count-5' });
  assert.equal(dayOf(plan, 'phon-5'), '2026-09-07');
  assert.equal(dayOf(plan, 'count-5'), undefined, 'mastered before the track: skipped');
  assert.equal(dayOf(plan, 'geo-5'), undefined, 'outside the spine domains');
  assert.equal(dayOf(plan, 'hist-6'), undefined, 'outside the spine domains');
  const order = ['phon-5', 'phon-6', 'add-6', 'add-7', 'b8-0'].map(id => dayOf(plan, id));
  assert.deepEqual([...order].sort(), order);
  assert.ok(dayOf(plan, 'add-7') <= dayOf(plan, 'b8-0'));
});

test('on-ramp never raises the per-day count; the band stretches instead', () => {
  const without = planTrack(band, { ...base });
  const cap = perDayMax(without);
  assert.equal(cap, 2);
  const plan = planTrack(topics, { ...base });
  assert.ok(perDayMax(plan) <= cap);
  assert.ok(plan.lastKey > without.lastKey);
  // A young learner has no on-ramp.
  assert.deepEqual(onRampTopics(topics, { age: 5 }), []);
});

test('refreshers come only from mastered topics; none when nothing is mastered', () => {
  const statusNone = () => 'none';
  for (const dateKey of ['2026-09-07', '2026-09-08', '2026-09-09']) {
    const x = pickExtras(topics, { seed: 's1|' + dateKey, dateKey, age: 8, statusOf: statusNone });
    assert.equal(x.refresher, null);
    assert.equal(x.refresher2, null);
  }
  const masteredIds = new Set(['phon-5', 'add-6']);
  for (const dateKey of ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10']) {
    const x = pickExtras(topics, { seed: 's1|' + dateKey, dateKey, age: 8, statusOf: id => (masteredIds.has(id) ? 'mastered' : 'none') });
    assert.ok(masteredIds.has(x.refresher.id));
    assert.ok(masteredIds.has(x.refresher2.id));
    assert.notEqual(x.refresher.id, x.refresher2.id);
  }
  // Deterministic for a given day.
  const a = pickExtras(topics, { seed: 's1|d', dateKey: 'd', age: 8, statusOf: statusNone });
  const b = pickExtras(topics, { seed: 's1|d', dateKey: 'd', age: 8, statusOf: statusNone });
  assert.equal(a.challenge.id, b.challenge.id);
});
