import { SUBJECTS } from '../data.js';
import { buildDailyParentSurface, buildDailyQueue, CURATED_INTEREST_CHIPS, interestKey } from '../focus.js';
import * as store from '../store.js';
import { keyOf } from '../scheduler.js';
import { el, esc, refreshIcons, toast } from '../ui.js';
import { openRecordForm } from './records.js';
import { openRecorder } from '../recorder.js';

function ensureDailyQueue(studentId, daily) {
  const today = keyOf(new Date());
  const expectedKey = interestKey(daily);
  const queue = daily.queue;
  const missing = !queue
    || queue.dateKey !== today
    || queue.interestKey !== expectedKey
    || !Array.isArray(queue.invites)
    || queue.invites.length === 0;
  if (!missing) return queue;
  const rebuilt = buildDailyQueue(studentId, { chips: daily.chips, freeText: daily.freeText }, today);
  store.setDailyQueue(studentId, rebuilt);
  return rebuilt;
}

function serializeInterests(node) {
  const chips = [...node.querySelectorAll('[data-chip][aria-pressed="true"]')].map((button) => button.dataset.chip);
  const freeText = node.querySelector('textarea[name="interestText"]')?.value || '';
  return { chips, freeText };
}

function refreshDaily(studentId, panel) {
  const interests = serializeInterests(panel);
  store.setDailyInterests(studentId, interests);
  store.setDailyQueue(studentId, buildDailyQueue(studentId, interests, keyOf(new Date())));
  toast('Daily invitations refreshed', 'success');
}

