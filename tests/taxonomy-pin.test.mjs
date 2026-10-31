// The curriculum pin (HAR-55, GAPS.md G10): the server serves only files that
// match lib/taxonomy-pin.mjs. A cached file that does not match is downloaded
// again at the pin; a download that does not match is refused; a custom
// upstream is cached in its own folder, unchecked, with a warning.
//
// The success paths need the real pinned files. They come from the e2e cache
// (tests/e2e/.cache/taxonomy-<commit>/), which CI's isolation job fills before
// `npm test`; under CI a missing cache fails these tests instead of skipping.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { TAXONOMY_PIN, sha256Hex } from '../lib/taxonomy-pin.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const stub = new URL('./support/taxonomy-fetch-stub.mjs', import.meta.url).href;
const PINNED_CACHE = fileURLToPath(new URL(`./e2e/.cache/taxonomy-${TAXONOMY_PIN.revision.slice(0, 12)}/`, import.meta.url));
const NAMES = Object.keys(TAXONOMY_PIN.files);
// The optional curriculum-standards.json is read only by the server
// (GET /api/taxonomy/standards/acara-v9.json); the others the browser reads.
const STANDARDS = 'curriculum-standards.json';
const BROWSER_NAMES = NAMES.filter((name) => name !== STANDARDS);

// The real pinned files, or null (the test then skips, or fails under CI).
async function pinnedFiles(t) {
  for (const name of NAMES) {
    const body = await readFile(join(PINNED_CACHE, name)).catch(() => null);
    if (!body || (await sha256Hex(body)) !== TAXONOMY_PIN.files[name]) {
      if (process.env.CI) assert.fail(`the pinned taxonomy is not in ${PINNED_CACHE}; CI must download it before npm test`);
      t.skip('no pinned taxonomy cache; run npm run e2e once');
      return null;
    }
  }
  return PINNED_CACHE;
}

async function startServer({ env = {}, upstreamDir = null, dataDir = null } = {}) {
  dataDir = dataDir || await mkdtemp(join(tmpdir(), 'harrington-pin-'));
  let output = '';
  const child = spawn(process.execPath, ['--import', stub, 'server.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HARRINGTON_HOST: '127.0.0.1',
      HARRINGTON_PORT: '0',
      HARRINGTON_DATA_DIR: dataDir,
      HARRINGTON_ACCESS_TOKEN: '',
      HARRINGTON_PUBLISHED_HOST: '',
      HARRINGTON_ALLOWED_HOSTS: '',
      HARRINGTON_BACKUP_DIR: join(dataDir, 'backups'),
      HARRINGTON_AI_BASE_URL: '',
      HARRINGTON_AI_MODEL: '',
      HARRINGTON_TAXONOMY_UPSTREAM: '',
      TEST_TAXONOMY_DIR: upstreamDir || '',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start: ${output}`)), 5000);
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited with ${code}: ${output}`)); });
  });
  return {
    url,
    dataDir,
    output: () => output,
    // Startup lines after the address can land a moment later.
    async waitForOutput(pattern) {
      for (let i = 0; i < 40 && !pattern.test(output); i += 1) await new Promise((r) => setTimeout(r, 50));
      return output;
    },
    health: async () => (await fetch(`${url}/api/health`)).json(),
    get: (name) => fetch(`${url}/api/taxonomy/${name}`),
    async stop({ keep = false } = {}) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
      if (!keep) await rm(dataDir, { recursive: true, force: true });
    },
  };
}

const sha = async (res) => sha256Hex(Buffer.from(await res.arrayBuffer()));
const tampered = JSON.stringify({ topics: [{ id: 'mt_tampered00', name: 'Tampered' }] });

test('the pin module lists each fetched file once, with a 64-digit SHA-256, at a raw GitHub commit URL', () => {
  assert.match(TAXONOMY_PIN.revision, /^[0-9a-f]{40}$/);
  assert.equal(TAXONOMY_PIN.upstream, `https://raw.githubusercontent.com/withmarbleapp/os-taxonomy/${TAXONOMY_PIN.revision}/data`);
  assert.deepEqual([...NAMES].sort(), ['clusters.json', 'curriculum-standards.json', 'dependencies.json', 'manifest.json', 'topics.json']);
  for (const hash of Object.values(TAXONOMY_PIN.files)) assert.match(hash, /^[0-9a-f]{64}$/);
});

