#!/usr/bin/env node
// Builds "See how it works" figure pages (HAR-34) from their sources: for
// every tools/figures/<topicId>.js, src/figures/<topicId>.html = a page shell
// + the figure engine (src/js/figures/engine.js, below its "---- engine ----"
// line) + the figure script, all inline, so the page loads nothing else. The
// source's first two lines give the page's title and hint:
//   // title: Toy cart
//   // hint: Push the cart, pull it back, then load it up and push again.
// A page may also be supplied without a source; it must meet the same
// contract (src/js/figures/contract.js, docs/FIGURES.md).
// Usage: node scripts/build-figures.mjs [--check] [topicId ...]
//   --check  writes nothing; exits 1 when a built page is stale or any page
//            in src/figures/ breaks the contract
//   topicId  builds only those figures (while writing one)
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ENGINE_NOTICE, figureProblems } from '../src/js/figures/contract.js';

const root = new URL('..', import.meta.url);
const ENGINE_MARK = '// ---- engine ----';

const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function engineSource() {
  const text = await readFile(new URL('src/js/figures/engine.js', root), 'utf8');
  const at = text.indexOf(ENGINE_MARK);
  if (at === -1) throw new Error(`src/js/figures/engine.js has no "${ENGINE_MARK}" line`);
  return text.slice(at);
}

// The ids that have a source in tools/figures/.
export async function sourceIds() {
  return (await readdir(new URL('tools/figures/', root)))
    .filter((name) => name.endsWith('.js'))
    .map((name) => name.slice(0, -3))
    .sort();
}

export async function buildFigure(id, engine) {
  const script = await readFile(new URL(`tools/figures/${id}.js`, root), 'utf8');
  const title = /^\/\/ title: (.+)$/m.exec(script)?.[1]?.trim();
  const hint = /^\/\/ hint: (.+)$/m.exec(script)?.[1]?.trim();
  if (!title || !hint) throw new Error(`tools/figures/${id}.js needs "// title: …" and "// hint: …" lines at the top`);
  for (const [name, code] of [['engine', engine], [`tools/figures/${id}.js`, script]]) {
    if (/<\/script/i.test(code)) throw new Error(`${name} contains "</script" and cannot be inlined`);
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escText(title)}</title>
<meta name="description" content="${escText(hint)}">
</head>
<body>
<script>
${ENGINE_NOTICE}
${engine.trimEnd()}
</script>
<script>
${script.trimEnd()}
</script>
</body>
</html>
`;
}

export async function buildAll({ check = false, ids = null } = {}) {
  const engine = await engineSource();
  const problems = [];
  for (const id of ids || await sourceIds()) {
    const html = await buildFigure(id, engine);
    const target = new URL(`src/figures/${id}.html`, root);
    if (check) {
      const current = await readFile(target, 'utf8').catch(() => null);
      if (current !== html) problems.push(`src/figures/${id}.html is ${current == null ? 'missing' : 'out of date'}: run npm run build:figures`);
    } else {
      await writeFile(target, html);
    }
  }
  for (const name of await readdir(new URL('src/figures/', root))) {
    for (const p of figureProblems(name, await readFile(new URL(`src/figures/${name}`, root), 'utf8'))) problems.push(`src/figures/${name}: ${p}`);
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const named = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const problems = await buildAll({ check, ids: named.length ? named : null });
  for (const p of problems) console.error(p);
  if (problems.length) process.exit(1);
  console.log(check ? 'Figures are up to date and meet the contract.' : 'Built the figures into src/figures/.');
}
