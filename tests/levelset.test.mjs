import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  laneTopics, laneLevels, startLevel, newSession, nextSheet, advance, setAnswer, sheetComplete,
  completeSheet, reopenSheet, frontier, proposal, yesClosure, normalizeSession, sheetRows, sheetTitle,
  levelsetTitle, sittingNotice, SITTING_MINUTES, SHEET_MAX,
} from '../src/js/levelset.js';

// Fixture graph: two lanes, three levels (ages 5, 6, 7). Numeracy has two
// domains, so each is walked on its own.
const topic = (id, subject, domain, age, evidence = []) => ({ id, name: id, subject, domain, ageRangeStart: age, evidence });
const TOPICS = [
  topic('n5a', 'Mathematics', 'Counting', 5, ['Counts to 10 reliably']),
  topic('n5b', 'Mathematics', 'Adding', 5),
  topic('n6a', 'Mathematics', 'Counting', 6),
  topic('n6b', 'Mathematics', 'Adding', 6),
  topic('n7a', 'Mathematics', 'Counting', 7),
  topic('n7b', 'Mathematics', 'Adding', 7),
  topic('x', 'Science', 'Measuring', 5),             // a foundation in another subject
  topic('l5', 'English', 'Reading', 5),
  topic('l6', 'English', 'Reading', 6),
  topic('l7', 'English', 'Reading', 7),
];
const EDGES = {
  n6a: ['n5a', 'x'], n6b: ['n5b'], n7a: ['n6a'], n7b: ['n6b', 'n6a'],
  l6: ['l5'], l7: ['l6'],
};
const LANES = {
  numeracy: { label: 'Numeracy', subject: 'Mathematics', domains: ['Counting', 'Adding'] },
  literacy: { label: 'Literacy', subject: 'English', domains: ['Reading'] },
};
const topicAge = (t) => Math.min(13, Math.max(5, t.ageRangeStart));
const prereqsFrom = (edges) => (id) => (edges[id] || []).map(p => ({ id: p, strength: 'hard' }));

// A tiny stand-in for the store: progress plus placement records with undo.
function family() {
  const progress = {};
  const records = [];
  return {
    progress, records,
    mastered: (id) => progress[id] === 'mastered',
    apply(ids) {
      if (!ids.length) return null;
      const rec = { id: `rec${records.length + 1}`, ids, previous: Object.fromEntries(ids.map(id => [id, progress[id] || null])) };
      for (const id of ids) progress[id] = 'mastered';
      records.push(rec);
      return rec.id;
    },
    undo(recordId) {
      const rec = records.find(r => r.id === recordId);
      for (const id of rec.ids) { if (rec.previous[id]) progress[id] = rec.previous[id]; else delete progress[id]; }
    },
  };
}

function ctxFor(lane, fam, { topics = TOPICS, edges = EDGES } = {}) {
  return { topics: laneTopics(topics, LANES[lane]), domains: LANES[lane].domains, topicAge, hardPrereqs: prereqsFrom(edges), mastered: fam.mastered };
}

// Answer the current sheet and save it, as the view does. Nothing is written.
function sitSheet(ctx, session, marks) {
  let s = session;
  for (const [id, a] of Object.entries(marks)) s = setAnswer(s, id, a);
  assert.ok(sheetComplete(s), `every topic on the sheet is answered: ${current(s).ids}`);
  return completeSheet(ctx, s, { now: 1 });
}

const current = (s) => s.sheets[s.sheets.length - 1];
const start = (ctx, age) => advance(ctx, newSession('x', { age, now: 0 }));

test('lane topics, levels and the starting band (age minus one)', () => {
  const ctx = ctxFor('numeracy', family());
  assert.deepEqual(ctx.topics.map(t => t.id), ['n5a', 'n5b', 'n6a', 'n6b', 'n7a', 'n7b']);
  assert.deepEqual(laneLevels(ctx.topics, topicAge), [5, 6, 7]);
  assert.equal(startLevel(7, [5, 6, 7]), 6);
  assert.equal(startLevel(5, [5, 6, 7]), 5, 'never below the lowest band');
  assert.equal(startLevel(12, [5, 6, 7]), 7, 'the nearest band at or below');
  assert.equal(startLevel(null, [5, 6, 7]), 5);
});

