// Calendar follow-ups from the HAR-18 review: rest days pause the rhythm,
// topic-scoped extra practice, done days that became rest days, an unlocked
// stretch, the "New on <weekday>" heading and the catch-up pace.
import assert from 'node:assert/strict';
import { test } from 'node:test';

// A small taxonomy for data.js (the store-backed wrappers) and quiet saves.
const taxonomy = {
  topics: [
    { id: 'm7-base', name: 'Base skill', subject: 'Mathematics', domain: 'Addition & Subtraction', ageRangeStart: 7, centrality: 1 },
    { id: 'm8-stretch', name: 'Stretch skill', subject: 'Mathematics', domain: 'Addition & Subtraction', ageRangeStart: 8, centrality: 1 },
  ],
  dependencies: [{ topicId: 'm8-stretch', prerequisiteId: 'gate', strength: 'hard' }, { topicId: 'gate', prerequisiteId: 'm7-base', strength: 'hard' }],
};
taxonomy.topics.push({ id: 'gate', name: 'Gate skill', subject: 'Mathematics', domain: 'Mathematical Thinking', ageRangeStart: 5, centrality: 0 });
const json = (body) => ({ ok: true, status: 200, headers: new Headers({ ETag: '"v1"' }), json: async () => body });
globalThis.fetch = async (url) => {
  const path = String(url);
  if (path.endsWith('/topics.json')) return json({ topics: taxonomy.topics });
  if (path.endsWith('/dependencies.json')) return json({ dependencies: taxonomy.dependencies });
  if (path.endsWith('/clusters.json')) return json({ clusters: [] });
  if (path.endsWith('/manifest.json')) return json(null);
  return json({});
};

const {
  pauseInfo, newTopicsHeading, doneControl, pickExtras, planTrack, restInfo, parseKey, keyOf,
  paceSummary, weeksBetween, normalizePace, PACES, DEFAULT_PACE, dailyExtras, buildPlan, invalidatePlan,
} = await import('../src/js/scheduler.js');
const store = await import('../src/js/store.js');
const { loadTaxonomy } = await import('../src/js/data.js');

const topic = (id, subject, domain, ageRangeStart, centrality = 0) => ({ id, name: id, subject, domain, ageRangeStart, centrality });

// ---- 1. Rest days pause the rhythm ----

test('pauseInfo names the break, its last day and the next learning day', () => {
  const cal = { homeDays: [1, 2, 3, 4, 5], breaks: [{ start: '2026-10-12', end: '2026-10-16', label: 'Fall break' }] };
  assert.equal(pauseInfo('2026-10-07', cal), null, 'a Wednesday home day');
  assert.deepEqual(pauseInfo('2026-10-14', cal), { kind: 'break', label: 'Fall break', until: '2026-10-16', nextKey: '2026-10-19' });
  // The weekend before the break: a rest day whose next learning day is after the break.
  assert.deepEqual(pauseInfo('2026-10-10', cal), { kind: 'off', until: null, nextKey: '2026-10-19' });
  assert.deepEqual(pauseInfo('2026-10-17', cal), { kind: 'off', until: null, nextKey: '2026-10-19' });
});

// ---- 3. A done day that became a rest day can be reopened ----

test('doneControl: mark on home days, unmark whenever done, nothing on an untouched rest day', () => {
  assert.equal(doneControl(null, false), 'mark');
  assert.equal(doneControl(null, true), 'unmark');
  assert.equal(doneControl({ kind: 'break' }, true), 'unmark', 'done before the break: the check stays and can be reopened');
  assert.equal(doneControl({ kind: 'off' }, true), 'unmark');
  assert.equal(doneControl({ kind: 'break' }, false), null);
});

