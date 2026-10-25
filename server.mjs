import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_TIMEOUT_MS, chatCompletion, knownCapabilities, readStoredAiSettings, resolveAiSettings, validTimeout,
} from './lib/ai-provider.mjs';
import { isLoopbackAddress } from './lib/loopback.mjs';
import { AI_CAPABILITIES, capabilityOffMessage, parseCapabilities } from './src/js/ai-capabilities.js';
import { redactNames } from './src/js/redact.js';
import { SCHEMA_VERSION, schemaVersionOf } from './src/js/schema.js';
import { validateDocument } from './src/js/document.js';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(repoRoot, 'src');
const dataDir = resolve(process.env.HARRINGTON_DATA_DIR || join(repoRoot, 'data', 'private'));
const lessonsDir = join(dataDir, 'lessons');
const audioDir = join(dataDir, 'audio');
const taxonomyDir = join(dataDir, 'taxonomy');
const stateFile = join(dataDir, 'family-state.json');
// AI provider settings saved from the app, including any API key (see aiSettings()).
const secretsFile = join(dataDir, 'secrets.json');
// Where `npm run backup` (scripts/backup.mjs) writes its archives.
const backupDir = resolve(process.env.HARRINGTON_BACKUP_DIR || join(repoRoot, 'backups'));
const host = (process.env.HARRINGTON_HOST || '').trim() || '127.0.0.1';
// In a container the bind is 0.0.0.0, but compose may publish the port on
// loopback only; this names the address other devices actually reach.
const publishedHost = (process.env.HARRINGTON_PUBLISHED_HOST || '').trim() || host;
const accessToken = (process.env.HARRINGTON_ACCESS_TOKEN || '').trim();
const extraAllowedHosts = (process.env.HARRINGTON_ALLOWED_HOSTS || '')
  .split(',').map((name) => name.trim().toLowerCase()).filter(Boolean);
const MIN_TOKEN_LENGTH = 16;
const SESSION_COOKIE = 'harrington_session';
// Browsers cap a cookie's lifetime at 400 days; a tablet signs in once.
const SESSION_MAX_AGE = 400 * 24 * 60 * 60;
const configuredPort = Number.parseInt(process.env.HARRINGTON_PORT || process.env.PORT || '4173', 10);
const port = Number.isInteger(configuredPort) && configuredPort >= 0 ? configuredPort : 4173;
const JSON_LIMIT = 5 * 1024 * 1024;
const AUDIO_LIMIT = 100 * 1024 * 1024;
const TAXONOMY_FILES = new Set(['topics.json', 'dependencies.json', 'clusters.json', 'manifest.json']);
const TAXONOMY_UPSTREAM = process.env.HARRINGTON_TAXONOMY_UPSTREAM
  || 'https://cdn.jsdelivr.net/gh/withmarbleapp/os-taxonomy@main/data';
const AI_UNCONFIGURED = 'AI is not configured for this self-hosted Harrington server';
// Read once, to warn about unknown names at startup.
const aiCapabilityConfig = parseCapabilities(process.env.HARRINGTON_AI_CAPABILITIES);

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

const writeQueues = new Map();

function send(res, status, body = '', headers = {}) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    ...headers,
  });
  res.end(body);
}

function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value), { 'Content-Type': 'application/json; charset=utf-8' });
}

function streamFile(res, path) {
  const stream = createReadStream(path);
  // A file can disappear after stat() succeeds; errors emitted by a ReadStream
  // are asynchronous and therefore bypass the request handler's try/catch.
  stream.on('error', () => { if (!res.destroyed) res.destroy(); });
  stream.pipe(res);
}

async function readBody(req, limit) {
  const declared = Number.parseInt(req.headers['content-length'] || '0', 10);
  if (declared > limit) throw Object.assign(new Error('Request is too large'), { statusCode: 413 });

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Request is too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const body = await readBody(req, JSON_LIMIT);
  let value;
  try {
    value = JSON.parse(body.toString('utf8'));
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON'), { statusCode: 400 });
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw Object.assign(new Error('Request body must be a JSON object'), { statusCode: 400 });
  }
  return value;
}

