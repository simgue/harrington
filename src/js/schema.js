// The family document's data format. SCHEMA_VERSION is the format this code
// writes; MIGRATIONS[n] turns a document at schema n into schema n + 1. The
// store runs them on load and on import, and server.mjs stamps a new document.
// Dependency-free so the server can import it as is.
//
// schemaVersion changes only when the meaning of an existing field changes. A
// new top-level field needs no bump: the store keeps fields it does not know
// through load and save.
//
// To add a migration: append it to MIGRATIONS (SCHEMA_VERSION follows), add
// tests/fixtures/schema/v<old>.input.json with its v<old>.expected.json, and
// update the expected file of every older fixture (tests/schema.test.mjs).
// Migrations are synchronous. One that needs outside input, such as a salt
// for hashing the child-view PIN, reads it from `context`, which the caller
// passes to migrateDocument.

// Each entry: (doc, context) => doc at the next schema. It receives a copy and
// may change it; migrateDocument sets schemaVersion afterwards.
export const MIGRATIONS = [
  // 0 -> 1: documents from before schemaVersion existed already have the
  // schema 1 shape; they only gain the field.
  (doc) => doc,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

// The schema a document declares; one without the field is schema 0. Null
// when the field is there but is not a whole number of zero or more.
export function schemaVersionOf(doc) {
  const v = doc?.schemaVersion;
  if (v === undefined || v === null) return 0;
  return Number.isSafeInteger(v) && v >= 0 ? v : null;
}

// A document this code must not write back: from a newer schema, or with an
// unreadable one. The store opens it read-only.
export function isNewerSchema(doc) {
  const v = schemaVersionOf(doc);
  return v !== null && v > SCHEMA_VERSION;
}
export function isUnwritableSchema(doc) {
  return schemaVersionOf(doc) === null || isNewerSchema(doc);
}

// Runs every migration from the document's schema up to the end of the chain,
// in order, and returns a new document. A document from a newer schema, or
// with an unreadable schemaVersion, is returned unchanged. `migrations` and
// `context` are injectable for tests and for a step that needs outside input.
export function migrateDocument(doc, { migrations = MIGRATIONS, context = {} } = {}) {
  const from = schemaVersionOf(doc);
  if (from === null || from >= migrations.length) return doc;
  let next = { ...doc };
  for (let v = from; v < migrations.length; v++) {
    next = { ...migrations[v]({ ...next }, context), schemaVersion: v + 1 };
  }
  return next;
}
