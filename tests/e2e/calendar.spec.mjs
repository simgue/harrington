// The daily calendar: month grid, start date, day panel, done, extras, moves.
import { test, expect, modal, nav, expectToast } from './fixtures.mjs';
import { LEARNERS, TOPICS } from './support/family.mjs';

const ROWAN = LEARNERS.rowan.id;

async function openCalendar(page, gotoApp, seed = {}) {
  await gotoApp({ seed });
  await nav(page, 'Calendar').click();
  await expect(page.getByRole('heading', { name: 'Daily Calendar' })).toBeVisible();
}

const dayCell = (page, day) => page.locator('div.grid-cols-7 > button').filter({ has: page.locator('span > span', { hasText: new RegExp(`^${day}$`) }) }).first();
const dayPanel = (page) => page.locator('div.space-y-5', { has: page.getByRole('button', { name: /^(Mark done|Done)$/ }) });

test('month grid, navigation, start date and the day panel, refresher included (finding F5)', async ({ page, gotoApp, shot, errors }) => {
  await openCalendar(page, gotoApp);
  await expect(page.getByText('A day-by-day learning track for')).toContainText('Rowan Example');
  await expect(page.getByText('Track starts')).toBeVisible();
  await expect(page.getByText('Wednesday, October 7, 2026')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible();
  for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) await expect(page.getByText(d, { exact: true })).toBeVisible();

  // Today is selected; it's a school day with new topics and refreshers.
  const panel = dayPanel(page);
  await expect(panel.getByRole('heading', { name: 'Wednesday, October 7' })).toBeVisible();
  await expect(panel).toContainText('School day');
  await expect(panel).toContainText('New today');
  expect(await panel.locator('button.open').count()).toBeGreaterThan(0);
  await expect(panel).toContainText('REFRESHER QUIZ');
  await expect(panel).toContainText(/ACTIVITY|GAME/);
  await expect(panel).toContainText('STRETCH');
  await shot('calendar-month');

  // Month navigation.
  await page.locator('#prev').click();
  await expect(page.getByRole('heading', { name: 'September 2026' })).toBeVisible();
  await page.locator('#next').click();
  await page.locator('#next').click();
  await expect(page.getByRole('heading', { name: 'November 2026' })).toBeVisible();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible();

  // Weekend and before-the-track days explain themselves.
  await dayCell(page, 10).click();
  await expect(dayPanel(page)).toContainText('Weekend');
  await expect(dayPanel(page)).toContainText('A day off — perfect for a refresher below.');
  await dayCell(page, 6).click();
  await expect(dayPanel(page)).toContainText('Outside the track');

  // Change the start date (the native picker is hidden; set it as the picker would).
  await page.locator('#startpick').evaluate((input) => { input.value = '2026-10-12'; input.dispatchEvent(new Event('change')); });
  await expectToast(page, 'Start date updated — track rescheduled');
  await expect(page.getByText('Monday, October 12, 2026')).toBeVisible();
  await expect(dayPanel(page).getByRole('heading', { name: 'Monday, October 12' })).toBeVisible();
  await dayCell(page, 8).click();
  await expect(dayPanel(page)).toContainText('Outside the track');
  await expect(dayPanel(page)).toContainText('This date is outside the 5–13 track.');
  expect(errors).toEqual([]);
});

test('mark a day done and reopen it', async ({ page, api, gotoApp }) => {
  await openCalendar(page, gotoApp);
  await dayCell(page, 8).click();
  await dayPanel(page).getByRole('button', { name: 'Mark done' }).click();
  await expectToast(page, 'Day marked complete');
  await expect(dayPanel(page).getByRole('button', { name: 'Done' })).toBeVisible();
  await api.waitForState((s) => s.plan?.[ROWAN]?.done?.['2026-10-08']);
  await dayPanel(page).getByRole('button', { name: 'Done' }).click();
  await expectToast(page, 'Day reopened');
  await expect(dayPanel(page).getByRole('button', { name: 'Mark done' })).toBeVisible();
});

