import * as store from '../store.js';
import { el, initials, openModal, toast } from '../ui.js';
import { notificationBell } from './notifications.js';
import { openGuide } from './guide.js';

// Storybook Meadow mark: a sun rising over a hill.
export function meadowLogo(size = 34) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 36 36" aria-hidden="true" class="shrink-0">
    <circle cx="18" cy="18" r="18" fill="#bfdcec"/>
    <path d="M18 6.6v2.4M10.4 9.8l1.7 1.7M25.6 9.8l-1.7 1.7" fill="none" stroke="#f2c14e" stroke-width="2" stroke-linecap="round"/>
    <circle cx="18" cy="19" r="7.5" fill="#f2c14e"/>
    <path d="M1.4 25C8 17 27 17 34.1 26A18 18 0 0 1 1.4 25Z" fill="#a9c9a0"/>
    <path d="M4.5 30C12 24.5 24 25 31.5 30.5A18 18 0 0 1 4.5 30Z" fill="#3f6b3b"/>
  </svg>`;
}

const NAV = [
  { name: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
  { name: 'calendar', label: 'Calendar', icon: 'calendar-days' },
  { name: 'graph', label: 'Map', icon: 'map' },
  { name: 'records', label: 'Records', icon: 'notebook-pen' },
  { name: 'insights', label: 'Insights', icon: 'sparkles' },
];

export function renderShell({ route, navigate, content }) {
  const state = store.get();
  const active = store.activeStudent();

  const wrap = el(`<div class="min-h-screen flex flex-col lg:flex-row"></div>`);

  // Sidebar (desktop)
  const side = el(`
    <aside class="hidden lg:flex lg:flex-col w-60 shrink-0 bg-paper-deep sticky top-0 h-screen">
      <div class="px-5 pt-6 pb-4 flex items-center gap-2.5">
        ${meadowLogo(36)}
        <span class="font-display text-[22px] font-600 flex-1">Harrington</span>
        <span id="bell-desktop"></span>
      </div>
      <div class="px-3.5 pb-4" id="student-switch"></div>
      <nav class="px-3.5 flex-1 space-y-1" id="nav-desktop" aria-label="Main"></nav>
      <div class="p-3.5" id="account"></div>
    </aside>`);

  side.querySelector('#bell-desktop').appendChild(notificationBell());
  side.querySelector('#student-switch').appendChild(studentSwitcher(navigate));

  const navD = side.querySelector('#nav-desktop');
  NAV.forEach(item => {
    const on = route.name === item.name;
    const a = el(`<button class="w-full flex items-center gap-3 px-4 h-11 rounded-full text-[14.5px] font-medium text-ink hover:bg-paper-card transition-colors ${on ? 'nav-active' : ''}" ${on ? 'aria-current="page"' : ''}>
      <i data-lucide="${item.icon}" class="w-4.5 h-4.5"></i>${item.label}</button>`);
    a.onclick = () => navigate(item.name);
    navD.appendChild(a);
  });

  // Guide (opens a modal, not a route)
  const guideBtn = el(`<button class="w-full flex items-center gap-3 px-4 h-11 rounded-full text-[14.5px] font-medium text-ink hover:bg-paper-card transition-colors">
    <i data-lucide="book-open" class="w-4.5 h-4.5"></i>Guide</button>`);
  guideBtn.onclick = () => openGuide();
  navD.appendChild(guideBtn);

  side.querySelector('#account').appendChild(accountBox());

  // Top bar (mobile)
  const top = el(`
    <header class="lg:hidden sticky top-0 z-40 bg-paper-deep px-4 py-2.5 flex items-center justify-between">
      <div class="flex items-center gap-2">
        ${meadowLogo(30)}
        <span class="font-display text-lg font-600">Harrington</span>
      </div>
      <div class="flex items-center gap-2">
        <span id="mob-bell"></span>
        <div id="mob-student"></div>
      </div>
    </header>`);
  top.querySelector('#mob-bell').appendChild(notificationBell(true));
  top.querySelector('#mob-student').appendChild(studentSwitcher(navigate, true));

  // Bottom nav (mobile)
  const bottom = el(`<nav class="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-paper-card shadow-[0_-10px_30px_-20px_rgba(94,78,48,0.45)] rounded-t-3xl px-2 pt-2 pb-3 grid grid-cols-5 gap-1" aria-label="Main"></nav>`);
  NAV.forEach(item => {
    const on = route.name === item.name;
    const b = el(`<button class="flex flex-col items-center gap-1 pt-1.5 pb-1 text-[11px] font-medium ${on ? 'text-ink' : 'text-ink-faint'}" ${on ? 'aria-current="page"' : ''}>
      <span class="w-12 h-8 rounded-full flex items-center justify-center ${on ? 'bg-sage' : ''}"><i data-lucide="${item.icon}" class="w-5 h-5"></i></span>${item.label}</button>`);
    b.onclick = () => navigate(item.name);
    bottom.appendChild(b);
  });

  const main = el(`<div class="flex-1 min-w-0 flex flex-col"></div>`);
  main.appendChild(top);
  const scroll = el(`<div class="flex-1 pb-24 lg:pb-0"></div>`);
  scroll.appendChild(el(`<div class="bg-butter-light px-4 py-2 text-center text-xs text-[#6b4d0e]">
    Self-hosted preview · family data stays on this server · AI and shared-family features are not connected yet
  </div>`));
  scroll.appendChild(content);
  main.appendChild(scroll);
  main.appendChild(bottom);

  wrap.appendChild(side);
  wrap.appendChild(main);
  return wrap;
}

function studentSwitcher(navigate, compact = false) {
  const state = store.get();
  const active = store.activeStudent();
  const btn = el(`
    <button class="w-full flex items-center gap-2.5 ${compact ? 'p-1 pr-2' : 'p-1.5 pr-3'} rounded-full bg-paper-card shadow-[0_0_0_2px_#f2c14e] hover:shadow-[0_0_0_3px_#f2c14e] transition-shadow" aria-label="Switch learner">
      <span class="${compact ? 'w-8 h-8 text-sm' : 'w-9 h-9 text-base'} rounded-full flex items-center justify-center text-white font-display font-600 shrink-0" style="background:${active?.color || '#6f665a'}">${active ? initials(active.name) : '?'}</span>
      ${compact ? '' : `<span class="flex-1 text-left min-w-0"><span class="block text-sm font-600 truncate">${active ? active.name : 'No student'}</span><span class="block text-xs text-ink-faint">${active ? 'Age ' + store.studentAge(active) : 'Add a student'}</span></span>`}
      <i data-lucide="chevrons-up-down" class="w-4 h-4 text-ink-faint shrink-0"></i>
    </button>`);
  btn.onclick = () => openStudentMenu(navigate);
  return btn;
}

function openStudentMenu(navigate) {
  const state = store.get();
  const body = el(`<div class="p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-display text-lg font-600">Students</h3>
      <button id="add" class="text-sm font-medium text-brand-dark flex items-center gap-1"><i data-lucide="plus" class="w-4 h-4"></i>Add</button>
    </div>
    <div id="list" class="space-y-2"></div>
  </div>`);
  const list = body.querySelector('#list');
  state.students.forEach(s => {
    const age = store.studentAge(s);
    const isActive = s.id === state.activeStudentId;
    const row = el(`<div class="flex items-center gap-3 p-2 pr-3 rounded-full ${isActive ? 'bg-brand-light shadow-[0_0_0_2px_#f2c14e]' : 'bg-paper'}">
      <span class="w-10 h-10 rounded-full flex items-center justify-center text-white font-display text-base font-600" style="background:${s.color}">${initials(s.name)}</span>
      <div class="flex-1 min-w-0">
        <p class="font-600 text-sm truncate">${s.name}</p>
        <p class="text-xs text-ink-faint">Age ${age} · born ${s.birthYear}</p>
      </div>
      ${isActive ? '<span class="text-xs font-medium text-brand-dark px-2 py-0.5 rounded-full bg-brand/10">Active</span>' : '<button class="select text-xs font-medium text-brand px-3 py-1.5 rounded-full bg-paper-card hover:bg-brand-light">Switch</button>'}
      <button class="del text-ink-faint hover:text-[#a4473a] p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
    </div>`);
    row.querySelector('.select')?.addEventListener('click', () => { store.setActiveStudent(s.id); m.close(); toast('Switched to ' + s.name); });
    row.querySelector('.del').addEventListener('click', () => {
      if (confirm(`Remove ${s.name}? This deletes their progress and records.`)) { store.removeStudent(s.id); m.close(); }
    });
    list.appendChild(row);
  });
  body.querySelector('#add').onclick = () => { m.close(); openAddStudent(); };
  const m = openModal(body);
}

function openAddStudent() {
  const body = el(`<div class="p-5">
    <h3 class="font-display text-lg font-600 mb-4">Add a student</h3>
    <form id="f" class="space-y-4">
      <div>
        <label class="text-sm font-medium block mb-1.5">Name</label>
        <input name="name" required class="w-full px-3.5 py-2.5 rounded-full border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
      </div>
      <div>
        <label class="text-sm font-medium block mb-1.5">Birth year</label>
        <input name="birthYear" type="number" min="2005" max="2024" required class="w-full px-3.5 py-2.5 rounded-full border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
      </div>
      <button class="w-full px-4 h-12 rounded-full bg-brand hover:bg-brand-dark text-white font-medium transition-colors">Add student</button>
    </form>
  </div>`);
  body.querySelector('#f').onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    store.addStudent(fd.get('name').trim(), parseInt(fd.get('birthYear'), 10));
    toast('Student added', 'success');
    m.close();
  };
  const m = openModal(body);
}

function accountBox() {
  const box = el(`<div class="flex items-center gap-2.5 rounded-3xl bg-paper-card p-3">
    <div class="w-9 h-9 rounded-full bg-sage-light flex items-center justify-center">
      <i data-lucide="house" class="w-4 h-4 text-brand"></i>
    </div>
    <div class="flex-1 min-w-0">
      <p class="text-xs font-600 truncate">Private family space</p>
      <p class="text-xs text-ink-faint">Saved by Harrington</p>
    </div>
  </div>`);
  return box;
}