async function readJsonFile(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

// Runs `task` after every earlier queued operation on `path`, so a read-check-write
// sequence on one file can never interleave with another write to it.
function enqueueWrite(path, task) {
  const previous = writeQueues.get(path) || Promise.resolve();
  const operation = previous.catch(() => {}).then(task);
  writeQueues.set(path, operation);
  const cleanup = () => {
    if (writeQueues.get(path) === operation) writeQueues.delete(path);
  };
  operation.then(cleanup, cleanup);
  return operation;
}

async function writeFileAtomic(path, data, mode = null) {
  await mkdir(dataDir, { recursive: true });
  const tempPath = `${path}.${process.pid}.tmp`;
  await writeFile(tempPath, data, mode ? { mode } : undefined);
  // chmod as well: the mode given to writeFile is narrowed by the umask.
  if (mode) await chmod(tempPath, mode);
  await rename(tempPath, path);
}

function atomicWrite(path, data) {
  return enqueueWrite(path, () => writeFileAtomic(path, data));
}

// ---- Versioned family state ----
// The stored document is the family data plus a top-level integer `version`
// and `updatedAt`. A legacy document without a version is treated as version 0.
// Before the first save there is no file, and the document is a new one at the
// current data format (`schemaVersion`, see src/js/schema.js); the browser
// migrates older documents when it loads them.
function stateVersionOf(doc) {
  return Number.isSafeInteger(doc?.version) && doc.version >= 0 ? doc.version : 0;
}

function normalizeState(doc) {
  const value = doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : {};
  return { ...value, version: stateVersionOf(value) };
}

async function readStateDocument() {
  return normalizeState(await readJsonFile(stateFile, { schemaVersion: SCHEMA_VERSION }));
}

// Every save is checked with the rules the browser applies before an import
// (src/js/document.js): 422 for a document the app could not render, 409 for
// a data format this server does not know or older than the stored one.
function saveProblem(data) {
  const { version: _version, updatedAt: _updatedAt, writeId: _writeId, ...doc } = data;
  const schema = schemaVersionOf(doc);
  if (schema === null) return { status: 422, error: 'schemaVersion must be a whole number' };
  if (schema > SCHEMA_VERSION) {
    return { status: 409, error: `This server reads family data up to format ${SCHEMA_VERSION}; the save is format ${schema}. Update Harrington.` };
  }
  const problem = validateDocument(doc);
  return problem ? { status: 422, error: problem } : null;
}

function stateEtag(version) {
  return `"v${version}"`;
}

// Accepts `"v42"`, `W/"v42"`, `v42` or `42`. Returns null when absent.
function parseIfMatch(header) {
  if (header === undefined) return null;
  const match = String(header).trim().match(/^(?:W\/)?"?v?(\d+)"?$/);
  if (!match) throw Object.assign(new Error('If-Match must be a state version such as "v3"'), { statusCode: 400 });
  return Number.parseInt(match[1], 10);
}

// Compare-and-swap inside the state file's write queue: two writers holding the
// same version cannot both succeed.
function writeStateIfMatch(expected, data) {
  return enqueueWrite(stateFile, async () => {
    const stored = await readJsonFile(stateFile, null);
    const current = stored === null ? await readStateDocument() : normalizeState(stored);
    if (current.version !== expected) return { ok: false, current };
    // Only a document on disk sets the floor; the new one served before the
    // first save does not.
    const storedSchema = stored === null ? 0 : (schemaVersionOf(current) ?? 0);
    const schema = schemaVersionOf(data) ?? 0;
    if (schema < storedSchema) {
      return { ok: false, refused: { status: 409, error: `The family data is format ${storedSchema}; this save is format ${schema}. Reload Harrington.` } };
    }
    const { version: _version, updatedAt: _updatedAt, writeId, ...rest } = data;
    // An optional client-chosen id lets a tab recognise its own write later,
    // such as an unload beacon whose response it never saw. A body that merely
    // echoes the stored id (read, modify, write) is not that tab's write.
    const fresh = typeof writeId === 'string' && writeId.length > 0 && writeId.length <= 64 && writeId !== current.writeId;
    const ownId = fresh ? { writeId } : {};
    const next = { version: current.version + 1, updatedAt: Date.now(), ...ownId, ...rest };
    await writeFileAtomic(stateFile, `${JSON.stringify(next, null, 2)}\n`);
    return { ok: true, current: next };
  });
}

async function handleStateWrite(req, res) {
  // Browsers send Sec-Fetch-Site on every request; only this page may write.
  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite !== undefined && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    sendJson(res, 403, { error: 'Family data can only be saved from Harrington itself' });
    return;
  }
  // HTML forms can POST cross-site without a preflight but never as JSON; a
  // real sendBeacon with a JSON Blob always sends application/json.
  if (req.method === 'POST' && !String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    sendJson(res, 415, { error: 'Family data must be sent as application/json' });
    return;
  }
  let expected = parseIfMatch(req.headers['if-match']);
  const value = await readJson(req);
  // navigator.sendBeacon cannot set headers, so the unload path (POST) carries
  // the precondition as a `version` field in the body instead.
  if (expected === null && req.method === 'POST' && Number.isSafeInteger(value.version) && value.version >= 0) {
    expected = value.version;
  }
  if (expected === null) {
    sendJson(res, 428, { error: 'Saving family data requires If-Match with the current state version' });
    return;
  }
  const problem = saveProblem(value);
  if (problem) {
    sendJson(res, problem.status, { error: problem.error });
    return;
  }
  const result = await writeStateIfMatch(expected, value);
  if (result.refused) {
    sendJson(res, result.refused.status, { error: result.refused.error });
    return;
  }
  if (!result.ok) {
    send(res, 412, JSON.stringify(result.current), {
      'Content-Type': 'application/json; charset=utf-8',
      ETag: stateEtag(result.current.version),
    });
    return;
  }
  send(res, 204, '', { ETag: stateEtag(result.current.version) });
}

async function stateHealth() {
  try {
    const [details, doc] = await Promise.all([stat(stateFile), readStateDocument()]);
    return { stateVersion: doc.version, stateBytes: details.size };
  } catch (error) {
    if (error.code === 'ENOENT') return { stateVersion: 0, stateBytes: 0 };
    throw error;
  }
}

