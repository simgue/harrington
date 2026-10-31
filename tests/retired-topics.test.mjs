// Retired topics (HAR-55): a taxonomy revision can drop a topic id the
// family's data still mentions. The 2026-10-24 revision retired mt_3XJkeIn6J6
// ("Estimating answers (age 7+)"). The data is kept, never refused on load,
// import or save, and left out of counts and daily choices; Records lists it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCHEMA_VERSION } from '../src/js/schema.js';

const RETIRED = 'mt_3XJkeIn6J6';
const RETIRED_NAME = 'Estimating answers (age 7+)';
const SID = 's_retired';
const NOW = Date.now();
const today = new Date(NOW);
const TODAY = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

const taxonomy = {
  topics: [
    { id: 'n-count', name: 'Counting', subject: 'Mathematics', domain: 'Counting & Cardinality', ageRangeStart: 5, centrality: 1, evidence: ['Counts to ten'] },
    { id: 'n-add', name: 'Adding', subject: 'Mathematics', domain: 'Counting & Cardinality', ageRangeStart: 6, centrality: 0.5, evidence: ['Adds within ten'] },
    { id: 'l-sounds', name: 'Letter sounds', subject: 'English', domain: 'Phonics', ageRangeStart: 5, centrality: 1, evidence: ['Says letter sounds'] },
  ],
  dependencies: [{ topicId: 'n-add', prerequisiteId: 'n-count', strength: 'hard' }],
};

// The family document as an older Harrington saved it, before the refresh.
function familyDoc() {
  const recall = { [`${RETIRED}::0`]: { topicId: RETIRED, box: 1, due: 0, reps: 2, lapses: 0, last: NOW - 86_400_000 } };
  return {
    schemaVersion: SCHEMA_VERSION,
    version: 3,
    students: [{ id: SID, name: 'Sample Learner', birthYear: today.getFullYear() - 8, color: '#3f6b3b', createdAt: NOW - 1e9, startDate: TODAY }],
    activeStudentId: SID,
    progress: { [SID]: { [RETIRED]: { status: 'mastered', updatedAt: NOW - 60_000 }, 'n-count': { status: 'learning', updatedAt: NOW - 120_000 } } },
    records: { [SID]: [{ id: 'r1', type: 'observation', title: 'Estimated the jar', topicId: RETIRED, topicName: RETIRED_NAME, createdAt: NOW - 3_600_000 }] },
    tests: { [SID]: [{ id: 't1', scope: 'topic', subject: 'Mathematics', topicId: RETIRED, mode: 'digital', score: 9, total: 10, pct: 90, passed: true, createdAt: NOW - 7_200_000 }] },
    recall: { [SID]: recall },
    practice: { [SID]: { p1: { topicId: RETIRED, subject: 'Mathematics', q: 'About how many?', type: 'short', answer: '20', box: 0, due: 0, reps: 0, lapses: 0, last: 0 } } },
    plan: { [SID]: { moves: { [RETIRED]: TODAY }, done: {}, extras: { [TODAY]: [{ id: 'x1', kind: 'practice', topicId: RETIRED, topicName: RETIRED_NAME, subject: 'Mathematics', title: `Extra practice · ${RETIRED_NAME}` }] } } },
    daily: { [SID]: { [TODAY]: { offers: { numeracy: [RETIRED], literacy: ['l-sounds'] }, picks: {} } } },
    requests: { [SID]: [{ id: 'rq1', text: 'estimating', createdAt: NOW - 1000, topicId: RETIRED }] },
    levelset: { [SID]: { observe: [RETIRED], lanes: {} } },
  };
}

let served = familyDoc();
const puts = [];
const json = (body, status = 200) => ({ ok: status < 400, status, headers: new Headers({ ETag: '"v3"' }), json: async () => body });
globalThis.fetch = async (url, options = {}) => {
  const path = String(url);
  if (path.endsWith('/topics.json')) return json({ topics: taxonomy.topics });
  if (path.endsWith('/dependencies.json')) return json({ dependencies: taxonomy.dependencies });
  if (path.endsWith('/clusters.json')) return json({ clusters: [] });
  if (path.endsWith('/manifest.json')) return json(null);
  if (path === '/api/health') return json({ ok: true, mode: 'self-hosted', aiConfigured: false });
  if (path === '/api/state' && options.method === 'PUT') {
    const body = JSON.parse(options.body);
    puts.push(body);
    served = { ...body, version: (served.version || 0) + 1 };
    return json({ version: served.version }, 200);
  }
  if (path === '/api/state') return json(served);
  if (path.startsWith('/api/lessons?')) {
    const prefix = new URL(path, 'http://x').searchParams.get('prefix');
    return json({ entries: prefix === 'recall:' ? [{ key: `recall:${RETIRED}`, savedAt: NOW }] : [] });
  }
  return json({});
};

