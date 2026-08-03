// Client wrapper for the Homestead co-op broker worker.
//
// The broker is a thin, privacy-preserving relay: it holds only pod membership
// and opt-in "Today cards" (topic references + an optional parent note). All
// real family data (progress, mastery, records, recordings) stays in each
// family's own Puter account and never touches the broker.
//
// Every call goes through puter.workers.exec(), which attaches the signed-in
// parent's Puter session so the broker can identify them by uuid.

// Set by scripts/deploy-worker.mjs on first deploy. Confirm it matches the URL
// that script prints (it will if the worker name is unchanged).
export const BROKER_URL = 'https://homestead-coop-broker.puter.work';

async function call(path, { method = 'GET', body = null } = {}) {
  const opts = { method, headers: {} };
  if (body != null) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await puter.workers.exec(`${BROKER_URL}${path}`, opts);
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    throw new Error((data && data.error) || `Co-op request failed (${res.status})`);
  }
  return data;
}

// Create a new pod; the caller becomes admin and first member.
export function createPod(name, displayName) {
  return call('/pod/create', { method: 'POST', body: { name, displayName } });
}

// Join an existing pod by its invite code.
export function joinPod(inviteCode, displayName) {
  return call('/pod/join', { method: 'POST', body: { inviteCode, displayName } });
}

// List the pods the signed-in parent belongs to (each with its member list).
export function myPods() {
  return call('/pod/mine');
}

// A child's parent shares one day's focus. `sharedWith` is the string 'pod'
// (everyone in the pod) or an array of member uuids. `topicIds` reference
// curriculum topics; the covering parent's app reconstructs the full lesson,
// activities, and resources locally from them — no private data is sent.
export function shareCard({ podId, childDisplayName, date, subject, topicIds, note, sharedWith }) {
  return call('/card/share', {
    method: 'POST',
    body: {
      podId,
      childDisplayName,
      date,
      subject,
      topicIds: topicIds || [],
      note: note || '',
      sharedWith: sharedWith || 'pod',
    },
  });
}

// Cards shared TO the signed-in parent (never their own), optionally filtered
// to a single YYYY-MM-DD date.
export function cardsSharedToMe(date = null) {
  return call(`/card/shared-to-me${date ? `?date=${encodeURIComponent(date)}` : ''}`);
}
