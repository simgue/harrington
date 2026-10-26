// Runs against an app server whose AI provider is the mock but with
// HARRINGTON_AI_CAPABILITIES=lesson (HAR-26, the week-two experiment). Lessons
// generate; every other AI control shows a quiet "Not switched on yet" chip
// that links to the same setup guide; content already cached still opens.
import { test, expect, modal } from './fixtures.mjs';
import { TOPICS } from './support/family.mjs';
import { MARKERS } from './mock-ai-server.mjs';

const ONE = TOPICS.oneToOne;
const AI_HELP_HREF = 'https://github.com/simgue/harrington/blob/main/README.md#optional-local-model-ollama';
const section = (page, title) => page.locator('div.rounded-2xl', { has: page.getByRole('heading', { level: 2, name: title, exact: true }) });
const offChips = (scope) => scope.getByRole('link', { name: 'Not switched on yet' });

// The settings test below may save over the environment; leave the app as it started.
test.afterEach(async ({ request }) => {
  await request.delete('/api/settings/ai');
});

test('health lists only lessons; /api/ai refuses every other capability with 403', async ({ request }) => {
  const health = await (await request.get('/api/health')).json();
  expect(health).toMatchObject({ aiConfigured: true, aiCapabilities: ['lesson'] });
  const messages = [{ role: 'user', content: 'Explain the topic "Counting" simply.' }];
  const denied = await request.post('/api/ai', { data: { messages, capability: 'explain' } });
  expect(denied.status()).toBe(403);
  expect(await denied.json()).toEqual({ error: 'The "explain" AI capability is not switched on for this Harrington server', capability: 'explain' });
  expect((await request.post('/api/ai', { data: { messages } })).status()).toBe(403);
  expect((await request.post('/api/ai', { data: { messages, capability: 'lesson' } })).status()).toBe(200);
});

test('topic page: the lesson generates, everything else shows "Not switched on yet"', async ({ page, gotoApp, mockAi, shot }) => {
  await gotoApp({ seed: { progress: { [ONE.id]: 'mastered' } }, hash: `topic/${ONE.id}` });
  await expect(page.getByRole('heading', { level: 1, name: ONE.name })).toBeVisible();

  for (const name of ['Print & go', 'Explain simply', 'Make a mini-quiz', 'Practice recall', 'Retake topic test', 'Try the challenge quiz']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await expect(page.getByText('Get instructions')).toHaveCount(0);
  // A provider is set up, so no chip asks for one.
  await expect(page.getByRole('link', { name: 'Needs a local AI provider' })).toHaveCount(0);
  for (const chip of await offChips(page).all()) {
    await expect(chip).toHaveAttribute('href', AI_HELP_HREF);
    await expect(chip).toHaveAttribute('target', '_blank');
  }
  await expect(offChips(section(page, 'Topic mastery test'))).toHaveCount(1);
  await expect(offChips(section(page, 'Active recall'))).toHaveCount(1);
  await expect(offChips(section(page, 'AI teaching helper'))).toHaveCount(1);
  expect(await offChips(section(page, 'Activities & games')).count()).toBeGreaterThanOrEqual(5);
  await shot('topic-not-switched-on');

  // The lesson itself is switched on.
  await mockAi.clear();
  await page.getByRole('button', { name: 'Open full lesson' }).click();
  await expect(modal(page)).toContainText(MARKERS.lessonHook);
  await expect(modal(page).getByRole('button', { name: 'Generate a different version' })).toBeVisible();
  // Print & go is not, and inside the lesson it simply is not offered.
  await expect(modal(page).getByRole('button', { name: /Print & go materials/ })).toHaveCount(0);
  expect(await mockAi.kinds()).toEqual(['lesson']);
});

test('printables cached earlier still open with printables switched off', async ({ page, gotoApp, mockAi }) => {
  const printables = {
    printables: [{
      type: 'worksheet',
      title: 'Cached counting sheet',
      forParent: 'Print it and sit beside your child.',
      content: { intro: 'Count each group.', problems: ['3 + 1 = __'], answers: ['4'] },
    }],
  };
  const saved = await page.request.put(`/api/lessons/${encodeURIComponent(`print:${ONE.id}`)}`, { data: printables });
  expect(saved.status()).toBe(204);

  await gotoApp({ seed: {}, hash: `topic/${ONE.id}` });
  await mockAi.clear();
  await page.getByRole('button', { name: 'Print & go', exact: true }).click();
  await expect(modal(page).getByText('Cached counting sheet')).toBeVisible();
  expect(await mockAi.kinds()).toEqual([]);
});

test('settings on an environment-configured server: saving one box keeps the environment values', async ({ page, gotoApp, request }) => {
  const sources = async () => (await (await request.get('/api/settings/ai')).json()).source;
  const envSources = { baseUrl: 'env', model: 'env', apiKey: 'none', timeoutMs: 'env', capabilities: 'env' };
  expect(await sources()).toEqual(envSources);

  await gotoApp({ seed: {}, hash: 'settings' });
  await expect(page.getByText('Configured from the server environment')).toBeVisible();

  // Saving with nothing changed writes nothing.
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('No changes to save')).toBeVisible();
  expect(await sources()).toEqual(envSources);

  // One capability box: only the capabilities are saved in the app.
  await page.getByLabel('Recall cards').check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('AI settings saved')).toBeVisible();
  expect(await sources()).toEqual({ ...envSources, capabilities: 'app' });
  const saved = await (await request.get('/api/settings/ai')).json();
  expect(saved.capabilities).toEqual(['lesson', 'recall']);

  // Only the base URL: it saves, with the model shown (from the environment) kept beside it.
  const envModel = saved.model;
  await page.getByLabel('Base URL').fill(saved.baseUrl.replace('127.0.0.1', 'localhost'));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  // The first save's toast may still be up, so wait on the server instead.
  await expect.poll(async () => (await sources()).baseUrl).toBe('app');
  await expect(page.getByText('Choose a model for this base URL')).toHaveCount(0);
  const after = await (await request.get('/api/settings/ai')).json();
  expect(after.source).toEqual({ ...envSources, baseUrl: 'app', model: 'app', capabilities: 'app' });
  expect(after.model).toBe(envModel);
  expect(after.baseUrl).toBe(saved.baseUrl.replace('127.0.0.1', 'localhost'));
});
