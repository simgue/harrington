import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectPlacement, defaultMaxAge, subjectDomains, placementTitle } from '../src/js/placement.js';

const topic = (id, subject, domain, ageRangeStart) => ({ id, name: id, subject, domain, ageRangeStart });

const topics = [
  topic('count-10', 'Mathematics', 'Counting', 5),
  topic('count-100', 'Mathematics', 'Counting', 6),
  topic('add-10', 'Mathematics', 'Addition', 6),
  topic('add-100', 'Mathematics', 'Addition', 8),
  topic('times', 'Mathematics', 'Multiplication', 9),
  topic('letters', 'English', 'Phonics', 5),
  topic('shapes', 'Mathematics', 'Geometry', 3), // clamps to 5
];

// Hard edges: topic -> prerequisites.
const edges = {
  'add-10': ['count-10'],
  'add-100': ['add-10', 'count-100'],
  'times': ['add-100'],
  'count-10': ['letters'], // cross-subject, for the closure test
};
const hardPrereqs = (id) => (edges[id] || []).map(p => ({ id: p, strength: 'hard' }));

const sorted = (list) => [...list].sort();

test('selects topics in the subject at or below the age cutoff', () => {
  const r = selectPlacement(topics, { subject: 'Mathematics', maxAge: 6, hardPrereqs });
  assert.deepEqual(sorted(r.ids), ['add-10', 'count-10', 'count-100', 'shapes']);
  assert.equal(r.count, 4);
});

test('age cutoff is inclusive and uses the clamped topic age', () => {
  const r = selectPlacement(topics, { subject: 'Mathematics', maxAge: 5, hardPrereqs });
  assert.deepEqual(sorted(r.ids), ['count-10', 'shapes']);
  assert.ok(!selectPlacement(topics, { subject: 'Mathematics', maxAge: 8 }).ids.includes('times'));
});

test('a domain narrows the selection to that domain', () => {
  const r = selectPlacement(topics, { subject: 'Mathematics', domain: 'Addition', maxAge: 8, hardPrereqs });
  assert.deepEqual(sorted(r.ids), ['add-10', 'add-100']);
});

test('already-mastered topics are excluded', () => {
  const progress = { 'count-10': { status: 'mastered' }, 'add-10': { status: 'learning' } };
  const r = selectPlacement(topics, { subject: 'Mathematics', maxAge: 6, progress, hardPrereqs });
  assert.deepEqual(sorted(r.ids), ['add-10', 'count-100', 'shapes']);
});

test('hard-prerequisite closure is transitive, crosses subjects and skips mastered topics', () => {
  const r = selectPlacement(topics, { subject: 'Mathematics', domain: 'Addition', maxAge: 8, hardPrereqs });
  assert.deepEqual(sorted(r.prereqIds), ['count-10', 'count-100', 'letters']);
  assert.equal(r.prereqCount, 3);

  const progress = { 'count-10': { status: 'mastered' } };
  const r2 = selectPlacement(topics, { subject: 'Mathematics', domain: 'Addition', maxAge: 8, progress, hardPrereqs });
  assert.deepEqual(sorted(r2.prereqIds), ['count-100'], 'stops at a mastered prerequisite');
});

test('without prerequisites, only topics whose foundations are covered are safe', () => {
  const r = selectPlacement(topics, { subject: 'Mathematics', domain: 'Addition', maxAge: 8, hardPrereqs });
  // add-10 needs count-10 (outside); add-100 needs add-10, which is then unsafe too.
  assert.deepEqual(r.safeIds, []);

  const progress = { 'count-10': { status: 'mastered' } };
  const r2 = selectPlacement(topics, { subject: 'Mathematics', domain: 'Addition', maxAge: 8, progress, hardPrereqs });
  assert.deepEqual(r2.safeIds, ['add-10'], 'add-100 still waits on count-100');
});

test('selection ids and prerequisite ids never overlap', () => {
  const r = selectPlacement(topics, { subject: 'Mathematics', maxAge: 8, hardPrereqs });
  for (const id of r.prereqIds) assert.ok(!r.ids.includes(id), id);
  assert.deepEqual(r.prereqIds, ['letters']);
});

test('helpers: default age, domains, title', () => {
  assert.equal(defaultMaxAge(9), 8);
  assert.equal(defaultMaxAge(5), 5);
  assert.equal(defaultMaxAge(16), 13);
  assert.deepEqual(subjectDomains(topics, 'Mathematics'), ['Counting', 'Addition', 'Multiplication', 'Geometry']);
  assert.equal(placementTitle({ count: 12, subject: 'Mathematics', maxAge: 8 }), 'Placement: marked 12 topics in Mathematics mastered up to age 8');
  assert.equal(placementTitle({ count: 1, subject: 'English', domain: 'Phonics', maxAge: 6 }), 'Placement: marked 1 topic in English · Phonics mastered up to age 6');
  assert.equal(placementTitle({ count: 270, subject: 'Mathematics', maxAge: 8, prereqCount: 6 }), 'Placement: marked 270 topics in Mathematics mastered up to age 8, plus 6 prerequisites');
});
