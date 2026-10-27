// Teaching guides: the server-side split of Marble's teaching research, the
// routes that serve it one topic at a time, and the browser-side curation.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import {
  readResearchIndex, readResearchRecord, sha256, splitTeachingResearch, validTopicId,
} from '../lib/teaching-research.mjs';
import { GUIDE_ATTRIBUTION, curateResearch } from '../src/js/teaching.js';

const repoRoot = new URL('..', import.meta.url);
const dirs = [];
after(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));
async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'harrington-research-'));
  dirs.push(dir);
  return dir;
}

// A record shaped like the published ones (fields trimmed, values invented).
function record(topicId, extra = {}) {
  return {
    topicId,
    pedagogy: { summary: '- **Age:** 5', bestPractices: ['Touch each one'] },
    learn: {
      schemaVersion: 2,
      summary: 'Children pair each object with one number word.',
      activities: [{
        title: 'Feed the squirrel',
        learnerActions: ['Count five acorns', 'Move each one as you say its number'],
        intendedInsight: 'One word per object.',
        feedback: ['If they skip one, slow down and touch each acorn.'],
        rationale: 'internal',
        sourceClaims: ['claim'],
      }],
      constraints: ['internal'],
      reviewNotes: ['internal'],
    },
    assess: {
      method: 'two_tier',
      poeTask: null,
      probeDeeper: ['What if you start from the other end?'],
      correctAnswer: 'Six buttons.',
      errorPatterns: [{ kind: 'misconception', pattern: 'Counts one twice', revealedBy: 'Says seven', nextMove: 'Slide each one aside', reteachPrerequisiteId: 'mt_prereqAAAA' }],
      responseLevels: { gap: 'Accepts seven', partial: 'Sees the error', full: 'Finds the button' },
      diagnosticPrompt: 'Watch Teddy count these six buttons. Is he right?',
      whatMakesItDiscriminate: 'internal',
    },
    sources: [
      { claim: 'c', source: 'A curriculum', url: 'https://example.org/curriculum', verified: true },
      { claim: 'c2', source: 'Same link again', url: 'https://example.org/curriculum', verified: true },
      { claim: 'c3', source: 'Not a web link', url: 'javascript:alert(1)', verified: true },
    ],
    confidence: 'high',
    provenance: { originalResearchGeneratedBy: 'agent' },
    publicationNotes: {},
    ...extra,
  };
}

function researchFile(records) {
  return Buffer.from(JSON.stringify({ schemaVersion: 1, version: 'v1', recordCount: records.length, records }));
}

describe('splitTeachingResearch', () => {
  test('writes one file per topic and an index, and refuses bad ids', async () => {
    const dir = await tempDir();
    const source = researchFile([
      record('mt_countAAAA1'),
      record('mt_countBBBB2'),
      record('../escape'),
      record('mt_bad/slash'),
      record('mt_countAAAA1'), // a duplicate is skipped
      { notARecord: true },
    ]);
    const index = await splitTeachingResearch(source, dir);
    assert.equal(index.sourceSha256, sha256(source));
    assert.deepEqual(index.topicIds, ['mt_countAAAA1', 'mt_countBBBB2']);
    assert.equal(index.recordCount, 2);
    assert.equal(index.skipped, 4);
    assert.deepEqual((await readdir(join(dir, 'research'))).sort(), ['index.json', 'mt_countAAAA1.json', 'mt_countBBBB2.json']);
    // Nothing was written outside the research directory.
    assert.deepEqual((await readdir(dir)).sort(), ['research']);
    const stored = JSON.parse(await readFile(join(dir, 'research', 'mt_countAAAA1.json'), 'utf8'));
    assert.deepEqual(stored, record('mt_countAAAA1'));
  });

  test('is idempotent for the same bytes and replaces the split for new ones', async () => {
    const dir = await tempDir();
    const first = researchFile([record('mt_countAAAA1'), record('mt_countBBBB2')]);
    await splitTeachingResearch(first, dir);
    // A marker file inside the split survives a second run of the same bytes.
    await writeFile(join(dir, 'research', 'marker'), 'x');
    const again = await splitTeachingResearch(first, dir);
    assert.deepEqual(again.topicIds, ['mt_countAAAA1', 'mt_countBBBB2']);
    assert.equal(await readFile(join(dir, 'research', 'marker'), 'utf8'), 'x');

    const second = researchFile([record('mt_countCCCC3')]);
    const index = await splitTeachingResearch(second, dir);
    assert.deepEqual(index.topicIds, ['mt_countCCCC3']);
    assert.deepEqual((await readdir(join(dir, 'research'))).sort(), ['index.json', 'mt_countCCCC3.json']);
    assert.deepEqual(await readResearchIndex(dir), index);
    // No staging directory is left behind.
    assert.deepEqual((await readdir(dir)).sort(), ['research']);
  });

  test('rejects a file without records and leaves no staging directory', async () => {
    const dir = await tempDir();
    await assert.rejects(splitTeachingResearch(Buffer.from('{"records":null}'), dir), /no records/);
    await assert.rejects(splitTeachingResearch(Buffer.from('not json'), dir));
    assert.deepEqual(await readdir(dir), []);
    assert.equal(await readResearchIndex(dir), null);
  });

  test('readResearchRecord validates the id before touching the filesystem', async () => {
    const dir = await tempDir();
    await splitTeachingResearch(researchFile([record('mt_countAAAA1')]), dir);
    assert.ok(await readResearchRecord(dir, 'mt_countAAAA1'));
    assert.equal(await readResearchRecord(dir, 'mt_missingAAA'), null);
    for (const bad of ['../index', 'index', 'mt_', 'mt_a/../../x', 'mt_aaaa.json', '', null]) {
      assert.equal(validTopicId(bad), false, String(bad));
      await assert.rejects(readResearchRecord(dir, bad), (err) => err.statusCode === 400);
    }
  });
});

