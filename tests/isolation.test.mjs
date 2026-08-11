import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const repoRoot = new URL('..', import.meta.url);
const source = (path) => readFile(new URL(path, repoRoot), 'utf8');
const importSource = async (path) => {
  const code = await source(path);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

test('Harrington runtime, storage, and deployment surfaces remain isolated', async (t) => {
  const kvCalls = { get: [], set: [] };
  const workerCalls = [];
  globalThis.puter = {
    auth: {
      isSignedIn: () => true,
      getUser: async () => ({ uuid: 'parent-1' }),
    },
    kv: {
      get: async (key) => { kvCalls.get.push(key); return null; },
      set: async (key, value) => { kvCalls.set.push({ key, value }); },
    },
    workers: {
      exec: async (url, options) => {
        workerCalls.push({ url, options });
        return { ok: true, json: async () => ({ pod: { id: 'pod-1' } }) };
      },
    },
  };

  await t.test('persists account state and lesson cache only in Harrington KV keys', async () => {
    const store = await importSource('src/js/store.js');
    await store.refreshAuth();
    store.addStudent('Ada', 2018);
    await new Promise((resolve) => setTimeout(resolve, 450));
    await store.saveCachedLesson('math-1', { title: 'Counting' });

    assert.deepEqual(kvCalls.set.map(({ key }) => key), [
      'harrington:v1',
      'harrington:lesson:math-1',
    ]);
    assert.ok(kvCalls.set.every(({ key }) => key.startsWith('harrington:')));
  });

  await t.test('calls the Harrington Commune worker through Puter', async () => {
    const coop = await importSource('src/js/coop.js');
    await coop.createPod('Oak Street', 'Ada');

    assert.equal(coop.BROKER_URL, 'https://harrington-coop-broker.puter.work');
    assert.equal(workerCalls[0].url, 'https://harrington-coop-broker.puter.work/pod/create');
    assert.equal(workerCalls[0].options.method, 'POST');
  });

  await t.test('uses Harrington-only audio, site deployment, and worker deployment identifiers', async () => {
    const [recorder, siteDeploy, workerDeploy] = await Promise.all([
      source('src/js/recorder.js'),
      source('scripts/deploy-puter.mjs'),
      source('scripts/deploy-worker.mjs'),
    ]);

    assert.match(recorder, /const path = `harrington\/recordings\/\$\{recId\}\.\$\{ext\}`/);
    assert.match(siteDeploy, /const SUBDOMAIN = process\.env\.PUTER_SUBDOMAIN \|\| 'harrington';/);
    assert.match(workerDeploy, /const WORKER_NAME = 'harrington-coop-broker';/);
    assert.match(workerDeploy, /const REMOTE_PATH = 'harrington\/coop-broker\.js';/);
  });

  await t.test('keeps service runtime namespaces out of Homestead and inside Harrington', async () => {
    const worker = await source('workers/coop-broker.js');
    const runtimeSurfaces = await Promise.all([
      source('src/js/store.js'),
      source('src/js/recorder.js'),
      source('src/js/coop.js'),
      worker,
    ]);

    for (const surface of runtimeSurfaces) {
      assert.doesNotMatch(surface, /['"`][^'"`]*homestead[^'"`]*['"`]/i);
    }
    assert.match(worker, /const KV_PREFIX = 'harrington:coop';/);
    assert.match(worker, /pod: \(id\) => `\$\{KV_PREFIX\}:pod:\$\{id\}`/);
    assert.match(worker, /invite: \(code\) => `\$\{KV_PREFIX\}:invite:\$\{code\}`/);
    assert.match(worker, /userPods: \(uuid\) => `\$\{KV_PREFIX\}:userpods:\$\{uuid\}`/);
    assert.match(worker, /card: \(podId, cardId\) => `\$\{KV_PREFIX\}:card:\$\{podId\}:\$\{cardId\}`/);
    assert.match(worker, /cardPrefix: \(podId\) => `\$\{KV_PREFIX\}:card:\$\{podId\}:/);
  });
});
