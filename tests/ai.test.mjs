import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { buildExplainPrompt, buildLessonPrompt } from '../src/js/ai.js';

const repoRoot = new URL('..', import.meta.url);
const source = (path) => readFile(new URL(path, repoRoot), 'utf8');

const topic = {
  id: 'count-to-5',
  name: 'Count to 5',
  subject: 'Mathematics',
  domain: 'Number',
  ageRangeStart: 4,
  ageRangeEnd: 6,
  description: 'Count five objects.',
  evidence: ['Says numbers in order'],
};

test('lesson and explain prompts use a generic learner and age band, never a child name', () => {
  const secret = 'SecretChildXYZ';
  const lesson = buildLessonPrompt(topic, secret);
  const explain = buildExplainPrompt(topic, secret);

  for (const prompt of [lesson, explain]) {
    assert.doesNotMatch(prompt, new RegExp(secret));
    assert.match(prompt, /your child/i);
    assert.match(prompt, /ages 4-6/);
    assert.match(prompt, /Count to 5/);
  }
});

test('lesson generators and callers do not interpolate learner names into prompts', async () => {
  const [ai, lesson, printables, daysheet, topicView] = await Promise.all([
    source('src/js/ai.js'),
    source('src/js/views/lesson.js'),
    source('src/js/views/printables.js'),
    source('src/js/views/daysheet.js'),
    source('src/js/views/topic.js'),
  ]);

  assert.match(ai, /buildLessonPrompt/);
  assert.doesNotMatch(ai, /childName \|\| 'your child'/);
  assert.doesNotMatch(ai, /childName \|\| 'a young learner'/);
  assert.doesNotMatch(lesson, /childName \|\| student\?\.name/);
  assert.doesNotMatch(printables, /aiPrintables\(topic, student\?\.name\)/);
  assert.doesNotMatch(daysheet, /aiLesson\(topic, childName\)/);
  assert.doesNotMatch(topicView, /fn\(t, student\?\.name\)/);
  assert.match(lesson, /AI is not configured/);
});
