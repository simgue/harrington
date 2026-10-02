import { SUBJECTS } from '../data.js';
import * as store from '../store.js';
import { el, esc, refreshIcons, fmtDateTime } from '../ui.js';
import { studentStats, recommendedNext, recentActivity, todaysChoices, MASTERY } from '../mastery.js';
import { openRecordForm } from './records.js';
import { openRecorder } from '../recorder.js';
import { keyOf, topicsOn, dailyExtras } from '../scheduler.js';
import { openMasteryTest } from './masterytest.js';
import { openRecordingsLibrary } from './recordings.js';
import { openDueRecall } from './recall.js';
import { openDuePractice } from './practice.js';
import { BADGES } from '../game.js';
import { meadowScene, petalRing, weekFlower, growthIcon, growthChip, stageForStatus, stageForArea, GROWTH } from '../meadow.js';
import { openKidMode } from './kidmode.js';
import { openPlacement } from './placement.js';
import { pickKey, invitationEvidenceSummary } from '../daily.js';

// Pastel stop colours for the day's path, cycled per topic.
const STOPS = [
  { fill: '#f3b7a8', tint: '#fbe5de', deep: '#a4473a' },
  { fill: '#bfdcec', tint: '#e3eff6', deep: '#2f6285' },
  { fill: '#d6caea', tint: '#eee8f6', deep: '#5b4a86' },
  { fill: '#a9c9a0', tint: '#e4eedf', deep: '#3f6b3b' },
];

