// "Teaching guide": Marble's teaching research for a topic, shown on the
// topic page as a collapsible section and, where lessons need AI, in a modal.
// Works without an AI provider. Parent view only.
import { getData } from '../data.js';
import { el, esc, openModal, refreshIcons } from '../ui.js';
import {
  GUIDE_ATTRIBUTION, GUIDE_GLOSS, LICENSE_HREF, MARBLE_HREF, hasTeachingGuide, loadTeachingGuide,
} from '../teaching.js';
import { printTeachingGuide } from './guideprint.js';

const list = (items) => `<ul class="space-y-1.5">${items.map(x => `<li class="flex gap-2 text-sm text-ink-soft leading-relaxed"><span class="w-1.5 h-1.5 rounded-full bg-brand/60 shrink-0 mt-2"></span><span class="min-w-0">${esc(x)}</span></li>`).join('')}</ul>`;
const label = (icon, text) => `<p class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-1.5 flex items-center gap-1.5"><i data-lucide="${icon}" class="w-3.5 h-3.5"></i>${esc(text)}</p>`;
const steps = (items) => items.map((s, n) => `<li class="flex gap-2.5 text-sm text-ink-soft leading-relaxed"><span class="w-5 h-5 rounded-full bg-brand-light text-brand-dark text-[11px] font-700 flex items-center justify-center shrink-0 mt-0.5">${esc(n + 1)}</span><span class="min-w-0">${esc(s)}</span></li>`).join('');
const summaryRow = 'min-h-[44px] flex items-center gap-2 cursor-pointer select-none list-none';
// The lesson's print button, at 44 px; the word shows from the sm breakpoint.
const PRINT_BUTTON = `<button type="button" class="guide-print flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-1.5 text-sm text-ink-soft hover:text-ink shrink-0" aria-label="Print the teaching guide"><i data-lucide="printer" class="w-4 h-4"></i><span class="hidden sm:inline">Print</span></button>`;
// A topic's name, for "Go back to" on paper.
const nameOf = (id) => getData()?.byId?.get(id)?.name || null;
const creditLink = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center min-h-[44px] min-w-[44px] px-2 underline underline-offset-2">${esc(text)}</a>`;

function activityBlock(a, i) {
  // Named groups: an unnamed `group-open:` would follow the open outer guide.
  return `<details class="guide-activity group/act rounded-xl border border-paper-line bg-paper px-3.5">
    <summary class="${summaryRow} py-2 text-sm font-600 text-ink"><i data-lucide="chevron-right" class="w-4 h-4 text-ink-faint shrink-0 transition-transform group-open/act:rotate-90"></i><span class="text-ink-faint font-500 shrink-0">${esc(i + 1)}.</span><span class="min-w-0">${esc(a.title)}</span></summary>
    <div class="pb-3.5 space-y-3">
      ${a.steps.length ? `<div>${label('list-ordered', 'Steps')}<ol class="space-y-1.5">${steps(a.steps)}</ol></div>` : ''}
      ${a.insight ? `<div>${label('lightbulb', 'What they should notice')}<p class="text-sm text-ink-soft leading-relaxed">${esc(a.insight)}</p></div>` : ''}
      ${a.feedback.length ? `<div>${label('message-circle', 'If they take a wrong turn')}${list(a.feedback)}</div>` : ''}
    </div>
  </details>`;
}