test('a day marked done keeps its record when it becomes a rest day, and the parent can unmark it', () => {
  const sid = store.addStudent('Sample Twelve', 2018);
  store.toggleDayDone(sid, '2026-10-14');
  store.setCalendarSettings({ breaks: [{ start: '2026-10-12', end: '2026-10-16', label: 'Fall break' }] });
  const rest = pauseInfo('2026-10-14', store.calendarSettings());
  assert.equal(rest.kind, 'break');
  assert.equal(store.isDayDone(sid, '2026-10-14'), true, 'the record stays');
  assert.equal(doneControl(rest, store.isDayDone(sid, '2026-10-14')), 'unmark');
  store.toggleDayDone(sid, '2026-10-14');
  assert.equal(store.isDayDone(sid, '2026-10-14'), false);
  assert.equal(doneControl(rest, false), null, 'once reopened, a rest day offers no Mark done');
  store.setCalendarSettings({});
});

// ---- 4. The stretch only picks unlocked topics ----

test('the stretch never picks a locked topic; with only a locked candidate there is none', () => {
  const ts = [
    topic('known', 'Mathematics', 'A', 7), // mastered: the refresher
    topic('locked-stretch', 'Mathematics', 'A', 8), // the only unmastered topic near age 8, and locked
    topic('far', 'Mathematics', 'A', 12),
  ];
  const statusOf = (id) => (id === 'known' ? 'mastered' : 'none');
  const isUnlocked = (id) => id !== 'locked-stretch';
  for (let i = 0; i < 30; i++) {
    const dateKey = keyOf(new Date(2026, 9, 1 + i));
    const x = pickExtras(ts, { seed: 's|' + dateKey, dateKey, age: 8, statusOf, isUnlocked });
    assert.equal(x.challenge, null, dateKey);
    assert.equal(x.refresher.id, 'known');
  }
  // Once unlocked, it is the stretch.
  const open = pickExtras(ts, { seed: 's|d', dateKey: '2026-10-01', age: 8, statusOf, isUnlocked: () => true });
  assert.equal(open.challenge.id, 'locked-stretch');
});

test('dailyExtras passes the learner\'s locks: a learner whose only stretch topic is locked gets no stretch', async () => {
  await loadTaxonomy();
  const sid = store.addStudent('Sample Thirteen', new Date().getFullYear() - 8);
  // m7-base mastered; gate (age 5, outside the stretch window) is not, so m8-stretch is locked.
  store.setStatus(sid, 'm7-base', 'mastered');
  const student = store.get().students.find((s) => s.id === sid);
  for (const day of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']) {
    assert.equal(dailyExtras(student, day).challenge, null, day);
  }
  store.setStatus(sid, 'gate', 'mastered');
  assert.equal(dailyExtras(student, '2026-10-05').challenge.id, 'm8-stretch');
});

// ---- 5. "New today" only on today ----

test('the new-topics heading says "New today" only for today', () => {
  assert.equal(newTopicsHeading('2026-10-07', '2026-10-07'), 'New today');
  assert.equal(newTopicsHeading('2026-10-08', '2026-10-07'), 'New on Thursday');
  assert.equal(newTopicsHeading('2026-10-05', '2026-10-07'), 'New on Monday');
});

// ---- 6. Catch-up pace ----

// 30 catch-up topics (ages 5–7, two spine domains) and a 360-topic age-8 band
// (two per home day).
const ramp = ['Counting & Cardinality', 'Addition & Subtraction'].flatMap((dm) => [5, 6, 7].flatMap((age) =>
  [0, 1, 2, 3, 4].map((n) => topic(`${dm.slice(0, 3)}-${age}-${n}`, 'Mathematics', dm, age, 5 - n))));
const band = Array.from({ length: 360 }, (_, i) => topic(`b8-${i}`, i % 2 ? 'Mathematics' : 'Science', 'Band', 8));
const all = [...ramp, ...band];
const base = { startKey: '2026-09-07', age: 8, subjects: ['Mathematics', 'Science'] }; // a Monday
const rampIds = new Set(ramp.map((t) => t.id));
const ordered = (plan) => [...plan.topicDate].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));

