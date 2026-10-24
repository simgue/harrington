// "See how it works" figures (HAR-34): every figure page on its own, then the
// figure on the topic page and in the child view. The phone checks are in
// mobile.spec.mjs.
import { readFileSync, readdirSync } from 'node:fs';
import { test, expect, modal, childView } from './fixtures.mjs';
import { figureIdOf, figureMeta } from '../../src/js/figures/contract.js';

// Every page in src/figures/, found the way the server finds them: by file name.
const DIR = new URL('../../src/figures/', import.meta.url);
const FIGURES = Object.fromEntries(readdirSync(DIR).filter(figureIdOf)
  .map((name) => [figureIdOf(name), figureMeta(readFileSync(new URL(name, DIR), 'utf8'))]));

const CART = 'mt_B3W5EfimJw';          // Pushes & Pulls: the toy cart
const NO_FIGURE = 'mt_WcfaSfVT33';     // One-to-one counting (Mathematics) has none

// What a figure page shows right now: the drawing, the note under the buttons
// and the big numbers. A press that changes none of them was ignored.
const snapshot = (frame) => frame.evaluate(() => [
  document.getElementById('art').innerHTML,
  document.getElementById('toast').classList.contains('show') ? document.getElementById('toast').textContent : '',
  document.getElementById('stats').textContent,
].join('\n'));

// Every request a page makes must stay on the app's own origin.
function watchRequests(page, baseURL) {
  const outside = [];
  page.on('request', (r) => { if (!r.url().startsWith(baseURL) && !/^(data|about|blob):/.test(r.url())) outside.push(r.url()); });
  return outside;
}

test('every figure page is listed by the server and belongs to a Science topic for ages 5 to 8', async ({ api }) => {
  const listed = await (await api.request.get(api.url('/api/figures'))).json();
  expect(listed.figures.map((f) => f.id).sort()).toEqual(Object.keys(FIGURES).sort());
  const res = await api.request.get(api.url('/api/taxonomy/topics.json'));
  const data = await res.json();
  const topics = new Map((Array.isArray(data) ? data : data.topics).map((t) => [t.id, t]));
  for (const id of Object.keys(FIGURES)) {
    const t = topics.get(id);
    expect(t, `${id} is a topic in the pinned taxonomy`).toBeTruthy();
    expect(t.subject, `${id} subject`).toBe('Science');
    expect(t.ageRangeStart <= 8 && t.ageRangeEnd >= 5, `${id} (${t.name}) overlaps ages 5 to 8`).toBe(true);
  }
});

for (const [id, meta] of Object.entries(FIGURES)) {
  test(`figure page ${meta.title}: loads offline, labels on, every button answers`, async ({ page, baseURL, errors }) => {
    const outside = watchRequests(page, baseURL);
    const res = await page.goto(`/figures/${id}.html`);
    expect(res.headers()['content-security-policy']).toContain("default-src 'none'");
    await expect(page).toHaveTitle(meta.title);
    const buttons = page.locator('.act');
    const count = await buttons.count();
    expect(count, '2 to 5 actions').toBeGreaterThanOrEqual(2);
    expect(count, '2 to 5 actions').toBeLessThanOrEqual(5);
    // Labels are on by default, with a switch to hide them.
    await expect(page.getByRole('button', { name: 'Labels on' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#fig .tag').first()).toBeVisible();
    for (const b of await buttons.all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);

    // Press every action in the order a child would; each one changes the
    // figure or says why it can't.
    for (let i = 0; i < count; i += 1) {
      const before = await snapshot(page);
      const button = buttons.nth(i);
      await button.click();
      if (await button.getAttribute('aria-expanded') === 'true') {
        const chips = page.locator('.stepwrap.open .chip');
        const usable = page.locator('.stepwrap.open .chip:not(.off):not(.current)');
        await ((await usable.count()) ? usable.first() : chips.first()).click();
      }
      await expect.poll(() => snapshot(page), { message: `"${await button.textContent()}" changes the figure or explains`, timeout: 3_000 }).not.toBe(before);
      await page.waitForTimeout(1_200);
    }
    // Pressing the last action first (out of order) is answered too.
    await page.goto(`/figures/${id}.html`);
    const before = await snapshot(page);
    const last = page.locator('.act').last();
    await last.click();
    if (await last.getAttribute('aria-expanded') === 'true') await page.locator('.stepwrap.open .chip').first().click();
    await expect.poll(() => snapshot(page), { timeout: 3_000 }).not.toBe(before);

    await page.getByRole('button', { name: 'Labels on' }).click();
    await expect(page.locator('#fig .tag').first()).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.dataset.errors || '')).toBe('');
    expect(errors).toEqual([]);
    expect(outside).toEqual([]);
  });

  test(`figure page ${meta.title}: makes no request, shows no link or credit, reports errors in data-errors`, async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto(`/figures/${id}.html?press=Nope@0`);
    await expect(page.locator('.act').first()).toBeVisible();
    // The only request is the page itself, and the policy blocks any the page tries.
    expect(await page.evaluate(() => fetch('/api/health').then(() => 'reached', () => 'blocked'))).toBe('blocked');
    expect(await page.evaluate(() => new Promise((done) => { const img = new Image(); img.onload = () => done('reached'); img.onerror = () => done('blocked'); img.src = '/favicon.ico'; }))).toBe('blocked');
    expect(requests.filter((url) => !url.startsWith('data:'))).toEqual([new URL(`/figures/${id}.html?press=Nope@0`, page.url()).href]);
    // No link and no credit text anywhere on the page.
    await expect(page.locator('a, [href]')).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toMatch(/made with|colorfigures|april-zhu/i);
    // An unknown ?press= label and an uncaught error both land in <html data-errors>.
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.errors || '')).toContain('no button "Nope"');
    // (as a script of the page's own, like the figure's code, not Playwright's evaluate)
    await page.evaluate(() => { const s = document.createElement('script'); s.textContent = "throw new Error('figure test error');"; document.body.append(s); });
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.errors || '')).toContain('figure test error');
  });
}

