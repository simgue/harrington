// A small made-up curriculum for a test server or the experiment script. It is
// not the pinned one, so it is served the way a custom upstream is: from that
// upstream's own cache folder (lib/taxonomy-pin.mjs taxonomyCacheFolder), with
// nothing listening at the URL. Returns the environment to start the server with.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { taxonomyCacheFolder } from '../../lib/taxonomy-pin.mjs';

export const FIXTURE_UPSTREAM = 'http://127.0.0.1:9/fixture-taxonomy';

export async function seedFixtureTaxonomy(dataDir, files) {
  const dir = join(dataDir, 'taxonomy', taxonomyCacheFolder(FIXTURE_UPSTREAM));
  await mkdir(dir, { recursive: true });
  for (const [name, value] of Object.entries(files)) await writeFile(join(dir, name), JSON.stringify(value));
  return { HARRINGTON_TAXONOMY_UPSTREAM: FIXTURE_UPSTREAM };
}
