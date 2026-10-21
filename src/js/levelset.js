// Level-set workbook: find where a learner is in a lane (literacy or
// numeracy) by asking the parent "Can they…?" about one short sheet of
// topics at a time, instead of asserting "everything below age N" as
// placement does.
//
// The walk, per learner and lane:
//   1. Each domain of the lane is walked on its own, starting at its topics
//      for age minus one (a section: one domain in one age band). A sheet is
//      one section, at most SHEET_MAX topics; a bigger section takes more
//      than one sheet.
//   2. The parent marks each topic Yes, Not yet or Unsure.
//   3. Per domain: a section with Yes and no Not yet moves that domain up a
//      band; one with Not yet and no Yes moves it down a band; anything else
//      ends that domain's walk. One domain's answers never stop another's.
//   4. Then the walk follows the prerequisite graph down from every Not yet
//      ("foundations" sheets) until nothing is left to ask.
//   5. Saving a sheet stores its answers only. At the end, one proposal
//      lists everything that Yes would mark mastered (each Yes and its hard-
//      prerequisite closure, which can cross subjects, stopping at a topic
//      answered Not yet or Unsure), and the parent confirms it as a single
//      placement record that Records can undo. Unsure topics then wait for
//      an observation check on their topic page.
// Sheets are frozen once built and every answer is saved, so a sitting can
// stop and resume anywhere. Pure, so it can be tested without the store;
// views/levelset.js wires it to the family's data.
import { canTheyPrompt, assessmentQuestion } from './phrasing.js';
import { countLabel } from './format.js';

export const ANSWERS = {
  yes: { label: 'Yes', icon: 'check' },
  no: { label: 'Not yet', icon: 'sprout' },
  unsure: { label: 'Unsure', icon: 'help-circle' },
};

// A sitting is about this long; the view shows elapsed time and suggests a
// pause, nothing more. A sheet is at most SHEET_MAX topics, so a sitting is
// a sheet or two.
export const SITTING_MINUTES = 20;
export const SHEET_MAX = 12;
export const SESSION_VERSION = 2;

const clampAge = (a) => Math.min(13, Math.max(5, a || 5));

// The topics of one lane ({ subject, domains }), in the given order.
export function laneTopics(topics, lane) {
  return topics.filter(t => t.subject === lane.subject && lane.domains.includes(t.domain));
}

// Age bands present in a list of topics, ascending.
export function laneLevels(topics, topicAge) {
  return [...new Set(topics.map(topicAge))].sort((a, b) => a - b);
}

// Age minus one, as placement's default; the nearest band at or below it,
// else the lowest band.
export function startLevel(age, levels) {
  const target = clampAge((age || 6) - 1);
  const below = levels.filter(l => l <= target);
  return below.length ? below[below.length - 1] : (levels[0] ?? target);
}

export function newSession(lane, { age, now = Date.now() }) {
  return {
    version: SESSION_VERSION, lane, age: age || null,
    sheets: [],        // [{ kind: 'section'|'foundations', domain?, level?, dir?, part, ids, savedAt }]
    answers: {},       // topicId -> 'yes' | 'no' | 'unsure'
    elapsedMs: 0,      // time spent across sittings
    startedAt: now, done: false, frontier: null,
    placed: null,      // { recordId, at, count, queued } once the proposal is confirmed
  };
}

// A stored session, checked; anything malformed gives null (start over)
// rather than a crash.
export function normalizeSession(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== SESSION_VERSION) return null;
  if (!Array.isArray(raw.sheets) || !raw.answers || typeof raw.answers !== 'object' || Array.isArray(raw.answers)) return null;
  const sheets = [];
  for (const s of raw.sheets) {
    if (!s || typeof s !== 'object' || !['section', 'foundations'].includes(s.kind)) return null;
    if (!Array.isArray(s.ids) || !s.ids.length || !s.ids.every(id => typeof id === 'string')) return null;
    sheets.push(s);
  }
  const answers = {};
  for (const [id, a] of Object.entries(raw.answers)) if (ANSWERS[a]) answers[id] = a;
  return {
    ...raw, sheets, answers,
    elapsedMs: Number.isFinite(raw.elapsedMs) ? raw.elapsedMs : 0,
    done: !!raw.done,
    placed: raw.placed && typeof raw.placed === 'object' ? raw.placed : null,
  };
}