function checkBlock(c, byId) {
  const reteach = (id) => {
    const topic = id && byId?.get(id);
    return topic ? `<p class="text-xs text-ink-faint mt-1">Go back to: <button type="button" class="guide-topic inline-flex min-h-[44px] sm:min-h-0 items-center text-brand-dark font-medium underline underline-offset-2" data-topic="${esc(topic.id)}">${esc(topic.name)}</button></p>` : '';
  };
  return `<div class="rounded-xl border border-brand/30 bg-brand-light/40 p-3.5 space-y-3.5">
    <div class="flex flex-wrap items-center gap-2">
      <h3 class="font-600 text-sm flex items-center gap-1.5"><i data-lucide="badge-check" class="w-4 h-4 text-brand-dark"></i>Check understanding</h3>
      ${c.method ? `<span class="text-xs px-2 py-0.5 rounded-full bg-paper-card border border-paper-line text-ink-soft">${esc(c.method)}</span>` : ''}
    </div>
    ${c.task ? `<div>${label('hand', 'Try this')}<p class="text-sm text-ink-soft leading-relaxed">${esc(c.task)}</p></div>` : ''}
    ${c.prompt ? `<div>${label('message-circle-question', 'Ask')}<p class="text-sm text-ink-soft leading-relaxed italic">“${esc(c.prompt)}”</p></div>` : ''}
    ${c.answer ? `<div>${label('check', 'A strong answer')}<p class="text-sm text-ink-soft leading-relaxed">${esc(c.answer)}</p></div>` : ''}
    ${c.followUps.length ? `<div>${label('corner-down-right', 'To dig deeper')}${list(c.followUps)}</div>` : ''}
    ${c.errors.length ? `<div>${label('alert-triangle', 'Common wrong turns')}<div class="space-y-2.5">${c.errors.map(e => `<div class="rounded-lg bg-paper-card border border-paper-line p-3">
      <p class="text-sm font-600 text-ink leading-snug">${esc(e.pattern)}</p>
      ${e.signs ? `<p class="text-sm text-ink-soft leading-relaxed mt-1"><span class="font-medium text-ink">You may notice:</span> ${esc(e.signs)}</p>` : ''}
      ${e.nextMove ? `<p class="text-sm text-ink-soft leading-relaxed mt-1"><span class="font-medium text-ink">Then try:</span> ${esc(e.nextMove)}</p>` : ''}
      ${reteach(e.reteachId)}
    </div>`).join('')}</div></div>` : ''}
    ${c.levels.length ? `<div>${label('signal', 'Where they are')}<dl class="space-y-2">${c.levels.map(l => `<div><dt class="text-sm font-600 text-ink">${esc(l.label)}</dt><dd class="text-sm text-ink-soft leading-relaxed">${esc(l.text)}</dd></div>`).join('')}</dl></div>` : ''}
  </div>`;
}

// The guide's content, ending with the sources, the caveat and the credit.
// `onTopic(id)` opens a topic named as something to go back to.
export function renderGuide(guide, { onTopic = null } = {}) {
  const byId = onTopic ? getData()?.byId : null;
  const activities = guide.activities.map(activityBlock).join('');
  const check = guide.check ? checkBlock(guide.check, byId) : '';
  const body = el(`<div class="space-y-4 min-w-0">
    ${guide.summary ? `<p class="text-sm text-ink-soft leading-relaxed">${esc(guide.summary)}</p>` : ''}
    ${guide.activities.length ? `<div>${label('shapes', 'Activities')}<div class="space-y-2">${activities}</div></div>` : ''}
    ${check}
    ${guide.sources.length ? `<details class="group/src">
      <summary class="${summaryRow} text-sm font-medium text-ink-soft"><i data-lucide="chevron-right" class="w-4 h-4 text-ink-faint transition-transform group-open/src:rotate-90"></i>Sources (${esc(guide.sources.length)})</summary>
      <ul class="space-y-1 pb-1">${guide.sources.map(s => `<li class="text-sm leading-snug"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" class="text-brand-dark underline underline-offset-2 break-words">${esc(s.name)}</a></li>`).join('')}</ul>
    </details>` : ''}
    <div class="pt-3 border-t border-paper-line space-y-1.5">
      ${guide.caveat ? `<p class="guide-caveat text-xs text-ink-soft leading-relaxed">${esc(guide.caveat)}</p>` : ''}
      <p class="guide-gloss text-xs text-ink-faint leading-relaxed">${esc(GUIDE_GLOSS)}</p>
      <p class="guide-credit text-[11px] text-ink-faint leading-relaxed">${esc(GUIDE_ATTRIBUTION)}</p>
      <p class="flex flex-wrap gap-x-1 -mx-2 text-[11px] text-ink-faint">${creditLink(MARBLE_HREF, 'Source')}${creditLink(LICENSE_HREF, 'License')}</p>
    </div>
  </div>`);
  if (onTopic) body.querySelectorAll('.guide-topic').forEach(b => { b.onclick = () => onTopic(b.dataset.topic); });
  return body;
}

