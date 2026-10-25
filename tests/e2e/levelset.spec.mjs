// Level-set workbook (HAR-24): one numeracy sitting for a six-year-old on the
// server with no AI provider. Each area starts at age 5; answer the first
// sheet (one Not yet, one Unsure, the rest Yes), reload mid-sheet to resume,
// print it, save it (nothing is written), finish the walk, confirm the one
// placement, and undo it by changing an answer.
import { test, expect, modal, nav, expectToast } from './fixtures.mjs';
import { LEARNERS } from './support/family.mjs';

// Console and page errors, except the lesson-cache 404s: without a provider
// the topic page asks /api/lessons/<key> whether anything was saved, and a
// 404 is the answer "nothing yet". Anything else still fails the test.
function pageErrors(page) {
  const out = [];
  page.on('pageerror', (error) => out.push(`pageerror: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const url = msg.location().url || '';
    if (/status of 404/.test(msg.text()) && /^\/api\/lessons\//.test(new URL(url, 'http://localhost').pathname)) return;
    out.push(`console: ${msg.text()} @ ${url}`);
  });
  return out;
}

const ROWAN = LEARNERS.rowan.id;
const radios = (page) => page.getByRole('radiogroup');
const heading = (page, name) => page.getByRole('heading', { level: 2, name, exact: true });
const mastered = (s) => Object.values(s.progress?.[ROWAN] || {}).filter((p) => p.status === 'mastered').length;

test('one workbook sitting: answer, resume, print, save, confirm one placement, undo', async ({ page, api, gotoApp, shot }) => {
  const errors = pageErrors(page);
  await gotoApp({ seed: {} });
  await page.getByRole('button', { name: 'Switch learner' }).first().click();
  await modal(page).getByRole('button', { name: 'Level-set workbook for Rowan Example' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Level-set workbook' })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#levelset/${ROWAN}$`));

  await page.getByRole('tab', { name: /Numeracy/ }).click();
  await expect(page.getByText('Each area starts with its topics for about age 5')).toBeVisible();
  await page.getByRole('button', { name: 'Start the numeracy workbook' }).click();
  await expect(heading(page, 'Numeracy · Counting & Cardinality')).toBeVisible();
  await expect(page.getByText(/This sitting: \d+ min/)).toBeVisible();
  const groups = radios(page);
  const n = await groups.count();
  expect(n).toBeGreaterThan(3);
  expect(n).toBeLessThanOrEqual(12);
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
  await expect(heading(page, 'Numeracy · Counting & Cardinality')).toBeVisible();
  await expect(groups.nth(0).getByRole('radio', { name: 'Not yet' })).toHaveAttribute('aria-checked', 'true');
  await expect(groups.nth(1).getByRole('radio', { name: 'Unsure' })).toHaveAttribute('aria-checked', 'true');

  // The printable sheet: the same topics with tick boxes, a neutral title.
  const [sheet] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByRole('button', { name: 'Print this sheet' }).click(),
  ]);
  await sheet.waitForLoadState();
  await expect(sheet.locator('h1')).toHaveText('Numeracy · Counting & Cardinality');
  await expect(sheet).toHaveTitle('Numeracy · Counting & Cardinality');
  await expect(sheet.locator('.row')).toHaveCount(n);
  await expect(sheet.locator('.row').first()).toContainText('☐ Not yet');
  await sheet.close();

  for (let i = 3; i < n; i += 1) await groups.nth(i).getByRole('radio', { name: 'Yes' }).click();
  await expect(page.getByText('All answered.')).toBeVisible();
  await shot('levelset-sheet');
  await page.getByRole('button', { name: 'Save this sheet and continue' }).click();
  await expectToast(page, 'Sheet saved. Nothing is marked until you confirm at the end.');
  let state = await api.waitForState((s) => (s.levelset?.[ROWAN]?.lanes?.numeracy?.sheets || []).length === 2);
  expect(mastered(state)).toBe(0);
  expect((state.records?.[ROWAN] || []).filter((r) => r.placement)).toHaveLength(0);
  expect(state.levelset[ROWAN].observe || []).toHaveLength(0);

  // Every later sheet: Not yet throughout, so each area stops quickly.
  for (let guard = 0; guard < 40 && !(await heading(page, 'Numeracy: where to start').isVisible()); guard += 1) {
    const m = await groups.count();
    for (let i = 0; i < m; i += 1) await groups.nth(i).getByRole('radio', { name: 'Not yet' }).click();
    await page.getByRole('button', { name: 'Save this sheet and continue' }).click();
  }
  await expect(heading(page, 'Numeracy: where to start')).toBeVisible();
  await expect(page.locator('.ls-status')).toHaveAttribute('data-status', /^(ready|blocked)$/);
  expect(await page.locator('.ls-front button').count()).toBeGreaterThan(0);

  // The proposal: what Yes marks, by subject; nothing written yet.
  await expect(heading(page, 'Confirm what to mark')).toBeVisible();
  await expect(page.locator('.ls-proposal details[data-subject="Mathematics"]')).toBeVisible();
  await expect(page.getByText('1 topic you marked Unsure will wait for an observation check.')).toBeVisible();
  state = (await api.getState()).state;
  expect(mastered(state)).toBe(0);
  await shot('levelset-frontier');
  const confirm = page.getByRole('button', { name: /^Mark \d+ topics mastered$/ });
  const count = Number((await confirm.innerText()).match(/\d+/)[0]);
  expect(count).toBeGreaterThanOrEqual(n - 2);
  await confirm.click();
  await expectToast(page, `Marked ${count} topics mastered. Undo it from Records.`);
  state = await api.waitForState((s) => (s.records?.[ROWAN] || []).some((r) => r.placement?.levelset));
  const records = state.records[ROWAN].filter((r) => r.placement);
  expect(records).toHaveLength(1);
  const record = records[0];
  expect(record.title).toMatch(/^Level-set workbook: marked \d+ numeracy topics mastered/);
  expect(record.placement.levelset).toEqual({ lane: 'numeracy' });
  expect(record.placement.topicIds).toHaveLength(count);
  // HAR-18's scheduler reads the placement source.
  for (const id of record.placement.topicIds) expect(state.progress[ROWAN][id]).toMatchObject({ status: 'mastered', source: 'placement' });
  expect(state.levelset[ROWAN].observe).toHaveLength(1);
  await expect(page.locator('.ls-placed')).toContainText(`Confirmed: ${count} topics marked mastered as one record.`);

  // The Unsure topic opens on its topic page with the observation check.
  const waiting = page.getByRole('button', { name: new RegExp(unsure.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).last();
  await waiting.click();
  await expect(page.getByRole('heading', { level: 1, name: unsure })).toBeVisible();
  await expect(page.getByText('you marked it “Unsure” in the level-set workbook')).toBeVisible();
  await page.goBack();

  // Change answers on the first sheet: the confirmed placement is undone.
  await expect(page.getByRole('heading', { level: 1, name: 'Level-set workbook' })).toBeVisible();
  page.once('dialog', (d) => { expect(d.message()).toMatch(/you confirmed go back to how they were/); d.accept(); });
  await page.getByRole('button', { name: 'Change answers' }).first().click();
  await expectToast(page, 'Sheet open again. The confirmed marks were undone.');
  await expect(heading(page, 'Numeracy · Counting & Cardinality')).toBeVisible();
  await expect(groups.nth(0).getByRole('radio', { name: 'Not yet' })).toHaveAttribute('aria-checked', 'true');
  state = await api.waitForState((s) => mastered(s) === 0);
  expect(state.records[ROWAN].find((r) => r.id === record.id).placement.undoneAt).toBeTruthy();
  expect(state.levelset[ROWAN].observe).toHaveLength(0);
  expect(notYet).toBeTruthy();

  // Records shows the workbook record as an undone placement.
  await nav(page, 'Records').click();
  await expect(page.locator('div.rounded-2xl', { hasText: 'Level-set workbook: marked' }).first()).toContainText('Placement undone');
  expect(errors).toEqual([]);
});

test('a malformed stored session starts over instead of breaking the page', async ({ page, gotoApp }) => {
  const errors = pageErrors(page);
  await gotoApp({ seed: { extra: { levelset: { [ROWAN]: { lane: 'numeracy', lanes: { numeracy: { version: 2, sheets: 'broken', answers: [] } } } } } }, hash: `levelset/${ROWAN}` });
  await expect(page.getByRole('heading', { level: 1, name: 'Level-set workbook' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start the numeracy workbook' })).toBeVisible();
  expect(errors).toEqual([]);
});