// Whole days since the newest backup archive was written, or null when there
// is none. A folder that cannot be read (missing, permission denied, a symlink
// loop) also reads as null: the health check must never fail over a backup
// folder. Unexpected errors are logged once, by code only (no path).
let backupReadWarned = false;
async function backupAgeDays() {
  let names;
  try {
    names = await readdir(backupDir);
  } catch (error) {
    if (error.code !== 'ENOENT' && !backupReadWarned) {
      backupReadWarned = true;
      console.warn(`Cannot read the backup folder (${error.code || 'unknown error'}); reporting no backup.`);
    }
    return null;
  }
  let newest = 0;
  for (const name of names) {
    if (!/^harrington-.+\.tar\.gz$/.test(name)) continue;
    try {
      const details = await stat(join(backupDir, name));
      if (details.isFile()) newest = Math.max(newest, details.mtimeMs);
    } catch {
      // Removed while we were looking; skip it.
    }
  }
  if (!newest) return null;
  return Math.max(0, Math.floor((Date.now() - newest) / (24 * 60 * 60 * 1000)));
}

function keyPath(directory, key, extension) {
  const encoded = Buffer.from(key, 'utf8').toString('base64url');
  if (!encoded || encoded.length > 500) {
    throw Object.assign(new Error('Invalid identifier'), { statusCode: 400 });
  }
  return join(directory, `${encoded}${extension}`);
}

function routeKey(pathname, prefix) {
  if (!pathname.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(pathname.slice(prefix.length));
  } catch {
    throw Object.assign(new Error('Invalid identifier'), { statusCode: 400 });
  }
}