export function renderDashboard(params, { navigate }) {
  const active = store.activeStudent();
  const root = el(`<div class="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-7 fade-up"></div>`);

  if (!active) { root.appendChild(el(`<p class="text-ink-soft">Add a student to get started.</p>`)); return root; }

  const age = store.studentAge(active);
  const stats = studentStats(active.id);
  const name = esc(active.name);

  // Meadow header: greeting over hills, with the day's main actions.
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const weekday = new Date().toLocaleDateString(undefined, { weekday: 'long' });
  const dateLabel = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  const hero = el(`<header class="meadow-hero mb-5">
    ${meadowScene()}
    <div class="meadow-hero-body flex flex-col md:flex-row md:items-center md:justify-between gap-4 px-6 sm:px-8 pt-6 pb-16 md:pb-8 md:min-h-[9.5rem]">
      <div>
        <p class="text-sm font-medium text-brand flex items-center gap-1.5"><i data-lucide="sun" class="w-4 h-4"></i>${greet}</p>
        <h1 class="font-display text-3xl sm:text-[40px] leading-tight font-600 mt-0.5">${name}'s ${weekday}</h1>
        <p class="text-sm text-ink-soft mt-1">${dateLabel} · age ${age} · ${stats.totalMastered} of ${stats.total} topics mastered</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button id="qmic" class="flex items-center gap-2.5 h-12 pl-1.5 pr-5 rounded-full bg-brand hover:bg-brand-dark text-paper-card text-sm font-600 transition-colors">
          <span class="w-9 h-9 rounded-full bg-butter text-ink flex items-center justify-center"><i data-lucide="mic" class="w-4.5 h-4.5"></i></span>Record what happened</button>
        <button id="qrec" class="flex items-center gap-2 h-12 px-4 rounded-full bg-paper-card text-brand text-sm font-600 hover:bg-brand-light transition-colors"><i data-lucide="pencil-line" class="w-4 h-4"></i>Note</button>
        <button id="qtime" class="flex items-center gap-2 h-12 px-4 rounded-full bg-paper-card text-brand text-sm font-600 hover:bg-brand-light transition-colors"><i data-lucide="map" class="w-4 h-4"></i>Open map</button>
        <button id="qkid" class="flex items-center gap-2 h-12 px-4 rounded-full bg-butter text-ink text-sm font-600 hover:bg-butter/80 transition-colors"><i data-lucide="sprout" class="w-4 h-4"></i>${name}'s view</button>
      </div>
    </div>
  </header>`);
  hero.querySelector('#qtime').onclick = () => navigate('graph');
  hero.querySelector('#qmic').onclick = () => openRecorder(active.id);
  hero.querySelector('#qrec').onclick = () => openRecordForm(active.id);
  hero.querySelector('#qkid').onclick = () => openKidMode();
  root.appendChild(hero);

  // Adaptive suggestion nudge
  const pending = store.pendingSuggestions(active.id);
  if (pending.length) {
    const banner = el(`<button class="w-full text-left rounded-3xl bg-butter-light p-4 mb-5 flex items-center gap-3 hover:shadow-soft transition-shadow">
      <span class="w-11 h-11 rounded-full bg-butter flex items-center justify-center shrink-0"><i data-lucide="trending-up" class="w-5 h-5 text-ink"></i></span>
      <span class="flex-1 min-w-0">
        <span class="block font-600 text-sm">${pending.length} adaptive suggestion${pending.length > 1 ? 's' : ''} for ${name}</span>
        <span class="block text-xs text-ink-soft">${name} is excelling — review ideas to raise the challenge. You decide.</span>
      </span>
      <i data-lucide="chevron-right" class="w-4 h-4 text-ink-faint shrink-0"></i>
    </button>`);
    banner.onclick = () => navigate('insights');
    root.appendChild(banner);
  }

  // Main area: today's path (hero) + a quieter side column.
  const main = el(`<div class="grid lg:grid-cols-[minmax(0,1fr)_20rem] gap-5 mb-5"></div>`);
  main.appendChild(todayCard(active, navigate));

  const side = el(`<div class="flex flex-col gap-5 min-w-0"></div>`);
  side.appendChild(weekCard(active));
  side.appendChild(overallCard(stats));
  side.appendChild(interestsCard(active));
  main.appendChild(side);
  root.appendChild(main);

  // Work on next
  const nextCard = el(`<section class="meadow-card p-5 sm:p-6 mb-5" aria-labelledby="next-h">
    <div class="flex items-baseline justify-between gap-3 mb-3">
      <h2 id="next-h" class="font-display text-xl font-600 flex items-center gap-2"><i data-lucide="footprints" class="w-5 h-5 text-brand"></i>Stepping stones next</h2>
      <span class="text-xs text-ink-faint">in mastery order</span>
    </div>
    <div id="next" class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3"></div>
  </section>`);
  const nextWrap = nextCard.querySelector('#next');
  const nexts = recommendedNext(active.id, 4);
  if (nexts.length === 0) {
    nextWrap.appendChild(el(`<p class="text-sm text-ink-faint sm:col-span-2 lg:col-span-4">Everything available is mastered — explore the map to go further.</p>`));
  } else {
    nexts.forEach(n => {
      const meta = SUBJECTS[n.topic.subject];
      const row = el(`<button class="text-left flex items-start gap-3 p-3.5 rounded-2xl card-hover" style="background:${meta.color}12">
        <span class="w-10 h-10 rounded-full bg-paper-card flex items-center justify-center shrink-0">${growthIcon(stageForStatus(n.status, true), 30)}</span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-600 leading-snug clamp-2">${esc(n.topic.name)}</span>
          <span class="block text-xs mt-0.5 truncate" style="color:${meta.color}">${n.topic.subject} · ${GROWTH[stageForStatus(n.status, true)].label}</span>
        </span>
      </button>`);
      row.onclick = () => navigate('topic', { id: n.topic.id });
      nextWrap.appendChild(row);
    });
  }
  root.appendChild(nextCard);

  // Memory: active recall + spaced practice side by side.
  const memory = el(`<div class="grid md:grid-cols-2 gap-5 mb-5"></div>`);
  const ai = store.aiAvailable();
  // Recall cards are written by the AI provider, so without one nothing is reviewable.
  const dueRecall = ai ? store.recallDueCount(active.id) : 0;
  const recallEmpty = ai ? 'Practice recall on any topic; reviews show up here when they’re due.'
    : 'Recall cards need a local AI provider. Once one is set up, reviews show up here when they’re due.';
  const practiceEmpty = ai ? 'Missed test questions come back here on a spaced schedule until they stick.'
    : 'Missed mastery-test questions come back here. Mastery tests need a local AI provider.';
  const recallCard = el(`<button class="w-full text-left rounded-3xl ${dueRecall ? 'bg-lavender-light' : 'bg-paper-card shadow-soft'} p-5 flex items-center gap-4 card-hover">
    <span class="w-12 h-12 rounded-full bg-lavender flex items-center justify-center shrink-0"><i data-lucide="brain" class="w-5.5 h-5.5 text-lavender-deep"></i></span>
    <span class="flex-1 min-w-0">
      <span class="block font-600">Active recall${dueRecall ? ` · ${dueRecall} due` : ''}</span>
      <span class="block text-sm text-ink-soft">${dueRecall ? 'Quick memory review keeps what they’ve learned from fading.' : recallEmpty}</span>
    </span>
    <span class="shrink-0 flex items-center gap-1 text-sm font-600 text-lavender-deep">${dueRecall ? 'Review' : ai ? 'Study' : ''}<i data-lucide="chevron-right" class="w-4 h-4"></i></span>
  </button>`);
  recallCard.onclick = () => openDueRecall();
  if (!ai) { recallCard.disabled = true; recallCard.classList.remove('card-hover'); }
  memory.appendChild(recallCard);

  // Spaced practice: missed mastery-test questions retried on an expanding schedule
  const duePractice = store.practiceDueCount(active.id);
  const practiceCard = el(`<button class="w-full text-left rounded-3xl ${duePractice ? 'bg-sky-light' : 'bg-paper-card shadow-soft'} p-5 flex items-center gap-4 card-hover">
    <span class="w-12 h-12 rounded-full bg-sky flex items-center justify-center shrink-0"><i data-lucide="repeat" class="w-5.5 h-5.5 text-sky-deep"></i></span>
    <span class="flex-1 min-w-0">
      <span class="block font-600">Spaced practice${duePractice ? ` · ${duePractice} due` : ''}</span>
      <span class="block text-sm text-ink-soft">${duePractice ? `Retry the mastery-test questions ${name} missed, before they fade.` : practiceEmpty}</span>
    </span>
    <span class="shrink-0 flex items-center gap-1 text-sm font-600 text-sky-deep">${duePractice ? 'Practice' : ''}<i data-lucide="chevron-right" class="w-4 h-4"></i></span>
  </button>`);
  practiceCard.onclick = () => openDuePractice();
  memory.appendChild(practiceCard);
  root.appendChild(memory);

  // Subject meadow — each with a petal ring
  root.appendChild(el(`<div class="flex items-baseline justify-between mb-3 mt-1">
    <h2 class="font-display text-xl font-600 flex items-center gap-2"><i data-lucide="flower-2" class="w-5 h-5 text-rose-deep"></i>Subjects</h2>
    <span class="text-xs text-ink-faint flex items-center gap-1"><i data-lucide="eye-off" class="w-3.5 h-3.5"></i>Only you can see this</span>
  </div>`));
  const grid = el(`<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5"></div>`);
  Object.keys(SUBJECTS).forEach(sub => {
    const meta = SUBJECTS[sub];
    const s = stats.per[sub];
    const cell = el(`<div class="relative"></div>`);
    const card = el(`<button class="w-full h-full text-left bg-paper-card shadow-soft rounded-3xl p-4 pr-10 card-hover flex items-center gap-3.5">
      ${petalRing(s.pct, meta.color, { icon: meta.icon })}
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-600 truncate">${sub}</span>
        <span class="block text-xs text-ink-faint mt-0.5">${s.mastered}/${s.total} mastered</span>
        <span class="block text-xs font-600 mt-0.5" style="color:${meta.color}">${s.pct}% complete</span>
        <span class="block mt-1.5">${growthChip(stageForArea(s.pct, s.mastered + s.inProgress > 0))}</span>
      </span>
    </button>`);
    card.onclick = () => navigate('graph', { subject: sub });
    const place = el(`<button class="absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center text-ink-faint hover:text-brand-dark hover:bg-paper" title="Placement: mark earlier ${esc(sub)} topics mastered" aria-label="Placement for ${esc(sub)}"><i data-lucide="list-checks" class="w-4 h-4"></i></button>`);
    place.onclick = () => openPlacement(active, { subject: sub });
    cell.appendChild(card);
    cell.appendChild(place);
    grid.appendChild(cell);
  });
  root.appendChild(grid);

  // Parent-visible level, XP & badges + recordings
  const extras = el(`<div class="grid lg:grid-cols-2 lg:items-start gap-5 mb-5"></div>`);
  extras.appendChild(gameCard(active));
  const recCount = store.recordingsFor(active.id).length;
  const recFolder = el(`<button class="w-full text-left rounded-3xl bg-rose-light p-5 flex items-center gap-4 card-hover">
    <span class="w-12 h-12 rounded-full bg-rose flex items-center justify-center shrink-0"><i data-lucide="folder" class="w-5.5 h-5.5 text-rose-deep"></i></span>
    <span class="flex-1 min-w-0">
      <span class="block font-600">Recordings folder</span>
      <span class="block text-sm text-ink-soft">${recCount ? `${recCount} voice recording${recCount > 1 ? 's' : ''}, grouped by section or topic` : 'Capture and revisit lesson conversations, organized by section or topic'}</span>
    </span>
    <span class="shrink-0 flex items-center gap-1 text-sm font-600 text-rose-deep">Open<i data-lucide="chevron-right" class="w-4 h-4"></i></span>
  </button>`);
  recFolder.onclick = () => openRecordingsLibrary();
  extras.appendChild(recFolder);
  root.appendChild(extras);

  // Recent activity
  const recent = recentActivity(active.id, 6);
  const recentRecords = store.recordsFor(active.id).slice(0, 4);
  const twoCol = el(`<div class="grid lg:grid-cols-2 gap-5"></div>`);

  const actCard = el(`<section class="meadow-card p-5 sm:p-6">
    <h2 class="font-display text-lg font-600 flex items-center gap-2 mb-3"><i data-lucide="sprout" class="w-5 h-5 text-brand"></i>Recent growth</h2>
    <div id="act" class="space-y-1"></div>
  </section>`);
  const actWrap = actCard.querySelector('#act');
  if (recent.length === 0) actWrap.appendChild(el(`<p class="text-sm text-ink-faint">No progress recorded yet. Open the map to begin.</p>`));
  recent.forEach(a => {
    const row = el(`<button class="w-full text-left flex items-center gap-2.5 py-2 px-2 -mx-2 rounded-xl hover:bg-paper">
      <span class="flex-1 min-w-0 text-sm truncate">${esc(a.topic.name)}</span>
      <span class="shrink-0">${growthChip(stageForStatus(a.status, true), MASTERY[a.status].label)}</span>
    </button>`);
    row.onclick = () => navigate('topic', { id: a.topic.id });
    actWrap.appendChild(row);
  });
  twoCol.appendChild(actCard);

  const recCard = el(`<section class="meadow-card p-5 sm:p-6">
    <div class="flex items-center justify-between mb-3">
      <h2 class="font-display text-lg font-600 flex items-center gap-2"><i data-lucide="notebook-pen" class="w-5 h-5 text-brand"></i>Recent evidence</h2>
      <button id="allrec" class="text-xs font-600 text-brand px-3 py-1.5 rounded-full hover:bg-brand-light">All records</button>
    </div>
    <div id="rec" class="space-y-2.5"></div>
  </section>`);
  recCard.querySelector('#allrec').onclick = () => navigate('records');
  const recWrap = recCard.querySelector('#rec');
  if (recentRecords.length === 0) recWrap.appendChild(el(`<p class="text-sm text-ink-faint">No records yet — voice, photo or a quick note all count.</p>`));
  recentRecords.forEach(r => {
    recWrap.appendChild(el(`<div class="text-sm rounded-2xl bg-paper p-3">
      <div class="flex items-center gap-2 text-xs text-ink-faint mb-0.5"><span class="capitalize font-600 text-brand">${r.type}</span><span>·</span><span>${fmtDateTime(r.createdAt)}</span></div>
      <p class="text-ink-soft clamp-2 leading-snug">${esc(r.title || r.note || '')}</p>
    </div>`));
  });
  twoCol.appendChild(recCard);
  root.appendChild(twoCol);

  // attribution footer
  root.appendChild(el(`<p class="text-[11px] text-ink-faint mt-8 text-center leading-relaxed">Curriculum from the Marble Skill Taxonomy (v1) · © Generative Spark, Inc. · licensed under ODbL 1.0 &amp; CC BY-SA 4.0</p>`));

  refreshIcons();
  return root;
}