/**
 * ctx: {
 *   topics,            // the lane's topics ({ id, name, domain, ageRangeStart })
 *   domains,           // the lane's domains, in walking order
 *   topicAge(topic),
 *   hardPrereqs(id),   // [{ id }] across the whole taxonomy
 *   mastered(id),      // current progress
 * }
 */

// What a Yes on these topics marks mastered: each one and its hard-
// prerequisite closure, skipping mastered topics and stopping at a topic the
// parent answered Not yet or Unsure.
export function yesClosure(ctx, answers, yesIds) {
  const out = [];
  const seen = new Set();
  const stack = [...yesIds].reverse();
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    if (ctx.mastered(id)) continue;
    const a = answers[id];
    if (a && a !== 'yes') continue;
    out.push(id);
    for (const p of [...(ctx.hardPrereqs(id) || [])].reverse()) stack.push(p.id);
  }
  return out;
}

// Mastered, or implied by a Yes answer (not yet written).
function knownFn(ctx, answers) {
  const yes = Object.keys(answers).filter(id => answers[id] === 'yes');
  const implied = new Set(yesClosure(ctx, answers, yes));
  return (id) => ctx.mastered(id) || implied.has(id);
}

const domainsOf = (ctx) => ctx.domains || [...new Set(ctx.topics.map(t => t.domain))];

// The next sheet to ask, or null when the walk is finished. Call it once the
// last sheet is saved (or with no sheets yet).
export function nextSheet(ctx, session) {
  const { sheets, answers } = session;
  const last = sheets[sheets.length - 1];
  if (last && !last.savedAt) return null;
  const asked = new Set(sheets.flatMap(s => s.ids));
  const known = knownFn(ctx, answers);
  const unknownAt = (domain, level) => ctx.topics
    .filter(t => t.domain === domain && ctx.topicAge(t) === level && !known(t.id) && !asked.has(t.id)).map(t => t.id);
  const levelsOf = (domain) => laneLevels(ctx.topics.filter(t => t.domain === domain), ctx.topicAge);
  const partOf = (domain, level) => sheets.filter(s => s.kind === 'section' && s.domain === domain && s.level === level).length + 1;
  const section = (domain, level, dir, ids) => ({ kind: 'section', domain, level, dir, part: partOf(domain, level), ids: ids.slice(0, SHEET_MAX) });
  // The first band from `level` (inclusive) in `dir` with anything to ask.
  const walk = (domain, level, dir) => {
    const lv = levelsOf(domain);
    const step = dir === 'up' ? 1 : -1;
    for (let i = lv.indexOf(level); i >= 0 && i < lv.length; i += step) {
      const ids = unknownAt(domain, lv[i]);
      if (ids.length) return section(domain, lv[i], dir, ids);
    }
    return null;
  };

  for (const domain of domainsOf(ctx)) {
    const lv = levelsOf(domain);
    if (!lv.length) continue;
    const mine = sheets.filter(s => s.kind === 'section' && s.domain === domain);
    if (!mine.length) {
      const first = walk(domain, startLevel(session.age, lv), 'up');
      if (first) return first;
      continue;
    }
    const at = mine[mine.length - 1];
    // The rest of a section bigger than one sheet.
    const rest = unknownAt(domain, at.level);
    if (rest.length) return section(domain, at.level, at.dir, rest);
    const marks = mine.filter(s => s.level === at.level).flatMap(s => s.ids).map(id => answers[id]);
    const anyYes = marks.includes('yes');
    const anyNo = marks.includes('no');
    const i = lv.indexOf(at.level);
    let next = null;
    if (at.dir === 'up' && anyYes && !anyNo && i + 1 < lv.length) next = walk(domain, lv[i + 1], 'up');
    else if (anyNo && !anyYes && i > 0) next = walk(domain, lv[i - 1], 'down');
    if (next) return next;
  }
  return foundations();

  // The unknown lane prerequisites of every Not yet, a sheet at a time.
  function foundations() {
    const order = new Map(ctx.topics.map((t, i) => [t.id, i]));
    const ids = [];
    for (const id of Object.keys(answers)) {
      if (answers[id] !== 'no') continue;
      for (const p of ctx.hardPrereqs(id) || []) {
        if (order.has(p.id) && !known(p.id) && !asked.has(p.id) && !ids.includes(p.id)) ids.push(p.id);
      }
    }
    if (!ids.length) return null;
    const byId = new Map(ctx.topics.map(t => [t.id, t]));
    ids.sort((a, b) => (ctx.topicAge(byId.get(b)) - ctx.topicAge(byId.get(a))) || (order.get(a) - order.get(b)));
    const part = sheets.filter(s => s.kind === 'foundations').length + 1;
    return { kind: 'foundations', dir: 'down', part, ids: ids.slice(0, SHEET_MAX) };
  }
}

