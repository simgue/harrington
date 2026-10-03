// DOM-level tests of the skill tree view (HAR-21 and its follow-ups): the
// selection, scroll, focus and quest log behavior, rendered into a fake
// document by the same navigate/render loop app.js runs.
import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { installFakeDom } from './support/fake-dom.mjs';

const { document, window, flushFrame, pendingFrames } = installFakeDom();

// A fictional curriculum: one domain whose skills chain by hard prerequisites,
// and a neighbor domain.
const TOPICS = [
  { id: 'cnt-1', name: 'Count objects to five', subject: 'Mathematics', domain: 'Counting', ageRangeStart: 5, description: 'Counts up to five things.' },
  { id: 'cnt-2', name: 'Count objects to ten', subject: 'Mathematics', domain: 'Counting', ageRangeStart: 5 },
  { id: 'cnt-3', name: 'Count on from a number', subject: 'Mathematics', domain: 'Counting', ageRangeStart: 6 },
  { id: 'cnt-4', name: 'Compare two groups', subject: 'Mathematics', domain: 'Counting', ageRangeStart: 6 },
  { id: 'shp-1', name: 'Name flat shapes', subject: 'Mathematics', domain: 'Shapes', ageRangeStart: 5 },
];
const DEPENDENCIES = [
  { topicId: 'cnt-2', prerequisiteId: 'cnt-1', strength: 'hard' },
  { topicId: 'cnt-3', prerequisiteId: 'cnt-2', strength: 'hard' },
  { topicId: 'cnt-4', prerequisiteId: 'cnt-2', strength: 'hard' },
  { topicId: 'cnt-4', prerequisiteId: 'shp-1', strength: 'hard' },
];

globalThis.fetch = async (path) => {
  const json = (body, status = 200) => ({ ok: status < 400, status, headers: new Headers({ ETag: '"v1"' }), json: async () => body, text: async () => JSON.stringify(body) });
  if (path === '/api/taxonomy/topics.json') return json({ topics: TOPICS });
  if (path === '/api/taxonomy/dependencies.json') return json({ dependencies: DEPENDENCIES });
  if (path === '/api/taxonomy/clusters.json') return json({ clusters: [] });
  if (path === '/api/taxonomy/manifest.json') return json({ taxonomyVersion: 'test' });
  if (String(path).startsWith('/api/lessons/')) return json({ error: 'Not found' }, 404);
  return json({});
};

const store = await import('../src/js/store.js');
const { loadTaxonomy } = await import('../src/js/data.js');
const { el } = await import('../src/js/ui.js');
const { graphHash, parseGraphHash } = await import('../src/js/graph.js');
const { commitNavigation } = await import('../src/js/navigation.js');
const { renderGraph, graphParamsForTopic } = await import('../src/js/views/graph.js');
await loadTaxonomy();

// The app.js loop, with a stand-in for every page but the graph.
const app = document.createElement('div');
app.setAttribute('id', 'app');
document.body.appendChild(app);
const toastRoot = document.createElement('div');
toastRoot.setAttribute('id', 'toast-root');
document.body.appendChild(toastRoot);

