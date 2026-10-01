// Runs after Playwright's webServer entries are up (the taxonomy download and
// cache happen in start-app.mjs, which the webServer runs first). Here we only
// confirm the three servers are what the specs expect and clear the mock log.
import { URLS } from './support/env.mjs';
import { cacheIsComplete } from './support/taxonomy.mjs';

async function health(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

export default async function globalSetup() {
  const [ai, noAi] = await Promise.all([health(`${URLS.appAi}/api/health`), health(`${URLS.appNoAi}/api/health`)]);
  await health(`${URLS.mockAi}/health`);
  if (ai.aiConfigured !== true) {
    throw new Error(`The app on ${URLS.appAi} should have AI configured; is another server using that port? (E2E_PORT_BASE moves them)`);
  }
  if (noAi.aiConfigured !== false) {
    throw new Error(`The app on ${URLS.appNoAi} should have no AI provider; is another server using that port?`);
  }
  if (!(await cacheIsComplete())) throw new Error('Taxonomy cache is incomplete under tests/e2e/.cache/taxonomy');
  await fetch(`${URLS.mockAi}/__log`, { method: 'DELETE' });
}
