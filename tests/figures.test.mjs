// The "See how it works" figures (HAR-34). The pages under src/figures/ run in
// a child's browser, so they must stay self-contained and carry no link,
// product name or credit line; they must match their sources; and the engine
// must keep its MIT notice. Behavior (pressing buttons, no console errors, the
// iframe on the topic page and in the child view) is in tests/e2e/figures.spec.mjs.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { FIGURES, figureFor } from '../src/js/figures/index.js';
import { MAX_FIGURE_BYTES, buildAll } from '../scripts/build-figures.mjs';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

async function filesUnder(dir) {
  const out = [];
  for (const entry of await readdir(new URL(dir, root), { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...await filesUnder(`${dir}${entry.name}/`));
    else out.push(`${dir}${entry.name}`);
  }
  return out;
}

test('no file under src/figures/ has a URL, a product name, a credit line or an external script', async () => {
  const files = await filesUnder('src/figures/');
  assert.ok(files.length >= 8, `expected the figure pages, found ${files.length}`);
  for (const file of files) {
    const text = await read(file);
    assert.doesNotMatch(text, /https?:\/\//i, `${file} has a URL`);
    assert.doesNotMatch(text, /colorfigures/i, `${file} names Colorfigures`);
    assert.doesNotMatch(text, /april-zhu/i, `${file} names april-zhu`);
    assert.doesNotMatch(text, /made with/i, `${file} has a "Made with" credit`);
    assert.doesNotMatch(text, /<script[^>]*\ssrc\s*=/i, `${file} loads a script`);
  }
});

test('the guard catches each forbidden string', () => {
  // The same patterns as above, so a loosened regex shows up here.
  const bad = ['<a href="https://example.org">', 'http://x', 'Colorfigures', 'april-zhu.com', 'Made with love', '<script src="core.js">', "<script type=module src='x.js'>"];
  const patterns = [/https?:\/\//i, /colorfigures/i, /april-zhu/i, /made with/i, /<script[^>]*\ssrc\s*=/i];
  for (const text of bad) assert.ok(patterns.some((p) => p.test(text)), text);
});

test('every listed figure has a source and an up-to-date page under the size limit, and nothing else is in src/figures/', async () => {
  const ids = Object.keys(FIGURES);
  assert.ok(ids.length >= 8 && ids.length <= 12, `8 to 12 figures, found ${ids.length}`);
  for (const id of ids) {
    assert.match(id, /^mt_[\w-]+$/, `${id} looks like a taxonomy topic id`);
    await read(`tools/figures/${id}.js`);
    const page = await read(`src/figures/${id}.html`);
    assert.ok(Buffer.byteLength(page) < MAX_FIGURE_BYTES, `${id}.html is under 100 KB`);
  }
  // Pages built from other sources (or edited by hand) fail here: run `npm run build:figures`.
  assert.deepEqual(await buildAll({ check: true }), []);
});

test('every figure has a title, a one-line hint and 3 to 6 short capital labels', async () => {
  for (const [id, meta] of Object.entries(FIGURES)) {
    assert.ok(meta.title && meta.title.length <= 40, `${id} title`);
    assert.ok(meta.hint && meta.hint.length <= 90 && !meta.hint.includes('\n'), `${id} hint`);
    const source = await read(`tools/figures/${id}.js`);
    // tag(point, dx, dy, 'TEXT', on): labels are written as string literals so they can be checked here
    const labels = new Set([...source.matchAll(/\btag\([^;]*?,\s*'([^']+)'\s*[,)]/g)].map((m) => m[1]));
    assert.ok(labels.size >= 3 && labels.size <= 6, `${id} has ${labels.size} labels: ${[...labels].join(', ')}`);
    for (const label of labels) {
      assert.match(label, /^[A-Z][A-Z ]{1,15}$/, `${id} label "${label}" is one or two capital words`);
      assert.ok(label.split(' ').length <= 2, `${id} label "${label}" is one or two words`);
    }
  }
});

test('figureFor gives the page path for a topic with a figure and null otherwise', () => {
  const [id] = Object.keys(FIGURES);
  assert.deepEqual(figureFor(id), { id, ...FIGURES[id], src: `figures/${id}.html` });
  assert.equal(figureFor('mt_none'), null);
  assert.equal(figureFor(undefined), null);
  assert.equal(figureFor('hasOwnProperty'), null);
});

test('the engine keeps its MIT notice and every page points to it', async () => {
  const engine = await read('src/js/figures/engine.js');
  assert.match(engine, /MIT License/);
  assert.match(engine, /Permission is hereby granted, free of charge/);
  assert.match(engine, /Copyright \(c\) 2026 Tolga Cohce/);
  for (const id of Object.keys(FIGURES)) {
    const page = await read(`src/figures/${id}.html`);
    assert.match(page, /MIT License\. Copyright \(c\) 2026 April Zhu; Copyright \(c\) 2026 Tolga Cohce/, `${id} notice`);
  }
});