// ---- AI provider settings ----
// The parent can set the provider in the app (Settings > AI provider). Those
// values live in secrets.json in the data dir, apart from family-state.json so
// export, import and backups never carry the API key, and win field by field
// over the HARRINGTON_AI_* environment, which stays as the fallback.
const MAX_API_KEY = 512;
const MAX_MODEL = 200;
const AI_PRESETS = [
  { id: 'ollama', label: 'Ollama on this computer', baseUrl: 'http://127.0.0.1:11434/v1', model: '', cloud: false },
  { id: 'gemini', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', cloud: true },
  { id: 'custom', label: 'OpenAI-compatible (custom)', baseUrl: '', model: '', cloud: false },
];
const AI_SETTING_FIELDS = ['baseUrl', 'model', 'apiKey', 'timeoutMs', 'capabilities'];
let secretsWarned = false;

// The effective settings, read on every call (the file is tiny).
async function aiSettings() {
  return resolveAiSettings(await readStoredAiSettings(secretsFile, warnSecrets), process.env);
}

function warnSecrets(why) {
  if (secretsWarned) return;
  secretsWarned = true;
  console.warn(`Stored AI settings (${secretsFile}) ${why}; using the environment instead`);
}

// What the settings page may see: never the key, only whether there is one
// and, for a key long enough not to give much away, its last four characters.
function publicAiSettings(settings) {
  const { apiKey, source } = settings;
  return {
    configured: settings.configured,
    baseUrl: settings.baseUrl,
    model: settings.model,
    timeoutMs: settings.timeoutMs,
    capabilities: settings.capabilitySetting,
    hasApiKey: Boolean(apiKey),
    apiKeyHint: apiKey && apiKey.length >= 8 ? apiKey.slice(-4) : null,
    source,
    presets: AI_PRESETS,
  };
}

function settingError(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

// Applies one PUT body to the stored settings. An omitted field is
// unchanged; null or "" removes it, so the environment value applies again.
function applyAiSettings(current, body) {
  const unknown = Object.keys(body).filter((key) => !AI_SETTING_FIELDS.includes(key));
  if (unknown.length) throw settingError(`Unknown AI setting: ${unknown.join(', ')}`);
  const next = { ...current };
  const cleared = (value) => value === null || value === '' || (typeof value === 'string' && !value.trim());

  if ('baseUrl' in body) {
    if (cleared(body.baseUrl)) delete next.baseUrl;
    else {
      let url;
      try { url = new URL(String(body.baseUrl).trim()); } catch { url = null; }
      if (typeof body.baseUrl !== 'string' || !url || !['http:', 'https:'].includes(url.protocol)) {
        throw settingError('The base URL must be an http:// or https:// address');
      }
      if (url.username || url.password) throw settingError('Put the API key in its own field, not in the base URL');
      next.baseUrl = body.baseUrl.trim().replace(/\/+$/, '');
    }
  }
  if ('model' in body) {
    if (cleared(body.model)) delete next.model;
    else if (typeof body.model !== 'string' || body.model.trim().length > MAX_MODEL || /[\u0000-\u001f]/.test(body.model)) {
      throw settingError('The model must be a short name such as the one the provider lists');
    } else next.model = body.model.trim();
  }
  if ('apiKey' in body) {
    if (cleared(body.apiKey)) delete next.apiKey;
    else if (typeof body.apiKey !== 'string' || body.apiKey.trim().length > MAX_API_KEY || /[\u0000-\u001f\s]/.test(body.apiKey.trim())) {
      throw settingError(`The API key must be at most ${MAX_API_KEY} characters, without spaces`);
    } else next.apiKey = body.apiKey.trim();
  }
  if ('timeoutMs' in body) {
    if (body.timeoutMs === null || body.timeoutMs === undefined) delete next.timeoutMs;
    else if (!validTimeout(body.timeoutMs)) throw settingError(`The timeout must be a whole number of milliseconds up to ${MAX_TIMEOUT_MS}`);
    else next.timeoutMs = body.timeoutMs;
  }
  if ('capabilities' in body) {
    if (body.capabilities === null) delete next.capabilities;
    else if (!Array.isArray(body.capabilities) || !body.capabilities.every((c) => typeof c === 'string' && AI_CAPABILITIES.includes(c))) {
      throw settingError(`Capabilities must be a list drawn from: ${AI_CAPABILITIES.join(', ')}`);
    } else next.capabilities = knownCapabilities(body.capabilities);
  }
  if (next.baseUrl && !next.model) throw settingError('Choose a model for this base URL');
  return next;
}

function writeStoredAi(ai) {
  const doc = { schemaVersion: 1, ai: { ...ai, updatedAt: Date.now() } };
  // Owner-only: the file can hold an API key.
  return writeFileAtomic(secretsFile, `${JSON.stringify(doc, null, 2)}\n`, 0o600);
}

// The browser sends Sec-Fetch-Site on every request; settings change only
// from Harrington's own pages, and only as JSON.
function refuseCrossSite(req, res, { json = false } = {}) {
  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite !== undefined && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    sendJson(res, 403, { error: 'AI settings can only be changed from Harrington itself' });
    return true;
  }
  if (json && !String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    sendJson(res, 415, { error: 'AI settings must be sent as application/json' });
    return true;
  }
  return false;
}

// Whether /api/* requires an access token (HARRINGTON_ACCESS_TOKEN, HAR-25).
// When it does, every request reaching the settings routes has already passed
// the sign-in gate in handleApi, so a signed-in device may change them.
function accessTokenEnabled() {
  return authEnabled;
}

// Repointing the provider would send it every later prompt (and keep the
// stored key), so without an access token only the computer running
// Harrington may change it or run the connection test, and only while
// Harrington is not shared. Once it is shared (bound beyond loopback, or
// published under another name: the same signal as the host-name allowlist),
// a reverse proxy such as `tailscale serve` or Caddy delivers every family
// device from 127.0.0.1, so the socket address no longer tells this computer
// apart: settings then need the token. A request that carries a proxy's
// forwarding headers is refused for the same reason, even when Harrington
// does not know it is shared. Those headers are only ever a reason to refuse,
// never to allow: any client can set them.
// On an unshared server the Host header must name this computer too: a DNS
// rebinding page reaches 127.0.0.1 as same-origin, but under its own name.
const LOCAL_ONLY = 'AI provider settings can only be changed from a signed-in device once an access token is set, or, while Harrington is not shared with other devices, from the computer running it';
const FORWARDING_HEADERS = ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip'];
function canChangeAiSettings(req) {
  if (accessTokenEnabled()) return true;
  if (shared || FORWARDING_HEADERS.some((name) => name in req.headers)) return false;
  const hostName = hostHeaderName(req);
  return isLoopbackAddress(req.socket.remoteAddress) && (hostName === 'localhost' || isLoopbackAddress(hostName));
}
function refuseRemote(req, res) {
  if (canChangeAiSettings(req)) return false;
  sendJson(res, 403, { error: LOCAL_ONLY });
  return true;
}

async function handleAiSettings(req, res, url) {
  const view = async () => ({ ...publicAiSettings(await aiSettings()), canChange: canChangeAiSettings(req) });
  if (url.pathname === '/api/settings/ai/test') {
    if (req.method !== 'POST') return false;
    if (refuseRemote(req, res) || refuseCrossSite(req, res)) return true;
    sendJson(res, 200, await testAiConnection());
    return true;
  }
  if (req.method === 'GET') {
    sendJson(res, 200, await view());
    return true;
  }
  if (req.method === 'PUT') {
    if (refuseRemote(req, res) || refuseCrossSite(req, res, { json: true })) return true;
    const body = await readJson(req);
    await enqueueWrite(secretsFile, async () => writeStoredAi(applyAiSettings(await readStoredAiSettings(secretsFile, warnSecrets), body)));
    sendJson(res, 200, await view());
    return true;
  }
  if (req.method === 'DELETE') {
    if (refuseRemote(req, res) || refuseCrossSite(req, res)) return true;
    await enqueueWrite(secretsFile, () => unlink(secretsFile).catch((error) => { if (error.code !== 'ENOENT') throw error; }));
    sendJson(res, 200, await view());
    return true;
  }
  return false;
}

// One tiny completion with no learner data. The answer is a short category
// and the provider's HTTP status at most: never the key or the provider's body.
const TEST_ERRORS = { timeout: 'timed out', unreachable: 'unreachable', failed: 'provider error', invalid: 'invalid response' };
async function testAiConnection() {
  const settings = await aiSettings();
  if (!settings.configured) return { ok: false, latencyMs: 0, error: 'not configured' };
  const result = await chatCompletion(settings, [{ role: 'user', content: 'Reply with the single word OK.' }]);
  if (result.ok) return { ok: true, latencyMs: result.latencyMs };
  return { ok: false, latencyMs: result.latencyMs, ...(result.status ? { status: result.status } : {}), error: TEST_ERRORS[result.kind] };
}

// ---- What reaches the AI provider ----
// The browser builds prompts without learner names and leaves parent notes
// out unless the parent opts in (src/js/ai.js). The server checks both again
// before anything leaves the machine: every learner name in the family
// document becomes "the child" (same rules, src/js/redact.js), and stored
// parent notes are removed unless the request says the parent opted in.

const AI_ROLES = new Set(['system', 'user', 'assistant']);
const NOTE_REMOVED = '[note removed]';
// A whole note, and any note line, is matched from this length: a shorter
// note ("Fractions") is also ordinary topic text and would blank it.
const NOTE_MIN = 20;
// The browser cuts a note at these lengths before it goes into a prompt
// (summarizeRecords and the progress review at 300, a discussion at 1500).
const NOTE_CUTS = [300, 1500];

// Only { role, content } with string content is forwarded. The app never
// sends anything else, so an object or array content, or tool_calls, is a 400.
function forwardableMessages(messages) {
  return messages.map((message, i) => {
    const fail = (why) => { throw Object.assign(new Error(`Message ${i + 1} ${why}`), { statusCode: 400 }); };
    if (!message || typeof message !== 'object' || Array.isArray(message)) fail('is not an object');
    if ('tool_calls' in message) fail('has tool_calls, which Harrington does not send');
    if (!AI_ROLES.has(message.role)) fail('has a role other than system, user or assistant');
    if (typeof message.content !== 'string') fail('content must be a string');
    return { role: message.role, content: message.content };
  });
}

function storedLearners(doc) {
  const students = Array.isArray(doc.students) ? doc.students : [];
  return students.map((s) => s?.name).filter((n) => typeof n === 'string' && n.trim());
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Patterns for every stored parent note, as the browser would send it (names
// already redacted): the whole note, its first 300 and 1500 characters (where
// the browser cuts it, from the note as stored and as trimmed), and each line,
// every piece of NOTE_MIN characters or more, with any run of whitespace
// matching any other. Longest first.
function notePatterns(doc, names) {
  const pieces = new Set();
  const add = (piece) => { const text = piece.trim(); if (text.length >= NOTE_MIN) pieces.add(text); };
  const records = doc.records && typeof doc.records === 'object' ? doc.records : {};
  for (const list of Object.values(records)) {
    for (const record of Array.isArray(list) ? list : []) {
      if (typeof record?.note !== 'string') continue;
      const asStored = redactNames(record.note, names);
      const trimmed = redactNames(record.note.trim(), names);
      add(trimmed);
      for (const cut of NOTE_CUTS) {
        add(asStored.slice(0, cut));
        add(trimmed.slice(0, cut));
      }
      for (const line of trimmed.split('\n')) add(line);
    }
  }
  return [...pieces]
    .sort((a, b) => b.length - a.length)
    .map((piece) => new RegExp(piece.split(/\s+/).map(escapeRegExp).join('\\s+'), 'g'));
}

// Whether the parent opted in to sending notes with this request. Only the
// discussion analysis and the progress review offer that choice.
const NOTE_CAPABILITIES = new Set(['analysis', 'review']);
function notesAllowed(body) {
  return body.includeNotes === true && NOTE_CAPABILITIES.has(body.capability);
}

async function guardMessages(body) {
  const messages = forwardableMessages(body.messages);
  const doc = await readStateDocument();
  const names = storedLearners(doc);
  const notes = notesAllowed(body) ? [] : notePatterns(doc, names);
  return messages.map(({ role, content }) => {
    let text = names.length ? redactNames(content, names) : content;
    for (const pattern of notes) text = text.replace(pattern, NOTE_REMOVED);
    return { role, content: text };
  });
}

async function handleAiChat(req, res) {
  const settings = await aiSettings();
  if (!settings.configured) {
    sendJson(res, 503, { error: AI_UNCONFIGURED });
    return;
  }

  const body = await readJson(req);
  if (!Array.isArray(body.messages)) {
    throw Object.assign(new Error('Request body must include a messages array'), { statusCode: 400 });
  }
  // Every prompt names its capability; a missing or unknown one is refused,
  // never assumed.
  const { capability } = body;
  if (typeof capability !== 'string' || !AI_CAPABILITIES.includes(capability)) {
    sendJson(res, 403, { error: 'AI requests must name a known capability, so Harrington refused this one' });
    return;
  }
  if (!settings.capabilities.includes(capability)) {
    sendJson(res, 403, { error: capabilityOffMessage(capability), capability });
    return;
  }

  // Names and opted-out notes are removed here, after the capability check.
  const messages = await guardMessages(body);
  const result = await chatCompletion(settings, messages);
  if (!result.ok) {
    sendJson(res, result.httpStatus, { error: result.error });
    return;
  }
  sendJson(res, 200, { content: result.content });
}

async function taxonomyCached() {
  try {
    await stat(join(taxonomyDir, 'topics.json'));
    return true;
  } catch {
    return false;
  }
}

async function loadTaxonomyFile(name) {
  if (!TAXONOMY_FILES.has(name)) {
    throw Object.assign(new Error('Unknown taxonomy file'), { statusCode: 404 });
  }
  const cachePath = join(taxonomyDir, name);
  const cached = await readFile(cachePath).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (cached) return cached;

  const response = await fetch(`${TAXONOMY_UPSTREAM.replace(/\/$/, '')}/${name}`);
  if (!response.ok) {
    throw Object.assign(
      new Error(`Could not download curriculum file ${name} (${response.status})`),
      { statusCode: 502 },
    );
  }
  const body = Buffer.from(await response.arrayBuffer());
  await mkdir(taxonomyDir, { recursive: true });
  await atomicWrite(cachePath, body);
  return body;
}

// ---- Saved lessons listing ----
// Keys and saved times for one cache prefix, never content. Read-only.
const LESSON_LIST_PREFIXES = new Set(['topic:', 'print:', 'recall:']);
const LESSON_LIST_MAX = 200; // the newest entries; a `limit` above this is clamped

async function listLessons(prefix, limit) {
  const names = await readdir(lessonsDir).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const entries = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue; // skips in-flight .tmp files
    const encoded = name.slice(0, -'.json'.length);
    const key = Buffer.from(encoded, 'base64url').toString('utf8');
    if (Buffer.from(key, 'utf8').toString('base64url') !== encoded || !key.startsWith(prefix)) continue;
    entries.push({ key, path: join(lessonsDir, name) });
  }
  const listed = await Promise.all(entries.map(async ({ key, path }) => {
    try {
      return { key, savedAt: Math.round((await stat(path)).mtimeMs) };
    } catch (error) {
      if (error.code === 'ENOENT') return null; // removed since readdir
      throw error;
    }
  }));
  return listed.filter(Boolean).sort((a, b) => b.savedAt - a.savedAt || a.key.localeCompare(b.key)).slice(0, limit);
}

// `limit` is optional: absent means LESSON_LIST_MAX, and any whole number is
// clamped to 1..LESSON_LIST_MAX. Anything else is a 400.
function lessonListLimit(raw) {
  if (raw === null) return LESSON_LIST_MAX;
  if (!/^\d+$/.test(raw)) throw Object.assign(new Error('limit must be a whole number'), { statusCode: 400 });
  return Math.min(LESSON_LIST_MAX, Math.max(1, Number.parseInt(raw, 10)));
}

async function handleLessonList(req, res, url) {
  const prefix = url.searchParams.get('prefix');
  if (!LESSON_LIST_PREFIXES.has(prefix)) {
    sendJson(res, 400, { error: 'prefix must be one of topic:, print: or recall:' });
    return;
  }
  const limit = lessonListLimit(url.searchParams.get('limit'));
  sendJson(res, 200, { lessons: await listLessons(prefix, limit) });
}

// ---- Bind address and access token (HAR-25) ----
// An IP address, `localhost`, or a plain DNS name (a mesh name such as
// `family-host.tailnet-name.ts.net` resolves to the mesh interface).
function validHost(value) {
  if (isIP(value)) return true;
  return value.length <= 253 && /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/i.test(value);
}

function isLoopbackHost(value) {
  const lower = value.toLowerCase();
  if (lower === 'localhost' || lower === '::1') return true;
  if (/^(::ffff:)?127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lower)) return true;
  return false;
}

const bindIsLoopback = isLoopbackHost(host);
const hostIsLoopback = isLoopbackHost(publishedHost);
// Shared: something other than this computer is meant to reach Harrington.
const shared = !bindIsLoopback || !hostIsLoopback;

// DNS rebinding: a web page on an attacker's domain can re-point that domain
// at this server, and the browser then sends the attacker's name as Host. Once
// Harrington is shared, it answers only to names the family uses. An IP
// literal is always accepted: a rebinding attack never arrives as one.
const allowedHosts = new Set(['localhost', publishedHost.toLowerCase(), host.toLowerCase(), ...extraAllowedHosts]);

function hostHeaderName(req) {
  const value = String(req.headers.host || '').trim().toLowerCase();
  const bracketed = value.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) return bracketed[1];
  return value.replace(/:\d+$/, '').replace(/\.$/, '');
}

