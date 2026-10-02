import assert from 'node:assert/strict';
import { test } from 'node:test';

// What a tab does when it loses a save (e2e finding F17): it reloads once,
// names what it discarded, re-applies it on request, and never raises a
// conflict over its own boot writes (curriculum snapshot, welcome note).

// A tiny stand-in for the server's versioned document.
const server = { doc: { version: 1, students: [{ id: 's1', name: 'Rowan Sample' }] }, puts: [] };
const reply = (status, body, version) => ({
  ok: status < 300, status,
  headers: new Headers(version ? { ETag: `"v${version}"` } : {}),
  json: async () => body,
});
globalThis.fetch = async (path, options = {}) => {
  if (path === '/api/health') return reply(200, { aiConfigured: false, stateVersion: server.doc.version });
  if (path === '/api/state' && options.method === 'PUT') {
    const sent = Number(/"v(\d+)"/.exec(options.headers['If-Match'])[1]);
    server.puts.push(sent);
    if (sent !== server.doc.version) return reply(412, server.doc);
    server.doc = { ...JSON.parse(options.body), version: sent + 1 };
    return reply(204, null, server.doc.version);
  }
  if (path === '/api/state') return reply(200, server.doc);
  return reply(200, {});
};
// Another tab saving: the server document moves on without us.
const otherTabSaves = (patch) => { server.doc = { ...server.doc, ...patch(server.doc), version: server.doc.version + 1, writeId: 'w_other' }; };

const store = await import('../src/js/store.js');
const events = [];
store.onSaveStatus((e) => events.push(e));
await store.loadAll();

test('diffDocuments lists status changes, added records and bookkeeping', () => {
  const base = { progress: { s1: { a: { status: 'learning' } } }, records: { s1: [{ id: 'r1' }] }, notifications: [], curriculumSnapshot: null, graphView: 'atlas' };
  const local = {
    progress: { s1: { a: { status: 'mastered' }, b: { status: 'learning' } } },
    records: { s1: [{ id: 'r2', type: 'note', title: 'Counted grapes' }, { id: 'r1' }] },
    notifications: [{ id: 'n1', type: 'welcome' }],
    curriculumSnapshot: { version: 'v1' },
    graphView: 'list',
  };
  const kinds = store.diffDocuments(base, local).map((c) => c.kind);
  assert.deepEqual(kinds, ['status', 'status', 'record', 'notification', 'snapshot', 'other']);
  assert.equal(store.diffDocuments(base, base).length, 0);
});

test('describeDiscarded names statuses and records, never bookkeeping', () => {
  const changes = [
    { kind: 'status', topicId: 't1', entry: { status: 'practicing' } },
    { kind: 'status', topicId: 't2', entry: { status: 'none' } },
    { kind: 'record', record: { type: 'note', title: 'Counted grapes' } },
    { kind: 'record', record: { type: 'observation' } },
  ];
  const names = { t1: 'One-to-one counting', t2: 'How Many in Total?' };
  assert.equal(store.describeDiscarded(changes, (id) => names[id]),
    'One-to-one counting marked practicing, How Many in Total? marked not started, the note “Counted grapes”, the record');
  assert.equal(store.describeDiscarded([{ kind: 'snapshot' }, { kind: 'activity' }]), '');
  assert.equal(store.canReapply(changes), true);
  assert.equal(store.canReapply([...changes, { kind: 'other', key: 'plan' }]), false);
});

test('a boot write that loses to a sibling tab\'s boot write is silent', async () => {
  otherTabSaves(() => ({ curriculumSnapshot: { version: 'v1', topicIds: ['a'] }, notifications: [{ id: 'n_other', type: 'welcome', read: false }] }));
  events.length = 0;
  store.setCurriculumSnapshot({ version: 'v1', topicIds: ['a'] });
  store.addNotification({ type: 'welcome', title: 'Your curriculum is ready' });
  await store.flushSaves();
  assert.deepEqual(events.filter((e) => e.type === 'conflict'), []);
  // The sibling's welcome note is the only one; nothing more to save.
  assert.deepEqual(store.notifications().map((n) => n.id), ['n_other']);
  await store.flushSaves();
  assert.equal(server.doc.notifications.length, 1);
});

test('a losing status change is named once and Try again re-applies it', async () => {
  otherTabSaves((doc) => ({ progress: { s1: { a: { status: 'learning', updatedAt: 1 } } }, activity: { s1: { '2026-10-07': true } }, notifications: doc.notifications }));
  events.length = 0;
  store.setStatus('s1', 'b', 'practicing');
  await store.flushSaves();
  const conflicts = events.filter((e) => e.type === 'conflict');
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].discarded.map((c) => [c.kind, c.topicId, c.entry.status]), [['status', 'b', 'practicing']]);
  assert.equal(store.statusOf('s1', 'b'), 'none', 'the fresh copy is shown');
  assert.equal(store.statusOf('s1', 'a'), 'learning');

  conflicts[0].retry();
  await store.flushSaves();
  assert.equal(server.doc.progress.s1.b.status, 'practicing');
  assert.equal(server.doc.progress.s1.a.status, 'learning', 'the other tab\'s change is kept');
  assert.equal(events.filter((e) => e.type === 'conflict').length, 1);
});

test('a change that cannot simply be re-applied gets no Try again', async () => {
  otherTabSaves(() => ({ graphView: 'atlas' }));
  events.length = 0;
  store.setGraphView('list');
  await store.flushSaves();
  const [conflict] = events.filter((e) => e.type === 'conflict');
  assert.equal(conflict.retry, null);
  assert.equal(store.describeDiscarded(conflict.discarded), 'other changes');
});
