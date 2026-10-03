import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const script = fileURLToPath(new URL('../scripts/dead-code.mjs', import.meta.url));

// The script exits 1 when it finds anything, so read stdout either way.
async function run(args = []) {
  const result = await promisify(execFile)(process.execPath, [script, ...args]).catch((err) => err);
  return { stdout: result.stdout, code: result.code ?? 0 };
}

// The items listed under one section heading of the report.
function section(stdout, title) {
  const lines = stdout.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`${title} (`));
  assert.ok(start >= 0, `no "${title}" section in:\n${stdout}`);
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('  ')) break;
    items.push(line.trim());
  }
  return items;
}

test(`no module uses another module's export without importing it`, async () => {
  const { stdout } = await run();
  assert.match(stdout, /^Uses of another module's export that is not imported \(0\)$/m, stdout);
  assert.match(stdout, /^Unreachable modules from src\/js\/app\.js \(0\)$/m, stdout);
  assert.match(stdout, /^Namespace member uses with no namespace import \(0\)$/m, stdout);
  assert.match(stdout, /^Namespace members the target module does not export \(0\)$/m, stdout);
});

// ---- Fixtures: a tiny src/js tree in a scratch directory per case ----

const scratch = await mkdtemp(join(tmpdir(), 'harrington-dead-code-'));
after(() => rm(scratch, { recursive: true, force: true }));

// A store module and an app entry that imports every view, so nothing is
// unreachable and every export has an importer unless a case says otherwise.
const STORE = `export function get() { return {}; }
export function save(x) { return x; }
`;
let fixtures = 0;
async function fixture(views) {
  const root = join(scratch, `case-${fixtures += 1}`);
  const files = {
    'src/js/store.js': STORE,
    'src/js/app.js': [
      `import * as store from './store.js';`,
      ...Object.keys(views).map((name, i) => `import { view${i} } from './views/${name}.js';`),
      `store.get(); store.save(1);`,
      ...Object.keys(views).map((_, i) => `view${i}();`),
    ].join('\n'),
  };
  Object.entries(views).forEach(([name, body], i) => {
    files[`src/js/views/${name}.js`] = `${body}\nexport function view${i}() {}\n`;
  });
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  return run(['--root', root]);
}

// The sections this file is about; other sections (the fixture's own unused
// exports) are not asserted on.
const NAMESPACE_SECTIONS = [
  'Imports never referenced',
  'Namespace member uses with no namespace import',
  'Namespace members the target module does not export',
];
const assertClean = (stdout) => {
  for (const title of NAMESPACE_SECTIONS) assert.deepEqual(section(stdout, title), [], `${title}:\n${stdout}`);
};

test('fixture: a clean namespace import reports nothing', async () => {
  const { stdout } = await fixture({
    a: `import * as store from '../store.js';\nexport const x = () => store.get();`,
    b: `import * as store from '../store.js';\nexport const y = () => \`\${store.save(2)}\`;`,
    c: `import * as store from '../store.js';\nexport const z = () => { const { get } = store; return get(); };`,
  });
  assertClean(stdout);
});

test('fixture: a member use after the namespace import was removed is reported', async () => {
  const { stdout, code } = await fixture({
    a: `import * as store from '../store.js';\nexport const x = () => store.get();`,
    b: `export function render() { return store.get() + store?.save(1); }`,
  });
  assert.equal(code, 1);
  assert.deepEqual(section(stdout, 'Namespace member uses with no namespace import'),
    ['src/js/views/b.js: store.get, store.save (no `import * as store` from src/js/store.js)']);
});

test('fixture: a local binding of the same name is not a missing import', async () => {
  const { stdout } = await fixture({
    a: `import * as store from '../store.js';\nexport const x = () => store.get();`,
    b: `export function render(store) { return store.get(); }`,
    c: `const store = { get: () => 1 };\nexport const y = () => store.get();`,
    d: `export const z = 'store.get() in a string is not code';`,
  });
  assertClean(stdout);
});

test('fixture: a namespace import with no member use is reported', async () => {
  const { stdout, code } = await fixture({
    a: `import * as store from '../store.js';\nexport const x = () => 1;`,
    // Named only in a string and a comment: still unused.
    b: `import * as store from '../store.js';\n// store.get()\nexport const y = () => 'store.get()';`,
    // Passed as a value: a use.
    c: `import * as store from '../store.js';\nexport const z = (f) => f(store);`,
  });
  assert.equal(code, 1);
  assert.deepEqual(section(stdout, 'Imports never referenced'), [
    'src/js/views/a.js: * as store (no member use)',
    'src/js/views/b.js: * as store (no member use)',
  ]);
});

test('fixture: a member the target does not export is reported', async () => {
  const { stdout, code } = await fixture({
    a: `import * as store from '../store.js';\nexport const x = () => store.get() + store.renamedAway();`,
  });
  assert.equal(code, 1);
  assert.deepEqual(section(stdout, 'Namespace members the target module does not export'),
    ['src/js/views/a.js: store.renamedAway (src/js/store.js exports no renamedAway)']);
});
