// Topic finder: the local search, the path builder and the request log.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ageFactor, buildTopicPath, findHash, parseFindHash, queryTerms, searchTopics, stem, synonymsOf,
} from '../src/js/finder.js';
import { resolveSkillNodeState } from '../src/js/graph.js';

// Quiet saves for store.js (no server in this file).
globalThis.fetch = async () => ({ ok: true, status: 200, headers: new Headers({ ETag: '"v1"' }), json: async () => ({}) });

const topic = (id, name, extra = {}) => ({
  id, name, subject: 'Mathematics', domain: 'Measurement', ageRangeStart: 6, ageRangeEnd: 7, centrality: 0, description: '', evidence: [], ...extra,
});

// ---- Search ----

const TOPICS = [
  topic('time-hours', 'Telling Time: Hours and Half Hours', { ageRangeStart: 5, ageRangeEnd: 6, description: 'Reading an analog clock to the hour and half hour' }),
  topic('time-minute-9', 'Telling time to the minute (age 9+)', { ageRangeStart: 9, ageRangeEnd: 10, description: 'Reading clocks to the nearest minute, including Roman numerals' }),
  topic('events', 'Ordering Events in Time', { ageRangeStart: 4, ageRangeEnd: 6, description: 'Putting the day in order: morning, afternoon, evening' }),
  topic('half', 'What Is a Half?', { domain: 'Fractions', ageRangeStart: 5, ageRangeEnd: 6, description: 'Two equal parts of a whole shape or a set' }),
  topic('halves', 'Halves and quarters (age 7+)', { domain: 'Fractions', ageRangeStart: 7, ageRangeEnd: 8, description: 'Finding a half and a quarter of shapes and amounts' }),
  topic('fractions', 'Understanding fractions', { domain: 'Fractions', description: 'Unit fractions as equal parts of a whole' }),
  topic('fraction-notation', 'Fraction Notation', { domain: 'Fractions', ageRangeStart: 6, ageRangeEnd: 9, description: 'Writing numerators and denominators' }),
  topic('tables', 'Times tables', { domain: 'Multiplication & Division', description: 'Recall of the 2, 5 and 10 multiplication facts' }),
  topic('volcano', 'What Is a Volcano', { subject: 'Science', domain: 'Volcanoes & Earthquakes', ageRangeStart: 5, ageRangeEnd: 7, description: 'A mountain where melted rock comes up from inside the Earth' }),
  topic('letters', 'Addresses and Letters', { subject: 'English', domain: 'Writing Composition', description: 'Writing an address on an envelope' }),
  topic('evidence-only', 'Measuring Lengths', { description: 'Rulers and tape measures', evidence: ['Measure the time it takes to walk across a room'] }),
];
const ids = (res) => res.results.map((r) => r.topic.id);

test('stem folds plurals and -ing/-ed forms the same way on both sides', () => {
  assert.equal(stem('telling'), 'tell');
  assert.equal(stem('fractions'), 'fraction');
  assert.equal(stem('volcanoes'), 'volcano');
  assert.equal(stem('halves'), 'half');
  assert.equal(stem('stories'), 'story');
  assert.equal(stem('running'), 'run');
  assert.equal(stem('adding'), 'add');
  assert.equal(stem('classes'), 'class');
  assert.equal(stem('times'), 'times', '"times tables" stays apart from the clock');
});

test('request phrasing is dropped; the topic words remain', () => {
  assert.deepEqual(queryTerms('I want to learn how to tell the time'), ['tell', 'time']);
  assert.deepEqual(queryTerms('  Fractions!! fractions? '), ['fraction']);
  assert.deepEqual(queryTerms("What's a volcano?"), ['volcano']);
  assert.deepEqual(queryTerms('xylophone lessons for beginners'), ['xylophone']);
});

