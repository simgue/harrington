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
// The day panel (rest days have no Mark done button, so find it by its first section).
const dayPanel = (page) => page.locator('div.space-y-5', { has: page.getByText('New today', { exact: true }) });

test('month grid, navigation, start date and the day panel; no refresher before anything is mastered (F5, fixed by HAR-18)', async ({ page, gotoApp, shot, errors }) => {
  await openCalendar(page, gotoApp);
  await expect(page.getByText('A day-by-day learning track for')).toContainText('Rowan Example');
  await expect(page.getByText('Track starts')).toBeVisible();
  await expect(page.getByText('Wednesday, October 7, 2026')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible();
  for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) await expect(page.getByText(d, { exact: true })).toBeVisible();

  // Today is selected; it's a home learning day with new topics. Nothing is
  // mastered yet, so there is no refresher or activity, only the stretch.
  const panel = dayPanel(page);
  await expect(panel.getByRole('heading', { name: 'Wednesday, October 7' })).toBeVisible();
  await expect(panel).toContainText('Home learning day');
  await expect(panel).toContainText('New today');
  expect(await panel.locator('button.open').count()).toBeGreaterThan(0);
  await expect(panel).not.toContainText('REFRESHER QUIZ');
  await expect(panel).toContainText('Refresher quizzes and activities start once Rowan Example has mastered a topic.');
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

  // Weekend days are rest days by default; before the track is outside it.
  await dayCell(page, 10).click();
  await expect(dayPanel(page)).toContainText('Rest day');
  await expect(dayPanel(page)).toContainText('A rest day — nothing is scheduled.');
  await expect(dayPanel(page).getByRole('button', { name: 'Mark done' })).toHaveCount(0);
  await expect(dayPanel(page)).not.toContainText('Daily refreshers');
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

test('refreshers and activities come only from mastered topics (HAR-18)', async ({ page, gotoApp }) => {
  await openCalendar(page, gotoApp, { progress: { [TOPICS.oneToOne.id]: 'mastered' } });
  const panel = dayPanel(page);
  // One topic mastered: the refresher quiz and the activity are both about it.
  const refresher = panel.locator('div.rounded-xl', { hasText: 'REFRESHER QUIZ' });
  await expect(refresher).toContainText(TOPICS.oneToOne.name);
  await expect(panel.locator('div.rounded-xl', { hasText: /\b(ACTIVITY|GAME)\b/ })).toContainText(TOPICS.oneToOne.name);
  await expect(panel).not.toContainText('Refresher quizzes and activities start once');
});

test('home days and breaks: rest days schedule nothing and the track picks up after them (HAR-18)', async ({ page, api, gotoApp, shot }) => {
  await openCalendar(page, gotoApp);
  const todays = await dayPanel(page).locator('button.open span.block').first().innerText();
  await page.getByRole('button', { name: 'Home days & breaks' }).click();
  const m = modal(page);
  await expect(m.getByRole('heading', { name: 'Home days & breaks' })).toBeVisible();
  await expect(m.locator('#days button[aria-pressed="true"]')).toHaveText(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  await expect(m).toContainText('No breaks yet.');
  // Wednesdays off, and a break the week after.
  await m.locator('#days').getByRole('button', { name: 'Wed', exact: true }).click();
  await m.locator('input[name="label"]').fill('Fall break');
  await m.locator('input[name="start"]').fill('2026-10-12');
  await m.locator('input[name="end"]').fill('2026-10-16');
  await m.getByRole('button', { name: 'Add break' }).click();
  await expect(m).toContainText('Fall break');
  await shot('calendar-home-days-and-breaks', { full: false });
  await m.getByRole('button', { name: 'Save', exact: true }).click();
  await expectToast(page, 'Calendar updated — track rescheduled');

  // Today (a Wednesday) is now a rest day; its topic moved to the next home day.
  await expect(dayPanel(page)).toContainText('Rest day');
  await expect(dayPanel(page)).toContainText('A rest day — nothing is scheduled.');
  // Nothing is scheduled inside the break (Oct 12–16) …
  for (const d of [12, 13, 14, 15, 16]) {
    await dayCell(page, d).click();
    await expect(dayPanel(page)).toContainText('Break · Fall break');
    await expect(dayPanel(page)).toContainText('A rest day — nothing is scheduled.');
    await expect(dayPanel(page).locator('button.open')).toHaveCount(0);
  }
  // … and the track picks up on the first home day after it.
  await dayCell(page, 19).click();
  await expect(dayPanel(page)).toContainText('Home learning day');
  expect(await dayPanel(page).locator('button.open').count()).toBeGreaterThan(0);
  await dayCell(page, 8).click();
  await expect(dayPanel(page)).toContainText('Home learning day');
  await expect(dayPanel(page).locator('button.open span.block').first()).toHaveText(todays);
  const state = await api.waitForState((s) => s.settings?.calendar?.breaks?.length === 1);
  expect(state.settings.calendar).toMatchObject({ homeDays: [1, 2, 4, 5], breaks: [{ start: '2026-10-12', end: '2026-10-16', label: 'Fall break' }] });
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

test('add an extra of each kind, open one, remove one; Extra practice opens spaced practice (F8, fixed by HAR-18)', async ({ page, api, gotoApp, shot }) => {
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

  // "Extra practice" opens spaced practice (nothing is due yet).
  const practiceRow = panel.locator('div.rounded-xl', { hasText: `Extra practice · ${TOPICS.oneToOne.name}` });
  await practiceRow.getByRole('button', { name: 'Open' }).click();
  await expect(modal(page).getByText('All caught up!')).toBeVisible();
  await expect(modal(page).getByText(/Lesson plan · /)).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Remove the re-test (F14: the icon-only button is named for the extra).
  await dayPanel(page).getByRole('button', { name: `Remove extra Re-test · ${TOPICS.oneToOne.name}` }).click();
  await expect(dayPanel(page).getByText(`Re-test · ${TOPICS.oneToOne.name}`)).toHaveCount(0);
  await expect(dayCell(page, 7)).toContainText('+3');
  await api.waitForState((s) => s.plan?.[ROWAN]?.extras?.['2026-10-07']?.length === 3);
});

test('move a topic to the next home day and to a chosen date', async ({ page, api, gotoApp, shot }) => {
  await openCalendar(page, gotoApp);
  const first = dayPanel(page).locator('button.open').first();
  const name = (await first.locator('span.block').first().innerText()).trim();
  await first.locator('xpath=..').getByRole('button', { name: 'Move' }).click();
  const m = modal(page);
  await expect(m.getByRole('heading', { name: `Move “${name}”` })).toBeVisible();
  await shot('calendar-move-topic', { full: false });
  await m.getByRole('button', { name: 'Push to next home day' }).click();
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

test('refresher, activity and stretch cards open their tools; the dead footer button is gone (F9, fixed by HAR-18)', async ({ page, gotoApp, mockAi }) => {
  await openCalendar(page, gotoApp, { progress: { [TOPICS.oneToOne.id]: 'mastered' } });
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

  await expect(panel.getByRole('button', { name: 'Refreshers change each day automatically' })).toHaveCount(0);

  // Topic rows: Lesson and Test buttons.
  const row = panel.locator('button.open').first().locator('xpath=..');
  await row.getByRole('button', { name: 'Test' }).click();
  await expect(modal(page).getByText(/Topic check · /)).toBeVisible();
  await page.keyboard.press('Escape');
  await row.getByRole('button', { name: 'Lesson' }).click();
  await expect(modal(page).getByText(/Lesson plan · /)).toBeVisible();
});
