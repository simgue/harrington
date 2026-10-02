import * as store from '../store.js';
import { el, esc, initials, openModal, refreshIcons, toast } from '../ui.js';
import { notificationBell } from './notifications.js';
import { openGuide } from './guide.js';
import { openPlacement } from './placement.js';

// Storybook Meadow mark: a sun rising over a hill.
function meadowLogo(size = 34) {
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
        <button id="mob-guide" class="w-9 h-9 rounded-lg border border-paper-line bg-paper-card hover:border-brand/40 transition-colors flex items-center justify-center" title="Guide" aria-label="Open the guide"><i data-lucide="book-open" class="w-4.5 h-4.5 text-ink-soft"></i></button>
        <span id="mob-bell"></span>
        <div id="mob-student"></div>
      </div>
    </header>`);
  top.querySelector('#mob-guide').onclick = () => openGuide();
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
      <span class="${compact ? 'w-8 h-8 text-sm' : 'w-9 h-9 text-base'} rounded-full flex items-center justify-center text-white font-display font-600 shrink-0" style="background:${esc(active?.color || '#6f665a')}">${esc(active ? initials(active.name) : '?')}</span>
      ${compact ? '' : `<span class="flex-1 text-left min-w-0"><span class="block text-sm font-600 truncate">${esc(active ? active.name : 'No student')}</span><span class="block text-xs text-ink-faint">${active ? 'Age ' + store.studentAge(active) : 'Add a student'}</span></span>`}
      <i data-lucide="chevrons-up-down" class="w-4 h-4 text-ink-faint shrink-0"></i>
    </button>`);
  btn.onclick = () => openStudentMenu(navigate);
  return btn;
}

// 40px tap targets on a phone; the same 24px icons as before on a desktop.
const rowIconCls = 'w-10 h-10 lg:w-6 lg:h-6 rounded-full flex items-center justify-center text-ink-faint';

function openStudentMenu(navigate) {
  const state = store.get();
  const body = el(`<div class="p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-display text-lg font-600">Students</h3>
      <button id="add" class="text-sm font-medium text-brand-dark flex items-center gap-1"><i data-lucide="plus" class="w-4 h-4"></i>Add</button>
    </div>
    <div id="list" class="space-y-2"></div>
    <div class="lg:hidden mt-5 pt-4 border-t border-paper-line">
      <p class="text-xs font-600 text-ink-soft mb-2">Family data</p>
      <div class="grid grid-cols-2 gap-2">
        <button id="m-export" class="flex items-center justify-center gap-1.5 h-11 rounded-full bg-paper text-sm font-medium text-ink hover:bg-paper-deep transition-colors" title="Export family data">
          <i data-lucide="download" class="w-4 h-4"></i>Export</button>
        <button id="m-import" class="flex items-center justify-center gap-1.5 h-11 rounded-full bg-paper text-sm font-medium text-ink hover:bg-paper-deep transition-colors" title="Import family data">
          <i data-lucide="upload" class="w-4 h-4"></i>Import</button>
      </div>
    </div>
  </div>`);
  const list = body.querySelector('#list');
  state.students.forEach(s => {
    const age = store.studentAge(s);
    const isActive = s.id === state.activeStudentId;
    const row = el(`<div class="flex items-center gap-2 lg:gap-3 p-2 pr-2 lg:pr-3 rounded-full ${isActive ? 'bg-brand-light shadow-[0_0_0_2px_#f2c14e]' : 'bg-paper'}">
      <span class="w-10 h-10 rounded-full flex items-center justify-center text-white font-display text-base font-600" style="background:${esc(s.color)}">${esc(initials(s.name))}</span>
      <div class="flex-1 min-w-0">
        <p class="font-600 text-sm truncate">${esc(s.name)}</p>
        <p class="text-xs text-ink-faint">Age ${age} · born ${bornLabel(s)}</p>
      </div>
      ${isActive ? '<span class="text-xs font-medium text-brand-dark px-2 py-0.5 rounded-full bg-brand/10">Active</span>' : '<button class="select text-xs font-medium text-brand px-3 py-1.5 rounded-full bg-paper-card hover:bg-brand-light">Switch</button>'}
      <div class="flex items-center shrink-0 lg:gap-3">
        <button class="place ${rowIconCls} hover:text-brand-dark" title="Placement: mark earlier topics mastered" aria-label="Placement for ${esc(s.name)}"><i data-lucide="list-checks" class="w-4 h-4"></i></button>
        <button class="edit ${rowIconCls} hover:text-brand-dark" title="Edit learner" aria-label="Edit ${esc(s.name)}"><i data-lucide="pencil" class="w-4 h-4"></i></button>
        <button class="del ${rowIconCls} hover:text-[#a4473a]" title="Remove learner" aria-label="Remove learner ${esc(s.name)}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
      </div>
    </div>`);
    row.querySelector('.place').addEventListener('click', () => { m.close(); openPlacement(s); });
    row.querySelector('.edit').addEventListener('click', () => { m.close(); openEditStudent(s); });
    row.querySelector('.select')?.addEventListener('click', () => { store.setActiveStudent(s.id); m.close(); toast('Switched to ' + s.name); });
    row.querySelector('.del').addEventListener('click', () => {
      if (confirm(`Remove ${s.name}? This deletes their progress and records.`)) { store.removeStudent(s.id); m.close(); }
    });
    list.appendChild(row);
  });
  body.querySelector('#add').onclick = () => { m.close(); openAddStudent(); };
  // Phones have no sidebar, so Export and Import live here below lg.
  body.querySelector('#m-export').onclick = () => { m.close(); exportFamilyData(); };
  body.querySelector('#m-import').onclick = () => { m.close(); pickImportFile(); };
  const m = openModal(body);
}

