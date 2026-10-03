import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { isLoopbackAddress } from '../lib/loopback.mjs';
import { AI_CAPABILITIES, parseCapabilities } from '../src/js/ai-capabilities.js';

const repoRoot = new URL('..', import.meta.url);
let child;
let dataDir;
let baseUrl;

async function startServer() {
  dataDir = await mkdtemp(join(tmpdir(), 'harrington-test-'));
  child = spawn(process.execPath, ['server.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HARRINGTON_HOST: '127.0.0.1',
      HARRINGTON_PORT: '0',
      HARRINGTON_DATA_DIR: dataDir,
      HARRINGTON_AI_BASE_URL: '',
      HARRINGTON_AI_MODEL: '',
      HARRINGTON_AI_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  baseUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 5000);
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited with ${code}: ${output}`));
    });
  });
}

describe('self-hosted Harrington server', { concurrency: false }, () => {
before(startServer);
after(async () => {
  child?.kill('SIGTERM');
  if (child && child.exitCode === null) {
    await new Promise((resolve) => child.once('exit', resolve));
  }
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

test('serves Harrington and reports self-hosted health', async () => {
  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    ok: true,
    mode: 'self-hosted',
    aiConfigured: false,
    aiSource: 'none',
    aiCapabilities: [],
    taxonomyCached: false,
    stateVersion: 0,
    stateBytes: 0,
  });

  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>Harrington/);
});

function putState(value, ifMatch, url = baseUrl) {
  const headers = { 'Content-Type': 'application/json' };
  if (ifMatch !== undefined) headers['If-Match'] = ifMatch;
  return fetch(`${url}/api/state`, { method: 'PUT', headers, body: JSON.stringify(value) });
}

function withoutMeta({ version: _version, updatedAt: _updatedAt, writeId: _writeId, ...rest }) {
  return rest;
}

test('persists versioned family state on the Harrington server', async () => {
  const empty = await fetch(`${baseUrl}/api/state`);
  assert.equal(empty.status, 200);
  assert.equal(empty.headers.get('etag'), '"v0"');
  assert.deepEqual(await empty.json(), { version: 0 });

  const state = {
    students: [{ id: 'student-1', name: 'Sample Learner', birthYear: 2018 }],
    activeStudentId: 'student-1',
    progress: { 'student-1': { counting: { status: 'learning' } } },
  };

  const saved = await putState(state, '"v0"');
  assert.equal(saved.status, 204);
  assert.equal(saved.headers.get('etag'), '"v1"');

  const loaded = await fetch(`${baseUrl}/api/state`);
  assert.equal(loaded.status, 200);
  assert.equal(loaded.headers.get('etag'), '"v1"');
  const body = await loaded.json();
  assert.equal(body.version, 1);
  assert.equal(typeof body.updatedAt, 'number');
  assert.deepEqual(withoutMeta(body), state);
  assert.deepEqual(JSON.parse(await readFile(join(dataDir, 'family-state.json'), 'utf8')), body);

  const health = await (await fetch(`${baseUrl}/api/health`)).json();
  assert.equal(health.stateVersion, 1);
  assert.equal(health.stateBytes, (await readFile(join(dataDir, 'family-state.json'))).length);
});

test('rejects a stale or missing If-Match without writing', async () => {
  const current = await (await fetch(`${baseUrl}/api/state`)).json();
  const before = await readFile(join(dataDir, 'family-state.json'), 'utf8');

  const stale = await putState({ students: [] }, `"v${current.version - 1}"`);
  assert.equal(stale.status, 412);
  assert.equal(stale.headers.get('etag'), `"v${current.version}"`);
  assert.deepEqual(await stale.json(), current);

  const missing = await putState({ students: [] });
  assert.equal(missing.status, 428);

  const malformed = await putState({ students: [] }, 'yesterday');
  assert.equal(malformed.status, 400);

  assert.equal(await readFile(join(dataDir, 'family-state.json'), 'utf8'), before);
});

test('lets only one of several concurrent writers with the same version succeed', async () => {
  const { version } = await (await fetch(`${baseUrl}/api/state`)).json();
  const snapshots = Array.from({ length: 12 }, (_, index) => ({
    students: [{ id: `student-${index}`, name: `Learner ${index}`, birthYear: 2010 + index }],
    activeStudentId: `student-${index}`,
    progress: { [`student-${index}`]: { counting: { status: 'learning', sequence: index } } },
  }));

  const responses = await Promise.all(snapshots.map((snapshot) => putState(snapshot, `"v${version}"`)));
  const statuses = responses.map((response) => response.status);
  assert.equal(statuses.filter((status) => status === 204).length, 1, `statuses: ${statuses}`);
  assert.equal(statuses.filter((status) => status === 412).length, snapshots.length - 1);

  const loaded = await (await fetch(`${baseUrl}/api/state`)).json();
  const saved = JSON.parse(await readFile(join(dataDir, 'family-state.json'), 'utf8'));
  assert.equal(loaded.version, version + 1);
  assert.ok(snapshots.some((snapshot) => isDeepStrictEqual(withoutMeta(loaded), snapshot)));
  assert.deepEqual(saved, loaded);
  for (const response of responses.filter((r) => r.status === 412)) {
    assert.equal((await response.json()).version >= version, true);
  }
});

test('accepts an unload beacon with the version in the body', async () => {
  const { version } = await (await fetch(`${baseUrl}/api/state`)).json();
  const beacon = { students: [{ id: 'b', name: 'Beacon Learner', birthYear: 2019 }], activeStudentId: 'b' };

  const stale = await fetch(`${baseUrl}/api/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...beacon, version: version + 5 }),
  });
  assert.equal(stale.status, 412);

  const noVersion = await fetch(`${baseUrl}/api/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(beacon),
  });
  assert.equal(noVersion.status, 428);

  const sent = await fetch(`${baseUrl}/api/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...beacon, version }),
  });
  assert.equal(sent.status, 204);
  const loaded = await (await fetch(`${baseUrl}/api/state`)).json();
  assert.equal(loaded.version, version + 1);
  assert.deepEqual(withoutMeta(loaded), beacon);
});

