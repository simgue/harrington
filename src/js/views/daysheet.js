// Parent Day Sheet: reconstructs the full teaching material for the children a
// parent is covering today (from the topic ids on shared Commune cards) and
// prints one packet with everything for the day.
//
// Nothing private is involved: a card carries only topic references + a note.
// The lesson, activities, and resources are all rebuilt locally from the topic
// (which carries its own age range), using the same generator + cache the
// normal lesson view uses. AI generation is disabled until a family-controlled
// provider is configured; completed results are cached per topic.

import { getData } from '../data.js';
import * as store from '../store.js';
import { aiLesson } from '../ai.js';
import { activityIdeas, gameIdeas, referenceLinks, videoLinks } from '../resources.js';
import { el, refreshIcons, toast, openModal } from '../ui.js';

function esc(s) { return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

// Rebuild one topic's teaching payload (lesson + activities + resources),
// reusing the shared per-topic lesson cache.
async function buildTopicMaterial(topic) {
  const cacheId = 'topic:' + topic.id;
  let lesson = await store.getCachedLesson(cacheId);
  if (!lesson) {
    lesson = await aiLesson(topic);
    try { await store.saveCachedLesson(cacheId, lesson); } catch {}
  }
  return {
    topic,
    lesson,
    activities: activityIdeas(topic),
    games: gameIdeas(topic),
    references: referenceLinks(topic),
    videos: videoLinks(topic),
  };
}

// Resolve a card's topic ids to topic objects (dropping any that no longer
// exist in the current taxonomy).
function topicsForCard(card) {
  const d = getData();
  return (card.topicIds || []).map((id) => d.byId.get(id)).filter(Boolean);
}

// Count how many lessons a set of cards will need (for progress messaging).
function totalTopics(cards) {
  return cards.reduce((n, c) => n + topicsForCard(c).length, 0);
}

// Build teaching material for every topic across the given cards, reporting
// progress. Returns [{ card, topics: [material...] }].
async function gatherAll(cards, onProgress) {
  const total = totalTopics(cards);
  let done = 0;
  const out = [];
  for (const card of cards) {
    const topics = topicsForCard(card);
    const materials = [];
    for (const topic of topics) {
      onProgress?.(++done, total, topic.name);
      try { materials.push(await buildTopicMaterial(topic)); }
      catch { /* skip a topic that fails to generate rather than abort the sheet */ }
    }
    out.push({ card, materials });
  }
  return out;
}

// Public: gather materials (with a progress modal) then open a printable sheet.
export async function printDaySheet(cards, dateLabel) {
  const usable = cards.filter((c) => topicsForCard(c).length);
  if (!usable.length) { toast('No topics to prepare for today', 'error'); return; }

  const body = el(`<div class="p-6 text-center">
    <div class="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
    <p class="text-sm font-600" id="pmsg">Preparing the day sheet…</p>
    <p class="text-xs text-ink-faint mt-1" id="psub">Rebuilding lessons for each topic. The first time takes a few seconds each.</p>
  </div>`);
  const m = openModal(body);
  const msg = body.querySelector('#pmsg');
  const sub = body.querySelector('#psub');
  refreshIcons();

  let gathered;
  try {
    gathered = await gatherAll(usable, (done, total, name) => {
      msg.textContent = `Preparing lesson ${done} of ${total}…`;
      sub.textContent = name;
    });
  } catch (e) {
    m.close();
    toast('Could not build the day sheet', 'error');
    return;
  }
  m.close();
  openPrintWindow(gathered, dateLabel);
}

// Public: prepare + print a single child's card.
export function printChildSheet(card, dateLabel) {
  return printDaySheet([card], dateLabel);
}

// ---- printable document ----------------------------------------------------

function lessonHtml(L) {
  if (!L) return '';
  const ul = (arr) => (arr && arr.length ? `<ul>${arr.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '');
  const ol = (arr) => (arr && arr.length ? `<ol>${arr.map((i) => `<li>${esc(i)}</li>`).join('')}</ol>` : '');
  const sec = (title, html) => (html ? `<h4>${title}</h4>${html}` : '');
  const teach = (L.teach || []).map((s, i) =>
    `<div class="step"><strong>${i + 1}. ${esc(s.title || '')}</strong>${s.say ? `<p><em>Say:</em> ${esc(s.say)}</p>` : ''}${s.do ? `<p><em>Do:</em> ${esc(s.do)}</p>` : ''}</div>`).join('');
  const tips = L.parentTips || {};
  return [
    L.objective ? `<div class="obj"><strong>Objective:</strong> ${esc(L.objective)}${L.duration ? ` &middot; <em>${esc(L.duration)}</em>` : ''}</div>` : '',
    (tips.focus || tips.struggles || tips.advice)
      ? `<div class="tips">${tips.focus ? `<p><strong>Focus on:</strong> ${esc(tips.focus)}</p>` : ''}${tips.struggles ? `<p><strong>Likely struggles:</strong> ${esc(tips.struggles)}</p>` : ''}${tips.advice ? `<p><strong>Advice:</strong> ${esc(tips.advice)}</p>` : ''}</div>`
      : '',
    sec('Materials', ul(L.materials)),
    sec('Get started', L.hook ? `<p>${esc(L.hook)}</p>` : ''),
    sec('Teach it', teach),
    sec('Practice together', ul(L.guidedPractice)),
    L.independentActivity ? sec('Independent activity', `<p><strong>${esc(L.independentActivity.title || '')}</strong></p>${ol(L.independentActivity.steps)}`) : '',
    sec('Questions', ul(L.questions)),
    sec('Watch out for', ul(L.commonMistakes)),
    L.masteryCheck ? sec('Mastery check', `<p>${esc(L.masteryCheck)}</p>`) : '',
    L.extension ? sec('Extension', `<p>${esc(L.extension)}</p>`) : '',
  ].join('');
}

function materialHtml(mat) {
  const t = mat.topic;
  const acts = [...(mat.activities || []).slice(0, 2), ...(mat.games || []).slice(0, 1)]
    .map((a) => `<li><strong>${esc(a.title)}:</strong> ${esc(a.body)}</li>`).join('');
  const links = [...(mat.references || []), ...(mat.videos || [])]
    .map((l) => `<li>${esc(l.label)}: <span class="url">${esc(l.url)}</span></li>`).join('');
  return `<div class="topic">
    <h3>${esc(t.name)}</h3>
    <div class="tmeta">${esc(t.subject)} &middot; ${esc(t.domain)} &middot; Ages ${t.ageRangeStart}–${t.ageRangeEnd}</div>
    ${lessonHtml(mat.lesson)}
    ${acts ? `<h4>Hands-on ideas</h4><ul>${acts}</ul>` : ''}
    ${links ? `<h4>Resources</h4><ul class="links">${links}</ul>` : ''}
  </div>`;
}

function childSection(entry) {
  const { card, materials } = entry;
  const topicsHtml = materials.length
    ? materials.map(materialHtml).join('')
    : '<p><em>No teachable topics were shared for this child.</em></p>';
  return `<section class="child">
    <div class="childhead">
      <h2>${esc(card.childDisplayName)}</h2>
      <span class="childsub">${esc(card.subject || '')}${card.ownerName ? ` &middot; shared by ${esc(card.ownerName)}` : ''}</span>
    </div>
    ${card.note ? `<div class="note"><strong>Note from ${esc(card.ownerName || 'their parent')}:</strong> ${esc(card.note)}</div>` : ''}
    ${topicsHtml}
  </section>`;
}

function openPrintWindow(gathered, dateLabel) {
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print the day sheet', 'error'); return; }
  const sections = gathered.map(childSection).join('');
  const kids = gathered.map((g) => esc(g.card.childDisplayName)).join(', ');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Commune Day Sheet${dateLabel ? ' — ' + esc(dateLabel) : ''}</title>
  <style>
    body{font-family:Georgia,serif;max-width:760px;margin:28px auto;padding:0 22px;color:#1c1a17;line-height:1.5}
    .head{border-bottom:2px solid #1c1a17;padding-bottom:10px;margin-bottom:8px}
    .head h1{font-size:24px;margin:0}
    .head .meta{color:#8a847a;font-size:13px;margin-top:2px}
    section.child{page-break-before:always;padding-top:14px}
    section.child:first-of-type{page-break-before:auto}
    .childhead{display:flex;align-items:baseline;gap:10px;border-bottom:1px solid #ece7dd;padding-bottom:6px;margin-bottom:8px}
    .childhead h2{font-size:20px;margin:0;color:#2f6049}
    .childsub{font-size:12px;color:#8a847a}
    .note{background:#fbf4ea;border:1px solid #e6cbae;border-radius:8px;padding:8px 12px;margin:8px 0 14px;font-size:14px}
    .topic{margin:0 0 18px;padding:0 0 6px}
    .topic h3{font-size:17px;margin:14px 0 2px;color:#1c1a17}
    .tmeta{color:#8a847a;font-size:12px;margin-bottom:6px}
    h4{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#3f7d5e;margin:12px 0 4px}
    .obj{background:#e7f0ea;padding:8px 12px;border-radius:8px;font-size:14px;margin:6px 0}
    .tips{background:#fbf4ea;padding:8px 12px;border-radius:8px;margin:6px 0}
    .tips p{margin:3px 0}
    .step{margin-bottom:8px}
    ul,ol{margin:5px 0 5px 20px}
    li{margin-bottom:3px}
    p{margin:3px 0}
    .links .url{color:#3d6b93;font-size:12px;word-break:break-all}
    @media print{body{margin:0}}
  </style></head><body>
    <div class="head">
      <h1>Commune Day Sheet</h1>
      <div class="meta">${dateLabel ? esc(dateLabel) + ' &middot; ' : ''}Covering: ${kids}</div>
    </div>
    ${sections}
    <script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script>
  </body></html>`);
  w.document.close();
}
