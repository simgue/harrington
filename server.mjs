import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(repoRoot, 'src');
const dataDir = resolve(process.env.HARRINGTON_DATA_DIR || join(repoRoot, 'data', 'private'));
const lessonsDir = join(dataDir, 'lessons');
const audioDir = join(dataDir, 'audio');
const stateFile = join(dataDir, 'family-state.json');
const host = process.env.HARRINGTON_HOST || '127.0.0.1';
const configuredPort = Number.parseInt(process.env.HARRINGTON_PORT || process.env.PORT || '4173', 10);
const port = Number.isInteger(configuredPort) && configuredPort >= 0 ? configuredPort : 4173;
const JSON_LIMIT = 5 * 1024 * 1024;
const AUDIO_LIMIT = 100 * 1024 * 1024;

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
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

function atomicWrite(path, data) {
  const previous = writeQueues.get(path) || Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    await mkdir(dataDir, { recursive: true });
    const tempPath = `${path}.${process.pid}.tmp`;
    await writeFile(tempPath, data);
    await rename(tempPath, path);
  });
  writeQueues.set(path, operation);
  const cleanup = () => {
    if (writeQueues.get(path) === operation) writeQueues.delete(path);
  };
  operation.then(cleanup, cleanup);
  return operation;
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

async function handleApi(req, res, url) {
  if (url.pathname === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, mode: 'self-hosted', aiConfigured: false });
    return true;
  }

  if (url.pathname === '/api/state') {
    if (req.method === 'GET') {
      sendJson(res, 200, await readJsonFile(stateFile, {}));
      return true;
    }
    if (req.method === 'PUT') {
      const value = await readJson(req);
      await atomicWrite(stateFile, `${JSON.stringify(value, null, 2)}\n`);
      send(res, 204);
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

  if (url.pathname === '/api/ai' && req.method === 'POST') {
    sendJson(res, 503, { error: 'AI is not configured for this self-hosted Harrington server' });
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
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
