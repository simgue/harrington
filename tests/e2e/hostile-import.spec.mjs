// A hostile family file (PR #32 review, item 1). Each payload is refused at
// import with its reason, and the views escape it even when a document
// carrying all of them reaches the browser without those checks.
import { test, expect, modal, expectToast, nav } from './fixtures.mjs';
import { LEARNERS, TOPICS } from './support/family.mjs';
import { HOSTILE_CHANGES, everyRenderPayload, hostileFamily } from './support/hostile-family.mjs';

const importButton = (page) => page.getByRole('button', { name: 'Import', exact: true });
async function chooseImportFile(page, doc) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), importButton(page).click()]);
  await chooser.setFiles({ name: 'family.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
}

test('import refuses each hostile payload with its reason, and nothing runs', async ({ page, api, gotoApp, errors }) => {
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  await gotoApp({ seed: {} });
  const learnersAndRecords = async () => { const { state } = await api.getState(); return { students: state.students, records: state.records }; };
  const before = await learnersAndRecords();
  for (const [label, , reason] of HOSTILE_CHANGES) {
    await chooseImportFile(page, hostileFamily(label));
    await expectToast(page, reason);
    await expect(page.locator('#modal-root > div')).toHaveCount(0);
  }
  expect(await learnersAndRecords()).toEqual(before);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(dialogs).toEqual([]);
  expect(errors).toEqual([]);
});

test('every view escapes a hostile document that reaches the browser', async ({ page, gotoApp, errors }) => {
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  // Serve the document straight to the browser, past the import check and the
  // server's save check, and accept its saves without storing them.
  let version = 1;
  const doc = everyRenderPayload();
  await page.route('**/api/state', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { ETag: `"v${version}"` }, body: JSON.stringify({ ...doc, version }) });
    }
    version += 1;
    return route.fulfill({ status: 204, headers: { ETag: `"v${version}"` } });
  });
  await gotoApp({ seed: {} });

  await expect(page.getByRole('heading', { name: `${LEARNERS.rowan.name}'s Wednesday` })).toBeVisible();
  await expect(page.getByText(/total XP/)).toBeVisible();

  await nav(page, 'Records').click();
  await expect(page.getByText('Six stars')).toBeVisible();
  await expect(page.getByText('★★★★★').first()).toBeVisible();
  await expect(page.locator('.ai-prose').first()).toContainText('<img src=x');

  await page.goto(`/#topic/${TOPICS.oneToOne.id}`);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: TOPICS.oneToOne.name })).toBeVisible();
  await expect(page.getByText(/Passed the topic test with <img/)).toBeVisible();

  await nav(page, 'Insights').click();
  await expect(page.getByRole('heading', { name: 'Teacher Insights' })).toBeVisible();

  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(dialogs).toEqual([]);
  expect(errors).toEqual([]);
});
