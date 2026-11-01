// Teaching guides: Marble's teaching research on the topic page, with no AI.
// Runs in `desktop` (AI pointed at the mock) and, for the tests tagged
// @mobile, at 390×844 in `mobile`. The no-AI ordering ("Open the teaching
// guide" before the chip) is in no-ai.spec.mjs.
import { test, expect, noHorizontalOverflow } from './fixtures.mjs';
import { TOPICS } from './support/family.mjs';

const ONE = TOPICS.oneToOne; // Mathematics, has research
const HISTORY = { id: 'mt_IR8kIjZn_V', name: "Discovering Tutankhamun's Tomb" }; // History has none

// The first guide request on a fresh server splits the 23.5 MB file (a few seconds).
const SPLIT = { timeout: 30_000 };

test('@mobile a Mathematics topic has a collapsed teaching guide with activities, a check and the credit', async ({ page, gotoApp, shot, errors }) => {
  await gotoApp({ seed: {}, hash: `topic/${ONE.id}` });
  const guide = page.locator('#teaching-guide');
  await expect(guide).toBeVisible(SPLIT);
  await expect(guide.getByRole('heading', { level: 2, name: 'Teaching guide' })).toBeVisible();
  await expect(guide).not.toHaveAttribute('open', '');
  // A comfortable target on a phone.
  const header = guide.locator('summary').first();
  expect((await header.boundingBox()).height).toBeGreaterThanOrEqual(44);

  await header.click();
  await expect(guide).toHaveAttribute('open', '');
  await expect(guide).toContainText('One-to-one correspondence for ages 4–6');
  for (const title of ['Feed the squirrel: tap-count a scattered pile', 'Did Teddy count right? Spot the miscount', 'Count everyday things in structured frames and in daily life']) {
    await expect(guide.getByText(title)).toBeVisible();
  }
  // With the guide open, a closed activity's chevron still points right: each
  // details element drives its own chevron (named Tailwind groups).
  const chevronTurned = (details) => details.locator('summary svg, summary i').first()
    .evaluate((icon) => getComputedStyle(icon).transform !== 'none');
  const activities = guide.locator('details.guide-activity');
  await expect(activities).toHaveCount(3);
  expect(await chevronTurned(activities.nth(1))).toBe(false);
  // Each activity opens to its steps, what to notice and the feedback notes.
  await guide.getByText('Feed the squirrel: tap-count a scattered pile').click();
  await expect.poll(() => chevronTurned(activities.nth(0))).toBe(true);
  expect(await chevronTurned(activities.nth(1))).toBe(false);
  for (const label of ['Steps', 'What they should notice', 'If they take a wrong turn']) {
    await expect(guide.getByText(label, { exact: true }).first()).toBeVisible();
  }

  await expect(guide.getByRole('heading', { name: 'Check understanding' })).toBeVisible();
  await expect(guide.getByText('Predict, then explain')).toBeVisible();
  await expect(guide.getByText(/Watch Teddy count these 6 buttons/)).toBeVisible();
  for (const label of ['A strong answer', 'Common wrong turns', 'Where they are']) {
    await expect(guide.getByText(label, { exact: true })).toBeVisible();
  }
  for (const level of ['Not yet', 'Getting there', 'Got it']) {
    await expect(guide.getByText(level, { exact: true })).toBeVisible();
  }

  // Sources are plain links that open in a new tab.
  await guide.getByText('Sources (4)').click();
  const sources = guide.getByRole('link', { name: /Common Core State Standards/ });
  await expect(sources).toHaveAttribute('target', '_blank');
  await expect(sources).toHaveAttribute('href', /^https:\/\//);

  // Marble's own caveat (notes[0] of the pinned file) verbatim, Harrington's
  // gloss apart from it, then the credit, close the section.
  await expect(guide.locator('.guide-caveat')).toHaveText('Agent-authored teaching research and proposed learning activities; not empirically validated interventions.');
  await expect(guide.locator('.guide-gloss')).toHaveText(/^Harrington’s note: /);
  await expect(guide.locator('.guide-credit')).toHaveText('From the Marble Skill Taxonomy teaching research · © Generative Spark, Inc. (Marble) · CC BY-SA 4.0');
  const license = guide.getByRole('link', { name: 'License' });
  await expect(license).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/');
  for (const link of [license, guide.getByRole('link', { name: 'Source', exact: true })]) {
    const box = await link.boundingBox();
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  }
  // Internal metadata stays out.
  for (const internal of ['confidence', 'provenance', 'reviewNotes', 'teaching-research plugin']) {
    await expect(guide).not.toContainText(internal);
  }

  // With AI on, the lesson stays the first choice: no guide button in the CTA.
  await expect(page.getByRole('button', { name: 'Open the teaching guide' })).toHaveCount(0);
  await noHorizontalOverflow(page);
  // The viewport only: the open guide is several screens long (size budget).
  await guide.getByRole('heading', { name: 'Check understanding' }).scrollIntoViewIfNeeded();
  await shot('math-guide-open', { full: false });
  expect(errors).toEqual([]);
});

test('@mobile a History topic has no teaching guide and no empty section', async ({ page, gotoApp, errors }) => {
  const listed = page.waitForResponse((res) => res.url().endsWith('/api/taxonomy/research'), SPLIT);
  await gotoApp({ seed: {}, hash: `topic/${HISTORY.id}` });
  await expect(page.getByRole('heading', { level: 1, name: HISTORY.name })).toBeVisible();
  expect((await listed).status()).toBe(200);
  // The placeholder goes once the list says this topic has no guide.
  await expect(page.locator('.teaching-guide-slot')).toHaveCount(0);
  await expect(page.locator('#teaching-guide')).toHaveCount(0);
  await expect(page.getByText('Teaching guide', { exact: true })).toHaveCount(0);
  // So no Print button either.
  await expect(page.getByRole('button', { name: 'Print the teaching guide' })).toHaveCount(0);
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

// Pages a print document takes on A4 and on US Letter, as Chromium lays it out.
async function pageCounts(popup) {
  await popup.emulateMedia({ media: 'print' });
  const pages = async (format) => (await popup.pdf({ format, margin: { top: '0', bottom: '0', left: '0', right: '0' } }))
    .toString('latin1').match(/\/Type\s*\/Page[^s]/g).length;
  return { a4: await pages('A4'), letter: await pages('Letter') };
}

async function openPrint(page, context, gotoApp, id) {
  // The print dialog itself is the browser's; the test only notes it was asked for.
  await context.addInitScript(() => { window.print = () => { window.__printed = true; }; });
  await gotoApp({ seed: {}, hash: `topic/${id}` });
  const guide = page.locator('#teaching-guide');
  await expect(guide).toBeVisible(SPLIT);
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    guide.getByRole('button', { name: 'Print the teaching guide' }).click(),
  ]);
  await popup.waitForLoadState();
  return { guide, popup };
}

test('Print opens the whole guide on paper: every activity, the check, sources, the caveat and credit, no name', async ({ page, context, gotoApp, shot, errors }) => {
  const { guide, popup } = await openPrint(page, context, gotoApp, ONE.id);
  // Printing does not open or close the section.
  await expect(guide).not.toHaveAttribute('open', '');
  const box = await guide.getByRole('button', { name: 'Print the teaching guide' }).boundingBox();
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);

  await expect(popup).toHaveTitle(`${ONE.name} — Teaching guide`);
  await expect(popup.getByRole('heading', { level: 1, name: ONE.name })).toBeVisible();
  await expect(popup.locator('.kind')).toHaveText('Teaching guide');
  await expect(popup.locator('.sub')).toHaveText('Mathematics · Counting & Cardinality · Ages 4–6');
  await expect(popup.locator('section.activity')).toHaveCount(3);
  // Activity headings carry their number ("1. Feed the squirrel…").
  for (const title of ['Feed the squirrel: tap-count a scattered pile', 'Did Teddy count right? Spot the miscount']) {
    await expect(popup.locator('section.activity h3', { hasText: title })).toBeVisible();
  }
  for (const text of ['What they should notice', 'If they take a wrong turn',
    'Check understanding', 'Predict, then explain', 'A strong answer', 'Common wrong turns', 'Not yet', 'Getting there', 'Got it']) {
    await expect(popup.getByText(text, { exact: true }).first()).toBeVisible();
  }
  // Sources as plain URLs, no links.
  await expect(popup.locator('ul.sources li')).toHaveCount(4);
  await expect(popup.locator('ul.sources')).toContainText('https://');
  await expect(popup.locator('a')).toHaveCount(0);
  await expect(popup.locator('footer .caveat')).toHaveText('Agent-authored teaching research and proposed learning activities; not empirically validated interventions.');
  await expect(popup.locator('footer .credit')).toHaveText('From the Marble Skill Taxonomy teaching research · © Generative Spark, Inc. (Marble) · CC BY-SA 4.0');
  await expect(popup.locator('footer .printed')).toHaveText('Printed from Harrington on October 7, 2026');
  // The guide is not per-learner.
  const text = await popup.locator('body').innerText();
  for (const name of ['Rowan', 'Sage', 'Wren', 'Name:']) expect(text).not.toContain(name);
  await expect.poll(() => popup.evaluate(() => window.__printed === true)).toBe(true);

  const pages = await pageCounts(popup);
  test.info().annotations.push({ type: 'pages', description: `Mathematics (${ONE.name}): A4 ${pages.a4}, Letter ${pages.letter}` });
  // Two pages on A4 (three on Letter) at 11 px; across a sample of guides,
  // two to four.
  expect(pages.a4).toBeLessThanOrEqual(2);
  expect(pages.letter).toBeLessThanOrEqual(3);
  await popup.emulateMedia({ media: 'screen' });
  await popup.setViewportSize({ width: 900, height: 1100 });
  await shot('guide-print', { target: popup, full: false });
  await popup.close();
  expect(errors).toEqual([]);
});

