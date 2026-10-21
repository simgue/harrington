// What the notification bell shows. Every item is computed here from the
// family's own data and a clock passed in, so the rules are pure and testable;
// nothing is stored except which items a parent dismissed. No AI is involved.
//
// Item: { key, type, learnerId (null for family-wide), title, body, snoozeMs?, href?, linkLabel? }
// `key` is what a dismissal is stored under; each rule builds it so that a
// dismissed item comes back only when the situation is new again (or, with
// snoozeMs, once that long has passed).
import { keyOf, restInfo } from './scheduler.js';
import { DAY_MS, SNOOZE_MS } from './alert-dismissals.js';

export const PICKS_DUE_HOUR = 15;   // local time after which open picks are flagged
export const EVIDENCE_DAYS = 7;     // a learner with no record for this long is flagged
export const BACKUP_DAYS = 7;       // a newest backup older than this is flagged
export const NO_BACKUP_SNOOZE_DAYS = SNOOZE_MS['backup:none'] / DAY_MS; // "No backup recorded", once dismissed, stays quiet this long
// The README's backup section (npm run backup, HARRINGTON_BACKUP_DIR, Docker volumes).
export const BACKUP_HELP_HREF = 'https://github.com/simgue/harrington/blob/main/README.md#backup-and-restore';

const LANE_LABELS = { literacy: 'literacy', numeracy: 'numeracy' };

// (a) Today is a home day, it is 15:00 or later, and a daily lane is still
// unpicked. A lane whose offers were built empty (nothing to choose) is not open.
// `day` is the learner's daily entry for today: { offers, picks } or null.
export function picksStillOpen({ now, student, day, calendar }) {
  const date = new Date(now);
  if (date.getHours() < PICKS_DUE_HOUR) return null;
  const today = keyOf(date);
  if (restInfo(today, calendar)) return null;
  if (student.startDate && student.startDate > today) return null;
  const open = Object.keys(LANE_LABELS).filter(lane => {
    if (day?.picks?.[lane]) return false;
    const offers = day?.offers?.[lane];
    return !Array.isArray(offers) || offers.length > 0;
  });
  if (!open.length) return null;
  const lanes = open.map(l => LANE_LABELS[l]).join(' or ');
  return {
    key: `picks:${student.id}:${today}`,
    type: 'picks',
    learnerId: student.id,
    title: `Today's picks are still open for ${student.name}`,
    body: `No ${lanes} pick yet today. Choose one on the dashboard, or leave it if today went another way.`,
  };
}

// (b) No record in the last EVIDENCE_DAYS days. A learner added less than
// that long ago is not flagged yet. Dismissing it lasts until a new record
// arrives and then goes quiet again.
export function noRecentEvidence({ now, student, records }) {
  const list = Array.isArray(records) ? records : [];
  const last = list.reduce((max, r) => Math.max(max, Number(r?.createdAt) || 0), 0);
  const since = last || Number(student.createdAt) || 0;
  if (now - since < EVIDENCE_DAYS * DAY_MS) return null;
  return {
    key: `evidence:${student.id}:${last}`,
    type: 'evidence',
    learnerId: student.id,
    title: `No evidence this week for ${student.name}`,
    body: last
      ? `The last record was ${Math.floor((now - last) / DAY_MS)} days ago. Add a note or recording under Records.`
      : 'There are no records yet. Add a note or recording under Records.',
  };
}

// (c) The newest backup is older than BACKUP_DAYS, or none has been recorded.
// `backupAgeDays` comes from /api/health (null: no archive in the server's
// backup folder; undefined: unknown, for example an older server). Family-wide.
// A family that backs up some other way (a Docker volume, say) never has an
// archive there, so "No backup recorded" is a one-time note with the backup guide
// link that a dismissal quiets for NO_BACKUP_SNOOZE_DAYS; it has its own key,
// so it never hides the age reminder once a backup exists. Dismissing the age
// reminder lasts BACKUP_DAYS.
export function backupOverdue({ backupAgeDays }) {
  if (backupAgeDays === undefined) return null;
  if (backupAgeDays === null) {
    return {
      key: 'backup:none',
      type: 'backup',
      learnerId: null,
      title: 'No backup recorded',
      body: 'Harrington has not seen a backup in its backup folder. If you back up another way, such as a Docker volume, dismiss this; it comes back in 30 days.',
      snoozeMs: SNOOZE_MS['backup:none'],
      href: BACKUP_HELP_HREF,
      linkLabel: 'How to set up backups',
    };
  }
  if (backupAgeDays <= BACKUP_DAYS) return null;
  return {
    key: 'backup',
    type: 'backup',
    learnerId: null,
    title: `Backup older than ${BACKUP_DAYS} days`,
    body: `The newest backup is ${backupAgeDays} days old. Run "npm run backup" on the computer running Harrington.`,
    snoozeMs: SNOOZE_MS.backup,
  };
}

// The one-time welcome, until dismissed. `welcomed` is true for a family that
// already saw the welcome under the old notification log.
export function welcome({ welcomed }) {
  if (welcomed) return null;
  return {
    key: 'welcome',
    type: 'welcome',
    learnerId: null,
    title: 'Welcome to Harrington',
    body: 'The bell lists what needs a parent: open daily picks after 3 pm, a learner with no evidence this week, and a missing or old backup. Dismiss an item once it is handled.',
  };
}

// True when `item` was dismissed and the dismissal still holds at `now`.
function isDismissed(item, dismissed, now) {
  const at = Number(dismissed?.[item.key]);
  if (!at) return false;
  return item.snoozeMs ? now - at < item.snoozeMs : true;
}

// Every live item, family-wide ones first, then each learner's in roster order.
export function buildAlerts({ now, students = [], daily = {}, records = {}, calendar = null, backupAgeDays, dismissed = {}, welcomed = false }) {
  const items = [welcome({ welcomed }), backupOverdue({ backupAgeDays })];
  const today = keyOf(new Date(now));
  for (const student of students) {
    items.push(picksStillOpen({ now, student, day: daily[student.id]?.[today] || null, calendar }));
    items.push(noRecentEvidence({ now, student, records: records[student.id] }));
  }
  return items.filter(item => item && !isDismissed(item, dismissed, now));
}

// Items for one learner (plus family-wide ones), or every item for 'all'.
export function forLearner(items, learnerId) {
  if (learnerId === 'all') return items;
  return items.filter(item => item.learnerId === null || item.learnerId === learnerId);
}

// The bell's accessible name.
export function bellLabel(count) {
  return count ? `Notifications, ${count} new` : 'Notifications';
}
