// Preloaded into a test server (`node --import`): answers fetches of the
// pinned taxonomy upstream from TEST_TAXONOMY_DIR, so the integrity check can
// be exercised without the network, and logs each one. Other URLs (a custom
// upstream on 127.0.0.1) go to the real fetch.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TAXONOMY_PIN } from '../../lib/taxonomy-pin.mjs';

const dir = process.env.TEST_TAXONOMY_DIR;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith(`${TAXONOMY_PIN.upstream}/`)) {
    if (!url.startsWith('http://127.0.0.1:')) throw new Error(`unexpected fetch in a test: ${url}`);
    return realFetch(input, init);
  }
  const name = url.slice(TAXONOMY_PIN.upstream.length + 1);
  console.log(`stub fetch ${name}`);
  const body = dir ? await readFile(join(dir, name)).catch(() => null) : null;
  return body ? new Response(body, { status: 200 }) : new Response('not found', { status: 404 });
};