test('a Science guide prints too, in three pages', async ({ page, context, gotoApp }) => {
  const SCIENCE = { id: 'mt_B3W5EfimJw', name: 'Pushes & Pulls' };
  const { popup } = await openPrint(page, context, gotoApp, SCIENCE.id);
  await expect(popup.getByRole('heading', { level: 1, name: SCIENCE.name })).toBeVisible();
  await expect(popup.locator('.sub')).toContainText('Science · ');
  const pages = await pageCounts(popup);
  test.info().annotations.push({ type: 'pages', description: `Science (${SCIENCE.name}): A4 ${pages.a4}, Letter ${pages.letter}` });
  expect(pages.a4).toBeLessThanOrEqual(3);
  expect(pages.letter).toBeLessThanOrEqual(3);
  await popup.close();
});

test('the server serves one topic at a time and never the whole file', async ({ request }) => {
  const one = await request.get(`/api/taxonomy/research/${ONE.id}`, SPLIT);
  expect(one.status()).toBe(200);
  expect((await one.json()).topicId).toBe(ONE.id);
  expect((await request.get(`/api/taxonomy/research/${HISTORY.id}`)).status()).toBe(404);
  expect((await request.get('/api/taxonomy/research/..%2F..%2Ffamily-state')).status()).toBe(400);
  expect((await request.get('/api/taxonomy/teaching-research.json')).status()).toBe(404);
});
