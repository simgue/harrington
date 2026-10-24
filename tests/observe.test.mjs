import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const repoRoot = new URL('..', import.meta.url);
const source = (path) => readFile(new URL(path, repoRoot), 'utf8');

// store.persist() saves through fetch after a debounce; keep it off the network.
globalThis.fetch = async () => ({ ok: true, status: 200, headers: new Headers({ ETag: '"v1"' }), json: async () => ({}) });

const store = await import('../src/js/store.js');
const { observedResult, observedRollup, observedTitle, modeLabel } = await import('../src/js/observe.js');
const { canYouPrompt, canTheyPrompt, checkableEvidence, assessmentQuestion } = await import('../src/js/phrasing.js');

const topic = { id: 'count-10', name: 'Counting to 10', subject: 'Mathematics', domain: 'Counting & Cardinality' };

test('an observed result has the test shape, and only a full tick passes', () => {
  assert.deepEqual(observedResult(topic, [true, true, true]), {
    scope: 'topic', mode: 'observed', subject: 'Mathematics', topicId: 'count-10', sectionId: null,
    score: 3, total: 3, pct: 100, passed: true,
  });
  const partial = observedResult(topic, [true, false, true]);
  assert.equal(partial.score, 2);
  assert.equal(partial.total, 3);
  assert.equal(partial.pct, 67);
  assert.equal(partial.passed, false);
  assert.equal(observedResult(topic, []).passed, false, 'an empty checklist never passes');
  assert.equal(observedTitle(topic, partial), 'Observed: Counting to 10 (2 of 3)');
  assert.equal(modeLabel(partial), 'observed');
  assert.equal(modeLabel({ mode: 'digital' }), '');
});

const sec = (id, ids) => ({ id, subject: 'Mathematics', topics: ids.map(i => ({ id: i })) });

test('a section is observed-mastered once every topic in it has a passed topic result', () => {
  const s1 = sec('M|Counting|5', ['a', 'b']);
  const s2 = sec('M|Adding|6', ['c']);
  const sections = [s1, s2];

  const notYet = observedRollup({ section: s1, sections, topicPassed: (id) => id === 'a' });
  assert.deepEqual(notYet, { section: null, subject: null }, 'b is still open');

  const done = observedRollup({ section: s1, sections, topicPassed: (id) => id === 'a' || id === 'b' });
  assert.deepEqual(done.section, {
    scope: 'section', mode: 'observed', subject: 'Mathematics', sectionId: 'M|Counting|5', topicId: null,
    score: 2, total: 2, pct: 100, passed: true,
  });
  assert.equal(done.subject, null, 'the other section is not passed yet');

  const already = observedRollup({ section: s1, sections, topicPassed: () => true, sectionPassed: (id) => id === s1.id });
  assert.equal(already.section, null, 'a passed section is not passed again');
});

test('passing the last open section by observation passes the subject capstone', () => {
  const s1 = sec('M|Counting|5', ['a']);
  const s2 = sec('M|Adding|6', ['c']);
  const r = observedRollup({ section: s2, sections: [s1, s2], topicPassed: () => true, sectionPassed: (id) => id === s1.id });
  assert.equal(r.section.sectionId, s2.id);
  assert.deepEqual(r.subject, {
    scope: 'subject', mode: 'observed', subject: 'Mathematics', sectionId: null, topicId: null,
    score: 2, total: 2, pct: 100, passed: true,
  });
  const passedBefore = observedRollup({ section: s2, sections: [s1, s2], topicPassed: () => true, sectionPassed: (id) => id === s1.id, subjectPassed: true });
  assert.equal(passedBefore.subject, null);
});

test('applyObservation saves results, record and mastery in one emit, and leaves the queue', async () => {
  const sid = 's-observe';
  store.queueObservation(sid, ['count-10', 'other'], { quiet: true });
  let emits = 0;
  const off = store.subscribe(() => { emits += 1; });
  const result = observedResult(topic, [true, true]);
  const sectionResult = { scope: 'section', mode: 'observed', subject: 'Mathematics', sectionId: 'M|C|5', score: 1, total: 1, pct: 100, passed: true };
  const { tests, record } = store.applyObservation(sid, {
    results: [result, sectionResult],
    masterTopicId: 'count-10',
    record: { topicId: 'count-10', title: 'Observed', note: 'n', observed: { score: 2, total: 2, passed: true, items: [] } },
  });
  off();
  assert.equal(emits, 1);
  assert.equal(store.statusOf(sid, 'count-10'), 'mastered');
  assert.equal(store.progressFor(sid)['count-10'].source, undefined, 'mastered like a digital test, not like a placement');
  assert.equal(store.lastTopicTest(sid, 'count-10').mode, 'observed');
  assert.equal(store.sectionPassed(sid, 'M|C|5'), true);
  assert.equal(tests.length, 2);
  assert.equal(record.type, 'assessment');
  assert.equal(record.observed.testId, tests[0].id);
  assert.deepEqual(store.levelsetFor(sid).observe, ['other']);

  // A partial check is kept but changes no status.
  store.applyObservation(sid, { results: [observedResult({ ...topic, id: 'x' }, [true, false])], record: null });
  assert.equal(store.statusOf(sid, 'x'), 'none');
  assert.equal(store.lastTopicTest(sid, 'x').passed, false);
});

