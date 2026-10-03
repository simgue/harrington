// Family data safety (HAR-10): versioned saves, export, import, and what a
// second tab sees when the first one saved first.
import { test, expect, modal, expectToast, nav, setTopicStatus } from './fixtures.mjs';
import { FIXED_NOW } from './support/env.mjs';
import { LEARNERS, TOPICS, familyState } from './support/family.mjs';

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
  await expectToast(page, 'Learner 1 in the file is missing an id or name.');
  await expect(page.locator('#modal-root > div')).toHaveCount(0);
  expect((await api.getState()).state.students).toHaveLength(3);
});

test('an imported analysis renders as text, not markup', async ({ page, api, gotoApp }) => {
  await gotoApp({ seed: {} });
  const doc = (await api.getState()).state;
  const hostile = '<p>Kept paragraph</p><img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>';
  doc.records[ROWAN] = [{ id: 'r_hostile', type: 'observation', title: 'Imported note', note: '', createdAt: FIXED_NOW.getTime() - 3_600_000, analysis: hostile }];
  await chooseImportFile(page, JSON.stringify(doc));
  await modal(page).getByRole('button', { name: 'Replace family data' }).click();
  await expectToast(page, 'Family data imported');
  await nav(page, 'Records').click();
  const prose = page.locator('.ai-prose').first();
  await expect(prose).toContainText('Kept paragraph');
  await expect(prose).toContainText('<img src=x onerror="window.__pwned=1">');
  await expect(prose.locator('p')).toHaveCount(1);
  await expect(prose.locator('img, script')).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('a newer data format opens read-only: a banner, Import disabled, nothing saved', async ({ page, api, gotoApp, errors }) => {
  // Another Harrington, one data format ahead, saved this document.
  const doc = { ...familyState({ learners: ['rowan'], active: 'rowan' }), schemaVersion: 2, levelset: { future: true } };
  await api.putState({ ...doc, schemaVersion: 1 }); // the server here only stores format 1
  const writes = [];
  await page.route('**/api/state', (route) => {
    const method = route.request().method();
    if (method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', headers: { ETag: '"v7"' }, body: JSON.stringify({ ...doc, version: 7 }) });
    writes.push(method);
    return route.fulfill({ status: 204, headers: { ETag: '"v8"' } });
  });
  await gotoApp({ seed: null, hash: `topic/${TOPICS.oneToOne.id}` });
  await expect(page.locator('.read-only-banner')).toContainText('saved by a newer version of Harrington');
  await expect(importButton(page)).toBeDisabled();

  // A change shows on the page but never reaches the server, not even on hide.
  await setTopicStatus(page, 'Learning');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(800);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test('two tabs: the second save loses and reloads the first one\'s data, after a success toast (finding F17)', async ({ page, context, api, gotoApp, shot }) => {
  await gotoApp({ seed: {}, hash: `topic/${TOPICS.oneToOne.id}` });
  const other = await context.newPage();
  await other.clock.setFixedTime(FIXED_NOW);
  await other.goto(`/#topic/${TOPICS.howMany.id}`);
  await expect(other.getByRole('heading', { level: 1, name: TOPICS.howMany.name })).toBeVisible();

  // Tab A saves first.
  await setTopicStatus(page, 'Learning');
  await api.waitForState((s) => s.progress?.[ROWAN]?.[TOPICS.oneToOne.id]?.status === 'learning');

  // Tab B, still on the old version, saves and is told to reload. Finding:
  // B first confirms "Marked as practicing", then discards it. (B's own boot
  // write also lost to A's, so B shows the conflict toast twice; see F17.)
  await setTopicStatus(other, 'Practicing');
  await expectToast(other, 'Marked as practicing');
  await expectToast(other, 'Another device saved changes. Reloaded the latest.');
  await shot('conflict-toast', { target: other, full: false });

  // B now shows A's change; B's own change was discarded (no merge).
  await nav(other, 'Dashboard').click();
  const growth = other.locator('section', { has: other.getByRole('heading', { name: 'Recent growth' }) });
  await expect(growth.getByRole('button', { name: /One-to-one counting.*Learning/ })).toBeVisible();
  await expect(growth.getByRole('button', { name: /How Many in Total\?/ })).toHaveCount(0);
  const { state } = await api.getState();
  expect(state.progress[ROWAN][TOPICS.howMany.id]).toBeUndefined();
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
