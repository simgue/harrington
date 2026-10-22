import assert from 'node:assert/strict';
import { test } from 'node:test';

// Recommendations for the dashboard and child view (e2e findings F3, F12,
// F18), against a small taxonomy whose youngest band starts at 5.
const topic = (id, subject, domain, ageRangeStart = 5, centrality = 0) => ({ id, name: id, subject, domain, ageRangeStart, centrality });
const taxonomy = {
  topics: [
    topic('count-5', 'Mathematics', 'Counting & Cardinality', 5, 1),
    topic('more-less', 'Mathematics', 'Counting & Cardinality', 5, 0.5),
    topic('add-10', 'Mathematics', 'Addition & Subtraction', 6, 0.5),
    topic('sounds', 'English', 'Phonics & Word Reading', 5, 1),
    topic('blend', 'English', 'Phonics & Word Reading', 5, 0.5),
    topic('essay', 'English', 'Writing Composition', 9, 1),
  ],
  dependencies: [{ topicId: 'blend', prerequisiteId: 'sounds', strength: 'hard' }],
};
const json = (body) => ({ ok: true, status: 200, headers: new Headers({ ETag: '"v1"' }), json: async () => body });
globalThis.fetch = async (url) => {
  const path = String(url);
  if (path.endsWith('/topics.json')) return json({ topics: taxonomy.topics });
  if (path.endsWith('/dependencies.json')) return json({ dependencies: taxonomy.dependencies });
  if (path.endsWith('/clusters.json')) return json({ clusters: [] });
  if (path.endsWith('/manifest.json')) return json(null);
  return json({});
};

const { loadTaxonomy } = await import('../src/js/data.js');
await loadTaxonomy();
const store = await import('../src/js/store.js');
const { recommendedNext, allReachableMastered, plantNext, recentActivity, todaysChoices } = await import('../src/js/mastery.js');
const year = new Date().getFullYear();

test('a learner younger than the youngest band is offered that band (F3)', () => {
  const sid = store.addStudent('Wren Sample', year - 3);
  const ids = recommendedNext(sid, 10).map((n) => n.topic.id).sort();
  assert.deepEqual(ids, ['count-5', 'more-less', 'sounds']);
  const day = todaysChoices(sid, '2026-10-07');
  assert.equal(day.literacy.options.length, 1);
  assert.equal(day.numeracy.options.length, 2);
  assert.equal(allReachableMastered(sid), false);
});

test('"everything available is mastered" only when it is (F3)', () => {
  const sid = store.addStudent('Ash Sample', year - 3);
  assert.equal(allReachableMastered(sid), false);
  store.setStatusBulk(sid, ['count-5', 'more-less', 'sounds'], 'mastered');
  // blend (age 5) is open now and not mastered.
  assert.equal(allReachableMastered(sid), false);
  store.setStatus(sid, 'blend', 'mastered');
  assert.equal(allReachableMastered(sid), true);
  assert.deepEqual(recommendedNext(sid), []);
});

test('the age reach stays one year above an older learner (F3)', () => {
  const sid = store.addStudent('Sage Sample', year - 5);
  const ids = recommendedNext(sid, 10).map((n) => n.topic.id);
  assert.ok(ids.includes('add-10'));
  assert.ok(!ids.includes('essay'));
});

test('plant something new prefers a topic not yet started (F18)', () => {
  const sid = store.addStudent('Rowan Sample', year - 5);
  store.setStatus(sid, 'count-5', 'practicing');
  // The started topic ranks first in recommendedNext...
  assert.equal(recommendedNext(sid, 1)[0].topic.id, 'count-5');
  // ...but is not offered as something new.
  const plant = plantNext(sid);
  assert.equal(plant.keepGrowing, false);
  assert.notEqual(plant.topic.id, 'count-5');
  assert.equal(store.statusOf(sid, plant.topic.id), 'none');
});

test('plant something new falls back to the topic in progress, as "keep growing" (F18)', () => {
  const sid = store.addStudent('Quinn Sample', year - 3);
  store.setStatusBulk(sid, ['more-less', 'sounds'], 'mastered');
  store.setStatus(sid, 'count-5', 'learning');
  store.setStatus(sid, 'blend', 'practicing');
  const plant = plantNext(sid);
  assert.equal(plant.keepGrowing, true);
  assert.equal(store.statusOf(sid, plant.topic.id) !== 'none', true);
  store.setStatusBulk(sid, ['count-5', 'blend'], 'mastered');
  assert.equal(plantNext(sid), null);
});

test('recent growth drops topics set back to not started, and placement marks (F12)', () => {
  const sid = store.addStudent('Lark Sample', year - 6);
  store.setStatus(sid, 'count-5', 'mastered');
  store.setStatus(sid, 'sounds', 'learning');
  store.setStatusBulk(sid, ['more-less'], 'mastered', { source: 'placement', activity: false });
  assert.deepEqual(recentActivity(sid).map((a) => a.topic.id).sort(), ['count-5', 'sounds']);
  store.setStatus(sid, 'count-5', 'none');
  assert.deepEqual(recentActivity(sid).map((a) => a.topic.id), ['sounds']);
});
