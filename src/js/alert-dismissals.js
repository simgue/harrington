// Which stored bell dismissals still matter. Kept apart from alerts.js (which
// imports the scheduler, and through it the store) so store.js can use it
// without an import cycle.
//
// Keys (built in alerts.js):
//   welcome, evidence:<learner>:<last record>  permanent; kept
//   backup, backup:none                        snoozes; dropped once expired
//   picks:<learner>:<yyyy-mm-dd>               one day only; dropped once that day is past

export const DAY_MS = 24 * 60 * 60 * 1000;
export const SNOOZE_MS = {
  backup: 7 * DAY_MS,
  'backup:none': 30 * DAY_MS,
};

function pad(n) { return String(n).padStart(2, '0'); }
function localKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The dismissals worth keeping at `now`.
export function pruneDismissed(dismissed, now) {
  const today = localKey(now);
  const keep = {};
  for (const [key, value] of Object.entries(dismissed || {})) {
    const at = Number(value);
    if (!at) continue;
    if (key in SNOOZE_MS && now - at >= SNOOZE_MS[key]) continue;
    const picks = /^picks:.+:(\d{4}-\d{2}-\d{2})$/.exec(key);
    if (picks && picks[1] < today) continue;
    keep[key] = at;
  }
  return keep;
}