test('rejects cross-site and non-JSON state writes without touching the file', async () => {
  const before = await readFile(join(dataDir, 'family-state.json'), 'utf8');
  const { version } = JSON.parse(before);

  // An HTML form can POST text/plain cross-site without a preflight.
  const form = await fetch(`${baseUrl}/api/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ students: [], version, x: '=' }),
  });
  assert.equal(form.status, 415);

  for (const site of ['cross-site', 'same-site']) {
    const beacon = await fetch(`${baseUrl}/api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': site },
      body: JSON.stringify({ students: [], version }),
    });
    assert.equal(beacon.status, 403);
    const put = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': `"v${version}"`, 'Sec-Fetch-Site': site },
      body: JSON.stringify({ students: [] }),
    });
    assert.equal(put.status, 403);
  }

  assert.equal(await readFile(join(dataDir, 'family-state.json'), 'utf8'), before);
});

test('stores a client writeId and returns it on reads and conflicts', async () => {
  const { version } = await (await fetch(`${baseUrl}/api/state`)).json();
  const state = { students: [{ id: 'w', name: 'Write Id Learner', birthYear: 2019 }], activeStudentId: 'w' };

  const sameOrigin = await fetch(`${baseUrl}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': `"v${version}"`, 'Sec-Fetch-Site': 'same-origin' },
    body: JSON.stringify({ ...state, writeId: 'tab-a-1' }),
  });
  assert.equal(sameOrigin.status, 204);
  const loaded = await (await fetch(`${baseUrl}/api/state`)).json();
  assert.equal(loaded.writeId, 'tab-a-1');

  const stale = await putState({ ...state, writeId: 'tab-b-1' }, `"v${version}"`);
  assert.equal(stale.status, 412);
  assert.equal((await stale.json()).writeId, 'tab-a-1');

  // Echoing the stored id back (read, modify, write) does not claim it.
  const echoed = await putState({ ...loaded, students: [] }, `"v${loaded.version}"`);
  assert.equal(echoed.status, 204);
  const afterEcho = await (await fetch(`${baseUrl}/api/state`)).json();
  assert.equal(afterEcho.writeId, undefined);

  // Ids that are not short strings are not stored.
  assert.equal((await putState({ ...state, writeId: 'x'.repeat(65) }, `"v${afterEcho.version}"`)).status, 204);
  assert.equal((await (await fetch(`${baseUrl}/api/state`)).json()).writeId, undefined);
});

test('round-trips an export through import', async () => {
  const family = {
    students: [{ id: 's1', name: 'Sample One', birthYear: 2017 }, { id: 's2', name: 'Sample Two', birthYear: 2020 }],
    activeStudentId: 's1',
    progress: { s1: { counting: { status: 'mastered', updatedAt: 1 } } },
    records: { s1: [{ id: 'r1', topicId: 'counting', type: 'note', title: 'Counted shells' }], s2: [] },
    tests: { s1: [{ id: 't1', subject: 'Mathematics', pct: 100, passed: true }] },
    notifications: [],
    graphView: 'list',
  };
  let { version } = await (await fetch(`${baseUrl}/api/state`)).json();
  assert.equal((await putState(family, `"v${version}"`)).status, 204);

  // Export: the full document plus exportedAt and taxonomyVersion (added by the client).
  const exported = { ...(await (await fetch(`${baseUrl}/api/state`)).json()), exportedAt: new Date().toISOString(), taxonomyVersion: 'v1' };
  const exportedText = JSON.stringify(exported, null, 2);

  // Something else overwrites the family data.
  version = exported.version;
  assert.equal((await putState({ students: [] }, `"v${version}"`)).status, 204);

  // Import: parse the file, drop export metadata, save with the current If-Match.
  const { version: _v, updatedAt: _u, exportedAt: _e, taxonomyVersion: _t, ...data } = JSON.parse(exportedText);
  const current = await fetch(`${baseUrl}/api/state`);
  const imported = await putState(data, current.headers.get('etag'));
  assert.equal(imported.status, 204);

  const restored = await (await fetch(`${baseUrl}/api/state`)).json();
  assert.equal(restored.version, version + 2);
  assert.deepEqual(withoutMeta(restored), family);
});

test('migrates a legacy state document without a version as version 0', async () => {
  const legacy = { students: [{ id: 'old', name: 'Legacy Learner', birthYear: 2016 }], activeStudentId: 'old' };
  await writeFile(join(dataDir, 'family-state.json'), JSON.stringify(legacy));

  const loaded = await fetch(`${baseUrl}/api/state`);
  assert.equal(loaded.headers.get('etag'), '"v0"');
  assert.deepEqual(await loaded.json(), { ...legacy, version: 0 });
  assert.equal((await putState(legacy, '"v1"')).status, 412);
  assert.equal((await putState(legacy, '"v0"')).status, 204);
  assert.equal((await (await fetch(`${baseUrl}/api/state`)).json()).version, 1);
});

test('persists lesson cache entries and recordings', async () => {
  const lesson = { title: 'Counting outdoors', activities: ['Gather ten leaves'] };
  const lessonId = encodeURIComponent('number/counting');
  const savedLesson = await fetch(`${baseUrl}/api/lessons/${lessonId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lesson),
  });
  assert.equal(savedLesson.status, 204);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/lessons/${lessonId}`)).json(), lesson);

  const topicLesson = { objective: 'count to five', duration: '20 minutes' };
  const topicKey = encodeURIComponent('topic:count-to-5');
  assert.equal((await fetch(`${baseUrl}/api/lessons/${topicKey}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(topicLesson),
  })).status, 204);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/lessons/${topicKey}`)).json(), topicLesson);

  const audio = new Uint8Array([1, 2, 3, 4]);
  const savedAudio = await fetch(`${baseUrl}/api/audio/recording-1.webm`, {
    method: 'PUT',
    headers: { 'Content-Type': 'audio/webm' },
    body: audio,
  });
  assert.equal(savedAudio.status, 204);
  const loadedAudio = await fetch(`${baseUrl}/api/audio/recording-1.webm`);
  assert.equal(loadedAudio.headers.get('content-type'), 'audio/webm');
  assert.deepEqual(new Uint8Array(await loadedAudio.arrayBuffer()), audio);
  assert.equal((await fetch(`${baseUrl}/api/audio/recording-1.webm`, { method: 'DELETE' })).status, 204);
  assert.equal((await fetch(`${baseUrl}/api/audio/recording-1.webm`)).status, 404);
});

test('rejects invalid writes and leaves AI disabled by default', async () => {
  const invalid = await fetch(`${baseUrl}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': '"v1"' },
    body: '[]',
  });
  assert.equal(invalid.status, 400);

  const tooLarge = await fetch(`${baseUrl}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': '"v1"' },
    body: JSON.stringify({ notes: 'x'.repeat(5 * 1024 * 1024) }),
  });
  assert.equal(tooLarge.status, 413);

  const ai = await fetch(`${baseUrl}/api/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [] }),
  });
  assert.equal(ai.status, 503);
  assert.match((await ai.json()).error, /not configured/i);
});

