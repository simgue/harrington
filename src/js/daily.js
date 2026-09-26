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
 * }
 *
 * Preference: work already started, then domains that have gone quiet, then
 * age fit and centrality. The second option comes from a different domain
 * when one is available, so the choice is a real choice.
 */
export function laneOptions(topics, lane, ctx, count = 2) {
  const inLane = (t) => t.subject === lane.subject && lane.domains.includes(t.domain);
  let pool = topics.filter(inLane);
  // Taxonomies without the focus domains fall back to the whole subject.
  if (!pool.length) pool = topics.filter((t) => t.subject === lane.subject);

  const scored = [];
  for (const t of pool) {
    const status = ctx.statusOf(t.id);
    if (status === 'mastered' || !ctx.isUnlocked(t.id)) continue;
    const age = ctx.topicAge(t);
    if (age > ctx.age + 1) continue;
    const started = status === 'practicing' ? 4 : status === 'learning' ? 3 : 0;
    const touched = ctx.lastTouched(t.domain);
    const quietDays = touched ? Math.min(14, (ctx.now - touched) / DAY_MS) : 7;
    const score = started * 2 + quietDays / 3.5 - Math.abs(age - ctx.age) + (t.centrality || 0) * 2;
    scored.push({ topic: t, score, tie: hash(`${ctx.dateKey}|${t.id}`) });
  }
  scored.sort((a, b) => (b.score - a.score) || (a.tie - b.tie));

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
  return picked;
}

// Both lanes at once: { literacy: [topic, …], numeracy: [topic, …] }.
export function buildDailyChoices(topics, ctx, count = 2) {
  const out = {};
  for (const [key, lane] of Object.entries(LANES)) out[key] = laneOptions(topics, lane, ctx, count);
  return out;
}
