// The order a school teaches the sounds in, as data (HAR-45). A child's level
// is never stored as a stage: what is stored is their known code, the
// graphemes and tricky words they can read (plus whether they blend adjacent
// consonants), and the stage is worked out from it. So a parent who ticks a
// sound out of order, or a school that teaches in another order, changes
// nothing downstream: books and the generator key off the known code alone.
//
// Plain data and pure functions, no DOM: imported by the views, the print
// document and the Node tests alike.

// One sequence today. Another school's order is another entry with its own id
// (a parent-made sequence would be one more, saved per learner); nothing else
// assumes this one, except as the default.
export const SEQUENCES = {
  'school-2026': {
    id: 'school-2026',
    label: 'School sound order (2026)',
    stages: [
      { key: 'set1', label: 'Set 1', graphemes: ['s', 'a', 't', 'p'] },
      { key: 'set2', label: 'Set 2', graphemes: ['i', 'm', 'f', 'c'] },
      { key: 'set3', label: 'Set 3', graphemes: ['o', 'd', 'g', 'l'] },
      { key: 'set4', label: 'Set 4', graphemes: ['h', 'b', 'n', 'v'] },
      { key: 'set5', label: 'Set 5', graphemes: ['e', 'qu', 'z', 'r'] },
      { key: 'set6', label: 'Set 6', graphemes: ['u', 'y', 'j', 'k'] },
      { key: 'set7', label: 'Set 7', graphemes: ['x', 'w', 'ck', 'sh'] },
      { key: 'set8', label: 'Set 8', graphemes: ['ch', 'th', 'wh', 'ng'] },
      // Adjacent consonants: CVCC and CCVC words (mist, stop). No new
      // graphemes; known when the parent ticks it.
      { key: 'clusters', label: 'Set 9', graphemes: [], clusters: true, note: 'Adjacent consonants (words like stop, mist, jumps)' },
      { key: 'ai-ay', label: 'Set 10', graphemes: ['ai', 'ay'] },
      { key: 'ee-ea', label: 'Set 11', graphemes: ['ee', 'ea'] },
    ],
    // The default tricky-word progression: the words that come with each
    // stage (index into stages). The parent can tick or untick any of them.
    tricky: {
      set2: ['the', 'is'],
      set3: ['I', 'to', 'no', 'go', 'into'],
      set4: ['he', 'she', 'we', 'me', 'be'],
      set5: ['was', 'you'],
      set6: ['they', 'all', 'are'],
      set7: ['my', 'her'],
    },
  },
};

export const DEFAULT_SEQUENCE = 'school-2026';

export function sequenceById(id) {
  return SEQUENCES[id] || SEQUENCES[DEFAULT_SEQUENCE];
}

// Doubled consonants read as the single sound (miss, off, bell, buzz, mutt):
// the double counts as known once its letter is.
export const DOUBLES = ['ss', 'ff', 'll', 'zz', 'tt', 'pp', 'mm', 'cc'];

// Every grapheme a sequence teaches, in teaching order.
export function allGraphemes(seq = sequenceById(DEFAULT_SEQUENCE)) {
  return seq.stages.flatMap((s) => s.graphemes);
}

// Every tricky word of a sequence's default progression, in order.
export function allTrickyWords(seq = sequenceById(DEFAULT_SEQUENCE)) {
  return seq.stages.flatMap((s) => seq.tricky[s.key] || []);
}

// The 1-based stage number a grapheme is taught in (0 when the sequence does
// not teach it, such as a parent's own grapheme).
export function stageOfGrapheme(g, seq = sequenceById(DEFAULT_SEQUENCE)) {
  const i = seq.stages.findIndex((s) => s.graphemes.includes(g));
  return i + 1;
}

const lower = (w) => String(w).trim().toLowerCase();

// A known code from anything stored (or nothing): { graphemes: Set,
// tricky: Set (lower case), clusters: boolean }. Tricky words are compared in
// lower case, so "I" is "i".
export function makeCode({ graphemes = [], tricky = [], clusters = false } = {}) {
  return {
    graphemes: new Set([...graphemes].map(lower).filter(Boolean)),
    tricky: new Set([...tricky].map(lower).filter(Boolean)),
    clusters: !!clusters,
  };
}

function stageKnown(stage, code) {
  if (stage.clusters) return code.clusters;
  return stage.graphemes.every((g) => code.graphemes.has(g));
}

// The stage the known code reaches: the number of stages known in a row from
// the first (0 before set 1 is known). A sound ticked out of order counts in
// the code but does not move the stage.
export function deriveStage(code, seq = sequenceById(DEFAULT_SEQUENCE)) {
  let n = 0;
  for (const stage of seq.stages) {
    if (!stageKnown(stage, code)) break;
    n += 1;
  }
  return n;
}

// The default tricky words for a stage: every word of the progression up to
// and including that stage.
export function defaultTricky(stageNumber, seq = sequenceById(DEFAULT_SEQUENCE)) {
  return seq.stages.slice(0, stageNumber).flatMap((s) => seq.tricky[s.key] || []);
}

// The next stage to learn, or null when the whole sequence is known, with the
// sounds of it the code does not have yet.
export function nextStage(code, seq = sequenceById(DEFAULT_SEQUENCE)) {
  const n = deriveStage(code, seq);
  const stage = seq.stages[n];
  if (!stage) return null;
  return { number: n + 1, stage, missing: stage.graphemes.filter((g) => !code.graphemes.has(g)) };
}

// One line for the parent: "Reading at set 3. Next sounds: h b n v".
export function stageSummary(code, seq = sequenceById(DEFAULT_SEQUENCE)) {
  const n = deriveStage(code, seq);
  const next = nextStage(code, seq);
  const at = n === 0 ? 'Not started yet.' : `Reading at ${seq.stages[n - 1].label.toLowerCase()}.`;
  if (!next) return `${at} Every sound in the sequence is known.`;
  if (next.stage.clusters) return `${at} Next: ${next.stage.note.toLowerCase()}.`;
  return `${at} Next sounds: ${next.missing.join(' ')}`;
}