test('an empty or all-phrasing request returns no terms and no results', () => {
  for (const text of ['', '   ', 'I want to learn', 'how do I', null, undefined]) {
    assert.deepEqual(searchTopics(TOPICS, text), { terms: [], results: [] }, String(text));
  }
});

test('"tell the time" ranks the telling-time topics first', () => {
  const res = searchTopics(TOPICS, 'I want to learn how to tell the time', { age: 6 });
  assert.equal(res.results[0].topic.id, 'time-hours');
  assert.ok(ids(res).includes('time-minute-9'));
  assert.ok(ids(res).indexOf('events') > ids(res).indexOf('time-minute-9'), 'a topic matching one word comes after ones matching both');
});

test('synonyms: clock finds time topics, halves finds fractions and back', () => {
  assert.ok(synonymsOf('clock').includes('time'));
  assert.ok(synonymsOf('time').includes('clock'));
  const clock = ids(searchTopics(TOPICS, 'clock', { age: 6 }));
  assert.ok(clock.includes('time-hours') && clock.includes('time-minute-9'));

  const fractions = searchTopics(TOPICS, 'fractions', { age: 6 });
  assert.ok(ids(fractions).includes('half'), 'a half is a fraction, even without the word');
  // The word itself outranks a synonym.
  assert.ok(ids(fractions).indexOf('fractions') < ids(fractions).indexOf('half'));
  const half = ids(searchTopics(TOPICS, 'halves', { age: 6 }));
  assert.ok(half.includes('half') && half.includes('halves'));
});

test('"times tables" means multiplication, not the clock', () => {
  const res = searchTopics(TOPICS, 'times tables', { age: 6 });
  assert.equal(res.results[0].topic.id, 'tables');
  assert.ok(!ids(res).includes('time-hours'));
});

test('short words do not prefix-match longer ones ("add" is not "address")', () => {
  assert.ok(!ids(searchTopics(TOPICS, 'add')).includes('letters'));
  assert.deepEqual(ids(searchTopics(TOPICS, 'volcanoes')), ['volcano']);
});

test('no close match: nothing found, and evidence-only mentions are too weak', () => {
  assert.deepEqual(searchTopics(TOPICS, 'xylophone').results, []);
  assert.ok(!ids(searchTopics(TOPICS, 'walk across a room')).includes('evidence-only'));
});

test('the age band is a soft boost: it reorders but never hides a match', () => {
  const young = ids(searchTopics(TOPICS, 'telling time', { age: 5 }));
  const older = ids(searchTopics(TOPICS, 'telling time', { age: 9 }));
  assert.equal(young[0], 'time-hours');
  assert.equal(older[0], 'time-minute-9');
  assert.deepEqual([...young].sort(), [...older].sort(), 'the same topics either way');
  // Far outside the band (age 13 vs 5–6) still listed.
  assert.ok(ids(searchTopics(TOPICS, 'volcano', { age: 13 })).includes('volcano'));
  assert.equal(ageFactor({ ageRangeStart: 5, ageRangeEnd: 6 }, 40), 0.75);
  assert.equal(ageFactor({ ageRangeStart: 5, ageRangeEnd: 6 }, null), 1);
  assert.ok(ageFactor({ ageRangeStart: 5, ageRangeEnd: 6 }, 6) > 1);
});

test('results are capped by limit, and ranking is deterministic', () => {
  const a = searchTopics(TOPICS, 'fractions half time', { age: 6, limit: 3 });
  assert.equal(a.results.length, 3);
  assert.deepEqual(ids(a), ids(searchTopics(TOPICS, 'fractions half time', { age: 6, limit: 3 })));
});

// ---- Path ----

