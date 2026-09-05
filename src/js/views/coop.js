// Commune view: manage a learning "commune" of families who share teaching
// duties, and share a child's "Today focus" with the parent covering them that
// day.
//
// Privacy: this screen only ever sends topic references + an optional note to
// the broker (via src/js/coop.js). A family's progress, records, and mastery
// never leave their own server. The covering parent reconstructs the actual
// lesson/activities locally from the shared topic ids.
//
// This retained view is not linked from the self-hosted preview until a
// Harrington-owned broker exists.

import { getData, SUBJECTS } from '../data.js';
import * as store from '../store.js';
import { el, refreshIcons, toast, openModal } from '../ui.js';
import * as coop from '../coop.js';
import { openLesson } from './lesson.js';
import { printDaySheet, printChildSheet } from './daysheet.js';

function friendlyToday() {
  try { return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }); }
  catch { return todayKey(); }
}

function esc(s) { return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function renderCoop(params, { navigate }) {
  const root = el(`<div class="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);
  root.appendChild(el(`<div class="mb-5">
    <h1 class="font-display text-2xl sm:text-3xl font-600">Commune</h1>
    <p class="text-ink-soft text-sm mt-1 max-w-2xl">Share teaching duties with other families. Everyone keeps their own private data. The only thing shared is the day's focus for a child you approve, so a covering parent knows exactly what and how to teach.</p>
  </div>`));
  root.appendChild(howItWorks());
  const body = el(`<div id="coop-body"></div>`);
  root.appendChild(body);
  load(body);
  return root;
}

// Always-visible 3-step explainer so the flow is clear at a glance.
function howItWorks() {
  const stepCard = (n, icon, title, desc) => `<div class="bg-paper-card border border-paper-line rounded-xl p-3.5">
    <div class="flex items-center gap-2 mb-1">
      <span class="w-5 h-5 rounded-full bg-brand text-white text-[11px] font-700 flex items-center justify-center shrink-0">${n}</span>
      <i data-lucide="${icon}" class="w-4 h-4 text-brand-dark"></i>
      <span class="font-600 text-sm">${title}</span>
    </div>
    <p class="text-xs text-ink-soft leading-relaxed">${desc}</p>
  </div>`;
  return el(`<div class="grid sm:grid-cols-3 gap-2.5 mb-6">
    ${stepCard(1, 'users', 'Create or join', 'Start a commune and invite families, or join with a code.')}
    ${stepCard(2, 'send', 'Share a day', "Pick a child, the day, and the topics to share. Add a note if you like.")}
    ${stepCard(3, 'printer', 'Cover &amp; print', 'Teach any shared topic, or print one Day Sheet for every child you cover.')}
  </div>`);
}

function loadingInto(body, msg) {
  body.innerHTML = `<div class="text-center py-12"><div class="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-3"></div><p class="text-sm text-ink-soft">${msg}</p></div>`;
  refreshIcons();
}

async function load(body) {
  loadingInto(body, 'Loading your communes…');
  let data;
  try {
    data = await coop.myPods();
  } catch (e) {
    body.innerHTML = '';
    body.appendChild(errorBlock(e.message || 'Could not reach the commune service.', () => load(body)));
    refreshIcons();
    return;
  }
  const pods = data.pods || [];
  const me = data.me || {};
  body.innerHTML = '';
  if (!pods.length) {
    body.appendChild(startCard(body));
  } else {
    pods.forEach((pod) => body.appendChild(podCard(pod, me, body)));
    body.appendChild(joinLink(body));
    body.appendChild(coveringSection());
  }
  refreshIcons();
}

// --- empty state: create or join --------------------------------------------

function startCard(body) {
  const card = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-6">
    <div class="w-11 h-11 rounded-xl bg-brand/10 flex items-center justify-center mb-4"><i data-lucide="users" class="w-5.5 h-5.5 text-brand-dark"></i></div>
    <h2 class="font-600 text-lg mb-1">Start or join a commune</h2>
    <p class="text-sm text-ink-soft mb-5 max-w-lg">A commune is a small group of families who teach together. Create one and invite others, or join with a code someone shared.</p>
    <div class="grid sm:grid-cols-2 gap-3">
      <button id="create" class="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors"><i data-lucide="plus" class="w-4 h-4"></i>Create a commune</button>
      <button id="join" class="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-paper-card border border-paper-line font-medium hover:border-brand/40 transition-colors"><i data-lucide="log-in" class="w-4 h-4"></i>Join with a code</button>
    </div>
  </div>`);
  card.querySelector('#create').onclick = () => openCreatePod(body);
  card.querySelector('#join').onclick = () => openJoinPod(body);
  return card;
}

function joinLink(body) {
  const wrap = el(`<div class="text-center mt-2 mb-6"><button id="j" class="text-sm font-medium text-brand-dark hover:underline">+ Join another commune with a code</button></div>`);
  wrap.querySelector('#j').onclick = () => openJoinPod(body);
  return wrap;
}

function defaultParentName() {
  return store.get().user?.username || 'Parent';
}

function openCreatePod(body) {
  const form = el(`<div class="p-5">
    <h3 class="font-display text-lg font-600 mb-4">Create a commune</h3>
    <form id="f" class="space-y-4">
      <div>
        <label class="text-sm font-medium block mb-1.5">Commune name</label>
        <input name="name" required placeholder="e.g. Oak Street Commune" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
      </div>
      <div>
        <label class="text-sm font-medium block mb-1.5">Your name (shown to other families)</label>
        <input name="displayName" required value="${esc(defaultParentName())}" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
      </div>
      <button id="go" class="w-full px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors">Create commune</button>
    </form>
  </div>`);
  const m = openModal(form);
  form.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = form.querySelector('#go');
    btn.disabled = true; btn.textContent = 'Creating…';
    try {
      await coop.createPod(fd.get('name').trim(), fd.get('displayName').trim());
      m.close(); toast('Commune created', 'success'); load(body);
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Create commune';
      toast(err.message || 'Could not create commune', 'error');
    }
  };
}

