// HTTP API smoke against both app servers (no browser).
import { test as base, expect } from '@playwright/test';
import { Api } from './fixtures.mjs';
import { URLS } from './support/env.mjs';
import { familyState } from './support/family.mjs';

const test = base.extend({
  api: async ({ request }, use) => use(new Api(request, URLS.appAi)),
});

test('health reports self-hosted mode, AI and taxonomy cache', async ({ request }) => {
  const ai = await (await request.get(`${URLS.appAi}/api/health`)).json();
  expect(ai).toMatchObject({ ok: true, mode: 'self-hosted', aiConfigured: true, redaction: 'server+client', taxonomyCached: true });
  expect(Number.isInteger(ai.stateVersion)).toBe(true);
  expect(Number.isInteger(ai.stateBytes)).toBe(true);
  const noAi = await (await request.get(`${URLS.appNoAi}/api/health`)).json();
  expect(noAi).toMatchObject({ ok: true, mode: 'self-hosted', aiConfigured: false, taxonomyCached: true });
});

test('taxonomy files are served from the cache; unknown names are 404', async ({ request }) => {
  const topics = await request.get(`${URLS.appAi}/api/taxonomy/topics.json`);
  expect(topics.status()).toBe(200);
  expect(topics.headers()['cache-control']).toBe('private, max-age=3600');
  expect((await topics.json()).topics).toHaveLength(1590);
  for (const name of ['dependencies.json', 'clusters.json', 'manifest.json']) {
    expect((await request.get(`${URLS.appAi}/api/taxonomy/${name}`)).status()).toBe(200);
  }
  const unknown = await request.get(`${URLS.appAi}/api/taxonomy/secrets.json`);
  expect(unknown.status()).toBe(404);
  expect(await unknown.json()).toEqual({ error: 'Unknown taxonomy file' });
});

const withoutVersion = ({ version, updatedAt, writeId, ...rest }) => rest;

test('family state round-trips and rejects bad bodies', async ({ api, request }) => {
  const state = familyState();
  await api.putState(state);
  const { state: back, etag } = await api.getState();
  expect(withoutVersion(back)).toEqual(state);
  expect(etag).toBe(`"v${back.version}"`);

  const json = { 'Content-Type': 'application/json', 'If-Match': etag };
  const bad = await request.put(`${URLS.appAi}/api/state`, { headers: json, data: 'not json' });
  expect(bad.status()).toBe(400);
  const arr = await request.put(`${URLS.appAi}/api/state`, { headers: json, data: '[1,2]' });
  expect(arr.status()).toBe(400);
  expect(await arr.json()).toEqual({ error: 'Request body must be a JSON object' });
  // Still intact.
  expect(withoutVersion((await api.getState()).state)).toEqual(state);
  await api.reset();
});

test('versioned state (HAR-10): 428 without If-Match, 412 when stale, 403 cross-site', async ({ api, request }) => {
  await api.putState(familyState());
  const { state, etag } = await api.getState();
  const url = `${URLS.appAi}/api/state`;
  const missing = await request.put(url, { headers: { 'Content-Type': 'application/json' }, data: state });
  expect(missing.status()).toBe(428);

  const ok = await request.put(url, { headers: { 'Content-Type': 'application/json', 'If-Match': etag }, data: { ...state, graphView: 'list' } });
  expect(ok.status()).toBe(204);
  expect(ok.headers().etag).toBe(`"v${state.version + 1}"`);

  const stale = await request.put(url, { headers: { 'Content-Type': 'application/json', 'If-Match': etag }, data: state });
  expect(stale.status()).toBe(412);
  const current = await stale.json();
  expect(current.version).toBe(state.version + 1);
  expect(current.graphView).toBe('list');

  const crossSite = await request.put(url, { headers: { 'Content-Type': 'application/json', 'If-Match': `"v${current.version}"`, 'Sec-Fetch-Site': 'cross-site' }, data: state });
  expect(crossSite.status()).toBe(403);
  await api.reset();
});

