import * as store from '../store.js';
import { el, esc, refreshIcons, openModal } from '../ui.js';
import { buildAlerts, forLearner, bellLabel, PICKS_DUE_HOUR } from '../alerts.js';
import { familyCalendar, keyOf, restInfo } from '../scheduler.js';
import { todaysOffers } from '../mastery.js';

const TYPE_META = {
  picks: { icon: 'list-checks', color: '#2f6285' },
  evidence: { icon: 'notebook-pen', color: '#8a6412' },
  backup: { icon: 'hard-drive', color: '#a4473a' },
  welcome: { icon: 'party-popper', color: '#5b4a86' },
};

// The bell's items right now, for every learner.
function currentAlerts() {
  const s = store.get();
  const now = Date.now();
  return buildAlerts({
    now,
    students: s.students,
    daily: todaysDaily(s.students, now),
    records: s.records,
    calendar: familyCalendar(),
    backupAgeDays: store.backupAge(),
    dismissed: store.dismissedAlerts(),
    welcomed: store.welcomed(),
  });
}

// Today's { offers, picks } for each learner, once picks can be due. Offers
// the dashboard has not built yet are worked out without saving them, so a
// learner with nothing to choose today is not told their picks are open.
function todaysDaily(students, now) {
  const date = new Date(now);
  if (date.getHours() < PICKS_DUE_HOUR) return {};
  const today = keyOf(date);
  if (restInfo(today, familyCalendar())) return {};
  const out = {};
  for (const st of students) {
    const saved = store.dailyFor(st.id, today);
    out[st.id] = { [today]: { offers: todaysOffers(st.id, today), picks: (saved && saved.picks) || {} } };
  }
  return out;
}

// A bell button with a count badge; opens the notification center.
export function notificationBell(compact = false) {
  const count = currentAlerts().length;
  const btn = el(`<button class="relative w-9 h-9 rounded-lg border border-paper-line bg-paper-card hover:border-brand/40 transition-colors flex items-center justify-center" title="Notifications" aria-label="${bellLabel(count)}">
    <i data-lucide="bell" class="w-4.5 h-4.5 text-ink-soft" aria-hidden="true"></i>
    ${count ? `<span class="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#a4473a] text-white text-[10px] font-700 flex items-center justify-center" aria-hidden="true">${count > 9 ? '9+' : count}</span>` : ''}
  </button>`);
  btn.onclick = openNotificationCenter;
  return btn;
}

function openNotificationCenter() {
  const students = store.get().students;
  let learner = store.get().activeStudentId || 'all';
  const body = el(`<div class="p-0">
    <div class="sticky top-0 bg-paper-card border-b border-paper-line px-5 py-4 z-10">
      <div class="flex items-center gap-3">
        <span class="w-9 h-9 rounded-lg bg-brand-light flex items-center justify-center shrink-0"><i data-lucide="bell" class="w-5 h-5 text-brand-dark"></i></span>
        <div class="flex-1 min-w-0">
          <h3 class="font-display text-lg font-600 leading-tight">Notifications</h3>
          <p class="text-xs text-ink-faint">Open picks, missing evidence and backups</p>
        </div>
        <button id="dismissall" class="text-xs font-medium text-brand-dark shrink-0">Dismiss all</button>
      </div>
      ${students.length ? `<label class="mt-3 flex items-center gap-2 text-xs text-ink-soft">Show
        <select id="learner" class="text-xs rounded-lg border border-paper-line bg-paper px-2 py-1">
          ${students.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}
          <option value="all">All learners</option>
        </select></label>` : ''}
    </div>
    <div id="list" class="px-5 py-4 space-y-2.5"></div>
  </div>`);
  const list = body.querySelector('#list');
  const select = body.querySelector('#learner');
  if (select) {
    if (![...select.options].some(o => o.value === learner)) learner = 'all';
    select.value = learner;
    select.onchange = () => { learner = select.value; render(); };
  }

  const shown = () => forLearner(currentAlerts(), learner);
  const render = () => {
    const all = currentAlerts();
    const items = forLearner(all, learner);
    list.innerHTML = '';
    if (items.length === 0) {
      list.appendChild(el(`<div class="text-center py-10 text-ink-faint">
        <i data-lucide="bell-off" class="w-9 h-9 mx-auto mb-3"></i>
        <p class="text-sm">Nothing needs you right now.</p>
      </div>`));
    } else {
      items.forEach(n => list.appendChild(notifRow(n, students, render)));
    }
    const others = all.length - items.length;
    if (others > 0) {
      const more = el(`<button class="w-full text-xs font-medium text-brand-dark py-1">${others} more for other learners: show all</button>`);
      more.onclick = () => { learner = 'all'; if (select) select.value = 'all'; render(); };
      list.appendChild(more);
    }
    body.querySelector('#dismissall').disabled = items.length === 0;
    refreshIcons();
  };

  body.querySelector('#dismissall').onclick = () => { store.dismissAlerts(shown().map(n => n.key)); render(); };
  render();
  openModal(body);
}

function notifRow(n, students, rerender) {
  const meta = TYPE_META[n.type] || TYPE_META.welcome;
  const who = n.learnerId ? students.find(s => s.id === n.learnerId) : null;
  const row = el(`<div class="rounded-xl border border-brand/30 bg-brand-light/40 p-3.5">
    <div class="flex items-start gap-3">
      <span class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style="background:${meta.color}18"><i data-lucide="${meta.icon}" class="w-4 h-4" style="color:${meta.color}"></i></span>
      <div class="flex-1 min-w-0">
        <p class="font-600 text-sm leading-snug">${esc(n.title)}</p>
        <p class="text-xs text-ink-soft mt-1 leading-relaxed">${esc(n.body)}</p>
        ${n.href ? `<a href="${esc(n.href)}" target="_blank" rel="noopener" class="inline-block mt-1.5 text-xs font-medium text-brand-dark hover:underline">${esc(n.linkLabel || 'Learn more')}</a>` : ''}
        <p class="text-[11px] text-ink-faint mt-2">${who ? esc(who.name) : 'Whole family'}</p>
      </div>
      <button class="dismiss text-xs font-medium text-brand-dark shrink-0">Dismiss</button>
    </div>
  </div>`);
  const dismiss = row.querySelector('.dismiss');
  dismiss.setAttribute('aria-label', `Dismiss: ${n.title}`);
  dismiss.onclick = () => { store.dismissAlerts([n.key]); rerender(); };
  return row;
}
