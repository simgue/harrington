// 390×844 phone viewport: every route renders without sideways scrolling, and
// the phone-only chrome (top bar, bottom nav) works.
import { test, expect, modal, closeModal, expectToast, noHorizontalOverflow, childView, leaveChildView } from './fixtures.mjs';
import { LEARNERS, TOPICS } from './support/family.mjs';
import { TODAY_KEY } from './support/env.mjs';

const ROUTES = [
  ['dashboard', ''],
  ['calendar', 'calendar'],
  ['world-map', 'graph'],
  ['skill-tree', `graph/Mathematics/${encodeURIComponent('Counting & Cardinality')}`],
  ['topic', `topic/${TOPICS.oneToOne.id}`],
  ['records', 'records'],
  ['insights', 'insights'],
  ['levelset', `levelset/${LEARNERS.rowan.id}`],
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

test('export and import from the learner menu on a phone (F6)', async ({ page, gotoApp, shot }) => {
  await gotoApp({ seed: {} });
  // Nothing outside the menu: the sidebar's family box is hidden below lg.
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Switch learner' }).click();
  const menu = modal(page);
  await expect(menu.getByRole('heading', { name: 'Students' })).toBeVisible();
  await expect(menu.getByText('Family data')).toBeVisible();
  // Phones have no sidebar, so a shared server's sign-in line shows here
  // (HAR-25); this test server is loopback-only, so there is none.
  await expect(menu.locator('#m-hosting')).toHaveCount(0);
  await noHorizontalOverflow(page);
  await shot('learner-menu-family-data', { full: false });

  const [download] = await Promise.all([page.waitForEvent('download'), menu.getByRole('button', { name: 'Export', exact: true }).click()]);
  await expectToast(page, 'Family data exported');
  expect(download.suggestedFilename()).toMatch(/^harrington-family-\d{4}-\d{2}-\d{2}\.json$/);
  const file = Buffer.concat(await (await download.createReadStream()).toArray());
  expect(JSON.parse(file.toString('utf8')).students).toHaveLength(3);

  // Import: the same preview and confirm as on a desktop.
  await page.getByRole('button', { name: 'Switch learner' }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), modal(page).getByRole('button', { name: 'Import', exact: true }).click()]);
  await chooser.setFiles({ name: 'family.json', mimeType: 'application/json', buffer: file });
  const preview = modal(page);
  await expect(preview.getByRole('heading', { name: 'Import family data?' })).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Replace family data' })).toBeVisible();
  await noHorizontalOverflow(page);
  await preview.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('#modal-root > div')).toHaveCount(0);
});

// F14: every target named below is at least 44 × 44 px on a phone.
// Boxes are measured in whole CSS pixels: at a fractional scroll offset a 44px
// box can read 43.9999.
async function expectTapTarget(locator, name) {
  const box = await locator.boundingBox();
  expect(box, name).not.toBeNull();
  expect(Math.round(box.width), `${name} width`).toBeGreaterThanOrEqual(44);
  expect(Math.round(box.height), `${name} height`).toBeGreaterThanOrEqual(44);
}

test('learner menu: 44px targets with names, names not cut off (F14)', async ({ page, gotoApp, shot }) => {
  await gotoApp({ seed: {} });
  await page.getByRole('button', { name: 'Switch learner' }).click();
  const menu = modal(page);
  const actions = ['Placement for Wren Example', 'Level-set workbook for Wren Example', 'Edit Wren Example', 'Remove learner Wren Example'];
  for (const name of actions) {
    await expectTapTarget(menu.getByRole('button', { name, exact: true }), name);
  }
  // HAR-24: at 390 px the four actions sit in a two-by-two grid under the name,
  // each label whole and its icon full size.
  const boxes = await Promise.all(actions.map((name) => menu.getByRole('button', { name, exact: true }).boundingBox()));
  expect(new Set(boxes.map((b) => Math.round(b.y))).size, 'two rows').toBe(2);
  for (const name of actions) {
    const button = menu.getByRole('button', { name, exact: true });
    expect(await button.evaluate((n) => n.scrollWidth - n.clientWidth), `${name} overflows`).toBeLessThanOrEqual(0);
    expect((await button.locator('svg').boundingBox()).width, `${name} icon`).toBeGreaterThanOrEqual(15);
  }
  await expect(menu.getByRole('button', { name: 'Level-set workbook for Wren Example' })).toContainText('Workbook');
  await expectTapTarget(menu.getByRole('button', { name: 'Switch', exact: true }).first(), 'Switch');
  await expectTapTarget(menu.getByRole('button', { name: 'Add', exact: true }), 'Add');
  await noHorizontalOverflow(page);
});