describe('curateResearch', () => {
  test('keeps what a parent uses and drops internal metadata', () => {
    const guide = curateResearch(record('mt_countAAAA1'));
    assert.deepEqual(guide, {
      topicId: 'mt_countAAAA1',
      summary: 'Children pair each object with one number word.',
      activities: [{
        title: 'Feed the squirrel',
        steps: ['Count five acorns', 'Move each one as you say its number'],
        insight: 'One word per object.',
        feedback: ['If they skip one, slow down and touch each acorn.'],
      }],
      check: {
        method: 'Predict, then explain',
        task: '',
        prompt: 'Watch Teddy count these six buttons. Is he right?',
        answer: 'Six buttons.',
        followUps: ['What if you start from the other end?'],
        errors: [{ pattern: 'Counts one twice', signs: 'Says seven', nextMove: 'Slide each one aside', reteachId: 'mt_prereqAAAA' }],
        levels: [
          { key: 'gap', label: 'Not yet', text: 'Accepts seven' },
          { key: 'partial', label: 'Getting there', text: 'Sees the error' },
          { key: 'full', label: 'Got it', text: 'Finds the button' },
        ],
      },
      // Duplicate and non-web links are dropped.
      sources: [{ name: 'A curriculum', url: 'https://example.org/curriculum' }],
    });
    const text = JSON.stringify(guide);
    for (const internal of ['internal', 'confidence', 'provenance', 'agent', 'claim']) {
      assert.ok(!text.includes(internal), internal);
    }
  });

  test('copes with missing and oddly shaped fields', () => {
    assert.equal(curateResearch(null), null);
    assert.equal(curateResearch({ topicId: 'mt_x', learn: {}, assess: {} }), null);
    const guide = curateResearch({
      topicId: 'mt_countAAAA1',
      learn: { summary: '  Only a summary.  ', activities: [{ title: '' }, { title: 'No steps' }, 'nonsense'] },
      assess: { method: 'unknown_method', poeTask: { odd: true }, errorPatterns: [{}], responseLevels: [] },
      sources: 'nope',
    });
    assert.deepEqual(guide, { topicId: 'mt_countAAAA1', summary: 'Only a summary.', activities: [], check: null, sources: [] });
  });

  test('the attribution names Marble and the license', () => {
    assert.match(GUIDE_ATTRIBUTION, /Marble Skill Taxonomy teaching research · © Generative Spark, Inc\. \(Marble\) · CC BY-SA 4\.0/);
  });
});