function hostAllowed(req) {
  if (!shared) return true;
  const name = hostHeaderName(req);
  return isIP(name) !== 0 || allowedHosts.has(name);
}

const authEnabled = accessToken.length > 0;
// The cookie holds a value derived from the token, never the token itself, so
// changing HARRINGTON_ACCESS_TOKEN signs every device out.
const sessionValue = authEnabled
  ? createHmac('sha256', accessToken).update('harrington-session-v1').digest('base64url')
  : '';

// Hashing first gives both sides the same length, so timingSafeEqual never
// throws and the comparison time does not depend on where they differ.
function safeEqual(a, b) {
  const left = createHash('sha256').update(String(a)).digest();
  const right = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(left, right);
}

function cookieValue(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

function isSignedIn(req) {
  if (!authEnabled) return true;
  const value = cookieValue(req, SESSION_COOKIE);
  return value !== null && safeEqual(value, sessionValue);
}

// Harrington never terminates TLS itself; a mesh or reverse proxy in front of
// it says the browser used HTTPS.
function requestIsHttps(req) {
  if (req.socket?.encrypted) return true;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  if (forwardedProto === 'https') return true;
  return /(^|[;,\s])proto=https($|[;,\s])/i.test(String(req.headers.forwarded || ''));
}

function sendHtml(res, status, title, paragraphs, headers = {}) {
  const body = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Harrington</title>
<style>body{font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;line-height:1.5;color:#2b2a26;background:#faf6ee}code{background:#efe7d6;padding:0 .25rem;border-radius:.25rem}</style>
</head>
<body><h1>${title}</h1>${paragraphs.map((p) => `<p>${p}</p>`).join('')}</body>
</html>
`;
  send(res, status, body, { 'Content-Type': 'text/html; charset=utf-8', 'Referrer-Policy': 'no-referrer', ...headers });
}

const SIGN_IN_FORM = `<form method="post" action="/login">
<p><label for="token">Family access token</label><br>
<input id="token" name="token" type="password" autocomplete="current-password" required autofocus style="font:inherit;padding:.4rem;width:100%;max-width:24rem;box-sizing:border-box"></p>
<p><button type="submit" style="font:inherit;padding:.4rem 1rem">Sign in</button></p>
</form>`;

const SIGN_IN_HELP = [
  'This Harrington server asks each device to sign in once with the family access token: the value of <code>HARRINGTON_ACCESS_TOKEN</code> on the computer that runs Harrington.',
  SIGN_IN_FORM,
  'After that this browser stays signed in. <code>docs/DEPLOYMENT.md</code> has the full steps.',
];

function sendUnauthorized(res) {
  sendHtml(res, 401, 'Sign in to Harrington', ['Open <a href="/login">/login</a> on this device to sign in.', ...SIGN_IN_HELP]);
}

function signIn(req, res, token) {
  if (!safeEqual(token, accessToken)) {
    sendHtml(res, 401, 'That token did not work', [
      'It does not match this Harrington server. Check it for typos, or ask whoever runs the host computer for the current token.',
      ...SIGN_IN_HELP,
    ]);
    return;
  }
  const attributes = [
    `${SESSION_COOKIE}=${sessionValue}`,
    'Path=/',
    `Max-Age=${SESSION_MAX_AGE}`,
    'HttpOnly',
    'SameSite=Strict',
  ];
  if (requestIsHttps(req)) attributes.push('Secure');
  // The redirect clears the token from the address bar. A ?token= link still
  // stays in the browser's history, which is why the form is the main path.
  send(res, 303, '', { Location: '/', 'Set-Cookie': attributes.join('; '), 'Referrer-Policy': 'no-referrer' });
}

// GET /login shows the form; GET /login?token=... is the link convenience;
// POST /login takes the form. All three use the same check and cookie.
async function handleLogin(req, res, url) {
  if (!authEnabled) {
    send(res, 303, '', { Location: '/' });
    return;
  }
  if (req.method === 'POST') {
    const body = await readBody(req, 4096);
    const token = new URLSearchParams(body.toString('utf8')).get('token');
    // A pasted token often carries a stray space or newline.
    signIn(req, res, (token ?? '').trim());
    return;
  }
  const token = url.searchParams.get('token');
  if (token === null) {
    sendHtml(res, 200, 'Sign in to Harrington', SIGN_IN_HELP);
    return;
  }
  signIn(req, res, token);
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/health' && req.method === 'GET') {
    const signedIn = isSignedIn(req);
    const deployment = {
      host: hostIsLoopback ? 'loopback' : 'network',
      authEnabled,
      ...(authEnabled ? { signedIn } : {}),
    };
    // A device that has not signed in learns only enough to show how to sign in.
    if (!signedIn) {
      sendJson(res, 200, { ok: true, mode: 'self-hosted', ...deployment });
      return true;
    }
    const ai = await aiSettings();
    sendJson(res, 200, {
      ok: true,
      mode: 'self-hosted',
      ...deployment,
      aiConfigured: ai.configured,
      aiSource: ai.aiSource,
      aiCapabilities: ai.capabilities,
      redaction: 'server+client',
      taxonomyCached: await taxonomyCached(),
      ...(await stateHealth()),
      backupAgeDays: await backupAgeDays(),
    });
    return true;
  }

  if (url.pathname.startsWith('/api/') && !isSignedIn(req)) {
    sendUnauthorized(res);
    return true;
  }

  const taxonomyName = routeKey(url.pathname, '/api/taxonomy/');
  if (taxonomyName !== null && req.method === 'GET') {
    const body = await loadTaxonomyFile(taxonomyName);
    send(res, 200, body, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, max-age=3600',
    });
    return true;
  }

  if (url.pathname === '/api/state') {
    if (req.method === 'GET') {
      const doc = await readStateDocument();
      send(res, 200, JSON.stringify(doc), {
        'Content-Type': 'application/json; charset=utf-8',
        ETag: stateEtag(doc.version),
      });
      return true;
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      await handleStateWrite(req, res);
      return true;
    }
  }

  if (url.pathname === '/api/lessons' && req.method === 'GET') {
    await handleLessonList(req, res, url);
    return true;
  }

  const lessonKey = routeKey(url.pathname, '/api/lessons/');
  if (lessonKey !== null) {
    const path = keyPath(lessonsDir, lessonKey, '.json');
    if (req.method === 'GET') {
      const lesson = await readJsonFile(path);
      if (lesson === null) sendJson(res, 404, { error: 'Lesson not found' });
      else sendJson(res, 200, lesson);
      return true;
    }
    if (req.method === 'PUT') {
      const value = await readJson(req);
      await mkdir(lessonsDir, { recursive: true });
      await atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`);
      send(res, 204);
      return true;
    }
  }

  const audioKey = routeKey(url.pathname, '/api/audio/');
  if (audioKey !== null) {
    const path = keyPath(audioDir, audioKey, '.bin');
    const metaPath = keyPath(audioDir, audioKey, '.meta.json');
    if (req.method === 'GET') {
      try {
        const [details, metadata] = await Promise.all([stat(path), readJsonFile(metaPath, {})]);
        res.writeHead(200, {
          'Cache-Control': 'private, max-age=3600',
          'Content-Type': metadata.contentType || 'application/octet-stream',
          'Content-Length': details.size,
          'X-Content-Type-Options': 'nosniff',
        });
        streamFile(res, path);
      } catch (error) {
        if (error.code === 'ENOENT') sendJson(res, 404, { error: 'Recording not found' });
        else throw error;
      }
      return true;
    }
    if (req.method === 'PUT') {
      const body = await readBody(req, AUDIO_LIMIT);
      await mkdir(audioDir, { recursive: true });
      await Promise.all([
        atomicWrite(path, body),
        atomicWrite(metaPath, `${JSON.stringify({ contentType: req.headers['content-type'] || 'application/octet-stream' })}\n`),
      ]);
      send(res, 204);
      return true;
    }
    if (req.method === 'DELETE') {
      await Promise.all([
        unlink(path).catch((error) => { if (error.code !== 'ENOENT') throw error; }),
        unlink(metaPath).catch((error) => { if (error.code !== 'ENOENT') throw error; }),
      ]);
      send(res, 204);
      return true;
    }
  }

  if (url.pathname === '/api/settings/ai' || url.pathname === '/api/settings/ai/test') {
    if (await handleAiSettings(req, res, url)) return true;
  }

  if (url.pathname === '/api/ai' && req.method === 'POST') {
    await handleAiChat(req, res);
    return true;
  }

  return false;
}

