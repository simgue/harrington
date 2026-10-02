import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  buildCurriculumTree,
  buildSkillTree,
  buildWorldMap,
  defaultDomain,
  domainHopId,
  graphHash,
  layeredDagLayout,
  localEdges,
  MAX_DOMAIN_GATEWAYS,
  parseGraphHash,
  quietMasteryFill,
  resolveSkillNodeState,
  selectionForLearner,
} from '../src/js/graph.js';
import { commitNavigation } from '../src/js/navigation.js';

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

test('lays a section DAG in columns so a topic sits after its prerequisites', () => {
  const layout = layeredDagLayout(
    [
      { id: 'a', kind: 'topic' },
      { id: 'b', kind: 'topic' },
      { id: 'c', kind: 'topic' },
    ],
    [
      { from: 'a', to: 'b', strength: 'hard' },
      { from: 'b', to: 'c', strength: 'soft' },
    ],
  );
  const byId = Object.fromEntries(layout.nodes.map((node) => [node.id, node]));
  assert.ok(byId.a.column < byId.b.column);
  assert.ok(byId.b.column < byId.c.column);
  assert.ok(byId.b.x > byId.a.x);
  assert.ok(layout.width > 0 && layout.height > 0);
});

test('places collapsed neighbor hops on the rim instead of exploding them', () => {
  const layout = layeredDagLayout(
    [
      { id: 'home', kind: 'topic' },
      { id: domainHopId('Mathematics|Place Value'), kind: 'hop', side: 'in' },
      { id: domainHopId('Mathematics|Addition'), kind: 'hop', side: 'out' },
    ],
    [
      { from: domainHopId('Mathematics|Place Value'), to: 'home', strength: 'hard' },
      { from: 'home', to: domainHopId('Mathematics|Addition'), strength: 'soft' },
    ],
  );
  const byId = Object.fromEntries(layout.nodes.map((node) => [node.id, node]));
  const inbound = byId[domainHopId('Mathematics|Place Value')];
  const outbound = byId[domainHopId('Mathematics|Addition')];
  assert.ok(inbound.column < byId.home.column);
  assert.ok(outbound.column > byId.home.column);
});

test('longest-path layering survives a cycle without hanging', () => {
  const layout = layeredDagLayout(
    [
      { id: 'a', kind: 'topic' },
      { id: 'b', kind: 'topic' },
    ],
    [
      { from: 'a', to: 'b', strength: 'hard' },
      { from: 'b', to: 'a', strength: 'hard' },
    ],
  );
  assert.equal(layout.nodes.length, 2);
  assert.ok(layout.nodes.every((node) => Number.isFinite(node.column)));
});

