#!/usr/bin/env node
// Dead-code report for src/js: modules the app never loads, named exports no
// other module imports, imports never referenced, and calls to an exported
// function the calling module forgot to import. Tests and scripts count as
// importers; exports only tests import are listed for information.
// Usage: node scripts/dead-code.mjs   (exit code 1 when anything is found)
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function walk(dir, exts) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path, exts));
    else if (exts.some((ext) => entry.name.endsWith(ext))) out.push(path);
  }
  return out;
}

const stripComments = (code) => code
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

function parseImports(code, file) {
  const imports = [];
  const re = /^[ \t]*import\s+([\w$*{}\s,]+?)\s+from\s+['"]([^'"]+)['"]\s*;?/gm;
  let match;
  while ((match = re.exec(code))) {
    const [statement, clause, spec] = match;
    if (!spec.startsWith('.')) continue;
    const target = resolve(dirname(file), spec);
    const bindings = [];
    const ns = clause.match(/\*\s+as\s+(\w+)/);
    if (ns) bindings.push({ imported: '*', local: ns[1] });
    const named = clause.match(/\{([\s\S]*?)\}/);
    if (named) {
      for (const part of named[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        const [imported, local = imported] = part.split(/\s+as\s+/).map((s) => s.trim());
        bindings.push({ imported, local });
      }
    }
    const def = clause.match(/^(\w+)\s*(,|$)/);
    if (def) bindings.push({ imported: 'default', local: def[1] });
    imports.push({ statement, target, bindings });
  }
  // `const ns = await import('./x.js')`, `const { a, b } = await import(...)`,
  // `import('./x.js').then(m => m.a)`.
  const dyn = /(?:(\{[\w$\s,:]*\}|[\w$]+)\s*=\s*await\s+)?import\(\s*['"]([^'"]+)['"]\s*\)(?:\.then\(\s*\(?(\w+)\)?\s*=>)?/g;
  while ((match = dyn.exec(code))) {
    const [, lhs, spec, thenParam] = match;
    if (!spec.startsWith('.')) continue;
    const target = resolve(dirname(file), spec);
    const bindings = [];
    if (lhs?.startsWith('{')) {
      for (const part of lhs.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean)) {
        const [imported, local = imported] = part.split(/\s*:\s*/).map((s) => s.trim());
        bindings.push({ imported, local });
      }
    } else bindings.push({ imported: '*', local: lhs || thenParam || null });
    imports.push({ statement: '', target, bindings });
  }
  return imports;
}

function parseExports(code) {
  const names = new Set();
  for (const m of code.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+(\w+)/g)) names.add(m[1]);
  for (const m of code.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',').map((s) => s.trim()).filter(Boolean)) names.add(part.split(/\s+as\s+/).pop().trim());
  }
  return [...names];
}

const srcFiles = await walk(join(root, 'src/js'), ['.js']);
const consumerFiles = [
  ...srcFiles,
  ...await walk(join(root, 'tests'), ['.mjs', '.js']),
  ...await walk(join(root, 'scripts'), ['.mjs', '.js']),
  join(root, 'server.mjs'),
];
// An identifier reference: not a property access (`a.name`), but a spread
// (`...name`) counts.
const ref = (name, flags = '') => new RegExp(`(?<![\\w$])(?<!(?:^|[^.])\\.)${name}\\b`, flags);

// Kept on purpose: the fail-closed Commune stub that tests/isolation.test.mjs
// asserts on, so a future Commune view cannot quietly reach a remote service.
const KEEP = new Set(['src/js/coop.js']);
// Exports kept with no importer: ai-status.js's helper list is asserted on by
// tests/ai-status-imports.test.mjs (the calendar gateAi hotfix).
const KEEP_EXPORTS = new Set(['src/js/ai-status.js: AI_HELP_HREF']);

const sources = new Map();
for (const file of consumerFiles) sources.set(file, stripComments(await readFile(file, 'utf8')));

