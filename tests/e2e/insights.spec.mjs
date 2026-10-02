// Teacher Insights: subject chips, stats, recommended next, final test, review,
// and adaptive suggestions.
import { readFileSync } from 'node:fs';
import { test, expect, modal, nav, expectToast, dismissCelebration } from './fixtures.mjs';
import { CACHE_DIR } from './support/taxonomy.mjs';
import { LEARNERS, TOPICS } from './support/family.mjs';
import { MARKERS, MASTERY_QUESTIONS } from './mock-ai-server.mjs';

const ROWAN = LEARNERS.rowan.id;

// Every Mathematics section id, as mastery.js builds them (subject|domain|age 5–13).
function mathSectionIds() {
  const { topics } = JSON.parse(readFileSync(`${CACHE_DIR}/topics.json`, 'utf8'));
  const ids = new Set();
  for (const t of topics) {
    if (t.subject !== 'Mathematics') continue;
    ids.add(`Mathematics|${t.domain}|${Math.min(13, Math.max(5, t.ageRangeStart || 5))}`);
  }
  return [...ids];
}

test('subject chips, stats, recommended next and a locked final test', async ({ page, gotoApp, shot, errors }) => {
  await gotoApp({
    seed: {
      progress: {
        [TOPICS.oneToOne.id]: 'mastered',
        [TOPICS.howMany.id]: 'practicing',
        [TOPICS.rote100.id]: 'learning',
      },
    },
  });
  await nav(page, 'Insights').click();
  await expect(page.getByRole('heading', { name: 'Teacher Insights' })).toBeVisible();
  for (const subject of ['Mathematics', 'English', 'Science', 'History', 'Personal & Social Development', 'Life Skills', 'Computing', 'Learning to Learn']) {
    await expect(page.getByRole('button', { name: subject, exact: true })).toBeVisible();
  }
  const summary = page.locator('div.rounded-2xl', { has: page.getByRole('heading', { name: 'Mathematics', exact: true }) });
  await expect(summary).toContainText('0% mastered');
  const box = (label) => summary.locator('div.rounded-xl', { hasText: label });
  await expect(box('Mastered')).toContainText('1');
  await expect(box('Practicing')).toContainText('1');
  await expect(box('Learning')).toContainText('1');
  await expect(box('Not started')).toContainText('500');

  const finalTest = page.locator('div.rounded-2xl', { has: page.getByRole('heading', { name: 'Final Mathematics mastery test' }) });
  await expect(finalTest.getByRole('button', { name: 'Locked' })).toBeDisabled();
  await expect(finalTest).toContainText('Unlocks once every section has been passed.');

  const recommended = page.locator('div.rounded-2xl', { has: page.getByRole('heading', { name: 'Recommended next in Mathematics' }) });
  expect(await recommended.getByRole('button').count()).toBeGreaterThan(0);
  await shot('insights-mathematics');

  // Switch subject.
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'English', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recommended next in English' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Final English mastery test' })).toBeVisible();

  // A recommendation opens its topic page.
  const rec = page.locator('div.rounded-2xl', { has: page.getByRole('heading', { name: 'Recommended next in English' }) }).getByRole('button').first();
  const name = (await rec.locator('span.block').first().innerText()).trim();
  await rec.click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('with the mock AI provider', () => {
  test('progress review: no learner name reaches the provider, and notes only when the parent opts in (F2, fixed by HAR-19)', async ({ page, gotoApp, mockAi, shot }) => {
    // The note names two learners; both must be replaced before anything leaves.
    await gotoApp({ seed: { progress: { [TOPICS.oneToOne.id]: 'learning' }, records: [{ type: 'observation', title: 'Counted to 12', note: 'Rowan Example skipped 8; Sage Example helped.', topicId: TOPICS.oneToOne.id }] } });
    await nav(page, 'Insights').click();
    await mockAi.clear();
    const review = page.locator('div.rounded-2xl', { has: page.getByRole('heading', { name: 'Progress review' }) });
    await expect(review).toContainText('Names of learners in this app are replaced with “the child” before this is sent.');
    const include = review.getByRole('checkbox', { name: 'Include my notes in this request' });
    await expect(include).not.toBeChecked();

    // Without the opt-in the note stays home.
    await review.getByRole('button', { name: 'Generate' }).click();
    await expect(review).toContainText(MARKERS.review);
    await expect(review).toContainText('What to do next');
    await shot('insights-progress-review', { locator: review });
    let [entry] = await mockAi.log();
    expect(entry.kind).toBe('review');
    expect(entry.prompt).not.toContain('skipped 8');

    // With it, the note goes out with the names replaced.
    await mockAi.clear();
    await include.check();
    await review.getByRole('button', { name: 'Generate' }).click();
    await expect(review).toContainText(MARKERS.review);
    [entry] = await mockAi.log();
    expect(entry.prompt).toContain('the child skipped 8; the child helped.');
    for (const { prompt } of await mockAi.log()) {
      for (const { name } of Object.values(LEARNERS)) expect(prompt).not.toContain(name.split(' ')[0]);
    }
  });

  test('final test unlocks when every section is passed; passing offers bulk mastery and a certificate', async ({ page, gotoApp, shot }) => {
    const tests = mathSectionIds().map((sectionId, i) => ({
      id: `t_sec_${i}`, scope: 'section', subject: 'Mathematics', sectionId, pct: 100, passed: true, createdAt: 1_700_000_000_000 + i,
    }));
    await gotoApp({ seed: { extra: { tests: { [ROWAN]: tests } } } });
    await nav(page, 'Insights').click();
    const finalTest = page.locator('div.rounded-2xl', { has: page.getByRole('heading', { name: 'Final Mathematics mastery test' }) });
    await expect(finalTest).toContainText('The capstone across the whole subject.');
    await finalTest.getByRole('button', { name: 'Start test' }).click();
    const m = modal(page);
    await expect(m.getByText('Final mastery test · Mathematics')).toBeVisible();
    await m.getByRole('button', { name: 'Create the test' }).click();
    for (const q of MASTERY_QUESTIONS) {
      await m.locator('div.rounded-xl', { hasText: q.q }).getByRole('button', { name: q.answerText, exact: true }).click();
    }
    await m.getByRole('button', { name: 'Submit & grade' }).click();
    await expect(m.getByText('Mathematics mastered!')).toBeVisible();
    await dismissCelebration(page);
    await expect(m.getByRole('button', { name: 'Mark all Mathematics topics as mastered' })).toBeVisible();
    await expect(m.getByRole('button', { name: 'Print certificate' })).toBeVisible();
    await shot('final-test-passed', { full: false });
    await m.getByRole('button', { name: 'Mark all Mathematics topics as mastered' }).click();
    await expectToast(page, 'All Mathematics topics marked mastered');
    await page.keyboard.press('Escape');
    await expect(page.locator('div.rounded-2xl', { has: page.getByRole('heading', { name: 'Mathematics', exact: true }) })).toContainText('100% mastered');
    await expect(finalTest.getByRole('button', { name: 'Retake test' })).toBeVisible();
  });
});

