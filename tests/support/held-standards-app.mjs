// Boots the real app (src/js/app.js) in the fake DOM with the Australian
// Curriculum list held back until the test releases it: a slow or silent
// upstream. One boot per test file (app.js boots when imported), for
// tests/startup*.test.mjs.
import assert from 'node:assert/strict';
import { installFakeDom } from './fake-dom.mjs';

export async function bootWithHeldStandards({ hash }) {
  const { document } = installFakeDom();
  const app = document.createElement('div');
  app.setAttribute('id', 'app');
  document.body.appendChild(app);
  for (const id of ['toast-root', 'modal-root']) {
    const node = document.createElement('div');
    node.setAttribute('id', id);
    document.body.appendChild(node);
  }

  const state = {
    schemaVersion: 3,
    students: [{ id: 's_1', name: 'Rowan Example', birthYear: new Date().getFullYear() - 6, color: '#3f6b3b', curriculum: { id: 'acara-v9', year: '2' } }],
    activeStudentId: 's_1',
    notifications: [{ id: 'n_welcome', type: 'welcome', title: 'Welcome', body: 'Hello', read: true }],
  };
  const topic = { id: 't-order', name: 'Ordering numbers', subject: 'Mathematics', domain: 'Number', ageRangeStart: 7, ageRangeEnd: 8, standards: ['acara-v9:AC9M2N01'] };
  let releaseStandards;
  let asked;
  const standardsAsked = new Promise((resolve) => { asked = resolve; });
  const json = (body, status = 200) => ({ ok: status < 400, status, headers: new Headers({ ETag: '"v1"' }), json: async () => body, text: async () => JSON.stringify(body) });
  globalThis.fetch = async (path) => {
    const url = new URL(String(path), 'http://harrington.test');
    switch (url.pathname) {
      case '/api/health': return json({ ok: true, aiConfigured: false });
      case '/api/state': return json({ ...state, version: 1 });
      case '/api/figures': return json({ figures: [] });
      case '/api/taxonomy/topics.json': return json({ topics: [topic] });
      case '/api/taxonomy/dependencies.json': return json({ dependencies: [] });
      case '/api/taxonomy/clusters.json': return json({ clusters: [] });
      case '/api/taxonomy/manifest.json': return json({ taxonomyVersion: 'test' });
      case '/api/taxonomy/standards/acara-v9.json':
        asked();
        // Held until the test releases it.
        return new Promise((resolve) => { releaseStandards = () => resolve(json({ standards: [{ code: 'AC9M2N01', title: 'order numbers', strand: 'Number', learningArea: 'Mathematics', subject: 'Mathematics', yearLevels: ['2'] }] })); });
      default: return json({ error: 'Not found' }, 404);
    }
  };

  const data = await import('../../src/js/data.js');
  window.location.hash = hash;
  await import('../../src/js/app.js');
  await standardsAsked;
  return { document, app, data, release: () => releaseStandards() };
}

export async function until(check, what) {
  for (let i = 0; i < 200; i += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`timed out waiting for ${what}`);
}

// Lets pending promise callbacks and short timers run.
export const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
