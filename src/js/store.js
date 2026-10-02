// App state + persistence through the family-owned Harrington server.
import * as backend from './backend.js';

export const MASTERY = {
  none:       { label: 'Not started', rank: 0, color: '#d2c6ad' },
  learning:   { label: 'Learning',    rank: 1, color: '#8a6412' },
  practicing: { label: 'Practicing',  rank: 2, color: '#2f6285' },
  mastered:   { label: 'Mastered',    rank: 3, color: '#3f6b3b' },
};

const listeners = new Set();
let state = {
  user: { username: 'Family' },
  students: [],       // {id, name, birthYear, birthMonth?, avatar, color}
  activeStudentId: null,
  progress: {},       // studentId -> { topicId -> { status, updatedAt } }
  records: {},        // studentId -> [ {id, topicId, type, title, note, rating, questions, createdAt} ]
  tests: {},          // studentId -> [ {id, subject, mode, score, total, pct, passed, createdAt} ]
  plan: {},           // studentId -> { moves:{topicId:dateKey}, done:{dateKey:true}, extras:{dateKey:[items]} }
  challenges: {},     // studentId -> [ {id, topicId, subject, domain, correct, total, seconds, createdAt} ]
  adaptations: {},    // studentId -> { 'Subject|Domain': { level:'advanced', since } }
  suggestions: {},    // studentId -> [ {id, kind, subject, domain, reason, status, createdAt} ]
  notifications: [],  // family-wide: [ {id, type, title, body, meta, read, createdAt} ]
  curriculumSnapshot: null, // {version, generatedAt, topicIds:[...], count}
  recall: {},         // studentId -> { cardId -> { topicId, box, due, reps, lapses, last } }
  practice: {},       // studentId -> { itemId -> { topicId, subject, q, type, options, answer, box, due, reps, lapses, last } }
  activity: {},       // studentId -> { 'yyyy-mm-dd': true }  (days with recall/lesson/mastery activity)
  game: {},           // studentId -> { xp, badges: {badgeId: ts} }
  daily: {},          // studentId -> { 'yyyy-mm-dd': { offers: {literacy:[topicId], numeracy:[topicId]}, picks: {literacy, numeracy} } }
  graphView: 'atlas', // 'atlas' (visual map) | 'list' (card drill-down)
  settings: {},       // family-wide: { parentPin }
};

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach(fn => fn(state)); }
export function get() { return state; }

// ---- Server connection ----
let aiConfigured = false; // from /api/health; kept out of the persisted state
export async function connect() {
  const health = await backend.health();
  aiConfigured = health?.aiConfigured === true;
  state.user = { username: 'Family' };
  return state.user;
}
export function aiAvailable() { return aiConfigured; }
// Rejects when /api/health itself fails, so callers can tell an outage from a missing provider.
export async function refreshHealth() {
  const before = aiConfigured;
  aiConfigured = (await backend.health())?.aiConfigured === true;
  if (aiConfigured !== before) emit();
  return aiConfigured;
}

// ---- Persistence ----
// The server stores one versioned document. Every save sends If-Match with the
// last version we saw; a 412 means another tab or device saved first, so we
// replace local state with the server's copy (no field-level merging).
let stateVersion = 0;
let dirty = false;
let saving = false;
let saveTimer = null;
let saveQueue = Promise.resolve();
const saveListeners = new Set();
// Ids of our recent writes, so we can recognise our own save on the server.
const ownWrites = [];
// writeId of an unload beacon whose outcome we have not seen yet.
let unconfirmedBeacon = null;
// Recordings of removed learners, deleted once the removal is saved.
let pendingAudioDeletes = [];

// Per-learner maps keyed by student id. removeStudent clears every one of them.
const LEARNER_KEYS = ['progress', 'records', 'tests', 'plan', 'challenges', 'adaptations',
  'suggestions', 'recall', 'practice', 'activity', 'game', 'daily'];

// Save status for the UI: { type: 'saved' | 'conflict' | 'too-large' | 'failed', error? }
export function onSaveStatus(fn) { saveListeners.add(fn); return () => saveListeners.delete(fn); }
function saveStatus(event) { saveListeners.forEach(fn => { try { fn(event); } catch (e) { console.warn(e); } }); }

function objectOr(value, fallback) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function applyDocument(data) {
  const doc = objectOr(data, {});
  state.students = Array.isArray(doc.students) ? doc.students : [];
  state.activeStudentId = doc.activeStudentId || (state.students[0] && state.students[0].id) || null;
  for (const key of LEARNER_KEYS) state[key] = objectOr(doc[key], {});
  state.notifications = Array.isArray(doc.notifications) ? doc.notifications : [];
  state.curriculumSnapshot = doc.curriculumSnapshot || null;
  state.graphView = doc.graphView === 'list' ? 'list' : 'atlas';
  state.settings = objectOr(doc.settings, {});
  stateVersion = Number.isSafeInteger(doc.version) ? doc.version : 0;
}

