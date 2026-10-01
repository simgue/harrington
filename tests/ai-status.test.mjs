import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// store.js reaches the server through backend.js; stub fetch so /api/health
// answers in Node without a running server.
let aiConfigured = false;
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, aiConfigured }) });
const store = await import('../src/js/store.js');
const { explainAiError, aiNotConfiguredError } = await import('../src/js/ai-status.js');

const repoRoot = new URL('..', import.meta.url);
const source = (path) => readFile(new URL(path, repoRoot), 'utf8');

test('explainAiError recognizes the server and client "not configured" messages', () => {
  for (const err of [
    new Error('AI is not configured for this self-hosted Harrington server'),
    aiNotConfiguredError(),
  ]) {
    const result = explainAiError(err);
    assert.equal(result.kind, 'unconfigured');
    assert.match(result.message, /local AI provider/);
  }
});

test('explainAiError separates timeout, unreachable and provider failures', () => {
  assert.equal(explainAiError(new Error('The AI provider timed out')).kind, 'timeout');
  assert.equal(explainAiError(new Error('The AI provider is unreachable')).kind, 'unreachable');
  assert.equal(explainAiError(new Error('The AI provider failed')).kind, 'provider');
  assert.equal(explainAiError(new Error('The AI provider returned an invalid response')).kind, 'provider');
  assert.equal(explainAiError(new SyntaxError('Unexpected token < in JSON')).kind, 'provider');
  assert.equal(explainAiError(new TypeError('Failed to fetch')).kind, 'offline');
  assert.equal(explainAiError(new Error('Harrington request failed (500)')).kind, 'failed');
  assert.equal(explainAiError(undefined).kind, 'failed');
});

test('explainAiError never echoes the raw error text', () => {
  const { message } = explainAiError(new Error('secret-host.internal said no'));
  assert.doesNotMatch(message, /secret-host/);
});

test('the store reads aiConfigured at connect and on refreshHealth', async () => {
  aiConfigured = false;
  await store.connect();
  assert.equal(store.aiAvailable(), false);
  aiConfigured = true;
  assert.equal(await store.refreshHealth(), true);
  assert.equal(store.aiAvailable(), true);
  assert.equal('aiConfigured' in store.get(), false, 'the health flag is not persisted with family state');
});

test('every AI-backed view uses the shared ai-status helper', async () => {
  const views = [
    'topic', 'graph', 'calendar', 'insights', 'records', 'recordings',
    'lesson', 'printables', 'recall', 'challenge', 'masterytest',
  ];
  for (const name of views) {
    const code = await source(`src/js/views/${name}.js`);
    assert.match(code, /from '\.\.\/ai-status\.js'/, `${name}.js does not import ../ai-status.js`);
    assert.doesNotMatch(code, /Couldn.?t (generate|analyze|build|prepare|load recall|create the lesson)/,
      `${name}.js still has a generic AI failure message`);
  }
});

test('the child view hides AI actions without provider wording', async () => {
  const code = await source('src/js/views/kidmode.js');
  assert.match(code, /store\.aiAvailable\(\)/);
  assert.doesNotMatch(code, /ai-status|AI provider|aiUnavailableChip/);
});
