// Level-set workbook (HAR-24): per learner and lane, a "Can they…?" sheet at
// a time; the parent marks each topic Yes, Not yet or Unsure, and the walk
// (src/js/levelset.js) finds where to start. Yes marks mastery through a
// placement record, so Records can undo it. Parent view only.
import { getData, topicAge, hardPrereqs, orderTopics } from '../data.js';
import * as store from '../store.js';
import { LANES } from '../daily.js';
import { el, esc, refreshIcons, toast } from '../ui.js';
import * as ls from '../levelset.js';

// A sitting runs while the parent keeps answering, per learner and lane:
// key -> { start, base, last }, where base is the time saved before this
// sitting. Half an hour without an answer starts a new sitting.
const sittings = new Map();
const IDLE_MS = 30 * 60000;
let clockTimer = null;

function makeCtx(studentId, lane) {
  const d = getData();
  // Sheets list topics by the lane's domains, then in learning order.
  const rank = (t) => lane.domains.indexOf(t.domain);
  const topics = orderTopics(ls.laneTopics(d.topics, lane)).sort((a, b) => rank(a) - rank(b));
  return {
    topics, levels: ls.laneLevels(topics, topicAge), topicAge, hardPrereqs,
    mastered: (id) => store.statusOf(studentId, id) === 'mastered',
  };
}

function sittingFor(studentId, laneKey, session) {
  const key = `${studentId}|${laneKey}`;
  const now = Date.now();
  const cur = sittings.get(key);
  if (!cur || now - cur.last > IDLE_MS) sittings.set(key, { start: now, base: session ? session.elapsedMs || 0 : 0, last: now });
  return sittings.get(key);
}

export function renderLevelset(params, { navigate }) {
  const d = getData();
  const student = store.get().students.find(s => s.id === params.id) || store.activeStudent();
  const root = el(`<div class="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);
  if (!student) { root.appendChild(el(`<p class="text-ink-soft">Add a student first.</p>`)); return root; }
  const saved = store.levelsetFor(student.id).lane;
  const laneSel = LANES[saved] ? saved : 'literacy';
  const lane = LANES[laneSel];
  const ctx = makeCtx(student.id, lane);
  let session = store.levelsetSession(student.id, laneSel);
  // A session from an older sheet layout, or one whose walk can move on.
  if (session) {
    const moved = ls.advance(ctx, session);
    if (moved !== session) { session = moved; store.saveLevelsetSession(student.id, laneSel, session, { quiet: true }); }
  }

  root.appendChild(el(`<div class="mb-5">
    <p class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-1">Parent view</p>
    <h1 class="font-display text-2xl sm:text-3xl font-600">Level-set workbook</h1>
    <p class="text-ink-soft text-sm mt-1 leading-relaxed">Find where <span class="font-600 text-ink">${esc(student.name)}</span> is in reading and number, one short sheet at a time. Mark each topic <b>Yes</b> if you have seen them do it, <b>Not yet</b> if not, or <b>Unsure</b> to check it later by watching. Yes also marks what that topic builds on. Each saved sheet is one record you can undo.</p>
  </div>`));

  // Lane tabs
  const tabs = el(`<div class="flex gap-2 mb-4" role="tablist" aria-label="Lane"></div>`);
  Object.entries(LANES).forEach(([key, l]) => {
    const on = key === laneSel;
    const s = store.levelsetSession(student.id, key);
    const badge = s ? (s.done ? 'done' : `sheet ${s.sheets.length}`) : 'not started';
    const b = el(`<button role="tab" aria-selected="${on}" class="flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium border ${on ? 'bg-ink text-white border-transparent' : 'bg-paper-card text-ink-soft border-paper-line'}"><i data-lucide="${l.icon}" class="w-4 h-4"></i>${esc(l.label)}<span class="text-xs ${on ? 'text-white/70' : 'text-ink-faint'}">${badge}</span></button>`);
    b.onclick = () => { if (!on) store.setLevelsetLane(student.id, key); };
    tabs.appendChild(b);
  });
  root.appendChild(tabs);

  if (!session) {
    const start = ls.startLevel(store.studentAge(student), ctx.levels);
    const card = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5">
      <h2 class="font-600 mb-1">${esc(lane.label)}</h2>
      <p class="text-sm text-ink-soft leading-relaxed mb-4">Starts with the age ${start} topics in ${esc(lane.domains.join(', '))}, then moves up or down depending on your answers. About twenty minutes a sitting; stop whenever you like and pick up where you left off.</p>
      <button id="ls-start" class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium text-sm"><i data-lucide="play" class="w-4 h-4"></i>Start the ${esc(lane.label.toLowerCase())} workbook</button>
    </div>`);
    card.querySelector('#ls-start').onclick = () => {
      const s = ls.advance(ctx, ls.newSession(laneSel, { age: store.studentAge(student), levels: ctx.levels }));
      sittings.set(`${student.id}|${laneSel}`, { start: Date.now(), base: 0, last: Date.now() });
      store.saveLevelsetSession(student.id, laneSel, s);
    };
    root.appendChild(card);
    root.appendChild(queueCard(student, navigate));
    refreshIcons();
    return root;
  }

  const sitting = sittingFor(student.id, laneSel, session);
  root.appendChild(clockBar(sitting));

  if (session.done) root.appendChild(frontierCard(student, lane, session, navigate));
  else root.appendChild(sheetCard(student, lane, session, sitting, d));

  root.appendChild(historyCard(student, lane, session));
  root.appendChild(queueCard(student, navigate));

  const over = el(`<button class="mt-4 text-sm text-ink-faint hover:text-[#a4473a] flex items-center gap-1.5"><i data-lucide="rotate-ccw" class="w-4 h-4"></i>Start the ${esc(lane.label.toLowerCase())} workbook over</button>`);
  over.onclick = () => {
    if (!confirm(`Start the ${lane.label.toLowerCase()} workbook over? Topics it already marked mastered stay mastered; undo them from Records if you want.`)) return;
    sittings.delete(`${student.id}|${laneSel}`);
    store.saveLevelsetSession(student.id, laneSel, null);
  };
  root.appendChild(over);
  refreshIcons();
  return root;
}

