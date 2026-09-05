import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';

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
    taxonomyCached: false,
  });

  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>Harrington/);
});

test('persists family state on the Harrington server', async () => {
  const state = {
    students: [{ id: 'student-1', name: 'Sample Learner', birthYear: 2018 }],
    activeStudentId: 'student-1',
    progress: { 'student-1': { counting: { status: 'learning' } } },
  };

  const saved = await fetch(`${baseUrl}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
  assert.equal(saved.status, 204);

  const loaded = await fetch(`${baseUrl}/api/state`);
  assert.equal(loaded.status, 200);
  assert.deepEqual(await loaded.json(), state);
  assert.deepEqual(JSON.parse(await readFile(join(dataDir, 'family-state.json'), 'utf8')), state);
});

test('keeps concurrent family-state writes as complete snapshots', async () => {
  const snapshots = Array.from({ length: 12 }, (_, index) => ({
    students: [{ id: `student-${index}`, name: `Learner ${index}`, birthYear: 2010 + index }],
    activeStudentId: `student-${index}`,
    progress: { [`student-${index}`]: { counting: { status: 'learning', sequence: index } } },
  }));

  const responses = await Promise.all(snapshots.map((snapshot) => fetch(`${baseUrl}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot),
  })));
  responses.forEach((response) => assert.equal(response.status, 204));

  const loaded = await (await fetch(`${baseUrl}/api/state`)).json();
  const saved = JSON.parse(await readFile(join(dataDir, 'family-state.json'), 'utf8'));
  assert.ok(snapshots.some((snapshot) => isDeepStrictEqual(loaded, snapshot)));
  assert.deepEqual(saved, loaded);
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
    headers: { 'Content-Type': 'application/json' },
    body: '[]',
  });
  assert.equal(invalid.status, 400);

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

async function spawnHarrington(extraEnv = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'harrington-ai-'));
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
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('AI test server did not start')), 5000);
    let output = '';
    proc.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
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
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], model: 'small' }),
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
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
      });
      assert.equal(ai.status, 504);
      assert.match((await ai.json()).error, /timed out/i);
    } finally {
      await harrington.stop();
      upstream.close();
    }
  });
});
