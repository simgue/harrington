import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDailyChoices, coverageFields, invitationEvidenceSummary, laneOptions, LANES, pickKey } from '../src/js/daily.js';

const topic = (id, subject, domain, ageRangeStart = 6, centrality = 0) => ({ id, name: id, subject, domain, ageRangeStart, centrality });

const topics = [
  topic('sh-sounds', 'English', 'Phonics & Word Reading'),
  topic('blend-4', 'English', 'Phonics & Word Reading'),
  topic('chalk-letters', 'English', 'Handwriting & Transcription'),
  topic('retell', 'English', 'Speaking & Listening'),
  topic('essay', 'English', 'Writing Composition', 12),
  topic('grammar', 'English', 'Grammar'),
  topic('bonds-10', 'Mathematics', 'Addition & Subtraction'),
  topic('count-20', 'Mathematics', 'Counting & Cardinality'),
  topic('place-value', 'Mathematics', 'Number Representation & Place Value'),
  topic('fractions', 'Mathematics', 'Fractions'),
];

const ctx = (overrides = {}) => ({
  age: 6,
  dateKey: '2026-09-26',
  now: Date.parse('2026-09-26T09:00:00Z'),
  statusOf: () => 'none',
  isUnlocked: () => true,
  lastTouched: () => 0,
  topicAge: (t) => Math.min(13, Math.max(5, t.ageRangeStart || 5)),
  ...overrides,
});

test('offers two options per lane from the POC focus domains only', () => {
  const choices = buildDailyChoices(topics, ctx());
  assert.equal(choices.literacy.options.length, 2);
  assert.equal(choices.numeracy.options.length, 2);
  for (const t of choices.literacy.options) assert.ok(LANES.literacy.domains.includes(t.domain), t.id);
  for (const t of choices.numeracy.options) assert.ok(LANES.numeracy.domains.includes(t.domain), t.id);
});

test('never offers mastered, locked, or too-advanced topics', () => {
  const { options } = laneOptions(topics, LANES.literacy, ctx({
    statusOf: (id) => (id === 'sh-sounds' ? 'mastered' : 'none'),
    isUnlocked: (id) => id !== 'chalk-letters',
  }), 10);
  const ids = options.map((t) => t.id);
  assert.ok(!ids.includes('sh-sounds'), 'mastered');
  assert.ok(!ids.includes('chalk-letters'), 'locked');
  assert.ok(!ids.includes('essay'), 'too far ahead for age 6');
  assert.ok(!ids.includes('grammar'), 'outside the focus domains');
});

test('the two options come from different domains when possible', () => {
  const [a, b] = laneOptions(topics, LANES.literacy, ctx()).options;
  assert.notEqual(a.domain, b.domain);
});

test('work already in progress is offered first', () => {
  const [first] = laneOptions(topics, LANES.numeracy, ctx({ statusOf: (id) => (id === 'place-value' ? 'learning' : 'none') })).options;
  assert.equal(first.id, 'place-value');
});

test('a domain that has gone quiet outranks one touched yesterday', () => {
  const now = Date.parse('2026-09-26T09:00:00Z');
  const [first] = laneOptions(topics, LANES.numeracy, ctx({
    lastTouched: (domain) => (domain === 'Addition & Subtraction' ? now - 86400000 : domain === 'Counting & Cardinality' ? now - 12 * 86400000 : now - 86400000),
  })).options;
  assert.equal(first.id, 'count-20');
});

test('falls back to the whole subject when no focus domains exist', () => {
  const other = [topic('shapes', 'Mathematics', 'Geometry'), topic('money', 'Mathematics', 'Money')];
  const { options } = laneOptions(other, LANES.numeracy, ctx());
  assert.deepEqual(options.map((t) => t.id).sort(), ['money', 'shapes']);
});

test('the same day always yields the same offer', () => {
  const a = buildDailyChoices(topics, ctx());
  const b = buildDailyChoices(topics, ctx());
  assert.deepEqual(a.literacy.options.map((t) => t.id), b.literacy.options.map((t) => t.id));
  assert.deepEqual(a.numeracy.options.map((t) => t.id), b.numeracy.options.map((t) => t.id));
});