test('learner menu at 360 px: no sideways scroll and the full name shows (F14)', async ({ page, gotoApp, shot }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await gotoApp({ seed: {} });
  await page.getByRole('button', { name: 'Switch learner' }).click();
  const menu = modal(page);
  await expect(menu.getByRole('heading', { name: 'Students' })).toBeVisible();
  await noHorizontalOverflow(page);
  for (const name of ['Wren Example', 'Rowan Example', 'Sage Example']) {
    const label = menu.getByText(name, { exact: true });
    // Truncated text is wider than its box.
    expect(await label.evaluate((n) => n.scrollWidth - n.clientWidth), `${name} is cut off`).toBeLessThanOrEqual(0);
  }
  await expectTapTarget(menu.getByRole('button', { name: 'Remove learner Wren Example' }), 'Remove learner at 360 px');
  await expectTapTarget(menu.getByRole('button', { name: 'Level-set workbook for Wren Example' }), 'Workbook at 360 px');
  expect((await menu.getByRole('button', { name: 'Placement for Wren Example' }).locator('svg').boundingBox()).width, 'Placement icon at 360 px').toBeGreaterThanOrEqual(15);
  await shot('learner-menu-360', { full: false });
});

test('level-set workbook on a phone: a sheet, 44 px answers, no sideways scroll (HAR-24)', async ({ page, gotoApp, shot, errors }) => {
  await gotoApp({ seed: {}, hash: `levelset/${LEARNERS.rowan.id}` });
  await page.getByRole('tab', { name: /Numeracy/ }).click();
  await page.getByRole('button', { name: 'Start the numeracy workbook' }).click();
  const groups = page.getByRole('radiogroup');
  await expect(groups.first()).toBeVisible();
  await noHorizontalOverflow(page);
  for (const name of ['Yes', 'Not yet', 'Unsure']) {
    await expectTapTarget(groups.first().getByRole('radio', { name, exact: true }), `${name} answer`);
  }
  await expectTapTarget(page.getByRole('tab', { name: /Literacy/ }), 'Literacy tab');
  await groups.first().getByRole('radio', { name: 'Yes', exact: true }).click();
  await expect(groups.first().getByRole('radio', { name: 'Yes', exact: true })).toHaveAttribute('aria-checked', 'true');
  await shot('levelset-sheet', { full: false });
  expect(errors).toEqual([]);
});

test('observation check on a phone: the checklist fits and saves (HAR-24)', async ({ page, api, gotoApp, shot, errors }) => {
  await gotoApp({ seed: {}, hash: `topic/${TOPICS.oneToOne.id}` });
  await page.getByRole('button', { name: 'Check mastery by observation' }).click();
  const m = modal(page);
  await expect(m.getByRole('heading', { name: 'Check mastery by observation' })).toBeVisible();
  await noHorizontalOverflow(page);
  const boxes = m.getByRole('checkbox');
  await expect(boxes).toHaveCount(3);
  await expectTapTarget(m.locator('#ob-items label').first(), 'evidence row');
  await boxes.first().check();
  await shot('observation-checklist', { full: false });
  await m.getByRole('button', { name: 'Save observation' }).click();
  await expectToast(page, 'Observation saved: 1 of 3 seen');
  await api.waitForState((s) => (s.tests?.[LEARNERS.rowan.id] || []).some((t) => t.mode === 'observed'));
  expect(errors).toEqual([]);
});

test('record, recording and calendar extra delete buttons are 44px targets (F14)', async ({ page, api, gotoApp }) => {
  await gotoApp({
    seed: {
      records: [
        { type: 'observation', title: 'Counted the stairs out loud', topicId: TOPICS.oneToOne.id },
        { type: 'recording', title: 'Unlinked chat', note: 'Typed, no audio.' },
      ],
      extra: { plan: { [LEARNERS.rowan.id]: { moves: {}, done: {}, extras: { [TODAY_KEY]: [
        { id: 'x_seed', kind: 'lesson', topicId: TOPICS.oneToOne.id, topicName: TOPICS.oneToOne.name, subject: 'Mathematics', title: `Extra lesson · ${TOPICS.oneToOne.name}` },
      ] } } } },
    },
  });
  // The Recordings folder opens from the dashboard.
  await page.getByRole('button', { name: /Recordings folder/ }).click();
  await expectTapTarget(modal(page).getByRole('button', { name: 'Delete recording Unlinked chat' }), 'Delete recording');
  await closeModal(page);
  await page.goto('/#records');
  await expectTapTarget(page.getByRole('button', { name: 'Delete record Counted the stairs out loud' }), 'Delete record');
  await page.goto('/#calendar');
  await expectTapTarget(page.getByRole('button', { name: `Remove extra Extra lesson · ${TOPICS.oneToOne.name}` }), 'Remove extra');
  await noHorizontalOverflow(page);
});

