import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCHEMA_VERSION } from '../src/js/schema.js';

// A change stays pending until the server has it (HAR-43): `dirty` while it
// is only in this tab, `sending` while its PUT is in flight, `synced` once the
// server answered. The page being hidden or closed in the middle must not
// lose it: a small PUT keeps itself alive (keepalive), a browser without that
// sends the same snapshot again as a beacon, and a document too large for
// either gets a beforeunload warning.
// A 412 that carries an old write of this tab at an older version is a
// restored backup, not our own write (HAR-44): the tab reloads it and says so.

// A stand-in for the server's versioned document, with the same
// compare-and-swap as server.mjs: the version must match, a fresh writeId is kept.
const server = {
  doc: { version: 1, schemaVersion: SCHEMA_VERSION, students: [{ id: 's1', name: 'Rowan Sample' }] },
  puts: [],      // every PUT: { version, writeId, keepalive, bytes, status }
  beacons: [],   // every accepted beacon: { version, writeId, bytes, status, parsed, landed }
  refusedBeacons: 0,
  failNextPut: false,
};
function write(expected, body) {
  if (expected !== server.doc.version) return { status: 412, body: server.doc };
  const { version: _v, writeId, ...rest } = body;
  server.doc = { ...rest, version: expected + 1, ...(writeId && writeId !== server.doc.writeId ? { writeId } : {}) };
  return { status: 204 };
}
// A gate holds a request on the wire until the test releases it.
const gate = () => { let release; const promise = new Promise((r) => { release = r; }); return { promise, release }; };
let holdPuts = null;
let holdBeacons = null;
const tick = () => new Promise((r) => setImmediate(r));
const clone = (value) => JSON.parse(JSON.stringify(value));

const reply = (status, body, version) => ({
  ok: status < 300, status,
  headers: new Headers(version ? { ETag: `"v${version}"` } : {}),
  json: async () => body,
});
globalThis.fetch = async (path, options = {}) => {
  if (path === '/api/health') return reply(200, { aiConfigured: false, stateVersion: server.doc.version });
  if (path === '/api/state' && options.method === 'PUT') {
    const body = JSON.parse(options.body);
    const sent = Number(/"v(\d+)"/.exec(options.headers['If-Match'])[1]);
    const record = { version: sent, writeId: body.writeId, keepalive: options.keepalive === true, bytes: options.body.length, status: null };
    server.puts.push(record);
    if (holdPuts) await holdPuts.promise;
    if (server.failNextPut) { server.failNextPut = false; record.status = 500; return reply(500, { error: 'down' }); }
    const result = write(sent, body);
    record.status = result.status;
    return result.status === 412 ? reply(412, result.body) : reply(204, null, server.doc.version);
  }
  if (path === '/api/state') return reply(200, server.doc);
  return reply(200, {});
};
// navigator.sendBeacon as a browser has it: the POST is queued and the page
// never sees the answer; a body of 64 KB or more is refused.
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    sendBeacon(url, blob) {
      if (blob.size >= 64 * 1024) { server.refusedBeacons += 1; return false; }
      const record = { version: null, writeId: null, bytes: blob.size, status: null };
      server.beacons.push(record);
      const body = blob.text().then(JSON.parse);
      record.parsed = body.then((b) => { record.version = b.version; record.writeId = b.writeId; });
      record.landed = record.parsed.then(async () => {
        if (holdBeacons) await holdBeacons.promise;
        record.status = write((await body).version, await body).status;
      });
      return true;
    },
  },
});

const store = await import('../src/js/store.js');
const events = [];
store.onSaveStatus((e) => events.push(e));
const types = () => events.map((e) => e.type);
await store.loadAll();

// Two notes of 40 KB: a document over the 64 KB a beacon or a keepalive request may carry.
const bigNotes = [];
function growLarge() {
  for (const title of ['One long note', 'Another long note']) bigNotes.push(store.addRecord('s1', { type: 'note', title, note: 'x'.repeat(40_000) }));
}
function shrink() {
  for (const rec of bigNotes.splice(0)) store.removeRecord('s1', rec.id);
}
const unloadEvent = () => ({ defaultPrevented: false, returnValue: undefined, preventDefault() { this.defaultPrevented = true; } });

