// Adaptivity engine: turns strong performance into proposed changes the parent
// can approve. The child's results (challenges + fast, high mastery scores)
// drive whether future work in a domain gets pitched harder.
import * as store from './store.js';
import { getData } from './data.js';

// Called after a challenge is recorded. If the child aced it (and quickly),
// propose bumping that domain to "advanced" so future tests/lessons stretch them.
export function evaluateChallenge(studentId, challenge) {
  const { subject, domain } = challenge;
  const pct = challenge.total ? Math.round((challenge.correct / challenge.total) * 100) : 0;
  const perQ = challenge.total ? challenge.seconds / challenge.total : 99;
  const alreadyAdvanced = store.adaptationLevel(studentId, subject, domain) === 'advanced';

  // Strong = 80%+ correct on the harder challenge, at a decent pace.
  const strong = pct >= 80 && perQ <= 25;

  if (strong && !alreadyAdvanced) {
    const created = store.addSuggestion(studentId, {
      kind: 'raise-difficulty',
      subject, domain,
      reason: `Aced the ${domain} challenge (${pct}%${perQ <= 15 ? ', and fast' : ''}). Future ${domain} work can be pitched harder to keep them challenged.`,
    });
    return !!created;
  }
  return false;
}

// A short, human hint about the "next" concept, used to flavor challenges.
export function nextConceptHint(topic) {
  const d = getData();
  const unlocks = (d.unlocksOf.get(topic.id) || [])
    .map(u => d.byId.get(u.id)).filter(Boolean)
    .filter(t => t.subject === topic.subject);
  return unlocks[0] ? unlocks[0].name : '';
}

// Apply an approved suggestion.
export function applySuggestion(studentId, sug) {
  if (sug.kind === 'raise-difficulty') {
    store.setAdaptation(studentId, sug.subject, sug.domain, 'advanced');
  }
  store.resolveSuggestion(studentId, sug.id, 'approved');
}

export function dismissSuggestion(studentId, sug) {
  store.resolveSuggestion(studentId, sug.id, 'dismissed');
}
