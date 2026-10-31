// The Australian Curriculum (version 9, Foundation to Year 6) in Harrington:
// year levels, the trimmed list of content descriptions the server derives
// from the taxonomy's curriculum-standards.json, the soft year-level boost,
// and the coverage statuses of the Records report. Pure and dependency-free,
// so the server (which trims the file) and the unit tests import it as is.
//
// Marble's links from topics to content descriptions are a map, not a
// certificate: the app says a topic is "linked to" a code, never that it
// satisfies one, and coverage is described by the family's own evidence.

export const CURRICULUM_ID = 'acara-v9';
export const CODE_PREFIX = `${CURRICULUM_ID}:`;
export const CURRICULUM_NAME = 'Australian Curriculum';
// Year levels in order. Foundation is the first year of school.
export const YEARS = ['F', '1', '2', '3', '4', '5', '6'];

// Required with any Australian Curriculum text Harrington shows (CC BY 4.0),
// quoted verbatim.
export const ACARA_NOTICE = '© Australian Curriculum, Assessment and Reporting Authority (ACARA) 2009 to present, unless otherwise indicated. This material was downloaded from the ACARA website (https://www.australiancurriculum.edu.au/) (accessed 20 October 2026) and was modified only to normalize whitespace and render equation fractions as text. The material is licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). ACARA does not endorse any product that uses ACARA material or make any representations as to the quality of such products. Any product that uses material published on this website should not be taken to be affiliated with ACARA or have the sponsorship or approval of ACARA. It is up to each person to make their own assessment of the product.';
export const ALIGNMENT_CREDIT = 'alignment by the Marble Skill Taxonomy';

// 'F' or '1' to '6' for anything that names a year level ('Foundation',
// 'Year 2', 'y3', 2, 'prep'), else null. Foundation is also called Prep,
// Kindergarten or Reception in some states; 0 means Foundation.
export function normalizeYear(value) {
  if (value === null || value === undefined) return null;
  let text = String(value).trim().toLowerCase();
  if (!text) return null;
  if (['f', 'foundation', 'foundation year', 'prep', 'k', 'kindergarten', 'reception', '0'].includes(text)) return 'F';
  text = text.replace(/^(year|yr|y)\s*/, '');
  return /^[1-6]$/.test(text) ? text : null;
}

export const yearLabel = year => {
  const y = normalizeYear(year);
  return y === 'F' ? 'Foundation' : y ? `Year ${y}` : '';
};
const yearIndex = year => YEARS.indexOf(normalizeYear(year));

// The usual age at the start of a year level in Australia: Foundation 5,
// Year 1 6 … Year 6 11. Only a default; the parent can pick any year.
export function yearForAge(age) {
  if (!Number.isFinite(age)) return null;
  return YEARS[Math.min(YEARS.length - 1, Math.max(0, Math.floor(age) - 5))];
}
export function ageForYear(year) {
  const i = yearIndex(year);
  return i < 0 ? null : i + 5;
}

// The age the map and placement start from: the usual age of the learner's
// Australian Curriculum year when one is set, else `age` (their own).
export function curriculumAge(student, age) {
  return ageForYear(learnerYear(student)) ?? age;
}

// The learner's Australian Curriculum year, or null when they follow the
// age-based order (no setting, or a curriculum this Harrington does not know).
export function learnerYear(student) {
  const c = student && student.curriculum;
  if (!c || typeof c !== 'object' || c.id !== CURRICULUM_ID) return null;
  return normalizeYear(c.year);
}

// A learner's `curriculum` field is { id: 'acara-v9', year }. Null when the
// value is fine (or absent), else what is wrong with it, for document.js. Any
// other curriculum id is refused: the learner form could not show it and its
// next save would drop it.
export function curriculumProblem(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return 'has a curriculum setting that is not in the expected shape';
  if (value.id !== CURRICULUM_ID) return `has a curriculum setting for a curriculum other than the Australian Curriculum (${CURRICULUM_ID})`;
  return typeof value.year === 'string' && YEARS.includes(value.year) ? null : 'has an Australian Curriculum year other than F or 1 to 6';
}

// ---- The trimmed standards list ----

const text = (v, max = 4_000) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

