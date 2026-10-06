import { createReadStream } from 'node:fs';
import { chmod, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_TIMEOUT_MS, chatCompletion, knownCapabilities, readStoredAiSettings, resolveAiSettings, validTimeout,
} from './lib/ai-provider.mjs';
import { isLoopbackAddress } from './lib/loopback.mjs';
import { AI_CAPABILITIES, capabilityOffMessage, parseCapabilities } from './src/js/ai-capabilities.js';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(repoRoot, 'src');
const dataDir = resolve(process.env.HARRINGTON_DATA_DIR || join(repoRoot, 'data', 'private'));
const lessonsDir = join(dataDir, 'lessons');
const audioDir = join(dataDir, 'audio');
const taxonomyDir = join(dataDir, 'taxonomy');
const stateFile = join(dataDir, 'family-state.json');
// AI provider settings saved from the app, including any API key (see aiSettings()).
const secretsFile = join(dataDir, 'secrets.json');
const host = process.env.HARRINGTON_HOST || '127.0.0.1';
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
function stateVersionOf(doc) {
  return Number.isSafeInteger(doc?.version) && doc.version >= 0 ? doc.version : 0;
}

async function readStateDocument() {
  const doc = await readJsonFile(stateFile, {});
  const value = doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : {};
  return { ...value, version: stateVersionOf(value) };
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
    const current = await readStateDocument();
    if (current.version !== expected) return { ok: false, current };
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
  const result = await writeStateIfMatch(expected, value);
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

// Whether /api/* requires an access token. Nothing does yet; HAR-25 brings
// the token gate, and this returns its flag once that lands.
function accessTokenEnabled() {
  return false;
}

// Repointing the provider would send it every later prompt, so without an
// access token only the computer running Harrington may change it (or run
// the connection test). The socket address decides; X-Forwarded-For does not.
const LOCAL_ONLY = 'AI provider settings can only be changed from the computer running Harrington, or from any signed-in device once an access token is set';
function canChangeAiSettings(req) {
  return accessTokenEnabled() || isLoopbackAddress(req.socket.remoteAddress);
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

  const result = await chatCompletion(settings, body.messages);
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

async function handleApi(req, res, url) {
  if (url.pathname === '/api/health' && req.method === 'GET') {
    const ai = await aiSettings();
    sendJson(res, 200, {
      ok: true,
      mode: 'self-hosted',
      aiConfigured: ai.configured,
      aiSource: ai.aiSource,
      aiCapabilities: ai.capabilities,
      taxonomyCached: await taxonomyCached(),
      ...(await stateHealth()),
    });
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

await mkdir(dataDir, { recursive: true });

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://harrington.local');
    if (!(await handleApi(req, res, url))) await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'Internal server error' });
  }
});

server.listen(port, host, () => {
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  console.log(`Harrington listening at http://${host}:${actualPort}`);
  console.log(`Family data directory: ${dataDir}`);
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