test('topic page: "See how it works" shows the figure in a sandboxed frame; pressing it saves nothing', async ({ page, api, baseURL, gotoApp, shot, errors }) => {
  const outside = watchRequests(page, baseURL);
  await gotoApp({ seed: {}, hash: `topic/${CART}` });
  const section = page.locator('div.bg-paper-card', { has: page.getByRole('heading', { name: 'See how it works' }) });
  await expect(section).toBeVisible();
  const frameEl = section.locator('iframe');
  await expect(frameEl).toHaveAttribute('sandbox', 'allow-scripts');
  await expect(frameEl).toHaveAttribute('src', `figures/${CART}.html`);
  await expect(frameEl).toHaveAttribute('title', 'Toy cart: how it works');
  await expect(section).toContainText(FIGURES[CART].hint);
  const { state: before } = await api.getState();

  const fig = page.frameLocator(`iframe[title="Toy cart: how it works"]`);
  await expect(fig.locator('#stats')).toContainText('0');
  await fig.getByRole('button', { name: 'Push hard' }).click();
  await expect(fig.locator('#stats .v')).not.toHaveText('0', { timeout: 5_000 });
  await expect(fig.locator('#fig .tag.on').first()).toBeVisible();
  await section.scrollIntoViewIfNeeded();
  await shot('topic-see-how-it-works', { locator: section });

  // The frame is an opaque origin: it cannot read the app's storage.
  const frame = page.frames().find((f) => f.url().includes(`/figures/${CART}.html`));
  expect(await frame.evaluate(() => { try { return typeof localStorage.length; } catch { return 'blocked'; } })).toBe('blocked');
  expect(await frame.evaluate(() => document.documentElement.dataset.errors || '')).toBe('');
  // Viewing and pressing write nothing.
  await page.waitForTimeout(600);
  expect((await api.getState()).state.version).toBe(before.version);

  // Full size opens the figure on its own route, and Back returns to the topic.
  await section.getByRole('button', { name: 'Full size' }).click();
  await expect(page).toHaveURL(new RegExp(`#figure/${CART}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Toy cart' })).toBeVisible();
  await expect(page.locator('iframe[title="Toy cart: how it works"]')).toHaveAttribute('sandbox', 'allow-scripts');
  await page.getByRole('button', { name: 'Back to the topic' }).click();
  await expect(page).toHaveURL(new RegExp(`#topic/${CART}$`));
  expect(errors).toEqual([]);
  expect(outside).toEqual([]);
});

test('topic page: a topic without a figure has no "See how it works" section', async ({ page, gotoApp }) => {
  await gotoApp({ seed: {}, hash: `topic/${NO_FIGURE}` });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'See how it works' })).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('child view: the topic card shows the figure and it can be pressed', async ({ page, api, gotoApp, shot, errors }) => {
  await gotoApp({ seed: {} });
  await page.getByRole('button', { name: "Rowan Example's view" }).click();
  await expect(childView(page)).toBeVisible();
  // The child view's picks depend on the day; open the card for the cart
  // topic the same way its buttons do.
  await page.evaluate(async (id) => {
    const [{ getData }, { openChildTopic }] = await Promise.all([import('/js/data.js'), import('/js/views/childtopic.js')]);
    openChildTopic(getData().byId.get(id));
  }, CART);
  const card = modal(page);
  await expect(card.getByRole('heading', { name: 'See how it works' })).toBeVisible();
  await expect(card.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts');
  const { state: before } = await api.getState();
  const fig = page.frameLocator('iframe[title="Toy cart: how it works"]');
  await fig.getByRole('button', { name: 'Push gently' }).click();
  await expect(fig.locator('#stats .v')).not.toHaveText('0', { timeout: 5_000 });
  await shot('child-card-figure', { full: false });
  await page.waitForTimeout(600);
  expect((await api.getState()).state.version).toBe(before.version);
  expect(errors).toEqual([]);
});
