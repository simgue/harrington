// Placement modal: mark earlier topics as already mastered for a learner.
// Parent-only; the child view never shows it.
import { SUBJECTS, AGES, getData, hardPrereqs, topicAge } from '../data.js';
import * as store from '../store.js';
import { el, esc, openModal, refreshIcons, toast } from '../ui.js';
import { selectPlacement, defaultMaxAge, subjectDomains, placementTitle } from '../placement.js';

const SELECT = 'w-full px-3.5 py-2.5 rounded-xl border border-paper-line bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand';

export function openPlacement(student, { subject = null } = {}) {
  if (!student) { toast('Add a student first', 'error'); return; }
  const d = getData();
  const subjects = Object.keys(SUBJECTS);
  let sub = subjects.includes(subject) ? subject : subjects[0];
  let domain = '';
  let maxAge = defaultMaxAge(store.studentAge(student));
  let withPrereqs = true;

  const body = el(`<div class="p-5">
    <div class="flex items-start gap-3 mb-4">
      <span class="w-10 h-10 rounded-xl bg-brand-light flex items-center justify-center shrink-0"><i data-lucide="list-checks" class="w-5 h-5 text-brand-dark"></i></span>
      <div>
        <h3 class="font-display text-lg font-600 leading-tight">Place ${esc(student.name)}</h3>
        <p class="text-sm text-ink-soft mt-0.5">Mark earlier topics ${esc(student.name)} already knows as mastered, so the map starts where they are. Parent view only.</p>
      </div>
    </div>
    <div class="space-y-3.5">
      <div>
        <label class="text-sm font-medium block mb-1.5" for="pl-subject">Subject</label>
        <select id="pl-subject" class="${SELECT}">${subjects.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select>
      </div>
      <div>
        <label class="text-sm font-medium block mb-1.5" for="pl-domain">Area</label>
        <select id="pl-domain" class="${SELECT}"></select>
      </div>
      <div>
        <label class="text-sm font-medium block mb-1.5" for="pl-age">Up to age</label>
        <select id="pl-age" class="${SELECT}">${AGES.map(a => `<option value="${a}">Topics starting at age ${a} or younger</option>`).join('')}</select>
      </div>
    </div>
    <div id="pl-preview" class="mt-4"></div>
    <div class="flex gap-2 mt-4">
      <button id="pl-cancel" type="button" class="flex-1 px-4 py-2.5 rounded-xl bg-paper border border-paper-line text-ink-soft font-medium text-sm hover:border-brand/40">Cancel</button>
      <button id="pl-confirm" type="button" class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><i data-lucide="check" class="w-4 h-4"></i><span>Mark mastered</span></button>
    </div>
  </div>`);

  const subSel = body.querySelector('#pl-subject');
  const domSel = body.querySelector('#pl-domain');
  const ageSel = body.querySelector('#pl-age');
  const preview = body.querySelector('#pl-preview');
  const confirmBtn = body.querySelector('#pl-confirm');
  subSel.value = sub;
  ageSel.value = String(maxAge);

  const fillDomains = () => {
    domSel.innerHTML = `<option value="">All of ${esc(sub)}</option>`
      + subjectDomains(d.topics, sub).map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
    domSel.value = '';
    domain = '';
  };

  let plan = null;
  const toMark = () => plan ? (withPrereqs ? [...plan.ids, ...plan.prereqIds] : plan.safeIds) : [];

  const update = () => {
    plan = selectPlacement(d.topics, {
      subject: sub, domain: domain || null, maxAge,
      progress: store.progressFor(student.id), hardPrereqs, topicAge,
    });
    preview.innerHTML = '';
    const box = el(`<div class="rounded-xl bg-paper border border-paper-line p-3.5 text-sm"></div>`);
    if (!plan.count) {
      box.appendChild(el(`<p class="text-ink-soft">Every topic here is already mastered. Nothing would change.</p>`));
    } else {
      box.appendChild(el(`<p><span class="font-600">${plan.count} topic${plan.count === 1 ? '' : 's'}</span> would be marked mastered.</p>`));
      if (plan.prereqCount) {
        const opt = el(`<label class="flex items-start gap-2 mt-2.5 cursor-pointer">
          <input type="checkbox" class="mt-0.5 accent-[#3f6b3b]" ${withPrereqs ? 'checked' : ''} />
          <span>Also mark ${plan.prereqCount} hard prerequisite${plan.prereqCount === 1 ? '' : 's'} they depend on <span class="text-ink-faint">(recommended)</span></span>
        </label>`);
        opt.querySelector('input').onchange = (e) => { withPrereqs = e.target.checked; update(); };
        box.appendChild(opt);
        if (!withPrereqs) {
          const skipped = plan.count - plan.safeIds.length;
          box.appendChild(el(`<p class="text-xs text-[#8a6412] mt-2">${skipped} topic${skipped === 1 ? '' : 's'} will stay as they are, because a required foundation would still be unmastered.</p>`));
        }
      }
      box.appendChild(el(`<p class="text-xs text-ink-faint mt-2.5">Saved as one record in Records, where you can undo it.</p>`));
    }
    preview.appendChild(box);
    const n = toMark().length;
    confirmBtn.disabled = n === 0;
    confirmBtn.querySelector('span').textContent = n ? `Mark ${n} mastered` : 'Mark mastered';
    refreshIcons();
  };

  subSel.onchange = () => { sub = subSel.value; fillDomains(); update(); };
  domSel.onchange = () => { domain = domSel.value; update(); };
  ageSel.onchange = () => { maxAge = parseInt(ageSel.value, 10); update(); };

  const m = openModal(body);
  body.querySelector('#pl-cancel').onclick = () => m.close();
  confirmBtn.onclick = () => {
    const ids = toMark();
    if (!ids.length) return;
    const own = withPrereqs ? plan.count : ids.length;
    store.applyPlacement(student.id, {
      topicIds: ids,
      title: placementTitle({ count: own, subject: sub, domain: domain || null, maxAge, prereqCount: ids.length - own }),
      subject: sub, domain: domain || null, maxAge,
    });
    toast(`Marked ${ids.length} topics mastered. Undo it from Records.`, 'success');
    m.close();
  };

  fillDomains();
  update();
}
