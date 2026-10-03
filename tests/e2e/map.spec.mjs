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

test('selecting a skill keeps the scroll; Back to graph returns to it, selected (F11, fixed by HAR-21)', async ({ page, gotoApp }) => {
  await gotoApp({ seed: {}, hash: COUNTING_HASH });
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await node(page, TOPICS.oneToOne.name).click();
  await expect(questLog(page)).toBeVisible();
  // The page stays where it was (it used to jump to the top).
  await page.waitForTimeout(300);
  const kept = await page.evaluate(() => window.scrollY);
  expect(kept).toBeGreaterThan(100);
  // The selection is in the address.
  expect(await page.evaluate(() => location.hash)).toContain('skill=');

  // To the topic page and back: same skill selected, same scroll.
  await questLog(page).getByRole('button', { name: 'Open topic page' }).click();
  await expect(page.getByRole('heading', { level: 1, name: TOPICS.oneToOne.name })).toBeVisible();
  await page.getByRole('button', { name: 'Back to graph' }).click();
  await expect(questLog(page)).toBeVisible();
  await expect(questLog(page).getByRole('heading', { name: TOPICS.oneToOne.name })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
});

test('the old timeline route is gone (HAR-13) and falls back to the dashboard', async ({ page, gotoApp, errors }) => {
  await gotoApp({ seed: {}, hash: 'timeline' });
  await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Learning Timeline' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('quest log "Mark as mastered" (HAR-14) blooms the node and unlocks the next skill', async ({ page, api, gotoApp }) => {
  await gotoApp({ seed: {}, hash: COUNTING_HASH });
  await node(page, TOPICS.oneToOne.name).click();
  await questLog(page).getByRole('button', { name: 'Mark as mastered' }).click();
  await expectToast(page, 'Marked as mastered');
  await expect(node(page, TOPICS.oneToOne.name)).toHaveAttribute('data-skill-state', 'mastered');
  await expect(node(page, TOPICS.howMany.name)).toHaveAttribute('data-skill-state', 'ready');
  // Mastered skills offer neither marking button.
  await expect(questLog(page).getByRole('button', { name: /Mark as/ })).toHaveCount(0);
  await expect(questLog(page)).toContainText('Mastery comes from the 90% topic test or your own judgment');
  await api.waitForState((s) => s.progress?.[LEARNERS.rowan.id]?.[TOPICS.oneToOne.id]?.status === 'mastered');
});

// HAR-21 follow-ups: Back/Forward, learner switches and the quest log reveal,
// on the tallest tree (English › Grammar & Punctuation).
const TALL_HASH = `graph/English/${encodeURIComponent('Grammar & Punctuation')}`;
const treeScroll = (page) => page.evaluate(() => {
  const scroller = document.querySelector('.skill-tree-scroller');
  return { x: window.scrollX, y: window.scrollY, left: scroller.scrollLeft, top: scroller.scrollTop };
});
// The scroll a parent leaves the tree at; the scroll events land before the next step.
async function scrollTreeTo(page, { y, left, top }) {
  await page.evaluate(({ y, left, top }) => {
    window.scrollTo(0, y);
    const scroller = document.querySelector('.skill-tree-scroller');
    scroller.scrollLeft = left;
    scroller.scrollTop = top;
  }, { y, left, top });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return treeScroll(page);
}
// Clicks without Playwright's scroll-into-view, so the page stays where the test left it.
const clickInPlace = (locator) => locator.evaluate((button) => button.click());
const selectedIds = (page) => page.locator('.skill-node.is-selected').evaluateAll((nodes) => nodes.map((n) => n.dataset.skillId));
async function switchLearner(page, name) {
  await page.getByRole('button', { name: 'Switch learner' }).first().click();
  await modal(page).getByText(name, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-full")][1]').getByRole('button', { name: 'Switch' }).click();
  await expectToast(page, `Switched to ${name}`);
}

test('browser Back and Forward put the tree back with its window and tree scroll (N5)', async ({ page, gotoApp }) => {
  await gotoApp({ seed: {}, hash: TALL_HASH });
  await page.locator('button.skill-node').nth(20).click();
  await expect(questLog(page)).toBeVisible();
  const skill = (await selectedIds(page))[0];
  const left = await scrollTreeTo(page, { y: 700, left: 160, top: 0 });
  expect(left.y).toBe(700);

  // Away by a link (a new history entry), then Back.
  await clickInPlace(page.getByRole('button', { name: 'World Map', exact: true }));
  await expect(page.getByRole('heading', { name: 'Curriculum realms' })).toBeVisible();
  await page.goBack();
  await expect(questLog(page)).toBeVisible();
  expect(await selectedIds(page)).toEqual([skill]);
  await expect.poll(() => treeScroll(page)).toEqual(left);
  // Focus is back on the selected node.
  expect(await page.evaluate(() => document.activeElement?.dataset?.skillId)).toBe(skill);

  // Forward to the map and Back again: the same place, not re-centered.
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Curriculum realms' })).toBeVisible();
  await page.goBack();
  await expect(questLog(page)).toBeVisible();
  await expect.poll(() => treeScroll(page)).toEqual(left);
});

test('Back to a selection made for another learner clears it (item 5)', async ({ page, gotoApp }) => {
  await gotoApp({ seed: {}, hash: COUNTING_HASH });
  await node(page, TOPICS.oneToOne.name).click();
  await expect(questLog(page)).toBeVisible();
  await nav(page, 'Dashboard').click();
  await switchLearner(page, LEARNERS.sage.name);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Counting & Cardinality' })).toBeVisible();
  await expect(questLog(page)).toHaveCount(0);
  expect(await selectedIds(page)).toEqual([]);
  expect(await page.evaluate(() => location.hash)).not.toContain('skill=');
});

test('switching learner away and back keeps the return to the tree exact (item 5)', async ({ page, gotoApp }) => {
  await gotoApp({ seed: {}, hash: TALL_HASH });
  await page.locator('button.skill-node').nth(20).click();
  await expect(questLog(page)).toBeVisible();
  const skill = (await selectedIds(page))[0];
  const left = await scrollTreeTo(page, { y: 600, left: 120, top: 0 });

  await clickInPlace(questLog(page).getByRole('button', { name: 'Open topic page' }));
  await expect(page.getByRole('button', { name: 'Back to graph' })).toBeVisible();
  await switchLearner(page, LEARNERS.sage.name);
  await switchLearner(page, LEARNERS.rowan.name);
  await page.getByRole('button', { name: 'Back to graph' }).click();
  await expect(questLog(page)).toBeVisible();
  expect(await selectedIds(page)).toEqual([skill]);
  await expect.poll(() => treeScroll(page)).toEqual(left);
});

test('a quest log revealed after a click low in the tree lands exactly on its margin (item 4)', async ({ page, gotoApp }) => {
  await gotoApp({ seed: {}, hash: TALL_HASH });
  // The lowest skill, with the page scrolled down to it: the log, at the top
  // of the stage, is above the fold.
  const lowest = await page.locator('button.skill-node').evaluateAll((nodes) => nodes.reduce((a, b) => (b.offsetTop > a.offsetTop ? b : a)).dataset.skillId);
  const target = page.locator(`button.skill-node[data-skill-id="${lowest}"]`);
  await target.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 200));
  await target.click();
  await expect(questLog(page)).toBeVisible();
  // After the fade-up has finished, its top sits on scroll-margin-top exactly.
  await page.waitForTimeout(500);
  const box = await questLog(page).evaluate((log) => ({ top: log.getBoundingClientRect().top, margin: parseFloat(getComputedStyle(log).scrollMarginTop) }));
  expect(box.margin).toBe(16);
  expect(box.top).toBe(box.margin);
  // The pill is for phones only.
  await expect(questLog(page).getByRole('button', { name: 'Back to tree' })).toBeHidden();
});
