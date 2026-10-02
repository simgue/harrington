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
    assert.doesNotMatch(text, /until (that|this|it) is fixed/i, `${path} promises a later fix`);
  }
});