// The browser's copy of one curriculum from the taxonomy's
// curriculum-standards.json (2.7 MB): only the fields Harrington shows.
// `description` is left out when it repeats the title, which it does for
// every Australian content description today. Year levels become 'F' or
// '1' to '6'. Throws when the file has no such curriculum.
export function trimStandards(json, slug = CURRICULUM_ID) {
  const source = Array.isArray(json?.curricula) ? json.curricula.find(c => c && c.slug === slug) : null;
  if (!source || !Array.isArray(source.topics)) throw new Error(`The curriculum standards file has no ${slug} entry.`);
  const standards = [];
  for (const entry of source.topics) {
    const data = entry?.data || {};
    const code = text(entry?.code, 40);
    if (!code) continue;
    const yearLevels = [...new Set((Array.isArray(data.yearLevels) ? data.yearLevels : []).map(normalizeYear).filter(Boolean))]
      .sort((a, b) => yearIndex(a) - yearIndex(b));
    const title = text(data.title);
    const description = text(data.description);
    standards.push({
      code,
      title,
      ...(description && description !== title ? { description } : {}),
      strand: text(data.strand, 200),
      learningArea: text(data.learningArea, 200),
      subject: text(data.subject || data.subjectArea, 200),
      yearLevels,
    });
  }
  return {
    curriculum: { id: slug, name: text(source.name, 300), version: text(source.version, 300), sourceUrl: text(source.sourceUrl, 300) },
    standards,
  };
}

// Code -> standard, for the topic chips, the boost and the report.
export function indexStandards(standards) {
  return new Map((Array.isArray(standards) ? standards : []).map(s => [s.code, s]));
}

// The Australian codes a topic links to (without the 'acara-v9:' prefix).
export function topicCodes(topic) {
  const list = Array.isArray(topic?.standards) ? topic.standards : [];
  return list.filter(s => typeof s === 'string' && s.startsWith(CODE_PREFIX)).map(s => s.slice(CODE_PREFIX.length));
}

// The linked standards of a topic that the index knows, in year then code order.
export function topicStandards(topic, index) {
  if (!index) return [];
  return topicCodes(topic).map(code => index.get(code)).filter(Boolean)
    .sort((a, b) => yearIndex(a.yearLevels[0]) - yearIndex(b.yearLevels[0]) || a.code.localeCompare(b.code));
}

// "Year 2", "Year 1/Year 2" or "Foundation".
export function yearsLabel(yearLevels) {
  return (yearLevels || []).map(yearLabel).filter(Boolean).join('/');
}

// ---- Year-level ordering (a soft boost, never a filter) ----

// How strongly a topic is pulled forward for a learner at `year`:
// 2 when it links to a content description at that year; 1 when it links to
// one at the year below and is not mastered yet (an unmet foundation for
// this year); otherwise 0, and the age-based order decides. `mastered(id)`
// is optional.
export function curriculumBoost(topic, { year, index, mastered = () => false } = {}) {
  const at = yearIndex(year);
  if (at < 0 || !index) return 0;
  let boost = 0;
  for (const s of topicStandards(topic, index)) {
    for (const y of s.yearLevels) {
      const i = yearIndex(y);
      if (i === at) return 2;
      if (i === at - 1) boost = 1;
    }
  }
  return boost && !mastered(topic.id) ? boost : 0;
}

// `list` in the same order, except that topics with a larger boost come
// first. Nothing is removed. With no year (or no index) the list is
// returned as it was.
export function rankByCurriculum(list, ctx = {}) {
  if (yearIndex(ctx.year) < 0 || !ctx.index) return [...list];
  return list.map((topic, i) => ({ topic, i, boost: curriculumBoost(topic, ctx) }))
    .sort((a, b) => b.boost - a.boost || a.i - b.i)
    .map(x => x.topic);
}

// The boost function the scoring code (daily choices, recommendations, the
// finder) takes: always 0 without a curriculum year.
export function boosterFor(year, index, mastered) {
  if (yearIndex(year) < 0 || !index) return () => 0;
  return topic => curriculumBoost(topic, { year, index, mastered });
}

// ---- Coverage report ----

export const EVIDENCE_LABELS = { record: 'record', test: 'check passed', challenge: 'challenge passed', practice: 'practice' };