const { loadTaxonomy, isCurrentTopic } = await import('../src/js/data.js');
const store = await import('../src/js/store.js');
const mastery = await import('../src/js/mastery.js');
const ls = await import('../src/js/levelset.js');
const { planTrack, masteredBeforeTrack } = await import('../src/js/scheduler.js');
const { picksStillOpen } = await import('../src/js/alerts.js');
const { retiredTopics, heldLabel, retiredName } = await import('../src/js/retired.js');

await loadTaxonomy();
await store.connect();
await store.loadAll();

test('isCurrentTopic: false only for an id the loaded taxonomy lacks', () => {
  assert.equal(isCurrentTopic('n-count'), true);
  assert.equal(isCurrentTopic(RETIRED), false);
});

test('retired.js walks every kind of learner data and keeps the stored name', () => {
  const [found, ...rest] = retiredTopics(familyDoc(), SID, isCurrentTopic);
  assert.deepEqual(rest, []);
  assert.equal(found.id, RETIRED);
  assert.equal(found.name, RETIRED_NAME);
  assert.deepEqual(found.held, { mastered: 1, record: 1, test: 1, recall: 1, practice: 1, calendar: 2, daily: 1, request: 1, levelset: 1 });
  assert.equal(heldLabel(found.held), 'mastered · 1 record · 1 test result · 1 recall card · 1 practice question · 2 calendar entries · 1 daily offer · 1 topic request · 1 workbook answer');
});

test('retired.js: no stored name falls back to the id; malformed sections are skipped', () => {
  const doc = { progress: { [SID]: { [RETIRED]: { status: 'learning' } } }, records: { [SID]: 'oops' }, plan: { [SID]: { extras: { x: 'no' } } } };
  const [t] = retiredTopics(doc, SID, isCurrentTopic);
  assert.equal(retiredName(t), RETIRED);
  assert.equal(heldLabel(t.held), 'in progress');
  assert.deepEqual(retiredTopics({}, SID, isCurrentTopic), []);
});

test('store: loading keeps every retired entry, and a later save writes them back unchanged', async () => {
  assert.equal(store.statusOf(SID, RETIRED), 'mastered');
  assert.equal(store.recordsFor(SID)[0].topicId, RETIRED);
  assert.equal(store.extrasOn(SID, TODAY).length, 1);
  store.setStatus(SID, 'n-count', 'practicing');
  await store.flushSaves();
  const saved = puts.at(-1);
  const original = familyDoc();
  for (const key of ['records', 'tests', 'recall', 'practice', 'plan', 'requests', 'levelset']) {
    assert.deepEqual(saved[key][SID], original[key][SID], `${key} kept`);
  }
  assert.deepEqual(saved.progress[SID][RETIRED], original.progress[SID][RETIRED]);
});

test('store: an import holding retired entries is accepted and kept', async () => {
  const doc = familyDoc();
  assert.equal(store.inspectImport(doc).ok, true);
  assert.equal(await store.importDocument(doc), true);
  assert.equal(store.statusOf(SID, RETIRED), 'mastered');
  assert.deepEqual(puts.at(-1).levelset[SID].observe, [RETIRED]);
});

test('store: a retired topic\'s recall cards and practice questions keep their schedule but are never due', () => {
  assert.equal(store.recallState(SID, `${RETIRED}::0`).box, 1);
  assert.deepEqual(store.dueRecallCards(SID), []);
  assert.equal(store.recallDueCount(SID), 0);
  assert.equal(store.practiceDueCount(SID), 0);
  assert.equal(store.topicPracticeItems(SID, RETIRED).length, 1, 'still listed for its own topic');
});

test('mastery: counts, recent growth and reachability leave the retired topic out', () => {
  const stats = mastery.studentStats(SID);
  assert.equal(stats.total, 3);
  assert.equal(stats.totalMastered, 0);
  assert.deepEqual(mastery.recentActivity(SID).map((a) => a.topic.id), ['n-count']);
  assert.equal(mastery.recommendedNext(SID, 10).some((n) => n.topic.id === RETIRED), false);
});

test('mastery: a saved daily offer of a retired topic is not offered', () => {
  const choices = mastery.todaysChoices(SID, TODAY);
  assert.deepEqual(choices.numeracy.options, []);
  assert.deepEqual(choices.literacy.options.map((t) => t.id), ['l-sounds']);
  // The remembered offer itself is kept.
  assert.deepEqual(store.dailyFor(SID, TODAY).offers.numeracy, [RETIRED]);
});

