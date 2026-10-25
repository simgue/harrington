// The shape of the family document, checked in one place: by the store before
// an import and by server.mjs on every save (PUT /api/state and the unload
// beacon). Dependency-free so the server can import it as is.
//
// validateDocument() returns null for a document the app can render, or a
// short reason a parent can act on. Fields an older document may lack are
// optional; anything present must have the shape the views read.

import { HASH_PATTERN, SALT_PATTERN } from './pin.js';

// Per-learner maps keyed by learner id.
export const LEARNER_KEYS = ['progress', 'records', 'tests', 'plan', 'challenges', 'adaptations',
  'suggestions', 'recall', 'practice', 'activity', 'game', 'daily', 'interests', 'levelset'];

// Every top-level key the app saves, in one list: the store's snapshot sends
// these, its documentFields() reads them back and a conflict compares them, so
// they never drift. A new stored field joins here. Keys a document carries that
// are not listed (from a newer Harrington) are kept through load and save.
export const DOCUMENT_KEYS = ['students', 'activeStudentId', 'notifications', 'dismissedAlerts',
  'graphView', 'settings', 'schemaVersion', ...LEARNER_KEYS];

// Top-level keys an earlier Harrington saved and this one has retired (PR #36
// replaced curriculumSnapshot with computed alerts). They are dropped on the
// next save rather than kept as unknown fields.
export const RETIRED_FIELDS = ['curriculumSnapshot'];

// Bookkeeping the server adds (version, updatedAt, writeId) or an export adds
// (exportedAt, taxonomyVersion, unsavedChanges); never family data.
export const BOOKKEEPING_FIELDS = ['version', 'updatedAt', 'writeId', 'exportedAt', 'taxonomyVersion', 'unsavedChanges'];

export const MASTERY_STATUSES = ['none', 'learning', 'practicing', 'mastered'];
// 'note' is the label the record views fall back to for an older record.
export const RECORD_TYPES = ['observation', 'question', 'discussion', 'assessment', 'recording', 'note'];
export const MIN_BIRTH_YEAR = 1990;
// The one limit on a learner's name: the Add and Edit forms' maxlength and
// what a save accepts. A longer name saved before there was a limit is
// shortened by the format 3 repair (repairDocument).
export const NAME_MAX = 60;
// Generous bounds: they stop a hostile file, not a long transcript.
export const TEXT_MAX = { title: 1_000, note: 50_000, transcript: 200_000, analysis: 200_000, topicName: 1_000 };

export const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
const absent = v => v === undefined || v === null;
const isCount = v => Number.isSafeInteger(v) && v >= 0;
const isFiniteNumber = v => typeof v === 'number' && Number.isFinite(v);
export const validMonth = m => Number.isInteger(m) && m >= 1 && m <= 12;
export const validYear = y => Number.isInteger(y) && y >= MIN_BIRTH_YEAR && y <= new Date().getFullYear();
export const validDateKey = k => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);
export const realDateKey = k => {
  if (!validDateKey(k)) return false;
  const [y, m, d] = k.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};
// Learner ids become object keys and DOM ids: plain characters only, and never
// a built-in property name such as "constructor" or "__proto__".
const validLearnerId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id) && !(id in Object.prototype);

// What is wrong with one learner, as the end of "Learner 2 in the file …", or null.
// A learner's name as a message gives it, or null when the name is itself
// the problem (missing, empty or too long).
function usableName(s) {
  const name = typeof s?.name === 'string' ? s.name.trim() : '';
  return name && name.length <= NAME_MAX ? nameOf(s) : null;
}

