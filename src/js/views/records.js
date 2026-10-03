import { getData, SUBJECTS } from '../data.js';
import * as store from '../store.js';
import { el, esc, refreshIcons, toast, openModal, fmtDateTime } from '../ui.js';
import { openRecorder, audioPlayer, coverageCandidates, coverageClaimField } from '../recorder.js';
import { aiDiscussionAnalysis } from '../ai.js';
import { aiErrorBlock, gateAi } from '../ai-status.js';
import { savedAnalysis, regenerateButton, analysisOptIn, notesIncludedLine } from './recordings.js';
import { coverageFields } from '../daily.js';

const TYPES = {
  observation: { icon: 'eye', label: 'Observation', color: '#2f6285', hint: 'What you noticed as they worked' },
  question: { icon: 'help-circle', label: 'Question', color: '#8a6412', hint: 'Something they asked or wondered' },
  discussion: { icon: 'messages-square', label: 'Discussion', color: '#5b4a86', hint: 'A conversation you had together' },
  assessment: { icon: 'clipboard-check', label: 'Assessment', color: '#3f6b3b', hint: 'A check of what they can do' },
  recording: { icon: 'mic', label: 'Recording', color: '#a4473a', hint: 'A recorded voice conversation' },
};

let recFilter = 'all';
let recFilterFor = null; // learner the filter belongs to; reset on switch

