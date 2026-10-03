#!/usr/bin/env node
// The week-two AI experiment (HAR-26): generate lessons for a fictional
// learner's next daily-choice topics against the configured OpenAI-compatible
// endpoint, and write docs/experiments/<date>-lessons.md for the family to rate.
//
//   HARRINGTON_AI_BASE_URL=http://127.0.0.1:11434/v1 HARRINGTON_AI_MODEL=qwen2.5:7b \
//   HARRINGTON_AI_CAPABILITIES=lesson \
//   node scripts/ai-experiment.mjs --data-dir ./data/scratch --learner "Sample Nine" --age 6
//
// Options:
//   --data-dir <dir>   scratch Harrington data dir (default: HARRINGTON_DATA_DIR)
//   --learner <name>   a fictional learner; read from the data dir, or new with --age
//   --age <years>      age for a learner who is not in the data dir yet
//   --topics <a,b,…>   topic ids to use instead of the daily-choice topics
//                      (bare ids after the options work too)
//   --count <n>        how many daily-choice topics (default 10)
//   --retries <n>      extra attempts per topic after an unusable answer (default 1)
//   --out <file>       report path (default docs/experiments/<date>-lessons.md)
//   --no-save          do not put valid lessons in the data dir's lesson cache
//
// Every prompt is the app's own (src/js/ai.js), sent with the "lesson"
// capability and passed through the HAR-19 name redaction first. The data
// dir is only read, except that valid lessons are saved to its lesson cache
// so the family can open them in Harrington. Dependency-free.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseCapabilities } from '../src/js/ai-capabilities.js';
import { aiLesson, redactNames } from '../src/js/ai.js';
import { LANES, laneOptions } from '../src/js/daily.js';
import { getData, hardPrereqs, loadTaxonomy, topicAge } from '../src/js/data.js';
import { isValidCached, normalizeCached, studentAge } from '../src/js/store.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
// Mirrors server.mjs.
const DEFAULT_AI_TIMEOUT_MS = 180_000;
const DEFAULT_TAXONOMY_UPSTREAM = 'https://cdn.jsdelivr.net/gh/withmarbleapp/os-taxonomy@main/data';

export class ExperimentError extends Error {}

// ---- The endpoint, the way server.mjs's adapter calls it ----

// Mirrors completionContent() in server.mjs.
function completionContent(payload) {
  const choice = payload?.choices?.[0];
  if (!choice) return '';
  const content = choice.message?.content ?? choice.text;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('');
  return content == null ? '' : String(content);
}

const jsonResponse = (status, value) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

