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

// HAR-21 follow-ups on a phone, where the quest log stacks under the tree.
test('quest log reveal lands below the top bar, and "Back to tree" returns to the node (items 4 and 8)', async ({ page, gotoApp, shot }) => {
  await gotoApp({ seed: {}, hash: `graph/English/${encodeURIComponent('Grammar & Punctuation')}` });
  // The highest skill in a tall tree: its quest log stacks far below the fold.
  const highest = await page.locator('button.skill-node').evaluateAll((nodes) => nodes.reduce((a, b) => (b.offsetTop < a.offsetTop ? b : a)).dataset.skillId);
  const target = page.locator(`button.skill-node[data-skill-id="${highest}"]`);
  await target.click();
  const log = page.getByRole('complementary', { name: 'Quest log' });
  await expect(log).toBeAttached();
  await page.waitForTimeout(500); // the fade-up has finished
  const box = await log.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop);
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    return {
      scrollY: window.scrollY,
      // Its top on its margin, unless the page ends first.
      expected: Math.min(maxScroll, Math.round(rect.top + window.scrollY - margin)),
      margin,
      top: rect.top,
      bottom: rect.bottom,
      bar: document.querySelector('header.sticky').getBoundingClientRect().bottom,
      nav: [...document.querySelectorAll('nav[aria-label="Main"]')].find((nav) => nav.offsetHeight).getBoundingClientRect().top,
    };
  });
  expect(box.margin).toBe(72);
  expect(Math.abs(box.scrollY - box.expected)).toBeLessThanOrEqual(0.5);
  // Clear of the top bar and the bottom navigation.
  expect(box.bar).toBeLessThanOrEqual(box.top);
  expect(box.bottom).toBeLessThanOrEqual(box.nav);
  const pill = log.getByRole('button', { name: 'Back to tree' });
  await expect(pill).toBeInViewport();
  await shot('quest-log-revealed', { full: false });

  await pill.click();
  await expect(target).toBeInViewport();
  await expect(target).toBeFocused();
  await noHorizontalOverflow(page);
});

test('a status write keeps the quest log scrolled where it was (N4)', async ({ page, gotoApp }) => {
  await gotoApp({ seed: {}, hash: `graph/Mathematics/${encodeURIComponent('Counting & Cardinality')}` });
  await page.locator('button.skill-node', { hasText: TOPICS.oneToOne.name }).first().click();
  const log = page.getByRole('complementary', { name: 'Quest log' });
  await expect(log.getByRole('button', { name: 'Mark as learning' })).toBeAttached();
  const scrolled = await log.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    return el.scrollTop;
  });
  expect(scrolled).toBeGreaterThan(50);
  await log.getByRole('button', { name: 'Mark as learning' }).evaluate((button) => button.click());
  await expect(log.getByRole('button', { name: 'Keep as learning' })).toBeAttached();
  await expect.poll(() => log.evaluate((el) => el.scrollTop)).toBe(scrolled);
});
