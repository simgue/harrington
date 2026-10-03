// The family document's data format (src/js/schema.js): ordered migrations on
// load and on import, unknown fields kept, and a newer format opened
// read-only.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';

// A one-document server in memory, so the store's load and save can be watched.
let served = null;
const puts = [];
const beacons = [];
globalThis.fetch = async (path, options = {}) => {
  const json = (status, value, version) => ({
    ok: status < 400, status, headers: new Headers(version === undefined ? {} : { ETag: `"v${version}"` }), json: async () => value,
  });
  if (path === '/api/state' && (options.method || 'GET') === 'GET') return json(200, served, served.version);
  if (path === '/api/state' && options.method === 'PUT') {
    const body = JSON.parse(options.body);
    puts.push(body);
    served = { ...body, version: served.version + 1 };
    return json(204, null, served.version);
  }
  return json(404, { error: 'not found' });
};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { sendBeacon: (url, blob) => { beacons.push(url); return true; } },
});

const schema = await import('../src/js/schema.js');
const store = await import('../src/js/store.js');
const { documentFields } = await import('../src/js/document.js');
const { SCHEMA_VERSION, MIGRATIONS, migrateDocument, schemaVersionOf } = schema;

const fixturesDir = new URL('./fixtures/schema/', import.meta.url);
const readFixture = async (name) => JSON.parse(await readFile(new URL(name, fixturesDir), 'utf8'));
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const load = async (doc) => { served = doc; puts.length = 0; beacons.length = 0; await store.loadAll(); await store.flushSaves(); await settle(); };

test('the schema is the length of the migration chain', () => {
  assert.equal(SCHEMA_VERSION, 1);
  assert.equal(MIGRATIONS.length, SCHEMA_VERSION);
});

// Every vN.input.json is a document at schema N; migrating it must give its
// vN.expected.json, which is always at the current schema.
const inputs = (await readdir(fixturesDir)).filter((f) => /^v\d+\.input\.json$/.test(f)).sort();
test('the fixtures cover every older schema', () => {
  assert.deepEqual(inputs, Array.from({ length: SCHEMA_VERSION }, (_, n) => `v${n}.input.json`));
});
for (const input of inputs) {
  test(`${input} migrates to the current schema`, async () => {
    const doc = await readFixture(input);
    const expected = await readFixture(input.replace('.input.', '.expected.'));
    assert.equal(schemaVersionOf(doc), Number(input.match(/\d+/)[0]));
    const migrated = migrateDocument(doc);
    assert.deepEqual(migrated, expected);
    assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(doc, await readFixture(input), 'the input document is not changed in place');
    assert.equal(store.inspectImport(migrated).ok, true);
  });
}

test('injected migrations run in order, each once, with the caller\'s context', () => {
  const calls = [];
  const migrations = [
    (doc) => { calls.push(0); return { ...doc, a: 1 }; },
    (doc, context) => { calls.push(1); return { ...doc, pinHash: `${context.salt}:${doc.pin}`, pin: undefined }; },
  ];
  const out = migrateDocument({ pin: '2468' }, { migrations, context: { salt: 'test-salt' } });
  assert.deepEqual(calls, [0, 1]);
  assert.deepEqual(out, { a: 1, pinHash: 'test-salt:2468', pin: undefined, schemaVersion: 2 });
  // From schema 1, only the second step runs.
  calls.length = 0;
  migrateDocument({ schemaVersion: 1, pin: '1' }, { migrations, context: { salt: 's' } });
  assert.deepEqual(calls, [1]);
});

test('a current, newer or unreadable document is left as it is', () => {
  const current = { schemaVersion: SCHEMA_VERSION, students: [] };
  assert.equal(migrateDocument(current), current);
  const newer = { schemaVersion: SCHEMA_VERSION + 1, students: [] };
  assert.equal(migrateDocument(newer), newer);
  assert.equal(schemaVersionOf({ schemaVersion: '1' }), null);
  assert.equal(schemaVersionOf({ schemaVersion: -1 }), null);
  assert.equal(schemaVersionOf({ schemaVersion: null }), 0);
});