function openJoinPod(body) {
  const form = el(`<div class="p-5">
    <h3 class="font-display text-lg font-600 mb-4">Join a commune</h3>
    <form id="f" class="space-y-4">
      <div>
        <label class="text-sm font-medium block mb-1.5">Invite code</label>
        <input name="inviteCode" required placeholder="e.g. 8PM8Q8NU" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
      </div>
      <div>
        <label class="text-sm font-medium block mb-1.5">Your name (shown to other families)</label>
        <input name="displayName" required value="${esc(defaultParentName())}" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
      </div>
      <button id="go" class="w-full px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors">Join commune</button>
    </form>
  </div>`);
  const m = openModal(form);
  form.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = form.querySelector('#go');
    btn.disabled = true; btn.textContent = 'Joining…';
    try {
      await coop.joinPod(fd.get('inviteCode').trim(), fd.get('displayName').trim());
      m.close(); toast('Joined commune', 'success'); load(body);
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Join commune';
      toast(err.message || 'Could not join commune', 'error');
    }
  };
}

// --- commune card -----------------------------------------------------------

function podCard(pod, me, body) {
  const card = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5 mb-4">
    <div class="flex items-start justify-between gap-3 mb-4">
      <div class="min-w-0">
        <h2 class="font-600 text-lg truncate">${esc(pod.name)}</h2>
        <p class="text-xs text-ink-faint mt-0.5">${pod.members.length} member${pod.members.length > 1 ? 's' : ''}</p>
      </div>
      <button class="share shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-brand hover:bg-brand-dark text-white text-sm font-medium transition-colors"><i data-lucide="send" class="w-4 h-4"></i>Share today's focus</button>
    </div>
    <div class="rounded-xl border border-paper-line bg-paper p-3 flex items-center gap-3 mb-4">
      <div class="flex-1 min-w-0">
        <p class="text-[11px] font-600 uppercase tracking-wide text-ink-faint">Invite code</p>
        <p class="font-mono text-lg tracking-wider">${esc(pod.inviteCode)}</p>
      </div>
      <button class="copy shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-paper-line text-sm font-medium hover:border-brand/40 transition-colors"><i data-lucide="copy" class="w-4 h-4"></i>Copy</button>
    </div>
    <div class="members space-y-1.5"></div>
  </div>`);

  const mem = card.querySelector('.members');
  pod.members.forEach((member) => {
    const isMe = member.uuid === me.uuid;
    mem.appendChild(el(`<div class="flex items-center gap-2.5 text-sm">
      <span class="w-7 h-7 rounded-lg bg-brand/10 flex items-center justify-center text-xs font-600 text-brand-dark shrink-0">${esc((member.displayName || '?').slice(0, 1).toUpperCase())}</span>
      <span class="text-ink">${esc(member.displayName)}</span>
      ${isMe ? '<span class="text-xs text-ink-faint">(you)</span>' : ''}
      ${member.uuid === pod.adminUuid ? '<span class="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-brand/10 text-brand-dark">admin</span>' : ''}
    </div>`));
  });

  card.querySelector('.copy').onclick = async () => {
    try { await navigator.clipboard.writeText(pod.inviteCode); toast('Invite code copied', 'success'); }
    catch { toast('Copy failed — code is ' + pod.inviteCode, 'error'); }
  };
  card.querySelector('.share').onclick = () => openShare(pod, body);
  return card;
}

// --- share a Today card -----------------------------------------------------

function openShare(pod, body) {
  const students = store.get().students || [];
  if (!students.length) { toast('Add a student first', 'error'); return; }
  const d = getData();
  const subjects = Object.keys(SUBJECTS);
  const selectedTopics = new Map(); // id -> name

  const form = el(`<div class="p-5">
    <h3 class="font-display text-lg font-600 mb-1">Share today's focus</h3>
    <p class="text-xs text-ink-soft mb-4">Only the topics and your note are shared — never ${esc(pod.name)}'s progress or records.</p>
    <form id="f" class="space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-sm font-medium block mb-1.5">Child</label>
          <select name="child" class="w-full px-3 py-2.5 rounded-lg border border-paper-line bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand">
            ${students.map((s) => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="text-sm font-medium block mb-1.5">Date</label>
          <input name="date" type="date" value="${todayKey()}" class="w-full px-3 py-2.5 rounded-lg border border-paper-line bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
        </div>
      </div>
      <div>
        <label class="text-sm font-medium block mb-1.5">Subject</label>
        <select name="subject" class="w-full px-3 py-2.5 rounded-lg border border-paper-line bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand">
          ${subjects.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="text-sm font-medium block mb-1.5">Topics for the day</label>
        <input id="topicSearch" placeholder="Search topics…" class="w-full px-3 py-2 rounded-lg border border-paper-line bg-paper text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
        <div id="topicList" class="max-h-44 overflow-y-auto rounded-lg border border-paper-line divide-y divide-paper-line"></div>
        <p id="selCount" class="text-xs text-ink-faint mt-1.5">No topics selected</p>
      </div>
      <div>
        <label class="text-sm font-medium block mb-1.5">Note for the covering parent (optional)</label>
        <textarea name="note" rows="2" placeholder="e.g. Go slow on regrouping; Sam finds it tricky." class="w-full px-3 py-2.5 rounded-lg border border-paper-line bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"></textarea>
      </div>
      <button id="go" type="submit" class="w-full px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors disabled:opacity-50">Share with the commune</button>
    </form>
  </div>`);

  const listEl = form.querySelector('#topicList');
  const searchEl = form.querySelector('#topicSearch');
  const countEl = form.querySelector('#selCount');
  const subjectEl = form.querySelector('select[name="subject"]');

  function renderTopics() {
    const subject = subjectEl.value;
    const q = searchEl.value.trim().toLowerCase();
    const topics = (d.bySubject[subject] || [])
      .filter((t) => !q || t.name.toLowerCase().includes(q))
      .slice(0, 60);
    listEl.innerHTML = '';
    if (!topics.length) {
      listEl.appendChild(el(`<p class="text-xs text-ink-faint p-3">No topics match.</p>`));
      return;
    }
    topics.forEach((t) => {
      const on = selectedTopics.has(t.id);
      const row = el(`<button type="button" class="w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 hover:bg-paper transition-colors ${on ? 'bg-brand-light/40' : ''}">
        <span class="w-4 h-4 rounded border ${on ? 'bg-brand border-brand' : 'border-ink-faint/40'} flex items-center justify-center shrink-0">${on ? '<i data-lucide=\"check\" class=\"w-3 h-3 text-white\"></i>' : ''}</span>
        <span class="flex-1 min-w-0 truncate">${esc(t.name)}</span>
      </button>`);
      row.onclick = () => {
        if (selectedTopics.has(t.id)) selectedTopics.delete(t.id);
        else selectedTopics.set(t.id, t.name);
        countEl.textContent = selectedTopics.size ? `${selectedTopics.size} topic${selectedTopics.size > 1 ? 's' : ''} selected` : 'No topics selected';
        renderTopics();
      };
      listEl.appendChild(row);
    });
    refreshIcons();
  }
  subjectEl.onchange = () => { renderTopics(); };
  searchEl.oninput = () => renderTopics();
  renderTopics();

  const m = openModal(form, { wide: true });
  form.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    if (!selectedTopics.size) { toast('Pick at least one topic', 'error'); return; }
    const fd = new FormData(e.target);
    const btn = form.querySelector('#go');
    btn.disabled = true; btn.textContent = 'Sharing…';
    try {
      await coop.shareCard({
        podId: pod.id,
        childDisplayName: fd.get('child'),
        date: fd.get('date'),
        subject: fd.get('subject'),
        topicIds: [...selectedTopics.keys()],
        note: fd.get('note').trim(),
        sharedWith: 'pod',
      });
      m.close();
      toast('Shared with the commune', 'success');
      load(body);
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Share with the commune';
      toast(err.message || 'Could not share', 'error');
    }
  };
}

// --- covering today (read-only preview; full Day Sheet is a later slice) ----

function coveringSection() {
  const wrap = el(`<div class="mt-6">
    <div class="flex items-center justify-between gap-2 mb-3">
      <h2 class="font-600 flex items-center gap-2"><i data-lucide="hand-helping" class="w-4.5 h-4.5 text-brand-dark"></i>Covering today</h2>
      <button id="printall" class="hidden items-center gap-1.5 text-sm font-medium text-brand-dark hover:underline"><i data-lucide="printer" class="w-4 h-4"></i>Print day sheet</button>
    </div>
    <div id="cov"></div>
  </div>`);
  const cov = wrap.querySelector('#cov');
  const printAll = wrap.querySelector('#printall');
  cov.innerHTML = `<p class="text-sm text-ink-faint">Loading…</p>`;
  (async () => {
    let cards = [];
    try { cards = (await coop.cardsSharedToMe(todayKey())).cards || []; }
    catch { cov.innerHTML = `<p class="text-sm text-ink-faint">Couldn't load shared cards.</p>`; return; }
    if (!cards.length) {
      cov.innerHTML = `<div class="bg-paper-card border border-paper-line rounded-2xl p-5 text-sm text-ink-soft">Nothing shared with you for today yet. When another parent shares a child's focus, it appears here so you know what to teach.</div>`;
      return;
    }
    const dateLabel = friendlyToday();
    printAll.classList.remove('hidden');
    printAll.classList.add('flex');
    printAll.onclick = () => printDaySheet(cards, dateLabel);

    const d = getData();
    cov.innerHTML = '';
    cards.forEach((card) => {
      const topics = (card.topicIds || []).map((id) => d.byId.get(id)).filter(Boolean);
      const cardEl = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-4 mb-3">
        <div class="flex items-center justify-between gap-2 mb-1">
          <p class="font-600">${esc(card.childDisplayName)} <span class="text-ink-faint font-normal">· ${esc(card.subject || '')}</span></p>
          <span class="text-xs text-ink-faint">from ${esc(card.ownerName || 'a parent')}</span>
        </div>
        <p class="text-sm text-ink-soft">${topics.length ? esc(topics.map((t) => t.name).join(', ')) : 'No topics listed'}</p>
        ${card.note ? `<p class="text-sm mt-2 rounded-lg bg-brand-light/40 border border-brand/20 p-2.5"><span class="font-600">Note:</span> ${esc(card.note)}</p>` : ''}
        <div class="teach flex flex-wrap gap-2 mt-3"></div>
      </div>`);
      const teach = cardEl.querySelector('.teach');
      topics.forEach((topic) => {
        const b = el(`<button class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-paper-line text-sm font-medium hover:border-brand/40 transition-colors"><i data-lucide="notebook-text" class="w-3.5 h-3.5"></i>Teach: ${esc(topic.name)}</button>`);
        b.onclick = () => openLesson(topic);
        teach.appendChild(b);
      });
      if (topics.length) {
        const p = el(`<button class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand/10 text-brand-dark text-sm font-medium hover:bg-brand/20 transition-colors"><i data-lucide="printer" class="w-3.5 h-3.5"></i>Print ${esc(card.childDisplayName)}'s sheet</button>`);
        p.onclick = () => printChildSheet(card, dateLabel);
        teach.appendChild(p);
      }
      cov.appendChild(cardEl);
    });
    refreshIcons();
  })();
  return wrap;
}

// --- shared bits ------------------------------------------------------------

function errorBlock(msg, retry) {
  const b = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-6 text-center">
    <i data-lucide="cloud-off" class="w-8 h-8 text-ink-faint mx-auto mb-3"></i>
    <p class="text-sm text-ink-soft mb-3">${esc(msg)}</p>
    <button id="r" class="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium">Try again</button>
  </div>`);
  b.querySelector('#r').onclick = retry;
  return b;
}