/**
 * Where to start, once the walk is done. status:
 *   'ready'    ids: Not yet topics whose lane foundations are all known
 *   'blocked'  ids: the youngest Not yet topics; none has every foundation
 *              known (they wait on Unsure topics, listed in waitingOn, or on
 *              each other)
 *   'unsure'   nothing was marked Not yet; the Unsure topics decide
 *   'known'    everything asked is known; ids: the next unknown topics whose
 *              foundations are known (never answered)
 *   'complete' every topic in the lane is known
 * unsure: every topic answered Unsure.
 */
export function frontier(ctx, session) {
  const { answers } = session;
  const known = knownFn(ctx, answers);
  const byId = new Map(ctx.topics.map(t => [t.id, t]));
  const age = (id) => ctx.topicAge(byId.get(id));
  const laneReqs = (id) => (ctx.hardPrereqs(id) || []).filter(p => byId.has(p.id)).map(p => p.id);
  const ids = ctx.topics.map(t => t.id);
  const nos = ids.filter(id => answers[id] === 'no');
  const unsure = ids.filter(id => answers[id] === 'unsure');
  const youngest = (list) => { const m = Math.min(...list.map(age)); return list.filter(id => age(id) === m); };

  const ready = nos.filter(id => laneReqs(id).every(known));
  if (ready.length) return { status: 'ready', ids: ready, waitingOn: [], unsure };
  if (nos.length) {
    const waitingOn = [...new Set(nos.flatMap(id => laneReqs(id).filter(p => answers[p] === 'unsure')))];
    return { status: 'blocked', ids: youngest(nos), waitingOn, unsure };
  }
  if (unsure.length) return { status: 'unsure', ids: [], waitingOn: [], unsure };
  const next = ids.filter(id => !known(id) && !answers[id] && laneReqs(id).every(known));
  if (next.length) return { status: 'known', ids: youngest(next).slice(0, SHEET_MAX), waitingOn: [], unsure };
  if (ids.some(id => !known(id))) return { status: 'blocked', ids: youngest(ids.filter(id => !known(id))), waitingOn: [], unsure };
  return { status: 'complete', ids: [], waitingOn: [], unsure };
}

