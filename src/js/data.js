// Loads the Marble Skill Taxonomy and builds the learning graph.
// Data source: https://github.com/withmarbleapp/os-taxonomy (ODbL 1.0 / CC BY-SA 4.0)

const TAXONOMY_API = '/api/taxonomy';

export const SUBJECTS = {
  'Mathematics':                  { color: '#3f6b3b', icon: 'calculator' },
  'English':                      { color: '#a4473a', icon: 'book-open' },
  'Science':                      { color: '#2f6285', icon: 'flask-conical' },
  'History':                      { color: '#8a6412', icon: 'landmark' },
  'Personal & Social Development':{ color: '#5b4a86', icon: 'heart-handshake' },
  'Life Skills':                  { color: '#6b6a2a', icon: 'sprout' },
  'Computing':                    { color: '#3e7470', icon: 'cpu' },
  'Learning to Learn':            { color: '#9a4a6e', icon: 'brain' },
  'Geography':                    { color: '#9a5221', icon: 'earth' },
};

// A subject a future taxonomy revision adds before Harrington knows it: shown
// in a neutral colour and icon, never dropped. One warning per subject.
const UNKNOWN_SUBJECT = Object.freeze({ color: '#6f665a', icon: 'shapes' });
const warnedSubjects = new Set();

export function subjectMeta(subject) {
  if (Object.hasOwn(SUBJECTS, subject)) return SUBJECTS[subject];
  if (!warnedSubjects.has(subject)) {
    warnedSubjects.add(subject);
    console.warn(`Harrington has no colour or icon for the subject "${subject}"; showing it in neutral grey.`);
  }
  return UNKNOWN_SUBJECT;
}

// Every subject that has topics: the known ones in SUBJECTS order, then any
// new ones alphabetically. `bySubject` maps a subject to its topics.
export function orderedSubjects(bySubject) {
  const present = Object.keys(bySubject || {}).filter((s) => bySubject[s]?.length);
  const known = Object.keys(SUBJECTS).filter((s) => present.includes(s));
  return [...known, ...present.filter((s) => !Object.hasOwn(SUBJECTS, s)).sort()];
}

// The subjects of the loaded taxonomy, in display order.
export function subjectNames() {
  return orderedSubjects(getData().bySubject);
}

export const AGES = [5, 6, 7, 8, 9, 10, 11, 12, 13];

let _cache = null;

export async function loadTaxonomy() {
  if (_cache) return _cache;
  const [topicsRes, depsRes, clustersRes, manifestRes] = await Promise.all([
    fetch(`${TAXONOMY_API}/topics.json`),
    fetch(`${TAXONOMY_API}/dependencies.json`),
    fetch(`${TAXONOMY_API}/clusters.json`),
    fetch(`${TAXONOMY_API}/manifest.json`).catch(() => null),
  ]);
  if (!topicsRes.ok || !depsRes.ok) {
    // The server says why (an upstream that is down, a file that failed its
    // integrity check); pass that on.
    const failed = topicsRes.ok ? depsRes : topicsRes;
    const why = await failed.json().then((b) => b?.error).catch(() => null);
    throw new Error(why ? `Could not load the curriculum data. ${why}` : 'Could not load the curriculum data.');
  }
  const topicsJson = await topicsRes.json();
  const depsJson = await depsRes.json();
  const clustersJson = clustersRes.ok ? await clustersRes.json() : { clusters: [] };
  const manifest = (manifestRes && manifestRes.ok) ? await manifestRes.json() : null;

  const topics = topicsJson.topics || topicsJson;
  const dependencies = depsJson.dependencies || depsJson;
  const clusters = clustersJson.clusters || [];

  const byId = new Map(topics.map(t => [t.id, t]));

  // Prerequisite edges: topicId depends on prerequisiteId
  const prereqsOf = new Map();   // topic -> [{id, strength, reason}]
  const unlocksOf = new Map();   // topic -> [{id, strength, reason}]
  for (const t of topics) { prereqsOf.set(t.id, []); unlocksOf.set(t.id, []); }
  for (const d of dependencies) {
    if (!byId.has(d.topicId) || !byId.has(d.prerequisiteId)) continue;
    prereqsOf.get(d.topicId).push({ id: d.prerequisiteId, strength: d.strength, reason: d.reason });
    unlocksOf.get(d.prerequisiteId).push({ id: d.topicId, strength: d.strength, reason: d.reason });
  }

  // Domain summaries lookup: subject|domain|ageStart -> summary
  const clusterMap = new Map();
  for (const c of clusters) {
    clusterMap.set(`${c.subject}|${c.domain}|${c.ageRangeStart}`, c.summary);
  }

  // Group topics by subject
  const bySubject = {};
  for (const t of topics) {
    (bySubject[t.subject] = bySubject[t.subject] || []).push(t);
  }

  _cache = {
    topics, dependencies, clusters,
    byId, prereqsOf, unlocksOf, clusterMap, bySubject,
    manifest,
    meta: {
      topics: topics.length,
      dependencies: dependencies.length,
      version: manifest?.taxonomyVersion || 'v1',
      generatedAt: manifest?.generatedAt || null,
    },
  };
  return _cache;
}

// False for an id the loaded taxonomy no longer has: a retired topic, whose
// family data is kept but left out of counts and choices (docs/CURRICULUM.md).
// Before the taxonomy loads every id counts as current.
export function isCurrentTopic(id) {
  return !_cache || _cache.byId.has(id);
}

export function getData() {
  if (!_cache) throw new Error('Taxonomy not loaded');
  return _cache;
}

// Clamp a topic's start age into the 5-13 window used by the app.
export function topicAge(t) {
  return Math.min(13, Math.max(5, t.ageRangeStart || 5));
}

// Order topics within a subject by age then centrality (a sensible learning order).
export function orderTopics(list) {
  return [...list].sort((a, b) => {
    if ((a.ageRangeStart || 5) !== (b.ageRangeStart || 5)) return (a.ageRangeStart || 5) - (b.ageRangeStart || 5);
    if ((b.centrality || 0) !== (a.centrality || 0)) return (b.centrality || 0) - (a.centrality || 0);
    return a.name.localeCompare(b.name);
  });
}

export function hardPrereqs(topicId) {
  const d = getData();
  return (d.prereqsOf.get(topicId) || []).filter(p => p.strength === 'hard');
}

