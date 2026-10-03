import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { countLabel, formatCount } from '../src/js/format.js';

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('formatCount groups digits the American way', () => {
  assert.equal(formatCount(1590), '1,590');
  assert.equal(formatCount(0), '0');
  assert.equal(formatCount(999), '999');
  assert.equal(formatCount(1234567), '1,234,567');
  assert.equal(formatCount('42'), '42');
  assert.equal(formatCount(undefined), '0');
  assert.equal(formatCount(NaN), '0');
});

test('countLabel picks the English singular or plural', () => {
  assert.equal(countLabel(0, 'domain'), '0 domains');
  assert.equal(countLabel(1, 'domain'), '1 domain');
  assert.equal(countLabel(2, 'domain'), '2 domains');
  assert.equal(countLabel(1590, 'topic'), '1,590 topics');
  assert.equal(countLabel(1, 'required skill'), '1 required skill');
  assert.equal(countLabel(1, 'child', 'children'), '1 child');
  assert.equal(countLabel(3, 'child', 'children'), '3 children');
  assert.equal(countLabel(undefined, 'record'), '0 records');
});

test('counts are not grouped for the browser locale', async () => {
  const code = await source('src/js/format.js');
  assert.match(code, /new Intl\.NumberFormat\(LOCALE/);
  assert.match(code, /new Intl\.PluralRules\(LOCALE\)/);
  assert.match(code, /const LOCALE = 'en-US';/);
});

test('counts on the dashboard, map, topic page and curriculum notice go through format.js', async () => {
  for (const path of ['src/js/views/dashboard.js', 'src/js/views/graph.js', 'src/js/views/topic.js', 'src/js/curriculum-sync.js', 'src/js/views/recordings.js', 'src/js/views/shell.js']) {
    const code = await source(path);
    assert.match(code, /import \{ [^}]*countLabel[^}]* \} from '\.\.?\/format\.js'/, path);
    // shell.js prints a date with toLocaleString(); everywhere else it was a count.
    if (!path.endsWith('shell.js')) assert.doesNotMatch(code, /\.toLocaleString\(\)/, `${path} formats a count by hand`);
  }
  // The plural sites fixed for F15 do not come back as hand-rolled plurals.
  const graph = await source('src/js/views/graph.js');
  assert.doesNotMatch(graph, /\$\{realm\.domainCount\} domains/);
  assert.doesNotMatch(graph, /domains\.length\} domains/);
  assert.doesNotMatch(graph, /required skill\$\{/);
  assert.doesNotMatch(graph, /age band\$\{/);
  assert.doesNotMatch(await source('src/js/views/topic.js'), /\.length\} topics/);
  assert.doesNotMatch(await source('src/js/views/dashboard.js'), /voice recording\$\{|badge\$\{/);
  assert.doesNotMatch(await source('src/js/views/recordings.js'), /recording\$\{|group\$\{/);
  assert.doesNotMatch(await source('src/js/views/shell.js'), /const plural = /);
});
