// Homestead Co-op Broker — a Puter serverless worker.
//
// This is a THIN broker for homeschool "pods" (families who share teaching
// duties). It holds only:
//   1. pod membership (who is in a pod, by Puter uuid + a display name), and
//   2. opt-in "Today cards" a child's parent explicitly shares for one day.
//
// It NEVER stores a family's real data. Progress, mastery, records, and
// recordings all stay in each family's own Puter account. A Today card carries
// only TOPIC REFERENCES plus an optional parent note — the covering parent's
// own app reconstructs the full lesson/activities from those topic ids locally,
// so "what and how to teach" is available without any private data leaving home.
//
// Identity model (see docs.puter.com Workers/router):
//   me.puter   -> this worker's own account: the shared broker store (billed to
//                 the app owner). All shared pod state lives here.
//   user.puter -> the calling parent's session (via puter.workers.exec). Used
//                 ONLY to identify the caller by uuid; their private KV is never
//                 read or written by this worker.

const CARD_TTL_SECONDS = 60 * 60 * 48; // Today cards self-expire after ~2 days.

const K = {
  pod: (id) => `coop:pod:${id}`,
  invite: (code) => `coop:invite:${code}`,
  userPods: (uuid) => `coop:userpods:${uuid}`,
  card: (podId, cardId) => `coop:card:${podId}:${cardId}`,
  cardPrefix: (podId) => `coop:card:${podId}:`,
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function bad(message, status = 400) { return json({ error: message }, status); }

// The gate for every authenticated endpoint: no user context -> reject.
async function requireUser(user) {
  if (!user || !user.puter) return null;
  try {
    const u = await user.puter.getUser();
    if (!u || !u.uuid) return null;
    return { uuid: u.uuid, username: u.username || null };
  } catch {
    return null;
  }
}

function randId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
}
function randCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I/L
  let s = '';
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}
function clampStr(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }

async function loadPod(podId) { return await me.puter.kv.get(K.pod(podId)); }
async function savePod(pod) { await me.puter.kv.set(K.pod(pod.id), pod); }
async function addUserPod(uuid, podId) {
  const key = K.userPods(uuid);
  const list = (await me.puter.kv.get(key)) || [];
  if (!list.includes(podId)) { list.push(podId); await me.puter.kv.set(key, list); }
}

// Shape a pod for the client: members as a list, never leaking anything else.
function publicPod(pod) {
  return {
    id: pod.id,
    name: pod.name,
    inviteCode: pod.inviteCode,
    adminUuid: pod.adminUuid,
    members: Object.entries(pod.members || {}).map(([uuid, displayName]) => ({ uuid, displayName })),
  };
}

async function listPodCards(podId) {
  let pairs = [];
  try { pairs = await me.puter.kv.list(K.cardPrefix(podId) + '*', true); } catch { pairs = []; }
  if (!Array.isArray(pairs)) pairs = [];
  return pairs
    .map((p) => (p && typeof p === 'object' && 'value' in p) ? p.value : p)
    .filter(Boolean);
}

// --- Pods -----------------------------------------------------------------

router.post('/pod/create', async ({ request, user }) => {
  const caller = await requireUser(user);
  if (!caller) return bad('Authentication required.', 401);

  let body = {};
  try { body = await request.json(); } catch {}
  const name = clampStr(body.name, 80) || 'My Pod';
  const displayName = clampStr(body.displayName, 60) || caller.username || 'Parent';

  const id = randId('pod');
  let code = randCode();
  for (let i = 0; i < 6 && (await me.puter.kv.get(K.invite(code))); i++) code = randCode();

  const pod = {
    id,
    name,
    adminUuid: caller.uuid,
    members: { [caller.uuid]: displayName },
    inviteCode: code,
    createdAt: Date.now(),
  };
  await savePod(pod);
  await me.puter.kv.set(K.invite(code), id);
  await addUserPod(caller.uuid, id);
  return json({ pod: publicPod(pod) });
});

