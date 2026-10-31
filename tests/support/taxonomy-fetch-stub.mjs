// Preloaded into a test server (`node --import`): answers fetches of the
// pinned taxonomy upstream from TEST_TAXONOMY_DIR, so the integrity check can
// be exercised without the network. Any other fetch fails loudly.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TAXONOMY_PIN } from '../../lib/taxonomy-pin.mjs';

const dir = process.env.TEST_TAXONOMY_DIR;
globalThis.fetch = async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith(`${TAXONOMY_PIN.upstream}/`)) throw new Error(`unexpected fetch in a test: ${url}`);
  console.log(`stub fetch ${url.slice(TAXONOMY_PIN.upstream.length + 1)}`);
  const body = await readFile(join(dir, url.slice(TAXONOMY_PIN.upstream.length + 1))).catch(() => null);
  return body ? new Response(body, { status: 200 }) : new Response('not found', { status: 404 });
};