async function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendJson(res, 400, { error: 'Invalid path' });
    return;
  }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const path = resolve(publicDir, relative);
  if (path !== publicDir && !path.startsWith(`${publicDir}${sep}`)) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }
  try {
    const details = await stat(path);
    if (!details.isFile()) throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
    res.writeHead(200, {
      'Cache-Control': extname(path) === '.html' ? 'no-cache' : 'public, max-age=3600',
      'Content-Type': MIME[extname(path).toLowerCase()] || 'application/octet-stream',
      'Content-Length': details.size,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
    });
    if (req.method === 'HEAD') res.end();
    else streamFile(res, path);
  } catch (error) {
    if (error.code === 'ENOENT') sendJson(res, 404, { error: 'Not found' });
    else throw error;
  }
}

const hostSettings = [
  ['HARRINGTON_HOST', host],
  ['HARRINGTON_PUBLISHED_HOST', publishedHost],
  ...extraAllowedHosts.map((name) => ['HARRINGTON_ALLOWED_HOSTS', name]),
];
for (const [name, value] of hostSettings) {
  if (!validHost(value)) {
    console.error(`${name} must be an IP address or a host name; got ${JSON.stringify(value)}`);
    process.exit(1);
  }
}
if (authEnabled && accessToken.length < MIN_TOKEN_LENGTH) {
  console.error(`HARRINGTON_ACCESS_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters; see docs/DEPLOYMENT.md`);
  process.exit(1);
}

