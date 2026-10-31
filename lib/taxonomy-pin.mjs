// The one place the Marble Skill Taxonomy revision is pinned. server.mjs, the
// e2e suite (tests/e2e/support/taxonomy.mjs) and `npm run taxonomy:check` all
// read it. To move to a newer revision, follow docs/CURRICULUM.md.
//
// `files` holds the SHA-256 of every file Harrington downloads, copied from the
// upstream data/manifest.json at this revision and re-checked with sha256sum.
// manifest.json does not list its own hash, so ours comes from sha256sum alone.
import { createHash } from 'node:crypto';

export const TAXONOMY_PIN = Object.freeze({
  revision: '7bd8b6794cb78d9ca18216adb935f3cfd59cf5ac',
  date: '2026-10-24',
  upstream: 'https://raw.githubusercontent.com/withmarbleapp/os-taxonomy/7bd8b6794cb78d9ca18216adb935f3cfd59cf5ac/data',
  files: Object.freeze({
    'topics.json': 'd6b82f5ac04118812dc173a93a7b0db5b43416f2ff1c4b6b3dcfa06c8af43c22',
    'dependencies.json': 'b32e09eaf21024c96722e8026fcea592d05e2ad35e631680d55378883d413972',
    'clusters.json': '7bae0dbd339c33cb39859adff99f93e14799cae89dd4abe0eef67a46c3cc18e2',
    'manifest.json': '3a62e54ba61b282fc3895ddabab1962a3222cdfb200dfcfaf7f399d96d826f8f',
    // Read only by the server, which derives the trimmed Australian Curriculum
    // list from it (curriculum.js trimStandards); never sent to the browser.
    'curriculum-standards.json': 'c292855aecabb3fdb269c7e62babc0602786546f97592f97bd868bf2f05f0e9c',
  }),
});

// Lower-case hex SHA-256 of a Buffer, Uint8Array or string.
export async function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

// The upstream a server uses: HARRINGTON_TAXONOMY_UPSTREAM without trailing
// slashes, else the pin.
export function taxonomyUpstream(env = process.env) {
  return (env.HARRINGTON_TAXONOMY_UPSTREAM || '').trim().replace(/\/+$/, '') || TAXONOMY_PIN.upstream;
}

// The folder, inside HARRINGTON_DATA_DIR/taxonomy, that caches the files of
// `upstream`: '' (taxonomy/ itself) for the pin; for any other upstream its
// own `custom-<first 12 hex of the URL's SHA-256>`, so unchecked files never
// sit next to the pinned ones.
export function taxonomyCacheFolder(upstream) {
  return upstream === TAXONOMY_PIN.upstream ? ''
    : `custom-${createHash('sha256').update(upstream).digest('hex').slice(0, 12)}`;
}
