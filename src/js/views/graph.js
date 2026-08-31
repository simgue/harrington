import { SUBJECTS, getData, topicAge } from '../data.js';
import { curriculumTree, findSubject, findDomain, findSection, localEdges } from '../graph.js';
import * as store from '../store.js';
import { MASTERY, topicsMasteryStats } from '../mastery.js';
import { el, refreshIcons } from '../ui.js';

export function renderGraph(params, { navigate }) {
  const active = store.activeStudent();
  const root = el(`<div class="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);

  if (params.subject && params.domain && params.age) {
    root.appendChild(renderSection(params, active, navigate));
  } else if (params.subject && params.domain) {
    root.appendChild(renderDomain(params, active, navigate));
  } else if (params.subject) {
    root.appendChild(renderSubject(params, active, navigate));
  } else {
    root.appendChild(renderSubjects(active, navigate));
  }

  refreshIcons();
  return root;
}

function renderSubjects(active, navigate) {
  const wrap = el(`<div></div>`);
  const d = getData();
  wrap.appendChild(el(`
    <div class="mb-6">
      <h1 class="font-display text-2xl sm:text-3xl font-600">Curriculum graph</h1>
      <p class="text-ink-soft text-sm mt-1">The full Marble map, for you. Start at a subject and keep drilling in. Mastery stays in the parent view.</p>
      <p class="text-xs text-ink-faint mt-2">${d.meta.topics.toLocaleString()} topics · ${d.meta.dependencies.toLocaleString()} prerequisite links · ${d.meta.version}</p>
    </div>`));

  const grid = el(`<div class="grid sm:grid-cols-2 gap-3"></div>`);
  for (const node of curriculumTree()) {
    const meta = SUBJECTS[node.subject];
    const stats = active ? topicsMasteryStats(active.id, node.topics) : { mastered: 0, total: node.topics.length, pct: 0 };
    const card = el(`<button class="text-left bg-paper-card border border-paper-line rounded-2xl p-4 card-hover">
      <span class="flex items-center gap-3 mb-3">
        <span class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style="background:${meta.color}"><i data-lucide="${meta.icon}" class="w-5 h-5 text-white"></i></span>
        <span class="min-w-0">
          <span class="block font-600">${node.subject}</span>
          <span class="block text-xs text-ink-faint">${node.domains.length} domains · ${node.topics.length} topics</span>
        </span>
      </span>
      ${parentMastery(stats)}
    </button>`);
    card.onclick = () => navigate('graph', { subject: node.subject });
    grid.appendChild(card);
  }
  wrap.appendChild(grid);
  return wrap;
}

function renderSubject(params, active, navigate) {
  const node = findSubject(params.subject);
  const wrap = el(`<div></div>`);
  if (!node) return missing(wrap, navigate, 'Subject not found.');

  const meta = SUBJECTS[node.subject];
  const stats = active ? topicsMasteryStats(active.id, node.topics) : { mastered: 0, total: node.topics.length, pct: 0 };
  wrap.appendChild(crumbs([
    { label: 'Curriculum', go: () => navigate('graph') },
    { label: node.subject },
  ]));
  wrap.appendChild(el(`
    <div class="mb-5">
      <div class="flex items-center gap-2 mb-2">
        <span class="w-9 h-9 rounded-xl flex items-center justify-center" style="background:${meta.color}"><i data-lucide="${meta.icon}" class="w-4.5 h-4.5 text-white"></i></span>
        <h1 class="font-display text-2xl sm:text-3xl font-600">${node.subject}</h1>
      </div>
      <p class="text-ink-soft text-sm">Domains in this subject. Open one to see its age-banded sections and the topics inside them.</p>
      <div class="mt-3">${parentMastery(stats)}</div>
    </div>`));

  const list = el(`<div class="space-y-2.5"></div>`);
  for (const domain of node.domains) {
    const domainStats = active ? topicsMasteryStats(active.id, domain.topics) : { mastered: 0, total: domain.topics.length, pct: 0 };
    const row = el(`<button class="w-full text-left bg-paper-card border border-paper-line rounded-2xl p-4 hover:border-brand/40 transition-colors">
      <span class="flex items-start justify-between gap-3">
        <span>
          <span class="block font-600">${domain.domain}</span>
          <span class="block text-xs text-ink-faint mt-1">${domain.sections.length} age band${domain.sections.length === 1 ? '' : 's'} · ${domain.topics.length} topics</span>
        </span>
        <i data-lucide="chevron-right" class="w-4 h-4 text-ink-faint shrink-0 mt-1"></i>
      </span>
      <span class="block mt-3">${parentMastery(domainStats)}</span>
    </button>`);
    row.onclick = () => navigate('graph', { subject: node.subject, domain: domain.domain });
    list.appendChild(row);
  }
  wrap.appendChild(list);
  return wrap;
}

function renderDomain(params, active, navigate) {
  const node = findDomain(params.subject, params.domain);
  const wrap = el(`<div></div>`);
  if (!node) return missing(wrap, navigate, 'Domain not found.');

  const meta = SUBJECTS[node.subject];
  const stats = active ? topicsMasteryStats(active.id, node.topics) : { mastered: 0, total: node.topics.length, pct: 0 };
  wrap.appendChild(crumbs([
    { label: 'Curriculum', go: () => navigate('graph') },
    { label: node.subject, go: () => navigate('graph', { subject: node.subject }) },
    { label: node.domain },
  ]));
  wrap.appendChild(el(`
    <div class="mb-5">
      <p class="text-xs font-medium mb-2"><span class="px-2.5 py-1 rounded-full text-white" style="background:${meta.color}">${node.subject}</span></p>
      <h1 class="font-display text-2xl sm:text-3xl font-600">${node.domain}</h1>
      <p class="text-ink-soft text-sm mt-1">Each band is a teachable section: one domain at one age. Open a band to see its topics and how they connect.</p>
      <div class="mt-3">${parentMastery(stats)}</div>
    </div>`));

  const list = el(`<div class="space-y-2.5"></div>`);
  for (const section of node.sections) {
    const sectionStats = active ? topicsMasteryStats(active.id, section.topics) : { mastered: 0, total: section.topics.length, pct: 0 };
    const row = el(`<button class="w-full text-left bg-paper-card border border-paper-line rounded-2xl p-4 hover:border-brand/40 transition-colors">
      <span class="flex items-start justify-between gap-3">
        <span>
          <span class="block font-600">Age ${section.age}</span>
          <span class="block text-sm text-ink-soft mt-1 leading-relaxed">${section.summary || `${section.topics.length} topics in this band.`}</span>
        </span>
        <i data-lucide="chevron-right" class="w-4 h-4 text-ink-faint shrink-0 mt-1"></i>
      </span>
      <span class="block mt-3">${parentMastery(sectionStats)}</span>
    </button>`);
    row.onclick = () => navigate('graph', { subject: node.subject, domain: node.domain, age: section.age });
    list.appendChild(row);
  }
  wrap.appendChild(list);
  return wrap;
}

function renderSection(params, active, navigate) {
  const node = findSection(params.subject, params.domain, params.age);
  const wrap = el(`<div></div>`);
  if (!node) return missing(wrap, navigate, 'Section not found.');

  const d = getData();
  const meta = SUBJECTS[node.subject];
  const stats = active ? topicsMasteryStats(active.id, node.topics) : { mastered: 0, total: node.topics.length, pct: 0 };
  const edges = localEdges(node.topics, d.prereqsOf);

  wrap.appendChild(crumbs([
    { label: 'Curriculum', go: () => navigate('graph') },
    { label: node.subject, go: () => navigate('graph', { subject: node.subject }) },
    { label: node.domain, go: () => navigate('graph', { subject: node.subject, domain: node.domain }) },
    { label: `Age ${node.age}` },
  ]));
  wrap.appendChild(el(`
    <div class="mb-5">
      <p class="text-xs font-medium mb-2 flex flex-wrap gap-1.5">
        <span class="px-2.5 py-1 rounded-full text-white" style="background:${meta.color}">${node.subject}</span>
        <span class="px-2.5 py-1 rounded-full bg-paper-card border border-paper-line text-ink-soft">${node.domain}</span>
        <span class="px-2.5 py-1 rounded-full bg-paper-card border border-paper-line text-ink-soft">Age ${node.age}</span>
      </p>
      <h1 class="font-display text-2xl sm:text-3xl font-600">${node.domain}</h1>
      <p class="text-ink-soft text-sm mt-1 leading-relaxed">${node.summary || 'Topics in this section, with the prerequisite links that stay inside the band.'}</p>
      <div class="mt-3">${parentMastery(stats)}</div>
    </div>`));

  if (edges.length) {
    wrap.appendChild(el(`<div class="rounded-xl bg-brand-light/40 border border-brand/20 p-3.5 mb-5 text-xs text-ink-soft leading-relaxed">
      <span class="font-600 text-ink">${edges.length} connection${edges.length === 1 ? '' : 's'} inside this section.</span>
      Arrows show what a topic depends on. Hard links are required before a mastery claim; soft links are helpful.
    </div>`));
  }

  const list = el(`<div class="space-y-2.5"></div>`);
  for (const topic of node.topics) {
    const status = active ? store.statusOf(active.id, topic.id) : 'none';
    const prereqs = (d.prereqsOf.get(topic.id) || []).map((edge) => {
      const other = d.byId.get(edge.id);
      return other ? { ...edge, topic: other } : null;
    }).filter(Boolean);
    const unlockCount = (d.unlocksOf.get(topic.id) || []).length;
    const row = el(`<button class="w-full text-left bg-paper-card border border-paper-line rounded-2xl p-4 hover:border-brand/40 transition-colors">
      <span class="flex items-start gap-3">
        <span class="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style="background:${MASTERY[status].color}" title="${MASTERY[status].label}"></span>
        <span class="min-w-0 flex-1">
          <span class="block font-600">${topic.name}</span>
          <span class="block text-sm text-ink-soft mt-1 leading-relaxed">${topic.description || ''}</span>
          <span class="block text-xs text-ink-faint mt-2">${MASTERY[status].label} · ages ${topic.ageRangeStart}–${topic.ageRangeEnd}${unlockCount ? ` · unlocks ${unlockCount}` : ''}</span>
          ${prereqLine(prereqs)}
        </span>
        <i data-lucide="chevron-right" class="w-4 h-4 text-ink-faint shrink-0 mt-1"></i>
      </span>
    </button>`);
    row.onclick = () => navigate('topic', { id: topic.id });
    list.appendChild(row);
  }
  wrap.appendChild(list);
  return wrap;
}

function prereqLine(prereqs) {
  if (!prereqs.length) return '';
  const chips = prereqs.slice(0, 4).map((edge) => {
    const tone = edge.strength === 'hard' ? 'border-[#e6cbae] text-[#8a4a20]' : 'border-paper-line text-ink-soft';
    return `<span class="px-2 py-0.5 rounded-full border ${tone}">${edge.strength === 'hard' ? 'needs' : 'helped by'} ${escapeHtml(edge.topic.name)}</span>`;
  }).join('');
  const extra = prereqs.length > 4 ? `<span class="text-ink-faint">+${prereqs.length - 4} more</span>` : '';
  return `<span class="flex flex-wrap gap-1.5 mt-2">${chips}${extra}</span>`;
}

function parentMastery(stats) {
  const width = Math.max(0, Math.min(100, stats.pct));
  return `<span class="block">
    <span class="flex items-center justify-between text-[11px] text-ink-faint mb-1">
      <span>Parent view</span>
      <span>${stats.mastered} of ${stats.total} mastered</span>
    </span>
    <span class="block h-1.5 rounded-full bg-paper-line overflow-hidden"><span class="block h-full rounded-full bg-brand" style="width:${width}%"></span></span>
  </span>`;
}

function crumbs(items) {
  const nav = el(`<nav class="flex flex-wrap items-center gap-1.5 text-sm text-ink-soft mb-4"></nav>`);
  items.forEach((item, index) => {
    if (index) nav.appendChild(el(`<i data-lucide="chevron-right" class="w-3.5 h-3.5 text-ink-faint"></i>`));
    if (item.go) {
      const btn = el(`<button class="hover:text-ink">${item.label}</button>`);
      btn.onclick = item.go;
      nav.appendChild(btn);
    } else {
      nav.appendChild(el(`<span class="text-ink font-medium">${item.label}</span>`));
    }
  });
  return nav;
}

function missing(wrap, navigate, message) {
  wrap.appendChild(el(`<p class="text-ink-soft mb-4">${message}</p>`));
  const back = el(`<button class="text-sm font-medium text-brand-dark">Back to curriculum</button>`);
  back.onclick = () => navigate('graph');
  wrap.appendChild(back);
  return wrap;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Used by the topic page so a parent returns to the matching graph section.
export function graphParamsForTopic(topic) {
  return {
    subject: topic.subject,
    domain: topic.domain,
    age: topicAge(topic),
  };
}
