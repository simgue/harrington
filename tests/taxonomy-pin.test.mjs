// The curriculum pin (HAR-55, GAPS.md G10): the server downloads the pinned
// revision, refuses a file whose SHA-256 differs, says so in /api/health, and
// warns when an operator points it at a custom upstream.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { TAXONOMY_PIN, sha256Hex } from '../lib/taxonomy-pin.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const stub = new URL('./support/taxonomy-fetch-stub.mjs', import.meta.url).href;

async function startServer({ env = {}, upstreamDir = null } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'harrington-pin-'));
  let output = '';
  const child = spawn(process.execPath, [...(upstreamDir ? ['--import', stub] : []), 'server.mjs'], {
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
    async stop() {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

test('the pin module lists each fetched file once, with a 64-digit SHA-256, at a raw GitHub commit URL', () => {
  assert.match(TAXONOMY_PIN.revision, /^[0-9a-f]{40}$/);
  assert.equal(TAXONOMY_PIN.upstream, `https://raw.githubusercontent.com/withmarbleapp/os-taxonomy/${TAXONOMY_PIN.revision}/data`);
  assert.deepEqual(Object.keys(TAXONOMY_PIN.files).sort(), ['clusters.json', 'dependencies.json', 'manifest.json', 'topics.json']);
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
  await writeFile(join(upstreamDir, 'topics.json'), JSON.stringify({ topics: [{ id: 'mt_tampered00', name: 'Tampered' }] }));
  const app = await startServer({ upstreamDir });
  try {
    assert.equal((await app.health()).taxonomy, 'not-downloaded');
    assert.equal((await app.health()).taxonomyRevision, TAXONOMY_PIN.revision);
    const res = await fetch(`${app.url}/api/taxonomy/topics.json`);
    assert.equal(res.status, 502);
    const { error } = await res.json();
    assert.match(error, /^Curriculum file topics\.json failed its integrity check, so it was not saved: expected SHA-256 [0-9a-f]{64}, got [0-9a-f]{64}\./);
    await assert.rejects(stat(join(app.dataDir, 'taxonomy', 'topics.json')), { code: 'ENOENT' });
    const health = await app.health();
    assert.equal(health.taxonomy, 'integrity-failed');
    assert.equal(health.taxonomyCached, false);
  } finally {
    await app.stop();
    await rm(upstreamDir, { recursive: true, force: true });
  }
});

test('a download that matches the pin is cached and the curriculum reads as verified', async (t) => {
  // Stand-in files whose hashes are the pin's: build a pin-shaped upstream
  // from the real e2e cache when it is there, else skip.
  const cache = fileURLToPath(new URL(`./e2e/.cache/taxonomy-${TAXONOMY_PIN.revision.slice(0, 12)}/`, import.meta.url));
  for (const name of Object.keys(TAXONOMY_PIN.files)) {
    const body = await readFile(join(cache, name)).catch(() => null);
    if (!body || (await sha256Hex(body)) !== TAXONOMY_PIN.files[name]) {
      t.skip('no pinned e2e cache; run npm run e2e once');
      return;
    }
  }
  const app = await startServer({ upstreamDir: cache });
  try {
    for (const name of Object.keys(TAXONOMY_PIN.files)) {
      assert.equal((await fetch(`${app.url}/api/taxonomy/${name}`)).status, 200, name);
    }
    const saved = await readFile(join(app.dataDir, 'taxonomy', 'topics.json'));
    assert.equal(createHash('sha256').update(saved).digest('hex'), TAXONOMY_PIN.files['topics.json']);
    assert.equal((await app.health()).taxonomy, 'verified');
  } finally {
    await app.stop();
  }
});

test('a cached file from another revision is still served, and health says outdated', async () => {
  const app = await startServer({ upstreamDir: await mkdtemp(join(tmpdir(), 'harrington-upstream-empty-')) });
  try {
    await mkdir(join(app.dataDir, 'taxonomy'), { recursive: true });
    const old = { topics: [{ id: 'mt_3XJkeIn6J6', name: 'Estimating answers (age 7+)', extra: { kept: true } }] };
    await writeFile(join(app.dataDir, 'taxonomy', 'topics.json'), JSON.stringify(old));
    const res = await fetch(`${app.url}/api/taxonomy/topics.json`);
    assert.equal(res.status, 200);
    // Served byte for byte: unknown fields survive.
    assert.deepEqual(await res.json(), old);
    assert.equal((await app.health()).taxonomy, 'outdated');
    assert.match(app.output(), /is not the pinned revision 7bd8b67; it is still served/);
    assert.doesNotMatch(app.output(), /stub fetch/, 'nothing was downloaded');
  } finally {
    await app.stop();
  }
});

test('a custom upstream is allowed with a startup warning, and health says unchecked', async () => {
  const app = await startServer({ env: { HARRINGTON_TAXONOMY_UPSTREAM: 'http://127.0.0.1:9/experiment/' } });
  try {
    assert.match(await app.waitForOutput(/custom upstream/), /HARRINGTON_TAXONOMY_UPSTREAM is a custom upstream \(http:\/\/127\.0\.0\.1:9\/experiment\): curriculum files from it are cached without an integrity check/);
    const health = await app.health();
    assert.equal(health.taxonomy, 'unchecked');
    assert.equal(health.taxonomyRevision, null);
  } finally {
    await app.stop();
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
