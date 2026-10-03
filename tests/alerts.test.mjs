import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  picksStillOpen, noRecentEvidence, backupOverdue, welcome, buildAlerts, forLearner, bellLabel,
  PICKS_DUE_HOUR, EVIDENCE_DAYS, BACKUP_DAYS, NO_BACKUP_SNOOZE_DAYS, BACKUP_HELP_HREF,
} from '../src/js/alerts.js';

const DAY = 24 * 60 * 60 * 1000;
// Fixed local-time clocks. 2026-10-05 is a Monday, 2026-10-10 a Saturday.
const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const MON_3PM = at(2026, 10, 5, PICKS_DUE_HOUR);
const MON_2_59 = at(2026, 10, 5, 14, 59);
const SAT_4PM = at(2026, 10, 10, 16);

const ada = { id: 's_ada', name: 'Ada Sample', createdAt: at(2026, 9, 1, 9), startDate: '2026-09-01' };
const ben = { id: 's_ben', name: 'Ben Example', createdAt: at(2026, 9, 1, 9), startDate: '2026-09-01' };
const offers = { literacy: ['p1', 'p2'], numeracy: ['c1', 'c2'] };

test('open picks: flagged on a home day from 15:00 when a lane is unpicked', () => {
  const item = picksStillOpen({ now: MON_3PM, student: ada, day: { offers, picks: { literacy: 'p1' } }, calendar: null });
  assert.equal(item.key, 'picks:s_ada:2026-10-05');
  assert.equal(item.learnerId, 's_ada');
  assert.equal(item.title, "Today's picks are still open for Ada Sample");
  assert.match(item.body, /No numeracy pick yet today/);

  const neither = picksStillOpen({ now: MON_3PM, student: ada, day: null, calendar: null });
  assert.match(neither.body, /No literacy or numeracy pick/);
});

test('open picks: quiet before 15:00, when both lanes are picked, or with nothing to pick', () => {
  assert.equal(picksStillOpen({ now: MON_2_59, student: ada, day: null, calendar: null }), null);
  assert.equal(picksStillOpen({ now: MON_3PM, student: ada, day: { offers, picks: { literacy: 'p1', numeracy: 'c1' } }, calendar: null }), null);
  assert.equal(picksStillOpen({ now: MON_3PM, student: ada, day: { offers: { literacy: [], numeracy: [] }, picks: {} }, calendar: null }), null);
});

test('open picks: quiet on rest days from the family calendar and before the learner starts', () => {
  // Default home days are Monday to Friday.
  assert.equal(picksStillOpen({ now: SAT_4PM, student: ada, day: null, calendar: null }), null);
  // A Saturday home day is flagged.
  assert.ok(picksStillOpen({ now: SAT_4PM, student: ada, day: null, calendar: { homeDays: [6] } }));
  // Monday is not a home day for this family.
  assert.equal(picksStillOpen({ now: MON_3PM, student: ada, day: null, calendar: { homeDays: [2, 3] } }), null);
  // A break covers Monday.
  const onBreak = { homeDays: [1, 2, 3, 4, 5], breaks: [{ start: '2026-10-05', end: '2026-10-09', label: 'Fall break' }] };
  assert.equal(picksStillOpen({ now: MON_3PM, student: ada, day: null, calendar: onBreak }), null);
  // The learner's track starts later.
  assert.equal(picksStillOpen({ now: MON_3PM, student: { ...ada, startDate: '2026-10-06' }, day: null, calendar: null }), null);
});

test('no evidence: flagged after seven days without a record, keyed by the last record', () => {
  const last = MON_3PM - (EVIDENCE_DAYS * DAY + 1);
  const item = noRecentEvidence({ now: MON_3PM, student: ada, records: [{ createdAt: last - DAY }, { createdAt: last }] });
  assert.equal(item.key, `evidence:s_ada:${last}`);
  assert.equal(item.title, 'No evidence this week for Ada Sample');
  assert.match(item.body, /The last record was 7 days ago/);

  assert.equal(noRecentEvidence({ now: MON_3PM, student: ada, records: [{ createdAt: MON_3PM - 6 * DAY }] }), null);
});

test('no evidence: a learner with no records is flagged only once added seven days ago', () => {
  const none = noRecentEvidence({ now: MON_3PM, student: ada, records: [] });
  assert.equal(none.key, 'evidence:s_ada:0');
  assert.match(none.body, /There are no records yet/);
  const fresh = { ...ada, createdAt: MON_3PM - 2 * DAY };
  assert.equal(noRecentEvidence({ now: MON_3PM, student: fresh, records: undefined }), null);
});