export async function loadAll() {
  try {
    applyDocument(await backend.loadState());
  } catch (e) {
    console.warn('load failed', e);
    throw e;
  }
}

function snapshotData() {
  return {
    students: state.students,
    activeStudentId: state.activeStudentId,
    progress: state.progress,
    records: state.records,
    tests: state.tests,
    plan: state.plan,
    challenges: state.challenges,
    adaptations: state.adaptations,
    suggestions: state.suggestions,
    notifications: state.notifications,
    curriculumSnapshot: state.curriculumSnapshot,
    recall: state.recall,
    practice: state.practice,
    activity: state.activity,
    game: state.game,
    daily: state.daily,
    graphView: state.graphView === 'list' ? 'list' : 'atlas',
    settings: state.settings,
  };
}

function newWriteId() {
  const id = `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  ownWrites.push(id);
  if (ownWrites.length > 16) ownWrites.shift();
  return id;
}

function versionOf(doc) {
  return Number.isSafeInteger(doc?.version) ? doc.version : 0;
}

function reloadFromServer(doc) {
  clearTimeout(saveTimer);
  saveTimer = null;
  dirty = false;
  // A pending beacon carried the version we are discarding, so it cannot land.
  unconfirmedBeacon = null;
  applyDocument(doc);
  const present = new Set(state.students.map(s => s.id));
  pendingAudioDeletes = pendingAudioDeletes.filter(item => !present.has(item.studentId));
  emit();
  saveStatus({ type: 'conflict' });
}

// Deletes recordings of learners whose removal the server has accepted.
function deleteRemovedAudio() {
  const present = new Set(state.students.map(s => s.id));
  const ready = pendingAudioDeletes.filter(item => !present.has(item.studentId));
  pendingAudioDeletes = pendingAudioDeletes.filter(item => present.has(item.studentId));
  for (const item of ready) backend.deleteAudio(item.path).catch(() => {});
}

// Compares the server document with what we know. Returns true when local
// state stays (the server holds our own write or nothing new), false after
// reloading because another tab or device saved.
function reconcile(doc) {
  const beaconId = unconfirmedBeacon;
  unconfirmedBeacon = null;
  const version = versionOf(doc);
  if (beaconId && doc.writeId === beaconId) {
    stateVersion = version;
    deleteRemovedAudio();
    return true;
  }
  if (version === stateVersion || ownWrites.includes(doc.writeId)) {
    stateVersion = Math.max(stateVersion, version);
    if (ownWrites.includes(doc.writeId)) deleteRemovedAudio();
    // Our beacon did not land; send its changes again.
    if (beaconId) persist();
    return true;
  }
  reloadFromServer(doc);
  return false;
}

// The document to act on after a 412: the body, or a fresh read if the body
// was not a usable document.
async function conflictDocument(error) {
  const body = error.body;
  if (body && typeof body === 'object' && Number.isSafeInteger(body.version)) return body;
  return backend.loadState();
}

// Runs one save. `makeData()` builds the body just before sending (null means
// nothing to send). A 412 caused by our own earlier write, such as an unload
// beacon, adopts that version and tries again; any other 412 reloads.
async function saveWith(makeData) {
  saving = true;
  // Kept across attempts: after a 412 caused by our own earlier write, the
  // body is sent again even if makeData() has nothing new.
  let data = null;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (unconfirmedBeacon && !reconcile(await backend.loadState())) return false;
      data = makeData() ?? data;
      if (data === null) return true;
      try {
        const next = await backend.saveState(data, stateVersion, newWriteId());
        stateVersion = Math.max(stateVersion, next);
        deleteRemovedAudio();
        saveStatus({ type: 'saved' });
        return true;
      } catch (e) {
        if (e.status !== 412) throw e;
        const doc = await conflictDocument(e);
        if (!ownWrites.includes(doc.writeId)) { reloadFromServer(doc); return false; }
        if (doc.writeId === unconfirmedBeacon) unconfirmedBeacon = null;
        stateVersion = versionOf(doc);
        deleteRemovedAudio();
      }
    }
    throw new Error('Family data kept changing while saving');
  } catch (e) {
    dirty = true;
    console.warn('save failed', e);
    saveStatus({ type: e.status === 413 ? 'too-large' : 'failed', error: e });
    return false;
  } finally {
    saving = false;
  }
}

function saveNow() {
  if (!dirty) return Promise.resolve(true);
  return saveWith(() => {
    if (!dirty) return null;
    dirty = false;
    return snapshotData();
  });
}

// Saves any pending change right away. Resolves once every queued save is done.
export function flushSaves() {
  clearTimeout(saveTimer);
  saveTimer = null;
  saveQueue = saveQueue.catch(() => {}).then(saveNow);
  return saveQueue;
}

export function persist() {
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSaves, 400);
}

// The page is being hidden or closed: a debounced save would be lost, so send
// it now as a beacon. Beacons cannot carry If-Match, so the version rides in
// the body. We cannot see the result, so the version is not advanced; the
// beacon's writeId is checked against the server when the tab returns or
// before the next save. A save still in flight uses the same version, so
// exactly one of the two wins and the other recognises it.
export function handlePageHidden() {
  if (!dirty) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  const writeId = newWriteId();
  if (backend.beaconState(snapshotData(), stateVersion, writeId)) {
    dirty = false;
    unconfirmedBeacon = writeId;
  } else {
    console.warn('The browser refused to send family data on unload (beacons are limited to about 64 KB); saving normally instead.');
    flushSaves();
  }
}

// Coming back to a tab: confirm an unload beacon, or load a newer copy another
// device saved rather than discovering the conflict on the next edit.
async function syncOnVisible() {
  if (saving) return;
  if (!unconfirmedBeacon) {
    if (dirty) return;
    const { stateVersion: serverVersion } = await backend.health();
    if (!Number.isSafeInteger(serverVersion) || serverVersion <= stateVersion || dirty) return;
  }
  reconcile(await backend.loadState());
}

export function handlePageVisible() {
  saveQueue = saveQueue.catch(() => {}).then(() => syncOnVisible().catch(() => {}));
  return saveQueue;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('pagehide', handlePageHidden);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') handlePageHidden();
    else handlePageVisible();
  });
}

// ---- Export / import ----
function countOf(value) {
  if (Array.isArray(value)) return value.length;
  return value && typeof value === 'object' ? Object.keys(value).length : 0;
}

// The full stored document plus when it was exported and against which
// taxonomy. If changes could not be saved (for example the data is too large),
// the export is this tab's copy, flagged with unsavedChanges.
export async function exportDocument() {
  await flushSaves();
  const meta = { exportedAt: new Date().toISOString(), taxonomyVersion: state.curriculumSnapshot?.version || null };
  if (dirty) return { ...snapshotData(), version: stateVersion, ...meta, unsavedChanges: true };
  return { ...(await backend.loadState()), ...meta };
}

// Checks an export (or a raw family-state.json) before import. Returns
// { ok, error?, learners: [{ name, topics, records, tests }] } for the preview.
export function inspectImport(doc) {
  const fail = (error) => ({ ok: false, error, learners: [] });
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return fail('The file is not a Harrington family export.');
  if (!Array.isArray(doc.students)) return fail('The file has no learner list.');
  for (const s of doc.students) {
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !s.id || typeof s.name !== 'string') {
      return fail('A learner in the file is missing an id or name.');
    }
  }
  for (const key of LEARNER_KEYS) {
    if (doc[key] !== undefined && (!doc[key] || typeof doc[key] !== 'object' || Array.isArray(doc[key]))) {
      return fail(`The file's "${key}" section is not in the expected shape.`);
    }
  }
  if (doc.notifications !== undefined && !Array.isArray(doc.notifications)) {
    return fail('The file\'s notifications are not in the expected shape.');
  }
  const learners = doc.students.map(s => ({
    name: s.name,
    topics: countOf(doc.progress?.[s.id]),
    records: countOf(doc.records?.[s.id]),
    tests: countOf(doc.tests?.[s.id]),
  }));
  return { ok: true, learners };
}