test('the server and the e2e suite read the same pin', async () => {
  const server = await readFile(join(repoRoot, 'server.mjs'), 'utf8');
  const e2e = await readFile(join(repoRoot, 'tests/e2e/support/taxonomy.mjs'), 'utf8');
  assert.match(server, /from '\.\/lib\/taxonomy-pin\.mjs'/);
  assert.match(e2e, /from '\.\.\/\.\.\/\.\.\/lib\/taxonomy-pin\.mjs'/);
  // No second copy of the revision anywhere in either file.
  assert.doesNotMatch(server + e2e, new RegExp(TAXONOMY_PIN.revision));
  assert.doesNotMatch(server, /jsdelivr|@main/);
});

test('a download that does not match the pin is refused, not cached, and reported by /api/health', async () => {
  const upstreamDir = await mkdtemp(join(tmpdir(), 'harrington-upstream-'));
  await writeFile(join(upstreamDir, 'topics.json'), tampered);
  const app = await startServer({ upstreamDir });
  try {
    assert.deepEqual(await app.health().then((h) => [h.taxonomy, h.taxonomyRevision]), ['not-downloaded', null]);
    const res = await app.get('topics.json');
    assert.equal(res.status, 502);
    // A short line for the browser; the hashes go to the log.
    assert.equal((await res.json()).error, 'Curriculum file topics.json failed its integrity check, so it was not saved. The server log and /api/health have the details.');
    assert.match(app.output(), new RegExp(`expected SHA-256 ${TAXONOMY_PIN.files['topics.json']}, got [0-9a-f]{64}`));
    await assert.rejects(stat(join(app.dataDir, 'taxonomy', 'topics.json')), { code: 'ENOENT' });
    const health = await app.health();
    assert.deepEqual([health.taxonomy, health.taxonomyRevision, health.taxonomyCached], ['integrity-failed', null, false]);
  } finally {
    await app.stop();
    await rm(upstreamDir, { recursive: true, force: true });
  }
});

test('a download that matches the pin is cached, and health says verified with the revision', async (t) => {
  const upstreamDir = await pinnedFiles(t);
  if (!upstreamDir) return;
  const app = await startServer({ upstreamDir });
  try {
    for (const name of BROWSER_NAMES) assert.equal(await sha(await app.get(name)), TAXONOMY_PIN.files[name], name);
    // The whole standards file stays on the server (404 to the browser); the
    // browser reads the list derived from it, and the cached file is the pin.
    assert.equal((await app.get(STANDARDS)).status, 404);
    assert.equal((await app.get('standards/acara-v9.json')).status, 200);
    assert.equal(await sha256Hex(await readFile(join(app.dataDir, 'taxonomy', STANDARDS))), TAXONOMY_PIN.files[STANDARDS]);
    const saved = await readFile(join(app.dataDir, 'taxonomy', 'topics.json'));
    assert.equal(await sha256Hex(saved), TAXONOMY_PIN.files['topics.json']);
    assert.deepEqual(await app.health().then((h) => [h.taxonomy, h.taxonomyRevision]), ['verified', TAXONOMY_PIN.revision]);
    // Served from the cache from now on: no second download.
    await app.get('topics.json');
    assert.equal(app.output().match(/stub fetch topics\.json/g).length, 1);
  } finally {
    await app.stop();
  }
});

test('a cached file from another revision is never served: it is downloaded again at the pin and replaced', async (t) => {
  const upstreamDir = await pinnedFiles(t);
  if (!upstreamDir) return;
  const dataDir = await mkdtemp(join(tmpdir(), 'harrington-pin-'));
  await mkdir(join(dataDir, 'taxonomy'), { recursive: true });
  // What an older Harrington left behind (jsDelivr @main, or a hand edit).
  await writeFile(join(dataDir, 'taxonomy', 'topics.json'), tampered);
  const app = await startServer({ upstreamDir, dataDir });
  try {
    assert.deepEqual(await app.health().then((h) => [h.taxonomy, h.taxonomyRevision]), ['outdated', null]);
    assert.equal(await sha(await app.get('topics.json')), TAXONOMY_PIN.files['topics.json']);
    assert.match(app.output(), /Cached curriculum file topics\.json is not the pinned revision 7bd8b67; downloading it again\./);
    assert.equal(await sha256Hex(await readFile(join(dataDir, 'taxonomy', 'topics.json'))), TAXONOMY_PIN.files['topics.json']);
    for (const name of BROWSER_NAMES) await app.get(name);
    assert.equal((await app.health()).taxonomy, 'verified');
    // A file changed on disk is checked again, not trusted from memory.
    await new Promise((r) => setTimeout(r, 20));
    await writeFile(join(dataDir, 'taxonomy', 'clusters.json'), '{"clusters":[]}');
    assert.equal((await app.health()).taxonomy, 'outdated');
  } finally {
    await app.stop();
  }
});

