// Drives the browser store (src/js/store.js) against a real Harrington server:
// relative fetches from the store are routed to a spawned server.mjs.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

const repoRoot = new URL('..', import.meta.url);
let child;
let dataDir;
let baseUrl;
let store;
let syncCurriculum;
const statusEvents = [];
const realFetch = globalThis.fetch;
const beacons = [];
let beaconDelayMs = 0;
const beaconStatuses = async () => { const all = await Promise.all(beacons); beacons.length = 0; return all; };
const otherDevicePut = async (mutate) => {
  const current = await serverState();
  const res = await realFetch(`${baseUrl}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': `"v${current.version}"` },
    body: JSON.stringify({ ...mutate(current), writeId: 'other-device' }),
  });
  assert.equal(res.status, 204);
  return serverState();
};

const stateFile = () => join(dataDir, 'family-state.json');
const serverState = async () => (await realFetch(`${baseUrl}/api/state`)).json();

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'harrington-store-'));
  await mkdir(join(dataDir, 'taxonomy'), { recursive: true });
  await writeFile(join(dataDir, 'taxonomy', 'topics.json'), JSON.stringify({ topics: [
    { id: 'count-to-5', name: 'Count to 5', subject: 'Mathematics', domain: 'Counting' },
    { id: 'rhymes', name: 'Rhymes', subject: 'English', domain: 'Phonics', ageRangeStart: 7 },
  ] }));
  await writeFile(join(dataDir, 'taxonomy', 'dependencies.json'), JSON.stringify({ dependencies: [] }));
  await writeFile(join(dataDir, 'taxonomy', 'clusters.json'), JSON.stringify({ clusters: [] }));
  await writeFile(join(dataDir, 'taxonomy', 'manifest.json'), JSON.stringify({ taxonomyVersion: 'v1-test', generatedAt: '2026-09-01' }));

  child = spawn(process.execPath, ['server.mjs'], {
    cwd: repoRoot,
    env: { ...process.env, HARRINGTON_HOST: '127.0.0.1', HARRINGTON_PORT: '0', HARRINGTON_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  baseUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 5000);
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited with ${code}: ${output}`)); });
  });

  globalThis.fetch = (path, options) => realFetch(typeof path === 'string' && path.startsWith('/') ? `${baseUrl}${path}` : path, options);
  // A beacon the test can observe: it really POSTs, but the store never sees
  // the response, as in a browser.
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      sendBeacon(url, blob) {
        const delay = beaconDelayMs;
        beacons.push(blob.text().then((body) => new Promise((resolve) => setTimeout(resolve, delay)).then(() => body)).then((body) => realFetch(`${baseUrl}${url}`, {
          method: 'POST', headers: { 'Content-Type': blob.type }, body,
        })).then((response) => response.status));
        return true;
      },
    },
  });
  store = await import('../src/js/store.js');
  ({ syncCurriculum } = await import('../src/js/curriculum-sync.js'));
  const { loadTaxonomy } = await import('../src/js/data.js');
  await loadTaxonomy();
  store.onSaveStatus((event) => statusEvents.push(event.type));
});