test('import refuses a newer or unreadable data format with a clear message', () => {
  const newer = { schemaVersion: SCHEMA_VERSION + 1, students: [] };
  assert.deepEqual(store.inspectImport(newer), {
    ok: false,
    error: `The file comes from a newer version of Harrington (data format ${SCHEMA_VERSION + 1}; this one reads up to ${SCHEMA_VERSION}). Update Harrington, then import it.`,
    learners: [],
  });
  assert.equal(store.inspectImport({ schemaVersion: 'one', students: [] }).error, 'The file\'s data format version is not a number.');
  assert.equal(store.inspectImport({ schemaVersion: SCHEMA_VERSION, students: [] }).ok, true);
});

test('a load that migrates saves once, right away, as a versioned save', async () => {
  await load({ ...(await readFixture('v0.input.json')), version: 12 });
  assert.equal(store.get().students[0].name, 'Sample Twelve');
  assert.equal(store.statusOf('s_older1', 'count-to-5'), 'mastered');
  assert.equal(puts.length, 1, 'one save');
  assert.equal(puts[0].schemaVersion, SCHEMA_VERSION);
  assert.equal(served.version, 13, 'saved against the loaded version');
  assert.equal(store.isReadOnly(), false);
});

test('a load that does not migrate never writes', async () => {
  await load({ ...(await readFixture('v0.expected.json')), version: 20 });
  assert.equal(puts.length, 0);
  assert.equal(beacons.length, 0);
});

test('an unknown top-level field round-trips through load and save unchanged', async () => {
  const levelset = { s_older1: { Mathematics: 'stretch' } };
  await load({ ...(await readFixture('v0.expected.json')), levelset, version: 30 });
  store.setGraphView('list');
  await store.flushSaves();
  assert.equal(puts.length, 1);
  assert.deepEqual(puts[0].levelset, levelset);
  assert.equal(puts[0].graphView, 'list');
  // Every saved field comes from documentFields, plus the unknown one.
  assert.deepEqual(Object.keys(puts[0]).sort(), [...documentFields, 'levelset', 'writeId'].sort());
});

for (const [label, schemaVersion] of [['a newer', SCHEMA_VERSION + 1], ['an unreadable', 'two']]) {
  test(`${label} data format opens read-only: no save, beacon or import`, async () => {
    await load({ ...(await readFixture('v0.expected.json')), schemaVersion, futureField: [1], version: 40 });
    assert.equal(store.isReadOnly(), true);
    assert.equal(store.get().students[0].name, 'Sample Twelve', 'the data is still shown');
    const statuses = [];
    const off = store.onSaveStatus((event) => statuses.push(event.type));
    store.setGraphView(store.graphView() === 'list' ? 'atlas' : 'list');
    await store.flushSaves();
    store.handlePageHidden();
    await assert.rejects(store.importDocument(await readFixture('v0.expected.json')), /saved by a newer version of Harrington/);
    await settle();
    off();
    assert.equal(puts.length, 0, 'nothing saved');
    assert.equal(beacons.length, 0, 'no unload beacon');
    assert.equal(served.schemaVersion, schemaVersion, 'the stored document keeps its format');
    assert.ok(statuses.includes('read-only'));
  });
}

test('import migrates an older export before saving it, and export carries the field', async () => {
  await load({ ...(await readFixture('v0.expected.json')), version: 50 });
  const older = await readFixture('v0.input.json');
  assert.equal(await store.importDocument(older), true);
  assert.equal(puts.at(-1).schemaVersion, SCHEMA_VERSION);
  assert.equal(store.get().students[0].name, 'Sample Twelve');
  const exported = await store.exportDocument();
  assert.equal(exported.schemaVersion, SCHEMA_VERSION);
  await assert.rejects(store.importDocument({ schemaVersion: SCHEMA_VERSION + 1, students: [] }), /newer version of Harrington/);
});

test('import moves an off-palette learner color to the nearest palette color and counts it', async () => {
  await load({ ...(await readFixture('v0.expected.json')), version: 60 });
  const doc = await readFixture('v0.expected.json');
  doc.students = [
    { ...doc.students[0], color: '#b0603a' }, // the first palette's rust
    { id: 's_other', name: 'Sample Fifteen', birthYear: 2017, color: store.PALETTE[3] },
  ];
  assert.equal(store.inspectImport(doc).colorsAdjusted, 1);
  assert.equal(await store.importDocument(doc), true);
  assert.deepEqual(puts.at(-1).students.map((s) => s.color), ['#a4473a', store.PALETTE[3]]);
});
