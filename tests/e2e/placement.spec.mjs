// Placement (HAR-14): bulk-mark earlier topics mastered for an older learner,
// from the learner menu or a subject card, and undo it from Records.
import { test, expect, modal, nav, expectToast } from './fixtures.mjs';
import { readFileSync } from 'node:fs';
import { LEARNERS } from './support/family.mjs';
import { CACHE_DIR } from './support/taxonomy.mjs';

const MATH_IDS = new Set(JSON.parse(readFileSync(`${CACHE_DIR}/topics.json`, 'utf8')).topics.filter((t) => t.subject === 'Mathematics').map((t) => t.id));

const SAGE = LEARNERS.sage.id;
const mastered = (s) => Object.values(s.progress?.[SAGE] || {}).filter((p) => p.status === 'mastered').length;

test('place a 9-year-old in Mathematics from the subject card, then undo it', async ({ page, api, gotoApp, shot }) => {
  await gotoApp({ seed: { active: 'sage' } });
  await expect(page.getByRole('button', { name: /Mathematics.*0\/503 mastered/ })).toBeVisible();
  await page.getByRole('button', { name: 'Placement for Mathematics' }).click();

  const m = modal(page);
  await expect(m.getByRole('heading', { name: 'Place Sage Example' })).toBeVisible();
  await expect(m.getByLabel('Subject')).toHaveValue('Mathematics');
  await expect(m.getByLabel('Area')).toHaveValue('');
  // Default: up to the learner's age minus one.
  await expect(m.getByLabel('Up to age')).toHaveValue('8');
  await expect(m).toContainText(/\d+ topics would be marked mastered\./);
  await expect(m.getByRole('checkbox')).toBeChecked();
  await expect(m).toContainText('(recommended)');
  await shot('placement-modal', { full: false });

  // Unchecking the prerequisites leaves some topics alone and says so.
  const confirm = m.getByRole('button', { name: /^Mark \d+ mastered$/ });
  const withPrereqs = Number((await confirm.innerText()).match(/\d+/)[0]);
  await m.getByRole('checkbox').uncheck();
  await expect(m).toContainText('will stay as they are, because a required foundation would still be unmastered.');
  const without = Number((await confirm.innerText()).match(/\d+/)[0]);
  expect(without).toBeLessThan(withPrereqs);
  await m.getByRole('checkbox').check();

  await confirm.click();
  await expectToast(page, `Marked ${withPrereqs} topics mastered. Undo it from Records.`);
  const state = await api.waitForState((s) => mastered(s) === withPrereqs);
  const record = state.records[SAGE].find((r) => r.placement);
  expect(record.type).toBe('assessment');
  expect(record.title).toMatch(/^Placement: marked \d+ topics in Mathematics mastered up to age 8/);
  expect(Object.values(state.progress[SAGE]).every((p) => p.source === 'placement')).toBe(true);
  await shot('dashboard-after-placement');

  // The dashboard ring moves; the record can be undone once.
  // Prerequisites can sit in other subjects; count only Mathematics.
  const math = Object.entries(state.progress[SAGE]).filter(([id, p]) => MATH_IDS.has(id) && p.status === 'mastered').length;
  expect(math).toBeGreaterThan(100);
  await expect(page.getByRole('button', { name: new RegExp(`Mathematics.*\\b${math}/503 mastered`) })).toBeVisible();
  await nav(page, 'Records').click();
  const card = page.locator('div.rounded-2xl', { hasText: 'Placement: marked' });
  page.once('dialog', (d) => { expect(d.message()).toMatch(/^Return these \d+ topics to their status before the placement\?$/); d.accept(); });
  await card.getByRole('button', { name: 'Undo placement' }).click();
  await expect(card).toContainText('Placement undone');
  await api.waitForState((s) => mastered(s) === 0);
  await nav(page, 'Dashboard').click();
  await expect(page.getByRole('button', { name: /Mathematics.*0\/503 mastered/ })).toBeVisible();
});

test('placement from the learner menu, narrowed to one area and age', async ({ page, api, gotoApp }) => {
  await gotoApp({ seed: { active: 'sage' } });
  await page.getByRole('button', { name: 'Switch learner' }).first().click();
  await modal(page).getByRole('button', { name: 'Placement for Sage Example' }).click();
  const m = modal(page);
  await expect(m.getByRole('heading', { name: 'Place Sage Example' })).toBeVisible();
  await m.getByLabel('Area').selectOption('Counting & Cardinality');
  await m.getByLabel('Up to age').selectOption('5');
  await expect(m).toContainText(/\d+ topics? would be marked mastered\./);
  const n = Number((await m.getByRole('button', { name: /^Mark \d+ mastered$/ }).innerText()).match(/\d+/)[0]);
  await m.getByRole('button', { name: /^Mark \d+ mastered$/ }).click();
  const state = await api.waitForState((s) => mastered(s) === n);
  expect(state.progress[SAGE]['mt_WcfaSfVT33'].status).toBe('mastered');
});