// Who uses each export: `${target}#${name}` -> Set of consumer files.
const usage = new Map();
const note = (target, name, by) => {
  const key = `${target}#${name}`;
  if (!usage.has(key)) usage.set(key, new Set());
  usage.get(key).add(by);
};
const unusedImports = [];
for (const [file, code] of sources) {
  const imports = parseImports(code, file);
  let body = code;
  for (const { statement } of imports) if (statement) body = body.replace(statement, ' ');
  for (const { target, bindings } of imports) {
    for (const { imported, local } of bindings) {
      if (imported === '*') {
        if (!local) { note(target, '*', file); continue; }
        const accesses = [...body.matchAll(new RegExp(`${ref(local).source}\\??\\.(\\w+)`, 'g'))].map((m) => m[1]);
        for (const m of body.matchAll(new RegExp(`\\{([\\w$\\s,:]*)\\}\\s*=\\s*${local}\\b`, 'g'))) {
          accesses.push(...m[1].split(',').map((s) => s.split(':')[0].trim()).filter(Boolean));
        }
        for (const name of accesses) note(target, name, file);
        if (srcFiles.includes(file) && !accesses.length && !ref(local).test(body)) {
          unusedImports.push(`${relative(root, file)}: * as ${local}`);
        }
        continue;
      }
      note(target, imported, file);
      if (srcFiles.includes(file) && !ref(local).test(body)) {
        unusedImports.push(`${relative(root, file)}: ${local}`);
      }
    }
  }
}

const isTest = (file) => relative(root, file).startsWith('tests/');
const unusedExports = [];
const testOnlyExports = [];
for (const file of srcFiles.filter((f) => !KEEP.has(relative(root, f)))) {
  for (const name of parseExports(sources.get(file))) {
    const users = [...(usage.get(`${file}#${name}`) || [])].filter((f) => f !== file);
    const label = `${relative(root, file)}: ${name}`;
    const localUses = (sources.get(file).match(ref(name, 'g')) || []).length;
    const inside = localUses > 1 ? ' (used inside its module)' : '';
    if (KEEP_EXPORTS.has(label)) continue;
    if (!users.length) unusedExports.push(label + inside);
    else if (users.every(isTest)) testOnlyExports.push(`${label}${inside} (${users.map((f) => relative(root, f)).join(', ')})`);
  }
}

// Modules the page never loads, following imports from its entry point.
const reachable = new Set();
const visit = (file) => {
  if (reachable.has(file) || !sources.has(file)) return;
  reachable.add(file);
  for (const { target } of parseImports(sources.get(file), file)) visit(target);
};
visit(join(root, 'src/js/app.js'));
const unreachable = srcFiles.filter((file) => !reachable.has(file) && !KEEP.has(relative(root, file))).map((file) => relative(root, file));

// The reverse mistake: a call to another module's exported function that this
// module neither imports nor declares (a pruned import whose call survived).
const exportedFunctions = new Set();
for (const file of srcFiles) {
  for (const m of sources.get(file).matchAll(/export\s+(?:async\s+)?function\*?\s+(\w+)/g)) exportedFunctions.add(m[1]);
}
const missingImports = [];
for (const file of srcFiles) {
  const code = sources.get(file);
  const bound = new Set(parseImports(code, file).flatMap(({ bindings }) => bindings.map((b) => b.local)));
  for (const name of exportedFunctions) {
    if (bound.has(name) || !ref(`${name}\\s*\\(`).test(code)) continue;
    const declared = new RegExp(`(?:function\\*?|const|let|var|class)\\s+${name}\\b|[{,(]\\s*${name}\\s*[,})=]`).test(code);
    if (!declared) missingImports.push(`${relative(root, file)}: ${name}`);
  }
}

const section = (title, items) => console.log(`${title} (${items.length})${items.map((i) => `\n  ${i}`).join('')}`);
section('Unreachable modules from src/js/app.js', unreachable);
section('Exports with no importer', unusedExports);
section('Exports imported only by tests (informational)', testOnlyExports);
section('Imports never referenced', unusedImports);
section('Calls to an exported function that is not imported', missingImports);
process.exitCode = unreachable.length + unusedExports.length + unusedImports.length + missingImports.length ? 1 : 0;
