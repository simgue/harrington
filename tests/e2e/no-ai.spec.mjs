// Runs against the app server with no AI provider: every AI-backed button must
// fail closed with a message, and nothing must be saved as if it had worked.
import { test, expect, modal, closeModal, nav } from './fixtures.mjs';
import { LEARNERS, TOPICS } from './support/family.mjs';

const ROWAN = LEARNERS.rowan.id;
const ONE = TOPICS.oneToOne;
const section = (page, title) => page.locator('div.rounded-2xl', { has: page.getByRole('heading', { level: 2, name: title, exact: true }) });

test('health says AI is off and /api/ai answers 503', async ({ request }) => {
  expect((await (await request.get('/api/health')).json()).aiConfigured).toBe(false);
  const res = await request.post('/api/ai', { data: { messages: [{ role: 'user', content: 'hi' }] } });
  expect(res.status()).toBe(503);
});

test('topic page: every AI button shows its not-configured or failure message (finding F10)', async ({ page, api, gotoApp, shot }) => {
  await gotoApp({ seed: { progress: { [ONE.id]: 'mastered' } }, hash: `topic/${ONE.id}` });

  await page.getByRole('button', { name: 'Open full lesson' }).click();
  await expect(modal(page).getByText('AI is not configured.')).toBeVisible();
  await shot('lesson-not-configured', { full: false });
  await closeModal(page);

  await page.getByRole('button', { name: 'Print & go' }).click();
  await expect(modal(page).getByText('Couldn’t prepare the materials right now.')).toBeVisible();
  await shot('print-and-go-failed', { full: false });
  await closeModal(page);

  const helper = section(page, 'AI teaching helper');
  await helper.getByRole('button', { name: 'Explain simply' }).click();
  await expect(helper.getByText("Couldn't generate that right now. Please try again.")).toBeVisible();
  await helper.getByRole('button', { name: 'Make a mini-quiz' }).click();
  await expect(helper.getByText("Couldn't generate that right now. Please try again.")).toBeVisible();
  await shot('ai-helper-failed', { locator: helper });

  // Activity instructions reuse the lesson error block (says "lesson": finding).
  await section(page, 'Activities & games').getByRole('button', { name: /Kitchen counter math/ }).click();
  await expect(modal(page).getByText('Couldn’t create the lesson right now.')).toBeVisible();
  await closeModal(page);

  await section(page, 'Active recall').getByRole('button', { name: 'Practice recall' }).click();
  await expect(modal(page).getByText("Couldn't load recall cards.")).toBeVisible();
  await closeModal(page);

  await section(page, 'Topic mastery test').getByRole('button', { name: 'Retake topic test' }).click();
  await modal(page).getByRole('button', { name: 'Create the test' }).click();
  await expect(modal(page).getByText('Couldn’t build the test right now.')).toBeVisible();
  await shot('mastery-test-failed', { full: false });
  await closeModal(page);

  await section(page, 'Topic mastery test').getByRole('button', { name: 'Try the challenge quiz' }).click();
  await modal(page).getByRole('button', { name: 'Start challenge' }).click();
  await expect(modal(page).getByText("Couldn't build the challenge. Try again.")).toBeVisible();
  await closeModal(page);

  // Nothing was recorded as a result.
  const { state } = await api.getState();
  expect(state.tests?.[ROWAN] || []).toHaveLength(0);
  expect(state.challenges?.[ROWAN] || []).toHaveLength(0);
});

test('records, recordings, insights, calendar and child view fail closed too', async ({ page, gotoApp, shot }) => {
  await gotoApp({
    seed: {
      records: [
        { type: 'discussion', title: 'Talked about sharing', note: 'Split grapes.' },
        { type: 'recording', title: 'Bedtime counting', transcript: 'one two three' },
      ],
    },
  });
  await nav(page, 'Records').click();
  await page.locator('div.rounded-2xl', { hasText: 'Talked about sharing' }).getByRole('button', { name: 'Analyze & get advice' }).click();
  await expect(modal(page).getByText("Couldn't analyze this right now. Please try again.")).toBeVisible();
  await closeModal(page);

  await nav(page, 'Dashboard').click();
  await page.getByRole('button', { name: /Recordings folder/ }).click();
  await modal(page).getByRole('button', { name: 'Analyze & get advice' }).click();
  await expect(modal(page).getByText("Couldn't analyze right now.")).toBeVisible();
  await closeModal(page);

  await nav(page, 'Insights').click();
  const review = page.locator('div.rounded-2xl', { has: page.getByRole('heading', { name: 'Progress review' }) });
  await review.getByRole('button', { name: 'Generate' }).click();
  await expect(review.getByText("Couldn't generate feedback right now. Please try again.")).toBeVisible();
  await shot('insights-review-failed', { locator: review });

  await nav(page, 'Calendar').click();
  await page.getByRole('button', { name: 'Open lesson' }).click();
  await expect(modal(page).getByText('AI is not configured.')).toBeVisible();
  await closeModal(page);
  await page.getByRole('button', { name: 'Get instructions' }).click();
  await expect(modal(page).getByText('Couldn’t create the lesson right now.')).toBeVisible();
  await closeModal(page);

  await nav(page, 'Dashboard').click();
  await page.getByRole('button', { name: "Rowan Example's view" }).click();
  await page.getByRole('button', { name: /Memory walk/ }).click();
  await expect(modal(page).getByText("Couldn't load recall cards.")).toBeVisible();
  await shot('child-view-memory-walk-failed', { full: false });
});

test('the quest log lesson button and the AI copy in the guide', async ({ page, gotoApp }) => {
  await gotoApp({ seed: {}, hash: `graph/Mathematics/${encodeURIComponent('Counting & Cardinality')}` });
  await page.locator('button.skill-node', { hasText: ONE.name }).first().click();
  await page.getByRole('complementary', { name: 'Quest log' }).getByRole('button', { name: 'Open full lesson' }).click();
  await expect(modal(page).getByText('AI is not configured.')).toBeVisible();
  await closeModal(page);

  // The shell banner and the guide tell the parent AI is off.
  await expect(page.getByText('AI and shared-family features are not connected yet')).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Guide' }).click();
  expect(await modal(page).getByText('Needs a local AI provider; see the README.').count()).toBeGreaterThan(3);
});