test('backup: flagged when older than seven days or none recorded, quiet when unknown', () => {
  assert.equal(backupOverdue({ backupAgeDays: 0 }), null);
  assert.equal(backupOverdue({ backupAgeDays: BACKUP_DAYS }), null);
  const old = backupOverdue({ backupAgeDays: BACKUP_DAYS + 1 });
  assert.equal(old.title, 'Backup older than 7 days');
  assert.match(old.body, /8 days old.*npm run backup/);
  assert.equal(old.learnerId, null);
  const none = backupOverdue({ backupAgeDays: null });
  assert.equal(none.title, 'No backup recorded');
  assert.equal(none.key, 'backup:none');
  assert.equal(none.href, BACKUP_HELP_HREF);
  assert.match(BACKUP_HELP_HREF, /docs\/DEPLOYMENT\.md#nightly-backup$/);
  assert.equal(old.href, undefined);
  assert.equal(backupOverdue({ backupAgeDays: undefined }), null);
});

test('welcome shows once, not for a family that saw the old one', () => {
  assert.equal(welcome({ welcomed: false }).key, 'welcome');
  assert.equal(welcome({ welcomed: true }), null);
});

test('buildAlerts: dismissals hold until the situation is new, backup snoozes a week', () => {
  const lastAda = MON_3PM - 10 * DAY;
  const input = {
    now: MON_3PM,
    students: [ada, ben],
    daily: { s_ben: { '2026-10-05': { offers, picks: { literacy: 'p1', numeracy: 'c1' } } } },
    records: { s_ada: [{ createdAt: lastAda }], s_ben: [{ createdAt: MON_3PM - DAY }] },
    calendar: null,
    backupAgeDays: 9,
  };
  const keys = (opts) => buildAlerts({ ...input, ...opts }).map(i => i.key);
  assert.deepEqual(keys({}), ['welcome', 'backup', 'picks:s_ada:2026-10-05', `evidence:s_ada:${lastAda}`]);

  const dismissed = { welcome: 1, 'picks:s_ada:2026-10-05': 1, [`evidence:s_ada:${lastAda}`]: 1, backup: MON_3PM - 6 * DAY };
  assert.deepEqual(keys({ dismissed }), []);
  // The next home day's picks and a new stale stretch come back.
  assert.deepEqual(keys({ dismissed, now: MON_3PM + DAY, records: { s_ada: [{ createdAt: lastAda + DAY }] } }).sort(),
    ['backup', 'evidence:s_ben:0', 'picks:s_ada:2026-10-06', 'picks:s_ben:2026-10-06', `evidence:s_ada:${lastAda + DAY}`].sort());
});

test('backup: "No backup recorded" snoozes for 30 days and never hides the age reminder', () => {
  const base = { now: MON_3PM, students: [], welcomed: true };
  const dismissed = { 'backup:none': MON_3PM };
  const keys = (opts) => buildAlerts({ ...base, ...opts }).map(i => i.key);
  assert.equal(NO_BACKUP_SNOOZE_DAYS, 30);
  assert.deepEqual(keys({ backupAgeDays: null }), ['backup:none']);
  assert.deepEqual(keys({ backupAgeDays: null, dismissed }), []);
  assert.deepEqual(keys({ backupAgeDays: null, dismissed, now: MON_3PM + 29 * DAY }), []);
  assert.deepEqual(keys({ backupAgeDays: null, dismissed, now: MON_3PM + 30 * DAY }), ['backup:none']);
  // Once an archive exists and ages, the age reminder shows despite that dismissal.
  assert.deepEqual(keys({ backupAgeDays: 9, dismissed, now: MON_3PM + DAY }), ['backup']);
});

test('forLearner keeps family-wide items under every filter', () => {
  const items = [{ key: 'backup', learnerId: null }, { key: 'a', learnerId: 's_ada' }, { key: 'b', learnerId: 's_ben' }];
  assert.deepEqual(forLearner(items, 's_ada').map(i => i.key), ['backup', 'a']);
  assert.deepEqual(forLearner(items, 'all').map(i => i.key), ['backup', 'a', 'b']);
});

test('the bell is named, with the count in words', () => {
  assert.equal(bellLabel(0), 'Notifications');
  assert.equal(bellLabel(3), 'Notifications, 3 new');
});

test('the bell never calls the AI and the curriculum-change sync is gone', async () => {
  for (const path of ['src/js/alerts.js', 'src/js/views/notifications.js']) {
    const code = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.doesNotMatch(code, /from '\.\.?\/(ai|ai-status)\.js'|\/api\/ai/, `${path} reaches the AI`);
  }
  await assert.rejects(readFile(new URL('../src/js/curriculum-sync.js', import.meta.url)), { code: 'ENOENT' });
});
