// Adding, switching and removing learners from the sidebar switcher.
import { test, expect, modal, expectToast } from './fixtures.mjs';
import { FIXED_YEAR } from './support/env.mjs';
import { LEARNERS } from './support/family.mjs';

function studentRow(page, name) {
  // Row: <div> avatar, <div><p>name</p><p>Age …</p></div>, Active|Switch, delete
  return modal(page).getByText(name, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-full")][1]');
}

async function openSwitcher(page) {
  await page.getByRole('button', { name: 'Switch learner' }).first().click();
  await expect(modal(page).getByRole('heading', { name: 'Students' })).toBeVisible();
}

async function addLearner(page, name, birthYear) {
  await openSwitcher(page);
  await modal(page).getByRole('button', { name: 'Add' }).click();
  const form = modal(page);
  await expect(form.getByRole('heading', { name: 'Add a student' })).toBeVisible();
  await form.locator('input[name="name"]').fill(name);
  await form.locator('input[name="birthYear"]').fill(String(birthYear));
  await form.getByRole('button', { name: 'Add student' }).click();
  await expectToast(page, 'Student added');
}

test('add two more learners, switch between them, and the choice survives a reload', async ({ page, api, gotoApp, shot }) => {
  await gotoApp({ seed: { learners: ['rowan'] } });
  await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();

  await addLearner(page, LEARNERS.wren.name, FIXED_YEAR - 3);
  // A new learner becomes the active one.
  await expect(page.getByRole('heading', { name: "Wren Example's Wednesday" })).toBeVisible();
  await addLearner(page, LEARNERS.sage.name, FIXED_YEAR - 9);
  await expect(page.getByRole('heading', { name: "Sage Example's Wednesday" })).toBeVisible();

  await openSwitcher(page);
  await expect(studentRow(page, 'Rowan Example')).toContainText(`Age 6 · born ${FIXED_YEAR - 6}`);
  await expect(studentRow(page, 'Wren Example')).toContainText(`Age 3 · born ${FIXED_YEAR - 3}`);
  await expect(studentRow(page, 'Sage Example')).toContainText('Active');
  await shot('student-switcher-three-learners', { full: false });

  await studentRow(page, 'Rowan Example').getByRole('button', { name: 'Switch' }).click();
  await expectToast(page, 'Switched to Rowan Example');
  await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();

  const saved = await api.waitForState((s) => s.students?.length === 3 && s.students.find((x) => x.id === s.activeStudentId)?.name === 'Rowan Example');
  expect(saved.students.map((s) => s.name)).toEqual(['Rowan Example', 'Wren Example', 'Sage Example']);

  await page.reload();
  await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch learner' }).first()).toContainText('Rowan Example');
});

test('remove a learner asks first; cancel keeps them, OK removes them', async ({ page, api, gotoApp, shot }) => {
  await gotoApp({ seed: { active: 'rowan' } });
  await openSwitcher(page);

  // Cancel the confirm: nothing changes.
  page.once('dialog', (d) => { expect(d.message()).toBe('Remove Wren Example? This deletes their progress and records.'); d.dismiss(); });
  await studentRow(page, 'Wren Example').locator('button').last().click();
  await expect(modal(page).getByText('Wren Example', { exact: true })).toBeVisible();

  page.once('dialog', (d) => d.accept());
  await studentRow(page, 'Wren Example').locator('button').last().click();
  await expect(page.locator('#modal-root > div')).toHaveCount(0);
  await openSwitcher(page);
  await expect(modal(page).getByText('Wren Example', { exact: true })).toHaveCount(0);
  await expect(modal(page).getByText('Rowan Example', { exact: true })).toBeVisible();
  await shot('student-switcher-after-remove', { full: false });
  const state = await api.waitForState((s) => s.students?.length === 2);
  expect(state.students.map((s) => s.name)).toEqual(['Rowan Example', 'Sage Example']);
});

test('the learner menu buttons are reachable by role (delete is icon-only)', async ({ page, gotoApp }) => {
  await gotoApp({ seed: {} });
  await openSwitcher(page);
  const del = studentRow(page, 'Wren Example').locator('button').last();
  // Finding: the delete button has no accessible name.
  await expect(del).toHaveAccessibleName('');
});