// ---- Why-locked: fixture ported from the HAR-4 focus prototype ----

const chain = [
  { id: 'eng-phonics', name: 'Blend simple sounds', subject: 'English', domain: 'Phonics & Word Reading', ageRangeStart: 6, centrality: 0.9 },
  { id: 'eng-speaking', name: 'Explain a build step', subject: 'English', domain: 'Speaking & Listening', ageRangeStart: 6, centrality: 1.2 },
  { id: 'eng-writing', name: 'Write a short build note', subject: 'English', domain: 'Writing Composition', ageRangeStart: 7, centrality: 0.8 },
  { id: 'eng-essay', name: 'Write a long essay', subject: 'English', domain: 'Writing Composition', ageRangeStart: 12, centrality: 2 },
  { id: 'math-counting', name: 'Count materials to ten', subject: 'Mathematics', domain: 'Counting & Cardinality', ageRangeStart: 6, centrality: 1.1 },
  { id: 'math-place', name: 'Read simple measurements', subject: 'Mathematics', domain: 'Number Representation & Place Value', ageRangeStart: 6, centrality: 1.3 },
  { id: 'math-add', name: 'Combine two material totals', subject: 'Mathematics', domain: 'Addition & Subtraction', ageRangeStart: 7, centrality: 0.7 },
];
const byId = new Map(chain.map((t) => [t.id, t]));
const hard = {
  'eng-speaking': ['eng-phonics'],
  'eng-writing': ['eng-speaking'],
  'eng-essay': ['eng-writing'],
  'math-place': ['math-counting'],
  'math-add': ['math-place'],
};

function chainCtx(progress) {
  const statusOf = (id) => progress[id] || 'none';
  const blockingPrereqs = (id) => (hard[id] || []).filter((p) => statusOf(p) !== 'mastered').map((p) => byId.get(p));
  return ctx({ statusOf, isUnlocked: (id) => blockingPrereqs(id).length === 0, blockingPrereqs });
}

test('blocked lists locked, age-appropriate topics with their first unmet prerequisite', () => {
  const { options, blocked } = laneOptions(chain, LANES.literacy, chainCtx({ 'eng-phonics': 'learning' }));
  assert.deepEqual(options.map((t) => t.id), ['eng-phonics']);
  assert.equal(blocked.length, 2);
  assert.equal(blocked[0].topic.id, 'eng-speaking');
  assert.equal(blocked[0].needs.id, 'eng-phonics');
  assert.equal(blocked[1].topic.id, 'eng-writing');
  assert.equal(blocked[1].needs.id, 'eng-speaking');
  assert.ok(!blocked.some((b) => b.topic.id === 'eng-essay'), 'too far ahead for age 6');
});

test('blocked is capped at two and moves on once a prerequisite is mastered', () => {
  const { options, blocked } = laneOptions(chain, LANES.literacy, chainCtx({ 'eng-phonics': 'mastered', 'eng-speaking': 'learning' }));
  assert.deepEqual(options.map((t) => t.id), ['eng-speaking']);
  assert.deepEqual(blocked.map((b) => [b.topic.id, b.needs.id]), [['eng-writing', 'eng-speaking']]);
  assert.ok(laneOptions(chain, LANES.literacy, chainCtx({}), 2, 5).blocked.length <= 5);
  assert.ok(laneOptions(chain, LANES.literacy, chainCtx({})).blocked.length <= 2);
});

test('blocked is empty when every topic is open or blockingPrereqs is not given', () => {
  assert.deepEqual(laneOptions(chain, LANES.numeracy, chainCtx({ 'math-counting': 'mastered', 'math-place': 'mastered' })).blocked, []);
  assert.deepEqual(laneOptions(chain, LANES.numeracy, ctx({ isUnlocked: (id) => !hard[id] })).blocked, []);
});

test('numeracy blocked entries follow the chain', () => {
  const { blocked } = buildDailyChoices(chain, chainCtx({ 'math-counting': 'practicing' })).numeracy;
  assert.deepEqual(blocked.map((b) => [b.topic.id, b.needs.id]), [['math-place', 'math-counting'], ['math-add', 'math-place']]);
});

// ---- Coverage-claim evidence ----

