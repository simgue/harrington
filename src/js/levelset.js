// Level-set workbook: find where a learner is in a lane (literacy or
// numeracy) by asking the parent "Can they…?" about one sheet of topics at a
// time, instead of asserting "everything below age N" as placement does.
//
// The walk, per learner and lane:
//   1. Start at the lane's topics for age minus one (one "level" = one age
//      band of the lane's domains; each domain in it is a section).
//   2. The parent marks each topic Yes, Not yet or Unsure.
//      - Yes marks it mastered with its hard-prerequisite closure, through
//        a placement record so Records can undo it. The closure stops at a
//        topic the parent answered Not yet or Unsure: their answer wins.
//      - Not yet stops that branch there; its unknown prerequisites in the
//        lane are asked on a later sheet ("foundations"), and so on down.
//      - Unsure queues the topic for an observation check on its topic page.
//   3. A level with Yes and no Not yet moves the walk up a level. A level
//      with Not yet and no Yes moves it down a level. Then the walk follows
//      the prerequisite graph down from every Not yet until nothing is left
//      to ask. The frontier is the Not yet topics whose lane prerequisites
//      are all known: where to start teaching.
// Sheets are frozen once built and every answer is saved, so a sitting can
// stop and resume anywhere. Pure, so it can be tested without the store;
// views/levelset.js wires it to the family's data.
import { canTheyPrompt, assessmentQuestion } from './phrasing.js';

export const ANSWERS = {
  yes: { label: 'Yes', icon: 'check' },
  no: { label: 'Not yet', icon: 'sprout' },
  unsure: { label: 'Unsure', icon: 'help-circle' },
};

// A sitting is about this long; the view shows elapsed time and suggests a
// pause, nothing more.
export const SITTING_MINUTES = 20;

const clampAge = (a) => Math.min(13, Math.max(5, a || 5));

// The topics of one lane ({ subject, domains }), in the given order.
export function laneTopics(topics, lane) {
  return topics.filter(t => t.subject === lane.subject && lane.domains.includes(t.domain));
}

// The lane's age bands, ascending.
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

export function newSession(lane, { age, levels, now = Date.now() }) {
  return {
    lane, startLevel: startLevel(age, levels),
    sheets: [],        // [{ kind: 'level'|'foundations', level, dir: 'up'|'down', ids, savedAt?, recordId? }]
    answers: {},       // topicId -> 'yes' | 'no' | 'unsure'
    elapsedMs: 0,      // time spent across sittings
    startedAt: now, done: false, frontier: null,
  };
}

