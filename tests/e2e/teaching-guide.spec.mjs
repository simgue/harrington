// Teaching guides: Marble's teaching research on the topic page, with no AI.
// Runs in `desktop` (AI pointed at the mock) and, for the tests tagged
// @mobile, at 390×844 in `mobile`. The no-AI ordering ("Open the teaching
// guide" before the chip) is in no-ai.spec.mjs.
import { test, expect, noHorizontalOverflow } from './fixtures.mjs';
import { TOPICS } from './support/family.mjs';

const ONE = TOPICS.oneToOne; // Mathematics, has research
const HISTORY = { id: 'mt_IR8kIjZn_V', name: "Discovering Tutankhamun's Tomb" }; // History has none

// The first guide request on a fresh server splits the 23.5 MB file (a few seconds).
const SPLIT = { timeout: 30_000 };

test('@mobile a Mathematics topic has a collapsed teaching guide with activities, a check and the credit', async ({ page, gotoApp, shot, errors }) => {
  await gotoApp({ seed: {}, hash: `topic/${ONE.id}` });
  const guide = page.locator('#teaching-guide');
  await expect(guide).toBeVisible(SPLIT);
  await expect(guide.getByRole('heading', { level: 2, name: 'Teaching guide' })).toBeVisible();
  await expect(guide).not.toHaveAttribute('open', '');
  // A comfortable target on a phone.
  const header = guide.locator('summary').first();
  expect((await header.boundingBox()).height).toBeGreaterThanOrEqual(44);

  await header.click();
  await expect(guide).toHaveAttribute('open', '');
  await expect(guide).toContainText('One-to-one correspondence for ages 4–6');
  for (const title of ['Feed the squirrel: tap-count a scattered pile', 'Did Teddy count right? Spot the miscount', 'Count everyday things in structured frames and in daily life']) {
    await expect(guide.getByText(title)).toBeVisible();
  }
  // Each activity opens to its steps, what to notice and the feedback notes.
  await guide.getByText('Feed the squirrel: tap-count a scattered pile').click();
  for (const label of ['Steps', 'What they should notice', 'If they take a wrong turn']) {
    await expect(guide.getByText(label, { exact: true }).first()).toBeVisible();
  }

  await expect(guide.getByRole('heading', { name: 'Check understanding' })).toBeVisible();
  await expect(guide.getByText('Predict, then explain')).toBeVisible();
  await expect(guide.getByText(/Watch Teddy count these 6 buttons/)).toBeVisible();
  for (const label of ['A strong answer', 'Common wrong turns', 'Where they are']) {
    await expect(guide.getByText(label, { exact: true })).toBeVisible();
  }
  for (const level of ['Not yet', 'Getting there', 'Got it']) {
    await expect(guide.getByText(level, { exact: true })).toBeVisible();
  }

  // Sources are plain links that open in a new tab.
  await guide.getByText('Sources (4)').click();
  const sources = guide.getByRole('link', { name: /Common Core State Standards/ });
  await expect(sources).toHaveAttribute('target', '_blank');
  await expect(sources).toHaveAttribute('href', /^https:\/\//);

  // The caveat and the credit close the section.
  await expect(guide).toContainText('Written by AI agents as teaching research and proposed activities; they have not been tested in studies.');
  await expect(guide).toContainText('From the Marble Skill Taxonomy teaching research · © Generative Spark, Inc. (Marble) · CC BY-SA 4.0');
  await expect(guide.getByRole('link', { name: 'License' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/');
  // Internal metadata stays out.
  for (const internal of ['confidence', 'provenance', 'reviewNotes', 'teaching-research plugin']) {
    await expect(guide).not.toContainText(internal);
  }

  // With AI on, the lesson stays the first choice: no guide button in the CTA.
  await expect(page.getByRole('button', { name: 'Open the teaching guide' })).toHaveCount(0);
  await noHorizontalOverflow(page);
  // The viewport only: the open guide is several screens long (size budget).
  await guide.getByRole('heading', { name: 'Check understanding' }).scrollIntoViewIfNeeded();
  await shot('math-guide-open', { full: false });
  expect(errors).toEqual([]);
});

test('@mobile a History topic has no teaching guide and no empty section', async ({ page, gotoApp, errors }) => {
  const listed = page.waitForResponse((res) => res.url().endsWith('/api/taxonomy/research'), SPLIT);
  await gotoApp({ seed: {}, hash: `topic/${HISTORY.id}` });
  await expect(page.getByRole('heading', { level: 1, name: HISTORY.name })).toBeVisible();
  expect((await listed).status()).toBe(200);
  // The list answered: give the page a moment to act on it, then check.
  await page.waitForTimeout(300);
  await expect(page.locator('#teaching-guide')).toHaveCount(0);
  await expect(page.locator('.teaching-guide-slot')).toHaveCount(0);
  await expect(page.getByText('Teaching guide', { exact: true })).toHaveCount(0);
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test('the server serves one topic at a time and never the whole file', async ({ request }) => {
  const one = await request.get(`/api/taxonomy/research/${ONE.id}`, SPLIT);
  expect(one.status()).toBe(200);
  expect((await one.json()).topicId).toBe(ONE.id);
  expect((await request.get(`/api/taxonomy/research/${HISTORY.id}`)).status()).toBe(404);
  expect((await request.get('/api/taxonomy/research/..%2F..%2Ffamily-state')).status()).toBe(400);
  expect((await request.get('/api/taxonomy/teaching-research.json')).status()).toBe(404);
});
