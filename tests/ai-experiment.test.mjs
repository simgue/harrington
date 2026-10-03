import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { ExperimentError, parseArgs, runExperiment } from '../scripts/ai-experiment.mjs';

// A tiny OpenAI-compatible endpoint. It reports usage, answers the lesson
// prompt for "Letter sounds" with prose once (so the script retries), and
// answers "Blend words" with JSON that fails the HAR-20 lesson check every time.
const LESSON = {
  objective: 'Count five objects.',
  materials: ['five spoons'],
  teach: [{ title: 'Touch and count', say: 'Touch each spoon as we count.', do: 'Line up the spoons.' }],
  questions: ['How many spoons?'],
};
const requests = [];
let proseLeft = 1;
const upstream = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  requests.push({ url: req.url, authorization: req.headers.authorization || null, body });
  const prompt = body.messages.map((m) => m.content).join('\n');
  let content = JSON.stringify(LESSON);
  if (prompt.includes('"Letter sounds"') && proseLeft > 0) { proseLeft -= 1; content = 'Sure! Here is a lesson about letter sounds.'; }
  if (prompt.includes('"Blend words"')) content = JSON.stringify({ objective: 'x', teach: [], materials: 'paper' });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 40 } }));
});

const NOW = new Date('2026-10-07T10:30:00');
const LEARNER = 'Zebulon Quixote';
const LEAK = /zebulon|quixote|sample nine/i;
const topic = (id, name, subject, domain) => ({ id, name, subject, domain, ageRangeStart: 5, ageRangeEnd: 6, description: `About ${name}.`, evidence: [] });
const TOPICS = [
  topic('count-5', 'Count to 5', 'Mathematics', 'Counting & Cardinality'),
  topic('add-1', 'Add one more', 'Mathematics', 'Addition & Subtraction'),
  topic('letter-sounds', 'Letter sounds', 'English', 'Phonics & Word Reading'),
  topic('blend', 'Blend words', 'English', 'Phonics & Word Reading'),
  topic('mastered-one', 'Already mastered', 'Mathematics', 'Counting & Cardinality'),
];