router.post('/pod/join', async ({ request, user }) => {
  const caller = await requireUser(user);
  if (!caller) return bad('Authentication required.', 401);

  let body = {};
  try { body = await request.json(); } catch {}
  const code = clampStr(body.inviteCode, 16).toUpperCase();
  const displayName = clampStr(body.displayName, 60) || caller.username || 'Parent';
  if (!code) return bad('Invite code required.');

  const podId = await me.puter.kv.get(K.invite(code));
  if (!podId) return bad('Invalid invite code.', 404);
  const pod = await loadPod(podId);
  if (!pod) return bad('Pod not found.', 404);

  pod.members[caller.uuid] = displayName;
  await savePod(pod);
  await addUserPod(caller.uuid, podId);
  return json({ pod: publicPod(pod) });
});

router.get('/pod/mine', async ({ user }) => {
  const caller = await requireUser(user);
  if (!caller) return bad('Authentication required.', 401);

  const ids = (await me.puter.kv.get(K.userPods(caller.uuid))) || [];
  const pods = [];
  for (const id of ids) {
    const pod = await loadPod(id);
    if (pod && pod.members && pod.members[caller.uuid]) pods.push(publicPod(pod));
  }
  return json({ me: caller, pods });
});

// --- Today cards ----------------------------------------------------------

// A child's parent explicitly shares one day's focus. sharedWith is either the
// string "pod" (everyone in the pod) or an array of member uuids.
router.post('/card/share', async ({ request, user }) => {
  const caller = await requireUser(user);
  if (!caller) return bad('Authentication required.', 401);

  let body = {};
  try { body = await request.json(); } catch {}
  const podId = clampStr(body.podId, 40);
  if (!podId) return bad('podId required.');

  const pod = await loadPod(podId);
  if (!pod || !pod.members || !pod.members[caller.uuid]) return bad('Not a member of this pod.', 403);

  const childDisplayName = clampStr(body.childDisplayName, 60);
  const date = clampStr(body.date, 10); // YYYY-MM-DD
  const subject = clampStr(body.subject, 60);
  const note = clampStr(body.note, 500);
  const topicIds = Array.isArray(body.topicIds)
    ? body.topicIds.slice(0, 30).map((t) => clampStr(t, 80)).filter(Boolean)
    : [];
  if (!childDisplayName || !date) return bad('childDisplayName and date are required.');

  let sharedWith = body.sharedWith;
  if (sharedWith !== 'pod') {
    if (!Array.isArray(sharedWith)) return bad('sharedWith must be "pod" or an array of member uuids.');
    sharedWith = sharedWith.filter((u) => pod.members[u]);
  }

  const id = randId('card');
  const card = {
    id, podId, ownerUuid: caller.uuid,
    childDisplayName, date, subject, topicIds, note, sharedWith,
    createdAt: Date.now(),
  };
  const key = K.card(podId, id);
  await me.puter.kv.set(key, card);
  try { await me.puter.kv.expire(key, CARD_TTL_SECONDS); } catch {}
  return json({ card });
});

// The covering parent sees ONLY the cards shared to them (never their own, and
// never anything not explicitly shared). Optional ?date=YYYY-MM-DD filter.
router.get('/card/shared-to-me', async ({ request, user }) => {
  const caller = await requireUser(user);
  if (!caller) return bad('Authentication required.', 401);

  const url = new URL(request.url);
  const date = clampStr(url.searchParams.get('date'), 10);

  const podIds = (await me.puter.kv.get(K.userPods(caller.uuid))) || [];
  const cards = [];
  for (const podId of podIds) {
    const pod = await loadPod(podId);
    if (!pod || !pod.members || !pod.members[caller.uuid]) continue;
    for (const card of await listPodCards(podId)) {
      if (!card || card.ownerUuid === caller.uuid) continue;
      if (date && card.date !== date) continue;
      const shared = card.sharedWith === 'pod'
        || (Array.isArray(card.sharedWith) && card.sharedWith.includes(caller.uuid));
      if (!shared) continue;
      cards.push({
        ...card,
        ownerName: pod.members[card.ownerUuid] || 'Parent',
        podName: pod.name,
      });
    }
  }
  return json({ cards });
});

// --- misc -----------------------------------------------------------------

router.get('/health', async () => json({ status: 'ok', service: 'homestead-coop-broker' }));

router.get('/*rest', async ({ params }) => bad(`Not found: /${params.rest || ''}`, 404));
