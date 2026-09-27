import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDailyChoices, laneOptions, LANES } from '../src/js/daily.js';

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
  assert.equal(choices.literacy.length, 2);
  assert.equal(choices.numeracy.length, 2);
  for (const t of choices.literacy) assert.ok(LANES.literacy.domains.includes(t.domain), t.id);
  for (const t of choices.numeracy) assert.ok(LANES.numeracy.domains.includes(t.domain), t.id);
});

test('never offers mastered, locked, or too-advanced topics', () => {
  const options = laneOptions(topics, LANES.literacy, ctx({
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
  const [a, b] = laneOptions(topics, LANES.literacy, ctx());
  assert.notEqual(a.domain, b.domain);
});

test('work already in progress is offered first', () => {
  const [first] = laneOptions(topics, LANES.numeracy, ctx({ statusOf: (id) => (id === 'place-value' ? 'learning' : 'none') }));
  assert.equal(first.id, 'place-value');
});

test('a domain that has gone quiet outranks one touched yesterday', () => {
  const now = Date.parse('2026-09-26T09:00:00Z');
  const [first] = laneOptions(topics, LANES.numeracy, ctx({
    lastTouched: (domain) => (domain === 'Addition & Subtraction' ? now - 86400000 : domain === 'Counting & Cardinality' ? now - 12 * 86400000 : now - 86400000),
  }));
  assert.equal(first.id, 'count-20');
});

test('falls back to the whole subject when no focus domains exist', () => {
  const other = [topic('shapes', 'Mathematics', 'Geometry'), topic('money', 'Mathematics', 'Money')];
  const options = laneOptions(other, LANES.numeracy, ctx());
  assert.deepEqual(options.map((t) => t.id).sort(), ['money', 'shapes']);
});

test('the same day always yields the same offer', () => {
  const a = buildDailyChoices(topics, ctx());
  const b = buildDailyChoices(topics, ctx());
  assert.deepEqual(a.literacy.map((t) => t.id), b.literacy.map((t) => t.id));
  assert.deepEqual(a.numeracy.map((t) => t.id), b.numeracy.map((t) => t.id));
});
