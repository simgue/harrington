// Builds a day-by-day learning track from age 5 to 13 for a student, and
// picks deterministic daily "extras" (refreshers + activities/quizzes).
// The planning core (planTrack, pickExtras, the calendar helpers) is pure so
// it can be tested without the store; buildPlan and dailyExtras wire it up.
import { getData, SUBJECTS, orderTopics, topicAge, hardPrereqs } from './data.js';
import { LANES } from './daily.js';
import { isUnlocked } from './mastery.js';
import * as store from './store.js';
import { normalizeCalendar } from './store.js';

const SCHOOL_DAYS_PER_YEAR = 180;   // home days of new-topic teaching per year

function pad(n) { return String(n).padStart(2, '0'); }
export function keyOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }

const validKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && keyOf(parseKey(k)) === k;

// Calendar normalization lives with the store, which validates what it saves.
export { normalizeCalendar };

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

// What a rest day pauses until: null on a home day, else
// { kind, label, until, nextKey }. `until` is the last day of the break
// (null on a weekly day off); `nextKey` is the next home day.
export function pauseInfo(dateKey, calendar) {
  const cal = normalizeCalendar(calendar);
  const rest = restInfo(dateKey, cal);
  if (!rest) return null;
  const br = rest.kind === 'break' ? cal.breaks.find(b => dateKey >= b.start && dateKey <= b.end) : null;
  return { ...rest, until: br ? br.end : null, nextKey: nextHomeDayKey(dateKey, cal) };
}

// The day-panel heading for the day's new topics.
export function newTopicsHeading(dateKey, todayKey) {
  if (dateKey === todayKey) return 'New today';
  return 'New on ' + parseKey(dateKey).toLocaleDateString('en-US', { weekday: 'long' });
}

// Which done control a day offers: 'mark' on a home day not yet done,
// 'unmark' on any day marked done (a day that later became a rest day keeps
// its check and can still be reopened), null on a rest day not done.
export function doneControl(rest, done) {
  if (done) return 'unmark';
  return rest ? null : 'mark';
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
// interleaved across the domains within each age. Each topic's unmastered
// hard prerequisites come in just before it (wherever they sit in the
// taxonomy), so no topic is taught ahead of what it builds on.
// prereqs(id) -> [id] gives a topic's hard prerequisites.
export function onRampTopics(topics, { age, mastered = () => false, prereqs = () => [], lanes = LANES }) {
  const domains = Object.values(lanes).flatMap(l => l.domains.map(domain => ({ subject: l.subject, domain })));
  const base = [];
  for (let a = 5; a < age; a++) {
    base.push(...interleave(domains.map(({ subject, domain }) => orderTopics(topics.filter(t =>
      t.subject === subject && t.domain === domain && topicAge(t) === a && !mastered(t.id))))));
  }
  const byId = new Map(topics.map(t => [t.id, t]));
  const out = [];
  const seen = new Set(); // visited, so a prerequisite cycle cannot loop
  const visit = (t) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    for (const pid of prereqs(t.id)) {
      const p = byId.get(pid);
      if (p && !mastered(pid)) visit(p);
    }
    out.push(t);
  };
  base.forEach(visit);
  return out;
}

// Topics marked mastered before the track: placement results, and anything
// mastered before the start date. The on-ramp skips them; a topic mastered
// while following the track keeps its day, so the plan does not reshuffle as
// topics bloom. progress: { topicId: { status, updatedAt, source? } }.
export function masteredBeforeTrack(progress, startKey) {
  const ids = [];
  for (const [id, p] of Object.entries(progress || {})) {
    if (p?.status !== 'mastered') continue;
    if (p.source === 'placement' || !p.updatedAt || keyOf(new Date(p.updatedAt)) < startKey) ids.push(id);
  }
  return ids.sort();
}

// How catch-up topics share the first age band with the learner's own-age
// topics: 'catch-up-first' (every catch-up topic before the first own-age
// one, the default) or 'mixed' (two catch-up topics to one own-age topic).
export const PACES = ['catch-up-first', 'mixed'];
export const DEFAULT_PACE = 'catch-up-first';
export const normalizePace = (p) => (PACES.includes(p) ? p : DEFAULT_PACE);