test('pace values: catch-up first is the default and anything else falls back to it', () => {
  assert.deepEqual(PACES, ['catch-up-first', 'mixed']);
  assert.equal(DEFAULT_PACE, 'catch-up-first');
  assert.equal(normalizePace(undefined), 'catch-up-first');
  assert.equal(normalizePace('fast'), 'catch-up-first');
  assert.equal(normalizePace('mixed'), 'mixed');
});

test('catch-up first: unchanged dates by default, every catch-up topic before the first own-age one', () => {
  const plain = planTrack(all, base);
  const explicit = planTrack(all, { ...base, pace: 'catch-up-first' });
  assert.deepEqual([...explicit.topicDate], [...plain.topicDate], 'no existing family\'s dates shift');
  assert.equal(plain.ramp.count, 30);
  assert.ok(plain.ramp.lastKey < plain.ramp.firstOwnKey);
  assert.equal(plain.ramp.firstOwnKey, plain.topicDate.get('b8-0'));
  // 30 topics at two a day: 15 home days, three weeks.
  assert.equal(weeksBetween(base.startKey, plain.ramp.firstOwnKey), 3);
  assert.equal(paceSummary(plain, base.startKey, 'catch-up-first', 'Sample'),
    "Catch-up first: 30 catch-up topics come before Sample's first own-age topic, about 3 weeks of home days.");
});

test('mixed: two catch-up topics to one own-age topic, same topics, same per-day cap', () => {
  const first = planTrack(all, base);
  const mixed = planTrack(all, { ...base, pace: 'mixed' });
  assert.deepEqual([...mixed.topicDate.keys()].sort(), [...first.topicDate.keys()].sort(), 'no topic gained or lost');
  assert.ok(Math.max(...[...mixed.byDate.values()].map((l) => l.length)) <= 2);
  // The first 45 placed topics: 30 catch-up and 15 own-age, in a 2:1 rhythm.
  const firstIds = ordered(mixed).slice(0, 45).map(([id]) => id);
  assert.equal(firstIds.filter((id) => rampIds.has(id)).length, 30);
  assert.equal(mixed.ramp.firstOwnKey, '2026-09-08', 'own-age topics start in the first week');
  assert.ok(mixed.ramp.lastKey > first.ramp.lastKey, 'catch-up takes longer when mixed');
  assert.equal(weeksBetween(base.startKey, mixed.ramp.lastKey), 4);
  assert.equal(paceSummary(mixed, base.startKey, 'mixed', 'Sample'),
    'Mixed: two catch-up topics to one own-age topic. 30 catch-up topics finish in about 4 weeks, with own-age topics from the first week.');
});

test('mixed never places an own-age topic before its catch-up prerequisite', () => {
  // b8-0 needs the last catch-up topic in the ramp order.
  const lastRamp = planTrack(all, base);
  const lastId = ordered(lastRamp).filter(([id]) => rampIds.has(id)).at(-1)[0];
  const prereqs = (id) => (id === 'b8-0' ? [lastId] : []);
  const mixed = planTrack(all, { ...base, pace: 'mixed', prereqs });
  assert.ok(mixed.topicDate.get(lastId) < mixed.topicDate.get('b8-0'));
  assert.equal(mixed.topicDate.get('b8-1'), '2026-09-08', 'the next own-age topic takes its turn');
});

test('both paces keep rest days empty, and a learner with nothing to catch up says so', () => {
  const calendar = { homeDays: [1, 3, 5], breaks: [{ start: '2026-09-21', end: '2026-09-25', label: 'Break' }] };
  for (const pace of PACES) {
    const plan = planTrack(all, { ...base, calendar, pace });
    for (const k of plan.byDate.keys()) assert.equal(restInfo(k, calendar), null, `${pace} ${k}`);
  }
  const young = planTrack(band, { ...base });
  assert.equal(young.ramp.count, 0);
  assert.equal(paceSummary(young, base.startKey, 'mixed', 'Sample'), "No catch-up topics: the track starts at Sample's own age.");
});

