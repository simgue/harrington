// Runs against the app server with no AI provider. With HAR-13 every
// AI-backed control is replaced by a quiet "Needs a local AI provider" chip
// that links to the setup instructions, and nothing is saved as if it worked.
import { test, expect, modal, closeModal, nav, childView } from './fixtures.mjs';
import { LEARNERS, TOPICS } from './support/family.mjs';

const ROWAN = LEARNERS.rowan.id;
const ONE = TOPICS.oneToOne;
const AI_HELP_HREF = 'https://github.com/simgue/harrington/blob/main/README.md#optional-local-model-ollama';
const section = (page, title) => page.locator('div.rounded-2xl', { has: page.getByRole('heading', { level: 2, name: title, exact: true }) });
const chips = (scope) => scope.getByRole('link', { name: 'Needs a local AI provider' });

// No old-style "Couldn't … right now" failures anywhere on the page.
async function expectNoFailureCopy(page) {
  await expect(page.getByText(/Couldn.t .* right now|Try again/)).toHaveCount(0);
}

test('health says AI is off and /api/ai answers 503', async ({ request }) => {
  expect((await (await request.get('/api/health')).json()).aiConfigured).toBe(false);
  const res = await request.post('/api/ai', { data: { messages: [{ role: 'user', content: 'hi' }] } });
  expect(res.status()).toBe(503);
});

test('topic page: every AI control becomes the chip, which links to the setup guide', async ({ page, api, gotoApp, shot }) => {
  await gotoApp({ seed: { progress: { [ONE.id]: 'mastered' } }, hash: `topic/${ONE.id}` });
  await expect(page.getByRole('heading', { level: 1, name: ONE.name })).toBeVisible();

  // None of the AI buttons are rendered.
  for (const name of ['Open full lesson', 'Print & go', 'Explain simply', 'Make a mini-quiz', 'Practice recall', 'Retake topic test', 'Try the challenge quiz']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await expect(page.getByText('Get instructions')).toHaveCount(0);

  // Chips: lesson CTA, mastery test, recall, AI helper, and one per activity and game.
  const all = chips(page);
  expect(await all.count()).toBeGreaterThanOrEqual(9);
  for (const chip of await all.all()) {
    await expect(chip).toHaveAttribute('href', AI_HELP_HREF);
    await expect(chip).toHaveAttribute('target', '_blank');
    await expect(chip).toHaveAttribute('rel', /noopener/);
  }
  await expect(chips(section(page, 'Topic mastery test'))).toHaveCount(1);
  await expect(chips(section(page, 'Active recall'))).toHaveCount(1);
  await expect(chips(section(page, 'AI teaching helper'))).toHaveCount(1);
  // Activity ideas keep their text; only the instructions need AI.
  const activities = section(page, 'Activities & games');
  await expect(activities).toContainText('Kitchen counter math');
  expect(await chips(activities).count()).toBeGreaterThanOrEqual(5);

  // Manual status still works without AI.
  await expect(page.getByRole('group', { name: 'Set status' })).toBeVisible();
  await expectNoFailureCopy(page);
  await shot('topic-chips');

  // The chip opens the README's local-model section in a new tab. GitHub is
  // stubbed so the test does not depend on the network.
  await page.context().route('https://github.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>README</title>' }));
  const [popup] = await Promise.all([
    page.context().waitForEvent('page'),
    chips(section(page, 'AI teaching helper')).click(),
  ]);
  await popup.waitForLoadState();
  expect(popup.url()).toBe(AI_HELP_HREF);
  await popup.close();

  const { state } = await api.getState();
  expect(state.tests?.[ROWAN] || []).toHaveLength(0);
  expect(state.challenges?.[ROWAN] || []).toHaveLength(0);
});