function bornLabel(s) {
  const month = store.MONTHS[s.birthMonth - 1];
  return Number.isInteger(s.birthMonth) && month ? `${month} ${s.birthYear}` : String(s.birthYear);
}

const inputCls = 'w-full px-3.5 py-2.5 rounded-full border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand';

// Name, birth month and year, and (when editing) avatar color. Shared by the
// Add and Edit forms; read back with readStudentForm().
function studentFields(s = null) {
  const year = new Date().getFullYear();
  const months = store.MONTHS.map((label, i) =>
    `<option value="${i + 1}" ${s?.birthMonth === i + 1 ? 'selected' : ''}>${label}</option>`).join('');
  const colors = s ? `<fieldset>
      <legend class="text-sm font-medium block mb-1.5">Color</legend>
      <div class="flex flex-wrap gap-2.5">${store.PALETTE.map((c, i) => `
        <label class="cursor-pointer">
          <input type="radio" name="color" value="${c}" class="sr-only peer" ${c === s.color ? 'checked' : ''} />
          <span class="block w-9 h-9 rounded-full peer-checked:shadow-[0_0_0_3px_#fffdf8,0_0_0_5px_#f2c14e] peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40" style="background:${c}" title="Color ${i + 1}"></span>
          <span class="sr-only">Color ${i + 1}</span>
        </label>`).join('')}
      </div>
    </fieldset>` : '';
  return `
      <div>
        <label for="sf-name" class="text-sm font-medium block mb-1.5">Name</label>
        <input id="sf-name" name="name" required maxlength="60" value="${esc(s?.name || '')}" class="${inputCls}" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="sf-month" class="text-sm font-medium block mb-1.5">Birth month <span class="text-ink-faint font-normal">(optional)</span></label>
          <select id="sf-month" name="birthMonth" class="${inputCls}"><option value="">Not set</option>${months}</select>
        </div>
        <div>
          <label for="sf-year" class="text-sm font-medium block mb-1.5">Birth year</label>
          <input id="sf-year" name="birthYear" type="number" min="${store.MIN_BIRTH_YEAR}" max="${year}" required value="${s?.birthYear ?? ''}" class="${inputCls}" />
        </div>
      </div>
      <p class="text-xs text-ink-faint -mt-2">The month makes the age exact; without it, age counts from January.</p>
      ${colors}`;
}

