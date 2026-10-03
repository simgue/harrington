// User-facing copy describes only what works today (HAR-12). A promise that
// something will be fixed later goes stale once it ships, as the HAR-19
// privacy line did, so no shipped string may carry one.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const repoRoot = new URL('..', import.meta.url);

async function files(dir, prefix) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...await files(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`));
    else if (/\.(js|md|html)$/.test(entry.name)) out.push(`${prefix}${entry.name}`);
  }
  return out;
}

test('no user-facing string promises a later fix', async () => {
  const paths = [...await files(new URL('src/js/', repoRoot), 'src/js/'), ...await files(new URL('src/docs/', repoRoot), 'src/docs/')];
  assert.ok(paths.includes('src/js/views/guide.js') && paths.includes('src/docs/GUIDE.md'));
  for (const path of paths) {
    const text = await readFile(new URL(path, repoRoot), 'utf8');
    assert.doesNotMatch(text, /until\s+(that|this|it)\s+is\s+fixed/i, `${path} promises a later fix`);
  }
});

const read = (path) => readFile(new URL(path, repoRoot), 'utf8');
// Markdown wraps lines; compare prose with every run of whitespace as one space.
const prose = async (path) => (await read(path)).replace(/\s+/g, ' ');
const PRIVACY_DOCS = ['README.md', 'SECURITY.md', 'src/docs/GUIDE.md', 'src/js/views/guide.js'];

test('Insights hints point at routes that exist, not the removed timeline', async () => {
  const insights = await read('src/js/views/insights.js');
  assert.doesNotMatch(insights, /timeline/i);
  assert.match(insights, /Pass the topic and section checks on the topic pages first\./);
  assert.match(insights, /mark some topics mastered from the map or a topic page/);
});

test('every privacy document lists each request that sends topic text', async () => {
  for (const path of PRIVACY_DOCS) {
    const text = (await prose(path)).toLowerCase();
    for (const kind of ['lessons', 'printables', 'activities', 'explain simply', 'mini-quizzes', 'recall cards', 'tests', 'challenges']) {
      assert.ok(text.includes(kind), `${path} omits ${kind}`);
    }
  }
});

test('privacy documents agree with ai.js on ages, the excelling flag and nicknames', async () => {
  for (const path of PRIVACY_DOCS) {
    const text = await prose(path);
    // A linked analysis sends the topic's age and the exact age, not one "instead" of the other.
    assert.doesNotMatch(text, /exact age instead/, `${path} says "instead"`);
    assert.match(text, /alongside (the|a) linked topic['’]s age/, `${path} omits the linked topic's age`);
    assert.match(text, /excelling/, `${path} omits the adaptive excelling flag`);
    assert.match(text, /a nickname, especially one that is an ordinary word/, `${path} drops the nickname caveat`);
    assert.match(text, /[Rr]ecord titles/, `${path} omits that record titles stay home`);
  }
  const ai = await read('src/js/ai.js');
  assert.match(ai, /This child is excelling here/, 'the flag the documents describe is still sent');
  assert.doesNotMatch(ai, /interests/i, 'interests never reach a prompt');
});

test('the HAR-19 behavior itself is in the changelog, not only the copy fix', async () => {
  const changelog = await prose('CHANGELOG.md');
  assert.match(changelog, /Learner names and parent notes no longer reach the AI provider\..*\(HAR-19\)/);
});

test('SECURITY.md and the guides keep lines within 80 columns', async () => {
  for (const path of ['SECURITY.md', 'src/docs/GUIDE.md']) {
    for (const [i, line] of (await read(path)).split('\n').entries()) {
      // A lone link that cannot be broken is allowed to run over.
      if (/^\s*\S+$/.test(line)) continue;
      assert.ok(line.length <= 80, `${path}:${i + 1} is ${line.length} columns`);
    }
  }
});

test('CONTRIBUTING no longer says AI is disabled until self-hosted adapters exist', async () => {
  assert.doesNotMatch(await prose('CONTRIBUTING.md'), /disabled until|self-hosted adapters?/i);
});

test('counts in the views agree with their number ("1 topic", never "1 topics")', async () => {
  const { countOf } = await import('../src/js/ui.js');
  assert.equal(countOf(1, 'topic'), '1 topic');
  assert.equal(countOf(0, 'topic'), '0 topics');
  assert.equal(countOf(12, 'point'), '12 points');
  assert.equal(countOf('1', 'topic'), '1 topic');
  assert.equal(countOf(2, 'child', 'children'), '2 children');
  const pinned = {
    'src/js/views/topic.js': ["(${countOf(sec.topics.length, 'topic')})", "${stats.mastered}/${countOf(stats.total, 'topic')}"],
    'src/js/views/masterytest.js': [
      "${secStats.mastered} of ${countOf(secStats.total, 'topic')} in this section marked mastered.",
      "${stats.mastered} of ${countOf(stats.total, 'topic')} marked mastered (${stats.pct}%).",
      "${graded.earned} of ${countOf(graded.total, 'point')}",
    ],
    'src/js/views/dashboard.js': ["${stats.totalMastered} of ${countOf(stats.total, 'topic')} mastered"],
  };
  for (const [path, phrases] of Object.entries(pinned)) {
    const text = await read(path);
    for (const phrase of phrases) assert.ok(text.includes(phrase), `${path} lost: ${phrase}`);
    assert.doesNotMatch(text, /\$\{[^}]*(total|length)\} (topics|points)\b/, `${path} has an unpluralized count`);
  }
});
