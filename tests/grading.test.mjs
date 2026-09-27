import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCorrect, normalizeAnswer, parseNumber } from '../src/js/grading.js';

const typed = (answer) => ({ type: 'short_answer', q: 'Q', answer });

test('multiple choice compares the chosen option index', () => {
  const q = { type: 'multiple_choice', options: ['a', 'b', 'c'], answer: 1 };
  assert.equal(isCorrect(q, 1), true);
  assert.equal(isCorrect(q, 0), false);
  assert.equal(isCorrect(q, '1'), false);
  assert.equal(isCorrect(q, null), false);
});

test('typed answers need an exact match after normalization', () => {
  assert.equal(isCorrect(typed('Photosynthesis'), 'photosynthesis'), true);
  assert.equal(isCorrect(typed('Photosynthesis'), '  PHOTOSYNTHESIS. '), true);
  assert.equal(isCorrect(typed('The Nile'), 'nile'), true);
  assert.equal(isCorrect(typed('café'), 'Cafe'), true);
  assert.equal(isCorrect(typed('New York'), 'new-york'), true);
});

test('typed answers get no substring credit', () => {
  assert.equal(isCorrect(typed('photosynthesis'), 's'), false);
  assert.equal(isCorrect(typed('photosynthesis'), 'photo'), false);
  assert.equal(isCorrect(typed('cat'), 'caterpillar'), false);
  assert.equal(isCorrect(typed('Paris'), 'Paris is the capital of France'), false);
});

test('empty answers are never correct', () => {
  assert.equal(isCorrect(typed('anything'), ''), false);
  assert.equal(isCorrect(typed('anything'), '   '), false);
  assert.equal(isCorrect(typed(''), ''), false);
  assert.equal(isCorrect(typed('x'), null), false);
});

test('numbers compare numerically only when the whole answer is a number', () => {
  assert.equal(isCorrect(typed('12'), '12.0'), true);
  assert.equal(isCorrect(typed('1,000'), '1000'), true);
  assert.equal(isCorrect(typed('0.5'), '1/2'), true);
  assert.equal(isCorrect(typed('-3'), '-3'), true);
  assert.equal(isCorrect(typed('3.5'), '35'), false);
  assert.equal(isCorrect(typed('World War 2'), '2'), false);
  assert.equal(isCorrect(typed('2'), 'World War 2'), false);
  assert.equal(isCorrect(typed('5 apples'), '5'), false);
  assert.equal(isCorrect(typed('World War 2'), 'world war 2'), true);
});

test('parseNumber rejects anything that is not wholly numeric', () => {
  assert.equal(parseNumber('42'), 42);
  assert.equal(parseNumber(' -7.25 '), -7.25);
  assert.equal(parseNumber('3/4'), 0.75);
  assert.equal(parseNumber('1/0'), null);
  assert.equal(parseNumber('12,34'), null);
  assert.equal(parseNumber('abc'), null);
  assert.equal(parseNumber('2nd'), null);
  assert.equal(parseNumber('.'), null);
  assert.equal(parseNumber(''), null);
});

test('normalizeAnswer strips case, punctuation, accents and a leading article', () => {
  assert.equal(normalizeAnswer('  The  Big, Bad Wolf! '), 'big bad wolf');
  assert.equal(normalizeAnswer('Élan'), 'elan');
  assert.equal(normalizeAnswer(undefined), '');
});