const route = { name: 'dashboard', params: {} };
const hashFor = (name, params = {}) => (name === 'graph' ? graphHash(params) : name + (params.id ? '/' + params.id : ''));
function parseHash() {
  const h = window.location.hash.replace(/^#/, '');
  const graph = parseGraphHash(h);
  if (graph) return { name: 'graph', params: graph };
  const [name, id] = h.split('/');
  return { name: name || 'dashboard', params: id ? { id } : {} };
}
function navigate(name, params = {}, options = {}) {
  route.name = name;
  route.params = params;
  commitNavigation(window, hashFor(name, params), render, options);
}
function render() {
  const content = route.name === 'graph'
    ? renderGraph(route.params, { navigate })
    : el(`<div class="page-${route.name}"></div>`);
  app.innerHTML = '';
  app.appendChild(content);
}
window.addEventListener('hashchange', () => {
  const next = parseHash();
  if (hashFor(next.name, next.params) === hashFor(route.name, route.params)) return;
  Object.assign(route, next);
  render();
});
store.subscribe(() => render());

const nine = store.addStudent('Sample Nine', 2017);
const six = store.addStudent('Sample Six', 2019);
const COUNTING = { subject: 'Mathematics', domain: 'Counting' };

const scroller = () => document.querySelector('.skill-tree-scroller');
const questLog = () => document.querySelector('.quest-log');
const skillNode = (id) => document.querySelector(`[data-skill-id="${id}"]`);
const selectedIds = () => document.querySelectorAll('.skill-node.is-selected').map((node) => node.dataset.skillId);
const scrollTree = (left, top) => {
  const s = scroller();
  s.scrollLeft = left;
  s.scrollTop = top;
  s.dispatch('scroll');
};
function settle() {
  while (pendingFrames()) flushFrame();
}
// The topic page's "Back to graph" link.
const backToGraph = (id) => navigate('graph', graphParamsForTopic(TOPICS.find((topic) => topic.id === id)));

beforeEach(() => {
  settle();
  store.setActiveStudent(nine);
  navigate('dashboard');
  window.scrollTo({ left: 0, top: 0 });
  document.layout.clear();
  document.activeElement = document.body;
  settle();
});

test('a node click selects in place: the first frame already shows the selection and the kept scroll', () => {
  navigate('graph', COUNTING);
  settle();
  window.scrollByUser(420);
  scrollTree(140, 60);
  const entries = window.history.length;

  skillNode('cnt-2').click();
  // The render is synchronous: the very DOM the next paint shows is selected,
  // with its quest log, and the window was never moved to the top.
  assert.deepEqual(selectedIds(), ['cnt-2']);
  assert.ok(questLog());
  assert.equal(window.scrollY, 420);
  assert.equal(window.history.length, entries, 'a selection adds no history entry');
  assert.match(window.location.hash, /\?skill=cnt-2$/);
  // The tree scroll lands in the first frame (before that paint), not later.
  assert.equal(flushFrame(), 1);
  assert.equal(scroller().scrollLeft, 140);
  assert.equal(scroller().scrollTop, 60);
  assert.equal(pendingFrames(), 0);
});

test('a store emit in the same frame takes over the pending restore', () => {
  navigate('graph', COUNTING);
  settle();
  scrollTree(90, 30);
  skillNode('cnt-1').click();
  // A status write lands before the frame: it re-renders with the restore
  // still pending, and the newer tree gets it whole, focus included.
  store.setStatus(nine, 'cnt-3', 'learning');
  settle();
  assert.equal(scroller().scrollLeft, 90);
  assert.equal(scroller().scrollTop, 30);
  assert.equal(document.activeElement, skillNode('cnt-1'));
});

test('focus: a click focuses the new selected node without scrolling; closing the log returns focus to it', () => {
  navigate('graph', COUNTING);
  settle();
  skillNode('cnt-2').click();
  settle();
  const node = skillNode('cnt-2');
  assert.equal(document.activeElement, node);
  assert.deepEqual(node.focusCalls, [{ preventScroll: true }]);

  questLog().querySelector('.quest-close').click();
  settle();
  assert.equal(questLog(), null);
  assert.deepEqual(selectedIds(), []);
  assert.equal(document.activeElement, skillNode('cnt-2'));
  assert.deepEqual(skillNode('cnt-2').focusCalls, [{ preventScroll: true }]);
});

test('scoped restore: Back to graph restores the window, tree and quest log only for the same learner, tree and skill', () => {
  navigate('graph', { ...COUNTING, skill: 'cnt-2' });
  settle();
  window.scrollByUser(500);
  scrollTree(200, 80);
  questLog().scrollTop = 45;
  const open = questLog().querySelectorAll('button').find((button) => button.textContent.includes('Open topic page'));
  open.click();
  assert.equal(route.name, 'topic');

  // Back with the same skill: everything comes back, and focus too.
  window.scrollTo({ top: 0 });
  backToGraph('cnt-2');
  assert.equal(window.scrollY, 0, 'nothing moves before the frame');
  settle();
  assert.equal(window.scrollY, 500);
  assert.equal(scroller().scrollLeft, 200);
  assert.equal(scroller().scrollTop, 80);
  assert.equal(questLog().scrollTop, 45);
  assert.equal(document.activeElement, skillNode('cnt-2'));

  // Leave again, then come back to another skill: opens fresh at that skill.
  questLog().querySelectorAll('button').find((button) => button.textContent.includes('Open topic page')).click();
  window.scrollTo({ top: 0 });
  backToGraph('cnt-3');
  settle();
  assert.equal(window.scrollY, 0);
  assert.deepEqual(selectedIds(), ['cnt-3']);
  assert.equal(questLog().scrollTop, 0);
});

test('a status write keeps the quest log scrolled where it was (N4)', () => {
  navigate('graph', { ...COUNTING, skill: 'cnt-1' });
  settle();
  questLog().scrollTop = 120;
  const mark = questLog().querySelectorAll('button').find((button) => button.textContent.includes('Mark as learning'));
  mark.click();
  assert.equal(store.statusOf(nine, 'cnt-1'), 'learning');
  settle();
  assert.equal(questLog().scrollTop, 120);
  // A different skill's log starts at its top.
  skillNode('cnt-2').click();
  settle();
  assert.equal(questLog().scrollTop, 0);
});

test('browser Back and Forward put the window and tree back as they were left (N5)', () => {
  navigate('graph', { ...COUNTING, skill: 'cnt-2' });
  settle();
  window.scrollByUser(360);
  scrollTree(150, 40);
  questLog().scrollTop = 25;
  questLog().dispatch('scroll');
  navigate('graph', { subject: 'Mathematics', domain: 'Shapes' });
  settle();
  window.scrollByUser(90);
  scrollTree(10, 0);

  window.back();
  assert.deepEqual(selectedIds(), ['cnt-2']);
  settle();
  assert.equal(window.scrollY, 360);
  assert.equal(scroller().scrollLeft, 150);
  assert.equal(scroller().scrollTop, 40);
  assert.equal(questLog().scrollTop, 25);
  assert.equal(document.activeElement, skillNode('cnt-2'));

  window.forward();
  settle();
  assert.equal(window.scrollY, 90);
  assert.equal(scroller().scrollLeft, 10);
});

test('Back to an entry chosen for another learner clears its selection (item 5)', () => {
  navigate('graph', { ...COUNTING, skill: 'cnt-3' });
  settle();
  window.scrollByUser(300);
  navigate('dashboard');
  store.setActiveStudent(six);

  window.back();
  assert.equal(route.name, 'graph');
  assert.deepEqual(selectedIds(), [], "Sample Nine's skill is not shown as Sample Six's");
  assert.equal(questLog(), null);
  assert.equal(window.location.hash, '#' + graphHash(COUNTING), 'the hash drops it in place');
  settle();
  assert.equal(window.scrollY, 0, 'the old scroll is not applied to the new learner');

  // Forward and Back again stay cleared for this learner.
  window.forward();
  window.back();
  assert.deepEqual(selectedIds(), []);
});

test('a switch away and back keeps the return scroll: A, topic, B, A, Back to graph (item 5)', () => {
  navigate('graph', { ...COUNTING, skill: 'cnt-2' });
  settle();
  window.scrollByUser(480);
  scrollTree(220, 70);
  questLog().querySelectorAll('button').find((button) => button.textContent.includes('Open topic page')).click();
  store.setActiveStudent(six);
  store.setActiveStudent(nine);
  window.scrollTo({ top: 0 });
  backToGraph('cnt-2');
  settle();
  assert.deepEqual(selectedIds(), ['cnt-2']);
  assert.equal(window.scrollY, 480);
  assert.equal(scroller().scrollLeft, 220);
  assert.equal(scroller().scrollTop, 70);
});

test('the module-level subscription records an off-graph switch, and a switch on the graph drops the old skill (item 6)', () => {
  // Rendered as Nine, then away to the dashboard and switched to Six there.
  navigate('graph', { ...COUNTING, skill: 'cnt-2' });
  settle();
  navigate('dashboard');
  store.setActiveStudent(six);
  // Six's own fresh selection (the topic page's Back to graph) is kept.
  backToGraph('cnt-3');
  assert.deepEqual(selectedIds(), ['cnt-3']);
  assert.match(window.location.hash, /\?skill=cnt-3$/);
  settle();
  // On the graph, a switch back to Nine drops Six's selection at once.
  store.setActiveStudent(nine);
  assert.deepEqual(selectedIds(), []);
  assert.doesNotMatch(window.location.hash, /skill=/);
  // A later re-render does not bring it back.
  store.setStatus(nine, 'cnt-1', 'learning');
  assert.deepEqual(selectedIds(), []);
});

test('the quest log reveal lands on its scroll margin, measured without the fade-up shift (item 4)', () => {
  navigate('graph', COUNTING);
  settle();
  window.scrollByUser(100);
  skillNode('cnt-2').click();
  // Mid fade-up: the view is still 6px low, and the log is below the fold.
  app.firstElementChild.style.transform = 'matrix(1, 0, 0, 1, 0, 6)';
  questLog().style.scrollMarginTop = '72px';
  document.layout.set(questLog(), { top: 1306, left: 0, width: 390, height: 352 });
  settle();
  // Its settled top is 1300 in the viewport; it lands 72px below the top edge.
  assert.deepEqual(window.scrolls.at(-1), { left: 0, top: 100 + 1300 - 72, behavior: 'instant' });
});

test('a quest log already on screen does not move the page', () => {
  navigate('graph', COUNTING);
  settle();
  window.scrollByUser(100);
  const before = window.scrolls.length;
  skillNode('cnt-1').click();
  document.layout.set(questLog(), { top: 780, left: 0, width: 390, height: 352 });
  settle();
  // Only the click's own preserveScroll write, no reveal.
  assert.deepEqual(window.scrolls.slice(before), [{ left: 0, top: 100, behavior: 'instant' }]);
});

test('"Back to tree" brings the selected node into view and focuses it (item 8)', () => {
  navigate('graph', { ...COUNTING, skill: 'cnt-3' });
  settle();
  const pill = questLog().querySelector('.quest-back-to-tree');
  assert.equal(pill.textContent.trim(), 'Back to tree');
  assert.equal(questLog().firstElementChild, pill, 'it sits at the top of the quest log');
  pill.click();
  const node = skillNode('cnt-3');
  assert.deepEqual(node.scrollIntoViewCalls, [{ block: 'center', inline: 'center', behavior: 'instant' }]);
  assert.equal(document.activeElement, node);
  assert.deepEqual(node.focusCalls.at(-1), { preventScroll: true });
});