function readStudentForm(form) {
  const fd = new FormData(form);
  return {
    name: String(fd.get('name') || '').trim(),
    birthYear: parseInt(fd.get('birthYear'), 10),
    birthMonth: parseInt(fd.get('birthMonth'), 10) || null,
    color: fd.get('color') || undefined,
  };
}

function openAddStudent() {
  const body = el(`<div class="p-5">
    <h3 class="font-display text-lg font-600 mb-4">Add a student</h3>
    <form id="f" class="space-y-4">
      ${studentFields()}
      <button class="w-full px-4 h-12 rounded-full bg-brand hover:bg-brand-dark text-white font-medium transition-colors">Add student</button>
    </form>
  </div>`);
  body.querySelector('#f').onsubmit = e => {
    e.preventDefault();
    const v = readStudentForm(e.target);
    if (!v.name || !v.birthYear) return;
    store.addStudent(v.name, v.birthYear, v.birthMonth);
    toast('Student added', 'success');
    m.close();
  };
  const m = openModal(body);
}

function openEditStudent(s) {
  const body = el(`<div class="p-5">
    <h3 class="font-display text-lg font-600 mb-4">Edit learner</h3>
    <form id="f" class="space-y-4">
      ${studentFields(s)}
      <div class="flex gap-2 justify-end pt-1">
        <button type="button" id="cancel" class="px-4 h-11 rounded-full bg-paper text-sm font-medium">Cancel</button>
        <button class="px-5 h-11 rounded-full bg-brand hover:bg-brand-dark text-white text-sm font-medium transition-colors">Save changes</button>
      </div>
    </form>
  </div>`);
  body.querySelector('#cancel').onclick = () => m.dismiss();
  body.querySelector('#f').onsubmit = e => {
    e.preventDefault();
    const v = readStudentForm(e.target);
    if (!v.name || !v.birthYear) return;
    m.close();
    if (store.updateStudent(s.id, v)) toast('Learner updated', 'success');
    else toast('That learner is no longer here', 'error');
  };
  const m = openModal(body);
  body.querySelector('#sf-name').focus();
}

function accountBox() {
  const box = el(`<div class="rounded-3xl bg-paper-card p-3">
    <div class="flex items-center gap-2.5">
      <div class="w-9 h-9 rounded-full bg-sage-light flex items-center justify-center">
        <i data-lucide="house" class="w-4 h-4 text-brand"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-xs font-600 truncate">Private family space</p>
        <p class="text-xs text-ink-faint">Saved by Harrington</p>
      </div>
    </div>
    <div class="mt-2.5 grid grid-cols-2 gap-1.5">
      <button id="export" class="flex items-center justify-center gap-1.5 h-8 rounded-full bg-paper text-xs font-medium text-ink hover:bg-paper-deep transition-colors" title="Export family data">
        <i data-lucide="download" class="w-3.5 h-3.5"></i>Export</button>
      <button id="import" class="flex items-center justify-center gap-1.5 h-8 rounded-full bg-paper text-xs font-medium text-ink hover:bg-paper-deep transition-colors" title="Import family data">
        <i data-lucide="upload" class="w-3.5 h-3.5"></i>Import</button>
    </div>
  </div>`);
  box.querySelector('#export').onclick = exportFamilyData;
  box.querySelector('#import').onclick = pickImportFile;
  return box;
}