// Answers what the app's modules fetch from Harrington (/api/ai and the
// taxonomy) without a running server. `attempt` collects each call's usage.
function installFetch({ settings, dataDir, names, upstream, attempt }) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input);
    if (url.startsWith('/api/taxonomy/')) {
      const name = url.slice('/api/taxonomy/'.length);
      const cached = await readFile(join(dataDir, 'taxonomy', name)).catch(() => null);
      if (cached) return new Response(cached, { status: 200, headers: { 'Content-Type': 'application/json' } });
      return realFetch(`${upstream.replace(/\/$/, '')}/${name}`);
    }
    if (url !== '/api/ai') return jsonResponse(404, { error: 'Not available to the experiment' });

    const body = JSON.parse(options.body);
    if (body.capability !== 'lesson') return jsonResponse(403, { error: `The experiment only sends lessons, not "${body.capability}"` });
    // HAR-19: the prompts never name a learner; redact anyway and count it.
    const messages = body.messages.map((message) => {
      const content = redactNames(message.content, names);
      if (content !== message.content) attempt.redactions += 1;
      return { ...message, content };
    });

    const headers = { 'Content-Type': 'application/json' };
    if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
    let response;
    try {
      response = await realFetch(`${settings.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: settings.model, messages }),
        signal: controller.signal,
      });
    } catch (error) {
      return error?.name === 'AbortError'
        ? jsonResponse(504, { error: 'The AI provider timed out' })
        : jsonResponse(502, { error: 'The AI provider is unreachable' });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      await response.text().catch(() => '');
      return jsonResponse(502, { error: `The AI provider failed (${response.status})` });
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      return jsonResponse(502, { error: 'The AI provider returned an invalid response' });
    }
    if (payload?.usage) attempt.usage = payload.usage;
    return jsonResponse(200, { content: completionContent(payload) });
  };
  return () => { globalThis.fetch = realFetch; };
}

// ---- Topics ----

function learnerContext(state, learner, dateKey, now) {
  const d = getData();
  const progress = state.progress?.[learner.id] || {};
  const statusOf = (id) => progress[id]?.status || 'none';
  const lastByDomain = new Map();
  for (const [id, entry] of Object.entries(progress)) {
    const t = d.byId.get(id);
    if (t && (entry.updatedAt || 0) > (lastByDomain.get(t.domain) || 0)) lastByDomain.set(t.domain, entry.updatedAt || 0);
  }
  return {
    age: studentAge(learner, now) || 5,
    dateKey,
    now: now.getTime(),
    statusOf,
    isUnlocked: (id) => hardPrereqs(id).every((p) => statusOf(p.id) === 'mastered'),
    lastTouched: (domain) => lastByDomain.get(domain) || 0,
    topicAge,
  };
}

// The topics the daily choice would offer next, alternating the two lanes
// (mastery.js's todaysChoices offers two per lane; this ranks further down).
export function nextDailyTopics(topics, ctx, count) {
  const perLane = Object.values(LANES).map((lane) => laneOptions(topics, lane, ctx, Math.ceil(count / 2), 0).options);
  const out = [];
  for (let i = 0; out.length < count && perLane.some((list) => i < list.length); i += 1) {
    for (const list of perLane) if (i < list.length && out.length < count) out.push(list[i]);
  }
  return out;
}

// ---- Report ----

const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const seconds = (ms) => (ms == null ? '' : (ms / 1000).toFixed(1));
const yesNo = (value) => (value == null ? '' : value ? 'yes' : 'no');
const sum = (rows, key) => (rows.some((r) => r[key] != null) ? rows.reduce((total, r) => total + (r[key] || 0), 0) : null);

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function renderReport({ date, model, capabilities, age, topicSource, retries, timeoutMs, rows }) {
  const valid = rows.filter((r) => r.valid);
  const firstTry = valid.filter((r) => r.attempts === 1);
  const latencies = rows.map((r) => r.latencyMs).filter((ms) => ms != null);
  const promptTokens = sum(rows, 'promptTokens');
  const completionTokens = sum(rows, 'completionTokens');
  const lines = [
    `# Lessons experiment, ${date}`,
    '',
    'Written by `scripts/ai-experiment.mjs` (HAR-26; see docs/AI-SETUP.md). Read each lesson in Harrington, then fill in the last two columns: a parent usability rating from 1 (could not use it) to 5 (taught it as written), and anything worth remembering.',
    '',
    '| Setting | Value |',
    '|---|---|',
    `| Model | ${cell(model)} |`,
    `| Capabilities switched on | ${cell(capabilities.join(', '))} |`,
    `| Learner | fictional, age ${cell(age)} (name not recorded) |`,
    `| Topics | ${cell(topicSource)} |`,
    `| Extra attempts allowed per topic | ${retries} |`,
    `| Adapter timeout | ${timeoutMs / 1000} s |`,
    '',
    '## Summary',
    '',
    `- Usable lessons: ${valid.length} of ${rows.length} (${firstTry.length} on the first try)`,
    `- Retries used: ${rows.reduce((total, r) => total + r.attempts - 1, 0)}`,
    latencies.length
      ? `- Latency per lesson: median ${seconds(median(latencies))} s, slowest ${seconds(Math.max(...latencies))} s (the first one includes loading the model)`
      : '- Latency per lesson: none recorded',
    promptTokens == null && completionTokens == null
      ? '- Tokens: not reported by this endpoint'
      : `- Tokens: ${promptTokens ?? 0} prompt, ${completionTokens ?? 0} completion`,
    `- Learner names redacted from prompts: ${rows.reduce((total, r) => total + r.redactions, 0)} (should be 0)`,
    '',
    '## Lessons',
    '',
    '"Valid JSON" is whether the answer parsed; "Passes lesson check" is the HAR-20 shape check Harrington applies before caching a lesson. Latency is the last attempt; total includes retries.',
    '',
    '| # | Topic | Topic id | Attempts | Latency (s) | Total (s) | Valid JSON | Passes lesson check | Prompt tokens | Completion tokens | Error | Parent usability rating (1-5) | Notes |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r, i) => `| ${i + 1} | ${cell(r.name)} | ${cell(r.topicId)} | ${r.attempts} | ${seconds(r.latencyMs)} | ${seconds(r.totalMs)} | ${yesNo(r.jsonValid)} | ${yesNo(r.valid)} | ${r.promptTokens ?? ''} | ${r.completionTokens ?? ''} | ${cell(r.error)} |  |  |`),
    '',
  ];
  return lines.join('\n');
}

