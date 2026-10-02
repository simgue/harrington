// Builds a day-by-day learning track from age 5 to 13 for a student, and
// picks deterministic daily "extras" (refreshers + activities/quizzes).
// The planning core (planTrack, pickExtras, the calendar helpers) is pure so
// it can be tested without the store; buildPlan and dailyExtras wire it up.
import { getData, SUBJECTS, orderTopics, topicAge } from './data.js';
import { LANES } from './daily.js';
import * as store from './store.js';

const SCHOOL_DAYS_PER_YEAR = 180;   // home days of new-topic teaching per year
export const DEFAULT_HOME_DAYS = [1, 2, 3, 4, 5]; // Date#getDay(): Mon–Fri

function pad(n) { return String(n).padStart(2, '0'); }
export function keyOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
export function isWeekend(d) { const g = d.getDay(); return g === 0 || g === 6; }

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const validKey = (k) => typeof k === 'string' && KEY_RE.test(k) && keyOf(parseKey(k)) === k;

// Family calendar settings: which weekdays are home days, and break ranges.
// Anything malformed is dropped; no home days at all falls back to Mon–Fri.
// Returns { homeDays: [0-6, …], breaks: [{ start, end, label }, …] }.
export function normalizeCalendar(raw) {
  const cal = raw && typeof raw === 'object' ? raw : {};
  let homeDays = Array.isArray(cal.homeDays)
    ? [...new Set(cal.homeDays.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b)
    : [];
  if (!homeDays.length) homeDays = [...DEFAULT_HOME_DAYS];
  const breaks = (Array.isArray(cal.breaks) ? cal.breaks : [])
    .filter(b => b && validKey(b.start) && validKey(b.end))
    .map(b => {
      const [start, end] = b.start <= b.end ? [b.start, b.end] : [b.end, b.start];
      return { start, end, label: typeof b.label === 'string' ? b.label.trim().slice(0, 60) : '' };
    })
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return { homeDays, breaks };
}

// Why a day is a rest day: null on a home day, else
// { kind: 'break', label } inside a break or { kind: 'off' } on a non-home weekday.
export function restInfo(dateKey, calendar) {
  const cal = normalizeCalendar(calendar);
  const br = cal.breaks.find(b => dateKey >= b.start && dateKey <= b.end);
  if (br) return { kind: 'break', label: br.label };
  if (!cal.homeDays.includes(parseKey(dateKey).getDay())) return { kind: 'off' };
  return null;
}

// The first home day on or after `dateKey` (or strictly after, with `after`).
export function nextHomeDayKey(dateKey, calendar, { after = false } = {}) {
  const cal = normalizeCalendar(calendar);
  const d = parseKey(dateKey);
  if (after) d.setDate(d.getDate() + 1);
  // Breaks are finite, so a home day turns up; the guard covers ten years.
  for (let i = 0; i < 3660 && restInfo(keyOf(d), cal); i++) d.setDate(d.getDate() + 1);
  return keyOf(d);
}

function homeDaysFrom(startDate, count, cal) {
  const days = [];
  const d = new Date(startDate);
  let guard = 0;
  while (days.length < count && guard < count * 7 + 3660) {
    if (!restInfo(keyOf(d), cal)) days.push(new Date(d));
    d.setDate(d.getDate() + 1);
    guard++;
  }
  return days;
}

// Round-robin across lists so each stretch of days spans a variety.
function interleave(lists) {
  const out = [];
  for (let idx = 0, more = true; more; idx++) {
    more = false;
    for (const list of lists) {
      if (idx < list.length) { out.push(list[idx]); more = true; }
    }
  }
  return out;
}

// Spine topics (the POC literacy and numeracy domains, LANES in daily.js)
// that start below `age` and are not yet mastered: the youngest age first,
// interleaved across the domains within each age.
export function onRampTopics(topics, { age, mastered = () => false, lanes = LANES }) {
  const domains = Object.values(lanes).flatMap(l => l.domains.map(domain => ({ subject: l.subject, domain })));
  const out = [];
  for (let a = 5; a < age; a++) {
    out.push(...interleave(domains.map(({ subject, domain }) => orderTopics(topics.filter(t =>
      t.subject === subject && t.domain === domain && topicAge(t) === a && !mastered(t.id))))));
  }
  return out;
}

/**
 * The whole track as dates. Pure.
 *
 * opts: {
 *   startKey,        // 'yyyy-mm-dd' the track begins
 *   age,             // learner's age, clamped to 5–13
 *   calendar,        // { homeDays, breaks } (normalized here)
 *   moves,           // { topicId: dateKey } parent overrides
 *   mastered(id),    // true for topics already mastered before the track (on-ramp skips them)
 *   subjects,        // subject names in display order
 * }
 *
 * Each age band spreads that age's topics over ~180 home days. The first band
 * also carries the on-ramp (unmastered spine topics below the learner's age),
 * placed first and never more per day than the band alone would have; the
 * band stretches over extra home days when it needs to.
 * Returns { byDate: Map(key -> [topic]), topicDate: Map(id -> key), firstKey, lastKey }.
 */
export function planTrack(topics, opts) {
  const { startKey, moves = {}, mastered = () => false, subjects = Object.keys(SUBJECTS) } = opts;
  const cal = normalizeCalendar(opts.calendar);
  const startAge = Math.min(13, Math.max(5, opts.age || 5));
  const byId = new Map(topics.map(t => [t.id, t]));
  const topicDate = new Map();
  let cursor = parseKey(startKey);

  for (let age = startAge; age <= 13; age++) {
    const band = interleave(subjects.map(sub => orderTopics(topics.filter(t => t.subject === sub && topicAge(t) === age))));
    const perDay = Math.max(1, Math.ceil(band.length / SCHOOL_DAYS_PER_YEAR));
    const list = age === startAge ? [...onRampTopics(topics, { age: startAge, mastered }), ...band] : band;
    const days = homeDaysFrom(cursor, Math.max(SCHOOL_DAYS_PER_YEAR, Math.ceil(list.length / perDay)), cal);
    if (days.length === 0) continue;

    const n = list.length;
    list.forEach((t, i) => {
      const dayIdx = n <= 1 ? 0 : Math.min(days.length - 1, Math.floor(i * days.length / n));
      topicDate.set(t.id, keyOf(days[dayIdx]));
    });

    // Next age-band begins the day after this one ends.
    cursor = new Date(days[days.length - 1]);
    cursor.setDate(cursor.getDate() + 1);
  }

  // Parent overrides (a topic moved to a chosen date). A move that now lands
  // on a rest day (the calendar changed since) slides to the next home day.
  for (const [tid, k] of Object.entries(moves)) {
    if (topicDate.has(tid) && validKey(k)) topicDate.set(tid, nextHomeDayKey(k, cal));
  }

  const byDate = new Map();
  let firstKey = null, lastKey = null;
  for (const [tid, k] of topicDate) {
    const topic = byId.get(tid);
    if (!topic) continue;
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k).push(topic);
    if (!lastKey || k > lastKey) lastKey = k;
    if (!firstKey || k < firstKey) firstKey = k;
  }
  return { byDate, topicDate, firstKey, lastKey };
}

