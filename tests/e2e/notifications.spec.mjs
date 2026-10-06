// The notification bell and the guide. The bell's items are computed from the
// family's data (alerts.js): the one-time welcome, a missing or old backup,
// open daily picks after 15:00 on a home day, and a learner with no evidence
// for a week. The e2e server's backup folder is empty, so "No backup recorded"
// shows for every seeded family.
import { test, expect, modal, closeModal } from './fixtures.mjs';
import { FIXED_NOW } from './support/env.mjs';

const DAY = 24 * 60 * 60 * 1000;
const bell = (page) => page.getByRole('button', { name: /^Notifications/ }).first();
const items = (page) => modal(page).locator('#list > div');

test('first run shows the welcome and the missing backup; dismiss all clears them', async ({ page, api, gotoApp, shot }) => {
  await gotoApp({ seed: {} });
  await expect(bell(page)).toHaveAccessibleName('Notifications, 2 new');
  await expect(bell(page)).toContainText('2');
  await bell(page).click();
  const m = modal(page);
  await expect(m.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await expect(items(page)).toHaveCount(2);
  await expect(m.getByText('Welcome to Harrington')).toBeVisible();
  await expect(m.getByText('No backup recorded')).toBeVisible();
  await expect(m.getByRole('link', { name: 'How to set up backups' })).toHaveAttribute('href', /README\.md#backup-and-restore$/);
  await expect(items(page).first()).toContainText('Whole family');
  await shot('notifications-first-run', { full: false });
  await m.getByRole('button', { name: 'Dismiss all' }).click();
  await expect(m).toContainText('Nothing needs you right now.');
  await closeModal(page);
  await expect(bell(page)).toHaveAccessibleName('Notifications');
  const state = await api.waitForState((s) => s.dismissedAlerts?.welcome && s.dismissedAlerts?.['backup:none']);
  expect(state.curriculumSnapshot).toBeUndefined();

  // A later boot brings nothing back.
  await page.reload();
  await expect(bell(page)).toHaveAccessibleName('Notifications');
});

test('dismissing one item leaves the rest', async ({ page, api, gotoApp }) => {
  await gotoApp({ seed: {} });
  await bell(page).click();
  await modal(page).getByRole('button', { name: 'Dismiss: Welcome to Harrington' }).click();
  await expect(items(page)).toHaveCount(1);
  await expect(modal(page).getByText('No backup recorded')).toBeVisible();
  await closeModal(page);
  await expect(bell(page)).toHaveAccessibleName('Notifications, 1 new');
  const state = await api.waitForState((s) => s.dismissedAlerts?.welcome);
  expect(state.dismissedAlerts['backup:none']).toBeUndefined();
});

test('a family that saw the old welcome is not welcomed again', async ({ page, gotoApp }) => {
  await gotoApp({
    seed: { extra: { notifications: [{ id: 'n_old', type: 'welcome', title: 'Your curriculum is ready', body: 'Old', read: true, createdAt: 1 }] } },
  });
  await bell(page).click();
  await expect(items(page)).toHaveCount(1);
  await expect(modal(page).getByText('No backup recorded')).toBeVisible();
  await expect(modal(page).getByText('Your curriculum is ready')).toHaveCount(0);
});

test('the bell is named "Notifications" with the count in words (F13, fixed by HAR-27)', async ({ page, gotoApp }) => {
  await gotoApp({ seed: {} });
  await expect(page.getByRole('button', { name: 'Notifications, 2 new' })).toHaveCount(1);
  // The badge is decoration; the name does not depend on it.
  await expect(bell(page).locator('span[aria-hidden="true"]')).toHaveText('2');
});

test('after 3 pm on a home day, open picks show per learner with a learner filter', async ({ page, api, gotoApp, shot }) => {
  // Wednesday 7 October 2026, 15:30 in the browser's time zone (UTC).
  await page.clock.setFixedTime(new Date('2026-10-07T15:30:00Z'));
  await gotoApp({ seed: { extra: { dismissedAlerts: { welcome: FIXED_NOW.getTime(), 'backup:none': FIXED_NOW.getTime() } } } });
  await bell(page).click();
  const m = modal(page);
  // Active learner first: Rowan, with the other learners behind a link.
  await expect(m.getByLabel('Show')).toHaveValue('s_e2e_rowan');
  await expect(m.getByText("Today's picks are still open for Rowan Example")).toBeVisible();
  await expect(m).toContainText('No literacy or numeracy pick yet today.');
  await expect(m.getByText("Today's picks are still open for Sage Example")).toHaveCount(0);
  // Wren (3) has nothing to choose today (F3), so her picks are not open.
  await expect(m.getByRole('button', { name: /more for other learners: show all/ })).toBeVisible();
  await shot('notifications-open-picks', { full: false });
  await m.getByLabel('Show').selectOption('all');
  await expect(m.getByText("Today's picks are still open for Sage Example")).toBeVisible();
  await m.getByRole('button', { name: "Dismiss: Today's picks are still open for Rowan Example" }).click();
  await expect(m.getByText("Today's picks are still open for Rowan Example")).toHaveCount(0);
  await expect(m.getByText("Today's picks are still open for Wren Example")).toHaveCount(0);
  await api.waitForState((s) => s.dismissedAlerts?.['picks:s_e2e_rowan:2026-10-07']);
});

test('before 3 pm, or with today\'s picks made, nothing is due', async ({ page, gotoApp }) => {
  const dismissed = { welcome: FIXED_NOW.getTime(), 'backup:none': FIXED_NOW.getTime() };
  // FIXED_NOW is 10:30.
  await gotoApp({ seed: { extra: { dismissedAlerts: dismissed } } });
  await expect(bell(page)).toHaveAccessibleName('Notifications');

  await page.clock.setFixedTime(new Date('2026-10-07T15:30:00Z'));
  const picked = { '2026-10-07': { offers: { literacy: ['a'], numeracy: ['b'] }, picks: { literacy: 'a', numeracy: 'b' } } };
  await gotoApp({
    seed: { learners: ['rowan'], extra: { dismissedAlerts: dismissed, daily: { s_e2e_rowan: picked } } },
  });
  await expect(bell(page)).toHaveAccessibleName('Notifications');
});

test('a learner with no record for a week shows "No evidence this week"', async ({ page, gotoApp }) => {
  const old = FIXED_NOW.getTime() - 30 * DAY;
  await gotoApp({
    seed: {
      learners: ['rowan', 'sage'],
      records: [{ type: 'note', title: 'Counting walk', createdAt: FIXED_NOW.getTime() - 8 * DAY }],
      extra: {
        dismissedAlerts: { welcome: old + DAY, 'backup:none': FIXED_NOW.getTime() },
        // Added a month ago; Sage has never had a record.
        students: [
          { id: 's_e2e_rowan', name: 'Rowan Example', birthYear: 2020, color: '#a4473a', createdAt: old, startDate: '2026-09-07' },
          { id: 's_e2e_sage', name: 'Sage Example', birthYear: 2017, color: '#2f6285', createdAt: old, startDate: '2026-09-07' },
        ],
      },
    },
  });
  await expect(bell(page)).toHaveAccessibleName('Notifications, 2 new');
  await bell(page).click();
  const m = modal(page);
  await expect(m.getByText('No evidence this week for Rowan Example')).toBeVisible();
  await expect(m).toContainText('The last record was 8 days ago.');
  await m.getByRole('button', { name: /1 more for other learners/ }).click();
  await expect(m.getByText('No evidence this week for Sage Example')).toBeVisible();
  await expect(m).toContainText('There are no records yet.');
});

test('guide modal from the sidebar and tour replay', async ({ page, gotoApp, shot }) => {
  await gotoApp({ seed: {} });
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Guide' }).click();
  const guide = modal(page);
  await expect(guide.getByRole('heading', { name: 'How Harrington works' })).toBeVisible();
  const list = guide.locator('#list > div');
  await expect(list).toHaveCount(10);
  await expect(list.filter({ hasText: 'Records & recordings' })).toContainText("may send audio to the browser vendor");
  await shot('guide-full', { full: false });
  await guide.getByRole('button', { name: 'Replay tour' }).click();
  const tour = modal(page);
  await expect(tour.getByRole('heading', { name: 'Welcome to Harrington' })).toBeVisible();
  await tour.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('#modal-root > div')).toHaveCount(0);
});