// Elapsed time this sitting, and a gentle pause suggestion at twenty minutes.
function clockBar(sitting) {
  const bar = el(`<div class="ls-clock flex items-center gap-2 text-xs text-ink-soft mb-4" aria-live="polite"></div>`);
  const paint = () => {
    const n = ls.sittingNotice(Date.now() - sitting.start);
    const total = ls.sittingNotice(sitting.base + (Date.now() - sitting.start)).minutes;
    bar.innerHTML = `<i data-lucide="timer" class="w-4 h-4"></i><span>This sitting: ${n.minutes} min${total > n.minutes ? ` · all sittings: ${total} min` : ''}</span>`
      + (n.pause ? `<span class="ml-2 px-2.5 py-1 rounded-full bg-[#fbecc4] text-[#6b4d0e] font-medium">About ${ls.SITTING_MINUTES} minutes: a good moment to pause. Your answers are saved.</span>` : '');
    refreshIcons();
  };
  paint();
  clearInterval(clockTimer);
  clockTimer = setInterval(() => { if (!bar.isConnected) { clearInterval(clockTimer); return; } paint(); }, 15000);
  return bar;
}

function sheetCard(student, lane, session, sitting, d) {
  const index = session.sheets.length - 1;
  const sheet = session.sheets[index];
  const rows = ls.sheetRows(d.byId, sheet.ids, { name: student.name });
  const card = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5">
    <div class="flex items-start justify-between gap-3 mb-1">
      <h2 class="font-600">${esc(ls.sheetTitle(sheet, lane.label))}</h2>
      <button id="ls-print" class="shrink-0 flex items-center gap-1.5 text-sm font-medium text-brand-dark"><i data-lucide="printer" class="w-4 h-4"></i>Print this sheet</button>
    </div>
    <p class="text-xs text-ink-faint mb-4">${sheet.kind === 'foundations'
      ? 'What the Not yet topics build on. Answer these to find where to start.'
      : `${rows.length} topic${rows.length === 1 ? '' : 's'}. Can they…? Answer from what you have seen.`}</p>
    <div class="ls-rows space-y-2.5"></div>
    <p class="ls-left text-xs text-ink-faint mt-3"></p>
    <button id="ls-save" class="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"><i data-lucide="check" class="w-4 h-4"></i>Save this sheet and continue</button>
  </div>`);
  const list = card.querySelector('.ls-rows');
  const left = card.querySelector('.ls-left');
  const save = card.querySelector('#ls-save');
  const refresh = () => {
    const n = sheet.ids.filter(id => !session.answers[id]).length;
    save.disabled = n > 0;
    left.textContent = n ? `${n} still to answer.` : 'All answered.';
  };

  rows.forEach(row => {
    const r = el(`<div class="rounded-xl border border-paper-line bg-paper p-3.5">
      <p class="font-600 text-sm">${esc(row.name)}</p>
      <p class="text-[11px] text-ink-faint">${esc(row.domain)}</p>
      ${row.prompts.length ? `<ul class="mt-1.5 space-y-0.5">${row.prompts.map(p => `<li class="text-sm text-ink-soft leading-snug">${esc(p)}</li>`).join('')}</ul>` : ''}
      <div class="flex flex-wrap gap-1.5 mt-2.5" role="radiogroup" aria-label="${esc(row.name)}"></div>
    </div>`);
    const group = r.querySelector('[role="radiogroup"]');
    const buttons = Object.entries(ls.ANSWERS).map(([key, a]) => {
      const b = el(`<button role="radio" class="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium"><i data-lucide="${a.icon}" class="w-3.5 h-3.5"></i>${a.label}</button>`);
      b.dataset.answer = key;
      b.onclick = () => {
        session = ls.setAnswer(session, row.id, key);
        sitting.last = Date.now();
        session = { ...session, elapsedMs: sitting.base + (sitting.last - sitting.start) };
        store.saveLevelsetSession(student.id, session.lane, session, { quiet: true });
        paintButtons();
        refresh();
      };
      group.appendChild(b);
      return b;
    });
    const paintButtons = () => buttons.forEach(b => {
      const on = session.answers[row.id] === b.dataset.answer;
      b.setAttribute('aria-checked', String(on));
      b.className = `flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${on ? 'bg-ink text-white border-transparent' : 'bg-paper-card text-ink-soft border-paper-line hover:border-ink-faint/40'}`;
    });
    paintButtons();
    list.appendChild(r);
  });
  refresh();

  card.querySelector('#ls-print').onclick = () => printSheet(student, lane, sheet, rows);
  let saving = false;
  save.onclick = () => {
    if (saving || !ls.sheetComplete(session)) return;
    saving = true;
    const ctx = makeCtx(student.id, lane);
    const effects = ls.sheetEffects(ctx, session);
    if (effects.unsure.length) store.queueObservation(student.id, effects.unsure, { quiet: true });
    let recordId = null;
    if (effects.master.length) {
      const rec = store.applyPlacement(student.id, {
        topicIds: effects.master,
        title: ls.levelsetTitle({ count: effects.master.length, own: effects.own, laneLabel: lane.label, sheet }),
        subject: lane.subject, domain: null, maxAge: sheet.level,
        levelset: { lane: session.lane, sheet: index },
      });
      recordId = rec ? rec.id : null;
    }
    // The marks just made count as mastered for the next sheet.
    const next = ls.completeSheet(makeCtx(student.id, lane), session, { recordId });
    store.saveLevelsetSession(student.id, session.lane, { ...next, elapsedMs: sitting.base + (Date.now() - sitting.start) });
    const n = effects.master.length;
    toast(n ? `Sheet saved: ${n} topic${n === 1 ? '' : 's'} marked mastered. Undo it from Records.` : 'Sheet saved.', 'success');
  };
  return card;
}

function frontierCard(student, lane, session, navigate) {
  const d = getData();
  const f = session.frontier || { level: null, ids: [], unsure: [] };
  const card = el(`<div class="bg-paper-card border border-brand/30 rounded-2xl p-5">
    <h2 class="font-600 flex items-center gap-2 mb-1"><i data-lucide="flag" class="w-4.5 h-4.5 text-brand-dark"></i>${esc(lane.label)}: start here</h2>
    <p class="text-sm text-ink-soft mb-3">${f.ids.length
      ? `The workbook is done. These ${lane.label.toLowerCase()} topics are next for ${esc(student.name)}: their foundations are in place, and you marked them Not yet.`
      : `The workbook is done. You marked every ${lane.label.toLowerCase()} topic it asked about as known, so there is no gap to start from here. The map and Today’s path pick up from what is now mastered.`}</p>
    <div class="ls-front space-y-1.5"></div>
  </div>`);
  const list = card.querySelector('.ls-front');
  f.ids.map(id => d.byId.get(id)).filter(Boolean).forEach(t => {
    const row = el(`<button class="w-full text-left flex items-center gap-2.5 p-2.5 rounded-lg border border-paper-line bg-paper hover:border-brand/40 text-sm">
      <i data-lucide="sprout" class="w-4 h-4 text-brand-dark shrink-0"></i><span class="flex-1 min-w-0 truncate">${esc(t.name)}</span><span class="text-xs text-ink-faint shrink-0">${esc(t.domain)} · age ${topicAge(t)}</span>
    </button>`);
    row.onclick = () => navigate('topic', { id: t.id });
    list.appendChild(row);
  });
  return card;
}

function historyCard(student, lane, session) {
  const saved = session.sheets.map((s, i) => ({ s, i })).filter(x => x.s.savedAt);
  const wrap = el(`<div class="mt-5"></div>`);
  if (!saved.length) return wrap;
  wrap.appendChild(el(`<h2 class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-2">Saved sheets</h2>`));
  const list = el(`<div class="space-y-2"></div>`);
  const records = store.recordsFor(student.id);
  saved.forEach(({ s, i }) => {
    const count = (a) => s.ids.filter(id => session.answers[id] === a).length;
    const rec = s.recordId ? records.find(r => r.id === s.recordId) : null;
    const undone = rec && rec.placement && rec.placement.undoneAt;
    const row = el(`<div class="flex items-center gap-3 p-3 rounded-xl border border-paper-line bg-paper-card text-sm">
      <span class="flex-1 min-w-0"><span class="block font-medium">${esc(ls.sheetTitle(s, lane.label))}</span>
      <span class="block text-xs text-ink-faint">${count('yes')} Yes · ${count('no')} Not yet · ${count('unsure')} Unsure${undone ? ' · marks undone in Records' : ''}</span></span>
      <button class="reopen shrink-0 text-xs font-medium text-brand-dark flex items-center gap-1"><i data-lucide="undo-2" class="w-3.5 h-3.5"></i>Change answers</button>
    </div>`);
    row.querySelector('.reopen').onclick = () => {
      const later = saved.filter(x => x.i > i).length;
      if (!confirm(`Change your answers on this sheet? What it marked mastered is undone${later ? `, and the ${later} sheet${later === 1 ? '' : 's'} after it ${later === 1 ? 'is' : 'are'} undone and removed` : ''}.`)) return;
      const { session: reopened, recordIds } = ls.reopenSheet(session, i);
      recordIds.forEach(id => store.undoPlacement(student.id, id));
      const unsure = session.sheets.slice(i).flatMap(x => x.ids).filter(id => session.answers[id] === 'unsure');
      if (unsure.length) store.unqueueObservation(student.id, unsure, { quiet: true });
      store.saveLevelsetSession(student.id, session.lane, reopened);
      toast('Sheet open again. Its marks were undone.', 'success');
    };
    list.appendChild(row);
  });
  wrap.appendChild(list);
  return wrap;
}