await mkdir(dataDir, { recursive: true });

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://harrington.local');
    if (!hostAllowed(req)) {
      send(res, 421, 'Harrington does not answer to this host name; add it to HARRINGTON_ALLOWED_HOSTS.\n', { 'Content-Type': 'text/plain; charset=utf-8' });
      return;
    }
    if (url.pathname === '/login' && ['GET', 'HEAD', 'POST'].includes(req.method)) await handleLogin(req, res, url);
    else if (!(await handleApi(req, res, url))) await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'Internal server error' });
  }
});

server.listen(port, host, () => {
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const shownHost = isIP(host) === 6 ? `[${host}]` : host;
  console.log(`Harrington listening at http://${shownHost}:${actualPort}`);
  console.log(`Family data directory: ${dataDir}`);
  console.log(bindIsLoopback
    ? `Bind address ${host} is loopback: only this computer can connect to it directly.`
    : `Bind address ${host} is not loopback: other devices can connect to it directly, unless a container or firewall stops them.`);
  if (publishedHost !== host) {
    console.log(hostIsLoopback
      ? `Published address ${publishedHost} is loopback: the app tells people it runs on this computer only.`
      : `Published address ${publishedHost}: other devices open Harrington there.`);
  }
  if (shared) {
    console.log(`Answering to host names: ${[...allowedHosts].join(', ')}, and any IP address (HARRINGTON_ALLOWED_HOSTS adds more).`);
    console.log('Other devices need HTTPS in front of Harrington for the microphone (docs/DEPLOYMENT.md).');
  }
  console.log(authEnabled
    ? 'Access token is on: each device signs in once at /login.'
    : `Access token is off${shared ? ': anyone who can reach this server can read and change family data' : ''}.`);
  if (aiCapabilityConfig.unknown.length) {
    console.warn(`Ignoring unknown HARRINGTON_AI_CAPABILITIES entries: ${aiCapabilityConfig.unknown.join(', ')}`);
  }
  aiSettings().then((ai) => {
    if (ai.configured) console.log(`AI (${ai.aiSource === 'app' ? 'set in the app' : 'from the environment'}) capabilities switched on: ${ai.capabilities.join(', ') || 'none'}`);
  });
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
