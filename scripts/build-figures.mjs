#!/usr/bin/env node
// Builds the "See how it works" figure pages (HAR-34): for every topic in
// src/js/figures/index.js, src/figures/<topicId>.html = a page shell + the
// figure engine (src/js/figures/engine.js, below its "---- engine ----" line)
// + the figure script tools/figures/<topicId>.js, all inline, so the page
// loads nothing else. docs/FIGURES.md explains how to write a figure.
// Usage: node scripts/build-figures.mjs [--check] [topicId ...]
//   --check  writes nothing; exits 1 when a page is missing or out of date
//   topicId  builds only those figures (while writing one)
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { FIGURES } from '../src/js/figures/index.js';

const root = new URL('..', import.meta.url);
export const MAX_FIGURE_BYTES = 100 * 1024;
const ENGINE_MARK = '// ---- engine ----';

// The built pages carry a pointer to the engine's MIT notice rather than the
// notice itself: no product name, credit line or address appears in a figure.
const NOTICE = '/* Harrington figure engine (src/js/figures/engine.js). MIT License. Copyright (c) 2026 April Zhu;'
  + ' Copyright (c) 2026 Tolga Cohce. The full notice is in src/js/figures/engine.js and NOTICE. */';

const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function engineSource() {
  const text = await readFile(new URL('src/js/figures/engine.js', root), 'utf8');
  const at = text.indexOf(ENGINE_MARK);
  if (at === -1) throw new Error(`src/js/figures/engine.js has no "${ENGINE_MARK}" line`);
  return text.slice(at);
}

export async function buildFigure(id, engine) {
  const meta = FIGURES[id];
  if (!meta) throw new Error(`${id} is not in src/js/figures/index.js`);
  const script = await readFile(new URL(`tools/figures/${id}.js`, root), 'utf8');
  for (const [name, code] of [['engine', engine], [`tools/figures/${id}.js`, script]]) {
    if (/<\/script/i.test(code)) throw new Error(`${name} contains "</script" and cannot be inlined`);
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escText(meta.title)}</title>
</head>
<body>
<script>
${NOTICE}
${engine.trimEnd()}
</script>
<script>
${script.trimEnd()}
</script>
</body>
</html>
`;
}

export async function buildAll({ check = false, ids = Object.keys(FIGURES) } = {}) {
  const engine = await engineSource();
  const problems = [];
  for (const id of ids) {
    const html = await buildFigure(id, engine);
    const bytes = Buffer.byteLength(html);
    if (bytes > MAX_FIGURE_BYTES) problems.push(`${id}.html is ${bytes} bytes (limit ${MAX_FIGURE_BYTES})`);
    const target = new URL(`src/figures/${id}.html`, root);
    if (check) {
      const current = await readFile(target, 'utf8').catch(() => null);
      if (current !== html) problems.push(`src/figures/${id}.html is ${current == null ? 'missing' : 'out of date'}`);
    } else {
      await writeFile(target, html);
    }
  }
  // A page with no topic in the list would be served but never shown.
  for (const name of await readdir(new URL('src/figures/', root))) {
    if (!FIGURES[name.replace(/\.html$/, '')]) problems.push(`src/figures/${name} has no entry in src/js/figures/index.js`);
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const named = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const ids = named.length ? named : Object.keys(FIGURES);
  const problems = await buildAll({ check, ids });
  for (const p of problems) console.error(p);
  if (problems.length) process.exit(1);
  console.log(check ? 'Figures are up to date.' : `Built ${ids.length} figure${ids.length === 1 ? '' : 's'} into src/figures/.`);
}
