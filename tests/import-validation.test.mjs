// inspectImport() refuses a family file whose learners or per-learner maps
// are not in the shape the app reads, with a reason the parent can act on.
import assert from 'node:assert/strict';
import { test } from 'node:test';

// The store saves through fetch; these tests never save.
globalThis.fetch = async () => { throw new Error('no network in this test'); };
const store = await import('../src/js/store.js');

// An export from before birth months, interests, settings and versioning:
// the first palette's color, progress and records only.
const olderExport = () => ({
  students: [
    { id: 's_older1', name: 'Sample Twelve', birthYear: 2016, color: '#3f7d5e', createdAt: 1_700_000_000_000, startDate: '2023-11-14' },
    { id: 's_older2', name: 'Sample Thirteen', birthYear: 2019, color: '#b0603a', createdAt: 1_700_000_100_000, startDate: '2023-11-14' },
  ],
  activeStudentId: 's_older1',
  progress: { s_older1: { 'count-to-5': { status: 'mastered', updatedAt: 1_700_000_200_000 } }, s_older2: {} },
  records: { s_older1: [{ id: 'r1', type: 'observation', title: 'Counted', note: '', createdAt: 1_700_000_300_000 }], s_older2: [] },
  tests: {},
  notifications: [],
});

const current = () => ({
  ...olderExport(),
  schemaVersion: 1,
  students: [{ id: 's_new', name: 'Sample Fourteen', birthYear: 2018, birthMonth: 4, color: store.PALETTE[2], startDate: '2026-09-01' }],
  activeStudentId: 's_new',
  progress: { s_new: { 'count-to-5': { status: 'learning', updatedAt: 1_700_000_200_000 } } },
  records: { s_new: [{ id: 'r1', type: 'discussion', title: 'Talked', note: 'n', rating: 4, transcript: 't', analysis: '<p>a</p>', createdAt: 1_700_000_300_000, duration: 61.5 }] },
  tests: { s_new: [{ id: 't1', scope: 'topic', subject: 'Mathematics', score: 9, total: 10, pct: 90, passed: true, createdAt: 1_700_000_400_000 }] },
  challenges: { s_new: [{ id: 'c1', topicId: 'count-to-5', correct: 5, total: 6, answered: 6, seconds: 88, createdAt: 1_700_000_500_000 }] },
  game: { s_new: { xp: 120, badges: { first: 1_700_000_600_000 } } },
  notifications: [{ id: 'n1', type: 'welcome', title: 'Welcome', body: 'Hi', read: false, createdAt: 1_700_000_000_000 }],
  interests: { s_new: { chips: ['Bridges', 'Frogs'], text: 'Asks how things work' } },
  settings: { parentPin: '2468', calendar: { homeDays: [1, 2, 3, 4], breaks: [{ start: '2026-12-21', end: '2027-01-01', label: 'Winter break' }] } },
});

test('a valid older export and a current one pass', () => {
  const older = store.inspectImport(olderExport());
  assert.equal(older.ok, true, older.error);
  assert.deepEqual(older.learners, [
    { name: 'Sample Twelve', topics: 1, records: 1, tests: 0 },
    { name: 'Sample Thirteen', topics: 0, records: 0, tests: 0 },
  ]);
  assert.equal(store.inspectImport(current()).ok, true);
  // Absent and null optional fields are fine.
  const sparse = current();
  Object.assign(sparse.students[0], { birthYear: null, birthMonth: null, startDate: undefined, color: undefined });
  sparse.interests.s_new = null;
  sparse.settings = { parentPin: null, calendar: null };
  assert.equal(store.inspectImport(sparse).ok, true);
  assert.equal(store.inspectImport({ ...current(), settings: { parentPin: 1357, calendar: {} } }).ok, true);
});

