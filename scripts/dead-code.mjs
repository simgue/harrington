#!/usr/bin/env node
// Dead-code report for src/js: modules the app never loads, named exports no
// other module imports, imports never referenced, and uses of another
// module's named export that the module forgot to import (heuristic: string
// and template text are blanked, local declarations and parameters excluded).
// Namespace imports (`import * as store from './store.js'`) are tracked too:
// a member use such as `store.x` needs a namespace import named `store` in
// that module (a removed import whose uses survived), the member must be one
// the target exports, and a namespace import with no member use in code is
// reported as unused unless the bare name is passed around as a value.
// Tests and scripts count as importers; exports only tests import are listed
// for information.
// Usage: node scripts/dead-code.mjs [--root <dir>]   (exit code 1 when anything
// is found; --root points at another checkout, for the fixture tests)
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootArg = process.argv.indexOf('--root');
const root = rootArg === -1
  ? resolve(dirname(fileURLToPath(import.meta.url)), '..')
  : resolve(process.argv[rootArg + 1]);

async function walk(dir, exts) {
  const out = [];
  if (!existsSync(dir)) return out;
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
  ...[join(root, 'server.mjs')].filter((file) => existsSync(file)),
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
        // In code only, so a namespace named in a string or template text
        // does not count as a use. A bare value use (`fn(store)`) does.
        if (srcFiles.includes(file) && !namespaceMembers(codeOnly(body), local).length
          && !new RegExp(`${ref(local).source}(?!\\s*\\??\\.)`).test(codeOnly(body))) {
          unusedImports.push(`${relative(root, file)}: * as ${local} (no member use)`);
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

// Members read off a namespace: `ns.a`, `ns?.a`, and `const { a, b: c } = ns`.
function namespaceMembers(code, local) {
  const members = [...code.matchAll(new RegExp(`${ref(local).source}\\s*\\??\\.\\s*([\\w$]+)`, 'g'))].map((m) => m[1]);
  for (const m of code.matchAll(new RegExp(`\\{([\\w$\\s,:]*)\\}\\s*=\\s*${local}\\b`, 'g'))) {
    members.push(...m[1].split(',').map((s) => s.split(':')[0].trim()).filter(Boolean));
  }
  return members;
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

// The reverse mistake: a reference to another module's named export that this
// module neither imports nor declares (a pruned import whose use survived).
// String and template text are blanked first so prose cannot match.
function codeOnly(code) {
  let out = '';
  const stack = [];
  for (let i = 0; i < code.length; i += 1) {
    const ch = code[i];
    const top = stack[stack.length - 1];
    if (top === "'" || top === '"') {
      if (ch === '\\') { out += '  '; i += 1; continue; }
      if (ch === top) stack.pop();
      out += ch === top ? ch : ' ';
    } else if (top === '`') {
      if (ch === '\\') { out += '  '; i += 1; continue; }
      if (ch === '`') { stack.pop(); out += ch; continue; }
      if (ch === '$' && code[i + 1] === '{') { stack.push('{'); out += '${'; i += 1; continue; }
      out += ch === '\n' ? '\n' : ' ';
    } else if (ch === '/' && /[(,=:[!&|?{};+\-*%<>~^]\s*$|^\s*$|\breturn\s*$/.test(out.slice(-40).split('\n').pop())) {
      // A regex literal: copy it through to its closing slash.
      let inClass = false;
      out += ch;
      for (i += 1; i < code.length; i += 1) {
        const c = code[i];
        out += c;
        if (c === '\\') { out += code[i + 1] || ''; i += 1; continue; }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) break;
        else if (c === '\n') break;
      }
    } else {
      if (ch === "'" || ch === '"' || ch === '`') stack.push(ch);
      else if (ch === '{') stack.push('{');
      else if (ch === '}' && top === '{') stack.pop();
      out += ch;
    }
  }
  return out;
}
// A local declaration, parameter or destructuring of `name` in `code`.
function declaredIn(code, name) {
  const n = `\\b${name}\\b`;
  return [
    `(?:function\\*?|const|let|var|class)\\s+${name}\\b`, // declaration
    `(?:const|let|var)\\s*[{[][^}\\]]*${n}[^}\\]]*[}\\]]\\s*=`, // destructuring
    `function\\s*\\w*\\s*\\((?:[^)]*,)?\\s*${name}\\s*(?:[,=][^)]*)?\\)`, // function parameter
    `\\((?:[^()]*,)?\\s*${name}\\s*(?:[,=][^()]*)?\\)\\s*=>`, // arrow parameters
    `(?<![\\w$.])${name}\\s*=>`, // single arrow parameter
    `catch\\s*\\(\\s*${name}\\s*\\)`,
    `function\\s*\\w*\\s*\\([^)]*\\{(?:[^}]*,)?\\s*${name}\\s*[,}=]`, // destructured parameter
    `\\([^()]*\\{(?:[^}]*,)?\\s*${name}\\s*[,}=][^()]*\\)\\s*=>`,
    `[{,(]\\s*${name}\\s*=(?![=>])`, // parameter or destructuring default
  ].some((pattern) => new RegExp(pattern).test(code));
}

const exportedNames = new Set(srcFiles.flatMap((file) => parseExports(sources.get(file))));
const missingImports = [];
for (const file of srcFiles) {
  const imports = parseImports(sources.get(file), file);
  const bound = new Set(imports.flatMap(({ bindings }) => bindings.map((b) => b.local)));
  let code = codeOnly(sources.get(file));
  for (const { statement } of imports) if (statement) code = code.replace(statement, ' ');
  // Declared here and exported (a bare `export { name }` re-export is not).
  const own = new Set([...sources.get(file).matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+(\w+)/g)].map((m) => m[1]));
  for (const name of exportedNames) {
    if (bound.has(name) || own.has(name)) continue;
    // A use: an identifier that is not an object key (`name:`) or a property.
    if (!new RegExp(`${ref(name).source}(?!\\s*:(?!:))`).test(code)) continue;
    const declared = declaredIn(code, name);
    if (!declared) missingImports.push(`${relative(root, file)}: ${name}`);
  }
}

// Namespace imports. Every name some module binds with `import * as name`
// is a namespace the others could reach for: `store.x` in a module with no
// `import * as store` (and no local `store`) is a removed import whose uses
// survived. A member the target does not export is the same mistake one step
// later (`store.renamedAway()`), so it is checked for every namespace binding.
const namespaces = new Map(); // local name -> Set of target files
for (const file of srcFiles) {
  for (const { statement, target, bindings } of parseImports(sources.get(file), file)) {
    for (const { imported, local } of bindings) {
      if (imported !== '*' || !local || !statement) continue;
      if (!namespaces.has(local)) namespaces.set(local, new Set());
      namespaces.get(local).add(target);
    }
  }
}
const relTargets = (targets) => [...targets].map((t) => relative(root, t)).join(' or ');
const missingNamespaces = [];
const unknownMembers = [];
for (const file of srcFiles) {
  const imports = parseImports(sources.get(file), file);
  const bound = new Set(imports.flatMap(({ bindings }) => bindings.map((b) => b.local)));
  const code = codeOnly(sources.get(file)).replace(/^[ \t]*import\s+[\w$*{}\s,]+?\s+from\s+['"][^'"]*['"]\s*;?/gm, ' ');
  for (const [name, targets] of namespaces) {
    if (bound.has(name)) continue;
    const members = [...new Set(namespaceMembers(code, name))];
    if (!members.length || declaredIn(code, name)) continue;
    missingNamespaces.push(`${relative(root, file)}: ${members.map((m) => `${name}.${m}`).join(', ')} (no \`import * as ${name}\` from ${relTargets(targets)})`);
  }
  for (const { target, bindings } of imports) {
    const targetCode = sources.get(target);
    // `export *` re-exports names this parser cannot see; skip those targets.
    if (!targetCode || /export\s*\*/.test(targetCode)) continue;
    const exported = new Set(parseExports(targetCode));
    for (const { imported, local } of bindings) {
      if (imported !== '*' || !local) continue;
      for (const member of new Set(namespaceMembers(code, local))) {
        if (!exported.has(member) && member !== 'default') {
          unknownMembers.push(`${relative(root, file)}: ${local}.${member} (${relative(root, target)} exports no ${member})`);
        }
      }
    }
  }
}

const section = (title, items) => console.log(`${title} (${items.length})${items.map((i) => `\n  ${i}`).join('')}`);
section('Unreachable modules from src/js/app.js', unreachable);
section('Exports with no importer', unusedExports);
section('Exports imported only by tests (informational)', testOnlyExports);
section('Imports never referenced', unusedImports);
section('Uses of another module\'s export that is not imported', missingImports);
section('Namespace member uses with no namespace import', missingNamespaces);
section('Namespace members the target module does not export', unknownMembers);
process.exitCode = [unreachable, unusedExports, unusedImports, missingImports, missingNamespaces, unknownMembers]
  .some((list) => list.length) ? 1 : 0;