test('quiet atlas fills stay free of percentages', () => {
  const empty = quietMasteryFill('#3f7d5e', 0);
  const some = quietMasteryFill('#3f7d5e', 80);
  assert.match(empty, /^#[0-9a-f]{6}$/i);
  assert.match(some, /^#[0-9a-f]{6}$/i);
  assert.notEqual(empty, some);
});

test('graph chrome offers Visual and List without naming the card list Graph', async () => {
  const source = await readFile(new URL('../src/js/views/graph.js', import.meta.url), 'utf8');
  assert.match(source, /label: 'Visual'/);
  assert.match(source, /label: 'List'/);
  assert.match(source, /World Map/);
  assert.match(source, /Curriculum list/);
  assert.match(source, /setGraphView/);
  assert.match(source, /renderWorldMap/);
  assert.match(source, /renderSkillTree/);
  assert.match(source, /Quest log/);
  assert.doesNotMatch(source, />Curriculum graph</);
  assert.doesNotMatch(source, /Curriculum atlas/);
  assert.doesNotMatch(source, /percent complete/i);
  assert.doesNotMatch(source, /\bXP\b/);
  assert.doesNotMatch(source, /Kid Mode/);
});

test('skill node state follows hard prereqs and mastery, and locked is never ready', () => {
  const prereqsOf = new Map([
    ['count-10', [{ id: 'count-5', strength: 'hard' }]],
    ['count-5', []],
    ['place', [{ id: 'count-10', strength: 'hard' }, { id: 'phonics', strength: 'soft' }]],
  ]);

  assert.equal(resolveSkillNodeState('count-5', {}, prereqsOf), 'ready');
  assert.equal(resolveSkillNodeState('count-10', {}, prereqsOf), 'locked');
  assert.equal(resolveSkillNodeState('count-10', { 'count-5': 'mastered' }, prereqsOf), 'ready');
  assert.equal(resolveSkillNodeState('count-10', { 'count-5': 'mastered', 'count-10': 'learning' }, prereqsOf), 'in-progress');
  assert.equal(resolveSkillNodeState('count-10', { 'count-5': 'mastered', 'count-10': 'mastered' }, prereqsOf), 'mastered');
  assert.equal(resolveSkillNodeState('place', { 'count-10': 'mastered' }, prereqsOf), 'ready');
  assert.equal(resolveSkillNodeState('place', {}, prereqsOf), 'locked');
  assert.notEqual(resolveSkillNodeState('count-10', {}, prereqsOf), 'ready');
});

test('world map draws realms and domain clusters, never every topic', () => {
  const tree = buildCurriculumTree({
    bySubject: {
      Mathematics: [ten, counting],
      English: [phonics],
    },
    clusterMap: {},
  }, subjects);
  const scene = buildWorldMap(tree);
  assert.equal(scene.kind, 'world');
  assert.equal(scene.realms.length, 2);
  assert.equal(scene.topicNodes.length, 0);
  assert.ok(scene.realms.every((realm) => realm.kind === 'realm'));
  const math = scene.realms.find((realm) => realm.subject === 'Mathematics');
  assert.equal(math.clusters.length, 1);
  assert.equal(math.clusters[0].kind, 'domain-cluster');
  assert.notEqual(math.clusters[0].kind, 'topic');
});

test('skill tree stays inside one domain and collapses neighbors into gateways', () => {
  const place = { id: 'place-6', name: 'Tens', subject: 'Mathematics', domain: 'Place Value', ageRangeStart: 6 };
  const add7 = { id: 'add-7', name: 'Add later', subject: 'Mathematics', domain: 'Addition', ageRangeStart: 7 };
  const extra = Array.from({ length: 10 }, (_, index) => ({
    id: `extra-${index}`,
    name: `Extra ${index}`,
    subject: 'Science',
    domain: `Domain ${index}`,
    ageRangeStart: 6,
  }));
  const home = [counting, ten];
  const prereqsOf = new Map([
    ['count-5', []],
    ['count-10', [{ id: 'count-5', strength: 'hard' }, { id: 'place-6', strength: 'hard' }]],
    ['add-7', [{ id: 'count-10', strength: 'soft' }]],
  ]);
  const unlocksOf = new Map([
    ['count-5', [{ id: 'count-10', strength: 'hard' }]],
    ['count-10', [{ id: 'add-7', strength: 'soft' }]],
    ['place-6', [{ id: 'count-10', strength: 'hard' }]],
  ]);
  extra.forEach((topic) => {
    prereqsOf.set(topic.id, []);
    prereqsOf.get('count-10').push({ id: topic.id, strength: 'soft' });
    unlocksOf.set(topic.id, [{ id: 'count-10', strength: 'soft' }]);
  });
  const byId = new Map([counting, ten, place, add7, ...extra].map((topic) => [topic.id, topic]));
  const allTopics = [counting, ten, place, add7, ...extra];

  const graph = buildSkillTree(
    { subject: 'Mathematics', domain: 'Counting', topics: home },
    { prereqsOf, unlocksOf, byId },
    { siblingDomains: ['Place Value', 'Addition'], neighborCap: MAX_DOMAIN_GATEWAYS },
  );

  const topicNodes = graph.layout.nodes.filter((node) => node.kind === 'topic');
  assert.equal(topicNodes.length, 2);
  assert.ok(topicNodes.every((node) => home.some((topic) => topic.id === node.id)));
  assert.ok(topicNodes.length < allTopics.length);
  assert.ok(graph.hops.some((hop) => hop.domain === 'Place Value'));
  assert.ok(graph.hops.some((hop) => hop.domain === 'Addition'));
  assert.ok(graph.hops.length <= MAX_DOMAIN_GATEWAYS);
  assert.ok(graph.layout.nodes.some((node) => node.id === domainHopId('Mathematics|Place Value')));
  const byLayoutId = Object.fromEntries(graph.layout.nodes.map((node) => [node.id, node]));
  assert.ok(byLayoutId['count-5'].column < byLayoutId['count-10'].column);
});

test('picks a default domain near the student age', () => {
  const subject = {
    domains: [
      { domain: 'Counting', sections: [{ age: 5 }, { age: 6 }] },
      { domain: 'Algebra', sections: [{ age: 11 }, { age: 12 }] },
    ],
  };
  assert.equal(defaultDomain(subject).domain, 'Counting');
  assert.equal(defaultDomain(subject, 12).domain, 'Algebra');
  assert.equal(defaultDomain({ domains: [] }), null);
});

test('graph hash carries the selected skill and decodes back to the same params', () => {
  assert.equal(graphHash({ subject: 'Mathematics', domain: 'Counting' }), 'graph/Mathematics/Counting');
  assert.equal(
    graphHash({ subject: 'Mathematics', domain: 'Counting', skill: 'count-5' }),
    'graph/Mathematics/Counting?skill=count-5',
  );
  assert.equal(
    graphHash({ subject: 'Mathematics', domain: 'Counting', age: 5, skill: 'count-5' }),
    'graph/Mathematics/Counting/5?skill=count-5',
  );
  assert.equal(graphHash({ skill: null, subject: 'English' }), 'graph/English');

  const awkward = { subject: 'Science & Nature', domain: 'Plants/Animals?', age: '7', skill: 'id with/slash?&=#' };
  assert.deepEqual(parseGraphHash(graphHash(awkward)), awkward);
  assert.deepEqual(parseGraphHash('#' + graphHash(awkward)), awkward);
  for (const params of [
    {},
    { subject: 'Mathematics' },
    { subject: 'Mathematics', domain: 'Counting' },
    { subject: 'Mathematics', domain: 'Counting', skill: 'count-10' },
    { subject: 'Mathematics', domain: 'Counting', age: '5' },
  ]) {
    assert.deepEqual(parseGraphHash(graphHash(params)), params);
  }
});

test('graph hash parsing ignores other routes, unknown keys and bad escapes', () => {
  assert.equal(parseGraphHash('topic/count-5'), null);
  assert.equal(parseGraphHash(''), null);
  assert.deepEqual(parseGraphHash('graph/Mathematics/Counting?view=list&skill=count-5'), {
    subject: 'Mathematics', domain: 'Counting', skill: 'count-5',
  });
  assert.deepEqual(parseGraphHash('graph/Mathematics?skill='), { subject: 'Mathematics' });
  assert.deepEqual(parseGraphHash('graph/Math%E0?skill=a%E0'), { subject: 'Math%E0', skill: 'a%E0' });
});

test('selection is per learner: a switch drops the skill, a re-render or deep link keeps it', () => {
  const params = { subject: 'Mathematics', domain: 'Counting', skill: 'count-5' };
  assert.deepEqual(selectionForLearner(params, undefined, 'learner-a'), { params, switched: false, dropped: false });
  assert.deepEqual(selectionForLearner(params, 'learner-a', 'learner-a'), { params, switched: false, dropped: false });
  assert.deepEqual(selectionForLearner(params, 'learner-a', 'learner-b'), {
    params: { subject: 'Mathematics', domain: 'Counting' }, switched: true, dropped: true,
  });
  assert.deepEqual(selectionForLearner(params, 'learner-a', null).params, { subject: 'Mathematics', domain: 'Counting' });
  const plain = { subject: 'Mathematics' };
  assert.deepEqual(selectionForLearner(plain, 'learner-a', 'learner-b'), { params: plain, switched: true, dropped: false });
  assert.equal(params.skill, 'count-5', 'input params are not mutated');
});

function fakeWindow({ x = 0, y = 0, hash = '' } = {}) {
  const calls = [];
  const win = {
    scrollX: x,
    scrollY: y,
    location: {
      get hash() { return hash; },
      set hash(value) { hash = '#' + value; calls.push(['push', hash]); },
    },
    history: {
      state: { kept: true },
      replaceState(state, title, url) { hash = url; calls.push(['replace', url, state]); },
    },
    scrollTo(opts) { calls.push(['scrollTo', opts]); },
  };
  return { win, calls };
}

test('navigation pushes and scrolls to the top by default', () => {
  const { win, calls } = fakeWindow({ x: 0, y: 640 });
  let renders = 0;
  commitNavigation(win, 'topic/count-5', () => { renders += 1; calls.push(['render']); });
  assert.equal(renders, 1);
  assert.deepEqual(calls, [
    ['push', '#topic/count-5'],
    ['render'],
    ['scrollTo', { top: 0, behavior: 'instant' }],
  ]);
});

test('navigation with replace and preserveScroll rewrites the entry and keeps the window where it was', () => {
  const { win, calls } = fakeWindow({ x: 12, y: 640 });
  commitNavigation(win, 'graph/Mathematics/Counting?skill=count-5', () => {
    // A render that moves the window (content swapped) must not win.
    win.scrollY = 0;
    calls.push(['render']);
  }, { preserveScroll: true, replace: true });
  assert.deepEqual(calls, [
    ['replace', '#graph/Mathematics/Counting?skill=count-5', { kept: true }],
    ['render'],
    ['scrollTo', { left: 12, top: 640, behavior: 'instant' }],
  ]);
  assert.equal(win.location.hash, '#graph/Mathematics/Counting?skill=count-5');
});

test('navigation with render: false only syncs the hash', () => {
  const { win, calls } = fakeWindow({ y: 300 });
  commitNavigation(win, 'graph/Mathematics', () => assert.fail('must not render'), { replace: true, render: false });
  assert.deepEqual(calls, [['replace', '#graph/Mathematics', { kept: true }]]);
});

test('the graph view selects in place and the topic page links back with its skill', async () => {
  const app = await readFile(new URL('../src/js/app.js', import.meta.url), 'utf8');
  const view = await readFile(new URL('../src/js/views/graph.js', import.meta.url), 'utf8');
  const topic = await readFile(new URL('../src/js/views/topic.js', import.meta.url), 'utf8');
  assert.match(app, /commitNavigation\(window, hashFor\(name, params\), render, options\)/);
  assert.match(app, /parseGraphHash\(h\)/);
  assert.match(view, /\{ preserveScroll: true, replace: true \}/);
  assert.doesNotMatch(view, /let selectedSkillId/, 'selection lives in the hash, not module state');
  assert.match(view, /skill: topic\.id/, 'the topic page links back with its skill selected');
  assert.match(topic, /navigate\('graph', graphParamsForTopic\(t\)\)/);
});
