import * as store from '../store.js';
import { getData, SUBJECTS } from '../data.js';
import { el, refreshIcons, toast } from '../ui.js';
import { studentStats, recommendedNext, recentActivity, todaysChoices } from '../mastery.js';
import { keyOf } from '../scheduler.js';
import { BADGES, confetti } from '../game.js';
import { openMasteryTest } from './masterytest.js';
import { openRecall, openDueRecall } from './recall.js';
import { openChallenge } from './challenge.js';
import { initials } from '../ui.js';
import { openRecorder } from '../recorder.js';
import { meadowScene, growthIcon, stageForArea, stageForStatus, GROWTH } from '../meadow.js';

let overlay = null;

export function openKidMode() {
  const student = store.activeStudent();
  if (!student) { toast('Add a student first', 'error'); return; }
  if (overlay) overlay.remove();

  overlay = el(`<div class="fixed inset-0 z-[95] bg-paper overflow-y-auto"></div>`);
  document.body.appendChild(overlay);
  render(student);
}

function close() { if (overlay) { overlay.remove(); overlay = null; } }

function render(student) {
  const stats = studentStats(student.id);
  const earned = store.earnedBadges(student.id);
  const earnedCount = Object.keys(earned).length;
  const dueRecall = store.recallDueCount(student.id);
  const name = esc(student.name);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Morning' : hour < 18 ? 'Hello' : 'Evening';

  overlay.innerHTML = '';
  const wrap = el(`<div class="min-h-full bg-paper"></div>`);

  // Sky, sun and hills with the greeting — no levels, points or scores here.
  const hero = el(`<header class="meadow-hero rounded-none sm:rounded-b-[2.5rem] max-w-2xl mx-auto">
    ${meadowScene()}
    <div class="meadow-hero-body px-5 pt-5 pb-20">
      <div class="flex items-center justify-between">
        <span class="w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl font-display font-600 shadow-[0_0_0_4px_#fffdf8]" style="background:${student.color || '#3f6b3b'}">${initials(student.name)}</span>
        <button id="exit" class="flex items-center gap-1.5 h-11 px-4 rounded-full bg-paper-card text-sm font-600 text-ink" aria-label="Back to the grown-up view"><i data-lucide="lock" class="w-4 h-4"></i>Grown-ups</button>
      </div>
      <h1 class="font-display text-4xl font-600 mt-4">${greet}, ${name}!</h1>
      <p class="text-ink-soft mt-1 flex items-center gap-1.5"><i data-lucide="sun" class="w-4 h-4 text-butter-deep"></i>${new Date().toLocaleDateString(undefined, { weekday: 'long' })}</p>
    </div>
  </header>`);
  hero.querySelector('#exit').onclick = close;
  wrap.appendChild(hero);

  const main = el(`<main class="max-w-2xl mx-auto px-4 pb-10 -mt-8 relative space-y-6"></main>`);

  // One line of descriptive encouragement drawn from real progress.
  const recent = recentActivity(student.id, 1)[0];
  const cheer = recent
    ? recent.status === 'mastered'
      ? `A new bloom! You really know <strong>${esc(recent.topic.name)}</strong> now.`
      : `Your <strong>${esc(recent.topic.name)}</strong> bud is growing a little every day.`
    : 'Every garden starts with a seed. Pick something below to plant yours!';
  main.appendChild(el(`<p class="meadow-card px-5 py-4 flex items-center gap-3 text-[15px] leading-snug">${growthIcon(recent && recent.status === 'mastered' ? 'bloom' : recent ? 'bud' : 'seed', 40)}<span>${cheer}</span></p>`));

  // Today's pick-one choices: story time and number time.
  const todayKey = keyOf(new Date());
  const tones = { literacy: { bg: '#fbe5de', deep: '#a4473a' }, numeracy: { bg: '#e3eff6', deep: '#2f6285' } };
  for (const [key, c] of Object.entries(todaysChoices(student.id, todayKey))) {
    if (!c.options.length) continue;
    const tone = tones[key];
    const sec = el(`<section aria-label="${c.lane.kidLabel}: pick one">
      <h2 class="font-display text-2xl font-600 mb-2">${c.lane.kidLabel} <span class="text-lg text-ink-soft">${c.pick ? '— great choice!' : '— pick one'}</span></h2>
      <div class="grid grid-cols-2 gap-3"></div>
    </section>`);
    const grid = sec.querySelector('.grid');
    c.options.forEach(t => {
      const picked = c.pick === t.id;
      const stage = stageForStatus(store.statusOf(student.id, t.id), true);
      const b = el(`<button class="relative rounded-[1.75rem] p-4 text-left min-h-[9rem] flex flex-col transition ${picked ? 'shadow-[0_0_0_4px_#f2c14e]' : c.pick ? 'opacity-60' : ''}" style="background:${tone.bg}" aria-pressed="${picked}">
        ${picked ? '<span class="absolute top-3 right-3 w-8 h-8 rounded-full bg-butter text-ink flex items-center justify-center"><i data-lucide="check" class="w-4.5 h-4.5"></i></span>' : ''}
        ${growthIcon(stage, 52)}
        <span class="block font-display font-600 text-lg leading-tight mt-2">${esc(t.name)}</span>
        <span class="block text-sm mt-0.5" style="color:${tone.deep}">${GROWTH[stage].kid}</span>
      </button>`);
      b.onclick = () => { store.pickDaily(student.id, todayKey, key, picked ? null : t.id); render(student); };
      grid.appendChild(b);
    });
    main.appendChild(sec);
  }

  // Big, friendly actions.
  const actions = el(`<div class="grid grid-cols-2 gap-3"></div>`);
  const bigBtn = (icon, label, sub, tone, onClick, badge) => {
    const b = el(`<button class="relative rounded-[1.75rem] p-5 text-left transition-transform active:scale-95 min-h-[9rem]" style="background:${tone.bg};color:#2e2a24">
      ${badge ? `<span class="absolute top-3 right-3 min-w-[26px] h-[26px] px-1.5 rounded-full bg-paper-card text-xs font-700 flex items-center justify-center" style="color:${tone.deep}">${badge}</span>` : ''}
      <span class="w-12 h-12 rounded-full bg-paper-card flex items-center justify-center mb-3" style="color:${tone.deep}"><i data-lucide="${icon}" class="w-6 h-6"></i></span>
      <span class="block font-display font-600 text-xl leading-tight">${label}</span>
      <span class="block text-sm mt-0.5" style="color:${tone.deep}">${sub}</span>
    </button>`);
    b.onclick = onClick;
    return b;
  };

  const nexts = recommendedNext(student.id, 1);
  const nextTopic = nexts[0] ? nexts[0].topic : null;
  actions.appendChild(bigBtn('sprout', 'Plant something new', nextTopic ? esc(nextTopic.name) : 'Ask a grown-up to choose', { bg: '#e4eedf', deep: '#3f6b3b' },
    () => { if (nextTopic) openMasteryTest(nextTopic.subject, null, nextTopic); else toast('Ask a grown-up to pick something new'); }));
  actions.appendChild(bigBtn('brain', 'Memory walk', dueRecall ? 'Some are ready for you' : 'Keep it growing', { bg: '#eee8f6', deep: '#5b4a86' },
    () => { if (dueRecall) openDueRecall(); else if (nextTopic) openRecall(nextTopic); else toast('Learn something first, then come back!'); }, dueRecall || 0));

  const d = getData();
  const mastered = Object.entries(store.progressFor(student.id)).filter(([id, v]) => v.status === 'mastered' && d.byId.has(id)).map(([id]) => d.byId.get(id));
  const chTopic = mastered.length ? mastered[Math.floor(Math.random() * mastered.length)] : null;
  actions.appendChild(bigBtn('zap', 'Beat the clock', chTopic ? 'A speedy challenge!' : 'Grow a bloom first', { bg: '#fbecc4', deep: '#8a6412' },
    () => { if (chTopic) openChallenge(chTopic); else toast('Grow a bloom to unlock challenges!'); }));
  actions.appendChild(bigBtn('medal', 'My collection', earnedCount ? 'See your treasures' : 'Treasures to find', { bg: '#fbe5de', deep: '#a4473a' }, () => renderBadges(student)));
  main.appendChild(actions);

  const tell = el(`<button class="w-full h-16 rounded-full bg-brand hover:bg-brand-dark text-paper-card font-display text-xl font-600 flex items-center justify-center gap-3 shadow-soft">
    <span class="w-11 h-11 rounded-full bg-butter text-ink flex items-center justify-center"><i data-lucide="mic" class="w-5.5 h-5.5"></i></span>Tell about my day</button>`);
  tell.onclick = () => openRecorder(student.id);
  main.appendChild(tell);

  // My garden: one plant per subject, described in words, never numbers.
  const garden = el(`<section aria-labelledby="garden-h">
    <h2 id="garden-h" class="font-display text-2xl font-600 mb-3 flex items-center gap-2"><i data-lucide="flower-2" class="w-6 h-6 text-rose-deep"></i>My garden</h2>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3"></div>
  </section>`);
  const bed = garden.querySelector('div.grid');
  Object.keys(SUBJECTS).forEach(sub => {
    const meta = SUBJECTS[sub]; const s = stats.per[sub];
    const stage = stageForArea(s.pct, s.mastered + s.inProgress > 0);
    const g = GROWTH[stage];
    bed.appendChild(el(`<div class="rounded-3xl p-3 pt-4 flex flex-col items-center text-center" style="background:${g.tint}">
      ${growthIcon(stage, 64)}
      <span class="text-sm font-600 mt-1 leading-tight flex items-center gap-1"><i data-lucide="${meta.icon}" class="w-3.5 h-3.5" style="color:${meta.color}"></i>${sub}</span>
      <span class="text-xs font-600 mt-0.5" style="color:${g.color}">${g.kid}</span>
    </div>`));
  });
  main.appendChild(garden);

  wrap.appendChild(main);
  overlay.appendChild(wrap);
  refreshIcons();
}

