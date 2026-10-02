// Runs after Playwright's webServer entries are up (the taxonomy download and
// cache happen in start-app.mjs, which the webServer runs first). Here we only
// confirm the four servers are what the specs expect and reset the mock.
import { URLS } from './support/env.mjs';
import { CACHE_DIR, cacheIsComplete } from './support/taxonomy.mjs';

async function health(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

export default async function globalSetup() {
  const [ai, noAi, unreachable] = await Promise.all([
    health(`${URLS.appAi}/api/health`),
    health(`${URLS.appNoAi}/api/health`),
    health(`${URLS.appAiUnreachable}/api/health`),
  ]);
  await health(`${URLS.mockAi}/health`);
  if (ai.aiConfigured !== true) {
    throw new Error(`The app on ${URLS.appAi} should have AI configured; is another server using that port? (E2E_PORT_BASE moves them)`);
  }
  if (noAi.aiConfigured !== false) {
    throw new Error(`The app on ${URLS.appNoAi} should have no AI provider; is another server using that port?`);
  }
  if (unreachable.aiConfigured !== true) {
    throw new Error(`The app on ${URLS.appAiUnreachable} should have an (unreachable) AI provider configured; is another server using that port?`);
  }
  const dead = await fetch(URLS.deadAi).then(() => true, () => false);
  if (dead) throw new Error(`Something is listening on ${URLS.deadAi}, which the ai-unreachable project needs to be closed (E2E_PORT_BASE moves it)`);
  if (!(await cacheIsComplete())) throw new Error(`Taxonomy cache is incomplete under ${CACHE_DIR}`);
  await fetch(`${URLS.mockAi}/__log`, { method: 'DELETE' });
  await fetch(`${URLS.mockAi}/__fail`, { method: 'DELETE' });
}
