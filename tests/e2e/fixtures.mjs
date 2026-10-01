// Shared fixtures for every e2e spec:
//   api      – family-state helpers over the HTTP API (works with or without If-Match)
//   mockAi   – read/clear the mock provider's request log, force failures
//   shot     – shot(name) writes docs/e2e/screenshots/<area>/<nn>-<name>.jpg
//   errors   – console errors and page errors seen during the test
//   gotoApp  – seed a family, open the app and wait until it has rendered
// Options:
//   tour        – false (default) marks the welcome tour as seen before load
//   fixedClock  – true (default) pins Date to FIXED_NOW (timers keep running)
import { test as base, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXED_NOW, URLS } from './support/env.mjs';
import { familyState } from './support/family.mjs';

export { expect };
export const SHOTS_DIR = fileURLToPath(new URL('../../docs/e2e/screenshots/', import.meta.url));
const shotsEnabled = process.env.E2E_SCREENSHOTS !== '0';
const shotCounters = new Map();

export class Api {
  constructor(request, baseURL) {
    this.request = request;
    this.baseURL = baseURL;
  }

  url(path) { return new URL(path, this.baseURL).toString(); }

  async getState() {
    const res = await this.request.get(this.url('/api/state'));
    expect(res.ok()).toBeTruthy();
    return { state: await res.json(), etag: res.headers().etag || null };
  }

  // Writes the whole family state. Today the server ignores versions; once
  // versioned state lands (HAR-10) it wants the ETag back as If-Match, so we
  // always read first and retry once on a precondition failure.
  async putState(state) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { etag } = await this.getState();
      const headers = { 'Content-Type': 'application/json' };
      if (etag) headers['If-Match'] = etag;
      const res = await this.request.put(this.url('/api/state'), { headers, data: state });
      if (res.ok()) return res;
      if (![409, 412, 428].includes(res.status())) {
        throw new Error(`PUT /api/state failed: ${res.status()} ${await res.text()}`);
      }
    }
    throw new Error('PUT /api/state kept failing its precondition');
  }

  async reset() { await this.putState({}); }

  async seed(options) {
    const state = familyState(options);
    await this.putState(state);
    return state;
  }

  // The browser saves 400 ms after a change; poll the server until it agrees.
  async waitForState(predicate, message = 'saved family state') {
    await expect.poll(async () => predicate((await this.getState()).state), { message, timeout: 10_000 }).toBeTruthy();
    return (await this.getState()).state;
  }
}

export class MockAi {
  constructor(request) { this.request = request; }
  async log() { return (await this.request.get(`${URLS.mockAi}/__log`)).json(); }
  async kinds() { return (await this.log()).map((entry) => entry.kind); }
  async clear() { await this.request.delete(`${URLS.mockAi}/__log`); }
  async failNext(count = 1) { await this.request.post(`${URLS.mockAi}/__fail`, { data: { count } }); }
}

function areaFor(testInfo) {
  const file = basename(testInfo.file).replace(/\.spec\.mjs$/, '');
  return file;
}

export const test = base.extend({
  tour: [false, { option: true }],
  fixedClock: [true, { option: true }],

  errors: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
    await use(errors);
  },

  page: async ({ page, tour, fixedClock }, use) => {
    if (fixedClock) await page.clock.setFixedTime(FIXED_NOW);
    if (!tour) {
      await page.addInitScript(() => { try { localStorage.setItem('harrington:welcomeSeen', '1'); } catch {} });
    }
    await use(page);
  },

  api: async ({ request, baseURL }, use) => {
    const api = new Api(request, baseURL);
    // Every test starts from an empty family.
    await api.reset();
    await use(api);
  },

  mockAi: async ({ request }, use) => { await use(new MockAi(request)); },

  shot: async ({ page }, use, testInfo) => {
    const area = areaFor(testInfo);
    await use(async (name, { full = true, locator = null, target = page } = {}) => {
      if (!shotsEnabled) return;
      const n = (shotCounters.get(area) || 0) + 1;
      shotCounters.set(area, n);
      const dir = join(SHOTS_DIR, area);
      await mkdir(dir, { recursive: true });
      // Let Lucide icons swap in and modal/fade transitions settle.
      await target.waitForTimeout(350);
      const path = join(dir, `${String(n).padStart(2, '0')}-${name}.jpg`);
      const options = { path, type: 'jpeg', quality: 70, animations: 'disabled', caret: 'hide' };
      if (locator) await locator.screenshot(options);
      else await target.screenshot({ ...options, fullPage: full });
    });
  },

  // Seed the family (or not) and open a route, waiting for the shell.
  gotoApp: async ({ page, api }, use) => {
    await use(async ({ seed = {}, hash = '' } = {}) => {
      if (seed !== null) await api.seed(seed);
      await page.goto(`/${hash ? `#${hash}` : ''}`);
      await expect(page.getByText('Loading your homeschool workspace')).toHaveCount(0, { timeout: 30_000 });
    });
  },
});

// ---- Small page helpers used across specs ----

export function modal(page) {
  // The top-most open modal panel.
  return page.locator('#modal-root > div').last();
}

export async function closeModal(page) {
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-root > div')).toHaveCount(0);
}

export function nav(page, label) {
  return page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label, exact: true }).first();
}

export async function expectToast(page, text) {
  await expect(page.locator('#toast-root').getByText(text).first()).toBeVisible();
}

export async function noHorizontalOverflow(page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    { message: 'page should not scroll sideways' }).toBeLessThanOrEqual(0);
}

export async function clickRealm(page, subject) {
  await page.locator('g.world-realm', { has: page.locator(`text=${subject}`) }).locator('path').first().click({ force: true });
}

// Passing a test or finishing a challenge may pop a "Badge unlocked!" or
// "Level up!" card above everything for ~4 s. Dismiss it if it is there.
export async function dismissCelebration(page) {
  const popup = page.getByRole('button', { name: /^(Awesome!|Woohoo!)$/ });
  try { await popup.click({ timeout: 2500 }); } catch {}
  await expect(page.getByText(/^(Badge unlocked!|Level up!)$/)).toHaveCount(0, { timeout: 6000 });
}