// What confirming the workbook writes: every Yes with its closure, against
// current progress, and the Unsure topics to queue.
export function proposal(ctx, session) {
  const yes = Object.keys(session.answers).filter(id => session.answers[id] === 'yes');
  const master = yesClosure(ctx, session.answers, yes);
  const lane = new Set(ctx.topics.map(t => t.id));
  return {
    master,
    own: master.filter(id => yes.includes(id)).length,
    unsure: ctx.topics.map(t => t.id).filter(id => session.answers[id] === 'unsure'),
    level: Math.max(0, ...ctx.topics.filter(t => session.answers[t.id] && lane.has(t.id)).map(ctx.topicAge)),
  };
}

export function setAnswer(session, topicId, answer) {
  const last = session.sheets[session.sheets.length - 1];
  if (!last || last.savedAt || !last.ids.includes(topicId) || !ANSWERS[answer]) return session;
  return { ...session, answers: { ...session.answers, [topicId]: answer } };
}

export function sheetComplete(session) {
  const last = session.sheets[session.sheets.length - 1];
  return !!last && !last.savedAt && last.ids.every(id => session.answers[id]);
}

// Saves the current sheet's answers (nothing else is written) and moves on:
// the next sheet, or done with the frontier.
export function completeSheet(ctx, session, { now = Date.now() } = {}) {
  const sheets = session.sheets.map((s, i) => (i === session.sheets.length - 1 ? { ...s, savedAt: now } : s));
  return advance(ctx, { ...session, sheets });
}

// Adds the next sheet, or finishes. Safe to call on resume.
export function advance(ctx, session) {
  if (session.done) return session;
  const last = session.sheets[session.sheets.length - 1];
  if (last && !last.savedAt) return session;
  const next = nextSheet(ctx, session);
  if (next) return { ...session, sheets: [...session.sheets, next] };
  return { ...session, done: true, frontier: frontier(ctx, session) };
}

// Back to sheet `index`: that sheet opens again with its answers, later
// sheets and their answers go. Nothing was written by the sheets; if the
// proposal was already confirmed, its record id is returned so the caller
// can undo that placement.
export function reopenSheet(session, index) {
  if (index < 0 || index >= session.sheets.length) return { session, recordIds: [] };
  const answers = { ...session.answers };
  for (const s of session.sheets.slice(index + 1)) for (const id of s.ids) delete answers[id];
  const sheets = session.sheets.slice(0, index + 1).map((s, i) => (i === index ? { ...s, savedAt: null } : s));
  const recordIds = session.placed && session.placed.recordId ? [session.placed.recordId] : [];
  return { session: { ...session, sheets, answers, done: false, frontier: null, placed: null }, recordIds };
}

// The rows of a sheet, for the screen and the printable sheet: each topic
// with its "Can they…?" questions (falling back to the suggested question).
export function sheetRows(byId, ids, { name = 'your child', max = 3 } = {}) {
  return ids.map(id => byId.get(id)).filter(Boolean).map(t => {
    const prompts = (t.evidence || []).map(canTheyPrompt).filter(Boolean).slice(0, max);
    const fallback = prompts.length ? '' : assessmentQuestion(t, name);
    return { id: t.id, name: t.name, domain: t.domain, prompts: fallback ? [fallback] : prompts };
  });
}

// A neutral title: the lane and the area, with no age on it.
export function sheetTitle(sheet, laneLabel) {
  const more = sheet.part > 1 ? ' (continued)' : '';
  return sheet.kind === 'foundations'
    ? `${laneLabel} · foundations${more}`
    : `${laneLabel} · ${sheet.domain}${more}`;
}

// The Records title for the confirmed placement.
export function levelsetTitle({ count, own = count, laneLabel }) {
  const extra = count > own ? `, plus ${countLabel(count - own, 'foundation')} they build on` : '';
  return `Level-set workbook: marked ${countLabel(own, `${laneLabel.toLowerCase()} topic`)} mastered${extra}`;
}

// Elapsed time in a sitting, and whether to suggest a pause.
export function sittingNotice(ms, minutes = SITTING_MINUTES) {
  const m = Math.floor(Math.max(0, ms) / 60000);
  return { minutes: m, pause: m >= minutes };
}