// Today's plan, drawn as a winding meadow path with a numbered stop per topic.
function todayCard(active, navigate) {
  const todayKey = keyOf(new Date());
  const topics = topicsOn(active, todayKey);
  const extras = dailyExtras(active, todayKey);

  const card = el(`<section class="meadow-card p-5 sm:p-6 min-w-0" aria-labelledby="today-h">
    <div class="flex items-baseline justify-between gap-3 mb-4">
      <h2 id="today-h" class="font-display text-2xl font-600">Today's path</h2>
      <button id="cal" class="text-xs font-600 text-brand flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-brand-light">Open calendar<i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></button>
    </div>
    <div id="body" class="relative pl-14 space-y-4 min-w-0">
      <svg class="absolute left-0 top-0 h-full w-12" viewBox="0 0 48 400" preserveAspectRatio="none" aria-hidden="true">
        <path d="M21 8 C44 60 -2 120 21 170 C44 220 -2 290 21 392" fill="none" stroke="#f1e6cc" stroke-width="14" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
        <path d="M21 8 C44 60 -2 120 21 170 C44 220 -2 290 21 392" fill="none" stroke="#d2bc8e" stroke-width="3" stroke-linecap="round" stroke-dasharray="0.1 10" vector-effect="non-scaling-stroke"/>
      </svg>
    </div>
  </section>`);
  card.querySelector('#cal').onclick = () => navigate('calendar');
  const body = card.querySelector('#body');
  let stopNo = 0;

  const stop = (n, tone, icon) => `<span aria-hidden="true" class="absolute -left-14 top-1.5 w-10 h-10 rounded-full flex items-center justify-center" style="background:${tone.fill};color:${tone.deep};box-shadow:0 0 0 4px #fffdf8">
      <i data-lucide="${icon}" class="w-4.5 h-4.5"></i>
      <span class="absolute -right-1 -bottom-1 w-[18px] h-[18px] rounded-full bg-ink text-paper-card text-[10.5px] font-600 flex items-center justify-center">${n}</span>
    </span>`;

  // Literacy and numeracy: two options each, the child picks one.
  const choices = todaysChoices(active.id, todayKey);
  const laneTone = { literacy: STOPS[0], numeracy: STOPS[1] };
  let anyOptions = false;
  for (const [key, c] of Object.entries(choices)) {
    if (!c.options.length) continue;
    anyOptions = true;
    body.appendChild(choiceStop(active, todayKey, key, c, laneTone[key], stop(++stopNo, laneTone[key], c.lane.icon), navigate));
  }

  // Anything the calendar scheduled for today, as one compact stop.
  if (topics.length) {
    const tone = STOPS[2];
    const cal = el(`<div class="relative rounded-3xl p-4" style="background:${tone.tint}">
      ${stop(++stopNo, tone, 'calendar-days')}
      <p class="font-600 mb-2">From the calendar</p>
      <div class="space-y-1.5" data-list></div>
    </div>`);
    const list = cal.querySelector("[data-list]");
    topics.slice(0, 4).forEach(t => {
      const row = el(`<button class="w-full min-w-0 text-left flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-paper-card hover:shadow-soft transition-shadow">
        ${growthIcon(stageForStatus(store.statusOf(active.id, t.id), true), 26)}
        <span class="flex-1 min-w-0"><span class="block text-sm font-600 truncate">${esc(t.name)}</span><span class="block text-xs truncate" style="color:${tone.deep}">${t.subject}${t.domain ? ' · ' + esc(t.domain) : ''}</span></span>
        <i data-lucide="chevron-right" class="w-4 h-4 text-ink-faint shrink-0"></i>
      </button>`);
      row.onclick = () => navigate('topic', { id: t.id });
      list.appendChild(row);
    });
    body.appendChild(cal);
  } else if (!anyOptions) {
    body.appendChild(el(`<div class="relative rounded-3xl bg-paper p-4">
      ${stop(++stopNo, STOPS[3], 'sun')}
      <p class="font-600">A gentle review day</p>
      <p class="text-sm text-ink-soft mt-0.5">No new topics are scheduled today. Follow an interest, get outside, and record what happens.</p>
    </div>`));
  }

  // refresher quick action (the quiz is written by the AI provider)
  if (extras.refresher && store.aiAvailable()) {
    const t = extras.refresher;
    const ref = el(`<button class="relative w-full min-w-0 text-left flex items-center gap-3 p-4 rounded-3xl border-2 border-dashed border-butter card-hover bg-paper-card">
      ${stop(++stopNo, { fill: '#f2c14e', deep: '#2e2a24' }, 'dumbbell')}
      <span class="flex-1 min-w-0"><span class="block font-600 truncate">Refresher quiz · ${esc(t.name)}</span><span class="block text-xs text-butter-deep truncate">Keep an earlier ${t.subject} skill sharp</span></span>
      <i data-lucide="file-check-2" class="w-4 h-4 shrink-0 text-butter-deep"></i>
    </button>`);
    ref.onclick = () => openMasteryTest(t.subject, null, t);
    body.appendChild(ref);
  }

  // Record what happened — the last stop on every day's path.
  const rec = el(`<div class="relative rounded-3xl bg-brand-light p-4 flex flex-wrap items-center gap-3">
    ${stop(++stopNo, { fill: '#3f6b3b', deep: '#fffdf8' }, 'pencil-line')}
    <span class="flex-1 min-w-[10rem]"><span class="block font-600">Record what happened</span><span class="block text-xs text-ink-soft">Unplanned learning counts too.</span></span>
    <span class="flex gap-1.5">
      <button data-k="voice" class="flex items-center gap-1.5 h-10 px-3.5 rounded-full bg-paper-card text-brand text-xs font-600 hover:bg-sage-light"><i data-lucide="mic" class="w-4 h-4"></i>Voice</button>
      <button data-k="note" class="flex items-center gap-1.5 h-10 px-3.5 rounded-full bg-paper-card text-brand text-xs font-600 hover:bg-sage-light"><i data-lucide="pencil" class="w-4 h-4"></i>Note</button>
    </span>
  </div>`);
  // The day's picks are the coverage candidates; one record can cover both.
  const picked = Object.entries(choices).filter(([, c]) => c.pick && c.options.some(t => t.id === c.pick));
  const recOptions = picked.length ? {
    coverageTopicIds: picked.map(([, c]) => c.pick),
    source: { kind: 'daily-pick', key: picked.map(([key, c]) => pickKey(todayKey, key, c.pick)).join(',') },
  } : {};
  rec.querySelector('[data-k="voice"]').onclick = () => openRecorder(active.id, null, null, recOptions);
  rec.querySelector('[data-k="note"]').onclick = () => openRecordForm(active.id, null, recOptions);
  body.appendChild(rec);

  return card;
}

