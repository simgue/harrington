import assert from 'node:assert/strict';
import { test } from 'node:test';

const { groupRecordings } = await import('../src/js/views/recordings.js');

const byId = new Map([
  ['t-bonds', { id: 't-bonds', name: 'Number bonds to 9', subject: 'Mathematics' }],
  ['t-frac', { id: 't-frac', name: 'Fractions', subject: 'Mathematics' }],
]);

test('a topic-linked recorder take is labelled from its section id, never "Section"', () => {
  // Shape the recorder saves when a topic is linked but no section was passed.
  const groups = groupRecordings([
    { id: 'r1', type: 'recording', topicId: 't-bonds', topicName: 'Number bonds to 9',
      sectionId: 'Mathematics|Addition & Subtraction|5', sectionLabel: null, subject: 'Mathematics' },
  ], byId);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, 'Addition & Subtraction · Age 5');
  assert.equal(groups[0].subject, 'Mathematics');
});

test('a section group uses the first stored sectionLabel even when a label-less take comes first', () => {
  const groups = groupRecordings([
    { id: 'r1', sectionId: 'Mathematics|Addition & Subtraction|5', sectionLabel: null, topicName: 'Number bonds to 9' },
    { id: 'r2', sectionId: 'Mathematics|Addition & Subtraction|5', sectionLabel: 'Addition & Subtraction · Age 5' },
  ], byId);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, 'Addition & Subtraction · Age 5');
  assert.equal(groups[0].items.length, 2);
});

test('recordings without a section group by topic, and the rest are not linked', () => {
  const groups = groupRecordings([
    { id: 'r1', topicName: 'Fractions' },            // stale topic name, no topic id
    { id: 'r2', topicId: 't-frac' },                 // topic id, name from the taxonomy
    { id: 'r3' },
  ], byId);
  assert.deepEqual(groups.map(g => [g.label, g.items.map(r => r.id)]), [
    ['Not linked to a section', ['r1', 'r3']],
    ['Fractions', ['r2']],
  ]);
});
