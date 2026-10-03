import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  laneTopics, laneLevels, startLevel, newSession, nextSheet, advance, setAnswer, sheetComplete,
  sheetEffects, completeSheet, reopenSheet, frontier, yesClosure, sheetRows, sheetTitle, levelsetTitle,
  sittingNotice, SITTING_MINUTES,
} from '../src/js/levelset.js';

// Fixture graph: two lanes, three levels (ages 5, 6, 7).
const topic = (id, subject, domain, age, evidence = []) => ({ id, name: id, subject, domain, ageRangeStart: age, evidence });
const TOPICS = [
  topic('n5a', 'Mathematics', 'Counting', 5, ['Counts to 10 reliably']),
  topic('n5b', 'Mathematics', 'Adding', 5),
  topic('n6a', 'Mathematics', 'Counting', 6),
  topic('n6b', 'Mathematics', 'Adding', 6),
  topic('n7a', 'Mathematics', 'Counting', 7),
  topic('n7b', 'Mathematics', 'Adding', 7),
  topic('x', 'Mathematics', 'Geometry', 5),           // outside the lane's domains
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
const hardPrereqs = (id) => (EDGES[id] || []).map(p => ({ id: p, strength: 'hard' }));

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

function ctxFor(lane, fam) {
  const topics = laneTopics(TOPICS, LANES[lane]);
  return { topics, levels: laneLevels(topics, topicAge), topicAge, hardPrereqs, mastered: fam.mastered };
}

// Answer the current sheet, save it as the view does, and move on.
function sitSheet(lane, fam, session, marks) {
  let s = session;
  for (const [id, a] of Object.entries(marks)) s = setAnswer(s, id, a);
  assert.ok(sheetComplete(s), 'every topic on the sheet is answered');
  const effects = sheetEffects(ctxFor(lane, fam), s);
  const recordId = fam.apply(effects.master);
  return { session: completeSheet(ctxFor(lane, fam), s, { recordId, now: 1 }), effects };
}

const current = (s) => s.sheets[s.sheets.length - 1];

test('lane topics, levels and the starting level (age minus one)', () => {
  const ctx = ctxFor('numeracy', family());
  assert.deepEqual(ctx.topics.map(t => t.id), ['n5a', 'n5b', 'n6a', 'n6b', 'n7a', 'n7b']);
  assert.deepEqual(ctx.levels, [5, 6, 7]);
  assert.equal(startLevel(7, ctx.levels), 6);
  assert.equal(startLevel(5, ctx.levels), 5, 'never below the lowest band');
  assert.equal(startLevel(12, ctx.levels), 7, 'the nearest band at or below');
  assert.equal(startLevel(null, ctx.levels), 5);
});

test('mixed answers: Yes marks the closure, Not yet descends by the graph, the frontier is found', () => {
  const fam = family();
  const ctx = ctxFor('numeracy', fam);
  let s = advance(ctx, newSession('numeracy', { age: 7, levels: ctx.levels, now: 0 }));
  assert.deepEqual(current(s), { kind: 'level', level: 6, dir: 'up', ids: ['n6a', 'n6b'] });

  let r = sitSheet('numeracy', fam, s, { n6a: 'yes', n6b: 'no' });
  s = r.session;
  // Yes propagates down the hard-prerequisite closure, across domains.
  assert.deepEqual(r.effects.master, ['n6a', 'n5a', 'x']);
  assert.equal(r.effects.own, 1);
  // Not yet: its unknown lane prerequisite is asked next.
  assert.deepEqual(current(s), { kind: 'foundations', level: 5, dir: 'down', ids: ['n5b'] });

  r = sitSheet('numeracy', fam, s, { n5b: 'yes' });
  s = r.session;
  assert.equal(s.done, true);
  assert.deepEqual(s.frontier, { level: 6, ids: ['n6b'], unsure: [] });
  assert.equal(fam.progress.n6b, undefined, 'Not yet is never marked');
  assert.equal(fam.progress.n7a, undefined, 'nothing above the Not yet level is assumed');
  assert.deepEqual(fam.records.map(x => x.id), ['rec1', 'rec2']);
});

test('all Yes walks up a level; Unsure queues without stopping the climb', () => {
  const fam = family();
  const ctx = ctxFor('numeracy', fam);
  let s = advance(ctx, newSession('numeracy', { age: 7, levels: ctx.levels }));
  let r = sitSheet('numeracy', fam, s, { n6a: 'yes', n6b: 'yes' });
  s = r.session;
  assert.deepEqual(current(s), { kind: 'level', level: 7, dir: 'up', ids: ['n7a', 'n7b'] });
  r = sitSheet('numeracy', fam, s, { n7a: 'yes', n7b: 'unsure' });
  assert.deepEqual(r.effects.unsure, ['n7b']);
  assert.deepEqual(r.effects.master, ['n7a']);
  s = r.session;
  assert.equal(s.done, true, 'no level above 7');
  assert.deepEqual(s.frontier, { level: null, ids: [], unsure: ['n7b'] });
});

test('all Not yet walks down a level until something is known', () => {
  const fam = family();
  const ctx = ctxFor('literacy', fam);
  let s = advance(ctx, newSession('literacy', { age: 7, levels: ctx.levels }));
  assert.deepEqual(current(s).ids, ['l6']);
  s = sitSheet('literacy', fam, s, { l6: 'no' }).session;
  assert.deepEqual(current(s), { kind: 'level', level: 5, dir: 'down', ids: ['l5'] });
  s = sitSheet('literacy', fam, s, { l5: 'no' }).session;
  assert.equal(s.done, true);
  assert.deepEqual(s.frontier, { level: 5, ids: ['l5'], unsure: [] }, 'l6 waits on l5');
  assert.deepEqual(fam.records, [], 'nothing was marked');
});

test('a Yes closure stops at a topic the parent answered Not yet or Unsure', () => {
  const ctx = ctxFor('numeracy', family());
  assert.deepEqual(yesClosure(ctx, { n7b: 'yes', n6a: 'no' }, ['n7b']), ['n7b', 'n6b', 'n5b']);
  assert.deepEqual(yesClosure(ctx, { n7b: 'yes', n6b: 'unsure' }, ['n7b']), ['n7b', 'n6a', 'n5a', 'x']);
});

test('topics already mastered are never asked, and their closure is skipped', () => {
  const fam = family();
  fam.progress.n6a = 'mastered';
  const ctx = ctxFor('numeracy', fam);
  const s = advance(ctx, newSession('numeracy', { age: 7, levels: ctx.levels }));
  assert.deepEqual(current(s).ids, ['n6b']);
});

test('resume: a saved session picks up mid-sheet with its answers', () => {
  const fam = family();
  const ctx = ctxFor('numeracy', fam);
  let s = advance(ctx, newSession('numeracy', { age: 7, levels: ctx.levels }));
  s = setAnswer(s, 'n6a', 'yes');
  // Saved, the page closed, opened again another day.
  let resumed = JSON.parse(JSON.stringify(s));
  resumed = advance(ctxFor('numeracy', fam), resumed);
  assert.equal(resumed.sheets.length, 1, 'an open sheet is not replaced');
  assert.equal(resumed.answers.n6a, 'yes');
  assert.equal(sheetComplete(resumed), false);
  assert.equal(nextSheet(ctx, resumed), null, 'the next sheet waits for this one');
  const r = sitSheet('numeracy', fam, resumed, { n6b: 'no' });
  assert.deepEqual(current(r.session).ids, ['n5b']);
  // An answer for a topic not on the open sheet is ignored.
  assert.equal(setAnswer(r.session, 'n6a', 'no').answers.n6a, 'yes');
});

test('undo: reopening a sheet returns its records and later ones, newest first', () => {
  const fam = family();
  const ctx = ctxFor('numeracy', fam);
  let s = advance(ctx, newSession('numeracy', { age: 7, levels: ctx.levels }));
  s = sitSheet('numeracy', fam, s, { n6a: 'yes', n6b: 'no' }).session;
  s = sitSheet('numeracy', fam, s, { n5b: 'yes' }).session;
  assert.equal(s.done, true);

  const { session, recordIds } = reopenSheet(s, 0);
  assert.deepEqual(recordIds, ['rec2', 'rec1']);
  recordIds.forEach(id => fam.undo(id));
  assert.deepEqual(fam.progress, {}, 'placement semantics: every mark reverted');
  assert.equal(session.sheets.length, 1);
  assert.equal(session.sheets[0].savedAt, null);
  assert.deepEqual(session.answers, { n6a: 'yes', n6b: 'no' }, 'the reopened sheet keeps its answers; later ones go');
  assert.equal(session.done, false);

  // Change an answer and carry on: the walk follows the new answer.
  const r = sitSheet('numeracy', fam, session, { n6b: 'yes' });
  assert.deepEqual(current(r.session), { kind: 'level', level: 7, dir: 'up', ids: ['n7a', 'n7b'] });
});

test('sheet rows ask "Can they…?"; titles and sitting time', () => {
  const byId = new Map(TOPICS.map(t => [t.id, t]));
  const withPrompt = { ...byId.get('n5b'), assessmentPrompt: 'Can {{name}} add 2 and 3?' };
  byId.set('n5b', withPrompt);
  assert.deepEqual(sheetRows(byId, ['n5a', 'n5b'], { name: 'Robin' }), [
    { id: 'n5a', name: 'n5a', domain: 'Counting', prompts: ['Can they count to 10 reliably?'] },
    { id: 'n5b', name: 'n5b', domain: 'Adding', prompts: ['Can Robin add 2 and 3?'] },
  ]);
  assert.equal(sheetTitle({ kind: 'level', level: 6 }, 'Numeracy'), 'Numeracy: age 6 sheet');
  assert.equal(sheetTitle({ kind: 'foundations', level: 5 }, 'Literacy'), 'Literacy: foundations to check');
  assert.equal(levelsetTitle({ count: 3, own: 1, laneLabel: 'Numeracy', sheet: { kind: 'level', level: 6 } }),
    'Level-set workbook: marked 1 numeracy topic mastered (age 6 sheet), plus 2 prerequisites');
  assert.equal(SITTING_MINUTES, 20);
  assert.deepEqual(sittingNotice(19.9 * 60000), { minutes: 19, pause: false });
  assert.deepEqual(sittingNotice(20 * 60000), { minutes: 20, pause: true });
});
