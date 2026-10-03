// 390×844 phone viewport: every route renders without sideways scrolling, and
// the phone-only chrome (top bar, bottom nav) works.
import { test, expect, modal, closeModal, noHorizontalOverflow, childView, leaveChildView } from './fixtures.mjs';
import { TOPICS } from './support/family.mjs';

const ROUTES = [
  ['dashboard', ''],
  ['calendar', 'calendar'],
  ['world-map', 'graph'],
  ['skill-tree', `graph/Mathematics/${encodeURIComponent('Counting & Cardinality')}`],
  ['topic', `topic/${TOPICS.oneToOne.id}`],
  ['records', 'records'],
  ['insights', 'insights'],
];

for (const [name, hash] of ROUTES) {
  test(`no horizontal overflow: ${name}`, async ({ page, gotoApp, shot, errors }) => {
    await gotoApp({
      seed: { progress: { [TOPICS.oneToOne.id]: 'learning' }, records: [{ type: 'observation', title: 'Counted the stairs out loud', note: 'Got to 12.', rating: 4, topicId: TOPICS.oneToOne.id }] },
      hash,
    });
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await noHorizontalOverflow(page);
    await shot(name, { full: name !== 'dashboard' && name !== 'topic' });
    expect(errors).toEqual([]);
  });
}

test('no horizontal overflow: list view drill-down', async ({ page, api, gotoApp, shot }) => {
  await gotoApp({ seed: { extra: { graphView: 'list' } }, hash: `graph/Mathematics/${encodeURIComponent('Counting & Cardinality')}/5` });
  await expect(page.getByRole('heading', { level: 1, name: 'Counting & Cardinality' })).toBeVisible();
  await noHorizontalOverflow(page);
  await shot('list-section', { full: false });
});

test('no horizontal overflow: child view and the quest log', async ({ page, gotoApp, shot }) => {
  await gotoApp({ seed: {} });
  await page.getByRole('button', { name: "Rowan Example's view" }).click();
  await expect(childView(page)).toBeVisible();
  await noHorizontalOverflow(page);
  await shot('child-view', { full: false });
  await leaveChildView(page);

  await page.goto(`/#graph/Mathematics/${encodeURIComponent('Counting & Cardinality')}`);
  await page.locator('button.skill-node', { hasText: TOPICS.oneToOne.name }).first().click();
  await expect(page.getByRole('complementary', { name: 'Quest log' })).toBeVisible();
  await noHorizontalOverflow(page);
  await shot('quest-log', { full: false });
});

test('bottom navigation, the top-bar guide and the compact learner switcher', async ({ page, gotoApp, shot }) => {
  await gotoApp({ seed: {} });
  const bottom = page.getByRole('navigation', { name: 'Main' });
  await expect(bottom.getByRole('button')).toHaveCount(5);
  for (const [label, heading] of [['Calendar', 'Daily Calendar'], ['Map', 'Curriculum realms'], ['Records', 'Records'], ['Insights', 'Teacher Insights'], ['Dashboard', "Rowan Example's Wednesday"]]) {
    await bottom.getByRole('button', { name: label }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
    await expect(bottom.getByRole('button', { name: label })).toHaveAttribute('aria-current', 'page');
  }
  await page.getByRole('button', { name: 'Open the guide' }).click();
  await expect(modal(page).getByRole('heading', { name: 'How Harrington works' })).toBeVisible();
  await noHorizontalOverflow(page);
  await shot('guide', { full: false });
  await closeModal(page);

  await page.getByRole('button', { name: 'Switch learner' }).click();
  await expect(modal(page).getByRole('heading', { name: 'Students' })).toBeVisible();
  await shot('learner-switcher', { full: false });
  await closeModal(page);
});

test('export and import are not reachable on a phone (finding F6)', async ({ page, gotoApp }) => {
  await gotoApp({ seed: {} });
  // HAR-10 put them in the desktop sidebar's family box only.
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Import', exact: true })).toHaveCount(0);
});

test('the top-bar bell: open, filter by learner, dismiss, and the 30-day backup snooze (HAR-27)', async ({ page, api, gotoApp, shot }) => {
  // Wednesday 7 October 2026, 15:30 (UTC in the browser): today's picks are due.
  const at = (iso) => page.clock.setFixedTime(new Date(iso));
  await at('2026-10-07T15:30:00Z');
  await gotoApp({ seed: { extra: { dismissedAlerts: { welcome: Date.parse('2026-10-01T00:00:00Z') } } } });
  const bell = page.locator('header').getByRole('button', { name: /^Notifications/ });
  await expect(bell).toBeVisible();
  // Rowan's and Sage's picks, and the missing backup (Wren, 3, has nothing to pick).
  await expect(bell).toHaveAccessibleName('Notifications, 3 new');
  await bell.click();
  const m = modal(page);
  await expect(m.getByLabel('Show')).toHaveValue('s_e2e_rowan');
  await expect(m.getByText("Today's picks are still open for Rowan Example")).toBeVisible();
  await expect(m.getByText('No backup recorded')).toBeVisible();
  await expect(m.getByText("Today's picks are still open for Sage Example")).toHaveCount(0);
  await noHorizontalOverflow(page);
  await shot('notifications', { full: false });

  await m.getByLabel('Show').selectOption('all');
  await m.getByRole('button', { name: "Dismiss: Today's picks are still open for Sage Example" }).click();
  await expect(m.getByText("Today's picks are still open for Sage Example")).toHaveCount(0);
  await m.getByRole('button', { name: 'Dismiss: No backup recorded' }).click();
  await expect(m.locator('#list > div')).toHaveCount(1);
  await closeModal(page);
  await expect(bell).toHaveAccessibleName('Notifications, 1 new');
  await api.waitForState((s) => s.dismissedAlerts?.['backup:none'] && s.dismissedAlerts?.['picks:s_e2e_sage:2026-10-07']);

  // 29 days later (a Thursday morning, picks not due yet) the backup note stays quiet...
  await at('2026-11-05T10:00:00Z');
  await page.reload();
  await expect(bell).toHaveAccessibleName('Notifications');
  // ...and after 30 days it comes back once.
  await at('2026-11-06T10:00:00Z');
  await page.reload();
  await expect(bell).toHaveAccessibleName('Notifications, 1 new');
  await bell.click();
  await expect(modal(page).getByText('No backup recorded')).toBeVisible();
});
