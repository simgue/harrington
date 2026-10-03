// Level-set workbook (HAR-24): one numeracy sitting for a six-year-old on the
// server with no AI provider. Start at age 5, answer the sheet (one Not yet,
// one Unsure, the rest Yes), reload mid-sheet to resume, print the sheet,
// save, follow any foundations sheet, reach the frontier, and undo a sheet.
import { test, expect, modal, nav, expectToast } from './fixtures.mjs';
import { LEARNERS } from './support/family.mjs';

const ROWAN = LEARNERS.rowan.id;
const radios = (page) => page.getByRole('radiogroup');

test('one workbook sitting: answer, resume, print, save, frontier, undo', async ({ page, api, gotoApp, shot, errors }) => {
  await gotoApp({ seed: {} });
  await page.getByRole('button', { name: 'Switch learner' }).first().click();
  await modal(page).getByRole('button', { name: 'Level-set workbook for Rowan Example' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Level-set workbook' })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#levelset/${ROWAN}$`));

  await page.getByRole('tab', { name: /Numeracy/ }).click();
  await expect(page.getByText('Starts with the age 5 topics')).toBeVisible();
  await page.getByRole('button', { name: 'Start the numeracy workbook' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Numeracy: age 5 sheet' })).toBeVisible();
  await expect(page.getByText(/This sitting: \d+ min/)).toBeVisible();
  const groups = radios(page);
  const n = await groups.count();
  expect(n).toBeGreaterThan(5);
  // The sheet asks about the child in the third person.
  await expect(page.getByText(/^Can they /).first()).toBeVisible();
  const notYet = await groups.nth(0).getAttribute('aria-label');
  const unsure = await groups.nth(1).getAttribute('aria-label');

  await groups.nth(0).getByRole('radio', { name: 'Not yet' }).click();
  await groups.nth(1).getByRole('radio', { name: 'Unsure' }).click();
  await groups.nth(2).getByRole('radio', { name: 'Yes' }).click();
  await expect(page.getByText(`${n - 3} still to answer.`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save this sheet and continue' })).toBeDisabled();

  // Resume: the answers survive a reload.
  await api.waitForState((s) => Object.keys(s.levelset?.[ROWAN]?.lanes?.numeracy?.answers || {}).length === 3);
  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: 'Numeracy: age 5 sheet' })).toBeVisible();
  await expect(groups.nth(0).getByRole('radio', { name: 'Not yet' })).toHaveAttribute('aria-checked', 'true');
  await expect(groups.nth(1).getByRole('radio', { name: 'Unsure' })).toHaveAttribute('aria-checked', 'true');

  // The printable sheet: the same topics with tick boxes.
  const [sheet] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByRole('button', { name: 'Print this sheet' }).click(),
  ]);
  await sheet.waitForLoadState();
  await expect(sheet.locator('h1')).toHaveText('Numeracy: age 5 sheet');
  await expect(sheet.locator('.row')).toHaveCount(n);
  await expect(sheet.locator('.row').first()).toContainText('☐ Not yet');
  await sheet.close();

  for (let i = 3; i < n; i += 1) await groups.nth(i).getByRole('radio', { name: 'Yes' }).click();
  await expect(page.getByText('All answered.')).toBeVisible();
  await shot('levelset-sheet');
  await page.getByRole('button', { name: 'Save this sheet and continue' }).click();
  await expectToast(page, /Sheet saved: \d+ topics marked mastered\. Undo it from Records\./);

  let state = await api.waitForState((s) => (s.records?.[ROWAN] || []).some((r) => r.placement?.levelset));
  const record = state.records[ROWAN].find((r) => r.placement?.levelset);
  expect(record.title).toMatch(/^Level-set workbook: marked \d+ numeracy topics mastered \(age 5 sheet\)/);
  expect(record.placement.levelset).toEqual({ lane: 'numeracy', sheet: 0 });
  expect(record.placement.topicIds.length).toBeGreaterThanOrEqual(n - 2);
  // HAR-18's scheduler reads the placement source.
  for (const id of record.placement.topicIds) expect(state.progress[ROWAN][id]).toMatchObject({ status: 'mastered', source: 'placement' });
  expect(state.levelset[ROWAN].observe).toHaveLength(1);

  // Any foundations sheet that follows: answer Yes throughout.
  while (await page.getByRole('heading', { level: 2, name: 'Numeracy: foundations to check' }).isVisible()) {
    const m = await groups.count();
    for (let i = 0; i < m; i += 1) await groups.nth(i).getByRole('radio', { name: 'Yes' }).click();
    await page.getByRole('button', { name: 'Save this sheet and continue' }).click();
  }

  // The frontier: the Not yet topic is where to start; the Unsure one waits.
  await expect(page.getByRole('heading', { level: 2, name: 'Numeracy: start here' })).toBeVisible();
  await expect(page.locator('.ls-front')).toContainText(notYet);
  const waiting = page.getByRole('button', { name: new RegExp(unsure.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
  await expect(waiting).toBeVisible();
  await shot('levelset-frontier');
  state = await api.waitForState((s) => s.levelset?.[ROWAN]?.lanes?.numeracy?.done === true);
  expect(state.progress[ROWAN][state.levelset[ROWAN].observe[0]]).toBeUndefined();

  // The Unsure topic opens on its topic page with the observation check.
  await waiting.click();
  await expect(page.getByRole('heading', { level: 1, name: unsure })).toBeVisible();
  await expect(page.getByText('you marked it “Unsure” in the level-set workbook')).toBeVisible();
  await page.goBack();

  // Undo: change the first sheet's answers; its marks are reverted.
  await expect(page.getByRole('heading', { level: 1, name: 'Level-set workbook' })).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Change answers' }).first().click();
  await expectToast(page, 'Sheet open again. Its marks were undone.');
  await expect(page.getByRole('heading', { level: 2, name: 'Numeracy: age 5 sheet' })).toBeVisible();
  state = await api.waitForState((s) => Object.values(s.progress?.[ROWAN] || {}).every((p) => p.status !== 'mastered'));
  expect(state.records[ROWAN].find((r) => r.id === record.id).placement.undoneAt).toBeTruthy();
  expect(state.levelset[ROWAN].observe).toHaveLength(0);

  // Records shows the workbook record as an undone placement.
  await nav(page, 'Records').click();
  await expect(page.locator('div.rounded-2xl', { hasText: 'Level-set workbook: marked' }).first()).toContainText('Placement undone');
  expect(errors.filter((e) => !/status of 404/.test(e))).toEqual([]);
});