// Mixed pace: two from `ramp`, then one from `rest`, repeated. An own-age
// topic waits until every prerequisite of it in the band has come before it,
// so mixing never teaches a topic ahead of what it builds on.
function mixRamp(ramp, rest, prereqs) {
  const inBand = new Set([...ramp, ...rest].map(t => t.id));
  const placed = new Set();
  const ready = (t) => prereqs(t.id).every(pid => !inBand.has(pid) || placed.has(pid));
  const r = [...ramp], o = [...rest], out = [];
  const take = (t) => { out.push(t); placed.add(t.id); };
  while (r.length) {
    for (let i = 0; i < 2 && r.length; i++) take(r.shift());
    const idx = o.findIndex(ready);
    if (idx >= 0) take(o.splice(idx, 1)[0]);
  }
  o.forEach(take); // catch-up done: the rest in band order, as catch-up first would
  return out;
}

/**
 * The whole track as dates. Pure.
 *
 * opts: {
 *   startKey,        // 'yyyy-mm-dd' the track begins
 *   age,             // learner's age (whole years, clamped to 5–13)
 *   calendar,        // { homeDays, breaks } (normalized here)
 *   moves,           // { topicId: dateKey } parent overrides
 *   mastered(id),    // true for topics mastered before the track (on-ramp skips them)
 *   prereqs(id),     // hard prerequisite ids, for the on-ramp order
 *   subjects,        // subject names in display order
 *   pace,            // 'catch-up-first' (default) or 'mixed', see PACES
 * }
 *
 * Each age band spreads that age's topics over ~180 home days. The first band
 * also carries the on-ramp (see onRampTopics), placed first and never more per
 * day than the band alone would have; the band stretches over extra home
 * days when it needs to. A topic lands on a later day than any prerequisite
 * placed before it in the same band.
 * Returns { byDate: Map(key -> [topic]), topicDate: Map(id -> key), firstKey, lastKey,
 *   ramp: { count, lastKey, firstOwnKey } } where ramp.lastKey is the last
 *   catch-up topic's day and ramp.firstOwnKey the first own-age topic's day
 *   (before parent moves).
 */