// The topic page section: an empty placeholder that becomes a collapsed
// "Teaching guide" when the topic has research, and disappears otherwise.
export function teachingGuideSection(topic, { navigate }) {
  const slot = el(`<div class="teaching-guide-slot hidden"></div>`);
  loadTeachingGuide(topic.id).then(guide => {
    if (!slot.parentNode) return; // the page was re-rendered meanwhile
    if (!guide) { slot.remove(); return; }
    const sec = el(`<details id="teaching-guide" class="group/guide bg-paper-card border border-paper-line rounded-2xl px-5 scroll-mt-4">
      <summary class="${summaryRow} py-3.5 justify-between">
        <span class="flex items-center gap-2 min-w-0"><i data-lucide="compass" class="w-4.5 h-4.5 text-brand-dark shrink-0"></i><h2 class="font-600">Teaching guide</h2></span>
        <span class="flex items-center gap-1.5 text-xs text-ink-faint shrink-0">${PRINT_BUTTON}No AI needed<i data-lucide="chevron-down" class="w-4 h-4 transition-transform group-open/guide:rotate-180"></i></span>
      </summary>
      <div class="pb-5 guide-body"></div>
    </details>`);
    sec.querySelector('.guide-body').appendChild(renderGuide(guide, { onTopic: id => navigate('topic', { id }) }));
    // In the header: printing must not also open or close the section.
    sec.querySelector('.guide-print').onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      printTeachingGuide(topic, guide, { topicName: nameOf });
    };
    slot.replaceWith(sec);
    refreshIcons();
  }).catch(err => {
    console.warn(err);
    slot.remove();
  });
  return slot;
}

// Opens the topic page's guide, or a modal where there is no section.
export function openTeachingGuide(topic, { navigate = null } = {}) {
  const sec = document.getElementById('teaching-guide');
  if (sec) {
    sec.open = true;
    sec.scrollIntoView({ block: 'start' });
    sec.querySelector('summary')?.focus({ preventScroll: true });
    return;
  }
  const body = el(`<div>
    <div class="sticky top-0 bg-paper-card border-b border-paper-line px-5 py-4 flex items-start gap-3 z-10">
      <span class="w-9 h-9 rounded-lg bg-brand-light flex items-center justify-center shrink-0"><i data-lucide="compass" class="w-5 h-5 text-brand-dark"></i></span>
      <div class="flex-1 min-w-0">
        <p class="text-xs text-ink-faint">Teaching guide · no AI needed</p>
        <h3 class="font-display text-lg font-600 leading-tight">${esc(topic.name)}</h3>
      </div>
      <span class="print-slot"></span>
    </div>
    <div class="stage px-5 py-5"><p class="text-sm text-ink-faint">Loading the teaching guide…</p></div>
  </div>`);
  const stage = body.querySelector('.stage');
  const m = openModal(body, { wide: true });
  loadTeachingGuide(topic.id).then(guide => {
    // Print appears once there is a guide to print.
    if (guide) {
      const btn = el(PRINT_BUTTON);
      btn.onclick = () => printTeachingGuide(topic, guide, { topicName: nameOf });
      body.querySelector('.print-slot').replaceWith(btn);
    }
    stage.replaceChildren(guide
      ? renderGuide(guide, navigate ? { onTopic: id => { m.close(); navigate('topic', { id }); } } : {})
      : el(`<p class="text-sm text-ink-soft">There is no teaching guide for this topic.</p>`));
    refreshIcons();
  }).catch(() => {
    stage.replaceChildren(el(`<p class="text-sm text-ink-soft">The teaching guide couldn’t be loaded. Check that the Harrington server is running and online for its first download, then open it again.</p>`));
  });
}

// "Open the teaching guide", handed to `insert(button)` once the server
// confirms the topic has a guide. Callers use it only where lessons cannot be
// generated: with AI the lesson stays the first choice.
export function offerTeachingGuide(topic, insert, { navigate = null, compact = false } = {}) {
  hasTeachingGuide(topic.id).then(found => {
    if (!found) return;
    const btn = el(compact
      ? `<button type="button" class="open-guide inline-flex items-center gap-1.5 min-h-[44px] text-xs font-medium text-brand-dark"><i data-lucide="compass" class="w-3.5 h-3.5"></i>Open the teaching guide</button>`
      : `<button type="button" class="open-guide flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-brand hover:bg-brand-dark text-white font-medium text-sm transition-colors"><i data-lucide="compass" class="w-4 h-4"></i>Open the teaching guide</button>`);
    btn.onclick = () => openTeachingGuide(topic, { navigate });
    insert(btn);
    refreshIcons();
  }).catch(err => console.warn('Could not offer the teaching guide', err));
}