test('pick keys are deterministic', () => {
  assert.equal(pickKey('2026-09-26', 'literacy', 'eng-phonics'), '2026-09-26|literacy|eng-phonics');
  assert.equal(pickKey('2026-09-26', 'literacy', 'eng-phonics'), pickKey('2026-09-26', 'literacy', 'eng-phonics'));
});

test('evidence needs a linked record with a coverage claim', () => {
  const a = pickKey('2026-09-26', 'literacy', 'eng-phonics');
  const b = pickKey('2026-09-26', 'numeracy', 'math-counting');
  const records = [
    { id: 'rec-1', source: { kind: 'daily-pick', key: a } },
    { id: 'rec-2', source: { kind: 'daily-pick', key: a }, coverage: [] },
    { id: 'rec-3', source: { kind: 'daily-pick', key: b }, coverage: [{ topicId: 'math-counting', topicName: 'Count materials to ten' }] },
    { id: 'rec-4', coverage: [{ topicId: 'eng-phonics', topicName: 'Blend simple sounds' }] },
  ];
  assert.deepEqual(invitationEvidenceSummary(records, a), { recordCount: 2, coverageCount: 0 });
  assert.deepEqual(invitationEvidenceSummary(records, b), { recordCount: 1, coverageCount: 1 });
  assert.deepEqual(invitationEvidenceSummary(records, 'none'), { recordCount: 0, coverageCount: 0 });
  assert.deepEqual(invitationEvidenceSummary(undefined, a), { recordCount: 0, coverageCount: 0 });
});

test('one record can be evidence for both of the day\'s picks', () => {
  const a = pickKey('2026-09-26', 'literacy', 'eng-phonics');
  const b = pickKey('2026-09-26', 'numeracy', 'math-counting');
  const records = [{ source: { kind: 'daily-pick', key: `${a},${b}` }, coverage: [{ topicId: 'eng-phonics', topicName: 'x' }, { topicId: 'math-counting', topicName: 'y' }] }];
  assert.equal(invitationEvidenceSummary(records, a).coverageCount, 1);
  assert.equal(invitationEvidenceSummary(records, b).coverageCount, 1);
});

test('coverageFields only sets coverage when the claim is checked', () => {
  const t = [byId.get('eng-phonics')];
  const source = { kind: 'daily-pick', key: pickKey('2026-09-26', 'literacy', 'eng-phonics') };
  assert.deepEqual(coverageFields(t, false, source), { source });
  assert.deepEqual(coverageFields(t, true, source), { coverage: [{ topicId: 'eng-phonics', topicName: 'Blend simple sounds' }], source });
  assert.deepEqual(coverageFields([], true, null), {});
  assert.ok(!('coverage' in coverageFields(t, false)));
});

// ---- Interests (store) ----

test('interests are stored per learner under their own key, cleaned, with one emit per change', async () => {
  globalThis.fetch ??= async () => ({ ok: true, status: 200, headers: new Headers({ ETag: '"v1"' }), json: async () => ({}) });
  const store = await import('../src/js/store.js');
  const sid = 's-interests';
  assert.deepEqual(store.interestsFor(sid), { chips: [], text: '' }, 'no default chips');
  let emits = 0;
  const off = store.subscribe(() => { emits++; });
  store.setInterests(sid, { chips: ['  Animals ', 'animals', '', 'Building   things'], text: '  bridges  ' });
  off();
  assert.equal(emits, 1);
  assert.deepEqual(store.interestsFor(sid), { chips: ['Animals', 'Building things'], text: 'bridges' });
  assert.deepEqual(store.get().interests[sid], { chips: ['Animals', 'Building things'], text: 'bridges' });
  assert.equal(store.dailyFor(sid, '2026-09-26'), null, 'nothing written under daily');
  store.interestsFor(sid).chips.push('mutated');
  assert.equal(store.interestsFor(sid).chips.length, 2, 'callers get a copy');
  store.setInterests(sid, { chips: Array.from({ length: 20 }, (_, i) => `c${i}`), text: 'x'.repeat(900) });
  assert.equal(store.interestsFor(sid).chips.length, 12);
  assert.equal(store.interestsFor(sid).text.length, 500);
});
