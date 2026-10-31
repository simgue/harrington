// The app's start-up (app.js boot) with a slow Australian Curriculum list:
// the first render does not wait for it, and the page renders again when it
// arrives (data.js loadStandards).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installFakeDom } from './support/fake-dom.mjs';

const { document } = installFakeDom();
const app = document.createElement('div');
app.setAttribute('id', 'app');
document.body.appendChild(app);
for (const id of ['toast-root', 'modal-root']) {
  const node = document.createElement('div');
  node.setAttribute('id', id);
  document.body.appendChild(node);
}

const STATE = {
  schemaVersion: 3,
  students: [{ id: 's_1', name: 'Rowan Example', birthYear: new Date().getFullYear() - 6, color: '#3f6b3b', curriculum: { id: 'acara-v9', year: '2' } }],
  activeStudentId: 's_1',
  notifications: [{ id: 'n_welcome', type: 'welcome', title: 'Welcome', body: 'Hello', read: true }],
};
const TOPIC = { id: 't-order', name: 'Ordering numbers', subject: 'Mathematics', domain: 'Number', ageRangeStart: 7, ageRangeEnd: 8, standards: ['acara-v9:AC9M2N01'] };
let releaseStandards;
const standardsAsked = new Promise((resolve) => { globalThis.__standardsAsked = resolve; });
const json = (body, status = 200) => ({ ok: status < 400, status, headers: new Headers({ ETag: '"v1"' }), json: async () => body, text: async () => JSON.stringify(body) });
globalThis.fetch = async (path) => {
  const url = new URL(String(path), 'http://harrington.test');
  switch (url.pathname) {
    case '/api/health': return json({ ok: true, aiConfigured: false });
    case '/api/state': return json({ ...STATE, version: 1 });
    case '/api/figures': return json({ figures: [] });
    case '/api/taxonomy/topics.json': return json({ topics: [TOPIC] });
    case '/api/taxonomy/dependencies.json': return json({ dependencies: [] });
    case '/api/taxonomy/clusters.json': return json({ clusters: [] });
    case '/api/taxonomy/manifest.json': return json({ taxonomyVersion: 'test' });
    case '/api/taxonomy/standards/acara-v9.json':
      globalThis.__standardsAsked();
      // Held until the test releases it: a slow or silent upstream.
      return new Promise((resolve) => { releaseStandards = () => resolve(json({ standards: [{ code: 'AC9M2N01', title: 'order numbers', strand: 'Number', learningArea: 'Mathematics', subject: 'Mathematics', yearLevels: ['2'] }] })); });
    default: return json({ error: 'Not found' }, 404);
  }
};

const until = async (check, what) => {
  for (let i = 0; i < 200; i += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`timed out waiting for ${what}`);
};

test('the app renders without waiting for the standards list, and again when it arrives', async () => {
  const data = await import('../src/js/data.js');
  window.location.hash = '#topic/t-order';
  await import('../src/js/app.js');
  await standardsAsked;
  // The topic page is up while the list is still on its way: no codes yet.
  await until(() => app.textContent.includes('Ordering numbers'), 'the first render');
  assert.equal(data.standardsPending(), true);
  assert.equal(data.getData().standards, null);
  assert.equal(app.textContent.includes('AC9M2N01 · Year 2'), false);

  // When it arrives, the page showing renders again, now with the chip.
  releaseStandards();
  await until(() => app.textContent.includes('AC9M2N01 · Year 2 · Number'), 'the render after the list arrived');
  assert.equal(data.standardsPending(), false);
});
