// Deploys the Homestead co-op broker worker to Puter.
//
// Usage:  PUTER_AUTH_TOKEN=<token> node scripts/deploy-worker.mjs
//   (generate a token at puter.com/dashboard -> Create token; the same token
//    used for the site deploy works here.)
//
// Uploads workers/coop-broker.js into the Puter account's filesystem and
// (re)deploys it as the "homestead-coop-broker" worker. A worker always serves
// the current contents of its source file, so re-running this overwrites the
// file and thereby redeploys. Safe to run repeatedly.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { init } from '@heyputer/puter.js/src/init.cjs';

const WORKER_NAME = 'homestead-coop-broker';
const REMOTE_PATH = 'homestead/coop-broker.js';

const token = process.env.PUTER_AUTH_TOKEN;
if (!token) {
  console.error('PUTER_AUTH_TOKEN is not set. Generate one at puter.com/dashboard -> Create token.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(here, '..', 'workers', 'coop-broker.js'), 'utf8');

const puter = init(token);

async function main() {
  // 1. Upload the worker source into the Puter filesystem.
  await puter.fs.write(REMOTE_PATH, code, { overwrite: true, createMissingParents: true });
  console.log(`Uploaded worker source to ~/${REMOTE_PATH}`);

  // 2. Create the worker the first time; afterwards the overwrite above IS the
  //    redeploy, so there is nothing else to do.
  let existing = null;
  try { existing = await puter.workers.get(WORKER_NAME); } catch { existing = null; }

  if (existing) {
    console.log(`Worker "${WORKER_NAME}" already existed; source overwritten (redeployed).`);
    console.log(`URL: ${existing.url || `https://${WORKER_NAME}.puter.work`}`);
  } else {
    const deployment = await puter.workers.create(WORKER_NAME, REMOTE_PATH);
    console.log(`Deployed worker "${WORKER_NAME}".`);
    console.log(`URL: ${deployment.url || `https://${WORKER_NAME}.puter.work`}`);
  }
  console.log('Note: propagation can take 5-30 seconds before endpoints respond.');
}

// Exit explicitly: the puter.js SDK keeps a handle open, so the process would
// otherwise hang after finishing (same lesson as the site deploy script).
main().then(() => process.exit(0)).catch((err) => {
  console.error('Worker deploy failed:', err?.stack || err?.message || err);
  process.exit(1);
});