// Replaces the family document on the server with `doc`, guarded by the
// current version. Resolves false if another device saved first (state is
// then reloaded from the server) or the save failed.
export function importDocument(doc) {
  const check = inspectImport(doc);
  if (!check.ok) return Promise.reject(new Error(check.error));
  const { version: _v, updatedAt: _u, writeId: _w, exportedAt: _e, taxonomyVersion: _t, unsavedChanges: _c, ...data } = doc;
  // Colors end up in style attributes, so only palette colors are imported.
  data.students = data.students.map(s => (PALETTE.includes(s.color) ? s : { ...s, color: PALETTE[0] }));
  clearTimeout(saveTimer);
  saveTimer = null;
  dirty = false;
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    const ok = await saveWith(() => data);
    if (ok) {
      applyDocument({ ...data, version: stateVersion });
      emit();
    }
    return ok;
  });
  return saveQueue;
}

// ---- Students ----
export const PALETTE = ['#3f6b3b', '#a4473a', '#2f6285', '#5b4a86', '#8a6412', '#9a4a6e'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MIN_BIRTH_YEAR = 1990;
const validMonth = m => Number.isInteger(m) && m >= 1 && m <= 12;
const validYear = y => Number.isInteger(y) && y >= MIN_BIRTH_YEAR && y <= new Date().getFullYear();
const validDateKey = k => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);
export function addStudent(name, birthYear, birthMonth = null) {
  const id = 's_' + Math.random().toString(36).slice(2, 9);
  const color = PALETTE[state.students.length % PALETTE.length];
  const now = new Date();
  const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const student = { id, name, birthYear, color, createdAt: Date.now(), startDate };
  if (validMonth(birthMonth)) student.birthMonth = birthMonth;
  state.students.push(student);
  state.progress[id] = state.progress[id] || {};
  state.records[id] = state.records[id] || [];
  state.activeStudentId = id;
  persist(); emit();
  return id;
}
// Only these fields can change, and each is checked so a bad value never
// reaches the saved document: an empty name, a year outside MIN_BIRTH_YEAR to
// this year, a month outside 1-12, a color outside the palette or a malformed
// start date is ignored. birthMonth null clears the month.
export function updateStudent(id, patch) {
  const s = state.students.find(s => s.id === id);
  if (!s) return false;
  const { name, birthYear, birthMonth, color, startDate } = patch;
  const ageBefore = studentAge(s);
  if (typeof name === 'string' && name.trim()) s.name = name.trim();
  if (validYear(birthYear)) s.birthYear = birthYear;
  if (birthMonth === null) delete s.birthMonth;
  else if (validMonth(birthMonth)) s.birthMonth = birthMonth;
  if (PALETTE.includes(color)) s.color = color;
  if (validDateKey(startDate)) s.startDate = startDate;
  // Today's choices were filtered by the old age; rebuild them on next render.
  if (studentAge(s) !== ageBefore) forgetTodaysChoices(id);
  persist(); emit();
  return true;
}
export function removeStudent(id) {
  // Recordings are deleted only once the server accepts the removal, so a
  // conflict that brings the learner back does not lose their audio.
  for (const rec of state.records[id] || []) {
    if (rec && rec.audioPath) pendingAudioDeletes.push({ studentId: id, path: rec.audioPath });
  }
  state.students = state.students.filter(s => s.id !== id);
  for (const key of LEARNER_KEYS) delete state[key][id];
  if (state.activeStudentId === id) state.activeStudentId = state.students[0]?.id || null;
  emit();
  persist();
  flushSaves();
}
export function setActiveStudent(id) { state.activeStudentId = id; persist(); emit(); }
export function activeStudent() { return state.students.find(s => s.id === state.activeStudentId) || null; }

