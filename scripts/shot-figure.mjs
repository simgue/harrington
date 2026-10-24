#!/usr/bin/env node
// Screenshots a built figure page over file:// with Playwright's Chromium, for
// the look-and-fix loop in docs/FIGURES.md. Prints script errors, unknown
// ?press= labels, NaN in the drawing and any request that left the page.
// Usage: node scripts/shot-figure.mjs <topicId> [--query "press=Push@300"] [--wait 2500]
//          [--out shot.png] [--width 800] [--height 640] [--scale 2]
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const id = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!id) {
  console.error('Usage: node scripts/shot-figure.mjs <topicId> [--query q] [--wait ms] [--out file] [--width w] [--height h] [--scale s]');
  process.exit(2);
}
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i === -1 ? fallback : args[i + 1]; };
const url = `${pathToFileURL(resolve(`src/figures/${id}.html`)).href}${opt('query') ? `?${opt('query')}` : ''}`;
const out = opt('out', `${id}.png`);

const browser = await chromium.launch(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {});
const page = await browser.newPage({
  viewport: { width: +opt('width', 800), height: +opt('height', 640) },
  deviceScaleFactor: +opt('scale', 2),
});
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
page.on('request', (r) => { if (!/^(file|data|about):/.test(r.url())) problems.push(`request: ${r.url()}`); });
await page.goto(url);
await page.waitForTimeout(+opt('wait', 1500));
await page.screenshot({ path: out });
const errors = await page.evaluate(() => document.documentElement.dataset.errors || '');
if (errors) problems.push(`data-errors: ${errors}`);
const nan = await page.evaluate(() => (document.getElementById('art')?.innerHTML.match(/NaN/g) || []).length);
if (nan) problems.push(`${nan} NaN in the drawing`);
await browser.close();
console.log(`wrote ${out}`);
for (const p of problems) console.log(p);
if (problems.length) process.exit(1);