function renderBadges(student) {
  const earned = store.earnedBadges(student.id);
  overlay.innerHTML = '';
  const wrap = el(`<div class="min-h-full bg-paper"></div>`);
  const top = el(`<div class="max-w-2xl mx-auto px-4 pt-5 flex items-center justify-between">
    <button id="back" class="flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink"><i data-lucide="arrow-left" class="w-4 h-4"></i>Back</button>
    <button id="exit" class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-paper-card border border-paper-line text-sm font-medium"><i data-lucide="x" class="w-4 h-4"></i>Exit</button>
  </div>`);
  top.querySelector('#back').onclick = () => render(student);
  top.querySelector('#exit').onclick = close;
  wrap.appendChild(top);

  const earnedCount = Object.keys(earned).length;
  const main = el(`<div class="max-w-2xl mx-auto px-4 py-5">
    <p class="font-display text-3xl font-600 text-center">My collection</p>
    <p class="text-sm text-ink-soft text-center mb-5">${earnedCount} of ${BADGES.length} unlocked — collect them all!</p>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3"></div>
  </div>`);
  const grid = main.querySelector('div.grid');
  BADGES.forEach(b => {
    const has = !!earned[b.id];
    grid.appendChild(el(`<div class="rounded-3xl p-4 text-center ${has ? 'bg-paper-card shadow-soft' : 'bg-paper border-2 border-dashed border-paper-line'}">
      <div class="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-2 ${has ? '' : 'opacity-30 grayscale'}" style="background:${b.color}1a"><i data-lucide="${has ? b.icon : 'lock'}" class="w-7 h-7" style="color:${b.color}"></i></div>
      <p class="text-sm font-700 ${has ? '' : 'text-ink-faint'}">${b.name}</p>
      <p class="text-[11px] text-ink-faint mt-0.5 leading-snug">${b.desc}</p>
    </div>`));
  });
  wrap.appendChild(main);
  overlay.appendChild(wrap);
  refreshIcons();
  if (earnedCount) setTimeout(() => confetti(60), 200);
}

function esc(s) { return String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