test('unload beacon (HAR-10): POST carries the version in the body; 415, 403, 400 and 412 guard it', async ({ api, request }) => {
  await api.putState(familyState());
  const { state } = await api.getState();
  const url = `${URLS.appAi}/api/state`;
  const body = (extra) => JSON.stringify({ ...state, ...extra });

  // A cross-site HTML form can POST text/plain without a preflight; refused.
  const text = await request.post(url, { headers: { 'Content-Type': 'text/plain' }, data: body({ graphView: 'list' }) });
  expect(text.status()).toBe(415);
  const crossSite = await request.post(url, { headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' }, data: body({ graphView: 'list' }) });
  expect(crossSite.status()).toBe(403);
  // Neither changed anything.
  expect((await api.getState()).state.version).toBe(state.version);

  // What navigator.sendBeacon sends: JSON, no If-Match, `version` in the body.
  const beacon = await request.post(url, { headers: { 'Content-Type': 'application/json' }, data: body({ graphView: 'list', writeId: 'w_e2e_beacon' }) });
  expect(beacon.status()).toBe(204);
  expect(beacon.headers().etag).toBe(`"v${state.version + 1}"`);
  const after = (await api.getState()).state;
  expect(after.version).toBe(state.version + 1);
  expect(after.graphView).toBe('list');
  expect(after.writeId).toBe('w_e2e_beacon');

  // The same beacon again is stale now.
  const stale = await request.post(url, { headers: { 'Content-Type': 'application/json' }, data: body({ graphView: 'atlas' }) });
  expect(stale.status()).toBe(412);
  expect((await stale.json()).version).toBe(state.version + 1);
  // A POST with neither If-Match nor a body version has no precondition.
  const { version: _v, ...noVersion } = state;
  const missing = await request.post(url, { headers: { 'Content-Type': 'application/json' }, data: JSON.stringify(noVersion) });
  expect(missing.status()).toBe(428);

  // A malformed If-Match is a client error, not a conflict.
  const malformed = await request.put(url, { headers: { 'Content-Type': 'application/json', 'If-Match': 'yesterday' }, data: after });
  expect(malformed.status()).toBe(400);
  expect((await api.getState()).state.version).toBe(state.version + 1);
  await api.reset();
});

test('lessons: 404 until saved, then returned; arrays are refused', async ({ request }) => {
  const key = encodeURIComponent(`topic:e2e-api-${Date.now()}`);
  expect((await request.get(`${URLS.appAi}/api/lessons/${key}`)).status()).toBe(404);
  const put = await request.put(`${URLS.appAi}/api/lessons/${key}`, { data: { objective: 'x' } });
  expect(put.status()).toBe(204);
  expect(await (await request.get(`${URLS.appAi}/api/lessons/${key}`)).json()).toEqual({ objective: 'x' });
  // The endpoint only stores objects. Recall cards used to be sent as a bare
  // array and were refused (F1); HAR-20 wraps them as { cards } (topic.spec).
  const cards = await request.put(`${URLS.appAi}/api/lessons/${encodeURIComponent('recall:e2e')}`, {
    headers: { 'Content-Type': 'application/json' }, data: JSON.stringify([{ id: 'a::0', front: 'q', back: 'a' }]),
  });
  expect(cards.status()).toBe(400);
});

test('audio: put, get with content type, delete', async ({ request }) => {
  const name = `e2e-api-${Date.now()}.webm`;
  const put = await request.put(`${URLS.appAi}/api/audio/${name}`, { headers: { 'Content-Type': 'audio/webm' }, data: Buffer.from('abc123') });
  expect(put.status()).toBe(204);
  const get = await request.get(`${URLS.appAi}/api/audio/${name}`);
  expect(get.status()).toBe(200);
  expect(get.headers()['content-type']).toBe('audio/webm');
  expect((await get.body()).toString()).toBe('abc123');
  expect((await request.delete(`${URLS.appAi}/api/audio/${name}`)).status()).toBe(204);
  expect((await request.get(`${URLS.appAi}/api/audio/${name}`)).status()).toBe(404);
});

test('static files, 404s, traversal and methods', async ({ request }) => {
  const index = await request.get(`${URLS.appAi}/`);
  expect(index.status()).toBe(200);
  expect(await index.text()).toContain('<title>Harrington');
  expect(index.headers()['x-frame-options']).toBe('SAMEORIGIN');
  expect((await request.get(`${URLS.appAi}/js/app.js`)).headers()['content-type']).toContain('text/javascript');
  expect((await request.get(`${URLS.appAi}/nope.html`)).status()).toBe(404);
  expect((await request.get(`${URLS.appAi}/..%2f..%2fserver.mjs`)).status()).toBe(404);
  expect((await request.get(`${URLS.appAi}/%E0%A4%A`)).status()).toBe(400);
  expect((await request.post(`${URLS.appAi}/index.html`)).status()).toBe(405);
});

test('AI proxy: 400 without messages, 200 through the mock, 503 with no provider', async ({ request }) => {
  const noMessages = await request.post(`${URLS.appAi}/api/ai`, { data: { model: 'small' } });
  expect(noMessages.status()).toBe(400);
  expect(await noMessages.json()).toEqual({ error: 'Request body must include a messages array' });

  const ok = await request.post(`${URLS.appAi}/api/ai`, { data: { messages: [{ role: 'user', content: 'Explain the topic "Counting" simply.' }], model: 'gpt-4o' } });
  expect(ok.status()).toBe(200);
  expect((await ok.json()).content).toContain('sharing snacks');

  const off = await request.post(`${URLS.appNoAi}/api/ai`, { data: { messages: [{ role: 'user', content: 'hi' }] } });
  expect(off.status()).toBe(503);
  expect(await off.json()).toEqual({ error: 'AI is not configured for this self-hosted Harrington server' });
});

test('AI proxy reports a failing provider as 502 without leaking details', async ({ request }) => {
  await request.post(`${URLS.mockAi}/__fail`, { data: { count: 1 } });
  const res = await request.post(`${URLS.appAi}/api/ai`, { data: { messages: [{ role: 'user', content: 'hi' }] } });
  expect(res.status()).toBe(502);
  expect(await res.json()).toEqual({ error: 'The AI provider failed' });
});