let dataDir;
let env;
before(async () => {
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  dataDir = await mkdtemp(join(tmpdir(), 'harrington-experiment-'));
  await mkdir(join(dataDir, 'taxonomy'), { recursive: true });
  await writeFile(join(dataDir, 'taxonomy', 'topics.json'), JSON.stringify({ topics: TOPICS }));
  await writeFile(join(dataDir, 'taxonomy', 'dependencies.json'), JSON.stringify({ dependencies: [] }));
  await writeFile(join(dataDir, 'taxonomy', 'clusters.json'), JSON.stringify({ clusters: [] }));
  await writeFile(join(dataDir, 'family-state.json'), JSON.stringify({
    version: 3,
    students: [
      { id: 's_z', name: LEARNER, birthYear: 2020 },
      { id: 's_s', name: 'Sample Nine', birthYear: 2018 },
    ],
    progress: { s_z: { 'mastered-one': { status: 'mastered', updatedAt: 1 } } },
  }));
  env = {
    HARRINGTON_AI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1/`,
    HARRINGTON_AI_MODEL: 'tiny-model',
    HARRINGTON_AI_API_KEY: 'stub-key',
    HARRINGTON_AI_CAPABILITIES: 'lessons',
    // The taxonomy comes from the data dir; nothing listens here.
    HARRINGTON_TAXONOMY_UPSTREAM: 'http://127.0.0.1:9/never',
  };
});
after(async () => {
  upstream.close();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

test('refuses to run unless lessons are switched on', async () => {
  for (const capabilities of ['recall', 'test,printables', 'nonsense']) {
    await assert.rejects(
      runExperiment({ env: { ...env, HARRINGTON_AI_CAPABILITIES: capabilities }, dataDir, learner: LEARNER, out: join(dataDir, 'never.md'), now: NOW }),
      (err) => err instanceof ExperimentError && /do not include lessons/.test(err.message),
    );
  }
  assert.equal(requests.length, 0, 'nothing reached the endpoint');
});

test('uses the provider saved under Settings > AI provider over the environment', async () => {
  // Saved in another data dir (the family's), as server.mjs writes it.
  const settingsDir = await mkdtemp(join(tmpdir(), 'harrington-experiment-settings-'));
  try {
    await writeFile(join(settingsDir, 'secrets.json'), JSON.stringify({
      schemaVersion: 1,
      ai: { baseUrl: env.HARRINGTON_AI_BASE_URL, model: 'saved-model', apiKey: 'saved-key-1234', capabilities: ['lesson'] },
    }));
    requests.length = 0;
    const blankEnv = { HARRINGTON_AI_CAPABILITIES: 'recall', HARRINGTON_TAXONOMY_UPSTREAM: env.HARRINGTON_TAXONOMY_UPSTREAM };
    const { report } = await runExperiment({ env: blankEnv, dataDir, settingsDir, learner: LEARNER, topicIds: ['count-5'], save: false, out: join(dataDir, 'report', 'saved.md'), now: NOW });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.model, 'saved-model');
    assert.equal(requests[0].authorization, 'Bearer saved-key-1234');
    assert.match(report, /\| Model \| saved-model \|/);
    assert.doesNotMatch(report, /saved-key/, 'the report never carries the key');

    // Without a provider anywhere, it says how to set one up.
    await assert.rejects(runExperiment({ env: {}, dataDir, learner: LEARNER, out: join(dataDir, 'never.md'), now: NOW }), /No AI provider is set up/);
  } finally {
    await rm(settingsDir, { recursive: true, force: true });
  }
});

test('writes the report for the learner\'s daily-choice topics, with retries, usage and blank rating columns', async () => {
  requests.length = 0;
  const out = join(dataDir, 'report', '2026-10-07-lessons.md');
  const { rows, report } = await runExperiment({ env, dataDir, learner: 'zebulon quixote', count: 10, retries: 1, out, now: NOW });

  // The four unmastered topics; the mastered one is skipped.
  assert.deepEqual(rows.map((r) => r.topicId).sort(), ['add-1', 'blend', 'count-5', 'letter-sounds']);
  const byId = Object.fromEntries(rows.map((r) => [r.topicId, r]));
  assert.deepEqual([byId['count-5'].attempts, byId['count-5'].valid, byId['count-5'].jsonValid], [1, true, true]);
  // Prose first, then a lesson: one retry, tokens summed over both attempts.
  assert.deepEqual([byId['letter-sounds'].attempts, byId['letter-sounds'].valid], [2, true]);
  assert.equal(byId['letter-sounds'].promptTokens, 200);
  assert.equal(byId['letter-sounds'].completionTokens, 80);
  // Valid JSON that fails the lesson check, on both attempts.
  assert.deepEqual([byId.blend.attempts, byId.blend.jsonValid, byId.blend.valid], [2, true, false]);
  assert.match(byId.blend.error, /lesson check/);

  // The endpoint saw the app's lesson prompt, the configured model and key, and no names.
  assert.equal(requests.length, 6);
  for (const request of requests) {
    assert.equal(request.url, '/v1/chat/completions');
    assert.equal(request.authorization, 'Bearer stub-key');
    assert.deepEqual(Object.keys(request.body).sort(), ['messages', 'model']);
    assert.equal(request.body.model, 'tiny-model');
    assert.match(request.body.messages[0].content, /Return ONLY valid JSON/);
    assert.doesNotMatch(JSON.stringify(request.body), LEAK);
  }

  // The report on disk.
  assert.equal(await readFile(out, 'utf8'), report);
  assert.doesNotMatch(report, LEAK, 'the report never names the learner');
  assert.match(report, /\| Model \| tiny-model \|/);
  assert.match(report, /fictional, age 6 \(name not recorded\)/);
  assert.match(report, /Usable lessons: 3 of 4 \(2 on the first try\)/);
  assert.match(report, /Retries used: 2/);
  assert.match(report, /Tokens: 600 prompt, 240 completion/);
  assert.match(report, /Learner names redacted from prompts: 0/);
  const header = report.split('\n').find((line) => line.startsWith('| # |'));
  assert.match(header, /\| Parent usability rating \(1-5\) \| Notes \|$/);
  const tableRows = report.split('\n').filter((line) => /^\| \d+ \|/.test(line));
  assert.equal(tableRows.length, 4);
  for (const line of tableRows) {
    assert.equal(line.split('|').length, header.split('|').length, line);
    assert.match(line, /\| {2}\| {2}\|$/, 'rating and notes are left blank');
  }
  assert.match(tableRows.find((l) => l.includes('Blend words')), /\| 2 \| [\d.]+ \| [\d.]+ \| yes \| no \|/);

  // Usable lessons are in the scratch lesson cache, keyed as the app keys them.
  const key = (id) => `${Buffer.from(`topic:${id}`).toString('base64url')}.json`;
  assert.deepEqual((await readdir(join(dataDir, 'lessons'))).sort(), [key('add-1'), key('count-5'), key('letter-sounds')].sort());
  assert.deepEqual(JSON.parse(await readFile(join(dataDir, 'lessons', key('count-5')), 'utf8')), LESSON);
  // The family state itself is untouched.
  assert.equal(JSON.parse(await readFile(join(dataDir, 'family-state.json'), 'utf8')).version, 3);
});

test('takes topic ids from the command line and a new fictional learner with --age', async () => {
  requests.length = 0;
  const options = parseArgs(['--learner', 'Sample Ten', '--age', '6', '--no-save', '--retries', '0', 'count-5', '--topics', 'add-1']);
  assert.deepEqual(options, { learner: 'Sample Ten', age: 6, save: false, retries: 0, topicIds: ['count-5', 'add-1'] });
  const out = join(dataDir, 'report', 'cli.md');
  const { rows, report } = await runExperiment({ ...options, env, dataDir, out, now: NOW });
  assert.deepEqual(rows.map((r) => r.topicId), ['count-5', 'add-1']);
  assert.match(report, /\| Topics \| passed on the command line \|/);
  assert.equal(requests.length, 2);
  assert.doesNotMatch(JSON.stringify(requests), /Sample Ten/);

  await assert.rejects(runExperiment({ ...options, topicIds: ['no-such-topic'], env, dataDir, out, now: NOW }), /Unknown topic id: no-such-topic/);
  await assert.rejects(runExperiment({ learner: 'Nobody Here', env, dataDir, out, now: NOW }), /Pass --age/);
  assert.throws(() => parseArgs(['--age', 'six']), /whole number/);
});
