// Placement: mark earlier topics as already mastered so a new learner starts
// where they actually are, not from zero. This module is pure so it can be
// tested without the store; views/placement.js wires it to the family's data.

const clampAge = (a) => Math.min(13, Math.max(5, a || 5));

// The default "up to age N" for a learner: one year below their age.
export function defaultMaxAge(age) {
  return clampAge((age || 6) - 1);
}

// Domains of one subject, in first-seen order.
export function subjectDomains(topics, subject) {
  const out = [];
  for (const t of topics) if (t.subject === subject && !out.includes(t.domain)) out.push(t.domain);
  return out;
}

/**
 * Which topics a placement would mark mastered.
 *
 * opts: {
 *   subject,            // required
 *   domain,             // optional: one domain within the subject
 *   maxAge,             // include topics whose topicAge() <= maxAge
 *   progress,           // { topicId: { status } } for the learner
 *   hardPrereqs(id),    // [{ id }] hard prerequisite edges of a topic
 *   topicAge(topic),    // start age clamped to the app's range
 * }
 *
 * Returns {
 *   ids,         // selected topics not yet mastered
 *   prereqIds,   // unmastered hard prerequisites outside `ids` (transitive closure)
 *   count, prereqCount,
 *   safeIds,     // the part of `ids` that can be marked without the prerequisites:
 *                // no unmastered hard prerequisite remains outside this set
 * }
 */
export function selectPlacement(topics, { subject, domain = null, maxAge, progress = {}, hardPrereqs = () => [], topicAge = (t) => clampAge(t.ageRangeStart) } = {}) {
  const mastered = (id) => (progress[id] && progress[id].status) === 'mastered';
  const ids = topics
    .filter(t => t.subject === subject && (!domain || t.domain === domain) && topicAge(t) <= maxAge && !mastered(t.id))
    .map(t => t.id);
  const selected = new Set(ids);

  // Walk hard prerequisites from the selection; stop at mastered topics.
  const prereqIds = [];
  const seen = new Set(ids);
  const stack = [...ids];
  while (stack.length) {
    const id = stack.pop();
    for (const p of hardPrereqs(id) || []) {
      if (seen.has(p.id) || mastered(p.id)) continue;
      seen.add(p.id);
      prereqIds.push(p.id);
      stack.push(p.id);
    }
  }

  // Without the prerequisites, drop any topic that still depends on an
  // unmastered topic outside the set, until nothing changes.
  const safe = new Set(selected);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of safe) {
      if ((hardPrereqs(id) || []).some(p => !mastered(p.id) && !safe.has(p.id))) {
        safe.delete(id);
        changed = true;
      }
    }
  }

  return {
    ids,
    prereqIds,
    count: ids.length,
    prereqCount: prereqIds.length,
    safeIds: ids.filter(id => safe.has(id)),
  };
}

// The record title for a placement.
export function placementTitle({ count, subject, domain = null, maxAge }) {
  const where = domain ? `${subject} · ${domain}` : subject;
  return `Placement: marked ${count} topic${count === 1 ? '' : 's'} in ${where} mastered up to age ${maxAge}`;
}
