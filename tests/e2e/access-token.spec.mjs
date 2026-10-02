// A second device on a server with HARRINGTON_ACCESS_TOKEN set (HAR-25):
// it is told how to sign in, signs in once with the link, and its unload
// beacon still saves with the cookie.
import { test, expect } from '@playwright/test';
import { ACCESS_TOKEN, URLS } from './support/env.mjs';

test('a device signs in once with the link and then loads and saves family data', async ({ page }) => {
  await page.goto(URLS.appToken);
  await expect(page.getByText('This device is not signed in to Harrington yet.')).toBeVisible();

  await page.goto(`${URLS.appToken}/login?token=${ACCESS_TOKEN}`);
  await expect(page).toHaveURL(`${URLS.appToken}/`);
  // A fresh server: onboarding. The bind is loopback, so the banner says so.
  await expect(page.getByRole('heading', { name: 'Add your first student' })).toBeVisible();
  await expect(page.getByText('Runs on this computer only.', { exact: false })).toBeVisible();

  const { version } = await (await page.request.get(`${URLS.appToken}/api/state`)).json();
  const queued = await page.evaluate((v) => navigator.sendBeacon('/api/state', new Blob([JSON.stringify({
    students: [{ id: 'b', name: 'Beacon Learner', birthYear: 2019 }], activeStudentId: 'b', version: v,
  })], { type: 'application/json' })), version);
  expect(queued).toBe(true);
  await expect.poll(async () => (await (await page.request.get(`${URLS.appToken}/api/state`)).json()).version).toBe(version + 1);
  const saved = await (await page.request.get(`${URLS.appToken}/api/state`)).json();
  expect(saved.students.map((s) => s.name)).toEqual(['Beacon Learner']);
});
