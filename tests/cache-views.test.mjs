import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { buttons, installFakeDom, waitFor } from './fake-dom.mjs';

// View-level wiring of the generated-content caches, driven through a minimal
// fake document: recall regenerate resets the schedule, a first generation the
// server will not store stays on screen with Retry save, malformed recall
// cards are left out and counted, and without a provider saved lessons open
// from the topic page chip and the Records shelf.

// An in-memory Harrington server: health, the lesson cache and its listing,
// a counting /api/ai, a small taxonomy, and a state endpoint that accepts saves.
let aiConfigured = true;
const lessons = new Map();
const savedAt = new Map();
const calls = { ai: 0, put: 0 };
let aiReply = null;
let failPuts = false;
const TOPIC = { id: 'tv-count', name: 'Counting on', subject: 'Mathematics', domain: 'Number', ageRangeStart: 5, ageRangeEnd: 6, description: 'Counting on' };
const OTHER = { id: 'tv-shapes', name: 'Naming shapes', subject: 'Mathematics', domain: 'Geometry', ageRangeStart: 5, ageRangeEnd: 6, description: 'Shapes' };
const json = (status, body) => ({ ok: status < 400, status, headers: new Headers({ ETag: '"v1"' }), json: async () => body });
globalThis.fetch = async (path, options = {}) => {
  const url = new URL(String(path), 'http://harrington.test');
  if (url.pathname === '/api/health') return json(200, { ok: true, aiConfigured });
  if (url.pathname === '/api/taxonomy/topics.json') return json(200, { topics: [TOPIC, OTHER] });
  if (url.pathname === '/api/taxonomy/dependencies.json') return json(200, { dependencies: [] });
  if (url.pathname.startsWith('/api/taxonomy/')) return json(404, { error: 'Unknown taxonomy file' });
  if (url.pathname === '/api/state') return json(200, {});
  if (url.pathname === '/api/ai') {
    calls.ai++;
    return json(200, { content: JSON.stringify(aiReply) });
  }
  if (url.pathname === '/api/lessons') {
    const prefix = url.searchParams.get('prefix');
    return json(200, { lessons: [...lessons.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key, savedAt: savedAt.get(key) })) });
  }
  const key = decodeURIComponent(url.pathname.slice('/api/lessons/'.length));
  if (options.method === 'PUT') {
    calls.put++;
    if (failPuts) return json(500, { error: 'Internal server error' });
    lessons.set(key, JSON.parse(options.body));
    savedAt.set(key, Date.now());
    return json(204, null);
  }
  return lessons.has(key) ? json(200, lessons.get(key)) : json(404, { error: 'Lesson not found' });
};

const document = installFakeDom();
// Toasts and modal transitions use timers; keep them from holding the process open.
mock.timers.enable({ apis: ['setTimeout'] });

const store = await import('../src/js/store.js');
const { loadTaxonomy } = await import('../src/js/data.js');
const { openRecall } = await import('../src/js/views/recall.js');
const { openLesson } = await import('../src/js/views/lesson.js');
const { renderRecords } = await import('../src/js/views/records.js');
await loadTaxonomy();

const modalRoot = () => document.getElementById('modal-root');
const toastRoot = () => document.getElementById('toast-root');
const stageText = () => modalRoot().textContent;
const cards = (n, prefix = 'Q') => Array.from({ length: n }, (_, i) => ({ id: `${TOPIC.id}::${i}`, front: `${prefix}${i}?`, back: `A${i}`, hint: '' }));
const LESSON = { objective: 'Count on from a number', teach: [{ title: 'Start at five', say: 'Five, six, seven', do: 'Hop along a number line' }] };

async function reset({ ai = true } = {}) {
  aiConfigured = ai;
  lessons.clear();
  savedAt.clear();
  calls.ai = 0;
  calls.put = 0;
  aiReply = null;
  failPuts = false;
  store.forgetCachedLessons();
  store.setChildViewOpen(false);
  modalRoot().replaceChildren();
  toastRoot().replaceChildren();
  await store.refreshHealth();
}

const learners = [store.addStudent('Sample Nine', 2017), store.addStudent('Sample Seven', 2019)];
store.setActiveStudent(learners[0]);

test('a successful recall regenerate resets the topic schedule for every learner', async () => {
  await reset();
  lessons.set('recall:' + TOPIC.id, { cards: cards(7) });
  for (const sid of learners) for (let i = 0; i < 7; i++) store.ensureRecallCard(sid, `${TOPIC.id}::${i}`, TOPIC.id);
  store.gradeRecall(learners[1], `${TOPIC.id}::0`, TOPIC.id, 'again');

  openRecall(TOPIC);
  await waitFor(() => stageText().includes('Card 1 of 7'));
  assert.equal(calls.ai, 0, 'cached cards open without an AI call');

  aiReply = { cards: [{ front: 'New 0?', back: 'N0' }, { front: 'New 1?', back: 'N1' }] };
  const [regen] = buttons(modalRoot(), 'Generate a different version');
  assert.ok(regen, 'the regenerate button is shown');
  regen.click();
  await waitFor(() => stageText().includes('Card 1 of 2'));

  assert.equal(calls.ai, 1);
  assert.equal(lessons.get('recall:' + TOPIC.id).cards.length, 2, 'the new set is cached');
  for (const sid of learners) {
    for (let i = 2; i < 7; i++) assert.equal(store.recallState(sid, `${TOPIC.id}::${i}`), null, `${sid} keeps no record for a card that is gone`);
  }
  // The active learner starts the new set fresh; the other learner has nothing until they open it.
  assert.equal(store.recallState(learners[0], `${TOPIC.id}::0`).lapses, 0);
  assert.equal(store.recallState(learners[1], `${TOPIC.id}::0`), null, 'the lapse on the old card 0 is not inherited');
  assert.equal(store.dueRecallCards(learners[0], { topicId: TOPIC.id }).length, 2);
});

