// Family data safety (HAR-10): versioned saves, export, import, and what a
// second tab sees when the first one saved first.
import { test, expect, modal, expectToast, nav, setTopicStatus } from './fixtures.mjs';
import { FIXED_NOW, TODAY_KEY } from './support/env.mjs';
import { LEARNERS, TOPICS } from './support/family.mjs';

const ROWAN = LEARNERS.rowan.id;
const exportButton = (page) => page.getByRole('button', { name: 'Export', exact: true });
const importButton = (page) => page.getByRole('button', { name: 'Import', exact: true });

async function chooseImportFile(page, content) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), importButton(page).click()]);
  await chooser.setFiles({ name: 'family.json', mimeType: 'application/json', buffer: Buffer.isBuffer(content) ? content : Buffer.from(content) });
}

test('export downloads the whole family document as JSON, PIN included (finding F16)', async ({ page, gotoApp, shot }) => {
  await gotoApp({ seed: { progress: { [TOPICS.oneToOne.id]: 'mastered' }, records: [{ type: 'observation', title: 'Counted to 12' }], extra: { settings: { parentPin: '2468' } } } });
  await shot('sidebar-export-import', { locator: page.locator('aside') });
  const [download] = await Promise.all([page.waitForEvent('download'), exportButton(page).click()]);
  await expectToast(page, 'Family data exported');
  expect(download.suggestedFilename()).toBe('harrington-family-2026-10-07.json');
  const doc = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8')));
  expect(doc.students.map((s) => s.name)).toEqual(['Wren Example', 'Rowan Example', 'Sage Example']);
  expect(doc.progress[ROWAN][TOPICS.oneToOne.id].status).toBe('mastered');
  expect(doc.records[ROWAN][0].title).toBe('Counted to 12');
  expect(doc.exportedAt).toBe(FIXED_NOW.toISOString());
  expect(doc.taxonomyVersion).toBe('v1');
  expect(Number.isInteger(doc.version)).toBe(true);
  // Finding: the child-view PIN (HAR-15) is stored and exported in plain text.
  expect(doc.settings.parentPin).toBe('2468');
});

test('round trip: the exported file previews, cancel keeps the data, confirm restores it exactly', async ({ page, api, gotoApp, shot }) => {
  // The family to export: one learner with progress and a record.
  await gotoApp({ seed: { learners: ['sage'], active: 'sage', progress: { [TOPICS.oneToOne.id]: 'mastered', [TOPICS.howMany.id]: 'learning' }, records: [{ type: 'question', title: 'Exported question' }] } });
  await expect(page.getByRole('heading', { name: "Sage Example's Wednesday" })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), exportButton(page).click()]);
  const file = Buffer.concat(await (await download.createReadStream()).toArray());
  const before = (await api.getState()).state;

  // The family changes afterwards (the three-learner family replaces it).
  await api.seed({});
  await page.reload();
  await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();

  // Cancel first.
  await chooseImportFile(page, file);
  const preview = modal(page);
  await expect(preview.getByRole('heading', { name: 'Import family data?' })).toBeVisible();
  await expect(preview).toContainText('Sage Example');
  await expect(preview).toContainText('2 topics · 1 record · 0 tests');
  await expect(preview).toContainText('Recordings are not part of the file.');
  await shot('import-preview', { full: false });
  await preview.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();
  expect((await api.getState()).state.students).toHaveLength(3);

  // Then the same file, confirmed.
  await chooseImportFile(page, file);
  await modal(page).getByRole('button', { name: 'Replace family data' }).click();
  await expectToast(page, 'Family data imported');
  await expect(page.getByRole('heading', { name: "Sage Example's Wednesday" })).toBeVisible();
  const restored = await api.waitForState((s) => s.students?.length === 1);
  // Everything the export carried comes back; only the save bookkeeping differs.
  const strip = ({ version, updatedAt, writeId, exportedAt, taxonomyVersion, ...rest }) => rest;
  expect(strip(restored)).toEqual(strip(before));
  expect(restored.version).toBeGreaterThan(before.version);

  // It survives a reload.
  await page.reload();
  await expect(page.getByRole('heading', { name: "Sage Example's Wednesday" })).toBeVisible();
});