// Deterministic RNG so a given date always yields the same extras.
function seedFromKey(k) { let h = 2166136261; for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/**
 * Daily extras. Pure. Refreshers (and the activity built on them) come only
 * from mastered topics; with nothing mastered there is no refresher.
 * opts: { seed, dateKey, age, statusOf(id) }
 * Returns { refresher, refresher2, challenge, featured, rngSeed }.
 */
export function pickExtras(topics, { seed, dateKey, age, statusOf }) {
  const rng = mulberry32(seedFromKey(seed));
  const pick = arr => arr.length ? arr[Math.floor(rng() * arr.length)] : null;

  const mastered = topics.filter(t => statusOf(t.id) === 'mastered');
  const refresher = pick(mastered);
  // A second, different refresher for variety (the same one when only one is mastered).
  const refresher2 = pick(mastered.filter(t => t !== refresher)) || refresher;

  // Challenge: an upcoming/unmastered topic near their age for a stretch.
  const a = age || 5;
  const upcoming = topics.filter(t => statusOf(t.id) !== 'mastered' && Math.abs(topicAge(t) - a) <= 1);
  const challenge = pick(upcoming);

  // Which kind of extra to feature today.
  const kinds = ['quiz', 'activity', 'game'];
  const featured = kinds[Math.floor(rng() * kinds.length)];

  return { refresher, refresher2, challenge, featured, rngSeed: seedFromKey(dateKey) };
}

// ---- Store-backed wrappers ----

// The family's calendar settings, normalized.
export function familyCalendar() { return normalizeCalendar(store.calendarSettings()); }

const _planCache = new Map(); // cache key -> plan

// The date the track begins: the student's chosen start date, else the day they
// were added, else today. Stored as a yyyy-mm-dd key on the student.
export function planStartKey(student) {
  if (student && student.startDate) return student.startDate;
  if (student && student.createdAt) return keyOf(new Date(student.createdAt));
  return keyOf(new Date());
}

// Topics the on-ramp treats as already mastered: placement results, and
// anything mastered before the track began. Topics mastered while following
// the track stay on their day, so the plan does not reshuffle as they bloom.
function masteredBeforeTrack(studentId, startKey) {
  const ids = [];
  for (const [id, p] of Object.entries(store.progressFor(studentId))) {
    if (p?.status !== 'mastered') continue;
    if (p.source === 'placement' || !p.updatedAt || keyOf(new Date(p.updatedAt)) < startKey) ids.push(id);
  }
  return ids.sort();
}

export function buildPlan(student) {
  if (!student) return { byDate: new Map(), topicDate: new Map() };
  const startKey = planStartKey(student);
  const age = store.studentAge(student) || 5;
  const calendar = familyCalendar();
  const moves = store.planOverrides(student.id).moves || {};
  const before = masteredBeforeTrack(student.id, startKey);
  const cacheKey = student.id + '|' + JSON.stringify([startKey, age, calendar, moves, before]);
  if (_planCache.has(cacheKey)) return _planCache.get(cacheKey);

  const set = new Set(before);
  const plan = planTrack(getData().topics, { startKey, age, calendar, moves, mastered: id => set.has(id) });
  for (const k of [..._planCache.keys()]) { if (k.startsWith(student.id + '|')) _planCache.delete(k); }
  _planCache.set(cacheKey, plan);
  return plan;
}

export function invalidatePlan(studentId) {
  if (!studentId) { _planCache.clear(); return; }
  for (const k of [..._planCache.keys()]) { if (k.startsWith(studentId + '|')) _planCache.delete(k); }
}

export function topicsOn(student, dateKey) {
  return buildPlan(student).byDate.get(dateKey) || [];
}

// The date the school track is "up to" — clamped into the track window.
export function trackDayFor(student, dateKey) {
  const plan = buildPlan(student);
  if (!plan.firstKey) return dateKey;
  if (dateKey < plan.firstKey) return plan.firstKey;
  if (dateKey > plan.lastKey) return plan.lastKey;
  return dateKey;
}

// Deterministic daily extras: refresher topics + a suggested activity/quiz.
export function dailyExtras(student, dateKey) {
  return pickExtras(getData().topics, {
    seed: student.id + '|' + dateKey,
    dateKey,
    age: store.studentAge(student) || 5,
    statusOf: id => store.statusOf(student.id, id),
  });
}
