import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { buildDailyChoices, coverageFields, invitationEvidenceSummary, laneOptions, LANES, pickKey } from '../src/js/daily.js';

// A small taxonomy served to data.js, and quiet saves for store.js.
const taxonomy = {
  topics: [
    { id: 'p1', name: 'Hear first sounds', subject: 'English', domain: 'Phonics & Word Reading', ageRangeStart: 6, centrality: 1 },
    { id: 'p2', name: 'Blend three sounds', subject: 'English', domain: 'Phonics & Word Reading', ageRangeStart: 6, centrality: 1 },
    { id: 'p3', name: 'Read short words', subject: 'English', domain: 'Phonics & Word Reading', ageRangeStart: 6, centrality: 1 },
    { id: 'h1', name: 'Hold a pencil', subject: 'English', domain: 'Handwriting & Transcription', ageRangeStart: 6, centrality: 0 },
  ],
  dependencies: [
    { topicId: 'p2', prerequisiteId: 'p1', strength: 'hard' },
    { topicId: 'p3', prerequisiteId: 'p2', strength: 'hard' },
  ],
};
const json = (body) => ({ ok: true, status: 200, headers: new Headers({ ETag: '"v1"' }), json: async () => body });
globalThis.fetch = async (url) => {
  const path = String(url);
  if (path.endsWith('/topics.json')) return json({ topics: taxonomy.topics });
  if (path.endsWith('/dependencies.json')) return json({ dependencies: taxonomy.dependencies });
  if (path.endsWith('/clusters.json')) return json({ clusters: [] });
  if (path.endsWith('/manifest.json')) return json(null);
  return json({});
};
const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

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

test('blocked names the first unmet prerequisite and is capped at two of three candidates', () => {
  const list = [
    topic('open', 'English', 'Phonics & Word Reading', 6, 0),
    topic('two-gates', 'English', 'Phonics & Word Reading', 6, 3),
    topic('lock-b', 'English', 'Speaking & Listening', 6, 2),
    topic('lock-c', 'English', 'Writing Composition', 6, 1),
  ];
  const prereqs = { 'two-gates': ['gate-1', 'gate-2'], 'lock-b': ['gate-2'], 'lock-c': ['gate-1'] };
  const gates = new Map([['gate-1', { id: 'gate-1', name: 'gate-1' }], ['gate-2', { id: 'gate-2', name: 'gate-2' }]]);
  const blockingPrereqs = (id) => (prereqs[id] || []).map((p) => gates.get(p));
  const { blocked } = laneOptions(list, LANES.literacy, ctx({ isUnlocked: (id) => !prereqs[id], blockingPrereqs }));
  assert.equal(blocked.length, 2, 'three locked candidates, two shown');
  assert.deepEqual(blocked.map((b) => b.topic.id), ['two-gates', 'lock-b'], 'most central first');
  assert.equal(blocked[0].needs.id, 'gate-1', 'the first unmet prerequisite, not the last');
  assert.equal(laneOptions(list, LANES.literacy, ctx({ isUnlocked: (id) => !prereqs[id], blockingPrereqs }), 2, 3).blocked.length, 3);
});

// ---- todaysChoices (store + taxonomy) ----

test('todaysChoices keeps saved offers and recomputes blocked, never listing an offer as blocked', async () => {
  const { loadTaxonomy } = await import('../src/js/data.js');
  await loadTaxonomy();
  const store = await import('../src/js/store.js');
  const { todaysChoices } = await import('../src/js/mastery.js');
  const sid = store.addStudent('Sample Nine', new Date().getFullYear() - 6);
  const day = '2026-09-26';
  store.setStatus(sid, 'p1', 'mastered');

  const first = todaysChoices(sid, day).literacy;
  assert.deepEqual(first.options.map((t) => t.id).sort(), ['h1', 'p2']);
  assert.deepEqual(store.dailyFor(sid, day).offers.literacy.sort(), ['h1', 'p2'], 'offers are saved');
  assert.deepEqual(first.blocked.map((b) => [b.topic.id, b.needs.id]), [['p3', 'p2']]);

  // p2 locks again: it stays offered today and is not also "Not yet".
  store.setStatus(sid, 'p1', 'learning');
  const relocked = todaysChoices(sid, day).literacy;
  assert.deepEqual(relocked.options.map((t) => t.id).sort(), ['h1', 'p2']);
  assert.ok(!relocked.blocked.some((b) => b.topic.id === 'p2'));
  assert.deepEqual(relocked.blocked.map((b) => [b.topic.id, b.needs.id]), [['p3', 'p2']]);

  // Mastering the prerequisite clears blocked at once, while offers stay put.
  store.setStatus(sid, 'p1', 'mastered');
  store.setStatus(sid, 'p2', 'mastered');
  const opened = todaysChoices(sid, day).literacy;
  assert.deepEqual(opened.blocked, []);
  assert.deepEqual(store.dailyFor(sid, day).offers.literacy.sort(), ['h1', 'p2']);
});

