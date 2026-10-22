// A family document carrying a script payload at every place an independent
// review found one could run or wedge the app (PR #32 review, item 1). Each
// payload is refused by the import check and by the server; the escaping in
// the views is checked separately by serving this document to the browser
// directly.
import { FIXED_NOW } from './env.mjs';
import { familyState, LEARNERS, TOPICS } from './family.mjs';

export const PAYLOAD = '<img src=x onerror="window.__pwned=(window.__pwned||0)+1">';

const ROWAN = LEARNERS.rowan.id;
const at = FIXED_NOW.getTime() - 3_600_000;

// One hostile change per entry: [label, mutate(doc), the import check's reason].
export const HOSTILE_CHANGES = [
  ['record type', (d) => { d.records[ROWAN] = [{ id: 'r1', type: PAYLOAD, title: 'Note', createdAt: at }]; },
    'A record in the file (records item 1) has a type other than observation, question, discussion, assessment, recording, note.'],
  ['record rating of 6', (d) => { d.records[ROWAN] = [{ id: 'r1', type: 'observation', title: 'Note', rating: 6, createdAt: at }]; },
    'A record in the file (records item 1) has a rating outside 1 to 5.'],
  ['test score', (d) => { d.tests = { [ROWAN]: [{ id: 't1', scope: 'topic', topicId: TOPICS.oneToOne.id, subject: 'Mathematics', pct: PAYLOAD, passed: true, createdAt: at }] }; },
    'A test result in the file (tests item 1) has a score outside 0 to 100%.'],
  ['XP', (d) => { d.game = { [ROWAN]: { xp: PAYLOAD, badges: {} } }; },
    'The file\'s XP is not a number of zero or more.'],
  ['challenge count', (d) => { d.challenges = { [ROWAN]: [{ id: 'c1', topicId: TOPICS.oneToOne.id, correct: PAYLOAD, total: 6, createdAt: at }] }; },
    'A challenge result in the file (challenges item 1) has a correct count that is not a whole number.'],
  ['learner id "constructor"', (d) => {
    d.students[0].id = 'constructor';
    d.activeStudentId = 'constructor';
  }, 'Learner 1 in the file has an id that is not 1 to 64 letters, digits, "-" or "_".'],
];

export function hostileFamily(label) {
  const doc = familyState({ learners: ['rowan'], active: 'rowan', progress: { [TOPICS.oneToOne.id]: 'mastered' } });
  HOSTILE_CHANGES.find(([l]) => l === label)[1](doc);
  return doc;
}

// Every payload the views must escape at once (all but the learner id, which
// the store cannot load at all and the checks refuse), for the render test.
export function everyRenderPayload() {
  const doc = familyState({ learners: ['rowan'], active: 'rowan', progress: { [TOPICS.oneToOne.id]: 'mastered' } });
  doc.records[ROWAN] = [
    { id: 'r1', type: PAYLOAD, title: 'Hostile type', createdAt: at },
    { id: 'r2', type: 'observation', title: 'Six stars', rating: 6, createdAt: at - 1 },
    { id: 'r3', type: 'discussion', title: 'Hostile analysis', analysis: PAYLOAD, createdAt: at - 2 },
  ];
  doc.tests = { [ROWAN]: [
    { id: 't1', scope: 'topic', topicId: TOPICS.oneToOne.id, subject: 'Mathematics', pct: PAYLOAD, passed: true, createdAt: at },
    { id: 't2', scope: 'subject', subject: 'Mathematics', pct: PAYLOAD, passed: false, createdAt: at },
  ] };
  doc.challenges = { [ROWAN]: [{ id: 'c1', topicId: TOPICS.oneToOne.id, subject: 'Mathematics', correct: PAYLOAD, total: PAYLOAD, createdAt: at }] };
  doc.game = { [ROWAN]: { xp: PAYLOAD, badges: {} } };
  return doc;
}
