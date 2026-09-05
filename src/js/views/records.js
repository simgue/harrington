import { getData, SUBJECTS } from '../data.js';
import * as store from '../store.js';
import { el, esc, refreshIcons, toast, openModal, fmtDateTime } from '../ui.js';
import { openRecorder, audioPlayer, fmtDur } from '../recorder.js';
import { aiDiscussionAnalysis } from '../ai.js';

const TYPES = {
  observation: { icon: 'eye', label: 'Observation', color: '#3d6b93', hint: 'What you noticed as they worked' },
  question: { icon: 'help-circle', label: 'Question', color: '#c08a2e', hint: 'Something they asked or wondered' },
  discussion: { icon: 'messages-square', label: 'Discussion', color: '#7a5a9e', hint: 'A conversation you had together' },
  assessment: { icon: 'clipboard-check', label: 'Assessment', color: '#3f7d5e', hint: 'A check of what they can do' },
  recording: { icon: 'mic', label: 'Recording', color: '#b0413a', hint: 'A recorded voice conversation' },
};

const MAX_ATTACHMENT_BYTES = 300 * 1024;
const MAX_ATTACHMENTS = 2;
const MAX_STATE_BYTES_BEFORE_SAVE = Math.floor(4.5 * 1024 * 1024);

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))}MB`;
  return `${Math.round(bytes / 1024)}KB`;
}

let recFilter = 'all';

function fileToAttachment(file) {
  return new Promise((resolve, reject) => {
    if (!file) { resolve(null); return; }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      reject(new Error(`${file.name} is larger than ${formatBytes(MAX_ATTACHMENT_BYTES)}`));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => resolve({
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      dataUrl: String(reader.result || ''),
      isImage: (file.type || '').startsWith('image/'),
    });
    reader.readAsDataURL(file);
  });
}

function attachmentBlock(record) {
  const files = Array.isArray(record.attachments)
    ? record.attachments
    : (record.attachment ? [record.attachment] : []);
  if (!files.length) return null;
  const wrap = el(`<div class="mt-2.5 pt-2.5 border-t border-paper-line space-y-2"></div>`);
  for (const file of files) {
    const row = el(`<div class="rounded-lg border border-paper-line bg-paper p-2.5">
      <div class="flex items-center gap-1.5 text-xs text-ink-faint mb-1">
        <i data-lucide="${file.isImage ? 'image' : 'paperclip'}" class="w-3.5 h-3.5"></i>
        <span class="font-medium text-ink-soft truncate">${esc(file.name || 'Attachment')}</span>
      </div>
      ${file.isImage ? `<img src="${file.dataUrl}" alt="${esc(file.name || 'Attachment')}" class="w-full max-h-52 object-cover rounded-md border border-paper-line" />` : ''}
      <a href="${esc(file.dataUrl || '')}" download="${esc(file.name || 'attachment')}" class="text-xs font-medium text-brand-dark inline-flex items-center gap-1.5 mt-1"><i data-lucide="download" class="w-3.5 h-3.5"></i>Download</a>
    </div>`);
    wrap.appendChild(row);
  }
  return wrap;
}

function wouldExceedStateLimit(studentId, draftRecord) {
  try {
    const state = store.get();
    const records = { ...(state.records || {}) };
    const existing = Array.isArray(records[studentId]) ? records[studentId] : [];
    records[studentId] = [{ id: 'preview', createdAt: Date.now(), ...draftRecord }, ...existing];
    const payload = {
      students: state.students,
      activeStudentId: state.activeStudentId,
      progress: state.progress,
      records,
      tests: state.tests,
      plan: state.plan,
      challenges: state.challenges,
      adaptations: state.adaptations,
      suggestions: state.suggestions,
      notifications: state.notifications,
      curriculumSnapshot: state.curriculumSnapshot,
      recall: state.recall,
      practice: state.practice,
      activity: state.activity,
      game: state.game,
      daily: state.daily,
      graphView: state.graphView === 'list' ? 'list' : 'atlas',
    };
    return new Blob([JSON.stringify(payload)]).size > MAX_STATE_BYTES_BEFORE_SAVE;
  } catch {
    // Fail open if local byte estimation fails; server still enforces limit.
    return false;
  }
}

export function renderRecords(params, { navigate }) {
  const d = getData();
  const active = store.activeStudent();
  const root = el(`<div class="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);

  const header = el(`<div class="flex items-start justify-between gap-3 mb-5">
    <div>
      <h1 class="font-display text-2xl sm:text-3xl font-600">Records</h1>
      <p class="text-ink-soft text-sm mt-1">Observations, questions and discussions for <span class="font-600 text-ink">${active?.name || 'your student'}</span>.</p>
    </div>
    <div class="shrink-0 flex gap-2">
      <button id="rec" class="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#b0413a] hover:bg-[#963731] text-white text-sm font-medium transition-colors"><i data-lucide="mic" class="w-4 h-4"></i>Record</button>
      <button id="new" class="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white text-sm font-medium transition-colors"><i data-lucide="plus" class="w-4 h-4"></i>New record</button>
    </div>
  </div>`);
  header.querySelector('#new').onclick = () => openRecordForm(active?.id);
  header.querySelector('#rec').onclick = () => openRecorder(active?.id);
  root.appendChild(header);

  if (!active) { root.appendChild(el(`<p class="text-ink-soft">Add a student to start recording.</p>`)); return root; }

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

