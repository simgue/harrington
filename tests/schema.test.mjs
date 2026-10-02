// The family document's data format (src/js/schema.js): ordered migrations on
// load and on import, and a newer format refused at import.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';

// A one-document server in memory, so the store's load and save can be watched.
let served = null;
const puts = [];
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

const schema = await import('../src/js/schema.js');
const store = await import('../src/js/store.js');
const { SCHEMA_VERSION, migrateDocument, schemaVersionOf } = schema;

const fixturesDir = new URL('./fixtures/schema/', import.meta.url);
const readFixture = async (name) => JSON.parse(await readFile(new URL(name, fixturesDir), 'utf8'));

test('there is one migration per schema step', () => {
  assert.equal(SCHEMA_VERSION, 1);
  assert.equal(schema.MIGRATION_COUNT, SCHEMA_VERSION);
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

test('a current or unreadable document is left as it is', () => {
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

test('a document from before schemaVersion loads, and its next save carries the field', async () => {
  served = await readFixture('v0.input.json');
  await store.loadAll();
  assert.equal(store.get().students[0].name, 'Sample Twelve');
  assert.equal(store.statusOf('s_older1', 'count-to-5'), 'mastered');
  assert.equal(puts.length, 0, 'loading alone does not save');

  store.setGraphView('list');
  await store.flushSaves();
  assert.equal(puts.length, 1);
  assert.equal(puts[0].schemaVersion, SCHEMA_VERSION);
  assert.equal(served.schemaVersion, SCHEMA_VERSION);
});

test('import migrates an older export before saving it, and export carries the field', async () => {
  const older = await readFixture('v0.input.json');
  assert.equal(await store.importDocument(older), true);
  assert.equal(puts.at(-1).schemaVersion, SCHEMA_VERSION);
  assert.equal(store.get().students[0].name, 'Sample Twelve');
  const exported = await store.exportDocument();
  assert.equal(exported.schemaVersion, SCHEMA_VERSION);
  await assert.rejects(store.importDocument({ schemaVersion: SCHEMA_VERSION + 1, students: [] }), /newer version of Harrington/);
});
