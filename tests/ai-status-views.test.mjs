// Every AI-backed view, rendered with no AI provider through a minimal fake
// DOM: the "Needs a local AI provider" chip is there, and no control left on
// screen starts AI work. The source-text check in ai-status.test.mjs only
// proves a view imports the helper; this one proves the view gates something.
//
// "Starts AI work" is observed, not guessed from labels: each clickable
// element of the rendered view is clicked on a fresh render (and, when the
// click opens a modal, each clickable in that modal too), and the click must
// not reach /api/ai or end in the "none is set up" error, which is what a
// live AI control shows without a provider.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { installFakeDom } from './support/fake-dom.mjs';

const document = installFakeDom();

// The clock is pinned to a Wednesday (as in the E2E suite), so the calendar
// plans a home day whatever day the test runs.
const NOW = Date.parse('2026-10-07T10:30:00Z');
const TODAY = '2026-10-07';
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return NOW; }
};

// ---- A synthetic family and taxonomy behind a stubbed server ----

const STUDENT = { id: 's_view_test', name: 'Rowan Example', birthYear: 2020, color: '#a4473a', createdAt: NOW - 30 * 86_400_000, startDate: '2026-09-07' };
const T = (id, name, extra = {}) => ({ id, name, subject: 'Mathematics', domain: 'Counting & Cardinality', ageRangeStart: 5, ageRangeEnd: 6, description: `${name} for young learners.`, centrality: 1, ...extra });
const TOPICS = [
  T('t_count', 'One-to-one counting'),
  T('t_more', 'How many in total', { centrality: 0.5 }),
  T('t_rote', 'Rote counting to 100', { centrality: 0.2 }),
  T('t_sounds', 'Hear first sounds', { subject: 'English', domain: 'Phonics & Word Reading' }),
];
const MASTERED = TOPICS[0];
const LEARNING = TOPICS[1];
const DEPENDENCIES = [{ topicId: 't_more', prerequisiteId: 't_count', strength: 'hard', reason: 'Count first' }];
const STATE = {
  version: 1,
  students: [STUDENT],
  activeStudentId: STUDENT.id,
  progress: { [STUDENT.id]: {
    [MASTERED.id]: { status: 'mastered', updatedAt: NOW - 86_400_000 },
    [LEARNING.id]: { status: 'learning', updatedAt: NOW - 3_600_000 },
  } },
  records: { [STUDENT.id]: [
    { id: 'r1', type: 'discussion', title: 'Talked about sharing', note: 'Split grapes.', topicId: MASTERED.id, createdAt: NOW - 7_200_000 },
    { id: 'r2', type: 'recording', title: 'Bedtime counting', transcript: 'one two three', topicId: MASTERED.id, createdAt: NOW - 3_600_000 },
    { id: 'r3', type: 'observation', title: 'Counted the stairs', note: 'Got to 12.', rating: 4, topicId: LEARNING.id, createdAt: NOW - 1_800_000 },
  ] },
  // Today's extras on the calendar: one of every kind.
  plan: { [STUDENT.id]: { moves: {}, done: {}, extras: { [TODAY]: [
    { id: 'x_lesson', kind: 'lesson', topicId: LEARNING.id, title: LEARNING.name, subject: 'Mathematics' },
    { id: 'x_retest', kind: 'retest', topicId: MASTERED.id, title: MASTERED.name, subject: 'Mathematics' },
    { id: 'x_challenge', kind: 'challenge', topicId: MASTERED.id, title: MASTERED.name, subject: 'Mathematics' },
    { id: 'x_practice', kind: 'practice', title: 'Spaced practice' },
  ] } } },
};

