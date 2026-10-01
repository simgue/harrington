// Fetches the Marble taxonomy once into tests/e2e/.cache/taxonomy (git-ignored)
// so every e2e run after the first starts its servers without the network.
//
// The server's default upstream is jsDelivr. Some networks (including the
// sandbox this suite was written in) block it, so we probe it first and fall
// back to raw.githubusercontent.com, which serves the same files.
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const TAXONOMY_FILES = ['topics.json', 'dependencies.json', 'clusters.json', 'manifest.json'];
export const JSDELIVR_UPSTREAM = 'https://cdn.jsdelivr.net/gh/withmarbleapp/os-taxonomy@main/data';
export const GITHUB_RAW_UPSTREAM = 'https://raw.githubusercontent.com/withmarbleapp/os-taxonomy/main/data';
export const CACHE_DIR = fileURLToPath(new URL('../.cache/taxonomy/', import.meta.url));

async function reachable(upstream) {
  try {
    const res = await fetch(`${upstream}/manifest.json`, { signal: AbortSignal.timeout(8000) });
    return res.ok;
  } catch {
    return false;
  }
}

// The upstream the app server should use: an explicit HARRINGTON_TAXONOMY_UPSTREAM
// wins, then jsDelivr if it answers, then GitHub raw.
let detected = null;
export async function detectUpstream() {
  if (process.env.HARRINGTON_TAXONOMY_UPSTREAM) return process.env.HARRINGTON_TAXONOMY_UPSTREAM;
  if (detected) return detected;
  detected = (await reachable(JSDELIVR_UPSTREAM)) ? JSDELIVR_UPSTREAM : GITHUB_RAW_UPSTREAM;
  return detected;
}

async function exists(path) {
  try { return (await stat(path)).size > 0; } catch { return false; }
}

export async function cacheIsComplete() {
  for (const name of TAXONOMY_FILES) {
    if (!(await exists(join(CACHE_DIR, name)))) return false;
  }
  return true;
}

// Download any missing file. Two launchers can call this at once, so each
// writes to its own temp file and renames it into place.
export async function ensureTaxonomyCache({ log = () => {} } = {}) {
  await mkdir(CACHE_DIR, { recursive: true });
  if (await cacheIsComplete()) return { upstream: null, downloaded: [] };
  const upstream = await detectUpstream();
  const downloaded = [];
  for (const name of TAXONOMY_FILES) {
    const target = join(CACHE_DIR, name);
    if (await exists(target)) continue;
    log(`Downloading taxonomy ${name} from ${upstream}`);
    const res = await fetch(`${upstream}/${name}`, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Could not download ${name} from ${upstream} (${res.status})`);
    const tmp = `${target}.${process.pid}.tmp`;
    await writeFile(tmp, Buffer.from(await res.arrayBuffer()));
    await rename(tmp, target);
    downloaded.push(name);
  }
  return { upstream, downloaded };
}