test('each domain is walked on its own: a Not yet in one never stops another climbing', () => {
  const fam = family();
  const ctx = ctxFor('numeracy', fam);
  let s = start(ctx, 7);
  assert.deepEqual(current(s), { kind: 'section', domain: 'Counting', level: 6, dir: 'up', part: 1, ids: ['n6a'] });
  s = sitSheet(ctx, s, { n6a: 'yes' });
  assert.deepEqual(current(s), { kind: 'section', domain: 'Counting', level: 7, dir: 'up', part: 1, ids: ['n7a'] });
  s = sitSheet(ctx, s, { n7a: 'yes' });
  // Counting is known to the top; Adding starts at its own age-6 section.
  assert.deepEqual(current(s), { kind: 'section', domain: 'Adding', level: 6, dir: 'up', part: 1, ids: ['n6b'] });
  s = sitSheet(ctx, s, { n6b: 'no' });
  assert.deepEqual(current(s), { kind: 'section', domain: 'Adding', level: 5, dir: 'down', part: 1, ids: ['n5b'] });
  s = sitSheet(ctx, s, { n5b: 'yes' });
  assert.equal(s.done, true);
  assert.equal(s.frontier.status, 'ready');
  assert.deepEqual(s.frontier.ids, ['n6b']);

  // The same answers with the Not yet first: Counting still climbs.
  const fam2 = family();
  const ctx2 = ctxFor('numeracy', fam2);
  const order = { ...ctx2, domains: ['Adding', 'Counting'] };
  let t = start(order, 7);
  t = sitSheet(order, t, { n6b: 'no' });
  t = sitSheet(order, t, { n5b: 'yes' });
  assert.deepEqual(current(t), { kind: 'section', domain: 'Counting', level: 6, dir: 'up', part: 1, ids: ['n6a'] });
  t = sitSheet(order, t, { n6a: 'yes' });
  assert.deepEqual(current(t).ids, ['n7a'], 'Counting climbs past the Adding Not yet');
});

test('a section bigger than a sheet is split; the domain decides on the whole section', () => {
  const many = Array.from({ length: SHEET_MAX + 3 }, (_, i) => topic(`c${i}`, 'Mathematics', 'Counting', 6));
  const topics = [...many, topic('top', 'Mathematics', 'Counting', 7)];
  const ctx = ctxFor('numeracy', family(), { topics, edges: {} });
  let s = start(ctx, 7);
  assert.equal(current(s).ids.length, SHEET_MAX);
  s = sitSheet(ctx, s, Object.fromEntries(current(s).ids.map(id => [id, 'yes'])));
  assert.deepEqual(current(s), { kind: 'section', domain: 'Counting', level: 6, dir: 'up', part: 2, ids: ['c12', 'c13', 'c14'] });
  assert.equal(sheetTitle(current(s), 'Numeracy'), 'Numeracy · Counting (continued)');
  s = sitSheet(ctx, s, { c12: 'yes', c13: 'unsure', c14: 'yes' });
  assert.deepEqual(current(s).ids, ['top'], 'all Yes and Unsure across both parts climbs');
});

test('saving sheets writes nothing; the proposal lists the whole closure, across subjects', () => {
  const fam = family();
  const ctx = ctxFor('numeracy', fam);
  let s = start(ctx, 7);
  s = sitSheet(ctx, s, { n6a: 'yes' });
  s = sitSheet(ctx, s, { n7a: 'no' });
  assert.deepEqual(fam.progress, {}, 'no sheet save marks anything');
  const p = proposal(ctx, s);
  assert.deepEqual(p.master, ['n6a', 'n5a', 'x'], 'includes the Science foundation');
  assert.equal(p.own, 1);
  assert.equal(levelsetTitle({ count: p.master.length, own: p.own, laneLabel: 'Numeracy' }),
    'Level-set workbook: marked 1 numeracy topic mastered, plus 2 foundations they build on');
  // Confirming is one placement record.
  fam.apply(p.master);
  assert.equal(fam.records.length, 1);
});

test('frontier: a Not yet above an Unsure waits on the Unsure, and never claims no gap', () => {
  const ctx = ctxFor('numeracy', family());
  let s = start(ctx, 7);
  s = sitSheet(ctx, s, { n6a: 'yes' });
  s = sitSheet(ctx, s, { n7a: 'yes' });
  s = sitSheet(ctx, s, { n6b: 'no' });
  s = sitSheet(ctx, s, { n5b: 'unsure' });
  assert.equal(s.done, true);
  assert.deepEqual(s.frontier, { status: 'blocked', ids: ['n6b'], waitingOn: ['n5b'], unsure: ['n5b'] });
});

