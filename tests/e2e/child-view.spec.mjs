// The child view overlay opened from the dashboard.
import { test, expect, modal, closeModal, expectToast } from './fixtures.mjs';
import { TOPICS } from './support/family.mjs';
import { MASTERY_QUESTIONS } from './mock-ai-server.mjs';

function overlay(page) {
  // The overlay is the only id-less <div> appended straight to <body>.
  return page.locator('body > div:not([id])').first();
}

async function openChildView(page) {
  await page.getByRole('button', { name: "Rowan Example's view" }).click();
  await expect(overlay(page)).toBeVisible();
}

test('opens score-free with picks, four big buttons, garden and the recorder', async ({ page, gotoApp, shot, errors }) => {
  await gotoApp({ seed: { progress: { [TOPICS.oneToOne.id]: 'learning' } } });
  await openChildView(page);
  const view = overlay(page);
  await expect(view.getByRole('heading', { name: 'Morning, Rowan Example!' })).toBeVisible();
  await expect(view).toContainText('Wednesday');
  await expect(view).toContainText('bud is growing a little every day');

  // No scores of any kind in the overlay itself.
  const text = await view.innerText();
  expect(text).not.toMatch(/%/);
  expect(text).not.toMatch(/\bXP\b/);
  expect(text).not.toMatch(/\bLevel\b/);

  await expect(view.getByRole('region', { name: 'Story time: pick one' }).locator('button[aria-pressed]')).toHaveCount(2);
  await expect(view.getByRole('region', { name: 'Number time: pick one' }).locator('button[aria-pressed]')).toHaveCount(2);
  for (const label of ['Plant something new', 'Memory walk', 'Beat the clock', 'My collection']) {
    await expect(view.getByRole('button', { name: new RegExp(label) })).toBeVisible();
  }
  await expect(view.getByRole('button', { name: 'Tell about my day' })).toBeVisible();

  const garden = view.locator('section[aria-labelledby="garden-h"]');
  await expect(garden.getByRole('heading', { name: 'My garden' })).toBeVisible();
  await expect(garden.locator(':scope > div > div')).toHaveCount(8);
  await expect(garden).toContainText('Sprouting'); // Mathematics has a topic in progress
  await expect(garden).toContainText('Planted');
  await shot('child-view');
  expect(errors).toEqual([]);
});

test('story time and number time picks are saved and show on the dashboard', async ({ page, gotoApp }) => {
  await gotoApp({ seed: {} });
  await openChildView(page);
  const number = overlay(page).getByRole('region', { name: 'Number time: pick one' });
  await expect(number).toContainText('pick one');
  await number.locator('button[aria-pressed]').first().click();
  await expect(number).toContainText('great choice!');
  await expect(number.locator('button[aria-pressed="true"]')).toHaveCount(1);
  const pickName = (await number.locator('button[aria-pressed="true"] span.block').first().innerText()).trim();

  await overlay(page).getByRole('button', { name: 'Back to the grown-up view' }).click();
  await expect(overlay(page)).toHaveCount(0);
  const lane = page.getByRole('group', { name: 'Numeracy: pick one' });
  await expect(lane).toContainText('Rowan Example picked');
  await expect(lane.locator('button[aria-pressed="true"]')).toContainText(pickName);
});

test('big buttons without progress: challenge locked, collection, tell about my day', async ({ page, gotoApp, shot }) => {
  await gotoApp({ seed: {} });
  await openChildView(page);
  const view = overlay(page);

  await view.getByRole('button', { name: /Beat the clock/ }).click();
  await expectToast(page, 'Grow a bloom to unlock challenges!');

  await view.getByRole('button', { name: /My collection/ }).click();
  await expect(view.getByText('My collection', { exact: true })).toBeVisible();
  await expect(view).toContainText('0 of 12 unlocked — collect them all!');
  await shot('child-view-collection', { full: false });
  await view.getByRole('button', { name: 'Back' }).click();
  await expect(view.getByRole('heading', { name: 'Morning, Rowan Example!' })).toBeVisible();

  await view.getByRole('button', { name: 'Tell about my day' }).click();
  await expect(modal(page).getByRole('heading', { name: 'Record conversation' })).toBeVisible();
  await expect(modal(page)).toContainText('Capture a lesson discussion, then link it to a topic.');
  await shot('child-view-tell-about-my-day', { full: false });
  await closeModal(page);

  // "Grown-ups" has no PIN on main yet (HAR-15 pending).
  await view.getByRole('button', { name: 'Back to the grown-up view' }).click();
  await expect(overlay(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();
});

test('activities launched from the child view show scores and XP above it (finding)', async ({ page, gotoApp, shot }) => {
  // With the mock provider, "Plant something new" opens a topic mastery test.
  // Passing it shows a percentage and a "Badge unlocked!" popup over the
  // score-free overlay (game.js z-[120] above kidmode z-[95]).
  await gotoApp({ seed: { progress: { [TOPICS.oneToOne.id]: 'learning' } } });
  await openChildView(page);
  await overlay(page).getByRole('button', { name: /Plant something new/ }).click();
  const test = modal(page);
  await expect(test.getByText('Topic check · Mathematics')).toBeVisible();
  await expect(test).toContainText('90% or more');
  await test.getByRole('button', { name: 'Create the test' }).click();
  for (const q of MASTERY_QUESTIONS) {
    const card = test.locator('div.rounded-xl', { hasText: q.q });
    await card.getByRole('button', { name: q.answerText, exact: true }).click();
  }
  await test.getByRole('button', { name: 'Submit & grade' }).click();
  await expect(test.getByText('100%', { exact: true })).toBeVisible();
  await expect(page.getByText('Badge unlocked!')).toBeVisible();
  await expect(page.getByText('First Steps')).toBeVisible();
  await shot('child-view-badge-and-score-over-overlay', { full: false });
});
