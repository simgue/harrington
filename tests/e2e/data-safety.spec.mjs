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
  await chooser.setFiles({ name: 'family.json', mimeType: 'application/json', buffer: Buffer.from(content) });
}

test('export downloads the whole family document as JSON', async ({ page, gotoApp, shot }) => {
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

test('import previews the file, cancel keeps the data, confirm replaces it', async ({ page, api, gotoApp, shot }) => {
  await gotoApp({ seed: {} });
  const incoming = {
    ...familyState({ learners: ['sage'], active: 'sage', progress: { [TOPICS.oneToOne.id]: 'mastered', [TOPICS.howMany.id]: 'learning' }, records: [{ type: 'question', title: 'Imported question' }] }),
    exportedAt: '2026-10-01T09:00:00.000Z',
    taxonomyVersion: 'v1',
    version: 41,
  };
  // Cancel first.
  await chooseImportFile(page, JSON.stringify(incoming));
  const preview = modal(page);
  await expect(preview.getByRole('heading', { name: 'Import family data?' })).toBeVisible();
  await expect(preview).toContainText('Sage Example');
  await expect(preview).toContainText('2 topics · 1 record · 0 tests');
  await expect(preview).toContainText('Recordings are not part of the file.');
  await shot('import-preview', { full: false });
  await preview.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();

  // Then confirm.
  await chooseImportFile(page, JSON.stringify(incoming));
  await modal(page).getByRole('button', { name: 'Replace family data' }).click();
  await expectToast(page, 'Family data imported');
  await expect(page.getByRole('heading', { name: "Sage Example's Wednesday" })).toBeVisible();
  const state = await api.waitForState((s) => s.students?.length === 1);
  expect(state.students[0].name).toBe('Sage Example');
  expect(state.records[LEARNERS.sage.id][0].title).toBe('Imported question');
  expect(state.exportedAt).toBeUndefined();

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

test('two tabs: the second save loses and reloads the first one\'s data with a toast', async ({ page, context, api, gotoApp, shot }) => {
  await gotoApp({ seed: {}, hash: `topic/${TOPICS.oneToOne.id}` });
  const other = await context.newPage();
  await other.clock.setFixedTime(FIXED_NOW);
  await other.goto(`/#topic/${TOPICS.howMany.id}`);
  await expect(other.getByRole('heading', { level: 1, name: TOPICS.howMany.name })).toBeVisible();

  // Tab A saves first.
  await setTopicStatus(page, 'Learning');
  await api.waitForState((s) => s.progress?.[ROWAN]?.[TOPICS.oneToOne.id]?.status === 'learning');

  // Tab B, still on the old version, saves and is told to reload.
  await setTopicStatus(other, 'Practicing');
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
