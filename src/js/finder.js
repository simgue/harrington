// Topic finder: a free-text request ("I want to learn how to tell the time")
// matched against the taxonomy already loaded in the browser, and the path of
// unmet prerequisites from where a learner is now to the chosen topic.
// Pure functions, no AI and no store access, so tests can drive them with a
// fixture taxonomy. Skill states come from graph.js (resolveSkillNodeState,
// blockingHardPrereqIds), the same rules mastery.js and the skill tree use.

import { blockingHardPrereqIds, resolveSkillNodeState } from './graph.js';

// Words a request is phrased with that say nothing about the topic. Checked
// before and after stemming, so "lessons" and "basics" count too.
const STOPWORDS = new Set(`a about all an and any are as at be been better but by can could do does doing
for from get go good have he help her him his how i if in into is it its just know learn learning
like lot me more my need of on or our out please practice really she so some start started teach that
the their them then there they this to understand up us using want wants was way we well what when
where which who why will with would you your
basic beginner class course kid lesson skill topic
year old son daughter child boy girl`.split(/\s+/));

// Plurals and spellings the suffix rules below get wrong.
const IRREGULAR = {
  halves: 'half', children: 'child', people: 'person', mice: 'mouse', leaves: 'leaf',
  wolves: 'wolf', feet: 'foot', teeth: 'tooth', women: 'woman', men: 'man', geese: 'goose',
  colours: 'color', colour: 'color', maths: 'math', mathematics: 'math',
  // "times tables" is multiplication, not the clock.
  times: 'times',
};

// A crude stemmer, applied the same way to requests and to topic text, so
// "telling" meets "tell" and "fractions" meets "fraction".
export function stem(word) {
  let w = String(word || '').toLowerCase();
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (/(ss|us|is)$/.test(w)) return w;
  if (/(ches|shes|xes|zes|sses)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('oes') && w.length > 5) return w.slice(0, -2); // volcanoes, tomatoes
  if (w.endsWith('s')) w = w.slice(0, -1);
  else if (w.endsWith('ing') && w.length > 5) w = undouble(w.slice(0, -3));
  else if (w.endsWith('ed') && w.length > 4) w = undouble(w.slice(0, -2));
  return w;
}

// "running" -> "run", but "telling" stays "tell" and "adding" stays "add".
function undouble(w) {
  const last = w.at(-1);
  if (w.length > 2 && last === w.at(-2) && !'lsdz'.includes(last)) return w.slice(0, -1);
  return w;
}

// Words that mean the same thing for this search, in stemmed form. Each group
// is symmetric: a request for any word also looks for the others, at a lower
// weight than the word itself.
const SYNONYM_GROUPS = [
  ['time', 'clock', "o'clock", 'hour', 'minute'],
  ['fraction', 'half', 'quarter', 'third', 'numerator', 'denominator'],
  ['multiply', 'multiplication', 'times', 'product'],
  ['divide', 'division', 'share', 'sharing'],
  ['add', 'addition', 'plus', 'sum'],
  ['subtract', 'subtraction', 'minus'],
  ['money', 'coin', 'price', 'spend', 'saving'],
  ['read', 'reader', 'phonic', 'book'],
  ['write', 'writing', 'handwriting', 'pencil'],
  ['spell', 'spelling'],
  ['count', 'counting'],
  ['shape', 'triangle', 'square', 'circle', 'polygon'],
  ['measure', 'length', 'weight', 'mass', 'capacity', 'ruler'],
  ['volcano', 'eruption', 'lava', 'magma'],
  ['dinosaur', 'fossil'],
  ['space', 'planet', 'solar', 'moon', 'star'],
  ['weather', 'rain', 'cloud', 'season'],
  ['plant', 'seed', 'flower'],
  ['animal', 'habitat', 'mammal'],
  ['body', 'skeleton', 'muscle', 'organ'],
  ['code', 'coding', 'program', 'programming', 'algorithm'],
  ['computer', 'computing', 'device'],
  ['feeling', 'emotion'],
  ['friend', 'friendship'],
  ['calendar', 'week', 'month', 'date'],
  ['cook', 'cooking', 'food', 'recipe'],
];