function recordCard(r, student, d, navigate) {
  const tm = TYPES[r.type] || { icon: 'sticky-note', label: 'Note', color: '#8a847a' };
  const topic = r.topicId ? d.byId.get(r.topicId) : null;
  const card = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-4">
    <div class="flex items-center gap-2 text-xs mb-1.5">
      <span class="flex items-center gap-1 font-600 px-2 py-0.5 rounded-full" style="color:${tm.color};background:${tm.color}14"><i data-lucide="${tm.icon}" class="w-3.5 h-3.5"></i>${tm.label}</span>
      ${r.rating ? `<span class="text-[#c08a2e]">${'\u2605'.repeat(r.rating)}${'\u2606'.repeat(5-r.rating)}</span>` : ''}
      <span class="text-ink-faint ml-auto">${fmtDateTime(r.createdAt)}</span>
      <button class="del text-ink-faint hover:text-[#b0413a] p-0.5"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
    </div>
    ${r.invitationTitle ? `<p class="text-[11px] text-ink-faint mb-1">Invitation: <span class="font-medium text-ink-soft">${esc(r.invitationTitle)}</span></p>` : ''}
    ${Array.isArray(r.coverage) && r.coverage.length ? `<p class="text-[11px] text-brand-dark font-medium mb-1">Coverage logged · ${r.coverage.map((item) => esc(item.label || item.topicName || item.topicId || '')).join(' · ')}</p>` : ''}
    ${r.title ? `<p class="font-600">${esc(r.title)}</p>` : ''}
    ${r.note ? `<p class="text-sm text-ink-soft mt-1 leading-relaxed whitespace-pre-wrap">${esc(r.note)}</p>` : ''}
    ${r.transcript ? `<details class="mt-2 group"><summary class="text-xs text-ink-faint cursor-pointer select-none flex items-center gap-1 list-none"><i data-lucide="chevron-right" class="w-3.5 h-3.5 transition-transform group-open:rotate-90"></i>Transcript</summary><p class="text-sm text-ink-soft mt-1.5 leading-relaxed whitespace-pre-wrap bg-paper border border-paper-line rounded-lg p-2.5">${esc(r.transcript)}</p></details>` : ''}
    ${topic ? `<button class="topic mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-brand-dark"><i data-lucide="${SUBJECTS[topic.subject].icon}" class="w-3.5 h-3.5"></i>${esc(topic.name)}<i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></button>` : ''}
  </div>`);
  if (r.audioPath) card.appendChild(audioPlayer(r.audioPath, r.duration));
  const attachments = attachmentBlock(r);
  if (attachments) card.appendChild(attachments);

  // Analyze button for discussions / recordings
  const analyzable = r.type === 'recording' || r.type === 'discussion';
  if (analyzable) {
    const analyzeWrap = el(`<div class="mt-2.5 pt-2.5 border-t border-paper-line"></div>`);
    const btn = el(`<button class="flex items-center gap-1.5 text-sm font-medium text-brand-dark hover:text-brand-dark/80"><i data-lucide="sparkles" class="w-4 h-4"></i>Analyze &amp; get advice</button>`);
    btn.onclick = () => openAnalysis(r, student, topic);
    analyzeWrap.appendChild(btn);
    card.appendChild(analyzeWrap);
  }

  card.querySelector('.del').onclick = () => { if (confirm('Delete this record?')) store.removeRecord(student.id, r.id); };
  card.querySelector('.topic')?.addEventListener('click', () => navigate('topic', { id: r.topicId }));
  return card;
}

function openAnalysis(record, student, topic) {
  const body = el(`<div class="p-5">
    <div class="flex items-start gap-3 mb-4">
      <span class="w-9 h-9 rounded-lg bg-brand-light flex items-center justify-center shrink-0"><i data-lucide="sparkles" class="w-5 h-5 text-brand-dark"></i></span>
      <div>
        <p class="text-xs text-ink-faint">Discussion analysis</p>
        <h3 class="font-display text-lg font-600 leading-tight">${record.title || 'Recorded discussion'}</h3>
      </div>
    </div>
    <div id="stage"></div>
  </div>`);
  const stage = body.querySelector('#stage');
  const m = openModal(body, { wide: true });

  const hasContent = (record.transcript && record.transcript.trim()) || (record.note && record.note.trim());
  if (!hasContent) {
    stage.appendChild(el(`<p class="text-sm text-ink-soft py-4">There's no transcript or notes to analyze for this record. Record a discussion with the live transcript on, or add notes, then try again.</p>`));
    refreshIcons();
    return;
  }

  stage.appendChild(el(`<div class="text-center py-8">
    <div class="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
    <p class="text-sm font-600">Analyzing the discussion\u2026</p>
    <p class="text-xs text-ink-faint mt-1">Looking at what ${student.name} understands and where they're stuck.</p>
  </div>`));
  refreshIcons();

  aiDiscussionAnalysis({
    studentName: student.name,
    age: store.studentAge(student),
    topic: topic || null,
    transcript: record.transcript || '',
    note: record.note || '',
  }).then(html => {
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
  }).catch(() => {
    stage.innerHTML = '';
    stage.appendChild(el(`<p class="text-sm text-[#b0413a] py-4">Couldn't analyze this right now. Please try again.</p>`));
  });
}

