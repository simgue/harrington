import assert from 'node:assert/strict';
import { test } from 'node:test';

// An in-memory stand-in for the Harrington server: /api/health, the lesson
// cache (strict JSON objects, like server.mjs) and a counting /api/ai.
let aiConfigured = true;
const lessons = new Map();
const calls = { ai: 0, put: 0 };
let aiReplies = [];
let failPuts = false;
let failGets = false;
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
    if (failPuts) return json(500, { error: 'Internal server error' });
    const value = JSON.parse(options.body);
    if (!value || Array.isArray(value) || typeof value !== 'object') return json(400, { error: 'Request body must be a JSON object' });
    lessons.set(key, value);
    return json(204, null);
  }
  if (key !== null && failGets) throw new TypeError('Failed to fetch');
  if (key !== null) return lessons.has(key) ? json(200, lessons.get(key)) : json(404, { error: 'Lesson not found' });
  return json(404, { error: 'Not found' });
};

// Just enough DOM for ui.el() and aiErrorBlock: nodes record their markup.
function fakeNode(html = '') {
  const classes = new Set((html.match(/class="([^"]*)"/)?.[1] || '').split(/\s+/).filter(Boolean));
  return {
    html, children: [], parentNode: {}, replacedWith: null,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    querySelector: () => fakeNode(),
    appendChild(child) { this.children.push(child); return child; },
    remove() {},
    replaceWith(node) { this.replacedWith = node; },
  };
}
globalThis.document = {
  createElement: () => ({ innerHTML: '', get content() { return { firstElementChild: fakeNode(this.innerHTML) }; } }),
};
function fakeStage(...nodes) {
  return { childNodes: nodes, replaceChildren(...next) { this.childNodes = next; } };
}

const store = await import('../src/js/store.js');
const { aiLesson } = await import('../src/js/ai.js');
const { gateAi, explainAiError, regenerateInto, showGenerated } = await import('../src/js/ai-status.js');
const { pageHeader, ageBand } = await import('../src/js/views/printables.js');

const topic = { id: 't-cache', name: 'Counting to ten', subject: 'Mathematics', domain: 'Number', ageRangeStart: 4, ageRangeEnd: 6, description: 'Counting objects' };
const LESSON = { objective: 'Count to ten', teach: [{ title: 'Count', say: 'One, two', do: 'Point' }] };

function reset({ ai = true } = {}) {
  aiConfigured = ai;
  lessons.clear();
  calls.ai = 0;
  calls.put = 0;
  aiReplies = [];
  failPuts = false;
  failGets = false;
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

test('validators reject list fields that are not arrays', () => {
  assert.equal(store.isValidCached('lesson', { ...LESSON, materials: 'paper and pencil' }), false);
  assert.equal(store.isValidCached('lesson', { ...LESSON, guidedPractice: 'together' }), false);
  assert.equal(store.isValidCached('lesson', { ...LESSON, independentActivity: { steps: 'go' } }), false);
  assert.equal(store.isValidCached('lesson', { ...LESSON, materials: ['paper'], questions: [] }), true);
  assert.equal(store.isValidCached('activity', { steps: ['Hop'], materials: 'chalk' }), false);
  assert.equal(store.isValidCached('printables', { printables: [{ type: 'worksheet', content: 'text' }] }), false);
});

test('a provider result with a string list field never reaches the cache', async () => {
  await reset();
  await store.saveCachedLesson('topic:t-cache', LESSON);
  aiReplies = [{ objective: 'x', teach: [{ title: 'a', say: 'b' }], materials: 'paper and pencil' }];
  await assert.rejects(store.generateCached('topic:t-cache', () => aiLesson(topic), { force: true }),
    (err) => explainAiError(err).kind === 'provider');
  assert.deepEqual(lessons.get('topic:t-cache'), LESSON);
});

test('a result that fails the trial render is not saved', async () => {
  await reset();
  aiReplies = [LESSON];
  await assert.rejects(store.generateCached('topic:t-cache', () => aiLesson(topic), { accept: () => { throw new TypeError('x.map is not a function'); } }),
    (err) => explainAiError(err).kind === 'provider');
  assert.equal(calls.put, 0);
  assert.equal(lessons.has('topic:t-cache'), false);
});

test('a failed save keeps the previous version and reports failure', async () => {
  await reset();
  await store.saveCachedLesson('topic:t-cache', LESSON);
  failPuts = true;
  const fresh = { objective: 'New', teach: [{ title: 'New step' }] };
  assert.equal(await store.saveCachedLesson('topic:t-cache', fresh), false);
  assert.deepEqual(await store.getCachedLesson('topic:t-cache'), LESSON);
  aiReplies = [fresh];
  await assert.rejects(store.generateCached('topic:t-cache', () => aiLesson(topic), { force: true }));
  assert.deepEqual(await store.getCachedLesson('topic:t-cache'), LESSON);
});

test('a transient error while checking the cache is not remembered', async () => {
  await reset({ ai: false });
  lessons.set('topic:t-cache', LESSON);
  failGets = true;
  assert.equal(await store.hasCachedLesson('topic:t-cache'), false);
  failGets = false;
  assert.equal(await store.hasCachedLesson('topic:t-cache'), true);
  // A definite 404 is remembered.
  assert.equal(await store.hasCachedLesson('print:t-cache'), false);
  lessons.set('print:t-cache', { printables: [{ type: 'worksheet', content: { problems: ['1'] } }] });
  assert.equal(await store.hasCachedLesson('print:t-cache'), false);
});

test('regenerateInto restores the previous content when the new version cannot render', async () => {
  await reset();
  await store.saveCachedLesson('topic:t-cache', LESSON);
  const previous = fakeNode('<div>previous</div>');
  const stage = fakeStage(previous);
  aiReplies = [{ objective: 'Renders badly', teach: [{ title: 'x' }] }];
  let shown = null;
  const result = await regenerateInto(stage, {
    key: 'topic:t-cache', generate: () => aiLesson(topic), loading: fakeNode('<div>loading</div>'),
    render: (value) => { if (value.objective === 'Renders badly') throw new TypeError('L.materials.map is not a function'); return fakeNode('<div>ok</div>'); },
    onShow: (value) => { shown = value; },
  });
  assert.equal(result, null);
  assert.equal(stage.childNodes.length, 2);
  assert.ok(stage.childNodes[0].classList.contains('ai-regen-error'), 'inline error first');
  assert.equal(stage.childNodes[1], previous, 'previous content restored');
  assert.equal(shown, null);
  assert.deepEqual(lessons.get('topic:t-cache'), LESSON, 'the cache keeps the previous version');

  // Retry with a good version replaces both the error and the old content.
  aiReplies = [{ objective: 'Good', teach: [{ title: 'y' }] }];
  const again = await regenerateInto(stage, {
    key: 'topic:t-cache', generate: () => aiLesson(topic), loading: fakeNode('<div>loading</div>'),
    render: () => fakeNode('<div>new</div>'), onShow: (value) => { shown = value; },
  });
  assert.equal(again.objective, 'Good');
  assert.equal(stage.childNodes.length, 1);
  assert.equal(stage.childNodes[0].html, '<div>new</div>');
  assert.equal(shown.objective, 'Good');
});

test('regenerateInto keeps one inline error across repeated failures', async () => {
  await reset();
  const previous = fakeNode('<div>previous</div>');
  const stage = fakeStage(previous);
  aiReplies = ['not json'];
  const opts = { key: 'topic:t-cache', generate: () => aiLesson(topic), loading: fakeNode('<div>loading</div>'), render: () => fakeNode('<div>x</div>') };
  await regenerateInto(stage, opts);
  await regenerateInto(stage, opts);
  assert.equal(stage.childNodes.length, 2);
  assert.equal(stage.childNodes[1], previous);
});

test('showGenerated offers a fresh version when a cached value no longer renders', async () => {
  await reset();
  lessons.set('topic:t-cache', LESSON);
  const stage = fakeStage(fakeNode('<div>loading</div>'));
  const value = await showGenerated(stage, {
    key: 'topic:t-cache', generate: () => aiLesson(topic), loading: fakeNode('<div>loading</div>'),
    render: () => { throw new TypeError('boom'); }, retry: () => {},
  });
  assert.equal(value, null);
  assert.equal(stage.childNodes.length, 1);
  assert.ok(stage.childNodes[0].classList.contains('ai-regen-error'));
  assert.match(stage.childNodes[0].html, /couldn.t use/);
  assert.equal(calls.ai, 0, 'nothing is generated until the parent asks');
});

test('printed sheet headers carry topic, subject and age band', () => {
  const hdr = pageHeader({ type: 'worksheet', title: 'Count the dots' }, { name: 'Counting <to> ten', subject: 'Mathematics', ageRangeStart: 4, ageRangeEnd: 6 });
  assert.match(hdr, /Count the dots/);
  assert.match(hdr, /Counting &lt;to&gt; ten &middot; Mathematics &middot; Ages 4\u20136/);
  assert.equal(ageBand({ ageRangeStart: 7, ageRangeEnd: 7 }), 'Age 7');
  assert.equal(ageBand({}), 'All ages');
});

test('every cached view generates through store.generateCached', async () => {
  const { readFile } = await import('node:fs/promises');
  const read = (path) => readFile(new URL(`../src/js/${path}`, import.meta.url), 'utf8');
  // showGenerated and regenerateInto are the ai-status wrappers around it.
  const helpers = await read('ai-status.js');
  assert.match(helpers, /export async function showGenerated[\s\S]*?store\.generateCached\(/);
  assert.match(helpers, /export async function regenerateInto[\s\S]*?store\.generateCached\(/);
  for (const name of ['lesson', 'printables']) {
    const code = await read(`views/${name}.js`);
    assert.match(code, /showGenerated\(/, `${name}.js opens through showGenerated`);
    assert.match(code, /regenerateInto\(/, `${name}.js regenerates through regenerateInto`);
  }
  assert.match(await read('views/recall.js'), /store\.generateCached\(/, 'recall.js');
  for (const name of ['lesson', 'printables', 'recall']) {
    assert.doesNotMatch(await read(`views/${name}.js`), /store\.(saveCachedLesson|getCachedLesson)\(/, `${name}.js reads or saves the cache by hand`);
  }
});

test('a first generation the server will not store is returned, kept for the session and saved by retrySaveCached', async () => {
  await reset();
  failPuts = true;
  aiReplies = [LESSON];
  assert.deepEqual(await store.generateCached('topic:t-cache', () => aiLesson(topic)), LESSON);
  assert.equal(calls.ai, 1);
  assert.equal(store.isUnsavedCached('topic:t-cache'), true);
  assert.equal(lessons.has('topic:t-cache'), false);
  // Opening again in this session reuses it: no second AI call.
  assert.deepEqual(await store.generateCached('topic:t-cache', () => aiLesson(topic)), LESSON);
  assert.equal(calls.ai, 1);
  assert.equal(await store.retrySaveCached('topic:t-cache'), false, 'still refused');
  failPuts = false;
  assert.equal(await store.retrySaveCached('topic:t-cache'), true);
  assert.deepEqual(lessons.get('topic:t-cache'), LESSON);
  assert.equal(store.isUnsavedCached('topic:t-cache'), false);
  assert.equal(calls.ai, 1);
});

test('gateAi shows the `saved` control instead of the live one when only the cache can open it', async () => {
  await reset({ ai: false });
  lessons.set('topic:t-cache', LESSON);
  const control = fakeNode('open');
  const saved = fakeNode('open saved');
  const placeholder = fakeNode('chip');
  assert.equal(gateAi(control, { cachedKey: 'topic:t-cache', fallback: placeholder, saved }), placeholder);
  await settle();
  assert.equal(placeholder.replacedWith, saved);
  // An invalid saved value is never offered.
  lessons.set('topic:t-bad', { objective: 'x', teach: [] });
  const chip = fakeNode('chip');
  gateAi(control, { cachedKey: 'topic:t-bad', fallback: chip, saved: fakeNode('open saved') });
  await settle();
  assert.equal(chip.replacedWith, null);
});

test('savedLessons lists only valid entries, newest first, without any AI call', async () => {
  await reset({ ai: false });
  const fetchBefore = globalThis.fetch;
  const listing = {
    'topic:': [{ key: 'topic:a', savedAt: 3 }, { key: 'topic:bad', savedAt: 5 }],
    'print:': [{ key: 'print:a', savedAt: 4 }],
  };
  globalThis.fetch = async (path, options) => {
    const url = String(path);
    if (url.startsWith('/api/lessons?prefix=')) return json(200, { lessons: listing[decodeURIComponent(url.split('=')[1])] });
    return fetchBefore(path, options);
  };
  try {
    lessons.set('topic:a', LESSON);
    lessons.set('topic:bad', { objective: 'x', teach: [] });
    lessons.set('print:a', { printables: [{ type: 'worksheet', content: { problems: ['1 + 1'] } }] });
    assert.deepEqual(await store.savedLessons(['topic:', 'print:']), [{ key: 'print:a', savedAt: 4 }, { key: 'topic:a', savedAt: 3 }]);
    assert.deepEqual((await store.savedLessons(['topic:', 'print:'], 1)).map(e => e.key), ['print:a']);
    assert.equal(calls.ai, 0);
  } finally {
    globalThis.fetch = fetchBefore;
  }
  // A listing failure reads as an empty shelf.
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  try {
    assert.deepEqual(await store.savedLessons(['topic:']), []);
  } finally {
    globalThis.fetch = fetchBefore;
  }
});

test('recallCardsOf keeps valid cards and counts malformed ones', () => {
  const ok = { id: 't::0', front: 'Two and two?', back: 'Four', hint: '' };
  const { cards, dropped, droppedIds } = store.recallCardsOf({ cards: [ok, { id: 't::1', front: 'x' }, { front: 'no id', back: 'y' }, null, { id: 't::4', front: 'f', back: 'b', hint: 7 }] });
  assert.deepEqual(cards, [ok]);
  assert.equal(dropped, 4);
  assert.deepEqual(droppedIds, ['t::1', 't::4']);
  assert.deepEqual(store.recallCardsOf([ok]).cards, [ok], 'legacy bare array');
  assert.deepEqual(store.recallCardsOf(null), { cards: [], dropped: 0, droppedIds: [] });
});