export function renderRecords(params, { navigate }) {
  const d = getData();
  const active = store.activeStudent();
  const root = el(`<div class="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);

  const header = el(`<div class="flex items-start justify-between gap-3 mb-5">
    <div>
      <h1 class="font-display text-2xl sm:text-3xl font-600">Records</h1>
      <p class="text-ink-soft text-sm mt-1">Observations, questions and discussions for <span class="font-600 text-ink">${esc(active?.name || 'your student')}</span>.</p>
    </div>
    <div class="shrink-0 flex gap-2">
      <button id="rec" class="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#a4473a] hover:bg-[#86372c] text-white text-sm font-medium transition-colors"><i data-lucide="mic" class="w-4 h-4"></i>Record</button>
      <button id="new" class="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white text-sm font-medium transition-colors"><i data-lucide="plus" class="w-4 h-4"></i>New record</button>
    </div>
  </div>`);
  header.querySelector('#new').onclick = () => openRecordForm(active?.id);
  header.querySelector('#rec').onclick = () => openRecorder(active?.id);
  root.appendChild(header);

  if (!active) { root.appendChild(el(`<p class="text-ink-soft">Add a student to start recording.</p>`)); return root; }

  if (recFilterFor !== active.id) { recFilter = 'all'; recFilterFor = active.id; }
  const all = store.recordsFor(active.id);

  // filter chips
  const chips = el(`<div class="flex gap-2 overflow-x-auto pb-2 mb-4"></div>`);
  const addChip = (key, label) => {
    const on = recFilter === key;
    const c = el(`<button class="shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border ${on ? 'bg-ink text-white border-transparent' : 'bg-paper-card text-ink-soft border-paper-line'}">${label}</button>`);
    c.onclick = () => { recFilter = key; navigate('records'); };
    chips.appendChild(c);
  };
  addChip('all', `All (${all.length})`);
  Object.entries(TYPES).forEach(([k, v]) => addChip(k, v.label));
  root.appendChild(chips);

  const filtered = recFilter === 'all' ? all : all.filter(r => r.type === recFilter);

  if (filtered.length === 0) {
    root.appendChild(el(`<div class="text-center py-16 text-ink-faint">
      <i data-lucide="notebook-pen" class="w-10 h-10 mx-auto mb-3"></i>
      <p class="text-sm">No records yet. Capture what you observe as your student learns.</p>
    </div>`));
    refreshIcons();
    return root;
  }

  const list = el(`<div class="space-y-3"></div>`);
  filtered.forEach(r => list.appendChild(recordCard(r, active, d, navigate)));
  root.appendChild(list);
  refreshIcons();
  return root;
}

// Names of the topics a record claims as coverage, skipping malformed entries.
function coverageNames(r) {
  return (Array.isArray(r.coverage) ? r.coverage : [])
    .filter(c => c && typeof c === 'object' && (c.topicName || c.topicId))
    .map(c => String(c.topicName || c.topicId));
}

function recordCard(r, student, d, navigate) {
  const tm = TYPES[r.type] || { icon: 'sticky-note', label: 'Note', color: '#6f665a' };
  const topic = r.topicId ? d.byId.get(r.topicId) : null;
  const card = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-4">
    <div class="flex items-center gap-2 text-xs mb-1.5">
      <span class="flex items-center gap-1 font-600 px-2 py-0.5 rounded-full" style="color:${tm.color};background:${tm.color}14"><i data-lucide="${tm.icon}" class="w-3.5 h-3.5"></i>${tm.label}</span>
      ${r.rating ? `<span class="text-[#8a6412]">${'\u2605'.repeat(r.rating)}${'\u2606'.repeat(5-r.rating)}</span>` : ''}
      <span class="text-ink-faint ml-auto">${fmtDateTime(r.createdAt)}</span>
      <button class="del text-ink-faint hover:text-[#a4473a] p-0.5"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
    </div>
    ${r.title ? `<p class="font-600">${esc(r.title)}</p>` : ''}
    ${coverageNames(r).length ? `<p class="text-xs font-600 text-brand-dark mb-1 flex items-center gap-1.5"><i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i>Coverage: ${coverageNames(r).map(esc).join(' · ')}</p>` : ''}
    ${r.note ? `<p class="text-sm text-ink-soft mt-1 leading-relaxed whitespace-pre-wrap">${esc(r.note)}</p>` : ''}
    ${r.transcript ? `<details class="mt-2 group"><summary class="text-xs text-ink-faint cursor-pointer select-none flex items-center gap-1 list-none"><i data-lucide="chevron-right" class="w-3.5 h-3.5 transition-transform group-open:rotate-90"></i>Transcript</summary><p class="text-sm text-ink-soft mt-1.5 leading-relaxed whitespace-pre-wrap bg-paper border border-paper-line rounded-lg p-2.5">${esc(r.transcript)}</p></details>` : ''}
    ${topic ? `<button class="topic mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-brand-dark"><i data-lucide="${SUBJECTS[topic.subject].icon}" class="w-3.5 h-3.5"></i>${esc(topic.name)}<i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></button>` : ''}
  </div>`);
  if (r.audioPath) card.appendChild(audioPlayer(r.audioPath, r.duration));

  // Saved analysis (shared with the Recordings folder), plus analyze/regenerate for discussions / recordings
  const analyzable = r.type === 'recording' || r.type === 'discussion';
  if (analyzable || r.analysis) {
    const analyzeWrap = el(`<div class="mt-2.5 pt-2.5 border-t border-paper-line"></div>`);
    const run = includeNotes => openAnalysis(r, student, topic, includeNotes);
    if (r.analysis) {
      analyzeWrap.appendChild(savedAnalysis(r.analysis));
      const redo = regenerateButton(); // null when analysis cannot generate
      if (redo) {
        analyzeWrap.appendChild(redo);
        analyzeWrap.appendChild(analysisOptIn(redo, r, run));
      }
    } else {
      const btn = el(`<button class="flex items-center gap-1.5 text-sm font-medium text-brand-dark hover:text-brand-dark/80"><i data-lucide="sparkles" class="w-4 h-4"></i>Analyze &amp; get advice</button>`);
      const gated = gateAi(btn, { capability: 'analysis' });
      analyzeWrap.appendChild(gated);
      if (gated === btn) analyzeWrap.appendChild(analysisOptIn(btn, r, run));
    }
    card.appendChild(analyzeWrap);
  }

  if (r.placement) card.appendChild(placementUndo(r, student));

  const delMsg = r.placement && !r.placement.undoneAt
    ? 'Delete this placement record? The placement stays, but it can no longer be undone.'
    : 'Delete this record?';
  card.querySelector('.del').onclick = () => { if (confirm(delMsg)) store.removeRecord(student.id, r.id); };
  card.querySelector('.topic')?.addEventListener('click', () => navigate('topic', { id: r.topicId }));
  return card;
}

