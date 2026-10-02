import assert from 'node:assert/strict';
import { test } from 'node:test';

// An in-memory stand-in for the Harrington server: /api/health, the lesson
// cache (strict JSON objects, like server.mjs) and a counting /api/ai.
let aiConfigured = true;
const lessons = new Map();
const calls = { ai: 0, put: 0 };
let aiReplies = [];
const json = (status, body) => ({ ok: status < 400, status, headers: new Headers(), json: async () => body });
globalThis.fetch = async (path, options = {}) => {
  const url = String(path);
  if (url === '/api/health') return json(200, { ok: true, aiConfigured });
  if (url === '/api/ai') {
    calls.ai++;
    await new Promise(resolve => setTimeout(resolve, 5));
    const reply = aiReplies.length > 1 ? aiReplies.shift() : aiReplies[0];
    return json(200, { content: typeof reply === 'string' ? reply : JSON.stringify(reply) });
  }
  const key = url.startsWith('/api/lessons/') ? decodeURIComponent(url.slice('/api/lessons/'.length)) : null;
  if (key !== null && options.method === 'PUT') {
    calls.put++;
    const value = JSON.parse(options.body);
    if (!value || Array.isArray(value) || typeof value !== 'object') return json(400, { error: 'Request body must be a JSON object' });
    lessons.set(key, value);
    return json(204, null);
  }
  if (key !== null) return lessons.has(key) ? json(200, lessons.get(key)) : json(404, { error: 'Lesson not found' });
  return json(404, { error: 'Not found' });
};

const store = await import('../src/js/store.js');
const { aiLesson } = await import('../src/js/ai.js');
const { gateAi, explainAiError } = await import('../src/js/ai-status.js');

const topic = { id: 't-cache', name: 'Counting to ten', subject: 'Mathematics', domain: 'Number', ageRangeStart: 4, ageRangeEnd: 6, description: 'Counting objects' };
const LESSON = { objective: 'Count to ten', teach: [{ title: 'Count', say: 'One, two', do: 'Point' }] };

function reset({ ai = true } = {}) {
  aiConfigured = ai;
  lessons.clear();
  calls.ai = 0;
  calls.put = 0;
  aiReplies = [];
  store.forgetCachedLessons();
  return store.refreshHealth();
}

test('cacheKind maps each cache key prefix to its kind', () => {
  assert.equal(store.cacheKind('topic:a'), 'lesson');
  assert.equal(store.cacheKind('print:a'), 'printables');
  assert.equal(store.cacheKind('act:a:game:Hop'), 'activity');
  assert.equal(store.cacheKind('recall:a'), 'recall');
  assert.equal(store.cacheKind('other:a'), null);
});

test('the lesson validator needs an objective and a teach step', () => {
  assert.equal(store.isValidCached('lesson', LESSON), true);
  assert.equal(store.isValidCached('lesson', { objective: 'x', teach: [] }), false);
  assert.equal(store.isValidCached('lesson', { objective: '', teach: LESSON.teach }), false);
  assert.equal(store.isValidCached('lesson', { teach: LESSON.teach }), false);
  assert.equal(store.isValidCached('lesson', { objective: 'x', teach: [{}] }), false);
  assert.equal(store.isValidCached('lesson', null), false);
  assert.equal(store.isValidCached('lesson', 'Sorry, I cannot'), false);
});

test('the printables validator needs one item with content', () => {
  assert.equal(store.isValidCached('printables', { printables: [{ type: 'worksheet', content: { problems: ['1 + 1'] } }] }), true);
  assert.equal(store.isValidCached('printables', { printables: [] }), false);
  assert.equal(store.isValidCached('printables', {}), false);
  assert.equal(store.isValidCached('printables', { printables: [{ type: 'worksheet' }] }), false);
  assert.equal(store.isValidCached('printables', { printables: [{ type: 'worksheet', content: { problems: [] } }] }), false);
});

test('the activity validator needs steps', () => {
  assert.equal(store.isValidCached('activity', { steps: ['Hop to three'] }), true);
  assert.equal(store.isValidCached('activity', { steps: [] }), false);
  assert.equal(store.isValidCached('activity', { materials: ['chalk'] }), false);
});

test('the recall validator needs a card with front and back, and reads old bare arrays', () => {
  const card = { id: 't::0', front: '2 + 2?', back: '4' };
  assert.equal(store.isValidCached('recall', { cards: [card] }), true);
  assert.equal(store.isValidCached('recall', [card]), true, 'legacy array');
  assert.deepEqual(store.normalizeCached('recall', [card]), { cards: [card] });
  assert.equal(store.isValidCached('recall', { cards: [] }), false);
  assert.equal(store.isValidCached('recall', { cards: [{ front: '2 + 2?' }] }), false);
  assert.equal(store.isValidCached('recall', []), false);
});

test('saveCachedLesson never writes an empty or shape-invalid result', async () => {
  await reset();
  assert.equal(await store.saveCachedLesson('print:t-cache', { printables: [] }), false);
  assert.equal(await store.saveCachedLesson('topic:t-cache', { objective: 'x' }), false);
  assert.equal(calls.put, 0);
  assert.equal(await store.getCachedLesson('print:t-cache'), null);
  assert.equal(await store.saveCachedLesson('topic:t-cache', LESSON), true);
  assert.equal(calls.put, 1);
});