test('a change is dirty, then sending while its PUT is in flight, then synced', async () => {
  assert.equal(store.syncStatus(), 'synced');
  holdPuts = gate();
  store.setStatus('s1', 'a', 'learning');
  assert.equal(store.syncStatus(), 'dirty');
  const flushed = store.flushSaves();
  await tick();
  assert.equal(store.syncStatus(), 'sending');
  assert.equal(server.puts.length, 1);
  assert.equal(server.puts[0].keepalive, true, 'under 64 KB, the request outlives the page on its own');
  // Hidden while the PUT is in flight: the keepalive request needs no beacon.
  store.handlePageHidden();
  assert.equal(server.beacons.length, 0);
  holdPuts.release(); holdPuts = null;
  await flushed;
  assert.equal(store.syncStatus(), 'synced');
  assert.equal(types().at(-1), 'saved');
  assert.equal(server.doc.progress.s1.a.status, 'learning');
});

test('a save that fails is pending again, not lost', async () => {
  server.failNextPut = true;
  store.setStatus('s1', 'b', 'practicing');
  await store.flushSaves();
  assert.equal(types().at(-1), 'failed');
  assert.equal(store.syncStatus(), 'dirty');
  await store.flushSaves();
  assert.equal(store.syncStatus(), 'synced');
  assert.equal(server.doc.progress.s1.b.status, 'practicing');
});

// A browser whose fetch cannot keep a request alive past unload (Firefox before 133).
const realRequest = globalThis.Request;

test('without keepalive, the snapshot in flight goes out again as a beacon on pagehide; when the beacon lands first the PUT stands down', async () => {
  globalThis.Request = undefined;
  try {
    holdPuts = gate();
    store.setStatus('s1', 'c', 'learning');
    const flushed = store.flushSaves();
    await tick();
    assert.equal(store.syncStatus(), 'sending');
    const put = server.puts.at(-1);
    assert.equal(put.keepalive, false);
    store.handlePageHidden();
    assert.equal(server.beacons.length, 1);
    const beacon = server.beacons[0];
    await beacon.landed;
    assert.equal(beacon.status, 204);
    assert.deepEqual([beacon.version, beacon.writeId], [put.version, put.writeId], 'the same snapshot and writeId, so a duplicate is harmless');
    const landed = server.doc.version;
    holdPuts.release(); holdPuts = null;
    await flushed;
    assert.equal(put.status, 412);
    assert.equal(server.puts.at(-1), put, 'the body is already on the server: nothing is sent again');
    assert.equal(server.doc.version, landed);
    assert.equal(types().at(-1), 'saved');
    assert.equal(store.syncStatus(), 'synced');
    assert.equal(server.doc.progress.s1.c.status, 'learning');
    // Back in view: the beacon is accounted for, nothing to reconcile.
    events.length = 0;
    await store.handlePageVisible();
    assert.deepEqual(types(), []);
    assert.equal(server.puts.at(-1), put);
  } finally {
    globalThis.Request = realRequest;
  }
});

test('without keepalive, when the PUT lands first the beacon copy is refused and the tab is in step', async () => {
  globalThis.Request = undefined;
  try {
    holdPuts = gate();
    holdBeacons = gate();
    store.setStatus('s1', 'd', 'learning');
    const flushed = store.flushSaves();
    await tick();
    store.handlePageHidden();
    assert.equal(server.beacons.length, 2);
    const beacon = server.beacons[1];
    await beacon.parsed;
    holdPuts.release(); holdPuts = null;
    await flushed;
    assert.equal(types().at(-1), 'saved');
    const version = server.doc.version;
    holdBeacons.release(); holdBeacons = null;
    await beacon.landed;
    assert.equal(beacon.status, 412);
    assert.equal(server.doc.version, version);
    events.length = 0;
    const puts = server.puts.length;
    await store.handlePageVisible();
    assert.deepEqual(types(), []);
    assert.equal(server.puts.length, puts, 'nothing to send again');
    assert.equal(store.syncStatus(), 'synced');
    assert.equal(server.doc.progress.s1.d.status, 'learning');
  } finally {
    globalThis.Request = realRequest;
  }
});

test('a document too large for a beacon: no keepalive, the beacon is refused, and leaving while it saves warns', async () => {
  growLarge();
  await store.flushSaves();
  assert.equal(server.puts.at(-1).keepalive, false, 'over 64 KB: a plain request');
  assert.equal(store.handleBeforeUnload(unloadEvent()), false, 'nothing pending, nothing to warn about');

  // A save in flight.
  holdPuts = gate();
  store.setStatus('s1', 'e', 'learning');
  const flushed = store.flushSaves();
  await tick();
  const beacons = server.beacons.length;
  store.handlePageHidden();
  assert.equal(server.beacons.length, beacons, 'too large for a beacon');
  assert.equal(server.refusedBeacons, 1);
  const event = unloadEvent();
  assert.equal(store.handleBeforeUnload(event), true);
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.returnValue, store.UNLOAD_WARNING);
  holdPuts.release(); holdPuts = null;
  await flushed;
  assert.equal(store.handleBeforeUnload(unloadEvent()), false, 'saved: leaving is fine');
  assert.equal(server.doc.progress.s1.e.status, 'learning');

  // A change still waiting for its debounce: the save starts now, and the browser asks.
  holdPuts = gate();
  store.setStatus('s1', 'f', 'learning');
  assert.equal(store.syncStatus(), 'dirty');
  assert.equal(store.handleBeforeUnload(unloadEvent()), true);
  await tick();
  assert.equal(store.syncStatus(), 'sending');
  holdPuts.release(); holdPuts = null;
  await store.flushSaves();
  assert.equal(server.doc.progress.s1.f.status, 'learning');
});