test('quest log, calendar, insights, records and recordings show chips', async ({ page, gotoApp, shot }) => {
  await gotoApp({
    seed: {
      records: [
        { type: 'discussion', title: 'Talked about sharing', note: 'Split grapes.' },
        { type: 'recording', title: 'Bedtime counting', transcript: 'one two three', analysis: '<p>Saved earlier advice.</p>' },
      ],
    },
    hash: `graph/Mathematics/${encodeURIComponent('Counting & Cardinality')}`,
  });

  await page.locator('button.skill-node', { hasText: ONE.name }).first().click();
  const log = page.getByRole('complementary', { name: 'Quest log' });
  await expect(log.getByRole('button', { name: 'Open full lesson' })).toHaveCount(0);
  await expect(chips(log)).toHaveCount(1);
  await expect(log.getByRole('button', { name: 'Mark as learning' })).toBeVisible();

  // F19 (fixed by #29): the calendar renders without a provider again.
  await nav(page, 'Calendar').click();
  await expect(page.getByRole('heading', { name: 'Daily Calendar' })).toBeVisible();
  const day = page.locator('div.space-y-5', { has: page.getByText('New today', { exact: true }) });
  for (const name of ['Lesson', 'Test', 'Open lesson']) {
    await expect(day.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  // A chip per topic row and one on the stretch card (nothing is mastered,
  // so there is no refresher or activity card).
  const topics = await day.locator('button.open').count();
  expect(topics).toBeGreaterThan(0);
  await expect(chips(day)).toHaveCount(topics + 1);
  // Planning itself still works.
  await expect(day.getByRole('button', { name: 'Move' }).first()).toBeVisible();
  await expectNoFailureCopy(page);
  await shot('calendar-chips');

  await nav(page, 'Insights').click();
  await expect(page.getByRole('heading', { name: 'Insights' }).first()).toBeVisible();
  const review = page.locator('div.rounded-2xl', { has: page.getByRole('heading', { name: 'Progress review' }) });
  await expect(review.getByRole('button', { name: 'Generate' })).toHaveCount(0);
  await expect(chips(review)).toHaveCount(1);
  await shot('insights-chip', { locator: review });

  await nav(page, 'Records').click();
  const discussion = page.locator('div.rounded-2xl', { hasText: 'Talked about sharing' });
  await expect(discussion.getByRole('button', { name: 'Analyze & get advice' })).toHaveCount(0);
  await expect(chips(discussion)).toHaveCount(1);
  // An analysis saved earlier still shows, without Regenerate.
  const recording = page.locator('div.rounded-2xl', { hasText: 'Bedtime counting' });
  await expect(recording).toContainText('Saved earlier advice.');
  await expect(recording.getByRole('button', { name: 'Regenerate' })).toHaveCount(0);
  await shot('records-chips');

  await nav(page, 'Dashboard').click();
  await page.getByRole('button', { name: /Recordings folder/ }).click();
  await expect(modal(page).getByRole('button', { name: 'Regenerate' })).toHaveCount(0);
  await expect(modal(page)).toContainText('Saved earlier advice.');
  await closeModal(page);
});

test('dashboard and child view hide what needs AI', async ({ page, gotoApp, shot }) => {
  await gotoApp({ seed: { progress: { [ONE.id]: 'mastered' } } });
  // No refresher stop on Today's path; the recall card is disabled and says why.
  await expect(page.getByRole('button', { name: /Refresher quiz · / })).toHaveCount(0);
  const recall = page.getByRole('button', { name: /^Active recall/ });
  await expect(recall).toBeDisabled();
  await expect(recall).toContainText('Recall cards need a local AI provider.');
  await expect(page.getByRole('button', { name: /^Spaced practice/ })).toContainText('Mastery tests need a local AI provider.');
  await shot('dashboard-no-ai', { full: false });

  await page.getByRole('button', { name: "Rowan Example's view" }).click();
  const view = childView(page);
  await expect(view.getByRole('button', { name: /Plant something new/ })).toBeVisible();
  await expect(view.getByRole('button', { name: /My collection/ })).toBeVisible();
  await expect(view.getByRole('button', { name: /Memory walk/ })).toHaveCount(0);
  await expect(view.getByRole('button', { name: /Beat the clock/ })).toHaveCount(0);
  // No provider wording in front of the child.
  await expect(view.getByText(/AI provider/)).toHaveCount(0);
  await shot('child-view-no-ai', { full: false });
});

test('the guide still labels the AI features', async ({ page, gotoApp }) => {
  await gotoApp({ seed: {} });
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Guide' }).click();
  expect(await modal(page).getByText('Needs a local AI provider; see the README.').count()).toBeGreaterThan(3);
});


// Saved lessons open without a provider (HAR-13 review follow-up). The entries
// are seeded straight into this server's lesson cache, as an earlier run with a
// provider would have left them. A topic no other test here opens keeps the
// chip checks above unaffected.
const SAVED = TOPICS.rote100;
const SAVED_LESSON = {
  objective: 'Say the counting numbers in order to 100',
  duration: '15 minutes',
  teach: [{ title: 'Count by tens first', say: 'Ten, twenty, thirty…', do: 'Point at a hundred chart' }],
};
const SAVED_SHEET = { printables: [{ type: 'worksheet', title: 'Fill the hundred chart', content: { instructions: 'Write the missing numbers.', problems: ['41, 42, __, 44'] } }] };

async function seedSaved(request) {
  for (const [key, value] of [[`topic:${SAVED.id}`, SAVED_LESSON], [`print:${SAVED.id}`, SAVED_SHEET]]) {
    const res = await request.put(`/api/lessons/${encodeURIComponent(key)}`, { data: value });
    expect(res.status()).toBe(204);
  }
}

test('a saved lesson opens from the topic page as "Open saved lesson", with no AI call', async ({ page, request, gotoApp, shot }) => {
  await seedSaved(request);
  let aiCalls = 0;
  page.on('request', (req) => { if (new URL(req.url()).pathname === '/api/ai') aiCalls += 1; });
  await gotoApp({ seed: {}, hash: `topic/${SAVED.id}` });
  await expect(page.getByRole('heading', { level: 1, name: SAVED.name })).toBeVisible();

  const open = page.getByRole('button', { name: 'Open saved lesson', exact: true });
  await expect(open).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open full lesson', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Print & go', exact: true })).toBeVisible();
  await shot('topic-saved-lesson', { full: false });

  await open.click();
  await expect(modal(page)).toContainText(SAVED_LESSON.objective);
  await expect(modal(page)).toContainText('Count by tens first');
  // Regenerate still needs a provider.
  await expect(modal(page).getByRole('button', { name: 'Generate a different version' })).toHaveCount(0);
  await expect(chips(modal(page))).toHaveCount(1);
  await closeModal(page);
  expect(aiCalls).toBe(0);
});

