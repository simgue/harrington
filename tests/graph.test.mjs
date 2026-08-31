import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCurriculumTree, graphHash, localEdges } from '../src/js/graph.js';

const subjects = {
  Mathematics: { color: '#3f7d5e', icon: 'calculator' },
  English: { color: '#b0603a', icon: 'book-open' },
};

const counting = { id: 'count-5', name: 'Count to 5', subject: 'Mathematics', domain: 'Counting', ageRangeStart: 5 };
const ten = { id: 'count-10', name: 'Count to 10', subject: 'Mathematics', domain: 'Counting', ageRangeStart: 5 };
const phonics = { id: 'phonics', name: 'Letter sounds', subject: 'English', domain: 'Phonics', ageRangeStart: 6 };

test('builds a subject → domain → section tree without dropping topics', () => {
  const tree = buildCurriculumTree({
    bySubject: {
      Mathematics: [ten, counting],
      English: [phonics],
    },
    clusterMap: { 'Mathematics|Counting|5': 'Early counting' },
  }, subjects);

  assert.equal(tree.length, 2);
  const math = tree[0];
  assert.equal(math.subject, 'Mathematics');
  assert.equal(math.topics.length, 2);
  assert.equal(math.domains[0].domain, 'Counting');
  assert.equal(math.domains[0].sections[0].age, 5);
  assert.equal(math.domains[0].sections[0].summary, 'Early counting');
  assert.deepEqual(math.domains[0].sections[0].topics.map((topic) => topic.id).sort(), ['count-10', 'count-5']);
});

test('keeps only prerequisite edges that stay inside the current topic set', () => {
  const prereqsOf = new Map([
    ['count-10', [{ id: 'count-5', strength: 'hard' }, { id: 'phonics', strength: 'soft' }]],
    ['count-5', []],
  ]);
  const edges = localEdges([counting, ten], prereqsOf);
  assert.deepEqual(edges, [{ from: 'count-5', to: 'count-10', strength: 'hard' }]);
});

test('encodes graph drill-down hashes', () => {
  assert.equal(graphHash(), 'graph');
  assert.equal(graphHash({ subject: 'Mathematics' }), 'graph/Mathematics');
  assert.equal(
    graphHash({ subject: 'Mathematics', domain: 'Phonics & Word Reading', age: 5 }),
    'graph/Mathematics/Phonics%20%26%20Word%20Reading/5',
  );
});
