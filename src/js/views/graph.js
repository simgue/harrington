import { SUBJECTS, getData, topicAge } from '../data.js';
import {
  atlasIslandSpan,
  buildSectionGraph,
  curriculumTree,
  defaultSectionAge,
  findSubject,
  findDomain,
  findSection,
  localEdges,
  quietMasteryFill,
} from '../graph.js';
import * as store from '../store.js';
import { MASTERY, topicsMasteryStats } from '../mastery.js';
import { el, esc, refreshIcons } from '../ui.js';

export function renderGraph(params, { navigate }) {
  const active = store.activeStudent();
  const mode = store.graphView();
  const visual = mode === 'atlas';
  const root = el(`<div class="${visual ? 'max-w-6xl' : 'max-w-5xl'} mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);
  root.appendChild(viewToggleBar());

  if (!visual) {
    if (params.subject && params.domain && params.age) {
      root.appendChild(renderSection(params, active, navigate));
    } else if (params.subject && params.domain) {
      root.appendChild(renderDomain(params, active, navigate));
    } else if (params.subject) {
      root.appendChild(renderSubject(params, active, navigate));
    } else {
      root.appendChild(renderSubjects(active, navigate));
    }
  } else if (params.subject && params.domain && params.age) {
    root.appendChild(renderConnections(params, active, navigate));
  } else if (params.subject && params.domain) {
    root.appendChild(renderAtlasDomain(params, active, navigate));
  } else {
    root.appendChild(renderAtlas(params, active, navigate));
  }

  refreshIcons();
  return root;
}

function viewToggleBar() {
  const mode = store.graphView();
  const bar = el(`<div class="flex justify-end mb-4"></div>`);
  const group = el(`<div class="inline-flex rounded-xl border border-paper-line bg-paper-card p-0.5" role="group" aria-label="Curriculum view"></div>`);
  for (const item of [
    { id: 'atlas', label: 'Visual' },
    { id: 'list', label: 'List' },
  ]) {
    const on = mode === item.id;
    const btn = el(`<button type="button" class="px-3 py-1.5 rounded-[10px] text-sm font-medium transition-colors ${on ? 'bg-brand text-white' : 'text-ink-soft hover:text-ink'}">${item.label}</button>`);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.onclick = () => store.setGraphView(item.id);
    group.appendChild(btn);
  }
  bar.appendChild(group);
  return bar;
}

function openDomain(navigate, subject, domainNode, active) {
  const preferred = active ? store.studentAge(active) : null;
  const age = defaultSectionAge(domainNode, preferred);
  if (age == null) {
    navigate('graph', { subject, domain: domainNode.domain });
    return;
  }
  navigate('graph', { subject, domain: domainNode.domain, age });
}

function renderAtlas(params, active, navigate) {
  const wrap = el(`<div></div>`);
  const d = getData();
  const tree = curriculumTree();
  const focused = params.subject || null;
  wrap.appendChild(el(`
    <div class="mb-6">
      <h1 class="font-display text-2xl sm:text-3xl font-600">Curriculum atlas</h1>
      <p class="text-ink-soft text-sm mt-1">The whole map at a glance: eight subjects as islands, domains as tiles. Open a domain to see how that age band actually connects. Mastery stays a quiet tint, for you.</p>
      <p class="text-xs text-ink-faint mt-2">${d.meta.topics.toLocaleString()} topics · ${d.meta.dependencies.toLocaleString()} prerequisite links · ${d.meta.version}</p>
    </div>`));

  if (focused) {
    wrap.appendChild(crumbs([
      { label: 'Atlas', go: () => navigate('graph') },
      { label: focused },
    ]));
  }

  const grid = el(`<div class="atlas-grid"></div>`);
  const maxCount = Math.max(1, ...tree.map((node) => node.topics.length));
  const ordered = focused
    ? [...tree.filter((node) => node.subject === focused), ...tree.filter((node) => node.subject !== focused)]
    : tree;

  for (const node of ordered) {
    const compact = !!(focused && node.subject !== focused);
    const span = compact ? Math.min(3, atlasIslandSpan(node.topics.length, maxCount)) : (focused ? 12 : atlasIslandSpan(node.topics.length, maxCount));
    grid.appendChild(atlasIsland(node, { active, navigate, span, compact, focused: node.subject === focused }));
  }
  wrap.appendChild(grid);
  return wrap;
}

function atlasIsland(node, { active, navigate, span, compact, focused }) {
  const meta = SUBJECTS[node.subject];
  const stats = active ? topicsMasteryStats(active.id, node.topics) : { mastered: 0, total: node.topics.length, pct: 0 };
  const fill = quietMasteryFill(meta.color, stats.pct);
  const island = el(`<section class="rounded-2xl border p-3 sm:p-4 min-w-0" style="grid-column: span ${span}; background:${fill}; border-color:${meta.color}55"></section>`);

  const head = el(`<button type="button" class="w-full text-left flex items-center gap-2.5 mb-3">
    <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style="background:${meta.color}"><i data-lucide="${meta.icon}" class="w-4.5 h-4.5 text-white"></i></span>
    <span class="min-w-0">
      <span class="block font-600 leading-tight">${esc(node.subject)}</span>
      <span class="block text-xs text-ink-faint">${node.domains.length} domains · ${node.topics.length} topics</span>
    </span>
  </button>`);
  head.onclick = () => navigate('graph', focused && !compact ? {} : { subject: node.subject });
  island.appendChild(head);

  if (compact) return island;

  const tiles = el(`<div class="grid gap-1.5 ${span >= 12 ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' : 'grid-cols-2'}"></div>`);
  for (const domain of node.domains) {
    const ages = domain.sections.map((section) => section.age);
    const tile = el(`<button type="button" class="atlas-tile text-left rounded-xl border border-white/70 bg-paper-card/90 px-2.5 py-2 min-w-0" title="${esc(domain.domain)}">
      <span class="block text-sm font-600 leading-snug clamp-2">${esc(domain.domain)}</span>
      <span class="block text-[11px] text-ink-faint mt-1">${domain.topics.length} topics${ages.length ? ` · ages ${ages[0]}–${ages[ages.length - 1]}` : ''}</span>
    </button>`);
    tile.onclick = () => openDomain(navigate, node.subject, domain, active);
    tiles.appendChild(tile);
  }
  island.appendChild(tiles);
  return island;
}

function renderAtlasDomain(params, active, navigate) {
  const node = findDomain(params.subject, params.domain);
  const wrap = el(`<div></div>`);
  if (!node) return missing(wrap, navigate, 'Domain not found.');

  const meta = SUBJECTS[node.subject];
  wrap.appendChild(crumbs([
    { label: 'Atlas', go: () => navigate('graph') },
    { label: node.subject, go: () => navigate('graph', { subject: node.subject }) },
    { label: node.domain },
  ]));
  wrap.appendChild(el(`
    <div class="mb-5">
      <p class="text-xs font-medium mb-2"><span class="px-2.5 py-1 rounded-full text-white" style="background:${meta.color}">${esc(node.subject)}</span></p>
      <h1 class="font-display text-2xl sm:text-3xl font-600">${esc(node.domain)}</h1>
      <p class="text-ink-soft text-sm mt-1">Pick an age band to open its connections. Neighbor sections stay as hops, not the whole curriculum.</p>
    </div>`));

  const grid = el(`<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5"></div>`);
  for (const section of node.sections) {
    const stats = active ? topicsMasteryStats(active.id, section.topics) : { mastered: 0, total: section.topics.length, pct: 0 };
    const fill = quietMasteryFill(meta.color, stats.pct);
    const tile = el(`<button type="button" class="atlas-tile text-left rounded-2xl border p-4" style="background:${fill};border-color:${meta.color}40">
      <span class="block font-600">Age ${section.age}</span>
      <span class="block text-sm text-ink-soft mt-1 leading-relaxed">${esc(section.summary || `${section.topics.length} topics in this band.`)}</span>
      <span class="block text-xs text-ink-faint mt-2">${section.topics.length} topics</span>
    </button>`);
    tile.onclick = () => navigate('graph', { subject: node.subject, domain: node.domain, age: section.age });
    grid.appendChild(tile);
  }
  wrap.appendChild(grid);
  return wrap;
}

function renderConnections(params, active, navigate) {
  const node = findSection(params.subject, params.domain, params.age);
  const wrap = el(`<div></div>`);
  if (!node) return missing(wrap, navigate, 'Section not found.');

  const d = getData();
  const meta = SUBJECTS[node.subject];
  const domainNode = findDomain(node.subject, node.domain);
  const siblingAges = (domainNode?.sections || []).map((section) => section.age);
  const graph = buildSectionGraph(node, d, { siblingAges });
  const local = graph.edges.filter((edge) => !String(edge.from).startsWith('hop:') && !String(edge.to).startsWith('hop:'));

  wrap.appendChild(crumbs([
    { label: 'Atlas', go: () => navigate('graph') },
    { label: node.subject, go: () => navigate('graph', { subject: node.subject }) },
    { label: node.domain, go: () => navigate('graph', { subject: node.subject, domain: node.domain }) },
    { label: `Age ${node.age}` },
  ]));
  wrap.appendChild(el(`
    <div class="mb-5">
      <p class="text-xs font-medium mb-2 flex flex-wrap gap-1.5">
        <span class="px-2.5 py-1 rounded-full text-white" style="background:${meta.color}">${esc(node.subject)}</span>
        <span class="px-2.5 py-1 rounded-full bg-paper-card border border-paper-line text-ink-soft">${esc(node.domain)}</span>
        <span class="px-2.5 py-1 rounded-full bg-paper-card border border-paper-line text-ink-soft">Age ${node.age}</span>
      </p>
      <h1 class="font-display text-2xl sm:text-3xl font-600">${esc(node.domain)}</h1>
      <p class="text-ink-soft text-sm mt-1 leading-relaxed">${esc(node.summary || 'Topics in this section, with the links that stay inside the band and hops to neighbors.')}</p>
    </div>`));

  wrap.appendChild(el(`<div class="rounded-xl bg-brand-light/40 border border-brand/20 p-3.5 mb-4 text-xs text-ink-soft leading-relaxed">
    <span class="font-600 text-ink">${local.length} connection${local.length === 1 ? '' : 's'} inside this section.</span>
    Solid arrows are required. Dashed arrows are helpful. Capsules on the rim are neighboring sections, not every topic in the curriculum.
    ${graph.truncated ? ` Showing ${graph.hops.length} of ${graph.totalHops} connected sections.` : ''}
  </div>`));

  wrap.appendChild(renderDag(graph, { active, navigate, color: meta.color }));
  return wrap;
}

function renderDag(graph, { active, navigate, color }) {
  const { layout, edges } = graph;
  const scroller = el(`<div class="dag-scroller relative rounded-2xl border border-paper-line bg-[#f6f1e6] overflow-auto"></div>`);
  const inner = el(`<div class="relative" style="width:${Math.max(layout.width, 320)}px;height:${Math.max(layout.height, 200)}px"></div>`);
  const pos = Object.fromEntries(layout.nodes.map((node) => [node.id, node]));

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'absolute inset-0 pointer-events-none');
  svg.setAttribute('width', String(layout.width));
  svg.setAttribute('height', String(layout.height));
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  svg.setAttribute('aria-hidden', 'true');

  for (const edge of edges) {
    const from = pos[edge.from];
    const to = pos[edge.to];
    if (!from || !to) continue;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', edgePath(from, to));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', edge.strength === 'hard' ? color : '#8a847a');
    path.setAttribute('stroke-width', edge.strength === 'hard' ? '1.8' : '1.3');
    path.setAttribute('stroke-linecap', 'round');
    if (edge.strength !== 'hard') path.setAttribute('stroke-dasharray', '5 4');
    svg.appendChild(path);
  }
  inner.appendChild(svg);

  for (const node of layout.nodes) {
    if (node.kind === 'hop') {
      const btn = el(`<button type="button" class="absolute text-left rounded-xl border border-dashed px-2.5 py-1.5 bg-[#eef4ef] hover:border-brand/50 transition-colors" style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px;border-color:${color}99">
        <span class="block text-xs font-600 leading-tight clamp-2">${esc(node.label)}</span>
        <span class="block text-[11px] text-ink-faint mt-0.5">${esc(node.sublabel)} · hop</span>
      </button>`);
      btn.onclick = () => navigate('graph', {
        subject: node.hop.subject,
        domain: node.hop.domain,
        age: node.hop.age,
      });
      inner.appendChild(btn);
    } else {
      const topic = node.topic;
      const status = active ? store.statusOf(active.id, topic.id) : 'none';
      const mastered = status === 'mastered';
      const btn = el(`<button type="button" class="absolute text-left rounded-xl border bg-paper-card px-2.5 py-1.5 hover:border-brand/40 transition-colors ${mastered ? 'opacity-70' : ''}" style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px;border-color:${color}66" title="${esc(topic.name)}">
        <span class="flex items-start gap-1.5">
          <span class="w-2 h-2 rounded-full mt-1.5 shrink-0" style="background:${MASTERY[status].color}"></span>
          <span class="min-w-0">
            <span class="block text-xs font-600 leading-tight clamp-2">${esc(topic.name)}</span>
          </span>
        </span>
      </button>`);
      btn.onclick = () => navigate('topic', { id: topic.id });
      inner.appendChild(btn);
    }
  }

  scroller.appendChild(inner);
  return scroller;
}

function edgePath(from, to) {
  const x1 = from.x + from.width;
  const y1 = from.y + from.height / 2;
  const x2 = to.x;
  const y2 = to.y + to.height / 2;
  const dx = Math.max(36, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function renderSubjects(active, navigate) {
  const wrap = el(`<div></div>`);
  const d = getData();
  wrap.appendChild(el(`
    <div class="mb-6">
      <h1 class="font-display text-2xl sm:text-3xl font-600">Curriculum list</h1>
      <p class="text-ink-soft text-sm mt-1">The full Marble map as cards. Start at a subject and keep drilling in. Mastery stays in the parent view.</p>
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
      Switch to Visual to see the arrows. Hard links are required before a mastery claim; soft links are helpful.
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
    return `<span class="px-2 py-0.5 rounded-full border ${tone}">${edge.strength === 'hard' ? 'needs' : 'helped by'} ${esc(edge.topic.name)}</span>`;
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

// Used by the topic page so a parent returns to the matching graph section.
export function graphParamsForTopic(topic) {
  return {
    subject: topic.subject,
    domain: topic.domain,
    age: topicAge(topic),
  };
}