export function openRecordForm(studentId, topic = null, options = {}) {
  if (!studentId) { toast('Add a student first', 'error'); return; }
  const d = getData();
  const invitation = options.invitation || null;
  const coverageTopicIds = Array.isArray(options.coverageTopicIds)
    ? options.coverageTopicIds
    : (invitation?.targetTopicIds || (topic ? [topic.id] : []));
  const coverageOptions = [...new Set(coverageTopicIds)]
    .map((id) => d.byId.get(id))
    .filter(Boolean);
  const body = el(`<div class="p-5">
    <h3 class="font-display text-lg font-600 mb-4">${topic ? 'Record for ' + esc(topic.name) : 'New record'}</h3>
    ${invitation ? `<p class="text-xs text-ink-faint mb-3">Linked invitation: <span class="font-medium text-ink-soft">${esc(invitation.title || invitation.id)}</span></p>` : ''}
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
      </div>` : `<input type="hidden" name="topicId" value="${topic.id}" />`}
      <div>
        <label class="text-sm font-medium block mb-1.5">Title <span class="text-ink-faint font-normal">(optional)</span></label>
        <input name="title" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
      </div>
      <div>
        <label class="text-sm font-medium block mb-1.5">Notes</label>
        <textarea name="note" rows="4" placeholder="What happened? What did they say or ask?" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"></textarea>
      </div>
      <div>
        <label class="text-sm font-medium block mb-1.5">File or photo <span class="text-ink-faint font-normal">(optional, up to ${MAX_ATTACHMENTS} files)</span></label>
        <input name="attachments" type="file" multiple accept="image/*,.pdf,.txt,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv" class="w-full text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-paper file:text-ink-soft file:font-medium" />
        <p class="text-xs text-ink-faint mt-1">Stored locally with this family record (max ${formatBytes(MAX_ATTACHMENT_BYTES)} each).</p>
      </div>
      ${coverageOptions.length ? `<label class="flex items-start gap-2 text-sm rounded-lg border border-paper-line bg-paper px-3 py-2.5">
        <input type="checkbox" name="claimCoverage" class="mt-0.5" />
        <span>Mark curriculum coverage for ${coverageOptions.map((item) => esc(item.name)).join(', ')}.</span>
      </label>` : ''}
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
    Object.entries(TYPES).forEach(([k, v]) => {
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
      const b = el(`<button type="button" class="text-2xl leading-none ${i <= rating ? 'text-[#c08a2e]' : 'text-paper-line'}">${i <= rating ? '\u2605' : '\u2606'}</button>`);
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

  body.querySelector('#f').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const note = fd.get('note').trim();
    const title = fd.get('title').trim();
    if (!note && !title) { toast('Add a title or note', 'error'); return; }
    const files = Array.from(body.querySelector('input[name="attachments"]')?.files || []);
    if (files.length > MAX_ATTACHMENTS) {
      toast(`Please select up to ${MAX_ATTACHMENTS} files`, 'error');
      return;
    }
    let attachments = [];
    try {
      attachments = (await Promise.all(files.map(fileToAttachment))).filter(Boolean);
    } catch (err) {
      toast(err.message || 'Could not read attachment', 'error');
      return;
    }
    const rec = {
      type: selType,
      title,
      note,
      rating: rating || null,
      topicId: fd.get('topicId') || null,
      invitationId: invitation?.id || null,
      invitationTitle: invitation?.title || null,
    };
    if (rec.topicId) rec.topicName = d.byId.get(rec.topicId)?.name || null;
    if (attachments.length) rec.attachments = attachments;
    if (fd.get('claimCoverage') && coverageOptions.length) {
      rec.coverage = coverageOptions.map((item) => ({
        topicId: item.id,
        topicName: item.name,
        label: `${item.subject} · ${item.domain}`,
      }));
    }
    if (wouldExceedStateLimit(studentId, rec)) {
      toast('Attachment set is too large for local save. Try fewer/smaller files.', 'error');
      return;
    }
    store.addRecord(studentId, rec);
    toast('Record saved', 'success');
    m.close();
  };

  const m = openModal(body);
}
