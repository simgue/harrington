// Retired topics (HAR-55): the 2026-10-24 taxonomy dropped mt_3XJkeIn6J6
// ("Estimating answers (age 7+)"). A family that worked on it keeps every
// entry; the app leaves it out of counts and choices, Records lists it as an
// archived topic, and its old topic link explains what happened.
import { test, expect, nav, setTopicStatus } from './fixtures.mjs';
import { LEARNERS, TOPICS } from './support/family.mjs';
import { FIXED_NOW, TODAY_KEY } from './support/env.mjs';

const ROWAN = LEARNERS.rowan.id;
const RETIRED = 'mt_3XJkeIn6J6';
const NAME = 'Estimating answers (age 7+)';
const now = FIXED_NOW.getTime();

const seed = {
  progress: { [RETIRED]: 'mastered', [TOPICS.oneToOne.id]: 'mastered' },
  records: [{ type: 'observation', title: 'Guessed the jar of beans', topicId: RETIRED, topicName: NAME }],
  extra: {
    tests: { [ROWAN]: [{ id: 't_retired', createdAt: now - 86_400_000, scope: 'topic', subject: 'Mathematics', topicId: RETIRED, mode: 'digital', score: 9, total: 10, pct: 90, passed: true }] },
    recall: { [ROWAN]: { [`${RETIRED}::0`]: { topicId: RETIRED, box: 1, due: 0, reps: 2, lapses: 0, last: now - 86_400_000 } } },
    practice: { [ROWAN]: { p_retired: { topicId: RETIRED, subject: 'Mathematics', q: 'About how many?', type: 'short', answer: '20', box: 0, due: 0, reps: 0, lapses: 0, last: 0 } } },
    plan: { [ROWAN]: { moves: { [RETIRED]: TODAY_KEY }, done: {}, extras: { [TODAY_KEY]: [{ id: 'x_retired', kind: 'practice', topicId: RETIRED, topicName: NAME, subject: 'Mathematics', title: `Extra practice · ${NAME}` }] } } },
    requests: { [ROWAN]: [{ id: 'rq_retired', text: 'estimating', createdAt: now - 1000, topicId: RETIRED }] },
    levelset: { [ROWAN]: { observe: [RETIRED], lanes: {} } },
  },
};

test('a retired topic is kept, left out of counts, archived in Records and explained on its old page', async ({ page, api, gotoApp, shot, errors }) => {
  await gotoApp({ seed });
  // Counted: only the current topic.
  await expect(page.getByText('October 7 · age 6 · 1 of 1,845 topics mastered')).toBeVisible();
  // Nothing due from the retired topic's recall card or practice question: the
  // dashboard writes "Active recall · 1 due" / "Spaced practice · 1 due" when
  // something is, so the bare titles only show with nothing due.
  await expect(page.getByText('Active recall', { exact: true })).toBeVisible();
  await expect(page.getByText('Spaced practice', { exact: true })).toBeVisible();
  await expect(page.getByText(/^(Active recall|Spaced practice) · \d+ due$/)).toHaveCount(0);

  await nav(page, 'Records').click();
  const archived = page.getByRole('region', { name: 'Archived topics' });
  await expect(archived).toBeVisible();
  // Only learner data makes an archived row: the saved lessons other specs
  // leave on this server for made-up ids are not listed.
  const row = archived.locator('li.archived-topic');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(`${NAME} · archived topic`);
  await expect(row).toContainText('mastered · 1 record · 1 test result · 1 recall card · 1 practice question · 2 calendar entries · 1 topic request · 1 workbook answer');
  // The record itself still shows, with its topic marked archived.
  const card = page.locator('div.rounded-2xl', { has: page.getByText('Guessed the jar of beans', { exact: true }) });
  await expect(card).toContainText(`${NAME} · archived topic`);
  await shot('records-archived-topic', { locator: row });

  await page.goto(`/#topic/${RETIRED}`);
  await expect(page.getByRole('heading', { level: 1, name: NAME })).toBeVisible();
  await expect(page.getByText('This topic is no longer in the curriculum.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Open Records' }).click();
  await expect(page.getByRole('heading', { name: 'Records' })).toBeVisible();

  // The calendar opens without the retired extra and without dropping it.
  await nav(page, 'Calendar').click();
  await expect(page.getByRole('heading', { name: 'Daily Calendar' })).toBeVisible();
  await expect(page.getByText(`Extra practice · ${NAME}`)).toHaveCount(0);

  // A change elsewhere saves the whole document: every retired entry is still there.
  await page.goto(`/#topic/${TOPICS.howMany.id}`);
  await setTopicStatus(page, 'Learning');
  const state = await api.waitForState((s) => s.progress?.[ROWAN]?.[TOPICS.howMany.id]?.status === 'learning');
  expect(state.progress[ROWAN][RETIRED].status).toBe('mastered');
  expect(state.records[ROWAN].some((r) => r.topicId === RETIRED)).toBe(true);
  expect(state.plan[ROWAN].extras[TODAY_KEY].map((x) => x.id)).toEqual(['x_retired']);
  expect(state.plan[ROWAN].moves[RETIRED]).toBe(TODAY_KEY);
  expect(Object.keys(state.recall[ROWAN])).toEqual([`${RETIRED}::0`]);
  expect(state.levelset[ROWAN].observe).toEqual([RETIRED]);
  expect(errors).toEqual([]);
});

test('an id nobody recorded is still "Topic not found"', async ({ page, gotoApp }) => {
  await gotoApp({ seed: {}, hash: `topic/${RETIRED}` });
  await expect(page.getByText('Topic not found. It may have been removed from the curriculum in an update.')).toBeVisible();
});

test('"Open Records" on a retired topic opens the learner whose data holds it', async ({ page, gotoApp }) => {
  // Sage is active; only Rowan worked on the retired topic.
  await gotoApp({
    seed: { active: 'sage', extra: { progress: { [ROWAN]: { [RETIRED]: { status: 'mastered', updatedAt: now - 60_000 } } } } },
    hash: `topic/${RETIRED}`,
  });
  await expect(page.getByText('This topic is no longer in the curriculum.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Open Records' }).click();
  await expect(page.getByText('Observations, questions and discussions for Rowan Example.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Archived topics' }).locator('li.archived-topic')).toContainText(`${RETIRED} · archived topic`);
});