function topicPill(topic) {
  const meta = SUBJECTS[topic.subject] || { color: '#8a847a', icon: 'book' };
  const tone = topic.ready ? 'border-paper-line text-ink-soft' : 'border-[#e6cbae] text-[#8a4a20] bg-[#fbf1e6]';
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${tone}">
    <i data-lucide="${meta.icon}" class="w-3 h-3" style="color:${meta.color}"></i>${esc(topic.name)}
  </span>`;
}

function blockersBlock(title, entries, navigate) {
  const box = el(`<div class="rounded-xl border border-paper-line bg-paper p-3">
    <p class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-2">${title}</p>
    <div class="space-y-2" id="rows"></div>
  </div>`);
  const rows = box.querySelector('#rows');
  if (!entries.length) {
    rows.appendChild(el(`<p class="text-sm text-ink-faint">No hard blockers in this capped list.</p>`));
    return box;
  }
  entries.forEach((entry) => {
    const first = entry.blockers[0];
    const path = [entry.topic.name, ...entry.whyLockedPath.map((node) => node.name)].join(' → ');
    const row = el(`<button class="w-full text-left rounded-lg border border-paper-line bg-paper-card px-3 py-2 hover:border-brand/40 transition-colors">
      <p class="text-sm font-600">${esc(entry.topic.name)}</p>
      <p class="text-xs text-[#8a4a20] mt-0.5">${esc(first?.name || 'Prerequisite needed')}${first?.reason ? ` · ${esc(first.reason)}` : ''}</p>
      <p class="text-[11px] text-ink-faint mt-1">Why-locked path: ${esc(path)}</p>
    </button>`);
    row.onclick = () => navigate('topic', { id: entry.topic.id });
    rows.appendChild(row);
  });
  return box;
}

function readyBlock(title, entries, navigate) {
  const box = el(`<div class="rounded-xl border border-paper-line bg-paper p-3">
    <p class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-2">${title}</p>
    <div class="space-y-2" id="rows"></div>
  </div>`);
  const rows = box.querySelector('#rows');
  if (!entries.length) {
    rows.appendChild(el(`<p class="text-sm text-ink-faint">No ready skills in this short list yet.</p>`));
    return box;
  }
  entries.forEach((entry) => {
    const row = el(`<button class="w-full text-left rounded-lg border border-paper-line bg-paper-card px-3 py-2 hover:border-brand/40 transition-colors">
      <p class="text-sm font-600">${esc(entry.topic.name)}</p>
      <p class="text-xs text-ink-faint mt-0.5">${esc(entry.topic.domain)} · ${entry.status === 'none' ? 'Ready' : esc(entry.status)}</p>
    </button>`);
    row.onclick = () => navigate('topic', { id: entry.topic.id });
    rows.appendChild(row);
  });
  return box;
}

function inviteCard(student, invite, navigate) {
  const invitation = {
    id: invite.id,
    title: invite.title,
    targetTopicIds: invite.targetTopicIds,
  };
  const primary = invite.topics[0] || null;
  const row = el(`<div class="rounded-2xl border border-paper-line bg-paper-card p-4">
    <div class="flex items-start justify-between gap-2 mb-2">
      <p class="text-xs uppercase tracking-[0.14em] text-ink-faint font-600">${esc(invite.mode)}</p>
      ${invite.evidence.coverageCount > 0 ? `<span class="text-[11px] font-medium text-brand-dark">Coverage recorded</span>` : ''}
    </div>
    <h3 class="font-600 leading-tight">${esc(invite.title)}</h3>
    <p class="text-sm text-ink-soft mt-1 leading-relaxed">${esc(invite.prompt)}</p>
    ${invite.evidence.recordCount > 0 ? `<p class="text-xs text-ink-faint mt-1">${invite.evidence.recordCount} record${invite.evidence.recordCount === 1 ? '' : 's'} linked</p>` : ''}
    <div class="flex flex-wrap gap-1.5 mt-2">${invite.topics.map(topicPill).join('')}</div>
    <ul class="mt-2 text-xs text-ink-faint space-y-0.5">${invite.evidenceHints.map((hint) => `<li>• ${esc(hint)}</li>`).join('')}</ul>
    <div class="flex flex-wrap gap-2 mt-3">
      <button class="btn-note px-3 py-2 rounded-lg border border-paper-line text-sm font-medium hover:border-brand/40">Record note / file</button>
      <button class="btn-voice px-3 py-2 rounded-lg bg-[#b0413a] hover:bg-[#963731] text-white text-sm font-medium">Record voice</button>
      ${primary ? '<button class="btn-topic px-3 py-2 rounded-lg bg-brand hover:bg-brand-dark text-white text-sm font-medium">Open topic</button>' : ''}
    </div>
  </div>`);

  row.querySelector('.btn-note').onclick = () => openRecordForm(student.id, primary, {
    invitation,
    coverageTopicIds: invite.targetTopicIds,
  });
  row.querySelector('.btn-voice').onclick = () => openRecorder(student.id, primary, null, {
    invitation,
    coverageTopicIds: invite.targetTopicIds,
  });
  row.querySelector('.btn-topic')?.addEventListener('click', () => navigate('topic', { id: primary.id }));
  return row;
}

export function renderDailyParentSurface(student, { navigate }) {
  const daily = store.dailyState(student.id);
  const queue = ensureDailyQueue(student.id, daily);
  const surface = buildDailyParentSurface(student.id, {
    interests: { chips: daily.chips, freeText: daily.freeText },
    queueInvites: queue.invites,
  });

  const root = el(`<section class="rounded-2xl border border-paper-line bg-paper-card p-5 mb-6">
    <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4">
      <div>
        <p class="text-[11px] uppercase tracking-[0.18em] text-ink-faint font-medium">Daily parent surface</p>
        <h2 class="font-display text-2xl font-600 mt-1">Today’s focus</h2>
        <p class="text-sm text-ink-soft mt-1">Parent-only planning for literacy, numeracy, invitations, and evidence. Tone: ${esc(surface.tone.short)}.</p>
      </div>
      <div class="text-xs text-ink-faint">Review-due stays separate from new frontier picks.</div>
    </div>

    <div class="rounded-xl border border-paper-line bg-paper p-3 mb-4">
      <p class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-2">Interests</p>
      <div id="chips" class="flex flex-wrap gap-2 mb-2"></div>
      <textarea name="interestText" rows="2" placeholder="Add free text interest (for example: building a bird shelter)" class="w-full px-3 py-2 rounded-lg border border-paper-line bg-paper-card text-sm"></textarea>
      <div class="flex flex-wrap gap-2 mt-2">
        <button class="btn-refresh px-3.5 py-2 rounded-lg bg-brand hover:bg-brand-dark text-white text-sm font-medium">Refresh invitations</button>
        <button class="btn-demo px-3.5 py-2 rounded-lg border border-paper-line text-sm font-medium hover:border-brand/40">Bird-shelter demo</button>
      </div>
    </div>

    <div class="grid xl:grid-cols-3 gap-3 mb-4" id="invites"></div>
    <div class="grid lg:grid-cols-2 gap-3 mb-4" id="ready"></div>
    <div class="grid lg:grid-cols-2 gap-3 mb-4" id="blockers"></div>
    <div class="rounded-xl border border-paper-line bg-paper p-3">
      <p class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-2">Review due (separate queue)</p>
      <div class="grid md:grid-cols-2 gap-3">
        <div>
          <p class="text-xs font-medium text-ink-soft mb-1">Active recall</p>
          <ul id="recall" class="space-y-1 text-sm"></ul>
        </div>
        <div>
          <p class="text-xs font-medium text-ink-soft mb-1">Spaced practice</p>
          <ul id="practice" class="space-y-1 text-sm"></ul>
        </div>
      </div>
    </div>
  </section>`);

  const chipsWrap = root.querySelector('#chips');
  const selectedChips = new Set(daily.chips || []);
  CURATED_INTEREST_CHIPS.forEach((chip) => {
    const on = selectedChips.has(chip);
    const button = el(`<button type="button" data-chip="${esc(chip)}" aria-pressed="${on ? 'true' : 'false'}" class="px-2.5 py-1 rounded-full text-sm border ${on ? 'bg-ink text-white border-transparent' : 'border-paper-line text-ink-soft'}">${esc(chip)}</button>`);
    button.onclick = () => {
      button.setAttribute('aria-pressed', button.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      button.className = `px-2.5 py-1 rounded-full text-sm border ${
        button.getAttribute('aria-pressed') === 'true'
          ? 'bg-ink text-white border-transparent'
          : 'border-paper-line text-ink-soft'
      }`;
    };
    chipsWrap.appendChild(button);
  });

  const freeTextBox = root.querySelector('textarea[name="interestText"]');
  freeTextBox.value = daily.freeText || '';

  root.querySelector('.btn-refresh').onclick = () => refreshDaily(student.id, root);
  root.querySelector('.btn-demo').onclick = () => {
    const buttons = [...root.querySelectorAll('[data-chip]')];
    buttons.forEach((button) => {
      const on = button.dataset.chip === 'Bird shelter';
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      button.className = `px-2.5 py-1 rounded-full text-sm border ${on ? 'bg-ink text-white border-transparent' : 'border-paper-line text-ink-soft'}`;
    });
    freeTextBox.value = 'Building a bird shelter in the backyard';
    refreshDaily(student.id, root);
  };

  const invites = root.querySelector('#invites');
  surface.invites.forEach((invite) => invites.appendChild(inviteCard(student, invite, navigate)));

  const ready = root.querySelector('#ready');
  ready.appendChild(readyBlock('Literacy ready now', surface.literacy.ready, navigate));
  ready.appendChild(readyBlock('Numeracy ready now', surface.numeracy.ready, navigate));

  const blockers = root.querySelector('#blockers');
  blockers.appendChild(blockersBlock('Literacy hard blockers', surface.literacy.blocked, navigate));
  blockers.appendChild(blockersBlock('Numeracy hard blockers', surface.numeracy.blocked, navigate));

  const recall = root.querySelector('#recall');
  if (!surface.reviewDue.recall.length) {
    recall.appendChild(el(`<li class="text-sm text-ink-faint">No recall cards due.</li>`));
  } else {
    surface.reviewDue.recall.forEach((item) => {
      recall.appendChild(el(`<li class="text-sm text-ink-soft">• ${esc(item.topicName)}</li>`));
    });
  }
  const practice = root.querySelector('#practice');
  if (!surface.reviewDue.practice.length) {
    practice.appendChild(el(`<li class="text-sm text-ink-faint">No practice items due.</li>`));
  } else {
    surface.reviewDue.practice.forEach((item) => {
      practice.appendChild(el(`<li class="text-sm text-ink-soft">• ${esc(item.topicName)}</li>`));
    });
  }
  refreshIcons();
  return root;
}
