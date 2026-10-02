#!/usr/bin/env node
// Post-step: copy the videos Playwright left under test-results/ into
// docs/e2e/recordings/ (git-ignored) with stable names, using the JSON report
// to know which test each video belongs to.
//
//   <project>--<spec>--<test title>.webm
//
// A test can choose its own name with an annotation:
//   test.info().annotations.push({ type: 'recording', description: 'walkthrough-parent' })
import { copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const reportPath = join(root, 'test-results', 'results.json');
const outDir = join(root, 'docs', 'e2e', 'recordings');

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

function* walkSuites(suites, file = '') {
  for (const suite of suites || []) {
    const f = suite.file || file;
    for (const spec of suite.specs || []) yield { spec, file: f };
    yield* walkSuites(suite.suites, f);
  }
}

export async function collectRecordings({ clean = false } = {}) {
  let report;
  try { report = JSON.parse(await readFile(reportPath, 'utf8')); } catch {
    console.log('collect-recordings: no test-results/results.json, nothing to copy');
    return [];
  }
  if (clean) await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const copied = [];
  for (const { spec, file } of walkSuites(report.suites)) {
    for (const t of spec.tests || []) {
      const named = (t.annotations || []).find((a) => a.type === 'recording')?.description;
      const results = t.results || [];
      const last = results[results.length - 1];
      const videos = (last?.attachments || []).filter((a) => a.contentType === 'video/webm' && a.path);
      for (const [i, video] of videos.entries()) {
        try { await stat(video.path); } catch { continue; }
        const base = named
          ? slug(named)
          : `${slug(t.projectName)}--${slug(basename(file).replace(/\.spec\.mjs$/, ''))}--${slug(spec.title)}`;
        const name = `${base}${videos.length > 1 ? `-${i + 1}` : ''}.webm`;
        await copyFile(video.path, join(outDir, name));
        copied.push(name);
      }
    }
  }
  return copied;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const copied = await collectRecordings({ clean: process.argv.includes('--clean') });
  let total = 0;
  for (const name of copied) total += (await stat(join(outDir, name))).size;
  console.log(`collect-recordings: ${copied.length} video(s), ${(total / 1048576).toFixed(1)} MB -> docs/e2e/recordings/`);
  for (const name of copied) console.log(`  ${name}`);
}