const learnerCases = [
  ['an empty name', { name: '   ' }, 'Learner 1 in the file has an empty name.'],
  ['a long name', { name: 'x'.repeat(101) }, 'Learner 1 in the file has a name longer than 100 characters.'],
  ['a birth year before 1990', { birthYear: 1989 }, 'Learner 1 in the file has a birth year outside 1990 to this year.'],
  ['a future birth year', { birthYear: new Date().getFullYear() + 1 }, 'Learner 1 in the file has a birth year outside 1990 to this year.'],
  ['a birth year as text', { birthYear: '2018' }, 'Learner 1 in the file has a birth year outside 1990 to this year.'],
  ['a birth month of 13', { birthMonth: 13 }, 'Learner 1 in the file has a birth month outside 1 to 12.'],
  ['a birth month of 0', { birthMonth: 0 }, 'Learner 1 in the file has a birth month outside 1 to 12.'],
  ['a malformed start date', { startDate: 'soon' }, 'Learner 1 in the file has a start date that is not a yyyy-mm-dd date.'],
  ['an impossible start date', { startDate: '2026-02-30' }, 'Learner 1 in the file has a start date that is not a yyyy-mm-dd date.'],
  ['markup as a color', { color: 'red;background:url(x)' }, 'Learner 1 in the file has a color that is not a hex color.'],
  ['a color that is not a string', { color: 7 }, 'Learner 1 in the file has a color that is not a hex color.'],
  ['no id', { id: undefined }, 'Learner 1 in the file is missing an id or name.'],
  ['an id with markup', { id: 's"><img src=x>' }, 'Learner 1 in the file has an id that is not 1 to 64 letters, digits, "-" or "_".'],
  ['an id of "constructor"', { id: 'constructor' }, 'Learner 1 in the file has an id that is not 1 to 64 letters, digits, "-" or "_".'],
  ['an id of "__proto__"', { id: '__proto__' }, 'Learner 1 in the file has an id that is not 1 to 64 letters, digits, "-" or "_".'],
  ['an id of 65 characters', { id: 'x'.repeat(65) }, 'Learner 1 in the file has an id that is not 1 to 64 letters, digits, "-" or "_".'],
];
for (const [label, patch, error] of learnerCases) {
  test(`refuses a learner with ${label}`, () => {
    const doc = current();
    Object.assign(doc.students[0], patch);
    assert.deepEqual(store.inspectImport(doc), { ok: false, error, learners: [] });
  });
}

test('refuses two learners with the same id', () => {
  const doc = olderExport();
  doc.students[1].id = doc.students[0].id;
  assert.equal(store.inspectImport(doc).error, 'Learner 2 in the file has the same id as another learner.');
});