test('the Records page shelves saved lessons and printables, and they open with no AI call', async ({ page, request, gotoApp }) => {
  await seedSaved(request);
  // Fails the lesson validator, so it is never offered.
  expect((await request.put(`/api/lessons/${encodeURIComponent(`topic:${TOPICS.howMany.id}`)}`, { data: { objective: 'no steps', teach: [] } })).status()).toBe(204);
  let aiCalls = 0;
  page.on('request', (req) => { if (new URL(req.url()).pathname === '/api/ai') aiCalls += 1; });
  await gotoApp({ seed: {} });
  await nav(page, 'Records').click();

  const shelf = page.getByRole('region', { name: 'Saved lessons' });
  await expect(shelf).toBeVisible();
  await expect(shelf.getByRole('listitem').filter({ hasText: SAVED.name })).toHaveCount(2);
  await expect(shelf).not.toContainText(TOPICS.howMany.name);

  await shelf.getByRole('button', { name: `Open Lesson: ${SAVED.name}` }).click();
  await expect(modal(page)).toContainText(SAVED_LESSON.objective);
  await closeModal(page);

  await shelf.getByRole('button', { name: `Open Print & go: ${SAVED.name}` }).click();
  await expect(modal(page)).toContainText('Fill the hundred chart');
  await closeModal(page);
  expect(aiCalls).toBe(0);
});
