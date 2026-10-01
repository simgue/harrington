#!/usr/bin/env node
// Starts `node server.mjs` for the e2e suite with a fresh temporary
// HARRINGTON_DATA_DIR. Playwright's webServer runs this before globalSetup,
// so this is also where the taxonomy is fetched (once) into the local cache
// and copied into the new data directory.
//
//   node tests/e2e/start-app.mjs --port 4312 --ai     # AI pointed at the mock provider
//   node tests/e2e/start-app.mjs --port 4313          # no AI provider (fail-closed)
import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CACHE_DIR, GITHUB_RAW_UPSTREAM, TAXONOMY_FILES, cacheIsComplete, ensureTaxonomyCache } from './support/taxonomy.mjs';
import { URLS } from './support/env.mjs';

const args = process.argv.slice(2);
const withAi = args.includes('--ai');
const portArg = args[args.indexOf('--port') + 1];
if (!args.includes('--port') || !portArg) {
  console.error('usage: start-app.mjs --port <port> [--ai]');
  process.exit(2);
}

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const log = (msg) => console.log(`[e2e app ${portArg}] ${msg}`);

const hadCache = await cacheIsComplete();
const { upstream } = await ensureTaxonomyCache({ log });
const dataDir = await mkdtemp(join(tmpdir(), `harrington-e2e-${withAi ? 'ai' : 'noai'}-`));
await mkdir(join(dataDir, 'taxonomy'), { recursive: true });
for (const name of TAXONOMY_FILES) await copyFile(join(CACHE_DIR, name), join(dataDir, 'taxonomy', name));
log(`data dir ${dataDir} (taxonomy ${hadCache ? 'from cache' : `downloaded from ${upstream}`})`);

const env = {
  ...process.env,
  HARRINGTON_HOST: '127.0.0.1',
  HARRINGTON_PORT: String(portArg),
  HARRINGTON_DATA_DIR: dataDir,
  HARRINGTON_AI_BASE_URL: withAi ? `${URLS.mockAi}/v1` : '',
  HARRINGTON_AI_MODEL: withAi ? 'mock' : '',
  HARRINGTON_AI_API_KEY: '',
  HARRINGTON_AI_TIMEOUT_MS: '15000',
};
// The cache is already in the data dir, but if a test ever deletes it the
// server should refetch from an upstream that works on this network.
// (No probe when the cache was already complete, so warm runs stay offline.)
if (!env.HARRINGTON_TAXONOMY_UPSTREAM) env.HARRINGTON_TAXONOMY_UPSTREAM = upstream || GITHUB_RAW_UPSTREAM;

const child = spawn(process.execPath, ['server.mjs'], { cwd: repoRoot, env, stdio: 'inherit' });

let stopping = false;
async function stop(code) {
  if (stopping) return;
  stopping = true;
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise((resolve) => { child.once('exit', resolve); setTimeout(resolve, 3000); });
  }
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  process.exit(code);
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => stop(0));
child.on('exit', (code) => stop(code ?? 0));
