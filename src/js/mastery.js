// Shared logic for mastery gating, ordering and stats.
import { getData, hardPrereqs, orderTopics, topicAge, SUBJECTS } from './data.js';
import * as store from './store.js';
import { MASTERY } from './store.js';
import { buildDailyChoices, LANES } from './daily.js';

// A topic is "unlocked" when all its HARD prerequisites are mastered.
export function isUnlocked(studentId, topicId) {
  const hp = hardPrereqs(topicId);
  if (hp.length === 0) return true;
  return hp.every(p => store.statusOf(studentId, p.id) === 'mastered');
}

// Which hard prereqs are still not mastered (blocking).
export function blockingPrereqs(studentId, topicId) {
  return hardPrereqs(topicId).filter(p => store.statusOf(studentId, p.id) !== 'mastered');
}

// Topics for a subject grouped by age band, in learning order.
function subjectByAge(subject) {
  const d = getData();
  const list = orderTopics(d.bySubject[subject] || []);
  const byAge = {};
  for (const t of list) {
    const a = topicAge(t);
    (byAge[a] = byAge[a] || []).push(t);
  }
  return byAge;
}

// Overall stats for a student across all subjects.
export function studentStats(studentId) {
  const d = getData();
  const per = {};
  let totalMastered = 0, total = 0;
  for (const subject of Object.keys(SUBJECTS)) {
    const list = d.bySubject[subject] || [];
    let mastered = 0, learning = 0, practicing = 0;
    for (const t of list) {
      const st = store.statusOf(studentId, t.id);
      if (st === 'mastered') mastered++;
      else if (st === 'practicing') practicing++;
      else if (st === 'learning') learning++;
    }
    per[subject] = { total: list.length, mastered, learning, practicing,
      inProgress: learning + practicing,
      pct: list.length ? Math.round((mastered / list.length) * 100) : 0 };
    totalMastered += mastered; total += list.length;
  }
  return { per, totalMastered, total, pct: total ? Math.round((totalMastered / total) * 100) : 0 };
}

// The next best topics to work on for a student: unlocked, not mastered,
// closest to their age, most central first.
export function recommendedNext(studentId, limit = 6) {
  const d = getData();
  const s = store.get().students.find(x => x.id === studentId);
  const age = store.studentAge(s) || 5;
  const candidates = [];
  for (const t of d.topics) {
    const st = store.statusOf(studentId, t.id);
    if (st === 'mastered') continue;
    if (!isUnlocked(studentId, t.id)) continue;
    const ta = topicAge(t);
    if (ta > age + 1) continue; // don't jump too far ahead
    const ageGap = Math.abs(ta - age);
    // prioritise things already started, then age fit, then centrality
    const startedBonus = st === 'practicing' ? 3 : st === 'learning' ? 2 : 0;
    const score = startedBonus * 2 - ageGap + (t.centrality || 0) * 2;
    candidates.push({ topic: t, score, status: st });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}

// Today's literacy and numeracy pick-one options for a student, as topics.
// Offers are chosen once per day and remembered; picks come from the store.
// `blocked` (locked topics with their first unmet prerequisite) is worked out
// fresh each time, since it changes as soon as a prerequisite is mastered.
// Returns { [lane]: { lane, options, pick, blocked: [{ topic, needs }] } }.
export function todaysChoices(studentId, dateKey) {
  const d = getData();
  const s = store.get().students.find(x => x.id === studentId);
  const prog = store.progressFor(studentId);
  const lastByDomain = new Map();
  for (const [id, v] of Object.entries(prog)) {
    const t = d.byId.get(id);
    if (t && (v.updatedAt || 0) > (lastByDomain.get(t.domain) || 0)) lastByDomain.set(t.domain, v.updatedAt || 0);
  }
  const built = buildDailyChoices(d.topics, {
    age: store.studentAge(s) || 5,
    dateKey,
    now: Date.now(),
    statusOf: (id) => store.statusOf(studentId, id),
    isUnlocked: (id) => isUnlocked(studentId, id),
    lastTouched: (domain) => lastByDomain.get(domain) || 0,
    topicAge,
    blockingPrereqs: (id) => blockingPrereqs(studentId, id).map(p => d.byId.get(p.id)).filter(Boolean),
  }, 2, 4);
  const saved = store.dailyFor(studentId, dateKey);
  let offers = saved && saved.offers;
  if (!offers) {
    offers = Object.fromEntries(Object.entries(built).map(([k, lane]) => [k, lane.options.map(t => t.id)]));
    if (Object.values(offers).some(list => list.length)) store.saveDailyOffers(studentId, dateKey, offers);
  }
  const picks = (store.dailyFor(studentId, dateKey) || {}).picks || {};
  const out = {};
  for (const [key, lane] of Object.entries(LANES)) {
    out[key] = {
      lane,
      options: (offers[key] || []).map(id => d.byId.get(id)).filter(Boolean),
      pick: picks[key] || null,
      // A saved offer can lock again (a prerequisite set back to learning); it
      // stays offered today, so it is never also listed as "Not yet".
      blocked: (built[key] ? built[key].blocked : []).filter(b => !(offers[key] || []).includes(b.topic.id)).slice(0, 2),
    };
  }
  return out;
}

// Topics recently updated (for activity feed).
export function recentActivity(studentId, limit = 8) {
  const d = getData();
  const prog = store.progressFor(studentId);
  return Object.entries(prog)
    .filter(([id, v]) => d.byId.has(id) && v.source !== 'placement')
    .map(([id, v]) => ({ topic: d.byId.get(id), status: v.status, updatedAt: v.updatedAt }))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, limit);
}

