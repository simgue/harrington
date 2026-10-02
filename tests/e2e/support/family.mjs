// The synthetic family every spec uses, and the taxonomy topics the specs
// lean on. Names are deliberately fake; never use a real child's name here.
import { FIXED_NOW, FIXED_YEAR, TODAY_KEY } from './env.mjs';

export const LEARNERS = {
  wren: { id: 's_e2e_wren', name: 'Wren Example', birthYear: FIXED_YEAR - 3, color: '#3f6b3b' },
  rowan: { id: 's_e2e_rowan', name: 'Rowan Example', birthYear: FIXED_YEAR - 6, color: '#a4473a' },
  sage: { id: 's_e2e_sage', name: 'Sage Example', birthYear: FIXED_YEAR - 9, color: '#2f6285' },
};

// Marble topics (ids are stable in the taxonomy; names are what the UI shows).
export const TOPICS = {
  // Mathematics > Counting & Cardinality, ages 4–6. No prerequisites; unlocks three.
  oneToOne: { id: 'mt_WcfaSfVT33', name: 'One-to-one counting', subject: 'Mathematics', domain: 'Counting & Cardinality' },
  // Needs One-to-one counting (hard prerequisite).
  howMany: { id: 'mt_dmNvjroCPT', name: 'How Many in Total?' },
  rote100: { id: 'mt_M5PPDJStGm', name: 'Rote counting to 100' },
};

// The other eight topics of the Counting & Cardinality age-5 section. Marking
// them mastered leaves One-to-one counting as the last one before the section check.
export const COUNTING_SECTION_OTHERS = [
  'mt__h7hvT4tEb', 'mt_dmNvjroCPT', 'mt_sYpKWbq5ra', 'mt_pAcaehday5',
  'mt_nvdpxAJTBG', 'mt_yqAL6O5i_v', 'mt_M5PPDJStGm', 'mt__YRJ23GuIK',
];

export function learner(key) {
  return { ...LEARNERS[key], createdAt: FIXED_NOW.getTime(), startDate: TODAY_KEY };
}

// A family state as the browser would save it. `active` picks the learner;
// `progress` is { topicId: status } for the active learner.
export function familyState({ learners = ['wren', 'rowan', 'sage'], active = 'rowan', progress = {}, records = [], extra = {} } = {}) {
  const students = learners.map(learner);
  const activeId = LEARNERS[active].id;
  const now = FIXED_NOW.getTime();
  const state = {
    students,
    activeStudentId: activeId,
    progress: Object.fromEntries(students.map((s) => [s.id, {}])),
    records: Object.fromEntries(students.map((s) => [s.id, []])),
  };
  for (const [topicId, status] of Object.entries(progress)) {
    state.progress[activeId][topicId] = { status, updatedAt: now - 60_000 };
  }
  state.records[activeId] = records.map((r, i) => ({ id: `r_e2e_${i}`, createdAt: now - (i + 1) * 3_600_000, ...r }));
  return { ...state, ...extra };
}
