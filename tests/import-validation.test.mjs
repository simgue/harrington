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
  students: [{ id: 's_new', name: 'Sample Fourteen', birthYear: 2018, birthMonth: 4, color: store.PALETTE[2], startDate: '2026-09-01' }],
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
  ['markup as a color', { color: 'red;background:url(x)' }, 'Learner 1 in the file has a color that is not a palette color.'],
  ['a color that is not a string', { color: 7 }, 'Learner 1 in the file has a color that is not a palette color.'],
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
