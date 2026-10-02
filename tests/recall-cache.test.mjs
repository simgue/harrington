import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

// Recall cards round-trip through the real server.mjs (which only accepts JSON
// objects) with a stub OpenAI-compatible provider that counts calls.
const repoRoot = new URL('..', import.meta.url);
let child, provider, dataDir, baseUrl;
let providerCalls = 0;
const CARDS = { cards: [{ front: 'What comes after 3?', back: '4', hint: 'Count on' }, { front: 'What comes after 9?', back: '10' }] };

before(async () => {
  provider = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      providerCalls++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(CARDS) } }] }));
    });
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));

  dataDir = await mkdtemp(join(tmpdir(), 'harrington-recall-'));
  child = spawn(process.execPath, ['server.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HARRINGTON_HOST: '127.0.0.1',
      HARRINGTON_PORT: '0',
      HARRINGTON_DATA_DIR: dataDir,
      HARRINGTON_AI_BASE_URL: `http://127.0.0.1:${provider.address().port}`,
      HARRINGTON_AI_MODEL: 'stub',
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
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited with ${code}: ${output}`)); });
  });
  // The browser modules use same-origin paths.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (path, options) => realFetch(String(path).startsWith('/') ? baseUrl + path : path, options);
});

after(async () => {
  child?.kill();
  await new Promise(resolve => provider?.close(resolve));
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

const topic = { id: 'recall-topic', name: 'Counting on', subject: 'Mathematics', domain: 'Number', ageRangeStart: 5, ageRangeEnd: 6 };

test('recall cards are saved as an object and a second session reads them without an AI call', async () => {
  const store = await import('../src/js/store.js');
  const { cardsForTopic } = await import('../src/js/views/recall.js');
  await store.connect();
  assert.equal(store.aiAvailable(), true);

  const first = await cardsForTopic(topic);
  assert.equal(providerCalls, 1);
  assert.deepEqual(first.map(c => c.front), CARDS.cards.map(c => c.front));
  assert.equal(first[0].id, 'recall-topic::0');

  const stored = await (await fetch('/api/lessons/recall%3Arecall-topic')).json();
  assert.ok(!Array.isArray(stored) && Array.isArray(stored.cards), 'stored as { cards }');

  // A new session: nothing in memory, the provider is not asked again.
  store.forgetCachedLessons();
  const second = await cardsForTopic(topic);
  assert.equal(providerCalls, 1);
  assert.deepEqual(second, first);
});

test('a legacy bare-array recall cache still reads', async () => {
  const store = await import('../src/js/store.js');
  const { cardsForTopic } = await import('../src/js/views/recall.js');
  const legacy = [{ id: 'legacy::0', front: 'Two and two?', back: 'Four' }];
  // Write where server.mjs looks for the key, whatever its data layout.
  const path = await lessonFilePath('recall:legacy');
  await writeFile(path, JSON.stringify(legacy));
  store.forgetCachedLessons();
  const before = providerCalls;
  const cards = await cardsForTopic({ ...topic, id: 'legacy' });
  assert.deepEqual(cards, legacy);
  assert.equal(providerCalls, before);
});

// Find the file the server wrote for a known key, and derive the one for `key`.
async function lessonFilePath(key) {
  const known = Buffer.from('recall:recall-topic', 'utf8').toString('base64url') + '.json';
  const stack = [dataDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) stack.push(join(dir, entry.name));
      else if (entry.name === known) return join(dir, Buffer.from(key, 'utf8').toString('base64url') + '.json');
    }
  }
  throw new Error('lesson cache directory not found');
}
