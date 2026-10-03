// Route smoke: every route app.js registers, opened directly with a seeded
// family, renders a non-empty page with no console error and no uncaught
// exception. A view that throws while rendering leaves the page blank with
// only a console error to show for it (the calendar on main before PR #29),
// which no flow-level spec notices when it starts on another route.
//
// Runs in two projects: `desktop` (AI pointed at the mock) and `no-ai` (no
// provider, where the views take their gated branches).
import { test, expect } from './fixtures.mjs';
import { TOPICS } from './support/family.mjs';

const COUNTING = encodeURIComponent('Counting & Cardinality');

// [name, hash, heading the route shows, extra seed, text when there is no
// heading]. The route table is `views` in src/js/app.js (dashboard, calendar, graph, topic, records,
// insights, onboard); graph and topic take parameters, so their variants
// are listed too, and an unknown route falls back to the dashboard.
const ROUTES = [
  ['dashboard', '', "Rowan Example's Wednesday"],
  ['unknown route', 'no-such-route', "Rowan Example's Wednesday"],
  ['calendar', 'calendar', 'Daily Calendar'],
  ['graph: world map', 'graph', 'Curriculum realms'],
  // A realm opens the skill tree of the domain that suits the learner's age.
  ['graph: realm', 'graph/Mathematics', null],
  ['graph: skill tree', `graph/Mathematics/${COUNTING}`, 'Counting & Cardinality'],
  ['graph: skill tree with quest log', `graph/Mathematics/${COUNTING}?skill=${TOPICS.oneToOne.id}`, 'Counting & Cardinality'],
  ['graph: list view', `graph/Mathematics/${COUNTING}/5`, 'Counting & Cardinality', { extra: { graphView: 'list' } }],
  ['topic', `topic/${TOPICS.oneToOne.id}`, TOPICS.oneToOne.name],
  ['topic: unknown id', 'topic/mt_no_such_topic', null, {}, 'Topic not found'],
  ['records', 'records', 'Records'],
  ['insights', 'insights', 'Teacher Insights'],
];

// The view's own content: the shell has no <main>, so it is the element after
// the "Self-hosted preview" banner (finding F20).
const viewContent = (page) => page.getByText('Self-hosted preview', { exact: false }).locator('xpath=following-sibling::*[1]');

async function expectRendered(page, region, heading, text) {
  await expect(region).toBeVisible();
  if (heading) await expect(region.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
  else if (text) await expect(region).toContainText(text);
  else await expect(region.getByRole('heading', { level: 1 }).first()).toBeVisible();
  // Let deferred work (cache checks, icon swaps, timers) run before the error
  // check. Not `networkidle`: without a provider the lesson-cache checks leave
  // their 404 bodies unread, so the network never looks idle (finding F21).
  await page.waitForTimeout(750);
  expect((await region.innerText()).trim().length, 'the view rendered no text').toBeGreaterThan(0);
  expect((await region.boundingBox())?.height ?? 0, 'the view has no height').toBeGreaterThan(40);
}

// Console errors, except a lesson-cache miss: without a provider every gated
// control asks /api/lessons/<key>, a miss is a 404 by design, and Chromium
// logs it (finding F21). Uncaught exceptions always count.
function pageErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const cacheMiss = /status of 404/.test(msg.text()) && new URL(msg.location().url || 'about:blank', 'http://x').pathname.startsWith('/api/lessons/');
    if (!cacheMiss) errors.push(`console: ${msg.text()} (${msg.location().url})`);
  });
  return errors;
}

for (const [name, hash, heading, seed = {}, text = null] of ROUTES) {
  test(`route renders without errors: ${name}`, async ({ page, gotoApp }) => {
    const errors = pageErrors(page);
    await gotoApp({
      seed: {
        progress: { [TOPICS.oneToOne.id]: 'mastered', [TOPICS.howMany.id]: 'learning' },
        records: [
          { type: 'observation', title: 'Counted the stairs out loud', note: 'Got to 12.', rating: 4, topicId: TOPICS.oneToOne.id },
          { type: 'discussion', title: 'Talked about sharing', note: 'Split grapes.' },
        ],
        ...seed,
      },
      hash,
    });
    await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeAttached();
    await expectRendered(page, viewContent(page), heading, text);
    expect(errors).toEqual([]);
  });
}

test('route renders without errors: onboard (no learners yet)', async ({ page, gotoApp }) => {
  const errors = pageErrors(page);
  await gotoApp({ seed: null, hash: 'onboard' });
  await expectRendered(page, page.locator('#app'), 'Add your first student');
  expect(errors).toEqual([]);
});