// Whole years completed. With a birth month the birthday counts from the
// first of that month; without one, the age is the calendar-year difference.
export function studentAge(s, now = new Date()) {
  if (!s || !s.birthYear) return null;
  const years = now.getFullYear() - s.birthYear;
  if (!validMonth(s.birthMonth)) return years;
  return now.getMonth() + 1 < s.birthMonth ? Math.max(0, years - 1) : years;
}

// ---- Progress / mastery ----
export function progressFor(studentId) { return state.progress[studentId] || {}; }
export function statusOf(studentId, topicId) {
  return (state.progress[studentId] && state.progress[studentId][topicId]?.status) || 'none';
}
export function setStatus(studentId, topicId, status) {
  state.progress[studentId] = state.progress[studentId] || {};
  state.progress[studentId][topicId] = { status, updatedAt: Date.now() };
  markActivity(studentId);
  persist(); emit();
}
// Set many topics at once with a single persist + emit (one re-render).
// Marks activity inline rather than via markActivity(), which would persist and emit a second time.
// `meta` adds fields to each entry, e.g. { source: 'placement' }; a
// `meta.updatedAt` sets the timestamp so callers can record it beforehand,
// and `meta.activity: false` keeps an admin change from counting as a learning day.
export function setStatusBulk(studentId, topicIds, status, meta = {}) {
  if (!topicIds || !topicIds.length) return;
  const { activity = true, ...fields } = meta;
  const p = state.progress[studentId] = state.progress[studentId] || {};
  const now = fields.updatedAt || Date.now();
  topicIds.forEach(id => { p[id] = { ...fields, status, updatedAt: now }; });
  if (activity) activityOf(studentId)[dateKeyLocal(now)] = true;
  persist(); emit();
}

// ---- Placement (bulk-mark earlier topics mastered, with undo) ----
// A placement is a parent admin action, not learning: it does not mark the
// day active. It changes which topics are open, so today's daily choices
// (offers and picks) are dropped and rebuilt on the next render. A learner
// whose age changes (updateStudent) drops them the same way.
function forgetTodaysChoices(studentId) {
  const days = state.daily[studentId];
  if (days) delete days[dateKeyLocal(Date.now())];
}
// Writes one assessment record carrying the changed ids and their previous
// entries, then marks them mastered with a single persist + emit.
export function applyPlacement(studentId, { topicIds, title, subject, domain = null, maxAge }) {
  if (!topicIds || !topicIds.length) return null;
  const p = state.progress[studentId] || {};
  const previous = {};
  topicIds.forEach(id => { previous[id] = p[id] ? { ...p[id] } : null; });
  // The record is complete before the single persist + emit below.
  const at = Date.now();
  const rec = {
    id: 'r_' + Math.random().toString(36).slice(2, 9), createdAt: at,
    type: 'assessment', title, note: '',
    placement: { subject, domain, maxAge, topicIds: [...topicIds], previous, at, undoneAt: null },
  };
  state.records[studentId] = state.records[studentId] || [];
  state.records[studentId].unshift(rec);
  forgetTodaysChoices(studentId);
  setStatusBulk(studentId, topicIds, 'mastered', { source: 'placement', updatedAt: at, activity: false });
  return rec;
}
// Revert exactly the ids a placement changed. Topics changed again since the
// placement are left alone. Returns { reverted, kept } or null.
export function undoPlacement(studentId, recordId) {
  const rec = (state.records[studentId] || []).find(r => r.id === recordId);
  if (!rec || !rec.placement || rec.placement.undoneAt) return null;
  const p = state.progress[studentId] = state.progress[studentId] || {};
  let reverted = 0, kept = 0;
  for (const id of rec.placement.topicIds) {
    const cur = p[id];
    if (!cur || cur.source !== 'placement' || cur.updatedAt !== rec.placement.at) { kept++; continue; }
    const prev = rec.placement.previous[id];
    if (prev) p[id] = { ...prev }; else delete p[id];
    reverted++;
  }
  rec.placement.undoneAt = Date.now();
  forgetTodaysChoices(studentId);
  persist(); emit();
  return { reverted, kept };
}