test('frontier: an all-Unsure sheet says the Unsure topics decide', () => {
  const ctx = ctxFor('literacy', family());
  let s = start(ctx, 7);
  s = sitSheet(ctx, s, { l6: 'unsure' });
  assert.equal(s.done, true, 'all Unsure neither climbs nor descends');
  assert.deepEqual(s.frontier, { status: 'unsure', ids: [], waitingOn: [], unsure: ['l6'] });
});

test('frontier: Not yet topics that need each other (a cycle) still give a place to start', () => {
  const topics = [topic('a', 'English', 'Reading', 6), topic('b', 'English', 'Reading', 6), topic('c', 'English', 'Reading', 7)];
  const ctx = ctxFor('literacy', family(), { topics, edges: { a: ['b'], b: ['a'], c: ['c'] } });
  let s = start(ctx, 7);
  s = sitSheet(ctx, s, { a: 'no', b: 'no' });
  assert.equal(s.done, true, 'the walk terminates');
  assert.deepEqual(s.frontier, { status: 'blocked', ids: ['a', 'b'], waitingOn: [], unsure: [] });
});

test('frontier: a stale start (everything there already mastered) lists what comes next, or says the lane is complete', () => {
  const fam = family();
  for (const id of ['n6a', 'n6b', 'n7a', 'n7b']) fam.progress[id] = 'mastered';
  const ctx = ctxFor('numeracy', fam);
  const s = start(ctx, 7);
  assert.equal(s.done, true, 'nothing to ask from age 6 up');
  assert.deepEqual(s.frontier, { status: 'known', ids: ['n5a', 'n5b'], waitingOn: [], unsure: [] });

  for (const id of ['n5a', 'n5b']) fam.progress[id] = 'mastered';
  assert.equal(start(ctx, 7).frontier.status, 'complete');
});

test('frontier: a lane answered Yes throughout is complete', () => {
  const ctx = ctxFor('literacy', family());
  let s = start(ctx, 6);
  s = sitSheet(ctx, s, { l5: 'yes' });
  s = sitSheet(ctx, s, { l6: 'yes' });
  s = sitSheet(ctx, s, { l7: 'yes' });
  assert.equal(s.frontier.status, 'complete', 'the whole lane was answered Yes');
});

test('a Yes closure stops at a topic the parent answered Not yet or Unsure', () => {
  const ctx = ctxFor('numeracy', family());
  assert.deepEqual(yesClosure(ctx, { n7b: 'yes', n6a: 'no' }, ['n7b']), ['n7b', 'n6b', 'n5b']);
  assert.deepEqual(yesClosure(ctx, { n7b: 'yes', n6b: 'unsure' }, ['n7b']), ['n7b', 'n6a', 'n5a', 'x']);
});

test('Not yet descends through foundations, a sheet at a time', () => {
  const ctx = ctxFor('numeracy', family());
  let s = start(ctx, 8); // starts at 7 in both domains
  s = sitSheet(ctx, s, { n7a: 'no' });
  assert.deepEqual(current(s), { kind: 'section', domain: 'Counting', level: 6, dir: 'down', part: 1, ids: ['n6a'] });
  s = sitSheet(ctx, s, { n6a: 'no' });
  s = sitSheet(ctx, s, { n5a: 'yes' });
  s = sitSheet(ctx, s, { n7b: 'yes' });
  // n6a still has an unknown lane-free foundation? x is outside the lane, so no.
  assert.equal(s.done, true);
  assert.deepEqual(s.frontier.ids, ['n6a']);
});

test('topics already mastered are never asked', () => {
  const fam = family();
  fam.progress.n6a = 'mastered';
  const ctx = ctxFor('numeracy', fam);
  assert.deepEqual(current(start(ctx, 7)).ids, ['n7a'], 'Counting age 6 is known, so it starts one band up');
});

