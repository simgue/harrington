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