/**
 * ctx: {
 *   topics,            // the lane's topics ({ id, name, domain, ageRangeStart })
 *   levels,            // laneLevels(topics)
 *   topicAge(topic),
 *   hardPrereqs(id),   // [{ id }] across the whole taxonomy
 *   mastered(id),      // current progress, including earlier sheets' marks
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

function knownFn(ctx, answers) {
  const yes = Object.keys(answers).filter(id => answers[id] === 'yes');
  const implied = new Set(yesClosure(ctx, answers, yes));
  return (id) => ctx.mastered(id) || implied.has(id);
}

// The next sheet to ask, or null when the walk is finished. Call it once the
// last sheet is saved (or with no sheets yet).
export function nextSheet(ctx, session) {
  const { sheets, answers } = session;
  const last = sheets[sheets.length - 1];
  if (last && !last.savedAt) return null;
  const asked = new Set(sheets.flatMap(s => s.ids));
  const known = knownFn(ctx, answers);
  const atLevel = (level) => ctx.topics.filter(t => ctx.topicAge(t) === level && !known(t.id) && !asked.has(t.id)).map(t => t.id);
  // The first level from `level` (inclusive) in `dir` with anything to ask.
  const walk = (level, dir) => {
    const step = dir === 'up' ? 1 : -1;
    for (let i = ctx.levels.indexOf(level); i >= 0 && i < ctx.levels.length; i += step) {
      const ids = atLevel(ctx.levels[i]);
      if (ids.length) return { kind: 'level', level: ctx.levels[i], dir, ids };
    }
    return null;
  };
  const neighbor = (level, dir) => ctx.levels[ctx.levels.indexOf(level) + (dir === 'up' ? 1 : -1)];

  if (!last) return walk(session.startLevel, 'up') || foundations();
  if (last.kind === 'level') {
    const marks = last.ids.map(id => answers[id]);
    const anyYes = marks.includes('yes');
    const anyNo = marks.includes('no');
    if (last.dir === 'up' && anyYes && !anyNo) {
      const up = neighbor(last.level, 'up');
      const sheet = up != null && walk(up, 'up');
      if (sheet) return sheet;
    } else if (anyNo && !anyYes) {
      const down = neighbor(last.level, 'down');
      const sheet = down != null && walk(down, 'down');
      if (sheet) return sheet;
    }
  }
  return foundations();

  // The unknown lane prerequisites of every Not yet, as one sheet.
  function foundations() {
    const inLane = new Map(ctx.topics.map((t, i) => [t.id, i]));
    const ids = [];
    for (const id of Object.keys(answers)) {
      if (answers[id] !== 'no') continue;
      for (const p of ctx.hardPrereqs(id) || []) {
        if (inLane.has(p.id) && !known(p.id) && !asked.has(p.id) && !ids.includes(p.id)) ids.push(p.id);
      }
    }
    if (!ids.length) return null;
    const byId = new Map(ctx.topics.map(t => [t.id, t]));
    ids.sort((a, b) => (ctx.topicAge(byId.get(b)) - ctx.topicAge(byId.get(a))) || (inLane.get(a) - inLane.get(b)));
    return { kind: 'foundations', level: Math.max(...ids.map(id => ctx.topicAge(byId.get(id)))), dir: 'down', ids };
  }
}

// Where to start: the Not yet topics whose lane prerequisites are all known,
// the lowest level among them, and the topics left Unsure. With no Not yet
// at all, level is null (the lane is known as far as it was asked).
export function frontier(ctx, session) {
  const { answers } = session;
  const known = knownFn(ctx, answers);
  const inLane = new Set(ctx.topics.map(t => t.id));
  const byId = new Map(ctx.topics.map(t => [t.id, t]));
  const ids = ctx.topics.map(t => t.id).filter(id => answers[id] === 'no'
    && (ctx.hardPrereqs(id) || []).filter(p => inLane.has(p.id)).every(p => known(p.id)));
  return {
    level: ids.length ? Math.min(...ids.map(id => ctx.topicAge(byId.get(id)))) : null,
    ids,
    unsure: ctx.topics.map(t => t.id).filter(id => answers[id] === 'unsure'),
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

// The ids a save of the current sheet marks mastered, and those it queues.
export function sheetEffects(ctx, session) {
  const last = session.sheets[session.sheets.length - 1];
  if (!last) return { master: [], own: 0, unsure: [] };
  const yes = last.ids.filter(id => session.answers[id] === 'yes');
  const master = yesClosure(ctx, session.answers, yes);
  return {
    master,
    own: master.filter(id => yes.includes(id)).length,
    unsure: last.ids.filter(id => session.answers[id] === 'unsure'),
  };
}

// Marks the current sheet saved (with the placement record it made, if any)
// and moves on: the next sheet, or done with the frontier. `ctx.mastered`
// must already include the marks this sheet made.
export function completeSheet(ctx, session, { recordId = null, now = Date.now() } = {}) {
  const sheets = session.sheets.map((s, i) => (i === session.sheets.length - 1 ? { ...s, savedAt: now, recordId } : s));
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

// Undo back to sheet `index`: that sheet opens again with its answers, later
// sheets go, and the placement records they made are returned so the caller
// can undo them (newest first). Answers on later sheets are dropped.
export function reopenSheet(session, index) {
  if (index < 0 || index >= session.sheets.length) return { session, recordIds: [] };
  const dropped = session.sheets.slice(index + 1);
  const recordIds = session.sheets.slice(index).map(s => s.recordId).filter(Boolean).reverse();
  const answers = { ...session.answers };
  for (const s of dropped) for (const id of s.ids) delete answers[id];
  const sheets = session.sheets.slice(0, index + 1).map((s, i) => (i === index ? { ...s, savedAt: null, recordId: null } : s));
  return { session: { ...session, sheets, answers, done: false, frontier: null }, recordIds };
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

export function sheetTitle(sheet, laneLabel) {
  return sheet.kind === 'foundations'
    ? `${laneLabel}: foundations to check`
    : `${laneLabel}: age ${sheet.level} sheet`;
}

// The Records title for the placement a sheet makes.
export function levelsetTitle({ count, own = count, laneLabel, sheet }) {
  const extra = count > own ? `, plus ${count - own} prerequisite${count - own === 1 ? '' : 's'}` : '';
  const where = sheet.kind === 'foundations' ? 'foundations sheet' : `age ${sheet.level} sheet`;
  return `Level-set workbook: marked ${own} ${laneLabel.toLowerCase()} topic${own === 1 ? '' : 's'} mastered (${where})${extra}`;
}

// Elapsed time in a sitting, and whether to suggest a pause.
export function sittingNotice(ms, minutes = SITTING_MINUTES) {
  const m = Math.floor(Math.max(0, ms) / 60000);
  return { minutes: m, pause: m >= minutes };
}