test('alerts: open picks ignore a lane whose only offer is retired', () => {
  const student = { id: SID, name: 'Sample Learner', startDate: '2026-01-01' };
  const now = new Date('2026-10-07T16:00:00').getTime();
  const day = { offers: { numeracy: [RETIRED], literacy: ['l-sounds'] }, picks: { literacy: 'l-sounds' } };
  assert.equal(picksStillOpen({ now, student, day, calendar: null, isCurrent: isCurrentTopic }), null);
  assert.match(picksStillOpen({ now, student, day, calendar: null }).body, /numeracy/, 'without the check it would nag');
});

test('levelset: a sheet whose topic was retired can still be completed', () => {
  const session = { ...ls.newSession('numeracy', { age: 6, now: 0 }), sheets: [{ kind: 'section', domain: 'Counting & Cardinality', level: 5, dir: 'up', part: 1, ids: ['n-count', RETIRED] }] };
  const answered = ls.setAnswer(session, 'n-count', 'yes');
  assert.equal(ls.sheetComplete(answered), false, 'without the check the retired row blocks the sheet');
  assert.equal(ls.sheetComplete(answered, isCurrentTopic), true);
});

test('levelset: a sheet\'s band is read from its topics\' ages now, not the stored level', () => {
  const ctx = {
    topics: taxonomy.topics.filter((t) => t.subject === 'Mathematics'),
    domains: ['Counting & Cardinality'],
    topicAge: (t) => Math.min(13, Math.max(5, t.ageRangeStart || 5)),
    hardPrereqs: (id) => taxonomy.dependencies.filter((d) => d.topicId === id).map((d) => ({ id: d.prerequisiteId })),
    mastered: () => false,
  };
  // Built when Counting was an age-7 topic; the revision moved it to 5.
  const stale = { kind: 'section', domain: 'Counting & Cardinality', level: 7, dir: 'up', part: 1, ids: ['n-count'], savedAt: 1 };
  assert.equal(ls.sheetLevel(ctx, stale), 5);
  const session = { ...ls.newSession('numeracy', { age: 6, now: 0 }), sheets: [stale], answers: { 'n-count': 'yes' } };
  // A Yes at 5 walks up to the age-6 band.
  assert.deepEqual(ls.nextSheet(ctx, session)?.ids, ['n-add']);
  // A sheet whose every topic was retired ends that domain's walk instead of looping.
  const gone = { ...stale, ids: [RETIRED], level: 9 };
  const ended = { ...session, sheets: [gone], answers: { [RETIRED]: 'yes' } };
  assert.equal(ls.nextSheet(ctx, ended), null);
});

test('calendar: a moved or mastered retired topic is never placed on the track', () => {
  const plan = planTrack(taxonomy.topics, {
    startKey: TODAY, age: 6, moves: { [RETIRED]: TODAY },
    mastered: (id) => store.statusOf(SID, id) === 'mastered',
  });
  assert.equal(plan.topicDate.has(RETIRED), false);
  assert.ok([...plan.byDate.values()].flat().every((t) => isCurrentTopic(t.id)));
  // masteredBeforeTrack reports what the data says; the track ignores ids it does not have.
  assert.ok(masteredBeforeTrack(store.progressFor(SID), TODAY + '-later').includes(RETIRED));
});

test('levelset: a Yes given before the topic was retired is kept but never marked mastered', () => {
  const ctx = {
    topics: taxonomy.topics.filter((t) => t.subject === 'Mathematics'),
    domains: ['Counting & Cardinality'],
    topicAge: (t) => Math.min(13, Math.max(5, t.ageRangeStart || 5)),
    hardPrereqs: (id) => taxonomy.dependencies.filter((d) => d.topicId === id).map((d) => ({ id: d.prerequisiteId })),
    mastered: () => false,
    isCurrent: isCurrentTopic,
  };
  const session = { ...ls.newSession('numeracy', { age: 6, now: 0 }), answers: { 'n-count': 'yes', [RETIRED]: 'yes' } };
  const p = ls.proposal(ctx, session);
  assert.deepEqual(p.master, ['n-count']);
  assert.equal(p.own, 1);
  // Without the check (as before the fix) the retired Yes would be written as mastery.
  assert.deepEqual(ls.proposal({ ...ctx, isCurrent: undefined }, session).master.sort(), ['n-count', RETIRED].sort());
  assert.equal(session.answers[RETIRED], 'yes', 'the answer itself stays in the session');
});

test('calendar: "Clear moves" on a new start date keeps a retired topic\'s move', () => {
  store.moveTopic(SID, 'n-add', TODAY);
  assert.equal(store.planOverrides(SID).moves['n-add'], TODAY);
  const before = store.planOverrides(SID).moves;
  assert.equal(before[RETIRED], TODAY);
  store.setStartDate(SID, TODAY, { clearMoves: true });
  assert.deepEqual(store.planOverrides(SID).moves, { [RETIRED]: TODAY });
});