// ---- Records (notes / observations / questions) ----
export function recordsFor(studentId, topicId = null) {
  const list = state.records[studentId] || [];
  return topicId ? list.filter(r => r.topicId === topicId) : list;
}
export function recordingsFor(studentId, { sectionId = null, topicId = null } = {}) {
  const list = (state.records[studentId] || []).filter(r => r.type === 'recording');
  if (topicId) return list.filter(r => r.topicId === topicId);
  if (sectionId) return list.filter(r => r.sectionId === sectionId);
  return list;
}
export function addRecord(studentId, rec) {
  state.records[studentId] = state.records[studentId] || [];
  const full = { id: 'r_' + Math.random().toString(36).slice(2, 9), createdAt: Date.now(), ...rec };
  state.records[studentId].unshift(full);
  // Saved evidence counts as activity; written inline so this persists and emits once.
  activityOf(studentId)[dateKeyLocal(full.createdAt)] = true;
  persist(); emit();
  return full;
}
export function updateRecord(studentId, recId, patch) {
  const list = state.records[studentId] || [];
  const r = list.find(x => x.id === recId);
  if (r) Object.assign(r, patch);
  persist(); emit();
}
export function removeRecord(studentId, recId) {
  const rec = (state.records[studentId] || []).find(r => r.id === recId);
  if (rec && rec.audioPath) {
    backend.deleteAudio(rec.audioPath).catch(() => {});
  }
  state.records[studentId] = (state.records[studentId] || []).filter(r => r.id !== recId);
  persist(); emit();
}

// ---- Mastery tests ----
// A test result has: { scope: 'subject'|'section', subject, sectionId?, mode, score, total, pct, passed }
export function testsFor(studentId, subject = null) {
  const list = state.tests[studentId] || [];
  return subject ? list.filter(t => t.subject === subject) : list;
}
export function lastTest(studentId, subject) {
  return (state.tests[studentId] || []).filter(t => (t.scope || 'subject') === 'subject' && t.subject === subject)
    .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
}
export function lastSectionTest(studentId, sectionId) {
  return (state.tests[studentId] || []).filter(t => t.scope === 'section' && t.sectionId === sectionId)
    .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
}
export function sectionPassed(studentId, sectionId) {
  const t = lastSectionTest(studentId, sectionId);
  return !!(t && t.passed);
}
export function lastTopicTest(studentId, topicId) {
  return (state.tests[studentId] || []).filter(t => t.scope === 'topic' && t.topicId === topicId)
    .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
}
export function topicTestPassed(studentId, topicId) {
  const t = lastTopicTest(studentId, topicId);
  return !!(t && t.passed);
}
export function addTestResult(studentId, result) {
  state.tests[studentId] = state.tests[studentId] || [];
  const full = { id: 't_' + Math.random().toString(36).slice(2, 9), createdAt: Date.now(), scope: 'subject', ...result };
  state.tests[studentId].unshift(full);
  markActivity(studentId);
  persist(); emit();
  return full;
}

// ---- Adaptive plan overrides (moves, completed days, extra practice items) ----
function planOf(studentId) {
  if (!state.plan[studentId]) state.plan[studentId] = { moves: {}, done: {}, extras: {} };
  const p = state.plan[studentId];
  p.moves = p.moves || {}; p.done = p.done || {}; p.extras = p.extras || {};
  return p;
}
export function planOverrides(studentId) { return planOf(studentId); }
// Move a scheduled topic to a specific date (or clear with null).
export function moveTopic(studentId, topicId, dateKey) {
  const p = planOf(studentId);
  if (dateKey) p.moves[topicId] = dateKey; else delete p.moves[topicId];
  persist(); emit();
}
export function toggleDayDone(studentId, dateKey) {
  const p = planOf(studentId);
  if (p.done[dateKey]) delete p.done[dateKey]; else p.done[dateKey] = Date.now();
  persist(); emit();
}
export function isDayDone(studentId, dateKey) { return !!planOf(studentId).done[dateKey]; }
// Extra practice items a parent adds to a day: {id, kind, topicId, topicName, subject, title}
export function addExtra(studentId, dateKey, item) {
  const p = planOf(studentId);
  p.extras[dateKey] = p.extras[dateKey] || [];
  p.extras[dateKey].push({ id: 'x_' + Math.random().toString(36).slice(2, 9), ...item });
  persist(); emit();
}
export function removeExtra(studentId, dateKey, itemId) {
  const p = planOf(studentId);
  p.extras[dateKey] = (p.extras[dateKey] || []).filter(x => x.id !== itemId);
  persist(); emit();
}
export function extrasOn(studentId, dateKey) { return planOf(studentId).extras[dateKey] || []; }