test('import refuses files that are not a family export', async ({ page, api, gotoApp }) => {
  await gotoApp({ seed: {} });
  await chooseImportFile(page, 'this is not json');
  await expectToast(page, 'That file is not valid JSON');
  await chooseImportFile(page, JSON.stringify({ hello: 'world' }));
  await expectToast(page, 'The file has no learner list.');
  await chooseImportFile(page, JSON.stringify({ students: [{ name: 'No id' }] }));
  await expectToast(page, 'A learner in the file is missing an id or name.');
  await expect(page.locator('#modal-root > div')).toHaveCount(0);
  expect((await api.getState()).state.students).toHaveLength(3);
});

test('two tabs: the losing tab says which change it discarded, once, and Try again re-applies it (F17, fixed)', async ({ page, context, api, gotoApp, shot }) => {
  await gotoApp({ seed: {}, hash: `topic/${TOPICS.oneToOne.id}` });
  const other = await context.newPage();
  await other.clock.setFixedTime(FIXED_NOW);
  await other.goto(`/#topic/${TOPICS.howMany.id}`);
  await expect(other.getByRole('heading', { level: 1, name: TOPICS.howMany.name })).toBeVisible();
  const toasts = other.locator('#toast-root');

  // Both tabs write the curriculum snapshot and welcome note on boot; B's
  // boot write loses to A's, and B says nothing about it.
  await api.waitForState((s) => !!s.curriculumSnapshot);
  await expect(toasts.getByText(/Another device saved/)).toHaveCount(0);

  // Tab A saves first.
  await setTopicStatus(page, 'Learning');
  await api.waitForState((s) => s.progress?.[ROWAN]?.[TOPICS.oneToOne.id]?.status === 'learning');

  // Tab B, still on the old version, loses: one toast naming what it discarded.
  await setTopicStatus(other, 'Practicing');
  await expectToast(other, 'Marked as practicing');
  const conflict = toasts.getByRole('alert').filter({ hasText: 'Another device saved changes first' });
  await expect(conflict).toHaveText(/Not kept here: How Many in Total\? marked practicing\./);
  await expect(toasts.getByText(/Another device saved/)).toHaveCount(1);
  await shot('conflict-toast', { target: other, full: false });

  // B shows A's change; B's change is not on the server yet.
  await expect(other.getByRole('group', { name: 'Set status' }).getByRole('button', { name: 'Practicing' })).toHaveAttribute('aria-pressed', 'false');
  expect((await api.getState()).state.progress[ROWAN][TOPICS.howMany.id]).toBeUndefined();

  // Try again puts it back on the fresh copy, keeping A's change.
  await conflict.getByRole('button', { name: 'Try again' }).click();
  const state = await api.waitForState((s) => s.progress?.[ROWAN]?.[TOPICS.howMany.id]?.status === 'practicing');
  expect(state.progress[ROWAN][TOPICS.oneToOne.id].status).toBe('learning');
  expect(state.notifications.filter((n) => n.type === 'welcome')).toHaveLength(1);
  await nav(other, 'Dashboard').click();
  const growth = other.locator('section', { has: other.getByRole('heading', { name: 'Recent growth' }) });
  await expect(growth.getByRole('button', { name: /One-to-one counting.*Learning/ })).toBeVisible();
  await expect(growth.getByRole('button', { name: /How Many in Total\?.*Practicing/ })).toBeVisible();
  await expect(toasts.getByText(/Another device saved/)).toHaveCount(0);
  await other.close();
});