test('serves a cached Marble taxonomy file and rejects unknown names', async () => {
  const unknown = await fetch(`${baseUrl}/api/taxonomy/secret.json`);
  assert.equal(unknown.status, 404);

  const payload = { topics: [{ id: 'count-to-5', name: 'Count to 5' }] };
  await mkdir(join(dataDir, 'taxonomy'), { recursive: true });
  await writeFile(join(dataDir, 'taxonomy', 'topics.json'), JSON.stringify(payload));

  const cached = await fetch(`${baseUrl}/api/taxonomy/topics.json`);
  assert.equal(cached.status, 200);
  assert.deepEqual(await cached.json(), payload);

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal((await health.json()).taxonomyCached, true);
});
});

test('fetches an allowlisted taxonomy file from upstream and caches it on disk', async () => {
  const fixture = { topics: [{ id: 'count-to-5', name: 'Count to 5' }] };
  let upstreamHits = 0;
  const upstream = createServer((req, res) => {
    if (req.url === '/topics.json') {
      upstreamHits += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(fixture));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = upstream.address().port;
  const isolatedDir = await mkdtemp(join(tmpdir(), 'harrington-taxonomy-'));
  const isolated = spawn(process.execPath, ['server.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HARRINGTON_HOST: '127.0.0.1',
      HARRINGTON_PORT: '0',
      HARRINGTON_DATA_DIR: isolatedDir,
      HARRINGTON_TAXONOMY_UPSTREAM: `http://127.0.0.1:${upstreamPort}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    const isolatedUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('taxonomy server did not start')), 5000);
      let output = '';
      isolated.stdout.on('data', (chunk) => {
        output += chunk.toString();
        const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
        if (match) {
          clearTimeout(timer);
          resolve(`http://127.0.0.1:${match[1]}`);
        }
      });
      isolated.stderr.on('data', (chunk) => { output += chunk.toString(); });
      isolated.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`taxonomy server exited with ${code}: ${output}`));
      });
    });

    const first = await fetch(`${isolatedUrl}/api/taxonomy/topics.json`);
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), fixture);
    assert.equal(upstreamHits, 1);
    assert.deepEqual(JSON.parse(await readFile(join(isolatedDir, 'taxonomy', 'topics.json'), 'utf8')), fixture);

    const second = await fetch(`${isolatedUrl}/api/taxonomy/topics.json`);
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), fixture);
    assert.equal(upstreamHits, 1);

    const missing = await fetch(`${isolatedUrl}/api/taxonomy/manifest.json`);
    assert.equal(missing.status, 502);
  } finally {
    isolated.kill('SIGTERM');
    await new Promise((resolve) => isolated.once('exit', resolve));
    upstream.close();
    await rm(isolatedDir, { recursive: true, force: true });
  }
});

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function spawnHarrington(extraEnv = {}, { dir: existingDir = null } = {}) {
  const dir = existingDir || await mkdtemp(join(tmpdir(), 'harrington-ai-'));
  const proc = spawn(process.execPath, ['server.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HARRINGTON_HOST: '127.0.0.1',
      HARRINGTON_PORT: '0',
      HARRINGTON_DATA_DIR: dir,
      HARRINGTON_AI_BASE_URL: '',
      HARRINGTON_AI_MODEL: '',
      HARRINGTON_AI_API_KEY: '',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('AI test server did not start')), 5000);
    proc.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const match = output.match(/listening at http:\/\/[^\s:]+:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    proc.stderr.on('data', (chunk) => { output += chunk.toString(); });
    proc.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`AI test server exited with ${code}: ${output}`));
    });
  });
  return {
    url,
    dir,
    // Everything the server has printed so far.
    get output() { return output; },
    async stop() {
      proc.kill('SIGTERM');
      await new Promise((resolve) => proc.once('exit', resolve));
      await rm(dir, { recursive: true, force: true });
    },
  };
}

