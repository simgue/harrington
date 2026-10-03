// Settings > AI provider (HAR-26): the parent sets the provider and its API key
// in the app, with no environment variables and no restart. This app starts
// with no AI in its environment; the spec points it at the mock provider.
import { test, expect } from './fixtures.mjs';
import { TOPICS } from './support/family.mjs';
import { URLS } from './support/env.mjs';

const ONE = TOPICS.oneToOne;
const KEY = 'sk-e2e-settings-key-7Q2w';
const section = (page, title) => page.locator('div.rounded-2xl', { has: page.getByRole('heading', { level: 2, name: title, exact: true }) });

test.afterEach(async ({ request }) => {
  await request.delete('/api/settings/ai');
});

test('save a provider in the app, test it, see AI switch on, then remove it', async ({ page, gotoApp, mockAi, shot }) => {
  // Every response the page receives, to prove the key never comes back.
  const bodies = [];
  page.on('response', async (response) => {
    if (!response.url().includes('/api/')) return;
    bodies.push(await response.text().catch(() => ''));
  });

  await gotoApp({ seed: {}, hash: `topic/${ONE.id}` });
  await expect(page.getByRole('link', { name: 'Needs a local AI provider' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open full lesson' })).toHaveCount(0);

  // The one entry, next to Export and Import.
  await page.getByRole('link', { name: 'AI provider', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'AI provider' })).toBeVisible();
  await expect(page.getByText('No AI provider is set up')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove saved settings' })).toHaveCount(0);

  // The Gemini preset fills its address and model and switches on lessons only.
  await page.getByRole('button', { name: 'Google Gemini' }).click();
  await expect(page.getByLabel('Base URL')).toHaveValue('https://generativelanguage.googleapis.com/v1beta/openai');
  await expect(page.getByLabel('Model')).toHaveValue('gemini-2.5-flash');
  await expect(page.getByLabel('Lessons')).toBeChecked();
  await expect(page.getByLabel('Mastery tests')).not.toBeChecked();

  // Point it at the mock instead, through the custom preset.
  await page.getByRole('button', { name: 'OpenAI-compatible (custom)' }).click();
  await page.getByLabel('Base URL').fill(`${URLS.mockAi}/v1`);
  await page.getByLabel('Model').fill('mock');
  await page.getByLabel('API key').fill(KEY);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('AI settings saved')).toBeVisible();
  await expect(page.getByText('Saved in Harrington')).toBeVisible();
  await expect(page.getByLabel('API key')).toHaveValue('');
  await expect(page.getByLabel('API key')).toHaveAttribute('placeholder', 'Saved, ends in …7Q2w');
  await shot('ai-provider-saved');

  await mockAi.clear();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText(/^Connected\. The provider answered in/)).toBeVisible();
  const log = await mockAi.log();
  expect(log.map((entry) => entry.prompt)).toEqual(['Reply with the single word OK.']);

  // No restart and no reload: lessons are on, the rest say "Not switched on yet".
  await page.evaluate((id) => { window.location.hash = `topic/${id}`; }, ONE.id);
  await expect(page.getByRole('button', { name: 'Open full lesson' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Needs a local AI provider' })).toHaveCount(0);
  await expect(section(page, 'AI teaching helper').getByRole('link', { name: 'Not switched on yet' })).toBeVisible();

  // Remove returns to the environment, which has nothing.
  await page.evaluate(() => { window.location.hash = 'settings'; });
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Remove saved settings' }).click();
  await expect(page.getByText('Saved AI settings removed')).toBeVisible();
  await expect(page.getByText('No AI provider is set up')).toBeVisible();
  await page.evaluate((id) => { window.location.hash = `topic/${id}`; }, ONE.id);
  await expect(page.getByRole('link', { name: 'Needs a local AI provider' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open full lesson' })).toHaveCount(0);

  expect(bodies.length).toBeGreaterThan(5);
  for (const body of bodies) expect(body).not.toContain(KEY);
});

test('a bad base URL is refused with a plain message, and a provider error reads as such', async ({ page, gotoApp, request }) => {
  await gotoApp({ seed: {}, hash: 'settings' });
  await page.getByLabel('Base URL').fill('ftp://example.test/v1');
  await page.getByLabel('Model').fill('mock');
  // The browser's own URL check would stop the form first; skip it to reach the server.
  await page.locator('form').evaluate((form) => { form.noValidate = true; });
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('The base URL must be an http:// or https:// address')).toBeVisible();
  expect((await (await request.get('/api/health')).json()).aiConfigured).toBe(false);

  // Saved, but the provider answers 500: the test result says so without details.
  await request.put('/api/settings/ai', { data: { baseUrl: `${URLS.mockAi}/v1`, model: 'mock' } });
  await page.reload();
  await request.post(`${URLS.mockAi}/__fail`, { data: { count: 1 } });
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Couldn’t connect: the provider answered with an error (HTTP 500).')).toBeVisible();
});