const mapCases = [
  ['an active learner who is not in the file', (d) => { d.activeStudentId = 's_gone'; }, 'The file\'s active learner is not one of its learners.'],
  ['a record type with markup', (d) => { d.records.s_new[0].type = '<img src=x onerror=alert(1)>'; }, 'A record in the file (records item 1) has a type other than observation, question, discussion, assessment, recording, note.'],
  ['a record rating of 6', (d) => { d.records.s_new[0].rating = 6; }, 'A record in the file (records item 1) has a rating outside 1 to 5.'],
  ['a record rating as text', (d) => { d.records.s_new[0].rating = '5'; }, 'A record in the file (records item 1) has a rating outside 1 to 5.'],
  ['a record title that is not text', (d) => { d.records.s_new[0].title = { html: '<b>' }; }, 'A record in the file (records item 1) has a title that is not text of at most 1,000 characters.'],
  ['a record note over the bound', (d) => { d.records.s_new[0].note = 'x'.repeat(50_001); }, 'A record in the file (records item 1) has a note that is not text of at most 50,000 characters.'],
  ['a record date as text', (d) => { d.records.s_new[0].createdAt = 'yesterday'; }, 'A record in the file (records item 1) has a date that is not a number.'],
  ['a record duration as text', (d) => { d.records.s_new[0].duration = '<b>1</b>'; }, 'A record in the file (records item 1) has a duration that is not a number.'],
  ['a learner\'s records that are not a list', (d) => { d.records.s_new = { r1: {} }; }, 'The file\'s "records" section is not in the expected shape.'],
  ['a test score with markup', (d) => { d.tests.s_new[0].pct = '<img src=x onerror=alert(1)>'; }, 'A test result in the file (tests item 1) has a score outside 0 to 100%.'],
  ['a test score of 101', (d) => { d.tests.s_new[0].pct = 101; }, 'A test result in the file (tests item 1) has a score outside 0 to 100%.'],
  ['a fractional test total', (d) => { d.tests.s_new[0].total = 2.5; }, 'A test result in the file (tests item 1) has a total that is not a whole number.'],
  ['a test pass mark as text', (d) => { d.tests.s_new[0].passed = 'yes'; }, 'A test result in the file (tests item 1) has a pass mark that is not true or false.'],
  ['a challenge count as text', (d) => { d.challenges.s_new[0].correct = '<b>5</b>'; }, 'A challenge result in the file (challenges item 1) has a correct count that is not a whole number.'],
  ['a negative challenge time', (d) => { d.challenges.s_new[0].seconds = -1; }, 'A challenge result in the file (challenges item 1) has a time that is not a number.'],
  ['XP with markup', (d) => { d.game.s_new.xp = '<img src=x onerror=alert(1)>'; }, 'The file\'s XP is not a number of zero or more.'],
  ['XP that is infinite', (d) => { d.game.s_new.xp = Infinity; }, 'The file\'s XP is not a number of zero or more.'],
  ['badges as a list', (d) => { d.game.s_new.badges = ['first']; }, 'The file\'s badges are not in the expected shape.'],
  ['a notification that is not an object', (d) => { d.notifications = ['hi']; }, 'Notification 1 in the file is not a notification.'],
  ['a notification title that is not text', (d) => { d.notifications[0].title = { html: '<b>' }; }, 'Notification 1 in the file has a title that is not text.'],
  ['a notification read mark as text', (d) => { d.notifications[0].read = 'no'; }, 'Notification 1 in the file has a read mark that is not true or false.'],
  ['a progress status outside the known set', (d) => { d.progress.s_new = { t: { status: 'done' } }; }, 'The file\'s progress has a status other than none, learning, practicing, mastered.'],
  ['a progress entry that is not an object', (d) => { d.progress.s_new = { t: 'mastered' }; }, 'The file\'s progress has a status other than none, learning, practicing, mastered.'],
  ['a learner\'s progress that is a list', (d) => { d.progress.s_new = []; }, 'The file\'s "progress" section is not in the expected shape.'],
  ['interests as a list', (d) => { d.interests.s_new = ['Frogs']; }, 'The file\'s interests are not in the expected shape.'],
  ['interest chips that are not text', (d) => { d.interests.s_new = { chips: [{ label: 'Frogs' }] }; }, 'The file\'s interests are not in the expected shape.'],
  ['interest text that is not text', (d) => { d.interests.s_new = { chips: [], text: 7 }; }, 'The file\'s interests are not in the expected shape.'],
  ['settings as a list', (d) => { d.settings = []; }, 'The file\'s settings are not in the expected shape.'],
  ['a three-digit PIN', (d) => { d.settings.parentPin = '123'; }, 'The file\'s child-view PIN is not four digits.'],
  ['a PIN with letters', (d) => { d.settings.parentPin = '12a4'; }, 'The file\'s child-view PIN is not four digits.'],
  ['a PIN object', (d) => { d.settings.parentPin = { pin: '1234' }; }, 'The file\'s child-view PIN is not four digits.'],
  ['a home day of 7', (d) => { d.settings.calendar.homeDays = [1, 7]; }, 'The file\'s calendar settings are not in the expected shape.'],
  ['home days as text', (d) => { d.settings.calendar.homeDays = 'weekdays'; }, 'The file\'s calendar settings are not in the expected shape.'],
  ['a break without an end', (d) => { d.settings.calendar.breaks = [{ start: '2026-12-21' }]; }, 'The file\'s calendar settings are not in the expected shape.'],
  ['a break label that is not text', (d) => { d.settings.calendar.breaks[0].label = ['Winter']; }, 'The file\'s calendar settings are not in the expected shape.'],
  ['a calendar that is a list', (d) => { d.settings.calendar = []; }, 'The file\'s calendar settings are not in the expected shape.'],
];
for (const [label, mutate, error] of mapCases) {
  test(`refuses ${label}`, () => {
    const doc = current();
    mutate(doc);
    assert.deepEqual(store.inspectImport(doc), { ok: false, error, learners: [] });
  });
}
