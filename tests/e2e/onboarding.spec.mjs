// First run: the add-a-learner form, the welcome tour and the guide.
import { test, expect, modal, closeModal, expectToast } from './fixtures.mjs';
import { FIXED_YEAR } from './support/env.mjs';

test.describe('first run', () => {
  test.use({ tour: true });

  test('first-run form creates a learner, then the tour appears once', async ({ page, api, gotoApp, shot, errors }) => {
    await gotoApp({ seed: null });
    await expect(page.getByRole('heading', { name: 'Add your first student' })).toBeVisible();
    await expect(page.getByText('Add a learner to get started. There is no account to create.')).toBeVisible();
    await expect(page.getByText('Runs on this computer only. Nothing leaves your home unless you configure an AI provider.')).toBeVisible();
    await expect(page.getByPlaceholder('e.g. Sample Learner')).toBeVisible();
    // HAR-22: any year from 1990 to this year, and an optional birth month.
    const year = page.getByRole('spinbutton', { name: 'Birth year' });
    await expect(year).toHaveAttribute('min', '1990');
    await expect(year).toHaveAttribute('max', String(FIXED_YEAR));
    const month = page.getByRole('combobox', { name: /Birth month/ });
    await expect(month).toHaveValue('');
    await expect(month.locator('option')).toHaveCount(13);
    await shot('first-run-form');

    // The form is required: submitting empty stays put.
    await page.getByRole('button', { name: 'Set up their learning space' }).click();
    await expect(page.getByRole('heading', { name: 'Add your first student' })).toBeVisible();

    await page.getByPlaceholder('e.g. Sample Learner').fill('Rowan Example');
    await year.fill(String(FIXED_YEAR - 6));
    await month.selectOption({ label: 'March' });
    await shot('first-run-form-filled');
    await page.getByRole('button', { name: 'Set up their learning space' }).click();
    await expectToast(page, "Rowan Example's learning space is ready");
    await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();

    // The learner reaches the server.
    const state = await api.waitForState((s) => s.students?.length === 1);
    expect(state.students[0]).toMatchObject({ name: 'Rowan Example', birthYear: FIXED_YEAR - 6, birthMonth: 3, startDate: '2026-10-07' });

    // The tour opens on its own after the first render.
    const tour = modal(page);
    await expect(tour.getByRole('heading', { name: 'Welcome to Harrington' })).toBeVisible();
    await expect(tour.getByRole('button', { name: 'Back' })).toBeHidden();
    await shot('welcome-tour-first-slide', { full: false });

    // Next walks the nine slides; the last button says Start learning.
    const titles = ['Dashboard', 'Child view', 'Map', 'Growth stages', 'Calendar', 'Records & recordings', 'Insights', 'Lessons, tests & more', 'Guide'];
    for (const title of titles) {
      await tour.getByRole('button', { name: 'Next' }).click();
      await expect(tour.getByRole('heading', { name: title })).toBeVisible();
      if (title === 'Lessons, tests & more') await shot('welcome-tour-ai-slide', { full: false });
    }
    await expect(tour.getByRole('button', { name: 'Back' })).toBeVisible();
    await tour.getByRole('button', { name: 'Back' }).click();
    await expect(tour.getByRole('heading', { name: 'Lessons, tests & more' })).toBeVisible();
    await tour.getByRole('button', { name: 'Next' }).click();
    await tour.getByRole('button', { name: 'Start learning' }).click();
    await expect(page.locator('#modal-root > div')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('harrington:welcomeSeen'))).toBe('1');

    // Once seen, a reload does not show it again.
    await page.reload();
    await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.getByRole('heading', { name: 'Welcome to Harrington' })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('Skip closes the tour and remembers it', async ({ page, gotoApp }) => {
    await gotoApp({ seed: { learners: ['rowan'] } });
    const tour = modal(page);
    await expect(tour.getByRole('heading', { name: 'Welcome to Harrington' })).toBeVisible();
    await tour.getByRole('button', { name: 'Skip' }).click();
    await expect(page.locator('#modal-root > div')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('harrington:welcomeSeen'))).toBe('1');
    await page.reload();
    await page.waitForTimeout(800);
    await expect(page.getByRole('heading', { name: 'Welcome to Harrington' })).toHaveCount(0);
  });
});

test('Guide modal, tour replay and the printable guide', async ({ page, gotoApp, shot, context }) => {
  await gotoApp({ seed: { learners: ['rowan'] } });
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Guide' }).click();
  const guide = modal(page);
  await expect(guide.getByRole('heading', { name: 'How Harrington works' })).toBeVisible();
  await expect(guide.getByText('What works today, and what needs an AI provider')).toBeVisible();
  // Every AI-backed feature carries the same line.
  await expect(guide.getByText('Needs a local AI provider; see the README.').first()).toBeVisible();

  // GUIDE.md is served and offered as a download.
  const link = guide.getByRole('link', { name: 'Download the written guide (GUIDE.md)' });
  await expect(link).toHaveAttribute('download', 'Harrington-GUIDE.md');
  const md = await page.request.get('/docs/GUIDE.md');
  expect(md.status()).toBe(200);
  expect(await md.text()).toContain('Harrington');

  // "Download the full guide (PDF)" opens a printable page in a new window.
  await context.addInitScript(() => { window.print = () => { window.__printed = true; }; });
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    guide.getByRole('button', { name: 'Download the full guide (PDF)' }).click(),
  ]);
  await expect(popup.getByRole('heading', { name: 'Complete Feature Guide' })).toBeVisible();
  await expect(popup.getByText('Marble Skill Taxonomy (v1)').first()).toBeVisible();
  await popup.setViewportSize({ width: 900, height: 1100 });
  await shot('printable-guide', { target: popup, full: false });
  await popup.close();

  // Replay tour swaps the guide for the tour.
  await guide.getByRole('button', { name: 'Replay tour' }).click();
  await expect(modal(page).getByRole('heading', { name: 'Welcome to Harrington' })).toBeVisible();
  await closeModal(page);
});
