// Daily pick-one choices: each home day offers a short literacy choice and a
// short numeracy choice (docs/POC-SPINE.md). This module is pure so it can be
// tested without the store; mastery.js wires it to the family's progress.

// The POC focus domains for each lane. Names match Marble taxonomy domains.
export const LANES = {
  literacy: {
    label: 'Literacy',
    kidLabel: 'Story time',
    subject: 'English',
    icon: 'book-open',
    domains: [
      'Phonics & Word Reading',
      'Handwriting & Transcription',
      'Reading Comprehension',
      'Writing Composition',
      'Speaking & Listening',
    ],
  },
  numeracy: {
    label: 'Numeracy',
    kidLabel: 'Number time',
    subject: 'Mathematics',
    icon: 'calculator',
    domains: [
      'Counting & Cardinality',
      'Number Representation & Place Value',
      'Addition & Subtraction',
      'Mathematical Thinking',
    ],
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Small stable hash so ties rotate from day to day without randomness.
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Pick up to `count` options for one lane.
 *
 * ctx: {
 *   age,                  // learner's age in years
 *   dateKey,              // 'yyyy-mm-dd' for the day being planned
 *   now,                  // ms timestamp, for "how long since" a domain was touched
 *   statusOf(topicId),    // 'none' | 'learning' | 'practicing' | 'mastered'
 *   isUnlocked(topicId),  // every hard prerequisite mastered
 *   lastTouched(domain),  // ms timestamp of the latest progress in that domain, or 0
 *   topicAge(topic),      // start age clamped to the app's range
 *   blockingPrereqs(id),  // optional: unmet hard prerequisites, as topics
 * }
 *
 * Returns { options, blocked }.
 *
 * options: preference goes to work already started, then domains that have
 * gone quiet, then age fit and centrality. The second option comes from a
 * different domain when one is available, so the choice is a real choice.
 *
 * blocked: up to two age-appropriate topics in the lane that are still locked,
 * each as { topic, needs } where `needs` is its first unmet hard prerequisite.
 * This feeds the parent-only "Not yet" line.
 */
export function laneOptions(topics, lane, ctx, count = 2, blockedCount = 2) {
  const inLane = (t) => t.subject === lane.subject && lane.domains.includes(t.domain);
  let pool = topics.filter(inLane);
  // Taxonomies without the focus domains fall back to the whole subject.
  if (!pool.length) pool = topics.filter((t) => t.subject === lane.subject);

  const scored = [];
  const locked = [];
  for (const t of pool) {
    const status = ctx.statusOf(t.id);
    if (status === 'mastered') continue;
    const age = ctx.topicAge(t);
    if (age > ctx.age + 1) continue;
    const tie = hash(`${ctx.dateKey}|${t.id}`);
    if (!ctx.isUnlocked(t.id)) {
      locked.push({ topic: t, score: (t.centrality || 0) * 2 - Math.abs(age - ctx.age), tie });
      continue;
    }
    const started = status === 'practicing' ? 4 : status === 'learning' ? 3 : 0;
    const touched = ctx.lastTouched(t.domain);
    const quietDays = touched ? Math.min(14, (ctx.now - touched) / DAY_MS) : 7;
    const score = started * 2 + quietDays / 3.5 - Math.abs(age - ctx.age) + (t.centrality || 0) * 2;
    scored.push({ topic: t, score, tie });
  }
  const byScore = (a, b) => (b.score - a.score) || (a.tie - b.tie);
  scored.sort(byScore);
  locked.sort(byScore);

  const picked = [];
  for (const entry of scored) {
    if (picked.length >= count) break;
    if (picked.some((p) => p.domain === entry.topic.domain)) continue;
    picked.push(entry.topic);
  }
  // Not enough distinct domains: fill from what's left.
  for (const entry of scored) {
    if (picked.length >= count) break;
    if (!picked.includes(entry.topic)) picked.push(entry.topic);
  }

  const blocked = [];
  if (ctx.blockingPrereqs) {
    for (const entry of locked) {
      if (blocked.length >= blockedCount) break;
      const needs = ctx.blockingPrereqs(entry.topic.id)[0];
      if (needs) blocked.push({ topic: entry.topic, needs });
    }
  }
  return { options: picked, blocked };
}

// Both lanes at once: { literacy: { options, blocked }, numeracy: { options, blocked } }.
export function buildDailyChoices(topics, ctx, count = 2) {
  const out = {};
  for (const [key, lane] of Object.entries(LANES)) out[key] = laneOptions(topics, lane, ctx, count);
  return out;
}

// ---- Evidence for a pick ----

// Stable key linking a record to one day's pick: 'yyyy-mm-dd|lane|topicId'.
export function pickKey(dateKey, lane, topicId) {
  return `${dateKey}|${lane}|${topicId}`;
}

// A record's source key may name several picks (the day's "Record what
// happened" stop covers both lanes), joined with commas.
function sourceKeys(record) {
  const key = record && record.source && record.source.key;
  return key ? String(key).split(',') : [];
}

// How much evidence links to a source key (a pick or an invitation). Only
// records that carry a coverage claim count as coverage, so a pick shows
// "Evidence recorded" only when coverageCount > 0.
export function invitationEvidenceSummary(records, key) {
  const linked = (records || []).filter((record) => sourceKeys(record).includes(key));
  const coverageCount = linked.filter((record) => Array.isArray(record.coverage) && record.coverage.length > 0).length;
  return { recordCount: linked.length, coverageCount };
}

// The `coverage` and `source` fields for a new record. A record without a
// checked claim gets no `coverage` field at all.
export function coverageFields(topics, claimed, source = null) {
  const out = {};
  const list = (topics || []).filter(Boolean);
  if (claimed && list.length) out.coverage = list.map((t) => ({ topicId: t.id, topicName: t.name }));
  if (source && source.kind && source.key) out.source = { kind: source.kind, key: source.key };
  return out;
}
