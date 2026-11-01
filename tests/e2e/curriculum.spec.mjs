// The Australian Curriculum (version 9): the learner setting, topic chips,
// the year-level order and the printable coverage report. Runs in `desktop`;
// the tests tagged @mobile also run in `mobile` (390×844).
import { test, expect, modal, expectToast, noHorizontalOverflow, childView } from './fixtures.mjs';
import { TODAY_KEY } from './support/env.mjs';
import { FIXED_YEAR } from './support/env.mjs';
import { learner } from './support/family.mjs';

const NOTICE_START = '© Australian Curriculum, Assessment and Reporting Authority (ACARA) 2009 to present';
// Linked to AC9M2N01 (Year 2 · Number) only.
const ORDERING = { id: 'mt_AQcVRBddko', name: 'Ordering Numbers to 1000' };
// Every topic linked to AC9M2N01.
const AC9M2N01_TOPICS = ['mt_AQcVRBddko', 'mt_VFsuftfvYM', 'mt_F_zEAJ8VIo', 'mt_aPBzD28_mT'];
// Linked to AC9M2A01 (Year 2 · Algebra).
const PATTERNS = { id: 'mt_W3VOAuFwVw', name: 'Describing growing number patterns' };

// Rowan (age 6) set to Australian Curriculum Year 2.
const yearTwo = (extra = {}) => ({
  learners: ['rowan'], active: 'rowan', ...extra,
  extra: { students: [{ ...learner('rowan'), curriculum: { id: 'acara-v9', year: '2' } }], ...(extra.extra || {}) },
});

async function openEdit(page) {
  await page.getByRole('button', { name: 'Switch learner' }).first().click();
  await modal(page).getByRole('button', { name: 'Edit Rowan Example' }).click();
  await expect(modal(page).getByRole('heading', { name: 'Edit learner' })).toBeVisible();
  return modal(page);
}

test('the learner form sets a year level that defaults from age and stays editable @mobile', async ({ page, api, gotoApp, shot, errors }) => {
  await gotoApp({ seed: { learners: ['rowan'], active: 'rowan' } });
  const form = await openEdit(page);
  const year = form.getByLabel('Australian Curriculum year level (optional)');
  await expect(year).toBeDisabled();
  await form.getByLabel('Follow the Australian Curriculum (version 9)').check();
  // Rowan is 6: Year 1 is the usual year for that age.
  await expect(year).toBeEnabled();
  await expect(year).toHaveValue('1');
  await year.selectOption('2');
  await shot('learner-form-year-level', { full: false });
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expectToast(page, 'Learner updated');
  const saved = await api.waitForState((s) => s.students[0].curriculum?.year === '2');
  expect(saved.students[0].curriculum).toEqual({ id: 'acara-v9', year: '2' });

  // Unticking clears it: back to the age-based order.
  const again = await openEdit(page);
  await expect(again.getByLabel('Australian Curriculum year level (optional)')).toHaveValue('2');
  await again.getByLabel('Follow the Australian Curriculum (version 9)').uncheck();
  await again.getByRole('button', { name: 'Save changes' }).click();
  await api.waitForState((s) => s.students[0].curriculum === undefined);
  expect(errors).toEqual([]);
});

test('onboarding can set the year level for the first learner', async ({ page, api, gotoApp }) => {
  await gotoApp({ seed: null });
  await page.locator('input[name="name"]').fill('Rowan Example');
  await page.locator('input[name="birthYear"]').fill(String(FIXED_YEAR - 8));
  await page.getByLabel('Follow the Australian Curriculum (version 9)').check();
  await expect(page.getByLabel('Australian Curriculum year level (optional)')).toHaveValue('3');
  await page.getByRole('button', { name: 'Set up their learning space' }).click();
  const saved = await api.waitForState((s) => s.students?.length === 1);
  expect(saved.students[0].curriculum).toEqual({ id: 'acara-v9', year: '3' });
});