// ---- The server routes ----
async function startServer(env) {
  const dataDir = await tempDir();
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HARRINGTON_HOST: '127.0.0.1',
      HARRINGTON_PORT: '0',
      HARRINGTON_DATA_DIR: dataDir,
      HARRINGTON_ACCESS_TOKEN: '',
      HARRINGTON_PUBLISHED_HOST: '',
      HARRINGTON_ALLOWED_HOSTS: '',
      HARRINGTON_AI_BASE_URL: '',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const url = await new Promise((resolve, reject) => {
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
  const stop = async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
    }
  };
  return { url, dataDir, stop };
}

async function fakeUpstream(body) {
  const hits = [];
  const server = createServer((req, res) => {
    hits.push(req.url);
    if (req.url === '/teaching-research.json' && body) {
      // Slow enough that concurrent first requests overlap.
      setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(body); }, 100);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, hits, close: () => server.close() };
}

describe('research routes', { concurrency: false }, () => {
  test('downloads once, splits once, and serves one topic at a time', async () => {
    const upstream = await fakeUpstream(researchFile([record('mt_countAAAA1'), record('mt_countBBBB2')]));
    const app = await startServer({ HARRINGTON_TAXONOMY_UPSTREAM: upstream.url });
    try {
      // Concurrent first requests share one download.
      const [a, b, list] = await Promise.all([
        fetch(`${app.url}/api/taxonomy/research/mt_countAAAA1`),
        fetch(`${app.url}/api/taxonomy/research/mt_countBBBB2`),
        fetch(`${app.url}/api/taxonomy/research`),
      ]);
      assert.equal(a.status, 200);
      assert.deepEqual(await a.json(), record('mt_countAAAA1'));
      assert.equal(b.status, 200);
      assert.deepEqual(await list.json(), { topicIds: ['mt_countAAAA1', 'mt_countBBBB2'] });
      assert.deepEqual(upstream.hits, ['/teaching-research.json']);

      assert.equal((await fetch(`${app.url}/api/taxonomy/research/mt_missingAAA`)).status, 404);
      assert.equal((await fetch(`${app.url}/api/taxonomy/research/..%2F..%2Ffamily-state`)).status, 400);
      assert.equal((await fetch(`${app.url}/api/taxonomy/research/index`)).status, 400);
      // The whole file is never served, though it sits in the cache.
      assert.equal((await fetch(`${app.url}/api/taxonomy/teaching-research.json`)).status, 404);
      assert.ok((await readdir(join(app.dataDir, 'taxonomy'))).includes('teaching-research.json'));
      assert.deepEqual(upstream.hits, ['/teaching-research.json']);
    } finally {
      await app.stop();
    }
    // A restart reuses the split on disk: no second download.
    const again = await startServer({ HARRINGTON_DATA_DIR: app.dataDir, HARRINGTON_TAXONOMY_UPSTREAM: upstream.url });
    try {
      assert.equal((await fetch(`${again.url}/api/taxonomy/research/mt_countBBBB2`)).status, 200);
      assert.deepEqual(upstream.hits, ['/teaching-research.json']);
    } finally {
      await again.stop();
      upstream.close();
    }
  });

  test('an upstream failure answers 502 and is retried on the next request', async () => {
    const upstream = await fakeUpstream(null);
    const app = await startServer({ HARRINGTON_TAXONOMY_UPSTREAM: upstream.url });
    try {
      assert.equal((await fetch(`${app.url}/api/taxonomy/research/mt_countAAAA1`)).status, 502);
      assert.equal((await fetch(`${app.url}/api/taxonomy/research`)).status, 502);
      assert.equal(upstream.hits.length, 2);
    } finally {
      await app.stop();
      upstream.close();
    }
  });

  test('the research routes need the access token like the other taxonomy routes', async () => {
    const dataDir = await tempDir();
    await mkdir(join(dataDir, 'taxonomy'), { recursive: true });
    await splitTeachingResearch(researchFile([record('mt_countAAAA1')]), join(dataDir, 'taxonomy'));
    const app = await startServer({ HARRINGTON_DATA_DIR: dataDir, HARRINGTON_ACCESS_TOKEN: 'a-long-enough-family-token' });
    try {
      assert.equal((await fetch(`${app.url}/api/taxonomy/research`)).status, 401);
      assert.equal((await fetch(`${app.url}/api/taxonomy/research/mt_countAAAA1`)).status, 401);
      assert.equal((await fetch(`${app.url}/api/taxonomy/research/..%2Fsecrets`)).status, 401);
    } finally {
      await app.stop();
    }
  });
});
