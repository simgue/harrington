import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildDailySurfaceFromContext,
  frontier_for,
  invitationEvidenceSummary,
  path_to,
} from '../src/js/focus.js';

const topics = [
  { id: 'eng-phonics', name: 'Blend simple sounds', subject: 'English', domain: 'Phonics & Word Reading', ageRangeStart: 6, centrality: 0.9, description: 'Sound out simple words.' },
  { id: 'eng-speaking', name: 'Explain a build step', subject: 'English', domain: 'Speaking & Listening', ageRangeStart: 6, centrality: 1.2, description: 'Explain your thinking out loud.' },
  { id: 'eng-writing', name: 'Write a short build note', subject: 'English', domain: 'Writing Composition', ageRangeStart: 7, centrality: 0.8, description: 'Write labels and short instructions.' },
  { id: 'math-counting', name: 'Count materials to ten', subject: 'Mathematics', domain: 'Counting & Cardinality', ageRangeStart: 6, centrality: 1.1, description: 'Count nails and timber pieces.' },
  { id: 'math-place', name: 'Read simple measurements', subject: 'Mathematics', domain: 'Number Representation & Place Value', ageRangeStart: 6, centrality: 1.3, description: 'Read 10 cm, 20 cm and compare.' },
  { id: 'math-add', name: 'Combine two material totals', subject: 'Mathematics', domain: 'Addition & Subtraction', ageRangeStart: 7, centrality: 0.7, description: 'Add small counts while planning.' },
  { id: 'sci-bird', name: 'Observe bird shelter needs', subject: 'Science', domain: 'Ecosystems & Habitats', ageRangeStart: 6, centrality: 1.4, description: 'Bird habitat and shelter choices.' },
  { id: 'life-measure', name: 'Measure timber strips', subject: 'Life Skills', domain: 'Measurement', ageRangeStart: 6, centrality: 1.4, description: 'Measure timber for a bird shelter.' },
];

const data = {
  topics,
  byId: new Map(topics.map((topic) => [topic.id, topic])),
  prereqsOf: new Map([
    ['eng-phonics', []],
    ['eng-speaking', [{ id: 'eng-phonics', strength: 'hard', reason: 'Needs sound blending before oral explanation.' }]],
    ['eng-writing', [{ id: 'eng-speaking', strength: 'hard', reason: 'Needs oral sequencing before writing.' }]],
    ['math-counting', []],
    ['math-place', [{ id: 'math-counting', strength: 'hard', reason: 'Must count consistently first.' }]],
    ['math-add', [{ id: 'math-place', strength: 'hard', reason: 'Needs place-value confidence first.' }]],
    ['sci-bird', []],
    ['life-measure', [{ id: 'math-counting', strength: 'soft', reason: 'Helpful to count while measuring.' }]],
  ]),
};

const progress = {
  'eng-phonics': 'learning',
  'math-counting': 'practicing',
};

test('frontier_for returns capped ready-now and hard blockers with why-locked path', () => {
  const literacy = frontier_for({
    data,
    progress,
    studentAge: 6,
    subject: 'English',
    domains: ['Phonics & Word Reading', 'Speaking & Listening', 'Writing Composition'],
    capReady: 3,
    capBlocked: 2,
  });
  assert.equal(literacy.ready.length, 1);
  assert.equal(literacy.ready[0].topic.id, 'eng-phonics');
  assert.equal(literacy.blocked.length, 2);
  assert.equal(literacy.blocked[0].topic.id, 'eng-speaking');
  assert.equal(literacy.blocked[0].blockers[0].id, 'eng-phonics');
  assert.ok(literacy.blocked[1].whyLockedPath.length >= 1);
});

test('path_to applies light interest bias for bird shelter', () => {
  const path = path_to({
    data,
    progress,
    studentAge: 6,
    interestText: 'Building a bird shelter',
    cap: 5,
  });
  const ids = path.map((entry) => entry.topic.id);
  assert.ok(ids.includes('sci-bird'));
  assert.ok(ids.includes('life-measure'));
});

test('bird-shelter daily surface yields 3 distinct invite modes and separated review queues', () => {
  const surface = buildDailySurfaceFromContext({
    data,
    studentAge: 6,
    progress,
    interests: { chips: ['Bird shelter'], freeText: 'Building a bird shelter in the backyard' },
    reviewDue: {
      recall: [
        { id: 'r1', topicName: 'Blend simple sounds' },
        { id: 'r2', topicName: 'Count materials to ten' },
        { id: 'r3', topicName: 'Observe bird shelter needs' },
        { id: 'r4', topicName: 'Write a short build note' },
      ],
      practice: [
        { id: 'p1', topicName: 'Read simple measurements' },
        { id: 'p2', topicName: 'Combine two material totals' },
        { id: 'p3', topicName: 'Explain a build step' },
        { id: 'p4', topicName: 'Measure timber strips' },
      ],
    },
  });

  assert.equal(surface.invites.length, 3);
  assert.deepEqual(new Set(surface.invites.map((invite) => invite.mode)), new Set(['make', 'research', 'practice']));
  assert.ok(surface.literacy.ready.length >= 1);
  assert.ok(surface.numeracy.ready.length >= 1);
  assert.ok(surface.literacy.blocked.length >= 1);
  assert.ok(surface.numeracy.blocked.length >= 1);
  assert.ok(surface.numeracy.blocked[0].whyLockedPath.length >= 1);
  assert.equal(surface.reviewDue.recall.length, 3);
  assert.equal(surface.reviewDue.practice.length, 3);
});

test('coverage labels require a linked record with coverage payload', () => {
  const records = [
    { id: 'rec-1', invitationId: 'invite-a', coverage: null },
    { id: 'rec-2', invitationId: 'invite-a', coverage: [] },
    { id: 'rec-3', invitationId: 'invite-b', coverage: [{ topicId: 'math-counting' }] },
  ];
  assert.deepEqual(invitationEvidenceSummary(records, 'invite-a'), { recordCount: 2, coverageCount: 0 });
  assert.deepEqual(invitationEvidenceSummary(records, 'invite-b'), { recordCount: 1, coverageCount: 1 });
  assert.deepEqual(invitationEvidenceSummary(records, 'invite-c'), { recordCount: 0, coverageCount: 0 });
});