const SYNONYMS = (() => {
  const map = new Map();
  for (const group of SYNONYM_GROUPS) {
    const stems = [...new Set(group.map(stem))];
    for (const s of stems) {
      const others = map.get(s) || new Set();
      for (const o of stems) if (o !== s) others.add(o);
      map.set(s, others);
    }
  }
  return map;
})();

export function synonymsOf(term) {
  return [...(SYNONYMS.get(stem(term)) || [])];
}

// Lowercased words without accents; "o'clock" keeps its apostrophe.
function words(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .match(/[a-z0-9]+(?:'[a-z]+)?/g) || [];
}

// In a "how does X work" request these words are phrasing, not the topic.
const HOW_PHRASING = new Set(['work', 'happen', 'made', 'make']);

// The stems a request asks for, in order, without request phrasing, one-letter
// words or repeats.
export function queryTerms(text) {
  const seen = new Set();
  const out = [];
  const all = words(text);
  const asksHow = all.includes('how');
  for (const raw of all) {
    const w = raw.replace(/'s$/, '');
    if (w.length < 2 || STOPWORDS.has(w)) continue;
    const s = stem(w);
    if (!s || seen.has(s) || STOPWORDS.has(s) || (asksHow && HOW_PHRASING.has(s))) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function stemSet(text) {
  return new Set(words(text).map((w) => stem(w.replace(/'s$/, ''))));
}

// Field weights: a word in the name counts most, then the domain, then the
// description, then the evidence lines.
const FIELDS = [
  ['name', 6],
  ['domain', 2.5],
  ['description', 2],
  ['evidence', 0.75],
];
const SYNONYM_WEIGHT = 0.5;
const PREFIX_WEIGHT = 0.6;
// A second field matching the same word adds this share of its weight, so a
// word in the name and the domain beats the name alone.
const SECOND_FIELD_SHARE = 0.25;
// A topic needs at least this much relevance to be listed, and a match in its
// name, domain or description: words found only in the evidence lines are not
// a close match.
export const MIN_SCORE = 1.5;

const indexCache = new WeakMap();

// Per-topic stem sets, built once per taxonomy object, and how many topics
// carry each stem in their name, domain or description (for rarity weights).
export function buildSearchIndex(topics) {
  const key = topics;
  if (indexCache.has(key)) return indexCache.get(key);
  const entries = topics.map((topic) => ({
    topic,
    nameText: words(topic.name).join(' '),
    fields: {
      name: stemSet(topic.name),
      domain: stemSet(topic.domain),
      description: stemSet(topic.description),
      evidence: stemSet((topic.evidence || []).join(' ')),
    },
  }));
  const df = new Map();
  for (const { fields } of entries) {
    for (const s of new Set([...fields.name, ...fields.domain, ...fields.description])) df.set(s, (df.get(s) || 0) + 1);
  }
  const index = { entries, df, size: entries.length };
  indexCache.set(key, index);
  return index;
}

// Rarer words say more about what was asked: a word in three topics outweighs
// one in sixty. Inverse document frequency, never zero.
function rarity(index, term) {
  return Math.log(1 + index.size / ((index.df.get(term) || 0) + 1));
}

// Prefix matches only for stems of five letters or more ("multipl" is not
// needed: "multiplying" and "multiply" share a stem), to keep "add" from
// matching "address".
function prefixMatch(term, set) {
  if (term.length < 5) return false;
  for (const s of set) {
    if (s.length >= 5 && (s.startsWith(term) || term.startsWith(s))) return true;
  }
  return false;
}

// How strongly one stem matches one field: 1 for the word itself, less for a
// shared prefix or a synonym, 0 for nothing.
function termStrength(term, set) {
  if (set.has(term)) return 1;
  let best = prefixMatch(term, set) ? PREFIX_WEIGHT : 0;
  for (const syn of SYNONYMS.get(term) || []) {
    if (set.has(syn)) { best = Math.max(best, SYNONYM_WEIGHT); break; }
  }
  return best;
}

// Relevance of one topic to the request, before the age boost. Each word
// counts by its rarity, scaled so the request's words average 1: a one-word
// request scores as before, and in "volcanoes work" the rare word leads.
function relevance(entry, terms, weights) {
  let total = 0;
  let matched = 0;
  let core = false;
  for (let i = 0; i < terms.length; i++) {
    const scores = [];
    for (const [field, weight] of FIELDS) {
      const strength = termStrength(terms[i], entry.fields[field]);
      if (strength && field !== 'evidence') core = true;
      scores.push(weight * strength);
    }
    scores.sort((a, b) => b - a);
    const best = scores[0] + SECOND_FIELD_SHARE * scores[1];
    if (best > 0) matched += weights[i];
    total += best * weights[i];
  }
  if (!matched || !core) return 0;
  // Topics that answer every word of the request beat ones that answer one.
  const coverage = matched / terms.length;
  let score = total * (0.4 + 0.6 * coverage);
  // The whole request as a phrase inside the name ("times tables").
  if (terms.length > 1 && entry.nameText.includes(terms.join(' '))) score += 3;
  return score;
}

// A soft nudge toward the learner's age, never a filter: in band the score
// goes up a fifth; out of band it drops by a twentieth a year, to at most a
// quarter off.
export function ageFactor(topic, age) {
  if (age == null || !Number.isFinite(Number(age))) return 1;
  const start = topic.ageRangeStart ?? 5;
  const end = topic.ageRangeEnd ?? start;
  if (age >= start && age <= end) return 1.2;
  const gap = age < start ? start - age : age - end;
  return Math.max(0.75, 1 - 0.05 * gap);
}

// Ranked matches for a request. Returns { terms, results: [{ topic, score,
// relevance, inBand, boost }] }; an empty or all-stopword request has no terms and no
// results. `limit` caps the list after ranking. `boost(topic)` is the
// learner's Australian Curriculum boost (0 to 2, curriculum.js): like the age,
// a nudge of a sixth per point, never a filter.
export function searchTopics(topics, text, { age = null, limit = 8, boost = () => 0 } = {}) {
  const terms = queryTerms(text);
  if (!terms.length) return { terms, results: [] };
  const index = buildSearchIndex(topics);
  const raw = terms.map((term) => rarity(index, term));
  const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
  const weights = raw.map((w) => w / mean);
  const results = [];
  for (const entry of index.entries) {
    const rel = relevance(entry, terms, weights);
    if (rel < MIN_SCORE) continue;
    const factor = ageFactor(entry.topic, age);
    const lift = boost(entry.topic);
    results.push({ topic: entry.topic, relevance: rel, score: rel * factor * (1 + lift / 6), inBand: factor > 1, boost: lift });
  }
  results.sort((a, b) => b.score - a.score
    || (b.topic.centrality || 0) - (a.topic.centrality || 0)
    || (a.topic.ageRangeStart || 0) - (b.topic.ageRangeStart || 0)
    || a.topic.name.localeCompare(b.topic.name));
  return { terms, results: limit ? results.slice(0, limit) : results };
}

// ---- Path to a topic ----

// The unmet required prerequisites of `targetId` for a learner, as an ordered
// path ending at the target. `progress` is { topicId: status }.
// Returns {
//   target, steps: [{ topic, state, blockers, depth }], startsFrom: [topic],
//   remaining, next
// }: steps run foundations first; startsFrom are the mastered foundations the
// path builds on; remaining counts the steps not yet mastered; next is the
// first step that is unlocked and not mastered (null when the target is
// already mastered). Soft (helpful) prerequisites are not part of the path.
export function buildTopicPath(targetId, { byId, prereqsOf, progress = {} }) {
  const target = byId.get(targetId);
  if (!target) return null;
  const stateOf = (id) => resolveSkillNodeState(id, progress, prereqsOf);
  const hardOf = (id) => (prereqsOf.get(id) || []).filter((edge) => edge.strength === 'hard' && byId.has(edge.id));

  const inPath = new Set();
  const startsFrom = new Map();
  const visit = (id, trail) => {
    if (inPath.has(id) || trail.has(id)) return; // shared foundation, or a cycle in bad data
    inPath.add(id);
    if (stateOf(id) === 'mastered') return;
    trail.add(id);
    for (const edge of hardOf(id)) {
      if (stateOf(edge.id) === 'mastered') startsFrom.set(edge.id, byId.get(edge.id));
      else visit(edge.id, trail);
    }
    trail.delete(id);
  };
  visit(targetId, new Set());

  // Depth = longest chain of unmet foundations below a step, so every step
  // comes after the steps it needs.
  const depth = new Map();
  const depthOf = (id, trail = new Set()) => {
    if (depth.has(id)) return depth.get(id);
    if (trail.has(id)) return 0;
    trail.add(id);
    const below = hardOf(id).filter((edge) => inPath.has(edge.id) && stateOf(edge.id) !== 'mastered');
    const d = below.length ? 1 + Math.max(...below.map((edge) => depthOf(edge.id, trail))) : 0;
    trail.delete(id);
    depth.set(id, d);
    return d;
  };

  const ORDER = { 'in-progress': 0, ready: 1, locked: 2, mastered: 3 };
  const steps = [...inPath]
    .filter((id) => id === targetId || stateOf(id) !== 'mastered')
    .map((id) => ({
      topic: byId.get(id),
      state: stateOf(id),
      blockers: blockingHardPrereqIds(id, progress, prereqsOf).filter((b) => byId.has(b)),
      depth: depthOf(id),
    }))
    .sort((a, b) => {
      if (a.topic.id === targetId) return 1;
      if (b.topic.id === targetId) return -1;
      return a.depth - b.depth
        || ORDER[a.state] - ORDER[b.state]
        || (a.topic.ageRangeStart || 0) - (b.topic.ageRangeStart || 0)
        || (b.topic.centrality || 0) - (a.topic.centrality || 0)
        || a.topic.name.localeCompare(b.topic.name);
    });

  const remaining = steps.filter((step) => step.state !== 'mastered').length;
  const next = steps.find((step) => step.state !== 'mastered' && step.blockers.length === 0) || null;
  return { target, steps, startsFrom: [...startsFrom.values()], remaining, next };
}

// ---- Route ----
// A request typed into the address bar is capped like a logged one
// (store.REQUEST_TEXT_LEN), so a huge #find?q= cannot slow every render.
export const MAX_QUERY_LEN = 200;
// #find?q=<request>&r=<request id>&topic=<topic id>. The request and the
// chosen topic ride in the hash so reload and Back keep them; the log entry
// itself lives in family state.
export function findHash(params = {}) {
  const query = [];
  for (const key of ['q', 'r', 'topic']) {
    if (params[key]) query.push(`${key}=${encodeURIComponent(params[key])}`);
  }
  return query.length ? `find?${query.join('&')}` : 'find';
}

// Inverse of findHash: takes the hash without its leading '#'. Returns null
// when the hash is not the finder.
export function parseFindHash(hash = '') {
  const raw = String(hash).replace(/^#/, '');
  const q = raw.indexOf('?');
  const path = q === -1 ? raw : raw.slice(0, q);
  if (path !== 'find') return null;
  const params = {};
  for (const pair of (q === -1 ? '' : raw.slice(q + 1)).split('&')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const key = pair.slice(0, eq);
    let value = pair.slice(eq + 1);
    try { value = decodeURIComponent(value.replace(/\+/g, ' ')); } catch { /* keep it raw */ }
    if (key === 'q') value = value.slice(0, MAX_QUERY_LEN);
    if (['q', 'r', 'topic'].includes(key) && value) params[key] = value;
  }
  return params;
}