// Diamond: b and c both need a; d needs b and c; e (the request) needs d.
// s is only a helpful (soft) prerequisite of d.
const PATH_TOPICS = [
  topic('a', 'Count objects', { ageRangeStart: 4 }),
  topic('b', 'Add within 10', { ageRangeStart: 5 }),
  topic('c', 'Take away within 10', { ageRangeStart: 5 }),
  topic('d', 'Number bonds to 10', { ageRangeStart: 6 }),
  topic('e', 'Add and subtract within 20', { ageRangeStart: 7 }),
  topic('s', 'Counting songs', { ageRangeStart: 4 }),
];
const EDGES = [
  ['b', 'a', 'hard'], ['c', 'a', 'hard'], ['d', 'b', 'hard'], ['d', 'c', 'hard'], ['e', 'd', 'hard'], ['d', 's', 'soft'],
];
function graphOf(topics, edges) {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const prereqsOf = new Map(topics.map((t) => [t.id, []]));
  for (const [to, from, strength] of edges) prereqsOf.get(to).push({ id: from, strength });
  return { byId, prereqsOf };
}
const G = graphOf(PATH_TOPICS, EDGES);
const stepIds = (p) => p.steps.map((s) => s.topic.id);

test('diamond with partial mastery: unmet foundations first, each once, then the target', () => {
  const progress = { a: 'mastered', b: 'learning' };
  const p = buildTopicPath('e', { ...G, progress });
  assert.deepEqual(stepIds(p), ['b', 'c', 'd', 'e']);
  assert.deepEqual(p.steps.map((s) => s.state), ['in-progress', 'ready', 'locked', 'locked']);
  for (const s of p.steps) assert.equal(s.state, resolveSkillNodeState(s.topic.id, progress, G.prereqsOf), 'same rule as the skill tree');
  assert.deepEqual(p.steps[2].blockers, ['b', 'c']);
  assert.deepEqual(p.startsFrom.map((t) => t.id), ['a']);
  assert.equal(p.remaining, 4);
  assert.equal(p.next.topic.id, 'b');
  assert.ok(!stepIds(p).includes('s'), 'helpful prerequisites are not steps');
});

test('the path shrinks as foundations are mastered', () => {
  const p = buildTopicPath('e', { ...G, progress: { a: 'mastered', b: 'mastered', c: 'mastered' } });
  assert.deepEqual(stepIds(p), ['d', 'e']);
  assert.deepEqual(p.steps.map((s) => s.state), ['ready', 'locked']);
  assert.deepEqual(p.startsFrom.map((t) => t.id).sort(), ['b', 'c']);
  assert.equal(p.next.topic.id, 'd');
  assert.equal(p.remaining, 2);
});

