// The family document's data format. SCHEMA_VERSION is the format this code
// writes; MIGRATIONS[n] turns a document at schema n into schema n + 1. The
// store runs them on load and on import, and server.mjs stamps a new document.
// Dependency-free so the server can import it as is.
//
// To change the format: bump SCHEMA_VERSION, append the migration here, and
// add tests/fixtures/schema/v<old>.input.json with its expected result (and
// update the expected file of every older fixture) for tests/schema.test.mjs.
export const SCHEMA_VERSION = 1;

const MIGRATIONS = [
  // 0 -> 1: documents from before schemaVersion existed already have the
  // schema 1 shape; they only gain the field.
  (doc) => doc,
];

// The schema a document declares; one without the field is schema 0. Null
// when the field is there but is not a whole number of zero or more.
export function schemaVersionOf(doc) {
  const v = doc?.schemaVersion;
  if (v === undefined || v === null) return 0;
  return Number.isSafeInteger(v) && v >= 0 ? v : null;
}

export function isNewerSchema(doc) {
  const v = schemaVersionOf(doc);
  return v !== null && v > SCHEMA_VERSION;
}

// Runs every migration from the document's schema up to SCHEMA_VERSION, in
// order, and returns a new document at SCHEMA_VERSION. A document from a newer
// schema, or with an unreadable schemaVersion, is returned unchanged:
// inspectImport refuses those, and a newer document loaded from the server is
// not downgraded.
export function migrateDocument(doc) {
  const from = schemaVersionOf(doc);
  if (from === null || from >= SCHEMA_VERSION) return doc;
  let next = { ...doc };
  for (let v = from; v < SCHEMA_VERSION; v++) next = { ...MIGRATIONS[v](next), schemaVersion: v + 1 };
  return next;
}

export const MIGRATION_COUNT = MIGRATIONS.length;
