// The AI capabilities a Harrington server can switch on, one per kind of
// prompt. Shared by server.mjs (which enforces HARRINGTON_AI_CAPABILITIES on
// /api/ai), the browser (which gates controls) and scripts/ai-experiment.mjs.
export const AI_CAPABILITIES = Object.freeze([
  'lesson', 'printables', 'activity', 'test', 'challenge',
  'recall', 'analysis', 'review', 'explain', 'quiz',
]);

// Plural spellings a family is likely to type ("lessons").
const ALIASES = {
  lessons: 'lesson',
  printable: 'printables',
  activities: 'activity',
  tests: 'test',
  challenges: 'challenge',
  analyses: 'analysis',
  reviews: 'review',
  quizzes: 'quiz',
};

// Parses a comma list such as "lessons" or "lesson, recall". Unset or blank
// (or "all") switches on every capability; unknown names are reported back
// and never switch anything on.
export function parseCapabilities(raw) {
  const text = String(raw ?? '').trim();
  if (!text || text.toLowerCase() === 'all') return { enabled: [...AI_CAPABILITIES], unknown: [] };
  const enabled = new Set();
  const unknown = [];
  for (const part of text.split(',')) {
    const name = part.trim().toLowerCase();
    if (!name) continue;
    const capability = ALIASES[name] || name;
    if (AI_CAPABILITIES.includes(capability)) enabled.add(capability);
    else unknown.push(part.trim());
  }
  return { enabled: AI_CAPABILITIES.filter(c => enabled.has(c)), unknown };
}

// The server's 403 text; the browser matches "not switched on" in it.
export function capabilityOffMessage(capability) {
  return `The "${capability}" AI capability is not switched on for this Harrington server`;
}
