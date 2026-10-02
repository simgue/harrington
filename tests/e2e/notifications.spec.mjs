// The notification bell and the guide.
import { readFileSync } from 'node:fs';
import { test, expect, modal, closeModal } from './fixtures.mjs';
import { CACHE_DIR } from './support/taxonomy.mjs';

// The snapshot curriculum-sync.js would save for the cached taxonomy, minus
// `drop` topics (to simulate an older copy of the curriculum).
function snapshot(drop = 0) {
  const read = (f) => JSON.parse(readFileSync(`${CACHE_DIR}/${f}`, 'utf8'));
  const topics = read('topics.json').topics;
  const deps = read('dependencies.json').dependencies;
  const manifest = read('manifest.json');
  const kept = topics.slice(drop);
  return {
    version: manifest.taxonomyVersion || 'v1',
    generatedAt: manifest.generatedAt || null,
    count: kept.length,
    depCount: deps.length,
    topicIds: kept.map((t) => t.id),
    savedAt: 1,
  };
}

// The bell has only a title; its accessible name is the unread count (finding),
// so it cannot be found by role and name.
const bell = (page) => page.locator('button[title="Notifications"]').first();

test('first run leaves one welcome notification; mark all read clears the badge', async ({ page, api, gotoApp, shot }) => {
  await gotoApp({ seed: {} });
  await expect(bell(page)).toContainText('1');
  await bell(page).click();
  const m = modal(page);
  await expect(m.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await expect(m.getByText('Your curriculum is ready')).toBeVisible();
  await expect(m).toContainText('Harrington has loaded 1,590 topics (v1) from the open Marble curriculum.');
  await expect(m).toContainText('does not update on its own');
  await shot('notifications-unread', { full: false });
  await m.getByRole('button', { name: 'Mark all read' }).click();
  await closeModal(page);
  await expect(bell(page)).not.toContainText('1');
  const state = await api.waitForState((s) => s.notifications?.length === 1 && s.notifications[0].read === true);
  expect(state.curriculumSnapshot.count).toBe(1590);

  // A later boot with the same curriculum adds nothing new.
  await page.reload();
  await bell(page).click();
  await expect(modal(page).locator('#list > div')).toHaveCount(1);
});

test('clicking one unread notification marks just that one read', async ({ page, api, gotoApp }) => {
  await gotoApp({
    seed: {
      extra: {
        notifications: [
          { id: 'n_a', type: 'info', title: 'First note', body: 'Body A', read: false, createdAt: 2 },
          { id: 'n_b', type: 'challenge', title: 'Second note', body: 'Body B', read: false, createdAt: 1 },
        ],
        curriculumSnapshot: null,
      },
    },
  });
  await expect(bell(page)).toContainText('2');
  await bell(page).click();
  await modal(page).getByText('First note').click();
  await closeModal(page);
  await expect(bell(page)).toContainText('1');
  const state = await api.waitForState((s) => s.notifications?.find((n) => n.id === 'n_a')?.read === true);
  expect(state.notifications.find((n) => n.id === 'n_b').read).toBe(false);
});

test('the bell is named by its unread count, not "Notifications" (finding F13)', async ({ page, gotoApp }) => {
  await gotoApp({ seed: {} });
  await expect(bell(page)).toHaveAccessibleName('1');
  await expect(page.getByRole('button', { name: 'Notifications' })).toHaveCount(0);
});

test('empty notification center', async ({ page, gotoApp }) => {
  await gotoApp({ seed: { extra: { notifications: [], curriculumSnapshot: snapshot() } } });
  await expect(bell(page)).toHaveText('');
  await bell(page).click();
  await expect(modal(page)).toContainText('No notifications yet.');
});

test('a curriculum with new topics since the last visit raises a notification', async ({ page, gotoApp, shot }) => {
  // The taxonomy cache never revalidates, so this only happens if the cached
  // files are replaced; simulate it with an older saved snapshot.
  await gotoApp({ seed: { extra: { notifications: [], curriculumSnapshot: snapshot(5) } } });
  await expect(bell(page)).toContainText('1');
  await bell(page).click();
  await expect(modal(page).getByText('Curriculum updated — 5 new topics')).toBeVisible();
  await expect(modal(page)).toContainText('New material was added in');
  await shot('curriculum-updated', { full: false });
});

test('guide modal from the sidebar and tour replay', async ({ page, gotoApp, shot }) => {
  await gotoApp({ seed: {} });
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Guide' }).click();
  const guide = modal(page);
  await expect(guide.getByRole('heading', { name: 'How Harrington works' })).toBeVisible();
  const items = guide.locator('#list > div');
  await expect(items).toHaveCount(10);
  await expect(items.filter({ hasText: 'Records & recordings' })).toContainText("may send audio to the browser vendor");
  await shot('guide-full', { full: false });
  await guide.getByRole('button', { name: 'Replay tour' }).click();
  const tour = modal(page);
  await expect(tour.getByRole('heading', { name: 'Welcome to Harrington' })).toBeVisible();
  await tour.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('#modal-root > div')).toHaveCount(0);
});