// ---- Family data: export, import, and save problems ----
function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function exportFamilyData() {
  try {
    const doc = await store.exportDocument();
    const blob = new Blob([`${JSON.stringify(doc, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `harrington-family-${localDateKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Family data exported', 'success');
  } catch (e) {
    console.warn('export failed', e);
    toast('Could not export family data', 'error');
  }
}

function pickImportFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    let doc;
    try {
      doc = JSON.parse(await file.text());
    } catch {
      toast('That file is not valid JSON', 'error');
      return;
    }
    const check = store.inspectImport(doc);
    if (!check.ok) { toast(check.error, 'error'); return; }
    openImportPreview(doc, check.learners);
  };
  input.click();
}

function openImportPreview(doc, learners) {
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const body = el(`<div class="p-5">
    <h3 class="font-display text-lg font-600 mb-1">Import family data?</h3>
    <p class="text-sm text-ink-faint mb-4">This replaces all family data on this server with the file${doc.exportedAt ? ` exported ${esc(new Date(doc.exportedAt).toLocaleString())}` : ''}. Recordings are not part of the file.</p>
    <div id="learners" class="space-y-2 mb-5"></div>
    <div class="flex gap-2 justify-end">
      <button id="cancel" class="px-4 h-10 rounded-full bg-paper text-sm font-medium">Cancel</button>
      <button id="confirm" class="px-4 h-10 rounded-full bg-brand hover:bg-brand-dark text-white text-sm font-medium transition-colors">Replace family data</button>
    </div>
  </div>`);
  const list = body.querySelector('#learners');
  if (!learners.length) list.appendChild(el(`<p class="text-sm text-ink-faint">The file has no learners.</p>`));
  learners.forEach(l => {
    list.appendChild(el(`<div class="flex items-center justify-between gap-3 px-3 py-2 rounded-2xl bg-paper">
      <span class="text-sm font-600 truncate">${esc(l.name)}</span>
      <span class="text-xs text-ink-faint shrink-0">${plural(l.topics, 'topic')} · ${plural(l.records, 'record')} · ${plural(l.tests, 'test')}</span>
    </div>`));
  });
  body.querySelector('#cancel').onclick = () => m.close();
  body.querySelector('#confirm').onclick = async (e) => {
    e.currentTarget.disabled = true;
    const ok = await store.importDocument(doc).catch(() => false);
    m.close();
    if (ok) toast('Family data imported', 'success');
    else toast('Import did not finish. Check the latest data and try again.', 'error');
  };
  const m = openModal(body);
}

let tooLargeBanner = null;
let retryToast = null;

function clearSaveProblems() {
  tooLargeBanner?.remove(); tooLargeBanner = null;
  retryToast?.remove(); retryToast = null;
}

function showTooLarge() {
  if (tooLargeBanner) return;
  tooLargeBanner = el(`<div role="alert" class="fixed top-0 inset-x-0 z-[98] bg-[#a4473a] text-white px-4 py-2.5 text-sm font-medium text-center flex items-center justify-center gap-2">
    <i data-lucide="triangle-alert" class="w-4 h-4 shrink-0"></i>
    <span>Family data is too large to save. Recent changes are not being saved; export a copy and remove old records.</span>
  </div>`);
  document.body.appendChild(tooLargeBanner);
  refreshIcons();
}

function showRetry() {
  if (retryToast) return;
  const root = document.getElementById('toast-root');
  if (!root) return;
  retryToast = el(`<div role="alert" class="px-4 py-2.5 rounded-lg text-sm font-medium bg-[#a4473a] text-white shadow-lg flex items-center gap-3">
    <span>Could not save changes to Harrington.</span>
    <button class="underline font-600">Retry</button>
  </div>`);
  retryToast.querySelector('button').onclick = () => {
    retryToast?.remove(); retryToast = null;
    store.flushSaves();
  };
  root.appendChild(retryToast);
}

store.onSaveStatus(({ type }) => {
  if (typeof document === 'undefined') return;
  if (type === 'saved') clearSaveProblems();
  else if (type === 'conflict') { clearSaveProblems(); toast('Another device saved changes. Reloaded the latest.'); }
  else if (type === 'too-large') showTooLarge();
  else if (type === 'failed') showRetry();
});