describe('OpenAI-compatible AI adapter', { concurrency: false }, () => {
  test('reports aiConfigured only when base URL and model are both set', async () => {
    const incomplete = await spawnHarrington({ HARRINGTON_AI_MODEL: 'llama3.2' });
    try {
      const health = await (await fetch(`${incomplete.url}/api/health`)).json();
      assert.equal(health.aiConfigured, false);
      const ai = await fetch(`${incomplete.url}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], model: 'gpt-4o-mini' }),
      });
      assert.equal(ai.status, 503);
    } finally {
      await incomplete.stop();
    }

    const urlOnly = await spawnHarrington({ HARRINGTON_AI_BASE_URL: 'http://127.0.0.1:9/v1' });
    try {
      assert.equal((await (await fetch(`${urlOnly.url}/api/health`)).json()).aiConfigured, false);
    } finally {
      await urlOnly.stop();
    }
  });

  test('forwards chat completions to the configured model and returns { content }', async () => {
    const captured = [];
    const upstream = createServer(async (req, res) => {
      const body = JSON.parse(await readRequestBody(req));
      captured.push({
        url: req.url,
        method: req.method,
        authorization: req.headers.authorization || null,
        body,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ message: { content: '{"objective":"count to five"}' } }],
      }));
    });
    await listen(upstream);
    const port = upstream.address().port;
    const harrington = await spawnHarrington({
      HARRINGTON_AI_BASE_URL: `http://127.0.0.1:${port}/v1/`,
      HARRINGTON_AI_MODEL: 'llama3.2',
      HARRINGTON_AI_API_KEY: 'test-family-key',
    });

    try {
      const health = await (await fetch(`${harrington.url}/api/health`)).json();
      assert.equal(health.aiConfigured, true);

      const ai = await fetch(`${harrington.url}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Write a lesson' }],
          capability: 'lesson',
          model: 'gpt-4o-mini',
        }),
      });
      assert.equal(ai.status, 200);
      assert.deepEqual(await ai.json(), { content: '{"objective":"count to five"}' });

      assert.equal(captured.length, 1);
      assert.equal(captured[0].method, 'POST');
      assert.equal(captured[0].url, '/v1/chat/completions');
      assert.equal(captured[0].authorization, 'Bearer test-family-key');
      assert.equal(captured[0].body.model, 'llama3.2');
      assert.deepEqual(captured[0].body.messages, [{ role: 'user', content: 'Write a lesson' }]);
      assert.notEqual(captured[0].body.model, 'gpt-4o-mini');

      const aliases = ['small', 'strong', 'gpt-4o', 'gpt-4o-mini'];
      for (const model of aliases) {
        const response = await fetch(`${harrington.url}/api/ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: model }],
            capability: 'explain',
            model,
          }),
        });
        assert.equal(response.status, 200);
      }
      assert.ok(captured.slice(1).every((entry) => entry.body.model === 'llama3.2'));
    } finally {
      await harrington.stop();
      upstream.close();
    }
  });

  test('accepts a request with no model field and uses HARRINGTON_AI_MODEL', async () => {
    const captured = [];
    const upstream = createServer(async (req, res) => {
      captured.push(JSON.parse(await readRequestBody(req)));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
    });
    await listen(upstream);
    const harrington = await spawnHarrington({
      HARRINGTON_AI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`,
      HARRINGTON_AI_MODEL: 'llama3.2',
    });

    try {
      // What the browser sends since HAR-26: the messages and their capability.
      const ai = await fetch(`${harrington.url}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Explain counting' }], capability: 'explain' }),
      });
      assert.equal(ai.status, 200);
      assert.deepEqual(await ai.json(), { content: 'ok' });
      assert.equal(captured.length, 1);
      assert.equal(captured[0].model, 'llama3.2');
      assert.deepEqual(captured[0].messages, [{ role: 'user', content: 'Explain counting' }]);
    } finally {
      await harrington.stop();
      upstream.close();
    }
  });

  test('keeps provider failures fail-closed without leaking secrets', async () => {
    const secret = 'sk-secret-SHOULD-NOT-LEAK';
    const upstream = createServer(async (req, res) => {
      await readRequestBody(req);
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `Invalid API key ${secret}` } }));
    });
    await listen(upstream);
    const harrington = await spawnHarrington({
      HARRINGTON_AI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`,
      HARRINGTON_AI_MODEL: 'llama3.2',
      HARRINGTON_AI_API_KEY: secret,
    });

    try {
      const ai = await fetch(`${harrington.url}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], capability: 'lesson', model: 'small' }),
      });
      assert.equal(ai.status, 502);
      const body = await ai.json();
      assert.match(body.error, /failed/i);
      assert.doesNotMatch(JSON.stringify(body), new RegExp(secret));
      assert.doesNotMatch(body.error, /sk-/);
    } finally {
      await harrington.stop();
      upstream.close();
    }
  });

  test('times out a hung provider with 504', async () => {
    const upstream = createServer(() => {});
    await listen(upstream);
    const harrington = await spawnHarrington({
      HARRINGTON_AI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`,
      HARRINGTON_AI_MODEL: 'llama3.2',
      HARRINGTON_AI_TIMEOUT_MS: '150',
    });

    try {
      const ai = await fetch(`${harrington.url}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], capability: 'lesson' }),
      });
      assert.equal(ai.status, 504);
      assert.match((await ai.json()).error, /timed out/i);
    } finally {
      await harrington.stop();
      upstream.close();
    }
  });
  test('HARRINGTON_AI_CAPABILITIES allows only the listed capabilities and health reports them', async () => {
    const captured = [];
    const upstream = createServer(async (req, res) => {
      captured.push(JSON.parse(await readRequestBody(req)));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: '{"objective":"ok"}' } }] }));
    });
    await listen(upstream);
    const harrington = await spawnHarrington({
      HARRINGTON_AI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`,
      HARRINGTON_AI_MODEL: 'llama3.2',
      // The plural a family is likely to type, plus a name that is not a capability.
      HARRINGTON_AI_CAPABILITIES: ' lessons , telepathy ',
    });
    const post = (body) => fetch(`${harrington.url}/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const messages = [{ role: 'user', content: 'hi' }];

    try {
      const health = await (await fetch(`${harrington.url}/api/health`)).json();
      assert.equal(health.aiConfigured, true);
      assert.deepEqual(health.aiCapabilities, ['lesson']);

      // Allowed.
      const allowed = await post({ messages, capability: 'lesson' });
      assert.equal(allowed.status, 200);
      assert.deepEqual(await allowed.json(), { content: '{"objective":"ok"}' });

      // Denied, with a message the browser reads as "not switched on".
      const denied = await post({ messages, capability: 'test' });
      assert.equal(denied.status, 403);
      const deniedBody = await denied.json();
      assert.match(deniedBody.error, /"test" AI capability is not switched on/);
      assert.equal(deniedBody.capability, 'test');

      // A missing, unknown or non-string capability is never trusted.
      for (const body of [{ messages }, { messages, capability: 'telepathy' }, { messages, capability: ['lesson'] }, { messages, capability: '' }]) {
        const response = await post(body);
        assert.equal(response.status, 403, JSON.stringify(body));
        assert.match((await response.json()).error, /must name a known capability/);
      }

      // Only the allowed request reached the provider, and without the capability field.
      assert.equal(captured.length, 1);
      assert.deepEqual(Object.keys(captured[0]).sort(), ['messages', 'model']);
    } finally {
      await harrington.stop();
      upstream.close();
    }
  });

  test('every capability is on by default, and none without a provider', async () => {
    const upstream = createServer(async (req, res) => {
      await readRequestBody(req);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
    });
    await listen(upstream);
    const harrington = await spawnHarrington({
      HARRINGTON_AI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`,
      HARRINGTON_AI_MODEL: 'llama3.2',
    });
    try {
      const health = await (await fetch(`${harrington.url}/api/health`)).json();
      assert.deepEqual(health.aiCapabilities, [...AI_CAPABILITIES]);
      for (const capability of AI_CAPABILITIES) {
        const response = await fetch(`${harrington.url}/api/ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], capability }),
        });
        assert.equal(response.status, 200, capability);
      }
    } finally {
      await harrington.stop();
      upstream.close();
    }

    // The list alone switches nothing on: no provider, no capabilities, still 503.
    const noProvider = await spawnHarrington({ HARRINGTON_AI_CAPABILITIES: 'lesson' });
    try {
      const health = await (await fetch(`${noProvider.url}/api/health`)).json();
      assert.equal(health.aiConfigured, false);
      assert.deepEqual(health.aiCapabilities, []);
      const response = await fetch(`${noProvider.url}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], capability: 'lesson' }),
      });
      assert.equal(response.status, 503);
    } finally {
      await noProvider.stop();
    }
  });
});

test('parseCapabilities reads a comma list, plural spellings and "all"', () => {
  assert.deepEqual(parseCapabilities(undefined).enabled, [...AI_CAPABILITIES]);
  assert.deepEqual(parseCapabilities('  ').enabled, [...AI_CAPABILITIES]);
  assert.deepEqual(parseCapabilities('ALL').enabled, [...AI_CAPABILITIES]);
  assert.deepEqual(parseCapabilities('lessons'), { enabled: ['lesson'], unknown: [] });
  assert.deepEqual(parseCapabilities('recall, Lesson,,quizzes'), { enabled: ['lesson', 'recall', 'quiz'], unknown: [] });
  assert.deepEqual(parseCapabilities('nothing-real'), { enabled: [], unknown: ['nothing-real'] });
});

describe('AI provider settings saved in the app', { concurrency: false }, () => {
  const KEY = 'sk-test-ABCDEFGH-family-key-9z8y';
  const json = (method, body, headers = {}) => ({
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // An OpenAI-compatible stub that records what it receives.
  async function provider(answer = (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
  }) {
    const seen = [];
    const server = createServer(async (req, res) => {
      seen.push({ url: req.url, authorization: req.headers.authorization || null, body: JSON.parse(await readRequestBody(req)) });
      answer(req, res);
    });
    await listen(server);
    return { seen, base: `http://127.0.0.1:${server.address().port}/v1`, close: () => server.close() };
  }

  test('save, read masked, use, and remove: stored values win over the environment', async () => {
    const upstream = await provider();
    const harrington = await spawnHarrington({
      HARRINGTON_AI_BASE_URL: 'http://127.0.0.1:9/v1',
      HARRINGTON_AI_MODEL: 'env-model',
      HARRINGTON_AI_API_KEY: 'env-key-0000-wxyz',
    });
    const secrets = join(harrington.dir, 'secrets.json');
    try {
      // Environment only: source "env", the key only as a hint.
      let settings = await (await fetch(`${harrington.url}/api/settings/ai`)).json();
      assert.deepEqual(
        { baseUrl: settings.baseUrl, model: settings.model, hasApiKey: settings.hasApiKey, apiKeyHint: settings.apiKeyHint, source: settings.source },
        { baseUrl: 'http://127.0.0.1:9/v1', model: 'env-model', hasApiKey: true, apiKeyHint: 'wxyz', source: { baseUrl: 'env', model: 'env', apiKey: 'env', timeoutMs: 'none', capabilities: 'none' } },
      );
      assert.ok(!JSON.stringify(settings).includes('env-key-0000'));
      assert.deepEqual(settings.presets.map((p) => p.id), ['ollama', 'gemini', 'custom']);
      assert.equal((await (await fetch(`${harrington.url}/api/health`)).json()).aiSource, 'env');

      // Save from the app: the URL is trimmed and loses its trailing slashes.
      const saved = await fetch(`${harrington.url}/api/settings/ai`, json('PUT', {
        baseUrl: `  ${upstream.base}// `, model: ' saved-model ', apiKey: ` ${KEY} `, capabilities: ['recall', 'lesson'], timeoutMs: 20_000,
      }));
      assert.equal(saved.status, 200);
      const savedText = await saved.text();
      assert.ok(!savedText.includes(KEY), 'the key is never returned');
      settings = JSON.parse(savedText);
      assert.equal(settings.baseUrl, upstream.base);
      assert.equal(settings.model, 'saved-model');
      assert.equal(settings.apiKeyHint, '9z8y');
      assert.deepEqual(settings.capabilities, ['lesson', 'recall']);
      assert.equal(settings.timeoutMs, 20_000);
      assert.deepEqual(settings.source, { baseUrl: 'app', model: 'app', apiKey: 'app', timeoutMs: 'app', capabilities: 'app' });

      // Owner-only, atomic, and in the documented shape.
      assert.equal((await stat(secrets)).mode & 0o777, 0o600);
      assert.deepEqual((await readdir(harrington.dir)).filter((name) => name.includes('.tmp')), []);
      const doc = JSON.parse(await readFile(secrets, 'utf8'));
      assert.equal(doc.schemaVersion, 1);
      assert.equal(doc.ai.apiKey, KEY);
      assert.ok(Number.isInteger(doc.ai.updatedAt));
      // Never inside the family document.
      assert.ok(!JSON.stringify(await (await fetch(`${harrington.url}/api/state`)).json()).includes(KEY));

      const health = await (await fetch(`${harrington.url}/api/health`)).json();
      assert.deepEqual([health.aiConfigured, health.aiSource, health.aiCapabilities], [true, 'app', ['lesson', 'recall']]);
      assert.ok(!JSON.stringify(health).includes(upstream.base) && !JSON.stringify(health).includes('saved-model'), 'health carries no URL or model');

      // /api/ai now uses the saved provider, key and capabilities, with no restart.
      const chat = (capability) => fetch(`${harrington.url}/api/ai`, json('POST', { messages: [{ role: 'user', content: 'hi' }], capability }));
      assert.equal((await chat('lesson')).status, 200);
      assert.equal((await chat('explain')).status, 403);
      assert.equal(upstream.seen.length, 1);
      assert.equal(upstream.seen[0].authorization, `Bearer ${KEY}`);
      assert.equal(upstream.seen[0].body.model, 'saved-model');

      // apiKey omitted keeps it; "" removes it and the environment's applies again.
      settings = await (await fetch(`${harrington.url}/api/settings/ai`, json('PUT', { model: 'other-model' }))).json();
      assert.deepEqual([settings.model, settings.apiKeyHint, settings.source.apiKey], ['other-model', '9z8y', 'app']);
      settings = await (await fetch(`${harrington.url}/api/settings/ai`, json('PUT', { apiKey: '' }))).json();
      assert.deepEqual([settings.apiKeyHint, settings.source.apiKey], ['wxyz', 'env']);

      // DELETE removes the file; the environment resumes.
      settings = await (await fetch(`${harrington.url}/api/settings/ai`, { method: 'DELETE' })).json();
      assert.deepEqual([settings.baseUrl, settings.model, settings.source.baseUrl], ['http://127.0.0.1:9/v1', 'env-model', 'env']);
      await assert.rejects(stat(secrets), { code: 'ENOENT' });
      assert.equal((await fetch(`${harrington.url}/api/settings/ai`, { method: 'DELETE' })).status, 200, 'deleting twice is fine');

      assert.ok(!harrington.output.includes(KEY), 'the key is never logged');
    } finally {
      await harrington.stop();
      upstream.close();
    }
  });

  test('PUT validates every field and changes nothing on a bad request', async () => {
    const harrington = await spawnHarrington();
    const put = (body, headers) => fetch(`${harrington.url}/api/settings/ai`, json('PUT', body, headers));
    try {
      assert.equal((await put({ baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.2' })).status, 200);
      const before = await readFile(join(harrington.dir, 'secrets.json'), 'utf8');
      const bad = [
        { baseUrl: 'ftp://example.test/v1' },
        { baseUrl: 'not a url' },
        { baseUrl: 42 },
        { baseUrl: 'https://user:pass@example.test/v1' },
        { model: '' , baseUrl: 'http://127.0.0.1:11434/v1' },
        { model: 'x'.repeat(201) },
        { apiKey: 'k'.repeat(513) },
        { apiKey: 'has a space' },
        { apiKey: 7 },
        { timeoutMs: 0 },
        { timeoutMs: 1.5 },
        { timeoutMs: '1000' },
        { capabilities: ['telepathy'] },
        { capabilities: 'lesson' },
        { endpoint: 'http://x' },
      ];
      for (const body of bad) {
        const response = await put(body);
        assert.equal(response.status, 400, JSON.stringify(body));
        assert.ok((await response.json()).error);
      }
      assert.equal((await put({ model: 'x' }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
      const plain = await fetch(`${harrington.url}/api/settings/ai`, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: '{"model":"x"}' });
      assert.equal(plain.status, 415);
      assert.equal((await fetch(`${harrington.url}/api/settings/ai`, { method: 'DELETE', headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
      assert.equal(await readFile(join(harrington.dir, 'secrets.json'), 'utf8'), before);

      // A 512-character key and an empty capability list are fine; null clears.
      assert.equal((await put({ apiKey: 'k'.repeat(512), capabilities: [] })).status, 200);
      const health = await (await fetch(`${harrington.url}/api/health`)).json();
      assert.deepEqual([health.aiConfigured, health.aiCapabilities], [true, []]);
      const cleared = await (await put({ capabilities: null, apiKey: null })).json();
      assert.equal(cleared.capabilities.length, AI_CAPABILITIES.length);
      assert.equal(cleared.hasApiKey, false);
      // A short key has no hint.
      assert.equal((await (await put({ apiKey: 'abc12' })).json()).apiKeyHint, null);
    } finally {
      await harrington.stop();
    }
  });

  test('the connection test sends no learner data and never echoes the key or the provider body', async () => {
    const upstream = await provider((req, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `Incorrect API key provided: ${KEY}` } }));
    });
    const harrington = await spawnHarrington();
    const testIt = () => fetch(`${harrington.url}/api/settings/ai/test`, { method: 'POST' });
    try {
      assert.deepEqual(await (await testIt()).json(), { ok: false, latencyMs: 0, error: 'not configured' });

      await fetch(`${harrington.url}/api/settings/ai`, json('PUT', { baseUrl: upstream.base, model: 'm', apiKey: KEY }));
      const response = await testIt();
      const text = await response.text();
      assert.equal(response.status, 200);
      assert.ok(!text.includes(KEY) && !text.includes('Incorrect'), text);
      const result = JSON.parse(text);
      assert.deepEqual({ ...result, latencyMs: typeof result.latencyMs }, { ok: false, status: 401, error: 'provider error', latencyMs: 'number' });
      assert.deepEqual(upstream.seen[0].body, { model: 'm', messages: [{ role: 'user', content: 'Reply with the single word OK.' }] });
      assert.equal((await fetch(`${harrington.url}/api/settings/ai/test`, { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
      assert.ok(!harrington.output.includes(KEY), 'the key is never logged');
    } finally {
      await harrington.stop();
      upstream.close();
    }

    const working = await provider();
    const ok = await spawnHarrington({ HARRINGTON_AI_BASE_URL: working.base, HARRINGTON_AI_MODEL: 'm' });
    try {
      const result = await (await fetch(`${ok.url}/api/settings/ai/test`, { method: 'POST' })).json();
      assert.equal(result.ok, true);
      assert.ok(Number.isInteger(result.latencyMs));
    } finally {
      await ok.stop();
      working.close();
    }
  });

  test('an unreadable secrets file acts as empty and is logged once without its content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'harrington-ai-'));
    await writeFile(join(dir, 'secrets.json'), '{ "ai": { "apiKey": "MARKER-should-not-print" ');
    const harrington = await spawnHarrington({ HARRINGTON_AI_BASE_URL: 'http://127.0.0.1:9/v1', HARRINGTON_AI_MODEL: 'env-model' }, { dir });
    try {
      for (let i = 0; i < 3; i += 1) {
        const settings = await (await fetch(`${harrington.url}/api/settings/ai`)).json();
        assert.deepEqual([settings.model, settings.source.model, settings.hasApiKey], ['env-model', 'env', false]);
      }
      assert.equal(harrington.output.match(/is not valid JSON/g)?.length, 1);
      assert.ok(!harrington.output.includes('MARKER'));
    } finally {
      await harrington.stop();
    }
  });
});

test('npm run backup leaves secrets.json out of the archive', async () => {
  const work = await mkdtemp(join(tmpdir(), 'harrington-backup-'));
  try {
    const dataDir = join(work, 'private');
    await mkdir(join(dataDir, 'lessons'), { recursive: true });
    await writeFile(join(dataDir, 'family-state.json'), '{"version":1}');
    await writeFile(join(dataDir, 'lessons', 'a.json'), '{}');
    await writeFile(join(dataDir, 'secrets.json'), '{"schemaVersion":1,"ai":{"apiKey":"sk-backup-test"}}');
    const run = spawnSync(process.execPath, ['scripts/backup.mjs'], {
      cwd: repoRoot,
      env: { ...process.env, HARRINGTON_DATA_DIR: dataDir, HARRINGTON_BACKUP_DIR: join(work, 'backups') },
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    const [archive] = await readdir(join(work, 'backups'));
    const listing = spawnSync('tar', ['-tzf', join(work, 'backups', archive)], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
    assert.ok(listing.some((name) => name.endsWith('private/family-state.json')), listing.join('\n'));
    assert.ok(listing.some((name) => name.endsWith('private/lessons/a.json')));
    assert.ok(!listing.some((name) => name.includes('secrets.json')), listing.join('\n'));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test('isLoopbackAddress accepts only this computer', () => {
  for (const address of ['127.0.0.1', '127.8.9.10', '::1', '0:0:0:0:0:0:0:1', '::ffff:127.0.0.1', '::FFFF:127.0.0.2']) {
    assert.equal(isLoopbackAddress(address), true, address);
  }
  for (const address of ['192.168.1.20', '10.0.0.1', '100.64.0.7', '::ffff:192.168.1.20', 'fe80::1', '::', '0.0.0.0', '128.0.0.1', '', undefined, null, '127.0.0.1.evil']) {
    assert.equal(isLoopbackAddress(address), false, String(address));
  }
});

describe('AI provider settings from another device', { concurrency: false }, () => {
  // Another device on the network: this computer's own non-loopback address.
  const lanAddress = Object.values(networkInterfaces()).flat()
    .find((entry) => entry && entry.family === 'IPv4' && !entry.internal)?.address;

  test('without an access token, only this computer can change or test the provider', { skip: !lanAddress && 'no non-loopback IPv4 interface here' }, async () => {
    const harrington = await spawnHarrington({ HARRINGTON_HOST: '0.0.0.0' });
    const port = new URL(harrington.url).port;
    const remote = `http://${lanAddress}:${port}`;
    const local = `http://127.0.0.1:${port}`;
    const put = (base, headers = {}) => fetch(`${base}/api/settings/ai`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ baseUrl: 'http://attacker.test/v1', model: 'm' }),
    });
    try {
      // Reading stays allowed (it never carries the key) and says it is read-only here.
      const view = await (await fetch(`${remote}/api/settings/ai`)).json();
      assert.equal(view.canChange, false);

      const LOCAL_ONLY = 'AI provider settings can only be changed from the computer running Harrington until an access token is set';
      for (const response of [
        await put(remote),
        // A forged header changes nothing: the socket address decides.
        await put(remote, { 'X-Forwarded-For': '127.0.0.1' }),
        await fetch(`${remote}/api/settings/ai`, { method: 'DELETE' }),
        await fetch(`${remote}/api/settings/ai/test`, { method: 'POST' }),
      ]) {
        assert.equal(response.status, 403);
        assert.deepEqual(await response.json(), { error: LOCAL_ONLY });
      }
      await assert.rejects(stat(join(harrington.dir, 'secrets.json')), { code: 'ENOENT' });

      // The same server, from this computer.
      const saved = await put(local);
      assert.equal(saved.status, 200);
      assert.equal((await saved.json()).canChange, true);
      assert.equal((await (await fetch(`${remote}/api/health`)).json()).aiConfigured, true);
    } finally {
      await harrington.stop();
    }
  });
});

// HAR-25 restructures /api/health; whatever its shape, a configured provider
// must still show as aiConfigured, or every AI control quietly turns off.
test('health reports aiConfigured, aiSource and aiCapabilities when a provider is configured', async () => {
  const fromEnv = await spawnHarrington({ HARRINGTON_AI_BASE_URL: 'http://127.0.0.1:9/v1', HARRINGTON_AI_MODEL: 'm', HARRINGTON_AI_CAPABILITIES: 'lesson' });
  try {
    const health = await (await fetch(`${fromEnv.url}/api/health`)).json();
    assert.equal(health.aiConfigured, true);
    assert.equal(health.aiSource, 'env');
    assert.deepEqual(health.aiCapabilities, ['lesson']);

    await fetch(`${fromEnv.url}/api/settings/ai`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseUrl: 'http://127.0.0.1:8/v1', model: 'n' }) });
    const after = await (await fetch(`${fromEnv.url}/api/health`)).json();
    assert.equal(after.aiConfigured, true);
    assert.equal(after.aiSource, 'app');
  } finally {
    await fromEnv.stop();
  }
});