test('a first dashboard render that loses is put back silently, can be picked, and Try again still works (F17, fixed)', async ({ page, api, gotoApp, errors }) => {
  // Opening the dashboard writes the curriculum snapshot, the welcome note and
  // today's offers, and creates an empty recall container on read. Hold that
  // first save while another device saves a copy that has none of them.
  let release; const held = new Promise((r) => { release = r; });
  let seen; const holding = new Promise((r) => { seen = r; });
  let first = true;
  await page.route('**/api/state', async (route) => {
    if (route.request().method() === 'PUT' && first) { first = false; seen(); await held; }
    await route.continue();
  });
  await gotoApp({ seed: {} }); // no recall key, no offers, no snapshot
  await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();
  await holding;
  const { state: before } = await api.getState();
  before.progress[ROWAN][TOPICS.oneToOne.id] = { status: 'learning', updatedAt: FIXED_NOW.getTime() };
  await api.putState(before);
  release();

  // The 412 puts the tab's bookkeeping back on the fresh copy, silently.
  const toasts = page.locator('#toast-root');
  const saved = await api.waitForState((s) => !!s.daily?.[ROWAN]?.[TODAY_KEY] && !!s.curriculumSnapshot);
  expect(saved.daily[ROWAN][TODAY_KEY].picks).toEqual({});
  expect(saved.progress[ROWAN][TOPICS.oneToOne.id].status).toBe('learning');
  await expect(toasts.getByText(/Another device saved/)).toHaveCount(0);

  // The put-back day can be picked.
  const choice = page.getByRole('group', { name: 'Literacy: pick one' }).locator('button[aria-pressed]').first();
  await choice.click();
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await api.waitForState((s) => !!s.daily?.[ROWAN]?.[TODAY_KEY]?.picks?.literacy);

  // A later lost status change still names itself and offers Try again.
  const { state: later } = await api.getState();
  later.progress[ROWAN][TOPICS.oneToOne.id] = { status: 'practicing', updatedAt: FIXED_NOW.getTime() };
  await api.putState(later);
  await page.evaluate((id) => { location.hash = `#topic/${id}`; }, TOPICS.howMany.id);
  await expect(page.getByRole('heading', { level: 1, name: TOPICS.howMany.name })).toBeVisible();
  await setTopicStatus(page, 'Learning');
  const conflict = toasts.getByRole('alert').filter({ hasText: 'Another device saved changes first' });
  await expect(conflict).toHaveText(/Not kept here: How Many in Total\? marked learning\./);
  await conflict.getByRole('button', { name: 'Try again' }).click();
  const state = await api.waitForState((s) => s.progress?.[ROWAN]?.[TOPICS.howMany.id]?.status === 'learning');
  expect(state.progress[ROWAN][TOPICS.oneToOne.id].status).toBe('practicing');
  expect(state.daily[ROWAN][TODAY_KEY].picks.literacy).toBeTruthy();
  // The two 412s are the browser logging the refused saves; nothing else.
  expect(errors.filter((e) => !e.includes('status of 412'))).toEqual([]);
});

test('two tabs opened together on the dashboard raise no conflict (F17, fixed)', async ({ page, context, api }) => {
  const other = await context.newPage();
  await other.clock.setFixedTime(FIXED_NOW);
  // Both tabs write today's offers (and, until HAR-27, the curriculum snapshot
  // and welcome note) as they render; whichever loses says nothing.
  await api.seed({});
  await Promise.all([page.goto('/'), other.goto('/')]);
  await expect(other.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();
  await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();
  await api.waitForState((s) => !!s.daily?.[ROWAN] && !!s.curriculumSnapshot);
  // Give a losing boot write time to come back as a 412 before checking.
  await other.waitForTimeout(1500);
  for (const tab of [page, other]) await expect(tab.locator('#toast-root').getByText(/Another device saved/)).toHaveCount(0);
  // Both tabs can still pick today's choices.
  for (const tab of [page, other]) {
    const choice = tab.getByRole('group', { name: 'Numeracy: pick one' }).locator('button[aria-pressed]').first();
    await choice.click();
    await expect(choice).toHaveAttribute('aria-pressed', 'true');
  }
  await other.close();
});

test('removing a learner now clears all of their data', async ({ page, api, gotoApp }) => {
  const wren = LEARNERS.wren.id;
  await gotoApp({
    seed: {
      extra: {
        tests: { [wren]: [{ id: 't_x', scope: 'topic', subject: 'Mathematics', pct: 100, passed: true, createdAt: 1 }] },
        plan: { [wren]: { moves: {}, done: { '2026-10-06': 1 }, extras: {} } },
        game: { [wren]: { xp: 40, badges: {} } },
      },
    },
  });
  await page.getByRole('button', { name: 'Switch learner' }).first().click();
  page.once('dialog', (d) => d.accept());
  await modal(page).getByText('Wren Example', { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-full")][1]').locator('button').last().click();
  const state = await api.waitForState((s) => s.students?.length === 2);
  for (const key of ['progress', 'records', 'tests', 'plan', 'game']) expect(state[key]?.[wren]).toBeUndefined();
});