test('adaptive suggestions: dashboard banner, approve, undo', async ({ page, api, gotoApp, shot }) => {
  await gotoApp({
    seed: {
      extra: {
        suggestions: {
          [ROWAN]: [{ id: 'g_e2e', kind: 'raise-difficulty', subject: 'Mathematics', domain: 'Counting & Cardinality', reason: 'Aced two Counting challenges in a row.', status: 'pending', createdAt: 1 }],
        },
      },
    },
  });
  await expect(page.getByText('1 adaptive suggestion for Rowan Example')).toBeVisible();
  await page.getByText('1 adaptive suggestion for Rowan Example').click();
  await expect(page.getByRole('heading', { name: 'Teacher Insights' })).toBeVisible();
  const card = page.locator('div.rounded-2xl', { has: page.getByRole('heading', { name: 'Adaptive suggestions' }) });
  await expect(card).toContainText('Make Counting & Cardinality harder');
  await expect(card).toContainText('Aced two Counting challenges in a row.');
  await shot('adaptive-suggestion', { locator: card });
  await card.getByRole('button', { name: 'Approve' }).click();
  await expectToast(page, 'Counting & Cardinality will now be pitched harder');
  await expect(card).toContainText('Currently harder');
  const state = await api.waitForState((s) => s.adaptations?.[ROWAN]?.['Mathematics|Counting & Cardinality']?.level === 'advanced');
  expect(state.suggestions[ROWAN][0].status).not.toBe('pending');
  await card.locator('button.undo').click();
  await expectToast(page, 'Counting & Cardinality back to standard');
  await api.waitForState((s) => !s.adaptations?.[ROWAN]?.['Mathematics|Counting & Cardinality']);
});