// docs/experiments/<date>-lessons.md, or -2, -3… when that day already has one.
async function freeReportPath(dir, date) {
  for (let n = 1; ; n += 1) {
    const path = join(dir, `${date}-lessons${n === 1 ? '' : `-${n}`}.md`);
    if (!existsSync(path)) return path;
  }
}

// ---- The run ----

function lessonPath(dataDir, topicId) {
  return join(dataDir, 'lessons', `${Buffer.from(`topic:${topicId}`, 'utf8').toString('base64url')}.json`);
}

async function generate(topic, { retries, attempt }) {
  const row = { topicId: topic.id, name: topic.name, attempts: 0, latencyMs: null, totalMs: 0, jsonValid: null, valid: false, promptTokens: null, completionTokens: null, error: '', redactions: 0, lesson: null };
  while (row.attempts <= retries && !row.valid) {
    row.attempts += 1;
    Object.assign(attempt, { usage: null, redactions: 0 });
    const started = performance.now();
    try {
      const lesson = normalizeCached('lesson', await aiLesson(topic));
      row.jsonValid = true;
      row.valid = isValidCached('lesson', lesson);
      row.error = row.valid ? '' : 'Did not pass the lesson check';
      if (row.valid) row.lesson = lesson;
    } catch (error) {
      row.jsonValid = error instanceof SyntaxError ? false : null;
      row.error = error instanceof SyntaxError ? 'Answer was not valid JSON' : String(error?.message || error);
    }
    row.latencyMs = performance.now() - started;
    row.totalMs += row.latencyMs;
    row.redactions += attempt.redactions;
    if (attempt.usage) {
      row.promptTokens = (row.promptTokens || 0) + (Number(attempt.usage.prompt_tokens) || 0);
      row.completionTokens = (row.completionTokens || 0) + (Number(attempt.usage.completion_tokens) || 0);
    }
  }
  return row;
}

