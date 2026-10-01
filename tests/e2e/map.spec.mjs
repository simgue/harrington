// The curriculum map: world map, skill tree + quest log, and the list drill-down.
import { test, expect, modal, nav, expectToast } from './fixtures.mjs';
import { LEARNERS, TOPICS } from './support/family.mjs';

const COUNTING_HASH = `graph/${encodeURIComponent('Mathematics')}/${encodeURIComponent('Counting & Cardinality')}`;
const node = (page, name) => page.locator('button.skill-node', { has: page.locator('.skill-node-label', { hasText: new RegExp(`^${name.replace(/[?()]/g, '\\$&')}$`) }) });
const questLog = (page) => page.getByRole('complementary', { name: 'Quest log' });

test('world map shows eight realms; a realm opens its skill tree', async ({ page, gotoApp, shot, errors }) => {
  await gotoApp({ seed: {} });
  await nav(page, 'Map').click();
  await expect(page.getByText('World Map', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Curriculum realms' })).toBeVisible();
  await expect(page.getByText(/1,590 topics · [\d,]+ prerequisite links · v1/)).toBeVisible();
  const realms = page.locator('g.world-realm');
  await expect(realms).toHaveCount(8);
  for (const subject of ['Mathematics', 'English', 'Science', 'History', 'Personal & Social Development', 'Life Skills', 'Computing', 'Learning to Learn']) {
    await expect(page.getByRole('button', { name: new RegExp(`^${subject} realm, \\d+ domains$`) })).toHaveCount(1);
  }
  await shot('world-map');

  // Keyboard: Enter on a realm opens it.
  await page.getByRole('button', { name: /^Mathematics realm/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Skill tree', { exact: true })).toBeVisible();
  const crumbs = page.locator('nav').filter({ hasText: 'World Map' });
  await expect(crumbs).toContainText('Mathematics');

  // Legend.
  for (const item of ['Seed · Locked', 'Sprout · Ready', 'Bud · In progress', 'Bloom · Mastered', 'Required', 'Helpful']) {
    await expect(page.getByText(item, { exact: true }).first()).toBeVisible();
  }
  await expect(page.locator('button.skill-node').first()).toBeVisible();
  await shot('skill-tree-default-domain');

  // Breadcrumb back to the world map.
  await crumbs.getByRole('button', { name: 'World Map' }).click();
  await expect(page.getByRole('heading', { name: 'Curriculum realms' })).toBeVisible();
  // Clicking a realm with the mouse works too.
  await page.locator('g.world-realm', { hasText: 'English' }).locator('path').first().click({ force: true });
  await expect(page.getByText('Skill tree', { exact: true })).toBeVisible();
  await expect(crumbs).toContainText('English');
  expect(errors).toEqual([]);
});

test('quest log: select a skill, open its page, record evidence, mark as learning', async ({ page, api, gotoApp, shot }) => {
  await gotoApp({ seed: {}, hash: COUNTING_HASH });
  await expect(page.getByRole('heading', { level: 1, name: 'Counting & Cardinality' })).toBeVisible();

  const one = node(page, TOPICS.oneToOne.name);
  await expect(one).toHaveAttribute('data-skill-state', 'ready');
  await one.click();
  const log = questLog(page);
  await expect(log.getByRole('heading', { name: TOPICS.oneToOne.name })).toBeVisible();
  await expect(log).toContainText(/Sprout\s*· Ready/);
  await expect(log).toContainText('Ready. Every required foundation is mastered');
  await expect(log.getByText('What this unlocks')).toBeVisible();
  await expect(log.getByRole('button', { name: 'How Many in Total?' })).toBeVisible();
  await expect(log.getByRole('button', { name: 'Open full lesson' })).toBeVisible();
  await shot('quest-log-ready');

  // Record evidence opens the record form linked to this topic.
  await log.getByRole('button', { name: 'Record evidence' }).click();
  const form = modal(page);
  await expect(form.getByRole('heading', { name: 'Record for One-to-one counting' })).toBeVisible();
  await form.locator('input[name="title"]').fill('Counted spoons at dinner');
  await form.getByRole('button', { name: 'Save record' }).click();
  await expectToast(page, 'Record saved');

  // Mark as learning: the node becomes a bud and the dashboard notices.
  await questLog(page).getByRole('button', { name: 'Mark as learning' }).click();
  await expectToast(page, 'Marked as learning');
  await expect(node(page, TOPICS.oneToOne.name)).toHaveAttribute('data-skill-state', 'in-progress');
  await expect(questLog(page)).toContainText(/Bud\s*· In progress/);
  await expect(questLog(page).getByRole('button', { name: 'Keep as learning' })).toBeVisible();
  const saved = await api.waitForState((s) => s.progress?.[LEARNERS.rowan.id]?.[TOPICS.oneToOne.id]?.status === 'learning');
  expect(saved.records[LEARNERS.rowan.id][0]).toMatchObject({ title: 'Counted spoons at dinner', topicId: TOPICS.oneToOne.id });

  // Open topic page.
  await questLog(page).getByRole('button', { name: 'Open topic page' }).click();
  await expect(page.getByRole('heading', { level: 1, name: TOPICS.oneToOne.name })).toBeVisible();

  await nav(page, 'Dashboard').click();
  const growth = page.locator('section', { has: page.getByRole('heading', { name: 'Recent growth' }) });
  await expect(growth.getByRole('button', { name: /One-to-one counting.*Bud.*Learning/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Mathematics.*0\/503 mastered.*Sprout/ })).toBeVisible();
  await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Recent evidence' }) })).toContainText('Counted spoons at dinner');
});

test('a locked skill explains its foundations and cannot be marked as learning', async ({ page, gotoApp, shot }) => {
  await gotoApp({ seed: {}, hash: COUNTING_HASH });
  const locked = node(page, TOPICS.howMany.name);
  await expect(locked).toHaveAttribute('data-skill-state', 'locked');
  await expect(locked).toHaveAttribute('aria-description', 'Locked. Foundations needed.');
  await locked.click();
  const log = questLog(page);
  await expect(log.getByText('Foundations needed', { exact: true })).toBeVisible();
  await expect(log).toContainText('1 required skill still sit in front of this one');
  await expect(log.getByRole('button', { name: 'Not ready to mark as learning' })).toBeDisabled();
  await expect(log.getByText('Required foundations')).toBeVisible();
  // The blocking foundation is highlighted on the tree.
  await expect(node(page, TOPICS.oneToOne.name)).toHaveClass(/is-blocking/);
  await shot('quest-log-locked');

  // Jump to the foundation from its chip, then close the log.
  await log.getByRole('button', { name: TOPICS.oneToOne.name }).click();
  await expect(questLog(page).getByRole('heading', { name: TOPICS.oneToOne.name })).toBeVisible();
  await questLog(page).getByRole('button', { name: 'Close quest log' }).click();
  await expect(questLog(page)).toHaveCount(0);
});

test('mastering a foundation unlocks the next skill', async ({ page, gotoApp }) => {
  await gotoApp({ seed: { progress: { [TOPICS.oneToOne.id]: 'mastered' } }, hash: COUNTING_HASH });
  await expect(node(page, TOPICS.oneToOne.name)).toHaveAttribute('data-skill-state', 'mastered');
  await expect(node(page, TOPICS.howMany.name)).toHaveAttribute('data-skill-state', 'ready');
});

test('List view drills subject → domain → age band → topic and the choice persists', async ({ page, api, gotoApp, shot }) => {
  await gotoApp({ seed: {} });
  await nav(page, 'Map').click();
  const group = page.getByRole('group', { name: 'Curriculum view' });
  await expect(group.getByRole('button', { name: 'Visual' })).toHaveAttribute('aria-pressed', 'true');
  await group.getByRole('button', { name: 'List' }).click();
  await expect(group.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Curriculum list' })).toBeVisible();
  await expect(page.getByRole('button', { name: /domains · \d+ topics/ })).toHaveCount(8);
  await shot('list-subjects');

  await page.getByRole('button', { name: /^Mathematics \d+ domains/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mathematics' })).toBeVisible();
  await page.getByRole('button', { name: /^Counting & Cardinality/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Counting & Cardinality' })).toBeVisible();
  await shot('list-domain-age-bands');
  await page.getByRole('button', { name: /^Age 5 / }).click();
  await expect(page.getByText(/connections? inside this section/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^One-to-one counting/ })).toContainText('Sprout · Not started · ages 4–6 · unlocks 3');
  await expect(page.getByRole('button', { name: /^How Many in Total\?/ })).toContainText('needs One-to-one counting');
  await shot('list-section-topics');

  // The breadcrumb walks back up.
  await page.locator('nav').filter({ hasText: 'Curriculum' }).getByRole('button', { name: 'Counting & Cardinality' }).click();
  await expect(page.getByRole('button', { name: /^Age 5 / })).toBeVisible();
  await page.getByRole('button', { name: /^Age 5 / }).click();
  await page.getByRole('button', { name: /^One-to-one counting/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: TOPICS.oneToOne.name })).toBeVisible();

  // The view choice is saved with the family and survives a reload.
  await api.waitForState((s) => s.graphView === 'list');
  await nav(page, 'Map').click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Curriculum list' })).toBeVisible();
  await page.getByRole('group', { name: 'Curriculum view' }).getByRole('button', { name: 'Visual' }).click();
  await expect(page.getByRole('heading', { name: 'Curriculum realms' })).toBeVisible();
  await api.waitForState((s) => s.graphView === 'atlas');
});

test('selecting a skill scrolls the page back to the top (finding)', async ({ page, gotoApp }) => {
  await gotoApp({ seed: {}, hash: COUNTING_HASH });
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await node(page, TOPICS.oneToOne.name).click();
  await expect(questLog(page)).toBeVisible();
  // Each selection re-navigates (app.js navigate → scrollTo top).
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