// ---- Challenge (timed "hard" quiz) results ----
export function addChallenge(studentId, result) {
  state.challenges[studentId] = state.challenges[studentId] || [];
  const full = { id: 'c_' + Math.random().toString(36).slice(2, 9), createdAt: Date.now(), ...result };
  state.challenges[studentId].unshift(full);
  markActivity(studentId);
  persist(); emit();
  return full;
}
export function challengesFor(studentId, topicId = null) {
  const list = state.challenges[studentId] || [];
  return topicId ? list.filter(c => c.topicId === topicId) : list;
}

// ---- Adaptations: difficulty level per (subject|domain) ----
export function adaptationKey(subject, domain) { return `${subject}|${domain}`; }
export function adaptationLevel(studentId, subject, domain) {
  const a = (state.adaptations[studentId] || {})[adaptationKey(subject, domain)];
  return a ? a.level : 'standard';
}
export function setAdaptation(studentId, subject, domain, level) {
  state.adaptations[studentId] = state.adaptations[studentId] || {};
  if (level === 'standard') delete state.adaptations[studentId][adaptationKey(subject, domain)];
  else state.adaptations[studentId][adaptationKey(subject, domain)] = { level, since: Date.now() };
  persist(); emit();
}
export function allAdaptations(studentId) { return state.adaptations[studentId] || {}; }

// ---- Adaptive suggestions the parent can approve or dismiss ----
export function addSuggestion(studentId, sug) {
  state.suggestions[studentId] = state.suggestions[studentId] || [];
  // Avoid duplicate pending suggestions for the same subject/domain/kind.
  const dup = state.suggestions[studentId].some(s =>
    s.status === 'pending' && s.kind === sug.kind && s.subject === sug.subject && s.domain === sug.domain);
  if (dup) return null;
  const full = { id: 'g_' + Math.random().toString(36).slice(2, 9), status: 'pending', createdAt: Date.now(), ...sug };
  state.suggestions[studentId].unshift(full);
  persist(); emit();
  return full;
}
export function pendingSuggestions(studentId) {
  return (state.suggestions[studentId] || []).filter(s => s.status === 'pending');
}
export function resolveSuggestion(studentId, id, status) {
  const s = (state.suggestions[studentId] || []).find(x => x.id === id);
  if (s) s.status = status;
  persist(); emit();
}