// ---- Coverage-claim evidence ----

test('the coverage checkbox is unchecked by default and escapes topic names', async () => {
  const { coverageClaimField } = await import('../src/js/recorder.js');
  const html = coverageClaimField([{ id: 'x', name: 'Count <b>to</b> ten' }]);
  assert.match(html, /<input type="checkbox" name="claimCoverage"/);
  assert.doesNotMatch(html, /\bchecked\b/);
  assert.match(html, /Mark curriculum coverage for <strong[^>]*>Count &lt;b&gt;to&lt;\/b&gt; ten<\/strong>/);
  assert.equal(coverageClaimField([]), '');
  // Both forms use this field, and only a checked box adds coverage.
  for (const path of ['src/js/recorder.js', 'src/js/views/records.js']) {
    const src = await source(path);
    assert.match(src, /\$\{coverageClaimField\(coverageTopics\)\}/, path);
    assert.match(src, /coverageFields\(coverageTopics, !!fd\.get\('claimCoverage'\), options\.source\)/, path);
  }
});


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
  assert.deepEqual(invitationEvidenceSummary(records, a), { recordCount: 1, coverageCount: 1 });
  assert.deepEqual(invitationEvidenceSummary(records, b), { recordCount: 1, coverageCount: 1 });
  // Keys match whole, never as a prefix of a joined key.
  assert.deepEqual(invitationEvidenceSummary(records, '2026-09-26|literacy|eng'), { recordCount: 0, coverageCount: 0 });
});

test('malformed coverage entries never count as evidence', () => {
  const a = pickKey('2026-09-26', 'literacy', 'eng-phonics');
  const records = [
    { source: { kind: 'daily-pick', key: a }, coverage: [null] },
    { source: { kind: 'daily-pick', key: a }, coverage: [{}] },
    { source: { kind: 'daily-pick', key: a }, coverage: 'eng-phonics' },
    { source: null, coverage: [{ topicId: 'eng-phonics' }] },
  ];
  assert.deepEqual(invitationEvidenceSummary(records, a), { recordCount: 3, coverageCount: 0 });
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

test('bad interests entries (null, arrays, non-strings) read as empty', async () => {
  const store = await import('../src/js/store.js');
  for (const bad of [null, [], 'Animals', 7, { chips: null, text: 5 }, { chips: [null, 3, ' ok '], text: null }]) {
    store.get().interests['s-bad'] = bad;
    const got = store.interestsFor('s-bad');
    assert.ok(Array.isArray(got.chips) && typeof got.text === 'string', JSON.stringify(bad));
  }
  assert.deepEqual(store.interestsFor('s-bad'), { chips: ['ok'], text: '' });
  assert.equal(store.inspectImport({ students: [{ id: 's1', name: 'Sample Nine' }], interests: { s1: null } }).ok, true);
});

test('a quiet interests save persists without re-rendering', async () => {
  const store = await import('../src/js/store.js');
  let emits = 0;
  const off = store.subscribe(() => { emits++; });
  store.setInterests('s-quiet', { chips: [], text: 'typing' }, { quiet: true });
  off();
  assert.equal(emits, 0);
  assert.equal(store.interestsFor('s-quiet').text, 'typing');
});