test('a topic shows its Australian codes; a chip opens the text with one ACARA notice @mobile', async ({ page, gotoApp, shot, errors }) => {
  await gotoApp({ seed: yearTwo(), hash: `topic/${ORDERING.id}` });
  const links = page.getByRole('region', { name: 'Australian Curriculum' });
  await expect(links).toContainText('Linked to the Australian Curriculum (version 9)');
  const chip = links.getByRole('button', { name: 'AC9M2N01 · Year 2 · Number' });
  await expect(chip).toBeVisible();
  // In whole CSS pixels, as mobile.spec measures targets: at a fractional
  // scroll offset a 44 px box can read 43.99.
  const box = await chip.boundingBox();
  expect(Math.round(box.height)).toBeGreaterThanOrEqual(44);
  // The notice shows with the codes, once, before any chip is opened.
  await expect(page.getByText(NOTICE_START)).toHaveCount(1);
  await expect(links.getByText(NOTICE_START)).toBeVisible();

  await chip.click();
  await expect(chip).toHaveAttribute('aria-expanded', 'true');
  await expect(links).toContainText('recognise, represent and order numbers to at least 1000');
  await expect(links).toContainText('not a check that the description is met');
  await expect(page.getByText(NOTICE_START)).toHaveCount(1);
  await noHorizontalOverflow(page);
  await shot('topic-chip-open', { locator: links });

  // Tapping again closes it; the notice stays, still once.
  await chip.click();
  await expect(links).not.toContainText('recognise, represent and order numbers to at least 1000');
  await expect(page.getByText(NOTICE_START)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('a topic with no Australian code shows no chips', async ({ page, gotoApp }) => {
  // Rote counting to 100 links to other curricula only.
  await gotoApp({ seed: yearTwo(), hash: 'topic/mt_M5PPDJStGm' });
  await expect(page.getByRole('heading', { name: 'Rote counting to 100' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Australian Curriculum' })).toHaveCount(0);
});

test('Year 2 moves linked topics forward in the map list and the finder, hiding nothing', async ({ page, gotoApp }) => {
  const sectionHash = 'graph/Mathematics/Number%20Representation%20%26%20Place%20Value/7';
  // Without a year: the age order, and no "linked to" note.
  await gotoApp({ seed: { learners: ['rowan'], active: 'rowan', extra: { graphView: 'list' } }, hash: sectionHash });
  const rows = page.locator('main, #app').getByRole('button').filter({ hasText: 'ages ' });
  await expect(rows.first()).toBeVisible();
  const before = await rows.allInnerTexts();
  expect(before.join('\n')).not.toContain('linked to Year 2');

  await gotoApp({ seed: yearTwo({ extra: { graphView: 'list' } }), hash: sectionHash });
  // The same address does not reload the page; load the new family.
  await page.reload();
  await expect(rows.first()).toContainText('linked to Year 2');
  const after = await rows.allInnerTexts();
  expect(after.length).toBe(before.length);
  // Linked rows come first, then the rest.
  const linked = after.map((t) => t.includes('linked to Year 2'));
  expect(linked.indexOf(false) === -1 || linked.slice(linked.indexOf(false)).every((x) => !x)).toBe(true);

  await gotoApp({ seed: yearTwo(), hash: 'find?q=order%20numbers' });
  await expect(page.getByText('Linked to Australian Curriculum Year 2').first()).toBeVisible();
});

test('Records opens the coverage report: counts, statuses and linked topics @mobile', async ({ page, gotoApp, shot, errors }) => {
  const progress = Object.fromEntries(AC9M2N01_TOPICS.map((id) => [id, 'mastered']));
  await gotoApp({
    seed: yearTwo({ progress, records: [{ type: 'observation', title: 'Skip counting by fives', topicId: PATTERNS.id, topicName: PATTERNS.name }] }),
    hash: 'records',
  });
  await page.getByRole('button', { name: /Australian Curriculum coverage/ }).click();
  await expect(page.getByRole('heading', { name: 'Australian Curriculum coverage' })).toBeVisible();
  await expect(page.getByText('Rowan Example · Year 2 · version 9 content descriptions')).toBeVisible();
  const summary = page.getByRole('region', { name: 'Counts by learning area' });
  await expect(summary).toContainText('Year 2: 93 content descriptions');
  for (const area of ['English', 'Health and Physical Education', 'Humanities and Social Sciences', 'Mathematics', 'Science', 'Technologies']) {
    await expect(summary).toContainText(area);
  }
  await noHorizontalOverflow(page);
  await shot('coverage-summary');

  const maths = page.getByRole('button', { name: /^Mathematics/ });
  await expect(maths).toHaveAttribute('aria-expanded', 'false');
  await maths.click();
  await expect(maths).toHaveAttribute('aria-expanded', 'true');
  const item = (code) => page.locator('.cov-item').filter({ hasText: code });
  await expect(item('AC9M2N01').locator('.cov-status')).toHaveText('Linked topics mastered');
  await expect(item('AC9M2N01')).toContainText(ORDERING.name);
  await expect(item('AC9M2A01').locator('.cov-status')).toHaveText('Evidence');
  await expect(item('AC9M2A01')).toContainText('Recorded: record');
  await expect(item('AC9M2M01').locator('.cov-status')).toHaveText('Not yet');
  // The app's own words describe evidence; ACARA's text may say anything.
  await expect(page.locator('.coverage-report > p')).not.toContainText(/achieved|satisf/i);
  await expect(page.getByText('Generated from Harrington records on')).toBeVisible();
  await expect(page.locator('.cov-footer')).toContainText(NOTICE_START);
  await noHorizontalOverflow(page);

  // A linked topic opens its page.
  await item('AC9M2N01').getByRole('link', { name: ORDERING.name }).click();
  await expect(page.getByRole('heading', { name: ORDERING.name })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the coverage report prints without the app around it, every area expanded @mobile', async ({ page, gotoApp, shot }) => {
  await gotoApp({ seed: yearTwo(), hash: 'coverage' });
  await expect(page.getByRole('heading', { name: 'Australian Curriculum coverage' })).toBeVisible();
  // On screen the lists start closed.
  await expect(page.locator('.cov-list').first()).toBeHidden();

  await page.emulateMedia({ media: 'print' });
  for (const nav of await page.getByRole('navigation', { name: 'Main' }).all()) await expect(nav).toBeHidden();
  await expect(page.getByRole('button', { name: 'Print report' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Back to Records' })).toBeHidden();
  await expect(page.getByText('Self-hosted preview')).toBeHidden();
  for (const list of await page.locator('.cov-list').all()) await expect(list).toBeVisible();
  await expect(page.locator('.cov-item')).toHaveCount(93);
  await expect(page.getByText('Rowan Example · Year 2 · version 9 content descriptions')).toBeVisible();
  await expect(page.locator('.cov-footer')).toContainText('alignment by the Marble Skill Taxonomy');
  await expect(page.locator('.cov-footer')).toContainText(NOTICE_START);
  await shot('coverage-print-preview', { full: false });
  await page.emulateMedia({ media: 'screen' });
});

test('a learner without a year sees the report for the year their age suggests', async ({ page, gotoApp }) => {
  await gotoApp({ seed: { learners: ['rowan'], active: 'rowan' }, hash: 'coverage' });
  await expect(page.getByText('Rowan Example · Year 1 · version 9 content descriptions')).toBeVisible();
  await expect(page.getByText('has no Australian Curriculum year set')).toBeVisible();
  await page.getByLabel('Year level').selectOption('F');
  await expect(page.getByText('Rowan Example · Foundation · version 9 content descriptions')).toBeVisible();
});

// The standards list answers 3 s late, as from a slow upstream: the app
// starts without it, and a pick made before it arrives is kept.
async function slowStandards(page) {
  await page.route('**/api/taxonomy/standards/acara-v9.json', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await route.continue();
  });
}
const ROWAN = learner('rowan').id;

test('with the standards list still on its way, the first dashboard pick is kept', async ({ page, api, gotoApp }) => {
  await slowStandards(page);
  await gotoApp({ seed: yearTwo() });
  const literacy = page.getByRole('group', { name: 'Literacy: pick one' });
  const first = literacy.locator('button[aria-pressed]').first();
  await first.click();
  await expect(literacy).toContainText('Rowan Example picked');
  const saved = await api.waitForState((s) => s.daily?.[ROWAN]?.[TODAY_KEY]?.picks?.literacy);
  const day = saved.daily[ROWAN][TODAY_KEY];
  expect(day.offers.literacy).toContain(day.picks.literacy);
  // The list arrives, the dashboard renders again, and the pick stays.
  await page.waitForResponse('**/api/taxonomy/standards/acara-v9.json');
  await expect(literacy).toContainText('Rowan Example picked');
  expect((await api.getState()).state.daily[ROWAN][TODAY_KEY].picks.literacy).toBe(day.picks.literacy);
});

test('with the standards list still on its way, the first pick in the child view is kept', async ({ page, api, gotoApp }) => {
  await slowStandards(page);
  await gotoApp({ seed: yearTwo() });
  await page.getByRole('button', { name: "Rowan Example's view" }).click();
  const story = childView(page).getByRole('region', { name: 'Story time: pick one' });
  const first = story.locator('button[aria-pressed]').first();
  const pickName = (await first.locator('span.block').first().innerText()).trim();
  await first.click();
  await expect(modal(page).getByRole('heading', { name: pickName })).toBeVisible();
  const saved = await api.waitForState((s) => s.daily?.[ROWAN]?.[TODAY_KEY]?.picks?.literacy);
  expect(saved.daily[ROWAN][TODAY_KEY].offers.literacy).toContain(saved.daily[ROWAN][TODAY_KEY].picks.literacy);
});

test('typing during the wait: the list arriving does not empty or blur the onboarding name', async ({ page, gotoApp }) => {
  await slowStandards(page);
  await gotoApp({ seed: null });
  const name = page.locator('input[name="name"]');
  await name.click();
  await name.pressSequentially('Rowan Ex');
  // The list arrives while the field has the focus.
  await page.waitForResponse('**/api/taxonomy/standards/acara-v9.json');
  await page.waitForTimeout(300);
  await expect(name).toHaveValue('Rowan Ex');
  await expect(name).toBeFocused();
  await name.pressSequentially('ample');
  await expect(name).toHaveValue('Rowan Example');
});
