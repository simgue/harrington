// Drives the browser store (src/js/store.js) against a real Harrington server:
// relative fetches from the store are routed to a spawned server.mjs.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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

const stateFile = () => join(dataDir, 'family-state.json');
const serverState = async () => (await realFetch(`${baseUrl}/api/state`)).json();

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'harrington-store-'));
  await mkdir(join(dataDir, 'taxonomy'), { recursive: true });
  await writeFile(join(dataDir, 'taxonomy', 'topics.json'), JSON.stringify({ topics: [
    { id: 'count-to-5', name: 'Count to 5', subject: 'Mathematics', domain: 'Counting' },
    { id: 'rhymes', name: 'Rhymes', subject: 'English', domain: 'Phonics' },
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
      body: JSON.stringify(other),
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
    await store.flushSaves();

    const before = await serverState();
    const keys = ['progress', 'records', 'tests', 'plan', 'challenges', 'adaptations', 'suggestions', 'recall', 'practice', 'activity', 'game', 'daily'];
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

  test('export then import restores the family document', async () => {
    const exported = JSON.parse(JSON.stringify(await store.exportDocument()));
    assert.equal(typeof exported.exportedAt, 'string');
    assert.equal(exported.taxonomyVersion, 'v1-test');
    const check = store.inspectImport(exported);
    assert.equal(check.ok, true);
    assert.deepEqual(check.learners.map((l) => l.name), exported.students.map((s) => s.name));

    store.addStudent('Added After Export', 2020);
    await store.flushSaves();

    assert.equal(await store.importDocument(exported), true);
    const restored = await serverState();
    const strip = ({ version, updatedAt, exportedAt, taxonomyVersion, ...rest }) => rest;
    assert.deepEqual(strip(restored), strip(exported));
    assert.deepEqual(store.get().students, exported.students);

    assert.equal(store.inspectImport({ students: 'nope' }).ok, false);
    assert.equal(store.inspectImport({ students: [{ id: 'x' }] }).ok, false);
    assert.equal(store.inspectImport({ students: [], records: [] }).ok, false);
    await assert.rejects(store.importDocument([]));
  });
});
