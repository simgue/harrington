// Mastery by observation: the parent watches for a topic's evidence items
// and ticks what they saw, with no AI and no quiz. The result has the same
// shape as a digital test, so the mastery ladder (topic -> section ->
// subject) treats it the same way. Pure, so it can be tested without the
// store; views/topic.js wires it to the family's data.

export const OBSERVED = 'observed';

// The test-shaped result for one checklist. `ticked` is a list of booleans,
// one per evidence item shown. A full pass needs every item ticked.
export function observedResult(topic, ticked) {
  const marks = Array.isArray(ticked) ? ticked.map(Boolean) : [];
  const total = marks.length;
  const score = marks.filter(Boolean).length;
  return {
    scope: 'topic', mode: OBSERVED,
    subject: topic.subject, topicId: topic.id, sectionId: null,
    score, total,
    pct: total ? Math.round((score / total) * 100) : 0,
    passed: total > 0 && score === total,
  };
}

/**
 * What a passed observation completes beyond the topic itself.
 *
 * A section is observed-mastered once every topic in it is mastered, so an
 * observation that masters the last open topic also passes the section; one
 * that passes the last open section also passes the subject.
 *
 * opts: {
 *   section,                // { id, subject, topics: [{ id }] } holding the topic, or null
 *   sections,               // every section of the subject
 *   mastered(topicId),      // true when mastered, counting the observed topic
 *   sectionPassed(id),      // the stored section result
 *   subjectPassed,          // true when the subject capstone is already passed
 * }
 * Returns { section: result|null, subject: result|null }.
 */
export function observedRollup({ section = null, sections = [], mastered = () => false, sectionPassed = () => false, subjectPassed = false } = {}) {
  const out = { section: null, subject: null };
  if (!section || !section.topics.length) return out;
  if (!sectionPassed(section.id)) {
    if (!section.topics.every(t => mastered(t.id))) return out;
    const n = section.topics.length;
    out.section = {
      scope: 'section', mode: OBSERVED, subject: section.subject, sectionId: section.id, topicId: null,
      score: n, total: n, pct: 100, passed: true,
    };
  }
  const passed = (s) => s.id === section.id || sectionPassed(s.id);
  if (!subjectPassed && sections.length && sections.every(passed)) {
    out.subject = {
      scope: 'subject', mode: OBSERVED, subject: section.subject, sectionId: null, topicId: null,
      score: sections.length, total: sections.length, pct: 100, passed: true,
    };
  }
  return out;
}

// The Records title for an observation.
export function observedTitle(topic, result) {
  return `Observed: ${topic.name} (${result.score} of ${result.total})`;
}

// "observed" next to a result in Records and Insights; nothing for a quiz.
export function modeLabel(result) {
  return result && result.mode === OBSERVED ? 'observed' : '';
}
