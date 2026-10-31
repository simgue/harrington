#!/usr/bin/env node
// npm run taxonomy:check [-- --install]
//
// Downloads every curriculum file pinned in lib/taxonomy-pin.mjs and checks
// its SHA-256. Nothing is written unless --install is given; then the verified
// files replace the server's cache (HARRINGTON_DATA_DIR/taxonomy, by default
// data/private/taxonomy), all or nothing. Stop the server first; it reads the
// cache once per process. See docs/CURRICULUM.md.
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TAXONOMY_PIN, sha256Hex } from '../lib/taxonomy-pin.mjs';

const install = process.argv.includes('--install');
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const bodies = new Map();
let failed = false;
for (const [name, expected] of Object.entries(TAXONOMY_PIN.files)) {
  let body;
  try {
    const res = await fetch(`${TAXONOMY_PIN.upstream}/${name}`, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    body = Buffer.from(await res.arrayBuffer());
  } catch (error) {
    console.error(`✗ ${name}: could not download (${error.message})`);
    failed = true;
    continue;
  }
  const actual = await sha256Hex(body);
  if (actual !== expected) {
    console.error(`✗ ${name}: SHA-256 ${actual}, expected ${expected}`);
    failed = true;
    continue;
  }
  console.log(`✓ ${name} (${body.length.toLocaleString('en-US')} bytes)`);
  bodies.set(name, body);
}

if (failed) {
  console.error(`\nThe pinned taxonomy ${TAXONOMY_PIN.revision.slice(0, 7)} did not verify. Nothing was written.`);
  process.exit(1);
}

const manifest = JSON.parse(bodies.get('manifest.json'));
const topics = JSON.parse(bodies.get('topics.json'));
const count = (topics.topics || topics).length;
console.log(`\nMarble Skill Taxonomy ${TAXONOMY_PIN.revision.slice(0, 7)} (${TAXONOMY_PIN.date}), generated ${manifest.generatedAt}: `
  + `${count.toLocaleString('en-US')} topics, ${Object.keys(manifest.counts?.topicsBySubject || {}).length} subjects.`);
// The upstream manifest lists its own files' hashes; ours must agree with it.
for (const [name, entry] of Object.entries(manifest.files || {})) {
  if (TAXONOMY_PIN.files[name] && entry.sha256 !== TAXONOMY_PIN.files[name]) {
    console.error(`✗ manifest.json lists ${name} as ${entry.sha256}, the pin says ${TAXONOMY_PIN.files[name]}`);
    process.exit(1);
  }
}

if (install) {
  const dataDir = resolve(process.env.HARRINGTON_DATA_DIR || join(repoRoot, 'data', 'private'));
  const dir = join(dataDir, 'taxonomy');
  await mkdir(dir, { recursive: true });
  for (const [name, body] of bodies) await writeFile(join(dir, `${name}.${process.pid}.tmp`), body);
  for (const name of bodies.keys()) await rename(join(dir, `${name}.${process.pid}.tmp`), join(dir, name));
  console.log(`Installed into ${dir}. Restart Harrington to use it.`);
}