// One lane's pick-one stop: two option cards; tapping one makes it the pick
// (tap again to clear). The arrow opens the topic.
function choiceStop(active, dateKey, laneKey, c, tone, stopHtml, navigate) {
  const name = esc(active.name);
  const wrap = el(`<div class="relative rounded-3xl p-4" style="background:${tone.tint}" role="group" aria-label="${c.lane.label}: pick one">
    ${stopHtml}
    <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 mb-3">
      <p class="font-600">${c.lane.label} <span class="font-400 text-sm text-ink-soft">· ${c.pick ? `${name} picked` : `${name} picks one`}</span></p>
      <span class="text-xs text-ink-faint flex items-center gap-1"><i data-lucide="clock" class="w-3.5 h-3.5"></i>about 15 min</span>
    </div>
    <div class="grid sm:grid-cols-2 gap-2.5"></div>
  </div>`);
  const grid = wrap.querySelector('.grid');
  const pickTopic = c.pick ? c.options.find(t => t.id === c.pick) : null;
  c.options.forEach(t => {
    const picked = c.pick === t.id;
    const dimmed = c.pick && !picked;
    const stage = stageForStatus(store.statusOf(active.id, t.id), true);
    const card = el(`<div class="relative min-w-0">
      <button class="pick w-full h-full text-left flex items-start gap-3 p-3.5 pr-12 rounded-2xl bg-paper-card transition ${picked ? 'shadow-[0_0_0_3px_#f2c14e]' : dimmed ? 'opacity-60 hover:opacity-100' : 'hover:shadow-soft'}" aria-pressed="${picked}">
        ${growthIcon(stage, 36)}
        <span class="min-w-0">
          <span class="block text-sm font-600 leading-snug">${esc(t.name)}</span>
          <span class="block text-xs mt-0.5" style="color:${tone.deep}">${esc(t.domain || t.subject)} · ${GROWTH[stage].label}</span>
          ${picked ? `<span class="inline-flex items-center gap-1 mt-2 text-[11px] font-700 px-2 py-0.5 rounded-full bg-butter text-ink"><i data-lucide="check" class="w-3 h-3"></i>${name}'s pick</span>` : ''}
        </span>
      </button>
      <button class="open absolute top-2 right-2 w-9 h-9 rounded-full flex items-center justify-center text-ink-faint hover:bg-paper hover:text-ink" aria-label="Open ${esc(t.name)}"><i data-lucide="chevron-right" class="w-4 h-4"></i></button>
    </div>`);
    card.querySelector('.pick').onclick = () => store.pickDaily(active.id, dateKey, laneKey, picked ? null : t.id);
    card.querySelector('.open').onclick = () => navigate('topic', { id: t.id });
    grid.appendChild(card);
  });

  // Evidence for the pick: shown as recorded only once a linked record claims coverage.
  if (pickTopic) {
    const key = pickKey(dateKey, laneKey, pickTopic.id);
    const evidence = invitationEvidenceSummary(store.recordsFor(active.id), key);
    const row = el(`<div class="flex flex-wrap items-center gap-2 mt-3">
      ${evidence.coverageCount
        ? `<span class="inline-flex items-center gap-1.5 text-xs font-600 px-2.5 py-1 rounded-full bg-sage-light text-brand-dark"><i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i>Evidence recorded</span>`
        : `<span class="text-xs text-ink-soft mr-auto">How did it go?</span>`}
      <button data-k="voice" class="flex items-center gap-1.5 h-9 px-3 rounded-full bg-paper-card text-brand text-xs font-600 hover:bg-sage-light"><i data-lucide="mic" class="w-3.5 h-3.5"></i>Voice</button>
      <button data-k="note" class="flex items-center gap-1.5 h-9 px-3 rounded-full bg-paper-card text-brand text-xs font-600 hover:bg-sage-light"><i data-lucide="pencil" class="w-3.5 h-3.5"></i>Note</button>
    </div>`);
    const opts = { coverageTopicIds: [pickTopic.id], source: { kind: 'daily-pick', key } };
    row.querySelector('[data-k="voice"]').onclick = () => openRecorder(active.id, pickTopic, null, opts);
    row.querySelector('[data-k="note"]').onclick = () => openRecordForm(active.id, pickTopic, opts);
    wrap.appendChild(row);
  }

  // Parent-only: why the next topics in this lane aren't offered yet.
  if (c.blocked && c.blocked.length) {
    const parts = c.blocked.map(b => `<strong class="font-600 text-ink-soft">${esc(b.topic.name)}</strong> needs <strong class="font-600 text-ink-soft">${esc(b.needs.name)}</strong> first`);
    wrap.appendChild(el(`<p class="why-locked text-xs text-ink-faint mt-3 flex items-start gap-1.5"><i data-lucide="lock" class="w-3.5 h-3.5 shrink-0 mt-px"></i><span>Not yet: ${parts.join(' · ')}</span></p>`));
  }
  return wrap;
}

// What the learner is into: suggestion chips, their own chips and a free-text
// note, stored per learner. Shown to the parent only; nothing uses it yet.
const INTEREST_SUGGESTIONS = ['Animals', 'Building things', 'Gardening', 'Cooking', 'Music', 'Drawing', 'Space', 'Vehicles', 'Stories', 'Sports'];
function interestsCard(student) {
  const current = store.interestsFor(student.id);
  const chips = [...new Set([...INTEREST_SUGGESTIONS, ...current.chips])];
  const on = new Set(current.chips);
  const card = el(`<section class="meadow-card p-5" aria-labelledby="int-h">
    <h2 id="int-h" class="font-display text-lg font-600 flex items-center gap-2"><i data-lucide="sparkles" class="w-5 h-5 text-butter-deep"></i>${esc(student.name)}'s interests</h2>
    <p class="text-xs text-ink-faint mt-0.5 mb-3">What they're into lately. Tap to choose.</p>
    <div class="chips flex flex-wrap gap-1.5"></div>
    <form class="add flex gap-1.5 mt-2.5">
      <input name="chip" maxlength="40" placeholder="Add your own…" aria-label="Add an interest" class="flex-1 min-w-0 h-9 px-3 rounded-full border border-paper-line bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-brand/30" />
      <button class="h-9 px-3 rounded-full bg-brand-light text-brand text-xs font-600 hover:bg-sage-light">Add</button>
    </form>
    <label class="block text-xs font-600 text-ink-soft mt-3 mb-1" for="int-text">Anything else?</label>
    <textarea id="int-text" name="text" rows="2" maxlength="500" placeholder="e.g. asks lots of questions about how bridges stay up" class="w-full px-3 py-2 rounded-2xl border border-paper-line bg-paper text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand/30">${esc(current.text)}</textarea>
  </section>`);
  const save = (patch) => store.setInterests(student.id, { ...store.interestsFor(student.id), ...patch });
  const wrap = card.querySelector('.chips');
  chips.forEach(chip => {
    const sel = on.has(chip);
    const b = el(`<button type="button" aria-pressed="${sel}" class="px-3 py-1 rounded-full text-xs font-600 transition-colors ${sel ? 'bg-butter text-ink' : 'bg-paper text-ink-soft hover:bg-butter-light'}">${esc(chip)}</button>`);
    b.onclick = () => {
      const list = store.interestsFor(student.id).chips;
      save({ chips: sel ? list.filter(x => x !== chip) : [...list, chip] });
    };
    wrap.appendChild(b);
  });
  card.querySelector('.add').onsubmit = (e) => {
    e.preventDefault();
    const value = e.target.chip.value.trim();
    if (value) save({ chips: [...store.interestsFor(student.id).chips, value] });
  };
  const text = card.querySelector('textarea');
  text.onchange = () => save({ text: text.value });
  return card;
}

// The week as seven little flowers: bloomed on days with learning activity.
function weekCard(student) {
  const days = store.recentActivityDays(student.id, 7);
  const activeDays = days.filter(d => d.active).length;
  const streak = store.activityStreak(student.id);
  const today = store.activeToday(student.id);
  let msg;
  if (streak === 0) msg = 'A lesson or a recall review today will plant the first flower.';
  else if (!today) msg = `${streak}-day streak — something small today keeps it growing.`;
  else if (streak < 3) msg = 'A lovely start. Come back tomorrow to build the habit.';
  else if (streak < 7) msg = 'Nice rhythm — consistency is what makes learning stick.';
  else msg = 'A whole meadow of days. This rhythm is really paying off.';

  const flowers = days.map(d => weekFlower(d.active, d.date.toLocaleDateString(undefined, { weekday: 'short' }) + (d.active ? ' · active' : ''))).join('');
  return el(`<section class="meadow-card p-5" aria-labelledby="week-h">
    <div class="flex items-baseline justify-between">
      <h2 id="week-h" class="font-display text-lg font-600">${esc(student.name)}'s week</h2>
      ${today ? '<span class="text-[11px] font-600 px-2 py-0.5 rounded-full bg-sage text-ink">Active today</span>' : ''}
    </div>
    <div class="flex items-center justify-between mt-3 mb-2" role="img" aria-label="Active ${activeDays} of the last 7 days">${flowers}</div>
    <p class="text-xs text-ink-faint">Active ${activeDays} of the last 7 days</p>
    <p class="text-sm text-ink-soft mt-2 leading-snug">${msg}</p>
  </section>`);
}

function overallCard(stats) {
  return el(`<section class="meadow-card p-5 flex items-center gap-4">
    ${petalRing(stats.pct, '#3f6b3b', { size: 84, stroke: 9, track: '#e4eedf' })}
    <div>
      <p class="font-display text-3xl font-600">${stats.pct}%</p>
      <p class="text-sm text-ink-soft">overall mastery</p>
      <p class="text-xs text-ink-faint mt-1 flex items-center gap-1"><i data-lucide="eye-off" class="w-3.5 h-3.5"></i>Only you can see this</p>
    </div>
  </section>`);
}

function gameCard(student) {
  const g = store.gameState(student.id);
  const earned = store.earnedBadges(student.id);
  const earnedCount = Object.keys(earned).length;

  const card = el(`<section class="meadow-card p-5">
    <div class="flex items-center gap-4">
      <span class="w-14 h-14 rounded-full bg-butter flex items-center justify-center shrink-0">
        <span class="text-xl font-display font-600 text-ink">${g.level}</span>
      </span>
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <span class="font-600">Level ${g.level}</span>
          <span class="text-xs text-ink-faint">${g.into} / ${g.need} XP</span>
        </div>
        <div class="h-2.5 rounded-full bg-butter-light overflow-hidden"><div class="mbar h-full rounded-full bg-butter" style="width:${g.pct}%"></div></div>
        <p class="text-xs text-ink-faint mt-1.5">${g.xp.toLocaleString()} total XP · ${earnedCount} badge${earnedCount === 1 ? '' : 's'}</p>
      </div>
    </div>
    <div id="badges" class="flex flex-wrap gap-1.5 mt-4"></div>
  </section>`);

  const bwrap = card.querySelector('#badges');
  BADGES.forEach(b => {
    const has = !!earned[b.id];
    bwrap.appendChild(el(`<span class="w-9 h-9 rounded-full flex items-center justify-center ${has ? '' : 'opacity-30 grayscale'}" style="background:${b.color}1a" title="${b.name}${has ? '' : ' (locked)'} — ${b.desc}"><i data-lucide="${b.icon}" class="w-4.5 h-4.5" style="color:${b.color}"></i></span>`));
  });
  return card;
}
