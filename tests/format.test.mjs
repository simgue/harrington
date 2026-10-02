import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { formatCount } from '../src/js/format.js';

test('formatCount groups digits for the locale', () => {
  assert.equal(formatCount(1590, 'en-US'), '1,590');
  assert.equal(formatCount(0, 'en-US'), '0');
  assert.equal(formatCount(999, 'en-US'), '999');
  assert.equal(formatCount(1234567, 'en-US'), '1,234,567');
  assert.equal(formatCount(1590, 'de-DE'), '1.590');
  assert.equal(formatCount(1590), new Intl.NumberFormat().format(1590));
  assert.equal(formatCount('42', 'en-US'), '42');
  assert.equal(formatCount(undefined, 'en-US'), '0');
  assert.equal(formatCount(NaN, 'en-US'), '0');
});

test('counts on the dashboard, map and curriculum notice go through formatCount', async () => {
  for (const path of ['src/js/views/dashboard.js', 'src/js/views/graph.js', 'src/js/curriculum-sync.js']) {
    const code = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(code, /import \{ formatCount \} from '\.\.?\/format\.js'/, path);
    assert.doesNotMatch(code, /\.toLocaleString\(\)/, `${path} formats a count by hand`);
  }
});