test('placed or hand-set siblings do not count toward an observed section pass', () => {
  const sid = 's-placed-siblings';
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
  store.applyPlacement(sid, { topicIds: ids, title: 'Placement', subject: 'Mathematics', maxAge: 5 });
  const section = sec('M|Counting|5', [...ids, 'obs']);
  const topicPassed = (id) => id === 'obs' || store.topicTestPassed(sid, id);
  assert.ok(ids.every(id => store.statusOf(sid, id) === 'mastered'), 'the eight are mastered by placement');
  assert.deepEqual(observedRollup({ section, sections: [section], topicPassed }), { section: null, subject: null });
  // Once each sibling has its own passed result (quiz or observation), it counts.
  for (const id of ids) store.addTestResult(sid, { scope: 'topic', subject: 'Mathematics', topicId: id, mode: 'observed', score: 1, total: 1, pct: 100, passed: true });
  assert.equal(observedRollup({ section, sections: [section], topicPassed }).section.score, 9);
});

test('an observed pass keeps today\'s picks, as a quiz pass does', () => {
  const sid = 's-observe-daily';
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  store.saveDailyOffers(sid, key, { literacy: ['l1', 'l2'], numeracy: ['count-10', 'n2'] });
  store.pickDaily(sid, key, 'numeracy', 'count-10');
  store.applyObservation(sid, { results: [observedResult(topic, [true])], masterTopicId: 'count-10', record: null });
  assert.equal(store.statusOf(sid, 'count-10'), 'mastered');
  assert.deepEqual(store.dailyFor(sid, key).offers.numeracy, ['count-10', 'n2']);
  assert.equal(store.dailyFor(sid, key).picks.numeracy, 'count-10');
});

test('a malformed stored workbook session reads as none', () => {
  const sid = 's-bad-session';
  store.saveLevelsetSession(sid, 'numeracy', { version: 2, sheets: [{ kind: 'section', ids: 'nope' }], answers: {} }, { quiet: true });
  assert.equal(store.levelsetSession(sid, 'numeracy'), null);
  store.saveLevelsetSession(sid, 'numeracy', { version: 2, lane: 'numeracy', sheets: [], answers: {} }, { quiet: true });
  assert.deepEqual(store.levelsetSession(sid, 'numeracy').sheets, []);
});

test('confirming the workbook writes one placement record with source placement', () => {
  const sid = 's-confirm';
  const rec = store.applyPlacement(sid, { topicIds: ['a', 'b'], title: 'Level-set workbook: marked 1 numeracy topic mastered', subject: 'Mathematics', maxAge: 6, levelset: { lane: 'numeracy' } });
  assert.deepEqual(rec.placement.levelset, { lane: 'numeracy' });
  assert.equal(store.recordsFor(sid).filter(r => r.placement).length, 1);
  for (const id of ['a', 'b']) assert.equal(store.progressFor(sid)[id].source, 'placement');
});

test('child-safe phrasing: the parent sheet asks "Can they…?", the child card "Can you…?"', () => {
  assert.equal(canTheyPrompt('Counts to 10 reliably'), 'Can they count to 10 reliably?');
  assert.equal(canTheyPrompt('Given 7, respond 3 to make 10'), 'Given 7, can they respond 3 to make 10?');
  assert.equal(canTheyPrompt('Heft two objects and say which is heavier'), 'Can they show: Heft two objects and say which is heavier?');
  assert.equal(canTheyPrompt('Wineburg sourcing heuristic'), '', 'citations are not questions');
  assert.equal(canYouPrompt('Counts to 10 reliably'), 'Can you count to 10 reliably?');
});

test('checkable evidence drops citations and falls back to the suggested question', () => {
  const t = { evidence: ['Simple View of Reading (Gough & Tunmer)', 'Explains what a story was about'], assessmentPrompt: 'Ask {{name}} to retell it.' };
  assert.deepEqual(checkableEvidence(t, 'Robin'), ['Explains what a story was about']);
  assert.deepEqual(checkableEvidence({ evidence: ['reading research'], assessmentPrompt: 'Ask {{name}} to retell it.' }, 'Robin'), ['Ask Robin to retell it.']);
  assert.deepEqual(checkableEvidence({}), []);
  assert.equal(assessmentQuestion({ assessmentPrompt: 'Can {{name}} count?' }), 'Can your child count?');
});

test('the child view never shows observation scores', async () => {
  const card = await source('src/js/views/childtopic.js');
  assert.match(card, /import \{ canYouPrompt \} from '\.\.\/phrasing\.js'/);
  assert.doesNotMatch(card, /observ|pct|testsFor|lastTopicTest|\.score\b/i);
  const kidmode = await source('src/js/views/kidmode.js');
  assert.doesNotMatch(kidmode, /observation\.js|observe\.js|levelset/);
});