// Undo for a placement record: reverts exactly the topics it changed.
function placementUndo(r, student) {
  const wrap = el(`<div class="mt-2.5 pt-2.5 border-t border-paper-line"></div>`);
  if (r.placement.undoneAt) {
    wrap.appendChild(el(`<p class="text-xs text-ink-faint flex items-center gap-1.5"><i data-lucide="undo-2" class="w-3.5 h-3.5"></i>Placement undone ${fmtDateTime(r.placement.undoneAt)}</p>`));
    return wrap;
  }
  const n = r.placement.topicIds.length;
  const btn = el(`<button class="flex items-center gap-1.5 text-sm font-medium text-brand-dark hover:text-brand-dark/80"><i data-lucide="undo-2" class="w-4 h-4"></i>Undo placement</button>`);
  btn.onclick = () => {
    if (!confirm(`Return these ${n} topic${n === 1 ? '' : 's'} to their status before the placement?`)) return;
    const res = store.undoPlacement(student.id, r.id);
    if (!res) return;
    toast(res.kept
      ? `Reverted ${res.reverted}; ${res.kept} changed since and kept as they are`
      : `Reverted ${res.reverted} topic${res.reverted === 1 ? '' : 's'}`, 'success');
  };
  wrap.appendChild(btn);
  return wrap;
}

function openAnalysis(record, student, topic, includeNotes = false) {
  const body = el(`<div class="p-5">
    <div class="flex items-start gap-3 mb-4">
      <span class="w-9 h-9 rounded-lg bg-brand-light flex items-center justify-center shrink-0"><i data-lucide="sparkles" class="w-5 h-5 text-brand-dark"></i></span>
      <div>
        <p class="text-xs text-ink-faint">Discussion analysis</p>
        <h3 class="font-display text-lg font-600 leading-tight">${esc(record.title || 'Recorded discussion')}</h3>
      </div>
    </div>
    <div id="stage"></div>
  </div>`);
  const stage = body.querySelector('#stage');
  const m = openModal(body, { wide: true });

  const hasContent = (record.transcript && record.transcript.trim()) || (includeNotes && record.note && record.note.trim());
  if (!hasContent) {
    stage.appendChild(el(`<p class="text-sm text-ink-soft py-4">There's no transcript or shared notes to analyze for this record. Record a discussion with the live transcript on, or tick “Include my notes in this request”, then try again.</p>`));
    refreshIcons();
    return;
  }

  stage.appendChild(el(`<div class="text-center py-8">
    <div class="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
    <p class="text-sm font-600">Analyzing the discussion${includeNotes ? ' (notes included)' : ''}\u2026</p>
    <p class="text-xs text-ink-faint mt-1">Looking at what ${esc(student.name)} understands and where they're stuck.</p>
  </div>`));
  refreshIcons();

  aiDiscussionAnalysis({
    age: store.studentAge(student),
    topic: topic || null,
    transcript: record.transcript || '',
    note: record.note || '',
    includeNotes,
  }).then(html => {
    // Persist onto the record, as the Recordings folder does, so the card shows it.
    store.updateRecord(student.id, record.id, { analysis: html, analyzedAt: Date.now() });
    stage.innerHTML = '';
    stage.appendChild(el(`<div class="ai-prose text-sm text-ink-soft">${html}</div>`));
    const save = el(`<button class="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors"><i data-lucide="save" class="w-4 h-4"></i>Save advice to records</button>`);
    save.onclick = () => {
      store.addRecord(student.id, {
        type: 'observation',
        title: `Advice · ${record.title || 'discussion'}`,
        note: stage.querySelector('.ai-prose').innerText.trim(),
        topicId: record.topicId || null,
        topicName: record.topicName || null,
      });
      toast('Advice saved to records', 'success');
      save.disabled = true; save.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i>Saved';
      refreshIcons();
    };
    stage.appendChild(save);
    refreshIcons();
  }).catch((e) => {
    stage.innerHTML = '';
    if (includeNotes) stage.appendChild(notesIncludedLine());
    stage.appendChild(aiErrorBlock(e, () => { m.close(); openAnalysis(record, student, topic, includeNotes); }));
  });
}

