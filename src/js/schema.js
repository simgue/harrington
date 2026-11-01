// The family document's data format. SCHEMA_VERSION is the format this code
// writes; MIGRATIONS[n] turns a document at schema n into schema n + 1. The
// store runs them on load and on import, and server.mjs stamps a new document.
// Dependency-free (pin.js and document.js are plain JS too) so the server can
// import it as is.
//
// schemaVersion changes only when the meaning of an existing field changes. A
// new top-level field needs no bump: the store keeps fields it does not know
// through load and save. Nor does a new optional field on a learner (such as
// `curriculum`): an older document simply lacks it, which means what it meant
// before, and document.js checks it only when it is there.
//
// To add a migration: append it to MIGRATIONS (SCHEMA_VERSION follows), add
// tests/fixtures/schema/v<old>.input.json with its v<old>.expected.json, and
// update the expected file of every older fixture (tests/schema.test.mjs).
// Migrations are synchronous. One that needs outside input, such as the salt
// for hashing the child-view PIN, reads it from `context`, which the caller
// passes to migrateDocument; `context.from` is the format the document had
// before the first step.
import { migratePinSettings } from './pin.js';
import { repairDocument } from './document.js';

// Each entry: (doc, context) => doc at the next schema. It receives a copy and
// may change it; migrateDocument sets schemaVersion afterwards.
export const MIGRATIONS = [
  // 0 -> 1: documents from before schemaVersion existed already have the
  // schema 1 shape; they only gain the field.
  (doc) => doc,
  // 1 -> 2: the child-view PIN is kept only as a salted hash (PR #38):
  // settings.parentPin becomes parentPinHash and parentPinSalt, and a
  // malformed hash or salt is dropped. context.salt fixes the salt in tests;
  // otherwise each family gets a random one.
  (doc, { salt } = {}) => (doc.settings === undefined
    ? doc
    : { ...doc, settings: migratePinSettings(doc.settings, { salt }) }),
  // 2 -> 3: a one-time repair of values saved before the server checked
  // every save (PR #32) that validateDocument now refuses, which would block
  // every save (HAR-39): over-long names and record texts are shortened,
  // birth years clamped and non-object entries dropped, with a notification
  // listing what changed. context.keepsCopy is set only for a document loaded
  // from the server, whose first save in the new format keeps the stored file
  // (formatCopyName; `from` is the format the migration started from): the
  // notice then names that file. An import never names one, as the server
  // keeps no copy of it. context.now fixes the date in tests.
  (doc, { now, from, keepsCopy = false } = {}) => repairDocument(doc, {
    ...(now === undefined ? {} : { now }),
    copy: keepsCopy ? formatCopyName(from) : null,
  }),
];

export const SCHEMA_VERSION = MIGRATIONS.length;

// The copy of the family data the server keeps when the first save in a newer
// format replaces a document stored in format `format` (server.mjs), named in
// the repair notice so a parent can get back what a migration changed.
export function formatCopyName(format) {
  return `family-state.format-${format}.json`;
}

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
    next = { ...migrations[v]({ ...next }, { ...context, from }), schemaVersion: v + 1 };
  }
  return next;
}