test('resume: a saved session picks up mid-sheet with its answers', () => {
  const ctx = ctxFor('numeracy', family());
  let s = start(ctx, 7);
  s = sitSheet(ctx, s, { n6a: 'yes' });
  s = setAnswer(s, 'n7a', 'no');
  const resumed = advance(ctx, normalizeSession(JSON.parse(JSON.stringify(s))));
  assert.equal(resumed.sheets.length, 2, 'an open sheet is not replaced');
  assert.equal(resumed.answers.n7a, 'no');
  assert.equal(sheetComplete(resumed), true);
  assert.equal(nextSheet(ctx, { ...resumed, sheets: resumed.sheets.map((x, i) => (i === 1 ? { ...x, savedAt: null } : x)) }), null);
  // An answer for a topic not on the open sheet is ignored.
  assert.equal(setAnswer(resumed, 'n6a', 'no').answers.n6a, 'yes');
});

test('reopen: later sheets go, nothing to undo before the proposal, the placement after it', () => {
  const fam = family();
  const ctx = ctxFor('numeracy', fam);
  let s = start(ctx, 7);
  s = sitSheet(ctx, s, { n6a: 'yes' });
  s = sitSheet(ctx, s, { n7a: 'no' });
  s = sitSheet(ctx, s, { n6b: 'yes' });
  s = sitSheet(ctx, s, { n7b: 'yes' });
  assert.equal(s.done, true);

  let r = reopenSheet(s, 1);
  assert.deepEqual(r.recordIds, [], 'sheets wrote nothing');
  assert.equal(r.session.sheets.length, 2);
  assert.deepEqual(r.session.answers, { n6a: 'yes', n7a: 'no' });
  assert.equal(r.session.sheets[1].savedAt, null);

  const recordId = fam.apply(proposal(ctx, s).master);
  r = reopenSheet({ ...s, placed: { recordId } }, 0);
  assert.deepEqual(r.recordIds, ['rec1']);
  fam.undo('rec1');
  assert.deepEqual(fam.progress, {}, 'placement semantics: every mark reverted');
  assert.equal(r.session.placed, null);
  // Change the answer: the walk follows it.
  const t = sitSheet(ctx, r.session, { n6a: 'no' });
  assert.deepEqual(current(t), { kind: 'section', domain: 'Counting', level: 5, dir: 'down', part: 1, ids: ['n5a'] });
});

test('a malformed or older stored session is dropped, not crashed on', () => {
  assert.equal(normalizeSession(null), null);
  assert.equal(normalizeSession('x'), null);
  assert.equal(normalizeSession({ version: 2, sheets: 'no', answers: {} }), null);
  assert.equal(normalizeSession({ version: 2, sheets: [{ kind: 'section', ids: [3] }], answers: {} }), null);
  assert.equal(normalizeSession({ sheets: [], answers: {} }), null, 'the first layout (no version) starts over');
  const ok = normalizeSession({ version: 2, lane: 'numeracy', sheets: [{ kind: 'section', domain: 'Counting', level: 6, ids: ['n6a'] }], answers: { n6a: 'yes', bad: 'maybe' } });
  assert.deepEqual(ok.answers, { n6a: 'yes' });
  assert.equal(ok.elapsedMs, 0);
});

test('sheet rows ask "Can they…?"; titles carry no age; sitting time', () => {
  const byId = new Map(TOPICS.map(t => [t.id, t]));
  byId.set('n5b', { ...byId.get('n5b'), assessmentPrompt: 'Can {{name}} add 2 and 3?' });
  assert.deepEqual(sheetRows(byId, ['n5a', 'n5b'], { name: 'Robin' }), [
    { id: 'n5a', name: 'n5a', domain: 'Counting', prompts: ['Can they count to 10 reliably?'] },
    { id: 'n5b', name: 'n5b', domain: 'Adding', prompts: ['Can Robin add 2 and 3?'] },
  ]);
  assert.equal(sheetTitle({ kind: 'section', domain: 'Counting', level: 6, part: 1 }, 'Numeracy'), 'Numeracy · Counting');
  assert.equal(sheetTitle({ kind: 'foundations', part: 1 }, 'Literacy'), 'Literacy · foundations');
  assert.doesNotMatch(sheetTitle({ kind: 'section', domain: 'Counting', level: 6, part: 1 }, 'Numeracy'), /age|\d/i);
  assert.equal(SITTING_MINUTES, 20);
  assert.deepEqual(sittingNotice(19.9 * 60000), { minutes: 19, pause: false });
  assert.deepEqual(sittingNotice(20 * 60000), { minutes: 20, pause: true });
});