export function planTrack(topics, opts) {
  const { startKey, moves = {}, mastered = () => false, prereqs = () => [], subjects = Object.keys(SUBJECTS) } = opts;
  const cal = normalizeCalendar(opts.calendar);
  const startAge = Math.min(13, Math.max(5, Math.floor(opts.age || 5)));
  const byId = new Map(topics.map(t => [t.id, t]));
  const topicDate = new Map();
  let cursor = parseKey(startKey);

  const ramp = onRampTopics(topics, { age: startAge, mastered, prereqs });
  const claimed = new Set(ramp.map(t => t.id)); // pulled into the ramp from any age
  const pace = normalizePace(opts.pace);
  const rampInfo = { count: ramp.length, lastKey: null, firstOwnKey: null };

  for (let age = startAge; age <= 13; age++) {
    const band = interleave(subjects.map(sub => orderTopics(topics.filter(t => t.subject === sub && topicAge(t) === age))));
    const perDay = Math.max(1, Math.ceil(band.length / SCHOOL_DAYS_PER_YEAR));
    const rest = band.filter(t => !claimed.has(t.id));
    const list = age !== startAge ? rest : pace === 'mixed' ? mixRamp(ramp, rest, prereqs) : [...ramp, ...rest];
    const n = list.length;
    const span = Math.max(SCHOOL_DAYS_PER_YEAR, Math.ceil(n / perDay));
    // Extra home days as slack for prerequisite pushes.
    const days = homeDaysFrom(cursor, span + n, cal);
    if (days.length === 0) continue;

    const dayOf = new Map();
    const perDayCount = [];
    let prev = 0, last = span - 1;
    list.forEach((t, i) => {
      let d = Math.max(prev, n <= 1 ? 0 : Math.floor(i * span / n));
      for (const pid of prereqs(t.id)) if (dayOf.has(pid)) d = Math.max(d, dayOf.get(pid) + 1);
      while ((perDayCount[d] || 0) >= perDay) d++;
      d = Math.min(d, days.length - 1);
      perDayCount[d] = (perDayCount[d] || 0) + 1;
      dayOf.set(t.id, d);
      const k = keyOf(days[d]);
      topicDate.set(t.id, k);
      if (age === startAge) {
        if (claimed.has(t.id)) { if (!rampInfo.lastKey || k > rampInfo.lastKey) rampInfo.lastKey = k; }
        else if (!rampInfo.firstOwnKey || k < rampInfo.firstOwnKey) rampInfo.firstOwnKey = k;
      }
      prev = d;
      last = Math.max(last, d);
    });

    // Next age-band begins the day after this one ends.
    cursor = new Date(days[Math.min(last, days.length - 1)]);
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
  return { byDate, topicDate, firstKey, lastKey, ramp: rampInfo };
}

// Whole weeks from one day key to another (at least 1 when `to` is later).
export function weeksBetween(fromKey, toKey) {
  const days = Math.round((parseKey(toKey) - parseKey(fromKey)) / 86400000);
  return days <= 0 ? 0 : Math.max(1, Math.round(days / 7));
}

// The calendar's line about the catch-up pace, for a plan and its start day.
export function paceSummary(plan, startKey, pace, name = 'your student') {
  const ramp = plan && plan.ramp;
  if (!ramp || !ramp.count) return `No catch-up topics: the track starts at ${name}'s own age.`;
  const n = `${ramp.count} catch-up topic${ramp.count === 1 ? '' : 's'}`;
  const wk = (k) => { const w = weeksBetween(startKey, k); return `${w} week${w === 1 ? '' : 's'}`; };
  if (normalizePace(pace) === 'mixed') {
    return `Mixed: two catch-up topics to one own-age topic. ${n} finish in about ${wk(ramp.lastKey)}, with own-age topics from the first week.`;
  }
  return `Catch-up first: ${n} come before ${name}'s first own-age topic, about ${wk(ramp.firstOwnKey || ramp.lastKey)} of home days.`;
}

// Deterministic RNG so a given date always yields the same extras.
function seedFromKey(k) { let h = 2166136261; for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/**
 * Daily extras. Pure. Refreshers (and the activity built on them) come only
 * from mastered topics; with nothing mastered there is no refresher.
 * opts: { seed, dateKey, age, statusOf(id), isUnlocked(id) }
 * The stretch challenge only comes from unlocked topics (every hard
 * prerequisite mastered).
 * Returns { refresher, refresher2, challenge, featured, rngSeed }.
 */
export function pickExtras(topics, { seed, dateKey, age, statusOf, isUnlocked = () => true }) {
  const rng = mulberry32(seedFromKey(seed));
  const pick = arr => arr.length ? arr[Math.floor(rng() * arr.length)] : null;

  const mastered = topics.filter(t => statusOf(t.id) === 'mastered');
  const refresher = pick(mastered);
  // A second, different refresher for variety (the same one when only one is mastered).
  const refresher2 = pick(mastered.filter(t => t !== refresher)) || refresher;

  // Challenge: an upcoming/unmastered topic near their age for a stretch.
  const a = age || 5;
  const upcoming = topics.filter(t => statusOf(t.id) !== 'mastered' && Math.abs(topicAge(t) - a) <= 1 && isUnlocked(t.id));
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

export function buildPlan(student) {
  if (!student) return { byDate: new Map(), topicDate: new Map() };
  const startKey = planStartKey(student);
  const age = store.studentAge(student) || 5;
  const calendar = familyCalendar();
  const moves = store.planOverrides(student.id).moves || {};
  const pace = normalizePace(store.planOverrides(student.id).pace);
  const before = masteredBeforeTrack(store.progressFor(student.id), startKey);
  const cacheKey = student.id + '|' + JSON.stringify([startKey, age, calendar, moves, before, pace]);
  if (_planCache.has(cacheKey)) return _planCache.get(cacheKey);

  const set = new Set(before);
  const prereqs = id => hardPrereqs(id).map(p => p.id);
  const plan = planTrack(getData().topics, { startKey, age, calendar, moves, mastered: id => set.has(id), prereqs, pace });
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

// Deterministic daily extras: refresher topics + a suggested activity/quiz.
export function dailyExtras(student, dateKey) {
  return pickExtras(getData().topics, {
    seed: student.id + '|' + dateKey,
    dateKey,
    age: store.studentAge(student) || 5,
    statusOf: id => store.statusOf(student.id, id),
    isUnlocked: id => isUnlocked(student.id, id),
  });
}