test('from scratch the root comes first and is the next step', () => {
  const p = buildTopicPath('e', { ...G, progress: {} });
  assert.deepEqual(stepIds(p), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(p.next.topic.id, 'a');
  assert.deepEqual(p.startsFrom, []);
});

test('an in-progress step that is still locked is not the next ready step', () => {
  const p = buildTopicPath('e', { ...G, progress: { c: 'learning' } });
  assert.equal(p.steps.find((s) => s.topic.id === 'c').state, 'in-progress');
  assert.deepEqual(p.steps.find((s) => s.topic.id === 'c').blockers, ['a']);
  assert.equal(p.next.topic.id, 'a');
});

test('a mastered target has nothing left; an unknown id has no path', () => {
  const p = buildTopicPath('e', { ...G, progress: { e: 'mastered' } });
  assert.deepEqual(stepIds(p), ['e']);
  assert.equal(p.remaining, 0);
  assert.equal(p.next, null);
  const ready = buildTopicPath('a', { ...G, progress: {} });
  assert.deepEqual(stepIds(ready), ['a']);
  assert.equal(ready.next.topic.id, 'a');
  assert.equal(buildTopicPath('missing', { ...G, progress: {} }), null);
});

test('a prerequisite cycle in bad data does not loop', () => {
  const g = graphOf([topic('x', 'X'), topic('y', 'Y'), topic('z', 'Z')], [['x', 'y', 'hard'], ['y', 'x', 'hard'], ['z', 'x', 'hard']]);
  const p = buildTopicPath('z', { ...g, progress: {} });
  assert.deepEqual(stepIds(p).sort(), ['x', 'y', 'z']);
  assert.equal(p.steps.at(-1).topic.id, 'z');
});

// ---- Route ----

test('find hash round trip', () => {
  assert.equal(findHash(), 'find');
  const params = { q: 'tell the time & more?', r: 'rq_1', topic: 'mt_x' };
  assert.equal(findHash(params), 'find?q=tell%20the%20time%20%26%20more%3F&r=rq_1&topic=mt_x');
  assert.deepEqual(parseFindHash('#' + findHash(params)), params);
  assert.deepEqual(parseFindHash('find'), {});
  assert.deepEqual(parseFindHash('find?q=%E0%A4%A&x=1'), { q: '%E0%A4%A' });
  assert.equal(parseFindHash('graph/Mathematics'), null);
  assert.equal(parseFindHash('finder'), null);
});

// ---- Request log (store) ----

test('the request log is per learner, newest first, cleaned and capped', async () => {
  const store = await import('../src/js/store.js');
  const sid = 's-requests';
  assert.deepEqual(store.requestsFor(sid), []);
  let emits = 0;
  const off = store.subscribe(() => { emits++; });
  const first = store.logRequest(sid, '  how to   tell the time ');
  off();
  assert.equal(emits, 1);
  assert.equal(first.text, 'how to tell the time');
  assert.equal(first.topicId, null);
  assert.equal(store.logRequest(sid, '   '), null, 'empty text is not logged');
  assert.equal(store.logRequest(sid, 'x'.repeat(500)).text.length, store.REQUEST_TEXT_LEN);

  assert.equal(store.setRequestTopic(sid, first.id, 'time-hours'), true);
  assert.equal(store.setRequestTopic(sid, first.id, 'time-hours'), false, 'no change, no save');
  assert.equal(store.setRequestTopic(sid, 'missing', 'time-hours'), false);
  assert.equal(store.requestsFor(sid).find((r) => r.id === first.id).topicId, 'time-hours');
  assert.deepEqual(store.requestsFor('someone-else'), [], 'other learners see nothing');

  store.requestsFor(sid)[0].text = 'mutated';
  assert.notEqual(store.requestsFor(sid)[0].text, 'mutated', 'callers get a copy');

  for (let i = 0; i < store.REQUEST_LOG_MAX + 10; i++) store.logRequest(sid, `request ${i}`);
  const log = store.requestsFor(sid);
  assert.equal(log.length, store.REQUEST_LOG_MAX);
  assert.ok(log.every((r, i) => i === 0 || log[i - 1].createdAt >= r.createdAt), 'newest first');
  assert.ok(!log.some((r) => r.id === first.id), 'the oldest fall off');
});

test('bad request log entries read as nothing', async () => {
  const store = await import('../src/js/store.js');
  store.get().requests['s-bad'] = [null, 'text', { id: 1, text: 'a', createdAt: 1 }, { id: 'r1', text: '', createdAt: 1 },
    { id: 'r2', text: 'no date' }, { id: 'r3', text: 'ok', createdAt: 5, topicId: 7 }, { id: 'r3', text: 'dupe', createdAt: 6 }];
  assert.deepEqual(store.requestsFor('s-bad'), [{ id: 'r3', text: 'ok', createdAt: 5, topicId: null }]);
  for (const bad of [null, {}, 'x', 3]) {
    store.get().requests['s-bad'] = bad;
    assert.deepEqual(store.requestsFor('s-bad'), []);
  }
  assert.equal(store.inspectImport({ students: [{ id: 's1', name: 'Sample Nine' }], requests: [] }).ok, false, 'the section must be an object');
  assert.equal(store.inspectImport({ students: [{ id: 's1', name: 'Sample Nine' }], requests: { s1: null } }).ok, true);
});