test('an invalid cached value from an older version reads as missing', async () => {
  await reset();
  lessons.set('print:t-cache', { printables: [] });
  assert.equal(await store.getCachedLesson('print:t-cache'), null);
  assert.equal(await store.hasCachedLesson('print:t-cache'), false);
});

test('two rapid opens of one lesson make one /api/ai call', async () => {
  await reset();
  aiReplies = [LESSON];
  const [a, b] = await Promise.all([
    store.generateCached('topic:t-cache', () => aiLesson(topic)),
    store.generateCached('topic:t-cache', () => aiLesson(topic)),
  ]);
  assert.equal(calls.ai, 1);
  assert.equal(a, b);
  assert.deepEqual(lessons.get('topic:t-cache'), LESSON);
  // A third open reads the cache.
  await store.generateCached('topic:t-cache', () => aiLesson(topic));
  assert.equal(calls.ai, 1);
});

test('an empty or malformed result is reported as a provider failure and not cached', async () => {
  for (const reply of [{ objective: 'x', teach: [] }, 'not json at all']) {
    await reset();
    aiReplies = [reply];
    await assert.rejects(store.generateCached('topic:t-cache', () => aiLesson(topic)),
      (err) => explainAiError(err).kind === 'provider');
    assert.equal(calls.put, 0);
    assert.equal(lessons.has('topic:t-cache'), false);
  }
  // The next open tries again instead of reading a bad cache entry.
  aiReplies = [LESSON];
  assert.deepEqual(await store.generateCached('topic:t-cache', () => aiLesson(topic)), LESSON);
  assert.equal(calls.ai, 2);
});

test('regenerate replaces the cache, and a failed regenerate keeps the previous version', async () => {
  await reset();
  await store.saveCachedLesson('topic:t-cache', LESSON);
  const fresh = { objective: 'Count to ten again', teach: [{ title: 'Again' }] };
  aiReplies = [fresh];
  assert.deepEqual(await store.generateCached('topic:t-cache', () => aiLesson(topic), { force: true }), fresh);
  assert.equal(calls.ai, 1);
  assert.deepEqual(lessons.get('topic:t-cache'), fresh);

  aiReplies = [{ objective: 'empty', teach: [] }];
  await assert.rejects(store.generateCached('topic:t-cache', () => aiLesson(topic), { force: true }));
  assert.deepEqual(lessons.get('topic:t-cache'), fresh);
  assert.deepEqual(await store.getCachedLesson('topic:t-cache'), fresh);
});

test('without a provider a cached lesson opens and a missing one is "not configured"', async () => {
  await reset({ ai: false });
  lessons.set('topic:t-cache', LESSON);
  assert.deepEqual(await store.generateCached('topic:t-cache', () => aiLesson(topic)), LESSON);
  await assert.rejects(store.generateCached('topic:t-missing', () => aiLesson(topic)),
    (err) => explainAiError(err).kind === 'unconfigured');
  await assert.rejects(store.generateCached('topic:t-cache', () => aiLesson(topic), { force: true }),
    (err) => explainAiError(err).kind === 'unconfigured');
  assert.equal(calls.ai, 0);
});

// gateAi only touches the DOM through the placeholder it is given.
function fakeNode(name) {
  return { name, parentNode: {}, replacedWith: null, replaceWith(node) { this.replacedWith = node; } };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('gateAi upgrades a placeholder to the real control when its cache key exists', async () => {
  await reset({ ai: false });
  lessons.set('topic:t-cache', LESSON);
  let reads = 0;
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = (path, options) => { if (String(path).startsWith('/api/lessons/')) reads++; return fetchBefore(path, options); };
  try {
    const control = fakeNode('open');
    const placeholder = fakeNode('chip');
    assert.equal(gateAi(control, { cachedKey: 'topic:t-cache', fallback: placeholder }), placeholder);
    await settle();
    assert.equal(placeholder.replacedWith, control);

    const missing = fakeNode('chip');
    gateAi(fakeNode('open'), { cachedKey: 'print:t-cache', fallback: missing });
    await settle();
    assert.equal(missing.replacedWith, null, 'nothing cached, the chip stays');

    // Memoized for the session: re-rendering the page does not re-fetch.
    const again = fakeNode('chip');
    gateAi(fakeNode('open'), { cachedKey: 'topic:t-cache', fallback: again });
    gateAi(fakeNode('open'), { cachedKey: 'print:t-cache', fallback: fakeNode('chip') });
    await settle();
    assert.ok(again.replacedWith);
    assert.equal(reads, 2);
  } finally {
    globalThis.fetch = fetchBefore;
  }
});

test('gateAi returns the control itself when a provider is set up', async () => {
  await reset({ ai: true });
  const control = fakeNode('open');
  assert.equal(gateAi(control, { cachedKey: 'topic:t-cache', fallback: fakeNode('chip') }), control);
});

test('a freshly generated lesson upgrades its gated button in the same session', async () => {
  await reset({ ai: false });
  assert.equal(await store.hasCachedLesson('topic:t-cache'), false);
  await store.saveCachedLesson('topic:t-cache', LESSON);
  assert.equal(await store.hasCachedLesson('topic:t-cache'), true);
});