function learnerProblem(s) {
  if (!isObject(s) || typeof s.name !== 'string' || absent(s.id)) return 'is missing an id or name';
  if (!validLearnerId(s.id)) return 'has an id that is not 1 to 64 letters, digits, "-" or "_"';
  const name = s.name.trim();
  if (!name) return 'has an empty name';
  if (name.length > NAME_MAX) return `has a name longer than ${NAME_MAX} characters`;
  if (!absent(s.birthYear) && !validYear(s.birthYear)) return `has a birth year outside ${MIN_BIRTH_YEAR} to this year`;
  if (!absent(s.birthMonth) && !validMonth(s.birthMonth)) return 'has a birth month outside 1 to 12';
  if (!absent(s.startDate) && !realDateKey(s.startDate)) return 'has a start date that is not a yyyy-mm-dd date';
  // Colors outside the palette are replaced on import; only a hex color gets that far.
  if (!absent(s.color) && !(typeof s.color === 'string' && /^#[0-9a-f]{6}$/i.test(s.color))) return 'has a color that is not a hex color';
  return null;
}

const textProblem = (value, max) => !absent(value) && !(typeof value === 'string' && value.length <= max);

function recordProblem(r) {
  if (!isObject(r)) return 'is not a record';
  if (!RECORD_TYPES.includes(r.type)) return `has a type other than ${RECORD_TYPES.join(', ')}`;
  if (!absent(r.rating) && !(Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5)) return 'has a rating outside 1 to 5';
  for (const [field, max] of Object.entries(TEXT_MAX)) {
    if (textProblem(r[field], max)) return `has a ${field} that is not text of at most ${max.toLocaleString('en-US')} characters`;
  }
  if (!absent(r.createdAt) && !isFiniteNumber(r.createdAt)) return 'has a date that is not a number';
  if (!absent(r.duration) && !(isFiniteNumber(r.duration) && r.duration >= 0)) return 'has a duration that is not a number';
  if (!absent(r.placement) && !(isObject(r.placement) && Array.isArray(r.placement.topicIds))) return 'has a placement that is not in the expected shape';
  return null;
}

function testProblem(t) {
  if (!isObject(t)) return 'is not a test result';
  if (!absent(t.pct) && !(isFiniteNumber(t.pct) && t.pct >= 0 && t.pct <= 100)) return 'has a score outside 0 to 100%';
  // AI-written questions can carry fractional points, so a score is any
  // number of zero or more (no view shows it; pct is what is rendered).
  for (const field of ['score', 'total']) {
    if (!absent(t[field]) && !(isFiniteNumber(t[field]) && t[field] >= 0)) return `has a ${field} that is not a number of zero or more`;
  }
  if (!absent(t.passed) && typeof t.passed !== 'boolean') return 'has a pass mark that is not true or false';
  if (!absent(t.createdAt) && !isFiniteNumber(t.createdAt)) return 'has a date that is not a number';
  return null;
}

function challengeProblem(c) {
  if (!isObject(c)) return 'is not a challenge result';
  for (const field of ['correct', 'total', 'answered']) {
    if (!absent(c[field]) && !isCount(c[field])) return `has a ${field} count that is not a whole number`;
  }
  if (!absent(c.seconds) && !(isFiniteNumber(c.seconds) && c.seconds >= 0)) return 'has a time that is not a number';
  return null;
}

function notificationProblem(n) {
  if (!isObject(n)) return 'is not a notification';
  for (const field of ['id', 'type', 'title', 'body']) {
    if (textProblem(n[field], 2_000)) return `has a ${field} that is not text`;
  }
  if (!absent(n.read) && typeof n.read !== 'boolean') return 'has a read mark that is not true or false';
  const meta = n.meta;
  if (!absent(meta)) {
    if (!isObject(meta)) return 'has details that are not in the expected shape';
    if (!absent(meta.sampleNames) && !(Array.isArray(meta.sampleNames) && meta.sampleNames.every(x => typeof x === 'string'))) {
      return 'has sample names that are not a list of text';
    }
    if (!absent(meta.addedBySubject) && !(isObject(meta.addedBySubject) && Object.values(meta.addedBySubject).every(Array.isArray))) {
      return 'has added topics that are not lists';
    }
  }
  return null;
}

// Per-learner maps the views read without checking: each learner's value
// must have the shape the store's helpers assume (suggestions a list, the
// others objects), plus the nested lists the dashboard and calendar walk.
const LEARNER_OBJECTS = ['plan', 'daily', 'adaptations', 'recall', 'practice', 'activity'];
function learnerMapsProblem(doc) {
  const shape = (key) => `The file's "${key}" section is not in the expected shape.`;
  for (const value of Object.values(doc.suggestions || {})) {
    if (!(Array.isArray(value) && value.every(isObject))) return shape('suggestions');
  }
  for (const key of LEARNER_OBJECTS) {
    for (const value of Object.values(doc[key] || {})) if (!isObject(value)) return shape(key);
  }
  // Each card, practice item and adaptation is an object (the views read
  // .due and .level off every entry).
  for (const key of ['recall', 'practice', 'adaptations']) {
    for (const value of Object.values(doc[key] || {})) if (!Object.values(value).every(isObject)) return shape(key);
  }
  for (const plan of Object.values(doc.plan || {})) {
    for (const part of ['moves', 'done', 'extras']) if (!absent(plan[part]) && !isObject(plan[part])) return shape('plan');
    if (!Object.values(plan.extras || {}).every(list => Array.isArray(list) && list.every(isObject))) return shape('plan');
    // The catch-up pace (scheduler.js PACES); absent means the default.
    if (!absent(plan.pace) && !['catch-up-first', 'mixed'].includes(plan.pace)) return shape('plan');
  }
  for (const days of Object.values(doc.daily || {})) {
    for (const day of Object.values(days)) {
      if (!isObject(day)) return shape('daily');
      if (!absent(day.offers) && !(isObject(day.offers) && Object.values(day.offers).every(Array.isArray))) return shape('daily');
    }
  }
  return null;
}

function dismissedAlertsProblem(dismissed) {
  if (absent(dismissed)) return null;
  const ok = isObject(dismissed) && Object.values(dismissed).every(at => isFiniteNumber(at) && at >= 0);
  return ok ? null : 'The file\'s dismissed alerts are not in the expected shape.';
}

// The name a message gives the learner with `id`, so the parent knows whose
// data to look at: the file's name for them (cut to 40 characters), or null
// when the file names no such learner.
const LABEL_MAX = 40;
function learnerName(doc, id) {
  return nameOf((Array.isArray(doc.students) ? doc.students : []).find(s => isObject(s) && s.id === id));
}
function nameOf(s) {
  const name = typeof s?.name === 'string' ? s.name.trim() : '';
  if (!name) return null;
  return name.length > LABEL_MAX ? `${name.slice(0, LABEL_MAX - 1)}…` : name;
}
// " for Rowan" or "" when the learner has no name in the file.
const forLearner = (doc, id) => { const name = learnerName(doc, id); return name ? ` for ${name}` : ''; };
// "Rowan's" or "The file's".
const whose = (doc, id) => { const name = learnerName(doc, id); return name ? `${name}'s` : 'The file\'s'; };

// A record is named by its title; anything else (or a record without a usable
// title) by its position.
function itemLabel(item, section, i) {
  const title = typeof item?.title === 'string' ? item.title.trim() : '';
  if (!title || title.length > TEXT_MAX.title) return `${section} item ${i + 1}`;
  return `“${title.length > LABEL_MAX ? `${title.slice(0, LABEL_MAX - 1)}…` : title}”`;
}

// Each learner's list in `section` must be an array whose items pass `check`.
function listsProblem(doc, section, label, check) {
  for (const [id, list] of Object.entries(doc[section] || {})) {
    if (!Array.isArray(list)) return `The file's "${section}" section is not in the expected shape.`;
    for (const [i, item] of list.entries()) {
      const problem = check(item);
      if (problem) return `A ${label}${forLearner(doc, id)} in the file (${itemLabel(item, section, i)}) ${problem}.`;
    }
  }
  return null;
}

function progressProblem(doc) {
  for (const [id, entries] of Object.entries(doc.progress || {})) {
    if (!isObject(entries)) return 'The file\'s "progress" section is not in the expected shape.';
    for (const entry of Object.values(entries)) {
      if (!isObject(entry) || !MASTERY_STATUSES.includes(entry.status)) {
        return `${whose(doc, id)} progress has a status other than ${MASTERY_STATUSES.join(', ')}.`;
      }
    }
  }
  return null;
}

function gameProblem(doc) {
  for (const [id, g] of Object.entries(doc.game || {})) {
    if (!isObject(g)) return 'The file\'s "game" section is not in the expected shape.';
    if (!absent(g.xp) && !(isFiniteNumber(g.xp) && g.xp >= 0)) return `${whose(doc, id)} XP is not a number of zero or more.`;
    if (!absent(g.badges) && !isObject(g.badges)) return `${whose(doc, id)} badges are not in the expected shape.`;
  }
  return null;
}

function interestsProblem(interests) {
  for (const value of Object.values(interests || {})) {
    if (absent(value)) continue;
    const ok = isObject(value)
      && (absent(value.chips) || (Array.isArray(value.chips) && value.chips.every(c => typeof c === 'string')))
      && (absent(value.text) || typeof value.text === 'string');
    if (!ok) return 'The file\'s interests are not in the expected shape.';
  }
  return null;
}

// The level-set workbook (HAR-24) per learner: { lanes: { lane: session },
// observe: [topicId], lane }. A session's inside is checked when it is read
// (levelset.js normalizeSession drops a malformed one), so only the outer
// shape is checked here and a document the app wrote is never refused. No
// section, an empty one, or an empty or absent entry for a learner passes.
function levelsetProblem(levelset) {
  const shape = 'The file\'s level-set workbook is not in the expected shape.';
  for (const value of Object.values(levelset || {})) {
    if (absent(value)) continue; // a learner with nothing saved
    if (!isObject(value)) return shape;
    if (!absent(value.lanes) && !(isObject(value.lanes) && Object.values(value.lanes).every(s => absent(s) || isObject(s)))) return shape;
    if (!absent(value.observe) && !(Array.isArray(value.observe) && value.observe.every(id => typeof id === 'string'))) return shape;
    if (!absent(value.lane) && typeof value.lane !== 'string') return shape;
  }
  return null;
}

// From data format 2 (schema.js step 1 -> 2) the child-view PIN is kept only
// as a salted hash (pin.js); a plain PIN belongs to formats 0 and 1.
const PIN_HASHED_FROM_SCHEMA = 2;
function settingsProblem(settings, schemaVersion) {
  if (absent(settings)) return null;
  if (!isObject(settings)) return 'The file\'s settings are not in the expected shape.';
  const pin = settings.parentPin;
  const hashed = Number.isSafeInteger(schemaVersion) && schemaVersion >= PIN_HASHED_FROM_SCHEMA;
  if (hashed && 'parentPin' in settings) {
    return 'The file keeps the child-view PIN in plain text, which this data format does not allow.';
  }
  if (!absent(pin) && pin !== '' && !((typeof pin === 'string' || typeof pin === 'number') && /^\d{4}$/.test(String(pin)))) {
    return 'The file\'s child-view PIN is not four digits.';
  }
  if (!absent(settings.parentPinHash) && !(typeof settings.parentPinHash === 'string' && HASH_PATTERN.test(settings.parentPinHash))) {
    return 'The file\'s child-view PIN hash is not 64 lowercase hex characters.';
  }
  if (!absent(settings.parentPinSalt) && !(typeof settings.parentPinSalt === 'string' && SALT_PATTERN.test(settings.parentPinSalt))) {
    return 'The file\'s child-view PIN salt is not 32 lowercase hex characters.';
  }
  const cal = settings.calendar;
  if (absent(cal)) return null;
  const ok = isObject(cal)
    && (absent(cal.homeDays) || (Array.isArray(cal.homeDays) && cal.homeDays.every(n => Number.isInteger(n) && n >= 0 && n <= 6)))
    && (absent(cal.breaks) || (Array.isArray(cal.breaks) && cal.breaks.every(b => isObject(b)
      && realDateKey(b.start) && realDateKey(b.end) && (absent(b.label) || typeof b.label === 'string'))));
  return ok ? null : 'The file\'s calendar settings are not in the expected shape.';
}

// Null when `doc` is a family document the app can load and render, otherwise
// the first problem found, as a sentence.
export function validateDocument(doc) {
  if (!isObject(doc)) return 'The file is not a Harrington family export.';
  if (!Array.isArray(doc.students)) return 'The file has no learner list.';
  const ids = new Set();
  for (const [index, s] of doc.students.entries()) {
    // Named when the name itself is fine, else by position.
    const name = usableName(s);
    const who = name ? `The learner “${name}”` : `Learner ${index + 1}`;
    const problem = learnerProblem(s);
    if (problem) return `${who} in the file ${problem}.`;
    if (ids.has(s.id)) return `${who} in the file has the same id as another learner.`;
    ids.add(s.id);
  }
  if (!absent(doc.activeStudentId) && !ids.has(doc.activeStudentId)) {
    return 'The file\'s active learner is not one of its learners.';
  }
  for (const key of LEARNER_KEYS) {
    if (doc[key] !== undefined && !isObject(doc[key])) return `The file's "${key}" section is not in the expected shape.`;
  }
  if (doc.notifications !== undefined && !Array.isArray(doc.notifications)) {
    return 'The file\'s notifications are not in the expected shape.';
  }
  for (const [i, n] of (doc.notifications || []).entries()) {
    const problem = notificationProblem(n);
    if (problem) return `Notification ${i + 1} in the file ${problem}.`;
  }
  return learnerMapsProblem(doc)
    || dismissedAlertsProblem(doc.dismissedAlerts)
    || progressProblem(doc)
    || listsProblem(doc, 'records', 'record', recordProblem)
    || listsProblem(doc, 'tests', 'test result', testProblem)
    || listsProblem(doc, 'challenges', 'challenge result', challengeProblem)
    || gameProblem(doc)
    || interestsProblem(doc.interests)
    || levelsetProblem(doc.levelset)
    || settingsProblem(doc.settings, doc.schemaVersion);
}

// ---- Repairs ----

// Per-learner lists and maps whose entries the views read as objects. A null
// or other non-object entry (from a hand edit, or an older Harrington that did
// not check) would throw while rendering (HAR-38), and the server refuses a
// save that carries one, so it is dropped.
const LEARNER_LISTS = ['records', 'tests', 'challenges', 'suggestions'];
const LEARNER_ENTRY_MAPS = ['progress', 'recall', 'practice', 'adaptations'];

// Returns { doc, dropped }: `doc` is the same object when nothing was dropped,
// else a copy with every non-object entry removed from the learners, their
// lists and maps, plan extras and daily days.
export function dropBrokenEntries(doc) {
  if (!isObject(doc)) return { doc, dropped: 0 };
  let dropped = 0;
  const out = { ...doc };
  // A learner that is not an object at all (null in students) would send
  // every route to the failure screen.
  if (Array.isArray(doc.students)) {
    const kept = doc.students.filter(isObject);
    if (kept.length !== doc.students.length) { dropped += doc.students.length - kept.length; out.students = kept; }
  }
  const perLearner = (key, clean) => {
    if (!isObject(doc[key])) return;
    let changed = false;
    const next = {};
    for (const [id, value] of Object.entries(doc[key])) {
      const [kept, lost] = clean(value);
      if (lost) { dropped += lost; changed = true; }
      if (kept !== undefined) next[id] = kept;
    }
    if (changed) out[key] = next;
  };
  const objectsOnly = (entries) => {
    const kept = Object.fromEntries(Object.entries(entries).filter(([, v]) => isObject(v)));
    return [kept, Object.keys(entries).length - Object.keys(kept).length];
  };
  for (const key of LEARNER_LISTS) {
    perLearner(key, list => {
      if (!Array.isArray(list)) return [[], 1];
      const kept = list.filter(isObject);
      return [kept.length === list.length ? list : kept, list.length - kept.length];
    });
  }
  for (const key of LEARNER_ENTRY_MAPS) {
    perLearner(key, entries => {
      if (!isObject(entries)) return [{}, 1];
      const [kept, lost] = objectsOnly(entries);
      return [lost ? kept : entries, lost];
    });
  }
  perLearner('plan', plan => {
    if (!isObject(plan)) return [undefined, 1];
    if (!isObject(plan.extras)) return [plan, 0];
    let lost = 0;
    const extras = {};
    for (const [day, list] of Object.entries(plan.extras)) {
      if (!Array.isArray(list)) { lost += 1; continue; }
      const kept = list.filter(isObject);
      lost += list.length - kept.length;
      extras[day] = kept;
    }
    return [lost ? { ...plan, extras } : plan, lost];
  });
  perLearner('daily', days => {
    if (!isObject(days)) return [{}, 1];
    const [kept, lost] = objectsOnly(days);
    return [lost ? kept : days, lost];
  });
  return dropped ? { doc: out, dropped } : { doc, dropped: 0 };
}

// Appended to a text a repair had to shorten.
export const SHORTENED_MARKER = ' [shortened by Harrington]';
const shorten = (text, max) => `${text.slice(0, max - SHORTENED_MARKER.length).trimEnd()}${SHORTENED_MARKER}`;

// The schema 3 repair (HAR-39): data saved before the server checked every
// save (PR #32) can hold values validateDocument now refuses, and every save
// of it would be refused. Run once, on the load that migrates the document to
// schema 3, and saved by that load's quiet migration save:
// - a learner name over NAME_MAX characters is shortened;
// - a birth year outside MIN_BIRTH_YEAR to this year is clamped into it (a
//   year that is not a whole number is cleared);
// - a record text over its TEXT_MAX bound is shortened, ending in
//   SHORTENED_MARKER;
// - non-object entries are dropped (dropBrokenEntries).
// Each change is listed in one "repair" notification for the parent, which
// also names `copy` when given. Returns the repaired document, or the same
// object when nothing needed repair and no copy is named.
// `now` is injectable for tests (the notification's date, this year); `copy`
// names the server's copy of the unrepaired document (schema.js
// formatCopyName), which the notice points to.
export function repairDocument(doc, { now = Date.now(), copy = null } = {}) {
  if (!isObject(doc)) return doc;
  const notes = [];
  const { doc: cleaned, dropped } = dropBrokenEntries(doc);
  let out = cleaned;
  if (dropped) notes.push(`${dropped === 1 ? 'An unreadable entry was' : `${dropped} unreadable entries were`} removed.`);
  const thisYear = new Date(now).getFullYear();
  if (Array.isArray(out.students)) {
    let changed = false;
    const students = out.students.map(s => {
      if (!isObject(s)) return s;
      let next = s;
      if (typeof s.name === 'string' && s.name.trim().length > NAME_MAX) {
        next = { ...next, name: s.name.trim().slice(0, NAME_MAX).trimEnd() };
        notes.push(`A learner name longer than ${NAME_MAX} characters was shortened to “${nameOf(next)}”.`);
      }
      const year = s.birthYear;
      if (!absent(year) && !(Number.isInteger(year) && year >= MIN_BIRTH_YEAR && year <= thisYear)) {
        const fixed = Number.isInteger(year) ? Math.min(Math.max(year, MIN_BIRTH_YEAR), thisYear) : null;
        next = { ...next, birthYear: fixed };
        const who = nameOf(next) || 'a learner';
        notes.push(fixed === null
          ? `The birth year of ${who} was not a year and was cleared.`
          : `The birth year of ${who} was ${year}, outside ${MIN_BIRTH_YEAR} to ${thisYear}, and is now ${fixed}.`);
      }
      if (next !== s) changed = true;
      return next;
    });
    if (changed) out = { ...out, students };
  }
  if (isObject(out.records)) {
    let changed = false;
    const records = {};
    for (const [id, list] of Object.entries(out.records)) {
      records[id] = !Array.isArray(list) ? list : list.map(r => {
        let next = r;
        for (const [field, max] of Object.entries(TEXT_MAX)) {
          if (typeof r[field] !== 'string' || r[field].length <= max) continue;
          next = { ...next, [field]: shorten(r[field], max) };
          const title = field !== 'title' && typeof r.title === 'string' && r.title.trim() ? ` “${r.title.trim().slice(0, LABEL_MAX)}”` : '';
          notes.push(`The ${field} of a record${forLearner(out, id)}${title} was longer than ${max.toLocaleString('en-US')} characters and was shortened.`);
        }
        if (next !== r) changed = true;
        return next;
      });
    }
    if (changed) out = { ...out, records };
  }
  // The kept copy is announced even when nothing needed repair (an older
  // format's file is still replaced), and first, so the length cap below
  // never cuts it.
  const repaired = notes.length > 0;
  if (!repaired && !copy) return doc;
  if (copy) notes.unshift(`The family data as it was before this update is kept on the Harrington server, in its data folder, as ${copy}.`);
  const body = notes.join(' ');
  const note = {
    id: `n_repair_${now}`,
    type: 'repair',
    title: repaired ? 'Harrington repaired some family data' : 'Harrington updated the family data format',
    body: body.length > 2_000 ? `${body.slice(0, 1_999)}…` : body,
    read: false,
    createdAt: now,
  };
  return { ...out, notifications: [...(Array.isArray(out.notifications) ? out.notifications : []), note] };
}