test('switching pace never loses done days, moves, extras or the calendar', async () => {
  await loadTaxonomy();
  const sid = store.addStudent('Sample Fourteen', 2018);
  store.setCalendarSettings({ homeDays: [1, 2, 4], breaks: [{ start: '2026-11-23', end: '2026-11-27', label: 'Thanksgiving' }] });
  store.toggleDayDone(sid, '2026-10-05');
  store.toggleDayDone(sid, '2026-11-24'); // done, then inside the break
  store.moveTopic(sid, 'm7-base', '2026-10-06');
  store.addExtra(sid, '2026-10-06', { kind: 'practice', topicId: 'm7-base' });
  const before = JSON.parse(JSON.stringify({ plan: store.planOverrides(sid), cal: store.calendarSettings() }));

  store.setCatchUpPace(sid, 'mixed');
  assert.equal(store.planOverrides(sid).pace, 'mixed');
  store.setCatchUpPace(sid, 'catch-up-first');
  assert.ok(!('pace' in store.planOverrides(sid)), 'the default is not stored');
  store.setCatchUpPace(sid, 'mixed');
  store.setCatchUpPace(sid, 'nonsense');
  assert.ok(!('pace' in store.planOverrides(sid)));
  assert.deepEqual(JSON.parse(JSON.stringify({ plan: store.planOverrides(sid), cal: store.calendarSettings() })), before);
  assert.equal(store.isDayDone(sid, '2026-11-24'), true);

  // The plan is rebuilt for the new pace without an explicit invalidation
  // (the cache key includes it), and switching back gives the same dates.
  const student = store.get().students.find((s) => s.id === sid);
  const a = buildPlan(student);
  store.setCatchUpPace(sid, 'mixed');
  assert.notEqual(buildPlan(student), a);
  store.setCatchUpPace(sid, 'catch-up-first');
  invalidatePlan(sid);
  assert.deepEqual([...buildPlan(student).topicDate], [...a.topicDate]);
  store.setCalendarSettings({});
});

// ---- 2. Extra practice is scoped to its topic ----

test('topicPracticeItems: only that topic\'s retries, soonest first, each marked due or not', () => {
  const sid = store.addStudent('Sample Fifteen', 2018);
  const a = store.enqueuePracticeItem(sid, { topicId: 'm7-base', subject: 'Mathematics', q: 'One?', type: 'short', answer: '1' });
  store.enqueuePracticeItem(sid, { topicId: 'other', subject: 'Mathematics', q: 'Two?', type: 'short', answer: '2' });
  store.enqueuePracticeItem(sid, { topicId: 'm7-base', subject: 'Mathematics', q: 'Three?', type: 'short', answer: '3' });
  // Answer one correctly: it moves to a later day and is no longer due.
  const idA = store.duePracticeItems(sid).find((x) => x.q === a.q).id;
  store.gradePracticeItem(sid, idA, true);
  const items = store.topicPracticeItems(sid, 'm7-base');
  assert.deepEqual(items.map((x) => [x.q, x.isDue]), [['Three?', true], ['One?', false]]);
  assert.ok(items.every((x) => x.topicId === 'm7-base'));
  assert.deepEqual(store.topicPracticeItems(sid, 'nothing-queued'), []);
  assert.equal(store.practiceDueCount(sid), 2, 'the global queue still holds the other topic');
});

test('the calendar opens a practice extra on its own topic, not the global queue', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/js/views/calendar.js', import.meta.url), 'utf8');
  assert.match(src, /x\.kind === 'practice'\) \{ openTopicPractice\(topic\)/);
  assert.doesNotMatch(src, /openDuePractice\(\)/);
  assert.match(src, /import \{ gateAi, aiUnavailableChip \} from '\.\.\/ai-status\.js'/, 'the gateAi import stays (#29)');
});

test('parseKey and keyOf round-trip the pause dates', () => {
  const p = pauseInfo('2026-12-24', { breaks: [{ start: '2026-12-21', end: '2027-01-01', label: 'Winter' }] });
  assert.equal(keyOf(parseKey(p.until)), '2027-01-01');
  assert.equal(p.nextKey, '2027-01-04');
});