// ---- Active recall / spaced repetition ----
// Leitner-style boxes with increasing intervals (days). Box 0 = new/relearning.
const RECALL_INTERVALS = [0, 1, 2, 4, 8, 16, 32];
function recallOf(studentId) {
  if (!state.recall[studentId]) state.recall[studentId] = {};
  return state.recall[studentId];
}
function dayStart(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
const DAY = 86400000;

// Ensure a scheduling record exists for a card; new cards are due immediately.
export function ensureRecallCard(studentId, cardId, topicId) {
  const r = recallOf(studentId);
  if (!r[cardId]) { r[cardId] = { topicId, box: 0, due: dayStart(Date.now()), reps: 0, lapses: 0, last: null }; persist(); }
  // Repair records whose topicId was wiped by an earlier grading bug.
  else if (!r[cardId].topicId && topicId) { r[cardId].topicId = topicId; persist(); }
  return r[cardId];
}
export function recallState(studentId, cardId) { return recallOf(studentId)[cardId] || null; }

// Grade a card: 'again' (forgot) drops to box 0; 'good' advances; 'easy' skips ahead.
export function gradeRecall(studentId, cardId, topicId, grade) {
  const r = recallOf(studentId);
  const c = r[cardId] || { topicId, box: 0, reps: 0, lapses: 0 };
  // Never replace a known topic with a missing one.
  if (topicId) c.topicId = topicId;
  if (grade === 'again') { c.box = 0; c.lapses = (c.lapses || 0) + 1; }
  else if (grade === 'good') { c.box = Math.min(RECALL_INTERVALS.length - 1, (c.box || 0) + 1); }
  else if (grade === 'easy') { c.box = Math.min(RECALL_INTERVALS.length - 1, (c.box || 0) + 2); }
  c.reps = (c.reps || 0) + 1;
  c.last = Date.now();
  const interval = RECALL_INTERVALS[c.box] || 1;
  c.due = dayStart(Date.now()) + interval * DAY;
  r[cardId] = c;
  markActivity(studentId);
  persist(); emit();
  return c;
}

// Cards due today (optionally filtered to a set of card ids / topic).
export function dueRecallCards(studentId, { cardIds = null, topicId = null } = {}) {
  const r = recallOf(studentId);
  const today = dayStart(Date.now());
  return Object.entries(r)
    .filter(([id, c]) => c.due <= today
      && (!cardIds || cardIds.includes(id))
      && (!topicId || c.topicId === topicId))
    .map(([id, c]) => ({ id, ...c }));
}
export function recallStatsForTopic(studentId, cardIds) {
  const r = recallOf(studentId);
  const today = dayStart(Date.now());
  let started = 0, due = 0, learned = 0;
  cardIds.forEach(id => {
    const c = r[id];
    if (!c) return;
    started++;
    if (c.due <= today) due++;
    if ((c.box || 0) >= 3) learned++;
  });
  return { total: cardIds.length, started, due, learned };
}
export function recallDueCount(studentId) {
  return dueRecallCards(studentId).length;
}

// ---- Spaced practice for missed mastery-test questions ----
// Extends the same expanding-interval ladder to problem-solving, not just facts.
// Unlike recall cards (stable per-topic content, cached and reusable), a test
// question is AI-generated per attempt and can't be regenerated identically —
// so the question content itself is stored on the queued item.
function practiceOf(studentId) {
  if (!state.practice[studentId]) state.practice[studentId] = {};
  return state.practice[studentId];
}

// Queue a missed question for spaced retry. Skips duplicates for the same
// topic + question text so retaking a test doesn't pile up repeats.
export function enqueuePracticeItem(studentId, item) {
  const p = practiceOf(studentId);
  const dup = Object.values(p).some(x => x.topicId === item.topicId && x.q === item.q);
  if (dup) return null;
  const id = 'p_' + Math.random().toString(36).slice(2, 9);
  p[id] = { ...item, box: 0, due: dayStart(Date.now()), reps: 0, lapses: 0, last: null, createdAt: Date.now() };
  persist(); emit();
  return p[id];
}

// Grade a retry: correct advances the interval; incorrect resets to box 0.
// A question graduates out of the queue once answered correctly at the top
// of the ladder — durable retention has been demonstrated, so it retires.
export function gradePracticeItem(studentId, itemId, correct) {
  const p = practiceOf(studentId);
  const item = p[itemId];
  if (!item) return null;
  item.reps = (item.reps || 0) + 1;
  item.last = Date.now();
  if (correct) {
    const nextBox = (item.box || 0) + 1;
    if (nextBox >= RECALL_INTERVALS.length) { delete p[itemId]; markActivity(studentId); persist(); emit(); return null; }
    item.box = nextBox;
  } else {
    item.box = 0;
    item.lapses = (item.lapses || 0) + 1;
  }
  item.due = dayStart(Date.now()) + (RECALL_INTERVALS[item.box] || 1) * DAY;
  markActivity(studentId);
  persist(); emit();
  return item;
}

export function duePracticeItems(studentId) {
  const p = practiceOf(studentId);
  const today = dayStart(Date.now());
  return Object.entries(p)
    .filter(([, c]) => c.due <= today)
    .map(([id, c]) => ({ id, ...c }));
}
export function practiceDueCount(studentId) {
  return duePracticeItems(studentId).length;
}

// ---- Activity streak ----
function activityOf(studentId) {
  if (!state.activity[studentId]) state.activity[studentId] = {};
  return state.activity[studentId];
}
function dateKeyLocal(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Record that the student did something today (recall, a lesson test, mastery, etc.).
export function markActivity(studentId) {
  if (!studentId) return;
  const a = activityOf(studentId);
  const k = dateKeyLocal(Date.now());
  if (!a[k]) { a[k] = true; persist(); emit(); }
}
// Consecutive-day streak counting back from today (or yesterday, so a day isn't
// "lost" until it's fully missed).
export function activityStreak(studentId) {
  const a = state.activity[studentId] || {};
  let streak = 0;
  const cur = new Date(); cur.setHours(0, 0, 0, 0);
  // If today isn't done yet but yesterday was, start counting from yesterday.
  if (!a[dateKeyLocal(cur.getTime())]) cur.setDate(cur.getDate() - 1);
  while (a[dateKeyLocal(cur.getTime())]) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}
// ---- Daily pick-one choices (literacy / numeracy) ----
const DAILY_KEEP_DAYS = 14;
export function dailyFor(studentId, dateKey) {
  return (state.daily[studentId] || {})[dateKey] || null;
}
// Remember the day's offers once, so the choice doesn't shift during the day.
export function saveDailyOffers(studentId, dateKey, offers) {
  const days = state.daily[studentId] || (state.daily[studentId] = {});
  days[dateKey] = { offers, picks: (days[dateKey] && days[dateKey].picks) || {} };
  for (const key of Object.keys(days).sort().slice(0, -DAILY_KEEP_DAYS)) delete days[key];
  persist();
}
// Choose (or clear, with null) the pick for one lane on one day.
export function pickDaily(studentId, dateKey, lane, topicId) {
  const day = dailyFor(studentId, dateKey);
  if (!day) return;
  day.picks[lane] = topicId || null;
  persist(); emit();
}

// Whether the student was active on each of the last `days` days, oldest first.
export function recentActivityDays(studentId, days = 7) {
  const a = state.activity[studentId] || {};
  const cur = new Date(); cur.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(cur); d.setDate(cur.getDate() - i);
    out.push({ date: d, active: !!a[dateKeyLocal(d.getTime())] });
  }
  return out;
}
export function activeToday(studentId) {
  const a = state.activity[studentId] || {};
  return !!a[dateKeyLocal(Date.now())];
}

// ---- Gamification: XP, levels, badges ----
function gameOf(studentId) {
  if (!state.game[studentId]) state.game[studentId] = { xp: 0, badges: {} };
  const g = state.game[studentId];
  g.xp = g.xp || 0; g.badges = g.badges || {};
  return g;
}
// Level curve: level N needs a growing amount of XP (gentle early on).
export function levelForXp(xp) {
  let level = 1, need = 100, total = 0;
  while (xp >= total + need) { total += need; level++; need = Math.round(need * 1.35); }
  return { level, into: xp - total, need, floor: total };
}
export function gameState(studentId) {
  const g = gameOf(studentId);
  const lv = levelForXp(g.xp);
  return { xp: g.xp, badges: g.badges, ...lv, pct: Math.round((lv.into / lv.need) * 100) };
}
export function awardXp(studentId, amount) {
  if (!studentId || !amount) return null;
  const g = gameOf(studentId);
  const before = levelForXp(g.xp).level;
  g.xp += amount;
  const after = levelForXp(g.xp).level;
  persist(); emit();
  return { amount, leveledUp: after > before, level: after };
}
export function hasBadge(studentId, badgeId) { return !!gameOf(studentId).badges[badgeId]; }
export function grantBadge(studentId, badgeId) {
  const g = gameOf(studentId);
  if (g.badges[badgeId]) return false;
  g.badges[badgeId] = Date.now();
  persist(); emit();
  return true;
}
export function earnedBadges(studentId) { return gameOf(studentId).badges; }

// ---- Notifications (family-wide) ----
export function notifications() { return state.notifications; }
export function unreadCount() { return state.notifications.filter(n => !n.read).length; }
export function addNotification(n) {
  const full = { id: 'n_' + Math.random().toString(36).slice(2, 9), read: false, createdAt: Date.now(), ...n };
  state.notifications.unshift(full);
  // keep the list from growing without bound
  if (state.notifications.length > 100) state.notifications = state.notifications.slice(0, 100);
  persist(); emit();
  return full;
}
export function markNotificationRead(id) {
  const n = state.notifications.find(x => x.id === id);
  if (n) n.read = true;
  persist(); emit();
}
export function markAllNotificationsRead() {
  state.notifications.forEach(n => { n.read = true; });
  persist(); emit();
}
export function clearNotifications() { state.notifications = []; persist(); emit(); }

// ---- Curriculum snapshot (for detecting repo updates) ----
export function getCurriculumSnapshot() { return state.curriculumSnapshot; }
export function setCurriculumSnapshot(snap) { state.curriculumSnapshot = snap; persist(); }

export function graphView() {
  return state.graphView === 'list' ? 'list' : 'atlas';
}
export function setGraphView(mode) {
  const next = mode === 'list' ? 'list' : 'atlas';
  if (state.graphView === next) return;
  state.graphView = next;
  persist();
  emit();
}

// ---- Child view ----
// While the child view is open, celebrations stay silent and tests and
// challenges render without scores. Not persisted: a reload always returns to
// the grown-up view, which is also the "forgot the PIN" path.
let childViewOpen = false;
export function isChildViewOpen() { return childViewOpen; }
export function setChildViewOpen(open) { childViewOpen = !!open; }

// A four-digit PIN that keeps the child view from closing with one tap. A
// family-device convenience, not authentication.
export function parentPin() {
  // String() so a hand-edited numeric value in the data file still matches.
  const pin = state.settings?.parentPin;
  return pin == null || pin === '' ? null : String(pin);
}
export function setParentPin(pin) {
  if (!/^\d{4}$/.test(String(pin))) return false;
  state.settings = { ...state.settings, parentPin: String(pin) };
  persist();
  return true;
}

// ---- Lesson cache (shared by this family) ----
// Lessons are reusable teaching material keyed by topic/activity.
const lessonCache = new Map();

export async function getCachedLesson(id) {
  if (lessonCache.has(id)) return lessonCache.get(id);
  try {
    const data = await backend.loadLesson(id);
    if (data) {
      lessonCache.set(id, data);
      return data;
    }
  } catch {}
  return null;
}

export async function saveCachedLesson(id, data) {
  lessonCache.set(id, data);
  try { await backend.saveLesson(id, data); } catch {}
}

export { emit };