test('a failed recall regenerate keeps the schedule and the previous cards', async () => {
  await reset();
  lessons.set('recall:' + TOPIC.id, { cards: cards(3) });
  for (let i = 0; i < 3; i++) store.ensureRecallCard(learners[0], `${TOPIC.id}::${i}`, TOPIC.id);
  store.gradeRecall(learners[0], `${TOPIC.id}::1`, TOPIC.id, 'again');

  openRecall(TOPIC);
  await waitFor(() => stageText().includes('Card 1 of 3'));
  aiReply = { cards: [{ front: 'only a front' }] };
  buttons(modalRoot(), 'Generate a different version')[0].click();
  await waitFor(() => stageText().includes('Try again'));

  assert.ok(stageText().includes('Card 1 of 3'), 'the previous cards are back');
  assert.equal(store.recallState(learners[0], `${TOPIC.id}::1`).lapses, 1, 'the schedule is untouched');
  assert.equal(lessons.get('recall:' + TOPIC.id).cards.length, 3);
});

test('the child view has no regenerate and resets nothing', async () => {
  await reset();
  lessons.set('recall:' + TOPIC.id, { cards: cards(2) });
  store.setChildViewOpen(true);
  openRecall(TOPIC);
  await waitFor(() => stageText().includes('Card 1 of 2'));
  assert.equal(buttons(modalRoot(), 'Generate a different version').length, 0);
});

test('malformed recall cards are left out up front and counted', async () => {
  await reset();
  lessons.set('recall:' + TOPIC.id, { cards: [...cards(2), { id: `${TOPIC.id}::2`, front: { text: 'object' }, back: 'x' }, { front: 'no id', back: 'x' }] });
  openRecall(TOPIC);
  await waitFor(() => stageText().includes('Card 1 of 2'));
  assert.match(stageText(), /2 cards couldn’t be shown and were left out\./);
});

test('a first recall generation the server will not store stays on screen with Retry save', async () => {
  await reset();
  failPuts = true;
  aiReply = { cards: [{ front: 'Q?', back: 'A' }] };
  openRecall(TOPIC);
  await waitFor(() => stageText().includes('Card 1 of 1'));
  assert.ok(toastRoot().textContent.includes('Generated, but not saved on this server'));
  failPuts = false;
  buttons(toastRoot(), 'Retry save')[0].click();
  await waitFor(() => lessons.has('recall:' + TOPIC.id));
  assert.equal(calls.ai, 1, 'the provider is not asked again');
});

test('a first lesson generation the server will not store stays on screen, and Retry save sends the same lesson', async () => {
  await reset();
  failPuts = true;
  aiReply = LESSON;
  openLesson(TOPIC);
  await waitFor(() => stageText().includes('Count on from a number'));
  assert.equal(calls.ai, 1);
  assert.ok(store.isUnsavedCached('topic:' + TOPIC.id));
  assert.ok(toastRoot().textContent.includes('Generated, but not saved on this server'));

  // Opening again in this session shows the same lesson with no new AI call.
  modalRoot().replaceChildren();
  openLesson(TOPIC);
  await waitFor(() => stageText().includes('Count on from a number'));
  assert.equal(calls.ai, 1);

  // Retry save while the server still refuses: the toast comes back. Then it goes through.
  const retry = () => buttons(toastRoot(), 'Retry save');
  const offered = retry().length;
  retry().at(-1).click();
  await waitFor(() => retry().length > offered);
  failPuts = false;
  retry().at(-1).click();
  await waitFor(() => !store.isUnsavedCached('topic:' + TOPIC.id));
  assert.deepEqual(lessons.get('topic:' + TOPIC.id), LESSON);
  assert.ok(toastRoot().textContent.includes('Saved'));
  assert.equal(calls.ai, 1, 'never billed twice for the lesson on screen');
});

test('without a provider the Records page shelves valid saved lessons and printables, and they open with no AI call', async () => {
  await reset({ ai: false });
  lessons.set('topic:' + TOPIC.id, LESSON);
  savedAt.set('topic:' + TOPIC.id, Date.UTC(2026, 9, 1));
  lessons.set('print:' + OTHER.id, { printables: [{ type: 'worksheet', title: 'Shapes', content: { problems: ['Name a square'] } }] });
  savedAt.set('print:' + OTHER.id, Date.UTC(2026, 9, 2));
  // Fails the lesson validator: never offered.
  lessons.set('topic:' + OTHER.id, { objective: 'no steps', teach: [] });
  savedAt.set('topic:' + OTHER.id, Date.UTC(2026, 9, 3));

  const page = renderRecords({}, { navigate() {} });
  const shelf = await waitFor(() => {
    const s = page.querySelector('.saved-lessons');
    return s && !s.classList.contains('hidden') && s;
  });
  const rows = shelf.querySelectorAll('li');
  assert.deepEqual(rows.map(r => r.querySelector('p').textContent), ['Naming shapes', 'Counting on'], 'newest first, invalid left out');
  assert.match(rows[0].textContent, /Print & go/);
  assert.match(rows[1].textContent, /Lesson/);

  buttons(rows[1], 'Open')[0].click();
  await waitFor(() => stageText().includes('Count on from a number'));
  assert.equal(calls.ai, 0);
});

test('with a provider the Records page shows no shelf', async () => {
  await reset();
  lessons.set('topic:' + TOPIC.id, LESSON);
  const page = renderRecords({}, { navigate() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(page.querySelector('.saved-lessons').classList.contains('hidden'));
});