// Cached lessons (what a family generated while a provider was set up).
const LESSONS = new Map();
let aiConfigured = false;
const aiCalls = [];
const json = (status, body, headers = {}) => ({ ok: status < 400, status, headers: new Headers(headers), json: async () => body, blob: async () => new Blob([]) });
globalThis.fetch = async (url, options = {}) => {
  const path = String(url);
  const method = options.method || 'GET';
  if (path === '/api/health') return json(200, { ok: true, aiConfigured });
  if (path === '/api/ai') { aiCalls.push(options.body); return json(503, { error: 'AI is not configured for this self-hosted Harrington server' }); }
  if (path === '/api/state') return method === 'GET' ? json(200, structuredClone(STATE), { ETag: '"v1"' }) : json(204, null, { ETag: '"v2"' });
  if (path.startsWith('/api/taxonomy/')) {
    const file = path.slice('/api/taxonomy/'.length);
    if (file === 'topics.json') return json(200, { topics: TOPICS });
    if (file === 'dependencies.json') return json(200, { dependencies: DEPENDENCIES });
    if (file === 'clusters.json') return json(200, { clusters: [] });
    return json(200, { taxonomyVersion: 'v1-test', generatedAt: '2026-09-01' });
  }
  if (path.startsWith('/api/lessons/')) {
    const key = decodeURIComponent(path.slice('/api/lessons/'.length));
    if (method === 'PUT') return json(204, null);
    return LESSONS.has(key) ? json(200, LESSONS.get(key)) : json(404, { error: 'Lesson not found' });
  }
  return json(404, { error: 'Not found' });
};
// Toasts and icon refreshes leave timers behind; they must not hold the
// process open once the tests are done.
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (...args) => { const timer = realSetTimeout(...args); timer.unref?.(); return timer; };
globalThis.confirm = () => false;
globalThis.prompt = () => null;
globalThis.alert = () => {};

const store = await import('../src/js/store.js');
const { loadTaxonomy } = await import('../src/js/data.js');
const { renderCalendar } = await import('../src/js/views/calendar.js');
const { renderGraph } = await import('../src/js/views/graph.js');
const { renderTopic } = await import('../src/js/views/topic.js');
const { renderInsights } = await import('../src/js/views/insights.js');
const { renderRecords } = await import('../src/js/views/records.js');
const { openRecordingsLibrary } = await import('../src/js/views/recordings.js');
const { openLesson } = await import('../src/js/views/lesson.js');
const { openPrintables } = await import('../src/js/views/printables.js');
const { openRecall, recallSectionCard } = await import('../src/js/views/recall.js');
const { openChallenge } = await import('../src/js/views/challenge.js');
const { openMasteryTest } = await import('../src/js/views/masterytest.js');
const { renderDashboard } = await import('../src/js/views/dashboard.js');
const { openKidMode } = await import('../src/js/views/kidmode.js');

await store.connect();
await store.loadAll();
await loadTaxonomy();