test('a cached file from another revision is not served when the new download fails its check', async () => {
  const upstreamDir = await mkdtemp(join(tmpdir(), 'harrington-upstream-'));
  await writeFile(join(upstreamDir, 'topics.json'), `${tampered} `);
  const dataDir = await mkdtemp(join(tmpdir(), 'harrington-pin-'));
  await mkdir(join(dataDir, 'taxonomy'), { recursive: true });
  await writeFile(join(dataDir, 'taxonomy', 'topics.json'), tampered);
  const app = await startServer({ upstreamDir, dataDir });
  try {
    assert.equal((await app.get('topics.json')).status, 502);
    assert.equal(await readFile(join(dataDir, 'taxonomy', 'topics.json'), 'utf8'), tampered, 'the old file is left alone, not replaced');
    assert.deepEqual(await app.health().then((h) => [h.taxonomy, h.taxonomyRevision]), ['integrity-failed', null]);
  } finally {
    await app.stop();
    await rm(upstreamDir, { recursive: true, force: true });
  }
});

test('a custom upstream caches in its own folder; unset again, only the verified pin is served', async (t) => {
  const pinned = await pinnedFiles(t);
  if (!pinned) return;
  const custom = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(tampered);
  });
  await new Promise((resolve) => custom.listen(0, '127.0.0.1', resolve));
  const customUrl = `http://127.0.0.1:${custom.address().port}/experiment`;
  let app = await startServer({ upstreamDir: pinned, env: { HARRINGTON_TAXONOMY_UPSTREAM: `${customUrl}/` } });
  const { dataDir } = app;
  try {
    assert.match(await app.waitForOutput(/custom upstream/), /HARRINGTON_TAXONOMY_UPSTREAM is a custom upstream \(http:\/\/127\.0\.0\.1:\d+\/experiment\): curriculum files from it are cached in .*custom-[0-9a-f]{12} without an integrity check/);
    assert.equal(await (await app.get('topics.json')).text(), tampered);
    assert.deepEqual(await app.health().then((h) => [h.taxonomy, h.taxonomyRevision]), ['unchecked', null]);
    const [folder] = (await readdir(join(dataDir, 'taxonomy'))).filter((n) => n.startsWith('custom-'));
    assert.match(folder, /^custom-[0-9a-f]{12}$/);
    await assert.rejects(stat(join(dataDir, 'taxonomy', 'topics.json')), { code: 'ENOENT' });
    await app.stop({ keep: true });

    // The variable is unset: the pin is downloaded, checked and served.
    app = await startServer({ upstreamDir: pinned, dataDir });
    assert.doesNotMatch(await app.waitForOutput(/Access token/), /custom upstream/);
    assert.equal(await sha(await app.get('topics.json')), TAXONOMY_PIN.files['topics.json']);
    assert.match(app.output(), /stub fetch topics\.json/);
    for (const name of BROWSER_NAMES) await app.get(name);
    assert.deepEqual(await app.health().then((h) => [h.taxonomy, h.taxonomyRevision]), ['verified', TAXONOMY_PIN.revision]);
  } finally {
    await app.stop();
    custom.close();
  }
});

test('setting the upstream to the pinned URL itself is not a custom upstream', async () => {
  const app = await startServer({ env: { HARRINGTON_TAXONOMY_UPSTREAM: `${TAXONOMY_PIN.upstream}/` } });
  try {
    assert.doesNotMatch(await app.waitForOutput(/Access token/), /custom upstream/);
    assert.equal((await app.health()).taxonomy, 'not-downloaded');
  } finally {
    await app.stop();
  }
});