// options: { coverageTopicIds, source } — topics the record may claim as
// curriculum coverage (opt-in checkbox), and what the record is evidence for
// ({ kind: 'daily-pick' | 'invitation', key }).
export function openRecordForm(studentId, topic = null, options = {}) {
  if (!studentId) { toast('Add a student first', 'error'); return; }
  const d = getData();
  const coverageTopics = coverageCandidates(d, options.coverageTopicIds);
  const body = el(`<div class="p-5">
    <h3 class="font-display text-lg font-600 mb-4">${esc(topic ? 'Record for ' + topic.name : 'New record')}</h3>
    <form id="f" class="space-y-4">
      <div>
        <label class="text-sm font-medium block mb-1.5">Type</label>
        <div id="types" class="grid grid-cols-2 gap-2"></div>
      </div>
      ${!topic ? `<div>
        <label class="text-sm font-medium block mb-1.5">Linked topic <span class="text-ink-faint font-normal">(optional)</span></label>
        <input id="search" placeholder="Search topics\u2026" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" autocomplete="off" />
        <div id="results" class="mt-1 max-h-40 overflow-y-auto space-y-1"></div>
        <input type="hidden" name="topicId" />
      </div>` : `<input type="hidden" name="topicId" value="${esc(topic.id)}" />`}
      <div>
        <label class="text-sm font-medium block mb-1.5">Title <span class="text-ink-faint font-normal">(optional)</span></label>
        <input name="title" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
      </div>
      <div>
        <label class="text-sm font-medium block mb-1.5">Notes</label>
        <textarea name="note" rows="4" placeholder="What happened? What did they say or ask?" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"></textarea>
      </div>
      ${coverageClaimField(coverageTopics)}
      <div>
        <label class="text-sm font-medium block mb-1.5">Confidence <span class="text-ink-faint font-normal">(optional)</span></label>
        <div id="stars" class="flex gap-1"></div>
      </div>
      <button class="w-full px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors">Save record</button>
    </form>
  </div>`);

  // type selector
  let selType = 'observation';
  const typesWrap = body.querySelector('#types');
  const renderTypes = () => {
    typesWrap.innerHTML = '';
    // Recordings come only from the recorder, never from this form.
    Object.entries(TYPES).filter(([k]) => k !== 'recording').forEach(([k, v]) => {
      const on = selType === k;
      const b = el(`<button type="button" class="flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${on ? 'border-transparent text-white' : 'bg-paper text-ink-soft border-paper-line'}" ${on ? `style="background:${v.color}"` : ''}>
        <i data-lucide="${v.icon}" class="w-4 h-4"></i>${v.label}</button>`);
      b.onclick = () => { selType = k; renderTypes(); };
      typesWrap.appendChild(b);
    });
    refreshIcons();
  };
  renderTypes();

  // rating stars
  let rating = 0;
  const starsWrap = body.querySelector('#stars');
  const renderStars = () => {
    starsWrap.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const b = el(`<button type="button" class="text-2xl leading-none ${i <= rating ? 'text-[#8a6412]' : 'text-paper-line'}">${i <= rating ? '\u2605' : '\u2606'}</button>`);
      b.onclick = () => { rating = (rating === i) ? 0 : i; renderStars(); };
      starsWrap.appendChild(b);
    }
  };
  renderStars();

  // topic search
  if (!topic) {
    const search = body.querySelector('#search');
    const results = body.querySelector('#results');
    const hidden = body.querySelector('input[name="topicId"]');
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      results.innerHTML = '';
      if (q.length < 2) return;
      const matches = d.topics.filter(t => t.name.toLowerCase().includes(q)).slice(0, 6);
      matches.forEach(t => {
        const r = el(`<button type="button" class="w-full text-left px-3 py-2 rounded-lg hover:bg-paper text-sm flex items-center gap-2"><span class="w-2 h-2 rounded-full" style="background:${SUBJECTS[t.subject].color}"></span><span class="flex-1 truncate">${esc(t.name)}</span><span class="text-xs text-ink-faint">${esc(t.subject)}</span></button>`);
        r.onclick = () => { hidden.value = t.id; search.value = t.name; results.innerHTML = ''; };
        results.appendChild(r);
      });
    });
  }

  body.querySelector('#f').onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const note = fd.get('note').trim();
    const title = fd.get('title').trim();
    if (!note && !title) { toast('Add a title or note', 'error'); return; }
    const rec = { type: selType, title, note, rating: rating || null, topicId: fd.get('topicId') || null };
    if (rec.topicId) rec.topicName = d.byId.get(rec.topicId)?.name || null;
    Object.assign(rec, coverageFields(coverageTopics, !!fd.get('claimCoverage'), options.source));
    store.addRecord(studentId, rec);
    toast('Record saved', 'success');
    m.close();
  };

  const m = openModal(body);
}
