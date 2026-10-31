// A subject the taxonomy adds before Harrington knows it (Geography did, in
// the 2026-10-24 revision) must never make its topics vanish.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SUBJECTS, orderedSubjects, subjectMeta } from '../src/js/data.js';
import { buildCurriculumTree } from '../src/js/graph.js';
import { planTrack } from '../src/js/scheduler.js';

const topic = (id, subject, age = 6) => ({ id, name: id, subject, domain: 'D', ageRangeStart: age });

test('Geography is a known subject with its own colour and icon', () => {
  assert.deepEqual(SUBJECTS.Geography, { color: '#9a5221', icon: 'earth' });
  const colors = Object.values(SUBJECTS).map((m) => m.color);
  assert.equal(new Set(colors).size, colors.length, 'every subject has its own colour');
});

test('an unknown subject gets a neutral colour and icon and one console warning', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const meta = subjectMeta('Astronomy');
  assert.deepEqual({ ...meta }, { color: '#6f665a', icon: 'shapes' });
  subjectMeta('Astronomy');
  subjectMeta('Mathematics');
  assert.equal(warn.mock.callCount(), 1);
  assert.match(warn.mock.calls[0].arguments[0], /no colour or icon for the subject "Astronomy"/);
  // Not a prototype key either.
  t.mock.method(console, 'warn', () => {});
  assert.equal(subjectMeta('constructor').color, '#6f665a');
});

test('orderedSubjects keeps SUBJECTS order, then new subjects alphabetically, and skips empty ones', () => {
  const by = { Zoology: [topic('z', 'Zoology')], Geography: [topic('g', 'Geography')], Astronomy: [topic('a', 'Astronomy')], English: [topic('e', 'English')], Mathematics: [topic('m', 'Mathematics')], History: [] };
  assert.deepEqual(orderedSubjects(by), ['Mathematics', 'English', 'Geography', 'Astronomy', 'Zoology']);
});

test('the curriculum tree keeps a subject it has no colour for', () => {
  const tree = buildCurriculumTree({ bySubject: { Mathematics: [topic('m', 'Mathematics')], Astronomy: [topic('a', 'Astronomy')] }, clusterMap: {} });
  assert.deepEqual(tree.map((n) => n.subject), ['Mathematics', 'Astronomy']);
  assert.equal(tree[1].topics.length, 1);
});

test('the calendar track schedules topics in an unknown subject', () => {
  const topics = [topic('m1', 'Mathematics'), topic('a1', 'Astronomy'), topic('g1', 'Geography')];
  const plan = planTrack(topics, { startKey: '2026-10-07', age: 6 });
  assert.deepEqual([...plan.topicDate.keys()].sort(), ['a1', 'g1', 'm1']);
});

test('no subject is not an unknown one: no warning', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  for (const empty of [null, undefined, '']) assert.equal(subjectMeta(empty).color, '#6f665a');
  assert.equal(warn.mock.callCount(), 0);
});

test('views keep their own look for an item with no subject', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = (f) => readFile(new URL(`../src/js/views/${f}`, import.meta.url), 'utf8');
  assert.match(await src('recordings.js'), /g\.subject \? subjectMeta\(g\.subject\) : \{ color: '#6f665a', icon: 'folder' \}/);
  assert.match(await src('practice.js'), /item\.subject \? subjectMeta\(item\.subject\) : SUBJECTS\.Mathematics/);
  assert.match(await src('calendar.js'), /x\.subject \? subjectMeta\(x\.subject\) : \{ color: '#6f665a', icon: 'plus' \}/);
});

test('the world map gives each unknown subject its own spot', async () => {
  const { buildWorldMap } = await import('../src/js/graph.js');
  const node = (subject) => ({ subject, topics: [], domains: [{ domain: 'D', topics: [] }] });
  const scene = buildWorldMap(['Mathematics', 'Astronomy', 'Zoology', 'Geography'].map(node));
  const at = Object.fromEntries(scene.realms.map((r) => [r.subject, `${r.cx},${r.cy}`]));
  assert.notEqual(at.Astronomy, at.Zoology);
  assert.equal(new Set(Object.values(at)).size, 4);
});