after(async () => {
  globalThis.fetch = realFetch;
  child?.kill('SIGTERM');
  if (child && child.exitCode === null) await new Promise((resolve) => child.once('exit', resolve));
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

describe('family data safety in the store', { concurrency: false }, () => {
  test('booting twice without changes does not write the state file', async () => {
    await store.loadAll();
    syncCurriculum();
    await store.flushSaves();
    const first = await serverState();
    assert.equal(first.version, 1);
    assert.equal(first.curriculumSnapshot.version, 'v1-test');
    const { mtimeMs } = await stat(stateFile());

    for (let boot = 0; boot < 2; boot += 1) {
      await store.loadAll();
      syncCurriculum();
      await store.flushSaves();
    }
    assert.equal((await serverState()).version, 1);
    assert.equal((await stat(stateFile())).mtimeMs, mtimeMs);
  });

  test('saves with If-Match and reloads when another device saved first', async () => {
    const id = store.addStudent('Sample Learner', 2018);
    await store.flushSaves();
    const saved = await serverState();
    assert.equal(saved.students.length, 1);

    // Another device writes a newer version.
    const other = { ...saved, students: [...saved.students, { id: 'other', name: 'Other Device', birthYear: 2019 }] };
    const res = await realFetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': `"v${saved.version}"` },
      body: JSON.stringify({ ...other, writeId: 'other-device' }),
    });
    assert.equal(res.status, 204);

    let emitted = 0;
    const unsubscribe = store.subscribe(() => { emitted += 1; });
    statusEvents.length = 0;
    store.setStatus(id, 'count-to-5', 'learning');
    await store.flushSaves();
    unsubscribe();

    assert.deepEqual(statusEvents, ['conflict']);
    assert.ok(emitted >= 2, 'the store re-renders after reloading');
    const latest = await serverState();
    assert.equal(latest.version, saved.version + 1);
    assert.deepEqual(store.get().students.map((s) => s.id), latest.students.map((s) => s.id));
    assert.equal(store.statusOf(id, 'count-to-5'), 'none');

    // The next save succeeds against the reloaded version.
    store.setStatus(id, 'count-to-5', 'learning');
    await store.flushSaves();
    assert.equal(statusEvents.at(-1), 'saved');
    assert.equal((await serverState()).progress[id]['count-to-5'].status, 'learning');
  });

  test('reports a too-large save and keeps the change pending', async () => {
    const id = store.get().students[0].id;
    statusEvents.length = 0;
    store.addRecord(id, { type: 'note', title: 'Huge', note: 'x'.repeat(5 * 1024 * 1024) });
    await store.flushSaves();
    assert.deepEqual(statusEvents, ['too-large']);

    store.removeRecord(id, store.recordsFor(id)[0].id);
    await store.flushSaves();
    assert.equal(statusEvents.at(-1), 'saved');
  });

  test('removeStudent leaves no per-learner keys or recordings behind', async () => {
    const id = store.addStudent('Removable Learner', 2017);
    const audioPath = `${id}/rec-1.webm`;
    assert.equal((await realFetch(`${baseUrl}/api/audio/${encodeURIComponent(audioPath)}`, {
      method: 'PUT', headers: { 'Content-Type': 'audio/webm' }, body: new Uint8Array([1, 2, 3]),
    })).status, 204);
    store.addRecord(id, { type: 'recording', title: 'Reading aloud', audioPath });
    store.setStatus(id, 'count-to-5', 'mastered');
    store.addTestResult(id, { subject: 'Mathematics', score: 1, total: 1, pct: 100, passed: true });
    store.addExtra(id, '2026-09-27', { kind: 'practice', topicId: 'count-to-5' });
    store.addChallenge(id, { topicId: 'count-to-5', correct: 1, total: 1 });
    store.setAdaptation(id, 'Mathematics', 'Counting', 'advanced');
    store.addSuggestion(id, { kind: 'advance', subject: 'Mathematics', domain: 'Counting' });
    store.gradeRecall(id, 'card-1', 'count-to-5', 'good');
    store.enqueuePracticeItem(id, { topicId: 'count-to-5', q: '2 + 3?' });
    store.awardXp(id, 10);
    store.saveDailyOffers(id, '2026-09-27', { literacy: ['rhymes'], numeracy: ['count-to-5'] });
    store.setInterests(id, { chips: ['Animals'], text: 'bridges' });
    await store.flushSaves();

    const before = await serverState();
    const keys = ['progress', 'records', 'tests', 'plan', 'challenges', 'adaptations', 'suggestions', 'recall', 'practice', 'activity', 'game', 'daily', 'interests'];
    for (const key of keys) assert.ok(before[key][id], `${key} was populated`);

    store.removeStudent(id);
    await store.flushSaves();
    const afterRemoval = await serverState();
    assert.ok(!afterRemoval.students.some((s) => s.id === id));
    for (const key of keys) assert.equal(afterRemoval[key][id], undefined, `${key} still has the learner`);
    assert.ok(!JSON.stringify(afterRemoval).includes(id), 'no reference to the learner remains');

    // Audio deletion is fire-and-forget; give it a moment.
    let status;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      status = (await realFetch(`${baseUrl}/api/audio/${encodeURIComponent(audioPath)}`)).status;
      if (status === 404) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(status, 404);
  });

  test('a rejected beacon never lets the next save overwrite another device', async () => {
    await store.loadAll();
    const id = store.get().students[0].id;
    // Another device saves first and adds a learner.
    await otherDevicePut((doc) => ({ ...doc, students: [...doc.students, { id: 'phone', name: 'Phone Kid', birthYear: 2020 }] }));

    // This tab edits, then is hidden: the beacon carries the stale version.
    store.setStatus(id, 'rhymes', 'learning');
    store.handlePageHidden();
    assert.deepEqual(await beaconStatuses(), [412]);
    const afterBeacon = await serverState();

    // The next local save must reload rather than overwrite.
    statusEvents.length = 0;
    store.setStatus(id, 'count-to-5', 'practicing');
    await store.flushSaves();
    const latest = await serverState();
    assert.equal(latest.version, afterBeacon.version, 'nothing was written');
    assert.ok(latest.students.some((s) => s.id === 'phone'));
    assert.ok(store.get().students.some((s) => s.id === 'phone'));
    assert.deepEqual(statusEvents, ['conflict']);
  });

  test('returning to a tab after a rejected beacon reloads the other device\'s save', async () => {
    const id = store.get().students[0].id;
    await otherDevicePut((doc) => ({ ...doc, students: [...doc.students, { id: 'tablet', name: 'Tablet Kid', birthYear: 2021 }] }));
    store.setStatus(id, 'rhymes', 'mastered');
    store.handlePageHidden();
    assert.deepEqual(await beaconStatuses(), [412]);

    statusEvents.length = 0;
    await store.handlePageVisible();
    assert.deepEqual(statusEvents, ['conflict']);
    assert.ok(store.get().students.some((s) => s.id === 'tablet'));
  });

  test('an accepted beacon is recognised as our own write', async () => {
    const id = store.get().students[0].id;
    store.setStatus(id, 'rhymes', 'practicing');
    store.handlePageHidden();
    assert.deepEqual(await beaconStatuses(), [204]);

    statusEvents.length = 0;
    await store.handlePageVisible();
    assert.deepEqual(statusEvents, [], 'no reload or conflict for our own beacon');
    const before = await serverState();
    store.setStatus(id, 'count-to-5', 'mastered');
    await store.flushSaves();
    assert.deepEqual(statusEvents, ['saved']);
    const after = await serverState();
    assert.equal(after.version, before.version + 1);
    assert.equal(after.progress[id].rhymes.status, 'practicing');
    assert.equal(after.progress[id]['count-to-5'].status, 'mastered');
  });

  for (const winner of ['save', 'beacon']) {
    test(`a beacon racing an in-flight save keeps both edits (${winner} lands first)`, async () => {
      const id = store.get().students[0].id;
      const topic = winner === 'save' ? 'rhymes' : 'count-to-5';
      // Hold back whichever request should arrive second.
      const routed = globalThis.fetch;
      if (winner === 'save') beaconDelayMs = 150;
      if (winner === 'beacon') {
        globalThis.fetch = async (path, options) => {
          if (options?.method === 'PUT') await new Promise((resolve) => setTimeout(resolve, 150));
          return routed(path, options);
        };
      }
      try {
        statusEvents.length = 0;
        store.setStatus(id, topic, 'learning');
        const inFlight = store.flushSaves();
        await new Promise((resolve) => setImmediate(resolve)); // the PUT is now on the wire
        store.setStatus(id, 'rhymes' === topic ? 'count-to-5' : 'rhymes', 'practicing');
        store.handlePageHidden();
        const [beacon] = await beaconStatuses();
        await inFlight;
        assert.equal(beacon, winner === 'beacon' ? 204 : 412);
      } finally {
        globalThis.fetch = routed;
        beaconDelayMs = 0;
      }
      await store.handlePageVisible();
      await store.flushSaves();

      const latest = await serverState();
      assert.equal(latest.progress[id][topic].status, 'learning');
      assert.equal(latest.progress[id]['rhymes' === topic ? 'count-to-5' : 'rhymes'].status, 'practicing');
      assert.ok(!statusEvents.includes('conflict'), `events: ${statusEvents}`);
      assert.deepEqual(store.get().progress[id], latest.progress[id]);
    });
  }

  test('a beacon racing an in-flight save cannot clobber another device', async () => {
    const id = store.get().students[0].id;
    // Another device writes; this tab still holds the older version.
    const other = await otherDevicePut((doc) => ({ ...doc, students: [...doc.students, { id: 'laptop2', name: 'Second Laptop Kid', birthYear: 2018 }] }));
    statusEvents.length = 0;
    store.setStatus(id, 'rhymes', 'mastered');
    const inFlight = store.flushSaves();
    await new Promise((resolve) => setImmediate(resolve)); // the PUT is now on the wire
    store.setStatus(id, 'count-to-5', 'mastered');
    store.handlePageHidden();
    assert.deepEqual(await beaconStatuses(), [412]);
    await inFlight;
    await store.handlePageVisible();
    await store.flushSaves();

    const latest = await serverState();
    assert.equal(latest.version, other.version, 'neither the save nor the beacon was written');
    assert.ok(latest.students.some((s) => s.id === 'laptop2'));
    assert.ok(statusEvents.includes('conflict'));
    assert.ok(store.get().students.some((s) => s.id === 'laptop2'));
  });

  test('a save whose response was lost is not mistaken for the next one', async () => {
    const id = store.get().students[0].id;
    // The PUT reaches the server and commits, but the response never arrives.
    const routed = globalThis.fetch;
    globalThis.fetch = async (path, options) => {
      if (options?.method !== 'PUT') return routed(path, options);
      globalThis.fetch = routed;
      await routed(path, options);
      throw new TypeError('Failed to fetch');
    };
    try {
      statusEvents.length = 0;
      store.setStatus(id, 'rhymes', 'mastered');
      await store.flushSaves();
    } finally {
      globalThis.fetch = routed;
    }
    assert.deepEqual(statusEvents, ['failed']);
    assert.equal((await serverState()).progress[id].rhymes.status, 'mastered', 'the first save committed');

    // A second edit: its PUT gets a 412 carrying our own writeId.
    store.setStatus(id, 'count-to-5', 'none');
    await store.flushSaves();
    assert.equal(statusEvents.at(-1), 'saved');
    const latest = await serverState();
    assert.equal(latest.progress[id]['count-to-5'].status, 'none');
    assert.deepEqual(latest.progress[id], store.get().progress[id]);

    // Nothing is left pending, so hiding the tab sends no beacon.
    store.handlePageHidden();
    assert.equal(beacons.length, 0);
  });

  test('a removal that loses a conflict keeps the learner\'s recordings', async () => {
    const id = store.addStudent('Kept Learner', 2016);
    const audioPath = `${id}/kept.webm`;
    await realFetch(`${baseUrl}/api/audio/${encodeURIComponent(audioPath)}`, {
      method: 'PUT', headers: { 'Content-Type': 'audio/webm' }, body: new Uint8Array([9]),
    });
    store.addRecord(id, { type: 'recording', title: 'Kept', audioPath });
    await store.flushSaves();
    await otherDevicePut((doc) => ({ ...doc, graphView: 'list' }));

    statusEvents.length = 0;
    store.removeStudent(id);
    await store.flushSaves();
    assert.deepEqual(statusEvents, ['conflict']);
    assert.ok(store.get().students.some((s) => s.id === id), 'the learner is back after the reload');
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal((await realFetch(`${baseUrl}/api/audio/${encodeURIComponent(audioPath)}`)).status, 200);
  });

  test('a 412 without a usable body falls back to reading the server copy', async () => {
    await otherDevicePut((doc) => ({ ...doc, graphView: 'atlas', students: [...doc.students, { id: 'garbled', name: 'Garbled Kid', birthYear: 2017 }] }));
    const routed = globalThis.fetch;
    globalThis.fetch = async (path, options) => (options?.method === 'PUT'
      ? new Response('not json', { status: 412 })
      : routed(path, options));
    try {
      statusEvents.length = 0;
      store.setGraphView(store.graphView() === 'list' ? 'atlas' : 'list');
      await store.flushSaves();
    } finally {
      globalThis.fetch = routed;
    }
    assert.deepEqual(statusEvents, ['conflict']);
    assert.ok(store.get().students.some((s) => s.id === 'garbled'));
  });

  test('updateStudent edits the profile in one save and survives export and import', async () => {
    const id = store.addStudent('Sample Nine', 2017, 5);
    await store.flushSaves();
    assert.equal(store.get().students.find((s) => s.id === id).birthMonth, 5);
    const before = (await serverState()).version;

    let emitted = 0;
    const unsubscribe = store.subscribe(() => { emitted += 1; });
    assert.equal(store.updateStudent(id, { name: '  Sample Ten ', birthYear: 2016, birthMonth: 11, color: store.PALETTE[3] }), true);
    unsubscribe();
    assert.equal(emitted, 1);
    await store.flushSaves();
    const saved = await serverState();
    assert.equal(saved.version, before + 1);
    assert.deepEqual(
      (({ name, birthYear, birthMonth, color }) => ({ name, birthYear, birthMonth, color }))(saved.students.find((s) => s.id === id)),
      { name: 'Sample Ten', birthYear: 2016, birthMonth: 11, color: store.PALETTE[3] });

    // Bad values are ignored; a null month clears it.
    store.updateStudent(id, { name: '   ', birthYear: Number.NaN, color: 'red;background:url(x)', birthMonth: null });
    const s = store.get().students.find((s) => s.id === id);
    assert.equal(s.name, 'Sample Ten');
    assert.equal(s.birthYear, 2016);
    assert.equal(s.color, store.PALETTE[3]);
    assert.equal('birthMonth' in s, false);
    assert.equal(store.updateStudent('missing', { name: 'Nobody' }), false);

    // An invalid month or year is ignored, not cleared; only profile fields change.
    store.updateStudent(id, { birthMonth: 6 });
    store.updateStudent(id, { birthMonth: 13 });
    store.updateStudent(id, { birthMonth: '4', birthYear: 1989 });
    store.updateStudent(id, { birthYear: new Date().getFullYear() + 1, startDate: 'soon' });
    store.updateStudent(id, { id: 'hijacked', createdAt: 0, avatar: 'x', startDate: '2026-09-01' });
    assert.equal(s.birthMonth, 6);
    assert.equal(s.birthYear, 2016);
    assert.equal(s.id, id);
    assert.equal(s.createdAt > 0, true);
    assert.equal('avatar' in s, false);
    assert.equal(s.startDate, '2026-09-01');
    store.updateStudent(id, { birthYear: 1990, birthMonth: null });
    assert.equal(s.birthYear, 1990);
    store.updateStudent(id, { birthYear: 2016 });

    // An age change drops today's choices so they are rebuilt for the new age;
    // a name or color change keeps them.
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    store.saveDailyOffers(id, todayKey, { literacy: ['rhymes'], numeracy: ['count-to-5'] });
    store.updateStudent(id, { name: 'Sample Ten', color: store.PALETTE[1] });
    assert.ok(store.dailyFor(id, todayKey));
    store.updateStudent(id, { birthYear: 2015 });
    assert.equal(store.dailyFor(id, todayKey), null);

    store.updateStudent(id, { birthMonth: 2 });
    const exported = JSON.parse(JSON.stringify(await store.exportDocument()));
    store.updateStudent(id, { name: 'Changed After Export', birthMonth: null });
    await store.flushSaves();
    assert.equal(await store.importDocument(exported), true);
    const restored = store.get().students.find((s) => s.id === id);
    assert.equal(restored.name, 'Sample Ten');
    assert.equal(restored.birthMonth, 2);
    assert.equal((await serverState()).students.find((s) => s.id === id).birthMonth, 2);
  });

  test('the calendar plan follows an edited age', async () => {
    const { buildPlan } = await import('../src/js/scheduler.js');
    const year = new Date().getFullYear();
    const id = store.addStudent('Sample Seven', year - 7);
    const atSeven = buildPlan(store.get().students.find((s) => s.id === id));
    assert.ok(atSeven.topicDate.has('rhymes'), 'an age-7 topic is planned for a 7-year-old');

    store.updateStudent(id, { birthYear: year - 8 });
    const atEight = buildPlan(store.get().students.find((s) => s.id === id));
    assert.notEqual(atEight, atSeven);
    assert.equal(atEight.topicDate.has('rhymes'), false, 'the age-7 band is behind an 8-year-old');
    store.removeStudent(id);
    await store.flushSaves();
  });

  test('import replaces a color outside the palette', async () => {
    const exported = JSON.parse(JSON.stringify(await store.exportDocument()));
    const target = exported.students[0];
    target.color = 'red"><img src=x onerror=alert(1)>';
    target.name = '<b>Sample "Eleven"</b>';
    assert.equal(await store.importDocument(exported), true);
    const imported = store.get().students.find((s) => s.id === target.id);
    assert.equal(imported.color, store.PALETTE[0]);
    assert.equal(imported.name, target.name);
    assert.equal((await serverState()).students.find((s) => s.id === target.id).color, store.PALETTE[0]);
  });

  test('export while a save is failing downloads this tab\'s copy', async () => {
    const id = store.get().students[0].id;
    store.addRecord(id, { type: 'note', title: 'Huge', note: 'x'.repeat(5 * 1024 * 1024) });
    const exported = await store.exportDocument();
    assert.equal(exported.unsavedChanges, true);
    assert.equal(exported.records[id][0].title, 'Huge');
    store.removeRecord(id, exported.records[id][0].id);
    await store.flushSaves();
    const clean = await store.exportDocument();
    assert.equal(clean.unsavedChanges, undefined);
  });

  test('export then import restores the family document', async () => {
    const calendar = { homeDays: [1, 2, 3, 4], breaks: [{ start: '2026-12-21', end: '2027-01-01', label: 'Winter break' }] };
    store.setCalendarSettings(calendar);
    await store.flushSaves();
    assert.deepEqual((await serverState()).settings.calendar, calendar);
    const exported = JSON.parse(JSON.stringify(await store.exportDocument()));
    assert.deepEqual(exported.settings.calendar, calendar);
    assert.equal(typeof exported.exportedAt, 'string');
    assert.equal(exported.taxonomyVersion, 'v1-test');
    const check = store.inspectImport(exported);
    assert.equal(check.ok, true);
    assert.deepEqual(check.learners.map((l) => l.name), exported.students.map((s) => s.name));

    store.addStudent('Added After Export', 2020);
    store.setCalendarSettings({ homeDays: [0, 6], breaks: [] });
    await store.flushSaves();

    assert.equal(await store.importDocument(exported), true);
    const restored = await serverState();
    const strip = ({ version, updatedAt, writeId, exportedAt, taxonomyVersion, ...rest }) => rest;
    assert.deepEqual(strip(restored), strip(exported));
    assert.deepEqual(store.get().students, exported.students);
    assert.deepEqual(store.calendarSettings(), calendar);

    assert.equal(store.inspectImport({ students: 'nope' }).ok, false);
    assert.equal(store.inspectImport({ students: [{ id: 'x' }] }).ok, false);
    assert.equal(store.inspectImport({ students: [], records: [] }).ok, false);
    await assert.rejects(store.importDocument([]));
  });

  test('a plain PIN is hashed on load and on import, and never exported', async () => {
    const plain = (doc) => JSON.stringify(doc).includes('"parentPin"');
    // An older family document on the server.
    const before = await otherDevicePut((doc) => ({ ...doc, settings: { ...doc.settings, parentPin: '2468' } }));
    assert.equal(before.settings.parentPin, '2468');
    await store.loadAll();
    await store.flushSaves();
    const migrated = await serverState();
    assert.equal(plain(migrated), false);
    assert.match(migrated.settings.parentPinHash, /^[0-9a-f]{64}$/);
    assert.deepEqual(migrated.settings.calendar, before.settings.calendar);
    assert.equal(store.checkParentPin('2468'), true);
    assert.equal(store.checkParentPin('1111'), false);
    const exported = await store.exportDocument();
    assert.equal(plain(exported), false);
    assert.equal(JSON.stringify(exported).includes('"2468"'), false);

    // An older export file with the PIN in plain text.
    const oldFile = { ...JSON.parse(JSON.stringify(exported)), settings: { ...exported.settings, parentPin: '1357' } };
    delete oldFile.settings.parentPinHash;
    delete oldFile.settings.parentPinSalt;
    assert.equal(await store.importDocument(oldFile), true);
    const imported = await serverState();
    assert.equal(plain(imported), false);
    assert.equal(JSON.stringify(imported).includes('"1357"'), false);
    assert.equal(store.checkParentPin('1357'), true);
    assert.equal(store.checkParentPin('2468'), false);
  });

  const plainPin = (doc) => JSON.stringify(doc).includes('"parentPin"');
  const withPlainPin = (pin) => (doc) => {
    const { parentPinHash: _h, parentPinSalt: _s, ...settings } = doc.settings || {};
    return { ...doc, settings: { ...settings, parentPin: pin } };
  };

  test('export hashes a plain PIN another device saved since this tab loaded', async () => {
    await store.loadAll();
    await store.flushSaves();
    const other = await otherDevicePut(withPlainPin('8642'));
    assert.equal(other.settings.parentPin, '8642');
    // This tab has nothing pending, so the export is the server copy.
    const exported = await store.exportDocument();
    assert.equal(exported.unsavedChanges, undefined);
    assert.equal(plainPin(exported), false);
    assert.equal(JSON.stringify(exported).includes('"8642"'), false);
    assert.match(exported.settings.parentPinHash, /^[0-9a-f]{64}$/);
  });

  test('a conflict reload hashes a plain PIN another device saved, and saves the hash', async () => {
    await store.loadAll();
    await store.flushSaves();
    const id = store.get().students[0].id;
    await otherDevicePut(withPlainPin('9753'));
    statusEvents.length = 0;
    store.setStatus(id, 'count-to-5', 'practicing');
    await store.flushSaves(); // 412: reloads the other device's document
    assert.deepEqual(statusEvents, ['conflict']);
    assert.equal(plainPin(store.get().settings), false);
    assert.equal(store.checkParentPin('9753'), true);
    await store.flushSaves(); // the migration's own save
    const saved = await serverState();
    assert.equal(plainPin(saved), false);
    assert.match(saved.settings.parentPinHash, /^[0-9a-f]{64}$/);
  });

  test('two tabs migrating the same plain PIN: the losing tab reloads without a toast', async () => {
    await otherDevicePut(withPlainPin('1470'));
    const salt = '0'.repeat(32);
    // The other tab migrates and saves just before this tab's migration save.
    const wrapped = globalThis.fetch;
    let raced = false;
    globalThis.fetch = async (path, options = {}) => {
      if (!raced && path === '/api/state' && options.method === 'PUT') {
        raced = true;
        await otherDevicePut((doc) => {
          const { parentPin: _p, ...settings } = doc.settings;
          return { ...doc, settings: { ...settings, parentPinSalt: salt, parentPinHash: createHash('sha256').update(`${salt}:1470`).digest('hex') } };
        });
      }
      return wrapped(path, options);
    };
    statusEvents.length = 0;
    try {
      await store.loadAll(); // migrates and saves at once: 412, reload
      await store.flushSaves();
    } finally {
      globalThis.fetch = wrapped;
    }
    assert.equal(raced, true);
    assert.equal(statusEvents.includes('conflict'), false);
    assert.equal(store.get().settings.parentPinSalt, salt);
    assert.equal(store.checkParentPin('1470'), true);
    assert.equal(plainPin(await serverState()), false);
  });

  test('a load that migrates the PIN saves once, at once; a load with nothing to migrate never writes', async () => {
    await otherDevicePut(withPlainPin('2580'));
    const before = (await serverState()).version;
    await store.loadAll(); // no flushSaves: the migration save is not debounced
    const after = await serverState();
    assert.equal(after.version, before + 1);
    assert.equal(plainPin(after), false);
    await store.loadAll();
    await store.flushSaves();
    assert.equal((await serverState()).version, before + 1);
  });
});
