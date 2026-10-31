// Mastery by observation (HAR-24): on the server with no AI provider, the
// parent ticks a topic's evidence items, a full pass masters the topic and,
// as the last open topic, its section. Records and Insights label it
// "observed".
import { test, expect, modal, nav, expectToast } from './fixtures.mjs';
import { COUNTING_SECTION_OTHERS, LEARNERS, TOPICS } from './support/family.mjs';
import { FIXED_NOW } from './support/env.mjs';

// Console and page errors, except the lesson-cache 404s: without a provider
// the topic page asks /api/lessons/<key> whether anything was saved, and a
// 404 is the answer "nothing yet". Anything else still fails the test.
function pageErrors(page) {
  const out = [];
  page.on('pageerror', (error) => out.push(`pageerror: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const url = msg.location().url || '';
    if (/status of 404/.test(msg.text()) && /^\/api\/lessons\//.test(new URL(url, 'http://localhost').pathname)) return;
    out.push(`console: ${msg.text()} @ ${url}`);
  });
  return out;
}

const ROWAN = LEARNERS.rowan.id;
const ONE = TOPICS.oneToOne;
const SECTION_ID = 'Mathematics|Counting & Cardinality|5';
const section = (page, title) => page.locator('div.rounded-2xl', { has: page.getByRole('heading', { level: 2, name: title, exact: true }) });

test('a partial check is kept; a full check masters the topic and passes its section', async ({ page, api, gotoApp, shot }) => {
  const errors = pageErrors(page);
  // The other ten passed their topic quizzes, so their results count toward the section.
  const progress = Object.fromEntries(COUNTING_SECTION_OTHERS.map((id) => [id, 'mastered']));
  const passed = COUNTING_SECTION_OTHERS.map((topicId, i) => ({
    id: `t_e2e_${i}`, createdAt: FIXED_NOW.getTime() - 86_400_000, scope: 'topic', subject: 'Mathematics', topicId,
    mode: 'digital', score: 9, total: 10, pct: 90, passed: true,
  }));
  await gotoApp({ seed: { progress, extra: { tests: { [ROWAN]: passed } } }, hash: `topic/${ONE.id}` });
  await expect(page.getByRole('heading', { level: 1, name: ONE.name })).toBeVisible();
  // No AI here: the quiz button is a chip, the observation button is not.
  await expect(page.getByRole('button', { name: 'Take topic mastery test' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Check mastery by observation' }).click();
  let m = modal(page);
  await expect(m.getByRole('heading', { name: 'Check mastery by observation' })).toBeVisible();
  await expect(m).toContainText('Suggested question');
  await expect(m).toContainText('If Rowan Example is counting a pile of grapes');
  const boxes = m.getByRole('checkbox');
  await expect(boxes).toHaveCount(3);
  await boxes.nth(0).check();
  await boxes.nth(2).check();
  await expect(m).toContainText('2 of 3 seen.');
  await m.getByLabel('Note (optional)').fill('Skipped one grape at the end.');
  await shot('observation-checklist', { full: false });
  await m.getByRole('button', { name: 'Save observation' }).click();
  await expectToast(page, 'Observation saved: 2 of 3 seen');
  let state = await api.waitForState((s) => (s.tests?.[ROWAN] || []).length === 11);
  expect(state.tests[ROWAN][0]).toMatchObject({ scope: 'topic', mode: 'observed', topicId: ONE.id, score: 2, total: 3, pct: 67, passed: false });
  expect(state.progress[ROWAN][ONE.id]).toBeUndefined();
  await expect(section(page, 'Topic mastery test')).toContainText('Last attempt: 2 of 3 seen by observation.');

  await page.getByRole('button', { name: 'Check mastery by observation' }).click();
  m = modal(page);
  for (const box of await m.getByRole('checkbox').all()) await box.check();
  await expect(m).toContainText('All 3 seen');
  await m.getByRole('button', { name: 'Save and mark mastered' }).click();
  await expectToast(page, `${ONE.name} mastered. That completes its section by observation.`);
  state = await api.waitForState((s) => s.progress?.[ROWAN]?.[ONE.id]?.status === 'mastered');
  const sectionResult = state.tests[ROWAN].find((t) => t.scope === 'section');
  expect(sectionResult).toMatchObject({ mode: 'observed', sectionId: SECTION_ID, score: 11, total: 11, passed: true });
  expect(state.progress[ROWAN][ONE.id].source).toBeUndefined();
  await expect(section(page, 'Topic mastery test')).toContainText('Seen by observation (3 of 3).');
  await expect(section(page, 'Section check')).toContainText('Section passed by observation');

  // Records: both checks, labelled "observed", with what was seen.
  await nav(page, 'Records').click();
  const cards = page.locator('div.rounded-2xl', { hasText: `Observed: ${ONE.name}` });
  await expect(cards).toHaveCount(2);
  await expect(cards.first().locator('.observed-chip')).toHaveText('observed');
  await expect(cards.first()).toContainText('Every item seen: marked mastered');
  await expect(cards.first()).toContainText('Completed the section Counting & Cardinality · Age 5 by observation.');
  await expect(cards.nth(1)).toContainText('2 of 3 seen: not marked mastered yet');
  await expect(cards.nth(1)).toContainText('Skipped one grape at the end.');
  await shot('records-observed');

  // Insights: the subject's observation checks, each labelled.
  await nav(page, 'Insights').click();
  const obs = section(page, 'Observation checks');
  await expect(obs).toContainText('1 topic mastered this way in Mathematics.');
  await expect(obs).toContainText('Section: Counting & Cardinality · Age 5');
  await expect(obs).toContainText('3 of 3 seen · observed');
  expect(errors).toEqual([]);
});

test('placed siblings do not count: an observed pass masters the topic but not its section', async ({ page, api, gotoApp }) => {
  const errors = pageErrors(page);
  // The other ten are mastered with no topic result, as placement leaves them.
  const progress = Object.fromEntries(COUNTING_SECTION_OTHERS.map((id) => [id, 'mastered']));
  await gotoApp({ seed: { progress }, hash: `topic/${ONE.id}` });
  await page.getByRole('button', { name: 'Check mastery by observation' }).click();
  const m = modal(page);
  for (const box of await m.getByRole('checkbox').all()) await box.check();
  await m.getByRole('button', { name: 'Save and mark mastered' }).click();
  await expectToast(page, `${ONE.name} marked mastered by observation`);
  const state = await api.waitForState((s) => s.progress?.[ROWAN]?.[ONE.id]?.status === 'mastered');
  expect(state.tests[ROWAN].map((t) => t.scope)).toEqual(['topic']);
  await expect(section(page, 'Section check')).not.toContainText('Section passed by observation');
  expect(errors).toEqual([]);
});