// Topics marked Unsure, waiting for an observation check on their topic page.
function queueCard(student, navigate) {
  const d = getData();
  const queued = store.levelsetFor(student.id).observe.map(id => d.byId.get(id)).filter(Boolean);
  const wrap = el(`<div class="mt-5"></div>`);
  if (!queued.length) return wrap;
  wrap.appendChild(el(`<h2 class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-1">Waiting for an observation check</h2>`));
  wrap.appendChild(el(`<p class="text-xs text-ink-soft mb-2">You marked these Unsure. Open one and use “Check mastery by observation” while you watch.</p>`));
  const list = el(`<div class="space-y-1.5"></div>`);
  queued.forEach(t => {
    const row = el(`<button class="w-full text-left flex items-center gap-2.5 p-2.5 rounded-lg border border-paper-line bg-paper-card hover:border-brand/40 text-sm">
      <i data-lucide="eye" class="w-4 h-4 text-[#8a6412] shrink-0"></i><span class="flex-1 min-w-0 truncate">${esc(t.name)}</span><span class="text-xs text-ink-faint shrink-0">${esc(t.subject)} · age ${topicAge(t)}</span>
    </button>`);
    row.onclick = () => navigate('topic', { id: t.id });
    list.appendChild(row);
  });
  wrap.appendChild(list);
  return wrap;
}