export async function runExperiment(options) {
  const { env = process.env, learner: learnerName, age = null, topicIds = [], count = 10, retries = 1, save = true, now = new Date(), log = () => {} } = options;

  const capabilities = parseCapabilities(env.HARRINGTON_AI_CAPABILITIES).enabled;
  if (!capabilities.includes('lesson')) {
    throw new ExperimentError(`HARRINGTON_AI_CAPABILITIES (${env.HARRINGTON_AI_CAPABILITIES}) does not include lessons, so the experiment will not run. Set HARRINGTON_AI_CAPABILITIES=lesson.`);
  }
  const timeoutRaw = Number.parseInt(String(env.HARRINGTON_AI_TIMEOUT_MS || '').trim(), 10);
  const settings = {
    baseUrl: String(env.HARRINGTON_AI_BASE_URL || '').trim().replace(/\/+$/, ''),
    model: String(env.HARRINGTON_AI_MODEL || '').trim(),
    apiKey: String(env.HARRINGTON_AI_API_KEY || '').trim(),
    timeoutMs: Number.isInteger(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULT_AI_TIMEOUT_MS,
  };
  if (!settings.baseUrl || !settings.model) {
    throw new ExperimentError('Set HARRINGTON_AI_BASE_URL and HARRINGTON_AI_MODEL to the endpoint the experiment should use.');
  }
  const rawDir = options.dataDir || env.HARRINGTON_DATA_DIR;
  if (!rawDir) throw new ExperimentError('Pass --data-dir (or set HARRINGTON_DATA_DIR) to a scratch Harrington data dir.');
  const dataDir = resolve(rawDir);
  if (!learnerName || !String(learnerName).trim()) throw new ExperimentError('Pass --learner with a fictional learner\'s name.');
  if (!Number.isInteger(retries) || retries < 0) throw new ExperimentError('--retries must be 0 or more.');
  if (!topicIds.length && (!Number.isInteger(count) || count < 1)) throw new ExperimentError('--count must be 1 or more.');

  const state = JSON.parse(await readFile(join(dataDir, 'family-state.json'), 'utf8').catch(() => '{}'));
  const students = Array.isArray(state.students) ? state.students : [];
  const wanted = String(learnerName).trim().toLowerCase();
  let learner = students.find((s) => String(s.name || '').trim().toLowerCase() === wanted);
  if (!learner) {
    if (!Number.isInteger(age) || age < 1) {
      throw new ExperimentError(`No learner with that name in ${dataDir} (${students.length} learner${students.length === 1 ? '' : 's'} there). Pass --age to use a new fictional learner.`);
    }
    learner = { id: 'experiment', name: String(learnerName).trim(), birthYear: now.getFullYear() - age };
  }
  // Every name in the data dir, and the learner's, is redacted from prompts.
  const names = [...new Set([...students.map((s) => s.name), learner.name].filter(Boolean))];

  const attempt = { usage: null, redactions: 0 };
  const upstream = env.HARRINGTON_TAXONOMY_UPSTREAM || DEFAULT_TAXONOMY_UPSTREAM;
  const restoreFetch = installFetch({ settings, dataDir, names, upstream, attempt });
  try {
    const d = await loadTaxonomy();
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let topics;
    if (topicIds.length) {
      const unknown = topicIds.filter((id) => !d.byId.has(id));
      if (unknown.length) throw new ExperimentError(`Unknown topic id${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`);
      topics = topicIds.map((id) => d.byId.get(id));
    } else {
      topics = nextDailyTopics(d.topics, learnerContext(state, learner, dateKey, now), count);
      if (!topics.length) throw new ExperimentError('The daily choice has no topics to offer this learner.');
    }

    const rows = [];
    for (const [i, topic] of topics.entries()) {
      const row = await generate(topic, { retries, attempt });
      log(`[${i + 1}/${topics.length}] ${topic.id}: ${seconds(row.totalMs)} s, ${row.valid ? 'usable' : row.error}${row.attempts > 1 ? ` after ${row.attempts} attempts` : ''}`);
      if (save && row.lesson) {
        await mkdir(join(dataDir, 'lessons'), { recursive: true });
        await writeFile(lessonPath(dataDir, topic.id), `${JSON.stringify(row.lesson, null, 2)}\n`);
      }
      rows.push(row);
    }

    const report = renderReport({
      date: dateKey,
      model: settings.model,
      capabilities,
      age: studentAge(learner, now),
      topicSource: topicIds.length ? 'passed on the command line' : `the next ${topics.length} daily-choice topics on ${dateKey}`,
      retries,
      timeoutMs: settings.timeoutMs,
      rows,
    });
    const out = options.out ? resolve(options.out) : await freeReportPath(join(repoRoot, 'docs', 'experiments'), dateKey);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, report);
    return { out, rows, report };
  } finally {
    restoreFetch();
  }
}

// ---- Command line ----

export function parseArgs(argv) {
  const options = { topicIds: [] };
  const value = (i, flag) => {
    if (i >= argv.length || argv[i].startsWith('--')) throw new ExperimentError(`${flag} needs a value`);
    return argv[i];
  };
  const integer = (text, flag) => {
    if (!/^\d+$/.test(text)) throw new ExperimentError(`${flag} must be a whole number`);
    return Number.parseInt(text, 10);
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--data-dir') options.dataDir = value(++i, arg);
    else if (arg === '--learner') options.learner = value(++i, arg);
    else if (arg === '--age') options.age = integer(value(++i, arg), arg);
    else if (arg === '--count') options.count = integer(value(++i, arg), arg);
    else if (arg === '--retries') options.retries = integer(value(++i, arg), arg);
    else if (arg === '--out') options.out = value(++i, arg);
    else if (arg === '--topics') options.topicIds.push(...value(++i, arg).split(',').map((s) => s.trim()).filter(Boolean));
    else if (arg === '--no-save') options.save = false;
    else if (arg.startsWith('--')) throw new ExperimentError(`Unknown option ${arg}`);
    else options.topicIds.push(arg);
  }
  return options;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  if (options.help) {
    // The comment block at the top of this file.
    const lines = (await readFile(fileURLToPath(import.meta.url), 'utf8')).split('\n').slice(1);
    const header = lines.slice(0, lines.findIndex((l) => !l.startsWith('//')));
    console.log(header.map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return;
  }
  try {
    const { out, rows } = await runExperiment({ ...options, log: (line) => console.log(line) });
    console.log(`\n${rows.filter((r) => r.valid).length} of ${rows.length} lessons usable. Report: ${out}`);
  } catch (error) {
    console.error(error instanceof ExperimentError ? error.message : error);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
