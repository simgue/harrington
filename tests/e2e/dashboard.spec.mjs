// The parent dashboard: hero, today's path, memory, subjects, level, recordings,
// recent growth and evidence, attribution.
import { test, expect, modal, closeModal, nav } from './fixtures.mjs';
import { LEARNERS, TOPICS } from './support/family.mjs';
import { TODAY_KEY } from './support/env.mjs';

const ROWAN = LEARNERS.rowan.id;

test('hero greeting and every dashboard section for a 6-year-old; no day-one refresher (F5 fixed by HAR-18; finding F15)', async ({ page, gotoApp, shot, errors }) => {
  await gotoApp({
    seed: {
      progress: { [TOPICS.oneToOne.id]: 'learning' },
      records: [
        { type: 'observation', title: 'Counted the stairs out loud', note: 'Got to 12 without help.', rating: 4, topicId: TOPICS.oneToOne.id },
        { type: 'question', title: 'Why is zero a number?', note: '' },
      ],
    },
  });
  await expect(page.getByText('Good morning')).toBeVisible();
  await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();
  await expect(page.getByText(/October 7 · age 6 · 0 of 1,?590 topics mastered/)).toBeVisible();
  // Finding F15: the hero prints the raw number where the map says "1,590".
  await expect(page.getByText('0 of 1590 topics mastered', { exact: false })).toBeVisible();
  for (const label of ['Record what happened', 'Note', 'Open map', "Rowan Example's view"]) {
    await expect(page.locator('header.meadow-hero').getByRole('button', { name: label })).toBeVisible();
  }

  // Today's path: two lanes with two options each, a calendar stop, a refresher, record.
  await expect(page.getByRole('heading', { name: "Today's path" })).toBeVisible();
  for (const lane of ['Literacy', 'Numeracy']) {
    const group = page.getByRole('group', { name: `${lane}: pick one` });
    await expect(group).toContainText('Rowan Example picks one');
    await expect(group.locator('button[aria-pressed]')).toHaveCount(2);
  }
  await expect(page.getByText('From the calendar')).toBeVisible();
  // HAR-18: nothing is mastered yet, so there is no refresher stop.
  await expect(page.getByRole('button', { name: /Refresher quiz · / })).toHaveCount(0);
  await expect(page.getByText('Unplanned learning counts too.')).toBeVisible();

  // Week, overall ring, stepping stones, memory, subjects, level, recordings.
  await expect(page.getByRole('heading', { name: "Rowan Example's week" })).toBeVisible();
  await expect(page.getByText('Active 0 of the last 7 days').first()).toBeVisible();
  await expect(page.getByText('overall mastery')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Stepping stones next' })).toBeVisible();
  await expect(page.locator('#next > button')).toHaveCount(4);
  await expect(page.getByRole('button', { name: /^Active recall/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Spaced practice/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Subjects' })).toBeVisible();
  for (const subject of ['Mathematics', 'English', 'Science', 'History', 'Personal & Social Development', 'Life Skills', 'Computing', 'Learning to Learn']) {
    await expect(page.getByRole('button', { name: new RegExp(`^.*${subject.replace('&', '&')}.*mastered`) }).first()).toBeVisible();
  }
  await expect(page.getByText('Level 1', { exact: true })).toBeVisible();
  await expect(page.getByText('0 / 100 XP')).toBeVisible();
  await expect(page.getByRole('button', { name: /Recordings folder/ })).toBeVisible();

  // Recent growth lists the learning topic; recent evidence the two records.
  const growth = page.locator('section', { has: page.getByRole('heading', { name: 'Recent growth' }) });
  await expect(growth.getByRole('button', { name: /One-to-one counting.*Bud.*Learning/ })).toBeVisible();
  const evidence = page.locator('section', { has: page.getByRole('heading', { name: 'Recent evidence' }) });
  await expect(evidence).toContainText('Counted the stairs out loud');
  await expect(evidence).toContainText('Why is zero a number?');

  await expect(page.getByText('Curriculum from the Marble Skill Taxonomy (v1) · © Generative Spark, Inc. · licensed under ODbL 1.0 & CC BY-SA 4.0')).toBeVisible();
  await shot('dashboard-six-year-old');
  expect(errors).toEqual([]);
});

test('literacy and numeracy pick-one: pick, unpick, persists across reload and shows in the child view', async ({ page, api, gotoApp, shot }) => {
  await gotoApp({ seed: {} });
  const literacy = page.getByRole('group', { name: 'Literacy: pick one' });
  const first = literacy.locator('button[aria-pressed]').first();
  const firstName = (await first.locator('span.block').first().innerText()).trim();

  await first.click();
  await expect(literacy.locator('button[aria-pressed]').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(literacy).toContainText('Rowan Example picked');
  await expect(literacy).toContainText("Rowan Example's pick");
  await shot('today-path-literacy-picked', { locator: page.locator('section[aria-labelledby="today-h"]') });

  // Unpick by tapping again.
  await literacy.locator('button[aria-pressed]').first().click();
  await expect(literacy.locator('button[aria-pressed="true"]')).toHaveCount(0);
  await expect(literacy).toContainText('Rowan Example picks one');

  // Pick again, and pick numeracy too.
  await literacy.locator('button[aria-pressed]').first().click();
  const numeracy = page.getByRole('group', { name: 'Numeracy: pick one' });
  await numeracy.locator('button[aria-pressed]').last().click();
  await expect(numeracy.locator('button[aria-pressed="true"]')).toHaveCount(1);
  const saved = await api.waitForState((s) => s.daily?.[ROWAN]?.[TODAY_KEY]?.picks?.literacy && s.daily[ROWAN][TODAY_KEY].picks.numeracy);
  const day = saved.daily[ROWAN][TODAY_KEY];
  expect(day.offers.literacy).toHaveLength(2);
  expect(day.offers.numeracy).toHaveLength(2);
  expect(day.offers.literacy).toContain(day.picks.literacy);

  await page.reload();
  await expect(page.getByRole('group', { name: 'Literacy: pick one' }).locator('button[aria-pressed="true"]')).toContainText(firstName);

  // The child view shows the same pick.
  await page.getByRole('button', { name: "Rowan Example's view" }).click();
  const story = page.getByRole('region', { name: 'Story time: pick one' });
  await expect(story).toContainText('great choice!');
  await expect(story.locator('button[aria-pressed="true"]')).toContainText(firstName);
});

test('today path stops open the calendar, topics, the recorder and the note form', async ({ page, gotoApp }) => {
  await gotoApp({ seed: {} });
  await page.getByRole('button', { name: 'Open calendar' }).click();
  await expect(page.getByRole('heading', { name: 'Daily Calendar' })).toBeVisible();
  await nav(page, 'Dashboard').click();

  // A calendar topic opens its topic page.
  const calStop = page.locator('div', { has: page.getByText('From the calendar', { exact: true }) }).last();
  const topicName = (await calStop.locator('button span.block').first().innerText()).trim();
  await calStop.locator('button').first().click();
  await expect(page.getByRole('heading', { level: 1, name: topicName })).toBeVisible();
  await nav(page, 'Dashboard').click();

  // The arrow on a pick-one card opens that topic.
  const opener = page.getByRole('group', { name: 'Numeracy: pick one' }).getByRole('button', { name: /^Open / }).first();
  const label = (await opener.getAttribute('aria-label')).replace(/^Open /, '');
  await opener.click();
  await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible();
  await nav(page, 'Dashboard').click();

  // Record what happened: Voice and Note.
  const recordStop = page.locator('div', { has: page.getByText('Unplanned learning counts too.') }).last();
  await recordStop.getByRole('button', { name: 'Voice' }).click();
  await expect(modal(page).getByRole('heading', { name: 'Record conversation' })).toBeVisible();
  await closeModal(page);
  await recordStop.getByRole('button', { name: 'Note' }).click();
  await expect(modal(page).getByRole('heading', { name: 'New record' })).toBeVisible();
  await closeModal(page);

  // Hero buttons.
  await page.getByRole('button', { name: 'Open map' }).click();
  await expect(page.getByRole('heading', { name: 'Curriculum realms' })).toBeVisible();
});

test('stepping stones, memory cards, subjects, recordings folder', async ({ page, gotoApp, shot }) => {
  await gotoApp({ seed: {} });
  const stone = page.locator('#next > button').first();
  const stoneName = (await stone.locator('span.block').first().innerText()).trim();
  await stone.click();
  await expect(page.getByRole('heading', { level: 1, name: stoneName })).toBeVisible();
  await nav(page, 'Dashboard').click();

  await page.getByRole('button', { name: /^Active recall/ }).click();
  await expect(modal(page).getByText('All caught up!')).toBeVisible();
  await closeModal(page);
  await page.getByRole('button', { name: /^Spaced practice/ }).click();
  await expect(modal(page)).toBeVisible();
  await shot('spaced-practice-empty', { full: false });
  await closeModal(page);

  await page.getByRole('button', { name: /Mathematics.*mastered/ }).first().click();
  await expect(page.getByText('Skill tree')).toBeVisible();
  await nav(page, 'Dashboard').click();

  await page.getByRole('button', { name: /Recordings folder/ }).click();
  await expect(modal(page).getByRole('heading', { name: 'Recordings' })).toBeVisible();
  await expect(modal(page)).toContainText('No recordings yet');
  await shot('recordings-folder-empty', { full: false });
  await closeModal(page);
});

test('a 3-year-old gets the youngest band\'s daily choices and stepping stones (F3, fixed)', async ({ page, gotoApp, shot }) => {
  await gotoApp({ seed: { active: 'wren' } });
  await expect(page.getByRole('heading', { name: "Wren Example's Wednesday" })).toBeVisible();
  await expect(page.getByText(/age 3/)).toBeVisible();
  await expect(page.getByRole('group', { name: 'Literacy: pick one' }).locator('button[aria-pressed]')).toHaveCount(2);
  await expect(page.getByRole('group', { name: 'Numeracy: pick one' }).locator('button[aria-pressed]')).toHaveCount(2);
  await expect(page.locator('#next > button')).toHaveCount(4);
  await expect(page.getByText('Everything available is mastered — explore the map to go further.')).toHaveCount(0);
  await shot('dashboard-three-year-old');
});

test('a 9-year-old sees older material and the same layout', async ({ page, gotoApp, shot }) => {
  await gotoApp({ seed: { active: 'sage' } });
  await expect(page.getByRole('heading', { name: "Sage Example's Wednesday" })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Literacy: pick one' }).locator('button[aria-pressed]')).toHaveCount(2);
  await expect(page.locator('#next > button')).toHaveCount(4);
  await shot('dashboard-nine-year-old', { full: false });
});

test('the preview banner says the AI provider is connected when /api/health says so (F4, fixed)', async ({ page, request, gotoApp }) => {
  await gotoApp({ seed: {} });
  expect((await (await request.get('/api/health')).json()).aiConfigured).toBe(true);
  await expect(page.getByText('Self-hosted preview · family data stays on this server · Local AI provider connected')).toBeVisible();
  await expect(page.getByText(/not connected yet/)).toHaveCount(0);
});

test('HAR-17: a pick offers Note and Voice; the coverage claim is off by default; only a claimed record shows "Evidence recorded"', async ({ page, api, gotoApp, shot }) => {
  await gotoApp({ seed: {} });
  const literacy = page.getByRole('group', { name: 'Literacy: pick one' });
  const first = literacy.locator('button[aria-pressed]').first();
  const pickName = (await first.locator('span.block').first().innerText()).trim();
  await first.click();
  await expect(literacy).toContainText('How did it go?');
  await expect(literacy.getByText('Evidence recorded')).toHaveCount(0);

  const writeNote = async (title, claim) => {
    await literacy.getByRole('button', { name: 'Note', exact: true }).click();
    const m = modal(page);
    const box = m.getByRole('checkbox', { name: new RegExp(`Mark curriculum coverage for ${pickName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
    // The claim is opt-in.
    await expect(box).not.toBeChecked();
    if (claim) await box.check();
    await m.locator('input[name="title"]').fill(title);
    await m.getByRole('button', { name: 'Save record' }).click();
    await expect(page.locator('#modal-root > div')).toHaveCount(0);
  };

  // A note without the claim is linked to the pick but is not evidence.
  await writeNote('Read together, no claim', false);
  let state = await api.waitForState((s) => s.records?.[ROWAN]?.length === 1);
  const plain = state.records[ROWAN][0];
  expect(plain.source).toMatchObject({ kind: 'daily-pick' });
  expect(plain.source.key).toMatch(new RegExp(`^${TODAY_KEY}\\|literacy\\|`));
  expect(plain.coverage).toBeUndefined();
  await expect(literacy).toContainText('How did it go?');
  await expect(literacy.getByText('Evidence recorded')).toHaveCount(0);

  // With the claim checked, the lane shows the badge.
  await writeNote('Read together, claimed', true);
  state = await api.waitForState((s) => s.records?.[ROWAN]?.length === 2);
  const claimed = state.records[ROWAN].find((r) => r.title === 'Read together, claimed');
  expect(claimed.coverage).toEqual([expect.objectContaining({ topicName: pickName })]);
  await expect(literacy.getByText('Evidence recorded')).toBeVisible();
  await shot('pick-evidence-recorded', { locator: literacy });
});

test('HAR-17: the interests card saves chips and a note per learner', async ({ page, api, gotoApp, shot }) => {
  await gotoApp({ seed: {} });
  const card = page.getByRole('region', { name: "Rowan Example's interests" });
  await expect(card).toContainText("What they're into lately. Tap to choose.");
  await card.getByRole('button', { name: 'Space', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Space', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('textbox', { name: 'Add an interest' }).fill('Bridges');
  await card.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Bridges', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('textbox', { name: 'Anything else?' }).fill('Asks how bridges stay up');
  const state = await api.waitForState((s) => s.interests?.[ROWAN]?.text === 'Asks how bridges stay up');
  expect(state.interests[ROWAN].chips).toEqual(['Space', 'Bridges']);
  await shot('interests-card', { locator: card });
});