// A print-friendly copy of the current sheet: tick boxes to fill in by hand.
function printSheet(student, lane, sheet, rows) {
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print', 'error'); return; }
  const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const body = rows.map(r => `<div class="row">
    <div class="t">${e(r.name)} <span class="d">${e(r.domain)}</span></div>
    ${r.prompts.map(p => `<div class="p">${e(p)}</div>`).join('')}
    <div class="a"><span>&#9744; Yes</span><span>&#9744; Not yet</span><span>&#9744; Unsure</span></div>
  </div>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${e(ls.sheetTitle(sheet, lane.label))}</title>
  <style>
    body{font-family:Georgia,'Times New Roman',serif;color:#2e2a24;max-width:780px;margin:0 auto;padding:40px 48px;line-height:1.45}
    h1{font-size:22px;margin:0 0 4px} .sub{color:#6b665d;font-size:13px;margin-bottom:18px}
    .row{border-bottom:1px solid #e6dfd0;padding:10px 0;break-inside:avoid}
    .t{font-weight:700;font-size:15px} .d{font-weight:400;color:#6b665d;font-size:12px;margin-left:6px}
    .p{font-size:14px;margin-top:2px} .a{margin-top:6px;font-size:14px;display:flex;gap:28px}
    footer{margin-top:24px;font-size:11px;color:#6f665a}
    @media print{body{padding:0.5in}}
  </style></head><body>
    <h1>${e(ls.sheetTitle(sheet, lane.label))}</h1>
    <div class="sub">${e(student.name)} &middot; ${e(date)} &middot; Tick one box per topic, then enter the answers in the workbook.</div>
    ${body}
    <footer>Harrington level-set workbook. Topics from the Marble Skill Taxonomy (CC BY-SA 4.0).</footer>
    <script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script>
  </body></html>`);
  w.document.close();
}
