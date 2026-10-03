// The shape of the family document, checked in one place: by the store before
// an import and by server.mjs on every save (PUT /api/state and the unload
// beacon). Dependency-free so the server can import it as is.
//
// validateDocument() returns null for a document the app can render, or a
// short reason a parent can act on. Fields an older document may lack are
// optional; anything present must have the shape the views read.

// Per-learner maps keyed by learner id.
export const LEARNER_KEYS = ['progress', 'records', 'tests', 'plan', 'challenges', 'adaptations',
  'suggestions', 'recall', 'practice', 'activity', 'game', 'daily', 'interests'];

// Every top-level key the app saves, in one list, so the store's snapshot and
// anything that compares documents never drift. Keys a document carries that
// are not listed here (from a newer Harrington) are kept through load and save.
export const documentFields = ['schemaVersion', 'students', 'activeStudentId', ...LEARNER_KEYS,
  'notifications', 'curriculumSnapshot', 'graphView', 'settings'];

// Bookkeeping the server adds (version, updatedAt, writeId) or an export adds
// (exportedAt, taxonomyVersion, unsavedChanges); never family data.
export const BOOKKEEPING_FIELDS = ['version', 'updatedAt', 'writeId', 'exportedAt', 'taxonomyVersion', 'unsavedChanges'];

export const MASTERY_STATUSES = ['none', 'learning', 'practicing', 'mastered'];
// 'note' is the label the record views fall back to for an older record.
export const RECORD_TYPES = ['observation', 'question', 'discussion', 'assessment', 'recording', 'note'];
export const MIN_BIRTH_YEAR = 1990;
export const NAME_MAX = 100;
// Generous bounds: they stop a hostile file, not a long transcript.
const TEXT_MAX = { title: 1_000, note: 50_000, transcript: 200_000, analysis: 200_000, topicName: 1_000 };

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
export const validLearnerId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id) && !(id in Object.prototype);

// What is wrong with one learner, as the end of "Learner 2 in the file …", or null.
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
  return null;
}

function testProblem(t) {
  if (!isObject(t)) return 'is not a test result';
  if (!absent(t.pct) && !(isFiniteNumber(t.pct) && t.pct >= 0 && t.pct <= 100)) return 'has a score outside 0 to 100%';
  for (const field of ['score', 'total']) {
    if (!absent(t[field]) && !isCount(t[field])) return `has a ${field} that is not a whole number`;
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
  return null;
}

// Each learner's list in `section` must be an array whose items pass `check`.
function listsProblem(doc, section, label, check) {
  for (const list of Object.values(doc[section] || {})) {
    if (!Array.isArray(list)) return `The file's "${section}" section is not in the expected shape.`;
    for (const [i, item] of list.entries()) {
      const problem = check(item);
      if (problem) return `A ${label} in the file (${section} item ${i + 1}) ${problem}.`;
    }
  }
  return null;
}

function progressProblem(progress) {
  for (const entries of Object.values(progress || {})) {
    if (!isObject(entries)) return 'The file\'s "progress" section is not in the expected shape.';
    for (const entry of Object.values(entries)) {
      if (!isObject(entry) || !MASTERY_STATUSES.includes(entry.status)) {
        return `The file's progress has a status other than ${MASTERY_STATUSES.join(', ')}.`;
      }
    }
  }
  return null;
}

function gameProblem(game) {
  for (const g of Object.values(game || {})) {
    if (!isObject(g)) return 'The file\'s "game" section is not in the expected shape.';
    if (!absent(g.xp) && !(isFiniteNumber(g.xp) && g.xp >= 0)) return 'The file\'s XP is not a number of zero or more.';
    if (!absent(g.badges) && !isObject(g.badges)) return 'The file\'s badges are not in the expected shape.';
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

function settingsProblem(settings) {
  if (absent(settings)) return null;
  if (!isObject(settings)) return 'The file\'s settings are not in the expected shape.';
  const pin = settings.parentPin;
  if (!absent(pin) && pin !== '' && !((typeof pin === 'string' || typeof pin === 'number') && /^\d{4}$/.test(String(pin)))) {
    return 'The file\'s child-view PIN is not four digits.';
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
    const problem = learnerProblem(s);
    if (problem) return `Learner ${index + 1} in the file ${problem}.`;
    if (ids.has(s.id)) return `Learner ${index + 1} in the file has the same id as another learner.`;
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
  return progressProblem(doc.progress)
    || listsProblem(doc, 'records', 'record', recordProblem)
    || listsProblem(doc, 'tests', 'test result', testProblem)
    || listsProblem(doc, 'challenges', 'challenge result', challengeProblem)
    || gameProblem(doc.game)
    || interestsProblem(doc.interests)
    || settingsProblem(doc.settings);
}
