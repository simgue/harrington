// Phone-sized walkthrough recorded on video (project "walkthrough-mobile").
//   docs/e2e/recordings/walkthrough-mobile.webm
import { test, expect, closeModal, leaveChildView } from './fixtures.mjs';
import { TOPICS } from './support/family.mjs';

const ONE = TOPICS.oneToOne;
const beat = (page, ms = 700) => page.waitForTimeout(ms);

test('mobile walkthrough', async ({ page, gotoApp }) => {
  test.setTimeout(3 * 60_000);
  test.info().annotations.push({ type: 'recording', description: 'walkthrough-mobile' });
  await gotoApp({ seed: { progress: { [ONE.id]: 'learning' } } });
  const bottom = page.getByRole('navigation', { name: 'Main' });
  await beat(page);
  for (let i = 0; i < 6; i += 1) { await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), 500); await beat(page, 450); }
  for (const label of ['Calendar', 'Map', 'Records', 'Insights']) {
    await bottom.getByRole('button', { name: label }).click();
    await beat(page, 1200);
    await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), 500);
    await beat(page, 600);
  }
  await page.goto(`/#graph/Mathematics/${encodeURIComponent('Counting & Cardinality')}`);
  await page.locator('button.skill-node', { hasText: ONE.name }).first().click();
  await expect(page.getByRole('complementary', { name: 'Quest log' })).toBeVisible();
  await beat(page, 1200);
  await page.getByRole('complementary', { name: 'Quest log' }).getByRole('button', { name: 'Open topic page' }).click();
  await beat(page);
  for (let i = 0; i < 5; i += 1) { await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), 600); await beat(page, 450); }
  await page.getByRole('button', { name: 'Open the guide' }).click();
  await beat(page, 1500);
  await closeModal(page);
  await bottom.getByRole('button', { name: 'Dashboard' }).click();
  await page.getByRole('button', { name: "Rowan Example's view" }).click();
  await beat(page, 1500);
  for (let i = 0; i < 3; i += 1) { await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), 500); await beat(page, 500); }
  await leaveChildView(page);
  await beat(page);
});