const UNCONFIGURED = /none is set up on this Harrington server/;
const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
const settle = async () => { for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
const navigate = () => {};

// Errors a click leaves behind (a rejected promise, a console.error) are
// collected, not fatal: the sweep only judges AI calls. They are reported
// with the failure so a broken click is easy to read.
const stray = [];
const onRejection = (err) => stray.push(err);
const realConsoleError = console.error;
const realConsoleWarn = console.warn;
before(() => {
  process.on('unhandledRejection', onRejection);
  console.error = (...args) => stray.push(args.map(String).join(' '));
  console.warn = () => {};
});
after(() => {
  process.off('unhandledRejection', onRejection);
  console.error = realConsoleError;
  console.warn = realConsoleWarn;
});

async function mount(view) {
  app.replaceChildren();
  modalRoot.replaceChildren();
  // Overlays such as the child view attach to <body> next to the roots.
  for (const node of document.body.children) if (!['app', 'modal-root', 'toast-root'].includes(node.id)) node.remove();
  if (store.isChildViewOpen()) store.setChildViewOpen?.(false);
  await store.loadAll();
  const node = await view.render();
  if (node && !node.isConnected) app.appendChild(node);
  await settle();
  return { modal: modalRoot, body: document.body }[view.scope] || app;
}

const chips = (root) => root.querySelectorAll('a.ai-unavailable');
// Elements a person can click: buttons, links and anything with a click
// handler. The chip itself is a link to the setup guide, not an action.
function clickables(root) {
  return [root, ...root.querySelectorAll('*')].filter((node) => !node.classList.contains('ai-unavailable')
    && !node.disabled
    && (node.localName === 'button' || node.localName === 'a' || node.onclick || node._listeners.get('click')?.length));
}
const label = (node) => `<${node.localName}${node.id ? `#${node.id}` : ''}> "${node.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)}"`;

// Click the i-th clickable (then the j-th in the modal it opened), on a fresh
// render, and say what AI work it started.
async function clickPath(view, path) {
  let root = await mount(view);
  const before = aiCalls.length;
  const steps = [];
  for (const index of path) {
    const target = clickables(root)[index];
    if (!target) return { steps, aiStarted: false, opened: null };
    steps.push(label(target));
    const modalsBefore = modalRoot.children.length;
    try { target.click(); } catch (err) { stray.push(err); }
    await settle();
    root = modalRoot.children.length > modalsBefore ? modalRoot.children[modalRoot.children.length - 1] : null;
    if (!root) break;
  }
  const aiStarted = aiCalls.length > before || UNCONFIGURED.test(document.body.textContent);
  return { steps, aiStarted, opened: root };
}

async function liveAiControls(view) {
  const live = [];
  const root = await mount(view);
  const count = clickables(root).length;
  for (let i = 0; i < count; i += 1) {
    const first = await clickPath(view, [i]);
    if (first.aiStarted) { live.push(first.steps.join(' > ')); continue; }
    if (!first.opened) continue;
    const inner = clickables(first.opened).length;
    for (let j = 0; j < inner; j += 1) {
      const second = await clickPath(view, [i, j]);
      if (second.aiStarted) live.push(second.steps.join(' > '));
    }
  }
  return live;
}

const routeView = (render, params = {}) => ({ scope: 'app', render: () => render(params, { navigate }) });
const modalView = (open) => ({ scope: 'modal', render: async () => { await open(); } });

// Cached content for the modal views, so they open on real content and the
// only AI control left is "Generate a different version".
LESSONS.set(`topic:${MASTERED.id}`, { objective: 'Count objects one by one', teach: [{ title: 'Touch and count', say: 'One, two, three', do: 'Point at each block' }] });
LESSONS.set(`print:${MASTERED.id}`, { printables: [{ type: 'worksheet', title: 'Count the dots', content: { intro: 'Count and write', problems: ['● ● ●', '● ●'] } }] });
LESSONS.set(`recall:${MASTERED.id}`, { cards: [{ front: 'What comes after two?', back: 'Three' }] });

// Keyed by test name; `file` is the view module under test.
const VIEWS = {
  calendar: { file: 'calendar', ...routeView(renderCalendar) },
  // LEARNING has no cached lesson, so the quest log's lesson button stays a chip.
  'graph (skill tree and quest log)': { file: 'graph', ...routeView(renderGraph, { subject: 'Mathematics', domain: 'Counting & Cardinality', skill: LEARNING.id }) },
  'topic (mastered)': { file: 'topic', ...routeView(renderTopic, { id: MASTERED.id }) },
  'topic (learning)': { file: 'topic', ...routeView(renderTopic, { id: LEARNING.id }) },
  insights: { file: 'insights', ...routeView(renderInsights) },
  records: { file: 'records', ...routeView(renderRecords) },
  'recall section card': { file: 'recall', scope: 'app', render: () => recallSectionCard(LEARNING, STUDENT) },
  'recordings library': { file: 'recordings', ...modalView(() => openRecordingsLibrary()) },
  'lesson (cached)': { file: 'lesson', ...modalView(() => openLesson(MASTERED)) },
  'printables (cached)': { file: 'printables', ...modalView(() => openPrintables(MASTERED)) },
  'recall cards': { file: 'recall', ...modalView(() => openRecall(MASTERED)) },
  challenge: { file: 'challenge', ...modalView(() => openChallenge(MASTERED)) },
  'mastery test': { file: 'masterytest', ...modalView(() => openMasteryTest('Mathematics', null, MASTERED)) },
  // Launchers of AI modals that hide them instead of showing the chip: the
  // dashboard (no refresher, recall explained) and the child view (no
  // provider wording for children, HAR-13). Only the sweep applies.
  dashboard: { file: 'dashboard', chip: false, ...routeView(renderDashboard) },
  'child view': { file: 'kidmode', chip: false, scope: 'body', render: () => { openKidMode(); } },
};

// A new AI-backed view needs a case above: any view module that calls ai.js
// or uses an ai-status.js gate.
test('every AI-backed view module has a case here', async () => {
  const dir = new URL('../src/js/views/', import.meta.url);
  const covered = new Set(Object.values(VIEWS).map((view) => view.file));
  const missing = [];
  for (const file of await readdir(dir)) {
    const code = await readFile(new URL(file, dir), 'utf8');
    const aiBacked = /from '\.\.\/ai\.js'/.test(code) || /\b(gateAi|aiUnavailableChip|generateAnotherButton)\(/.test(code);
    if (aiBacked && !covered.has(file.replace(/\.js$/, ''))) missing.push(file);
  }
  assert.deepEqual(missing, []);
});

// Views that do not gate yet, with the reason. Each is reported in the pull
// request that added this test; remove the entry once the view is fixed.
// Both are reachable only through launchers that are gated today (topic page,
// calendar extras, insights), so a family without a provider never sees them.
const KNOWN_FAILURES = {
  challenge: 'challenge.js: opened without a provider, "Start challenge" is live and there is no chip (fails on click with the "none is set up" error)',
  'mastery test': 'masterytest.js: opened without a provider, "Create the test" is live and there is no chip (fails on click with the "none is set up" error)',
};

for (const [name, view] of Object.entries(VIEWS)) {
  const known = KNOWN_FAILURES[name];
  test(`no AI provider: ${name} ${view.chip === false ? 'has' : 'shows the chip and'} no live AI control`, { todo: known }, async () => {
    stray.length = 0;
    const root = await mount(view);
    const problems = [];
    if (view.chip !== false && !chips(root).length) problems.push('no "Needs a local AI provider" chip');
    if (UNCONFIGURED.test(document.body.textContent)) problems.push('renders the "none is set up" error on its own');
    for (const path of await liveAiControls(view)) problems.push(`starts AI work: ${path}`);
    assert.deepEqual(problems, [], `${name}:\n  ${problems.join('\n  ')}${stray.length ? `\n(also seen: ${stray.slice(0, 3).map(String).join('; ')})` : ''}`);
  });
}

// The sweep is only worth something if it can fail: with a provider, the same
// views have live AI controls and it finds them.
test('with a provider, the sweep finds the live AI controls', async () => {
  aiConfigured = true;
  try {
    await store.refreshHealth();
    const live = await liveAiControls(VIEWS['topic (learning)']);
    assert.ok(live.some((path) => /Explain simply/.test(path)), live.join('\n'));
    assert.ok(live.some((path) => /Open full lesson/.test(path)), live.join('\n'));
    // Two levels deep: a launcher, then the AI action inside what it opened.
    assert.ok((await liveAiControls(VIEWS.dashboard)).some((path) => /Refresher quiz.* > .*Create the test/.test(path)));
    assert.ok((await liveAiControls(VIEWS['child view'])).some((path) => /Beat the clock.* > .*Start challenge/.test(path)));
  } finally {
    aiConfigured = false;
    await store.refreshHealth();
  }
});