// ---- Sections (a teachable unit = subject + domain within one age band) ----
function sectionId(subject, domain, age) { return `${subject}|${domain}|${age}`; }

// Ordered sections for a subject: grouped by (domain, age band), ordered by age
// then by the domain's centrality — the order a learner should move through them.
export function subjectSections(subject) {
  const d = getData();
  const byAge = subjectByAge(subject); // age -> ordered topics
  const sections = [];
  Object.keys(byAge).map(Number).sort((a, b) => a - b).forEach(age => {
    const groups = new Map(); // domain -> topics (keeps first-seen order)
    byAge[age].forEach(t => {
      if (!groups.has(t.domain)) groups.set(t.domain, []);
      groups.get(t.domain).push(t);
    });
    for (const [domain, topics] of groups) {
      sections.push({
        id: sectionId(subject, domain, age),
        subject, domain, age, topics,
        summary: d.clusterMap.get(`${subject}|${domain}|${age}`) || '',
      });
    }
  });
  return sections;
}

// The section (domain + age unit) a given topic belongs to.
export function sectionForTopic(topic) {
  const age = topicAge(topic);
  const sections = subjectSections(topic.subject);
  return sections.find(s => s.domain === topic.domain && s.age === age) || null;
}

// Mastery stats over an arbitrary list of topics.
export function topicsMasteryStats(studentId, topics) {
  let mastered = 0;
  topics.forEach(t => { if (store.statusOf(studentId, t.id) === 'mastered') mastered++; });
  return { mastered, total: topics.length, pct: topics.length ? Math.round((mastered / topics.length) * 100) : 0 };
}

// ---- The mastery ladder: topic test -> section test -> subject test ----

// The section TEST is available once every topic in the section is mastered
// (i.e. every topic test passed).
export function sectionTestReady(studentId, section) {
  return section.topics.length > 0 && section.topics.every(t => store.statusOf(studentId, t.id) === 'mastered');
}

// The subject (final) TEST is available once every section has been passed.
export function subjectTestReady(studentId, subject) {
  const sections = subjectSections(subject);
  return sections.length > 0 && sections.every(s => store.sectionPassed(studentId, s.id));
}

export { MASTERY };