test('the "Include my notes" opt-in is a comfortable target and its label toggles it', async ({ page, gotoApp }) => {
  await gotoApp({ seed: { records: [{ type: 'discussion', title: 'Talked about sharing', note: 'Split 6 grapes between 2 bowls.' }] }, hash: 'records' });
  const box = page.getByRole('checkbox', { name: 'Include my notes in this request' });
  await expect(box).not.toBeChecked();
  const size = await box.boundingBox();
  expect(size.width).toBeGreaterThanOrEqual(20);
  expect(size.height).toBeGreaterThanOrEqual(20);
  const label = page.locator('label', { hasText: 'Include my notes in this request' });
  expect(Math.round((await label.boundingBox()).height)).toBeGreaterThanOrEqual(44);
  await label.getByText('Include my notes in this request').click();
  await expect(box).toBeChecked();
});

test('the notes opt-in is a 20 px box whose label is the hit area', async ({ page, gotoApp }) => {
  await gotoApp({
    seed: { records: [{ type: 'observation', title: 'Counted the stairs out loud', note: 'Got to 12.', topicId: TOPICS.oneToOne.id }] },
    hash: 'insights',
  });
  const box = page.getByRole('checkbox', { name: 'Include my notes in this request' });
  const size = await box.boundingBox();
  expect([Math.round(size.width), Math.round(size.height)]).toEqual([20, 20]);
  const label = page.locator('label', { has: box });
  expect((await label.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await label.getByText('Include my notes in this request').click();
  await expect(box).toBeChecked();
});

test('the top-bar bell: open, filter by learner, dismiss, and the 30-day backup snooze (HAR-27)', async ({ page, api, gotoApp, shot }) => {
  // Wednesday 7 October 2026, 15:30 (UTC in the browser): today's picks are due.
  const at = (iso) => page.clock.setFixedTime(new Date(iso));
  await at('2026-10-07T15:30:00Z');
  await gotoApp({ seed: { extra: { dismissedAlerts: { welcome: Date.parse('2026-10-01T00:00:00Z') } } } });
  const bell = page.locator('header').getByRole('button', { name: /^Notifications/ });
  await expect(bell).toBeVisible();
  // Each learner's picks (Wren, 3, gets the youngest band's choices: F3, #35)
  // and the missing backup.
  await expect(bell).toHaveAccessibleName('Notifications, 4 new');
  await bell.click();
  const m = modal(page);
  await expect(m.getByLabel('Show')).toHaveValue('s_e2e_rowan');
  await expect(m.getByText("Today's picks are still open for Rowan Example")).toBeVisible();
  await expect(m.getByText('No backup recorded')).toBeVisible();
  await expect(m.getByText("Today's picks are still open for Sage Example")).toHaveCount(0);
  await noHorizontalOverflow(page);
  await shot('notifications', { full: false });

  await m.getByLabel('Show').selectOption('all');
  await m.getByRole('button', { name: "Dismiss: Today's picks are still open for Sage Example" }).click();
  await expect(m.getByText("Today's picks are still open for Sage Example")).toHaveCount(0);
  await m.getByRole('button', { name: 'Dismiss: No backup recorded' }).click();
  await expect(m.locator('#list > div')).toHaveCount(2);
  await closeModal(page);
  await expect(bell).toHaveAccessibleName('Notifications, 2 new');
  await api.waitForState((s) => s.dismissedAlerts?.['backup:none'] && s.dismissedAlerts?.['picks:s_e2e_sage:2026-10-07']);

  // 29 days later (a Thursday morning, picks not due yet) the backup note stays
  // quiet; by then every learner has "No evidence this week", so look for it by name.
  const backupNote = async () => {
    await page.reload();
    await bell.click();
    await modal(page).getByLabel('Show').selectOption('all');
    await expect(modal(page).locator('#list > div').first()).toBeVisible();
    const count = await modal(page).getByText('No backup recorded').count();
    await closeModal(page);
    return count;
  };
  await at('2026-11-05T10:00:00Z');
  expect(await backupNote()).toBe(0);
  // ...and once 30 days have passed it comes back.
  await at('2026-11-07T10:00:00Z');
  expect(await backupNote()).toBe(1);
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