// A challenge counts as passed at this share of correct answers, the "ace"
// that views/challenge.js and game.js reward.
const CHALLENGE_PASS = 0.8;

export const COVERAGE_STATUSES = {
  mastered: { label: 'Linked topics mastered', hint: 'Every linked topic is marked mastered' },
  evidence: { label: 'Evidence', hint: 'At least one linked topic has recorded evidence' },
  'not-yet': { label: 'Not yet', hint: 'No recorded evidence for a linked topic yet' },
};

// What evidence the learner's records hold for one topic, as a list of kinds:
// 'record' (a record about the topic: a mastery observation's assessment, an
// observation, a discussion, a recording, or one claiming it as coverage),
// 'test' (a passed topic test or check), 'challenge' (a timed challenge at
// CHALLENGE_PASS or better), 'practice' (a practice question queued for the
// topic). A saved lesson is a plan, not evidence, and is not counted.
// `records`, `tests`, `challenges` and `practice` are the learner's.
export function topicEvidence(topicId, { records = [], tests = [], challenges = [], practice = {} } = {}) {
  const kinds = [];
  // A placement record (bulk-marked mastered) names no single topic, so it
  // is not evidence here; the mastered status it set counts on its own.
  const linked = r => r && (r.topicId === topicId
    || (Array.isArray(r.coverage) && r.coverage.some(c => c && c.topicId === topicId)));
  if (records.some(linked)) kinds.push('record');
  if (tests.some(t => t && t.scope === 'topic' && t.topicId === topicId && t.passed === true)) kinds.push('test');
  if (challenges.some(c => c && c.topicId === topicId && c.total > 0 && c.correct / c.total >= CHALLENGE_PASS)) kinds.push('challenge');
  if (Object.values(practice || {}).some(p => p && p.topicId === topicId)) kinds.push('practice');
  return kinds;
}

// One content description's status from its linked topics: 'mastered' when
// every linked topic is mastered, 'evidence' when at least one has recorded
// evidence (or is mastered), otherwise 'not-yet'. A description with no
// linked topic is 'not-yet'.
export function standardStatus(topicIds, { statusOf, evidenceOf }) {
  if (!topicIds.length) return 'not-yet';
  if (topicIds.every(id => statusOf(id) === 'mastered')) return 'mastered';
  if (topicIds.some(id => statusOf(id) === 'mastered' || evidenceOf(id).length > 0)) return 'evidence';
  return 'not-yet';
}

// The report for one year: learning areas in the curriculum's order, each
// with its content descriptions at that year (code order), their linked
// topics and status, and counts. `topics` is the taxonomy's topic list.
// Returns { year, areas: [{ learningArea, counts, standards: [{ standard,
// topics, status, evidence }] }], counts }.
export function coverageReport({ year, standards, topics, statusOf, evidenceOf }) {
  const y = normalizeYear(year);
  const linkedTopics = new Map();
  for (const t of topics || []) {
    for (const code of topicCodes(t)) {
      if (!linkedTopics.has(code)) linkedTopics.set(code, []);
      linkedTopics.get(code).push(t);
    }
  }
  const empty = () => ({ total: 0, mastered: 0, evidence: 0, 'not-yet': 0 });
  const areas = new Map();
  const counts = empty();
  for (const standard of standards || []) {
    if (!y || !standard.yearLevels.includes(y)) continue;
    const linked = linkedTopics.get(standard.code) || [];
    const ids = linked.map(t => t.id);
    const status = standardStatus(ids, { statusOf, evidenceOf });
    const evidence = [...new Set(ids.flatMap(id => evidenceOf(id)))];
    if (!areas.has(standard.learningArea)) areas.set(standard.learningArea, { learningArea: standard.learningArea, counts: empty(), standards: [] });
    const area = areas.get(standard.learningArea);
    area.standards.push({ standard, topics: linked, status, evidence });
    for (const c of [area.counts, counts]) { c.total += 1; c[status] += 1; }
  }
  for (const area of areas.values()) area.standards.sort((a, b) => a.standard.code.localeCompare(b.standard.code));
  return { year: y, areas: [...areas.values()], counts };
}
