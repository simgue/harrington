// Topic finder (#find): a request becomes matching topics, the path of unmet
// prerequisites to the chosen one, the next ready step, and a request log.
import { test, expect, modal, closeModal, expectToast } from './fixtures.mjs';
import { LEARNERS, TOPICS } from './support/family.mjs';
import { TODAY_KEY } from './support/env.mjs';

// Telling Time: Hours and Half Hours, ages 5–6. With One-to-one counting
// mastered and Comparing durations started, six steps remain.
const TIME = { id: 'mt_0XxyaQLRhn', name: 'Telling Time: Hours and Half Hours' };
const DURATIONS = { id: 'mt_TcG90kS8nu', name: 'Comparing durations' };
const SEED = { progress: { [TOPICS.oneToOne.id]: 'mastered', [DURATIONS.id]: 'learning' } };
const rowan = LEARNERS.rowan.id;

const results = (page) => page.getByRole('region', { name: /^Closest topics for/ });
const path = (page) => page.getByRole('region', { name: TIME.name });
const nextStep = (page) => page.getByLabel('Next ready step');

test('from the dashboard: a request finds topics, the path and the next step, and is logged', async ({ page, api, gotoApp, shot, errors }) => {
  await gotoApp({ seed: SEED });
  await page.getByRole('button', { name: 'Find a topic' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Find a topic' })).toBeVisible();
  await expect(page).toHaveURL(/#find$/);
  await expect(page.getByText('No requests yet.')).toBeVisible();
  await shot('empty');

  await page.getByLabel('What does Rowan Example want to learn?').fill('I want to learn how to tell the time');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(page).toHaveURL(/#find\?q=I%20want%20to%20learn%20how%20to%20tell%20the%20time&r=rq_/);
  const list = results(page);
  await expect(list.getByRole('button')).toHaveCount(8);
  await expect(list.getByRole('button').first()).toContainText('Telling time');
  await expect(list.getByRole('button', { name: new RegExp(TIME.name) })).toContainText('Ages 5–6');
  await expect(list.getByRole('button', { name: new RegExp(TIME.name) })).toContainText('Fits age 6');
  await shot('results');

  // The request is logged without a topic yet.
  await api.waitForState((s) => s.requests?.[rowan]?.[0]?.text === 'I want to learn how to tell the time' && s.requests[rowan][0].topicId === null);

  await list.getByRole('button', { name: new RegExp(TIME.name) }).click();
  await expect(list.getByRole('button', { name: new RegExp(TIME.name) })).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(new RegExp(`topic=${TIME.id}`));
  const p = path(page);
  await expect(p).toContainText('6 steps to go for Rowan Example, counting the topic itself.');
  await expect(p).toContainText('Builds on One-to-one counting (mastered).');
  const steps = p.locator('li.find-step');
  await expect(steps).toHaveCount(6);
  await expect(steps.first()).toContainText(DURATIONS.name);
  await expect(steps.first()).toContainText('In progress');
  await expect(steps.last()).toContainText(TIME.name);
  await expect(steps.last()).toContainText('Locked');
  await expect(steps.last()).toContainText(/Needs .+ first/);
  await expect(p.locator('li.find-step[data-step-state="ready"]')).toHaveCount(2);
  await expect(nextStep(page)).toContainText(DURATIONS.name);
  await shot('path');

  // The chosen topic is recorded on the same log entry, and the log shows it.
  await api.waitForState((s) => s.requests?.[rowan]?.length === 1 && s.requests[rowan][0].topicId === TIME.id);
  await expect(page.getByRole('region', { name: 'Request log' })).toContainText(`Chose ${TIME.name}`);

  // Reload keeps the request and the choice (they ride in the address).
  await page.reload();
  await expect(path(page).locator('li.find-step')).toHaveCount(6);
  await expect(page.getByLabel('What does Rowan Example want to learn?')).toHaveValue('I want to learn how to tell the time');
  expect(errors).toEqual([]);
});

test('next step actions: add to today, plan it, open the topic, find it on the skill tree', async ({ page, api, gotoApp, shot }) => {
  await gotoApp({ seed: SEED, hash: `find?q=telling%20time&topic=${TIME.id}` });
  const next = nextStep(page);
  await expect(next).toContainText(DURATIONS.name);

  await next.getByRole('button', { name: 'Add to today' }).click();
  await expectToast(page, /^(Moved to today in the calendar|Added to today as an extra lesson)$/);
  await api.waitForState((s) => {
    const plan = s.plan?.[rowan] || {};
    return plan.moves?.[DURATIONS.id] === TODAY_KEY || (plan.extras?.[TODAY_KEY] || []).some((x) => x.topicId === DURATIONS.id);
  });

  await next.getByRole('button', { name: 'Plan it' }).click();
  await expect(modal(page).getByRole('heading', { name: `Plan “${DURATIONS.name}”` })).toBeVisible();
  await shot('plan-it', { full: false });
  await closeModal(page);

  await next.getByRole('button', { name: 'Find on skill tree' }).click();
  await expect(page).toHaveURL(new RegExp(`#graph/Mathematics/Measurement/\\d+\\?skill=${DURATIONS.id}$`));
  const questLog = page.getByRole('complementary', { name: 'Quest log' });
  await expect(questLog.getByRole('heading', { name: DURATIONS.name })).toBeVisible();
  await expect(page.locator(`button.skill-node[data-skill-id="${DURATIONS.id}"]`)).toHaveClass(/is-selected/);

  // The skill tree links back to the finder.
  await page.getByRole('button', { name: 'Find a topic' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Find a topic' })).toBeVisible();

  await page.goBack();
  await page.goBack();
  await expect(nextStep(page)).toBeVisible();
  await nextStep(page).getByRole('button', { name: 'Open topic page' }).click();
  await expect(page.getByRole('heading', { level: 1, name: DURATIONS.name })).toBeVisible();
});

test('no close match, an empty request, and a mastered topic', async ({ page, gotoApp, shot }) => {
  await gotoApp({ seed: { progress: { [TOPICS.oneToOne.id]: 'mastered' } }, hash: 'find' });
  const input = page.getByLabel('What does Rowan Example want to learn?');
  await input.fill('xylophone lessons');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(page.getByText('No close match')).toBeVisible();
  await expect(page.getByText(/Try other words/)).toBeVisible();
  await shot('no-match');

  // A request made only of phrasing words has nothing to search for.
  await input.fill('I want to learn');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(page.getByText(/Type a word or two about the topic itself/)).toBeVisible();

  await page.goto(`/#find?q=counting&topic=${TOPICS.oneToOne.id}`);
  await expect(page.getByRole('region', { name: TOPICS.oneToOne.name })).toContainText('Rowan Example has already mastered this topic.');
  await expect(nextStep(page)).toHaveCount(0);

  // The log lists every request, newest first; a click re-runs one.
  const log = page.getByRole('region', { name: 'Request log' });
  await expect(log.getByRole('button')).toHaveCount(2);
  await expect(log.getByRole('button').first()).toContainText('I want to learn');
  await log.getByRole('button', { name: /xylophone lessons/ }).click();
  await expect(page.getByText('No close match')).toBeVisible();
});

test('the request log is per learner', async ({ page, api, gotoApp }) => {
  const sage = LEARNERS.sage.id;
  await gotoApp({
    seed: { extra: { requests: { [sage]: [{ id: 'rq_sage', text: 'volcanoes', createdAt: Date.UTC(2026, 9, 6), topicId: null }] } } },
    hash: 'find',
  });
  await expect(page.getByText('No requests yet.')).toBeVisible();
  await api.putState({ ...(await api.getState()).state, activeStudentId: sage });
  await page.reload();
  const log = page.getByRole('region', { name: 'Request log' });
  await expect(log).toContainText('“volcanoes”');
  await expect(log).toContainText('No topic chosen');
});