test('a small document never warns: pagehide beacons a pending change, and a save in flight keeps itself alive', async () => {
  shrink();
  await store.flushSaves();
  holdPuts = gate();
  store.setStatus('s1', 'g', 'learning');
  assert.equal(store.handleBeforeUnload(unloadEvent()), false);
  const flushed = store.flushSaves();
  await tick();
  assert.equal(server.puts.at(-1).keepalive, true);
  assert.equal(store.handleBeforeUnload(unloadEvent()), false);
  holdPuts.release(); holdPuts = null;
  await flushed;
  assert.equal(store.syncStatus(), 'synced');
});

test('a 412 carrying an old write of this tab at an older version is a restored backup: reload and say so, never re-send (HAR-44)', async () => {
  // This tab saved the document the backup holds...
  store.setStatus('s1', 'h', 'learning');
  await store.flushSaves();
  const backup = clone(server.doc);
  assert.ok(backup.writeId, 'the backup carries this tab\'s writeId');
  // ...and went on saving.
  store.setStatus('s1', 'h', 'practicing');
  await store.flushSaves();
  store.setStatus('s1', 'i', 'learning');
  await store.flushSaves();
  assert.ok(server.doc.version > backup.version);

  // The parent restores the backup: the file is replaced, so the server holds
  // an older version that carries this tab's own writeId.
  server.doc = clone(backup);
  events.length = 0;
  const puts = server.puts.length;
  store.setStatus('s1', 'j', 'mastered');
  await store.flushSaves();
  assert.equal(server.puts.length, puts + 1, 'one PUT, refused; the tab\'s state is not sent again');
  assert.equal(server.puts.at(-1).status, 412);
  assert.equal(server.doc.version, backup.version, 'the restored copy stands');
  assert.deepEqual(types(), ['conflict']);
  assert.deepEqual(events[0].discarded.map((c) => [c.kind, c.topicId, c.entry.status]), [['status', 'j', 'mastered']]);
  assert.equal(store.statusOf('s1', 'h'), 'learning', 'the tab shows the restored copy');
  assert.equal(store.statusOf('s1', 'i'), 'none');
  assert.equal(store.statusOf('s1', 'j'), 'none');

  // Try again puts only the new change on the restored copy.
  events[0].retry();
  await store.flushSaves();
  assert.equal(server.doc.version, backup.version + 1);
  assert.equal(server.doc.progress.s1.h.status, 'learning');
  assert.equal(server.doc.progress.s1.i, undefined);
  assert.equal(server.doc.progress.s1.j.status, 'mastered');
});

test('coming back to a tab after a restore reloads the restored copy (HAR-44)', async () => {
  store.setStatus('s1', 'k', 'learning');
  await store.flushSaves();
  const backup = clone(server.doc);
  store.setStatus('s1', 'k', 'practicing');
  await store.flushSaves();
  server.doc = clone(backup);
  events.length = 0;
  const puts = server.puts.length;
  await store.handlePageVisible();
  assert.deepEqual(types(), ['conflict']);
  assert.deepEqual(events[0].discarded, [], 'nothing of this tab\'s was lost: "Reloaded the latest"');
  assert.equal(store.statusOf('s1', 'k'), 'learning');
  assert.equal(server.puts.length, puts, 'nothing written');
  assert.equal(server.doc.version, backup.version);
});

test('a newer document carrying our own write is still ours: no reload', async () => {
  // The unload path: a beacon landed and the tab did not see the answer.
  store.setStatus('s1', 'l', 'learning');
  store.handlePageHidden();
  await server.beacons.at(-1).landed;
  assert.equal(server.beacons.at(-1).status, 204);
  events.length = 0;
  await store.handlePageVisible();
  assert.deepEqual(types(), []);
  assert.equal(store.statusOf('s1', 'l'), 'learning');
  store.setStatus('s1', 'm', 'learning');
  await store.flushSaves();
  assert.equal(types().at(-1), 'saved');
  assert.equal(server.doc.progress.s1.l.status, 'learning');
  assert.equal(server.doc.progress.s1.m.status, 'learning');
});