test('add an extra of each kind, open one, remove one; Extra practice opens a lesson (finding F8)', async ({ page, api, gotoApp, shot }) => {
  await openCalendar(page, gotoApp);
  const kinds = [['Extra practice', 'Practice'], ['Re-teach lesson', 'Extra lesson'], ['Re-test', 'Re-test'], ['Challenge', 'Challenge']];
  for (const [kind] of kinds) {
    await dayPanel(page).getByRole('button', { name: 'Add', exact: true }).click();
    const m = modal(page);
    await expect(m.getByRole('heading', { name: 'Add extra for this day' })).toBeVisible();
    // Submitting without a topic is refused.
    if (kind === 'Extra practice') {
      await m.getByRole('button', { name: 'Add to day' }).click();
      await expectToast(page, 'Pick a topic first');
    }
    await m.getByPlaceholder('Search topics…').fill('one-to-one');
    await m.getByRole('button', { name: /One-to-one counting\s*Mathematics/ }).click();
    await m.getByRole('button', { name: kind, exact: true }).click();
    if (kind === 'Challenge') await shot('calendar-add-extra', { full: false });
    await m.getByRole('button', { name: 'Add to day' }).click();
    await expectToast(page, 'Added to 2026-10-07');
  }
  const panel = dayPanel(page);
  for (const [kind, label] of kinds) {
    await expect(panel.getByText(`${kind} · ${TOPICS.oneToOne.name}`)).toBeVisible();
    await expect(panel.getByText(`${label} · Mathematics`).first()).toBeVisible();
  }
  await expect(dayCell(page, 7)).toContainText('+4');
  await shot('calendar-extras');
  const state = await api.waitForState((s) => s.plan?.[ROWAN]?.extras?.['2026-10-07']?.length === 4);
  expect(state.plan[ROWAN].extras['2026-10-07'].map((x) => x.kind)).toEqual(['practice', 'lesson', 'retest', 'challenge']);

  // "Extra practice" opens a lesson, not practice (finding).
  const practiceRow = panel.locator('div.rounded-xl', { hasText: `Extra practice · ${TOPICS.oneToOne.name}` });
  await practiceRow.getByRole('button', { name: 'Open' }).click();
  await expect(modal(page).getByText('Lesson plan · Mathematics')).toBeVisible();
  await page.keyboard.press('Escape');

  // Remove the re-test (the remove button is icon-only).
  const retest = dayPanel(page).locator('div.rounded-xl', { hasText: `Re-test · ${TOPICS.oneToOne.name}` });
  await retest.locator('button.del').click();
  await expect(dayPanel(page).getByText(`Re-test · ${TOPICS.oneToOne.name}`)).toHaveCount(0);
  await expect(dayCell(page, 7)).toContainText('+3');
  await api.waitForState((s) => s.plan?.[ROWAN]?.extras?.['2026-10-07']?.length === 3);
});

test('move a topic to the next school day and to a chosen date', async ({ page, api, gotoApp, shot }) => {
  await openCalendar(page, gotoApp);
  const first = dayPanel(page).locator('button.open').first();
  const name = (await first.locator('span.block').first().innerText()).trim();
  await first.locator('xpath=..').getByRole('button', { name: 'Move' }).click();
  const m = modal(page);
  await expect(m.getByRole('heading', { name: `Move “${name}”` })).toBeVisible();
  await shot('calendar-move-topic', { full: false });
  await m.getByRole('button', { name: 'Push to next school day' }).click();
  await expectToast(page, 'Moved to 2026-10-08');
  await expect(dayPanel(page).getByRole('heading', { name: 'Thursday, October 8' })).toBeVisible();
  await expect(dayPanel(page).getByText(name, { exact: true })).toBeVisible();
  await dayCell(page, 7).click();
  await expect(dayPanel(page).getByText(name, { exact: true })).toHaveCount(0);

  // Pick a date in the form.
  await dayCell(page, 8).click();
  const row = dayPanel(page).locator('button.open', { hasText: name }).locator('xpath=..');
  await row.getByRole('button', { name: 'Move' }).click();
  await modal(page).locator('input[name="date"]').fill('2026-10-14');
  await modal(page).getByRole('button', { name: 'Move topic' }).click();
  await expectToast(page, 'Moved to 2026-10-14');
  await expect(dayPanel(page).getByRole('heading', { name: 'Wednesday, October 14' })).toBeVisible();
  await expect(dayPanel(page).getByText(name, { exact: true })).toBeVisible();
  const state = await api.waitForState((s) => Object.values(s.plan?.[ROWAN]?.moves || {}).includes('2026-10-14'));
  expect(Object.keys(state.plan[ROWAN].moves)).toHaveLength(1);
});

test('refresher, activity and stretch cards open their tools; the footer button does nothing (finding F9)', async ({ page, gotoApp, mockAi }) => {
  await openCalendar(page, gotoApp);
  const panel = dayPanel(page);
  await mockAi.clear();
  await panel.getByRole('button', { name: 'Give refresher quiz' }).click();
  await expect(modal(page).getByText(/Topic check · /)).toBeVisible();
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: 'Get instructions' }).click();
  await expect(modal(page).getByText('How to play', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: 'Open lesson' }).click();
  await expect(modal(page).getByText(/Lesson plan · /)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-root > div')).toHaveCount(0);

  const before = await page.content();
  await panel.getByRole('button', { name: 'Refreshers change each day automatically' }).click();
  await expect(page.locator('#modal-root > div')).toHaveCount(0);
  expect(await page.content()).toBe(before);

  // Topic rows: Lesson and Test buttons.
  const row = panel.locator('button.open').first().locator('xpath=..');
  await row.getByRole('button', { name: 'Test' }).click();
  await expect(modal(page).getByText(/Topic check · /)).toBeVisible();
  await page.keyboard.press('Escape');
  await row.getByRole('button', { name: 'Lesson' }).click();
  await expect(modal(page).getByText(/Lesson plan · /)).toBeVisible();
});
