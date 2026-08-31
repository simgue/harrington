import { SUBJECTS, getData, topicAge } from '../data.js';
import {
  blockingHardPrereqIds,
  buildSkillTree,
  buildWorldMap,
  curriculumTree,
  defaultDomain,
  findSubject,
  findDomain,
  findSection,
  localEdges,
  quietMasteryFill,
  resolveSkillNodeState,
  SKILL_STATE_CHROME,
  WORLD_MAP_VIEWBOX,
} from '../graph.js';
import * as store from '../store.js';
import { MASTERY, topicsMasteryStats, isUnlocked, blockingPrereqs } from '../mastery.js';
import { el, esc, refreshIcons, toast } from '../ui.js';
import { openLesson } from './lesson.js';
import { openRecordForm } from './records.js';

let selectedSkillId = null;

export function renderGraph(params, { navigate }) {
  const active = store.activeStudent();
  const mode = store.graphView();
  const visual = mode === 'atlas';
  const root = el(`<div class="${visual ? 'max-w-[88rem]' : 'max-w-5xl'} mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);
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
  } else if (params.subject) {
    root.appendChild(renderSkillTree(params, active, navigate));
  } else {
    root.appendChild(renderWorldMap(params, active, navigate));
  }

  refreshIcons();
  return root;
}

function rememberTreeScroll() {
  const scroller = document.querySelector('.skill-tree-scroller');
  return scroller ? { left: scroller.scrollLeft, top: scroller.scrollTop } : null;
}

function restoreTreeScroll(pos) {
  if (!pos) return;
  requestAnimationFrame(() => {
    const scroller = document.querySelector('.skill-tree-scroller');
    if (!scroller) return;
    scroller.scrollLeft = pos.left;
    scroller.scrollTop = pos.top;
  });
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

function openRealm(navigate, subjectNode, active, domainName = null) {
  const preferred = active ? store.studentAge(active) : null;
  const domain = domainName
    ? subjectNode.domains.find((node) => node.domain === domainName)
    : defaultDomain(subjectNode, preferred);
  if (!domain) {
    navigate('graph', { subject: subjectNode.subject });
    return;
  }
  selectedSkillId = null;
  navigate('graph', { subject: subjectNode.subject, domain: domain.domain });
}

function skillStateFor(active, topicId, prereqsOf) {
  if (active) {
    const status = store.statusOf(active.id, topicId);
    if (status === 'mastered') return 'mastered';
    if (status === 'learning' || status === 'practicing') return 'in-progress';
    return isUnlocked(active.id, topicId) ? 'ready' : 'locked';
  }
  return resolveSkillNodeState(topicId, {}, prereqsOf);
}

function blockerIdsFor(active, topicId, prereqsOf) {
  if (active) return blockingPrereqs(active.id, topicId).map((edge) => edge.id);
  return blockingHardPrereqIds(topicId, {}, prereqsOf);
}

function renderWorldMap(params, active, navigate) {
  const wrap = el(`<div></div>`);
  const d = getData();
  const tree = curriculumTree();
  const scene = buildWorldMap(tree);

  wrap.appendChild(el(`
    <div class="mb-5">
      <p class="text-[11px] uppercase tracking-[0.18em] text-ink-faint font-medium mb-1">World Map</p>
      <h1 class="font-display text-2xl sm:text-3xl font-600">Curriculum realms</h1>
      <p class="text-ink-soft text-sm mt-1 max-w-2xl">Eight subjects as lands on a map, not a syllabus calendar. Open a realm to walk its skill tree. Quiet tints are for you; this is not a report card.</p>
      <p class="text-xs text-ink-faint mt-2">${d.meta.topics.toLocaleString()} topics · ${d.meta.dependencies.toLocaleString()} prerequisite links · ${d.meta.version}</p>
    </div>`));

  const stage = el(`<div class="world-map relative rounded-2xl border border-[#d9c9a3] overflow-hidden"></div>`);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${WORLD_MAP_VIEWBOX.width} ${WORLD_MAP_VIEWBOX.height}`);
  svg.setAttribute('class', 'w-full h-auto world-map-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Curriculum world map of eight subject realms');

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <linearGradient id="parchment" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f4ead2"/>
      <stop offset="50%" stop-color="#ebe0c4"/>
      <stop offset="100%" stop-color="#e3d4b0"/>
    </linearGradient>
    <filter id="realm-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="3" flood-color="#5b4a28" flood-opacity="0.18"/>
    </filter>`;
  svg.appendChild(defs);

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', String(WORLD_MAP_VIEWBOX.width));
  bg.setAttribute('height', String(WORLD_MAP_VIEWBOX.height));
  bg.setAttribute('fill', 'url(#parchment)');
  svg.appendChild(bg);

  for (let i = 0; i < 7; i += 1) {
    const contour = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    contour.setAttribute('cx', '550');
    contour.setAttribute('cy', '320');
    contour.setAttribute('rx', String(420 + i * 48));
    contour.setAttribute('ry', String(240 + i * 32));
    contour.setAttribute('fill', 'none');
    contour.setAttribute('stroke', '#d2c19a');
    contour.setAttribute('stroke-width', '0.8');
    contour.setAttribute('opacity', '0.45');
    svg.appendChild(contour);
  }

  for (const realm of scene.realms) {
    const meta = SUBJECTS[realm.subject] || { color: '#3f7d5e', icon: 'map' };
    const stats = active ? topicsMasteryStats(active.id, tree.find((node) => node.subject === realm.subject)?.topics || []) : { pct: 0 };
    const fill = quietMasteryFill(meta.color, stats.pct, '#f4ead2');
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'world-realm');
    group.setAttribute('tabindex', '0');
    group.setAttribute('role', 'button');
    group.setAttribute('aria-label', `${realm.subject} realm, ${realm.domainCount} domains`);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', realm.path);
    path.setAttribute('fill', fill);
    path.setAttribute('stroke', meta.color);
    path.setAttribute('stroke-width', '2.4');
    path.setAttribute('filter', 'url(#realm-glow)');
    path.style.cursor = 'pointer';
    const subjectNode = tree.find((node) => node.subject === realm.subject);
    path.addEventListener('click', () => openRealm(navigate, subjectNode, active));
    group.appendChild(path);

    for (const cluster of realm.clusters) {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', String(cluster.x));
      dot.setAttribute('cy', String(cluster.y));
      dot.setAttribute('r', '5.5');
      dot.setAttribute('fill', meta.color);
      dot.setAttribute('fill-opacity', '0.55');
      dot.setAttribute('stroke', '#fffaf0');
      dot.setAttribute('stroke-width', '1.2');
      dot.style.cursor = 'pointer';
      dot.setAttribute('aria-label', cluster.domain);
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = cluster.domain;
      dot.appendChild(title);
      dot.addEventListener('click', (event) => {
        event.stopPropagation();
        openRealm(navigate, subjectNode, active, cluster.domain);
      });
      group.appendChild(dot);
    }

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(realm.cx));
    label.setAttribute('y', String(realm.cy - 8));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'world-realm-label');
    label.setAttribute('fill', '#1c1a17');
    label.style.pointerEvents = 'none';
    label.textContent = realm.subject;
    group.appendChild(label);

    const sub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    sub.setAttribute('x', String(realm.cx));
    sub.setAttribute('y', String(realm.cy + 12));
    sub.setAttribute('text-anchor', 'middle');
    sub.setAttribute('class', 'world-realm-sub');
    sub.setAttribute('fill', '#6f6b64');
    sub.style.pointerEvents = 'none';
    sub.textContent = `${realm.domainCount} domains`;
    group.appendChild(sub);

    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openRealm(navigate, subjectNode, active);
      }
    });
    svg.appendChild(group);
  }

  stage.appendChild(svg);
  wrap.appendChild(stage);
  wrap.appendChild(el(`<p class="text-xs text-ink-faint mt-3">Dots inside a realm are domain clusters. Click a realm, or a cluster, to open that skill tree. Future skills stay visible once you are inside.</p>`));
  return wrap;
}

function renderSkillTree(params, active, navigate) {
  const wrap = el(`<div></div>`);
  const subjectNode = findSubject(params.subject);
  if (!subjectNode) return missing(wrap, navigate, 'Realm not found.');

  const preferred = active ? store.studentAge(active) : null;
  const domainNode = params.domain
    ? findDomain(params.subject, params.domain)
    : defaultDomain(subjectNode, preferred);
  if (!domainNode) return missing(wrap, navigate, 'Domain not found.');

  const d = getData();
  const meta = SUBJECTS[domainNode.subject];
  const siblingDomains = subjectNode.domains.map((node) => node.domain);
  const graph = buildSkillTree(domainNode, d, { siblingDomains });
  const homeIds = new Set(graph.homeTopics.map((topic) => topic.id));
  if (selectedSkillId && !homeIds.has(selectedSkillId)) selectedSkillId = null;

  const selected = selectedSkillId ? d.byId.get(selectedSkillId) : null;
  const selectedState = selected ? skillStateFor(active, selected.id, d.prereqsOf) : null;
  const blockers = selected && selectedState === 'locked'
    ? blockerIdsFor(active, selected.id, d.prereqsOf)
    : [];
  const blockerSet = new Set(blockers);

  wrap.appendChild(crumbs([
    { label: 'World Map', go: () => { selectedSkillId = null; navigate('graph'); } },
    { label: domainNode.subject, go: () => openRealm(navigate, subjectNode, active) },
    { label: domainNode.domain },
  ]));

  wrap.appendChild(el(`
    <div class="mb-4">
      <p class="text-[11px] uppercase tracking-[0.18em] text-ink-faint font-medium mb-1">Skill tree</p>
      <p class="text-xs font-medium mb-2 flex flex-wrap gap-1.5">
        <span class="px-2.5 py-1 rounded-full text-white" style="background:${meta.color}">${esc(domainNode.subject)}</span>
        <span class="px-2.5 py-1 rounded-full bg-paper-card border border-paper-line text-ink-soft">${esc(domainNode.domain)}</span>
      </p>
      <h1 class="font-display text-2xl sm:text-3xl font-600">${esc(domainNode.domain)}</h1>
      <p class="text-ink-soft text-sm mt-1 leading-relaxed max-w-3xl">Skills, not weeks. Solid branches are required gates. Dashed branches help. Locked skills stay dim but visible so the road ahead is not hidden. Neighbor domains sit on the rim as gateways.</p>
    </div>`));

  wrap.appendChild(skillLegend());

  const stage = el(`<div class="skill-stage relative flex gap-0 rounded-2xl border border-paper-line bg-[#ebe4d4] overflow-hidden"></div>`);
  stage.appendChild(renderSkillDag(graph, {
    navigate,
    color: meta.color,
    active,
    prereqsOf: d.prereqsOf,
    selectedId: selectedSkillId,
    blockerSet,
    onSelect(topicId) {
      const pos = rememberTreeScroll();
      selectedSkillId = topicId;
      navigate('graph', { subject: domainNode.subject, domain: domainNode.domain });
      restoreTreeScroll(pos);
    },
  }));
  if (selected) {
    stage.appendChild(    renderQuestLog(selected, {
      active,
      navigate,
      prereqsOf: d.prereqsOf,
      unlocksOf: d.unlocksOf,
      byId: d.byId,
      state: selectedState,
      blockers,
      onSelect(topicId) {
        const pos = rememberTreeScroll();
        if (homeIds.has(topicId)) {
          selectedSkillId = topicId;
          navigate('graph', { subject: domainNode.subject, domain: domainNode.domain });
          restoreTreeScroll(pos);
          return;
        }
        const other = d.byId.get(topicId);
        if (!other) return;
        selectedSkillId = topicId;
        navigate('graph', { subject: other.subject, domain: other.domain });
      },
      onClose() {
        const pos = rememberTreeScroll();
        selectedSkillId = null;
        navigate('graph', { subject: domainNode.subject, domain: domainNode.domain });
        restoreTreeScroll(pos);
      },
    }));
  }
  wrap.appendChild(stage);

  if (graph.truncated) {
    wrap.appendChild(el(`<p class="text-xs text-ink-faint mt-2">Showing ${graph.hops.length} of ${graph.totalHops} connected domains as gateways.</p>`));
  }
  return wrap;
}

function skillLegend() {
  const items = [
    ['locked', 'Locked'],
    ['ready', 'Ready'],
    ['in-progress', 'In progress'],
    ['mastered', 'Mastered'],
  ];
  const row = el(`<div class="flex flex-wrap items-center gap-3 text-[11px] text-ink-soft mb-3"></div>`);
  for (const [id, label] of items) {
    const chrome = SKILL_STATE_CHROME[id];
    row.appendChild(el(`<span class="inline-flex items-center gap-1.5"><span class="skill-legend-orb skill-orb-state-${id}" style="background:${chrome.fill};box-shadow:0 0 0 2px ${chrome.ring}"></span>${label}</span>`));
  }
  row.appendChild(el(`<span class="inline-flex items-center gap-1.5 ml-1"><span class="w-6 border-t-2 border-ink/70"></span>Required</span>`));
  row.appendChild(el(`<span class="inline-flex items-center gap-1.5"><span class="w-6 border-t-2 border-dashed border-ink-faint"></span>Helpful</span>`));
  return row;
}

function renderSkillDag(graph, { navigate, color, active, prereqsOf, selectedId, blockerSet, onSelect }) {
  const { layout, edges } = graph;
  const scroller = el(`<div class="dag-scroller skill-tree-scroller relative flex-1 min-w-0 overflow-auto"></div>`);
  const inner = el(`<div class="relative" style="width:${Math.max(layout.width, 320)}px;height:${Math.max(layout.height, 240)}px"></div>`);
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
    path.setAttribute('stroke-width', edge.strength === 'hard' ? '2.2' : '1.5');
    path.setAttribute('stroke-linecap', 'round');
    if (edge.strength !== 'hard') path.setAttribute('stroke-dasharray', '6 5');
    svg.appendChild(path);
  }
  inner.appendChild(svg);

  for (const node of layout.nodes) {
    if (node.kind === 'hop') {
      const btn = el(`<button type="button" class="skill-gateway absolute text-left" style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px;border-color:${color}99">
        <span class="block text-xs font-600 leading-tight clamp-2">${esc(node.label)}</span>
        <span class="block text-[10px] text-ink-faint mt-0.5">${esc(node.sublabel)}</span>
      </button>`);
      btn.setAttribute('title', `${node.label} — expand this domain`);
      btn.onclick = () => {
        selectedSkillId = null;
        navigate('graph', { subject: node.hop.subject, domain: node.hop.domain });
      };
      inner.appendChild(btn);
    } else {
      const topic = node.topic;
      const state = skillStateFor(active, topic.id, prereqsOf);
      const chrome = SKILL_STATE_CHROME[state];
      const selected = topic.id === selectedId;
      const blocking = blockerSet.has(topic.id);
      const icon = state === 'locked' ? 'lock' : state === 'mastered' ? 'check' : state === 'in-progress' ? 'circle-dot' : 'circle';
      const btn = el(`<button type="button" class="skill-node absolute ${selected ? 'is-selected' : ''} ${blocking ? 'is-blocking' : ''}" style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px" title="${esc(topic.name)} · ${chrome.label}">
        <span class="skill-orb skill-orb-state-${state}" style="background:${chrome.fill};box-shadow:0 0 0 ${selected ? 4 : 2}px ${chrome.ring}${state === 'ready' ? ', 0 0 16px rgba(63,125,94,0.55)' : state === 'mastered' ? ', 0 0 0 2px #f3d56a' : ''}">
          <i data-lucide="${icon}" class="w-4 h-4 text-white"></i>
        </span>
        <span class="skill-node-label">${esc(topic.name)}</span>
      </button>`);
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
      btn.setAttribute('data-skill-state', state);
      if (state === 'locked') btn.setAttribute('aria-description', 'Locked. Foundations needed.');
      btn.onclick = () => onSelect(topic.id);
      inner.appendChild(btn);
    }
  }

  scroller.appendChild(inner);
  return scroller;
}

function edgePath(from, to) {
  const fromH = from.orb ? from.orb : from.height;
  const toH = to.orb ? to.orb : to.height;
  const x1 = from.x + (from.orb || from.width);
  const y1 = from.y + fromH / 2;
  const x2 = to.x;
  const y2 = to.y + toH / 2;
  const dx = Math.max(36, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function renderQuestLog(topic, { active, navigate, prereqsOf, unlocksOf, byId, state, blockers, onSelect, onClose }) {
  const chrome = SKILL_STATE_CHROME[state];
  const panel = el(`<aside class="quest-log shrink-0 bg-paper-card border-l border-paper-line overflow-y-auto" aria-label="Quest log"></aside>`);
  const locked = state === 'locked';
  const ready = state === 'ready';
  const mastered = state === 'mastered';
  const hardPrereqs = (prereqsOf.get(topic.id) || []).filter((edge) => edge.strength === 'hard');
  const unlocks = (unlocksOf.get(topic.id) || [])
    .map((edge) => {
      const other = byId.get(edge.id);
      return other ? { ...edge, topic: other } : null;
    })
    .filter(Boolean);

  const why = locked
    ? `Foundations needed. ${blockers.length} required skill${blockers.length === 1 ? '' : 's'} still sit in front of this one. It is not ready.`
    : ready
      ? 'Ready. Every required foundation is mastered, so this skill can be treated as open.'
      : mastered
        ? 'Mastered. This gate is open for skills that depend on it.'
        : 'In progress. Learning has started; mastery still uses the existing topic test.';

  panel.appendChild(el(`
    <div class="p-4 sm:p-5">
      <div class="flex items-start justify-between gap-3 mb-3">
        <div>
          <p class="text-[11px] uppercase tracking-[0.16em] text-ink-faint font-medium">Quest log</p>
          <h2 class="font-display text-xl font-600 leading-tight mt-1">${esc(topic.name)}</h2>
        </div>
        <button type="button" class="quest-close text-ink-faint hover:text-ink p-1" aria-label="Close quest log"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
      <p class="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full text-white mb-3" style="background:${chrome.fill}">${chrome.label}</p>
      <p class="text-sm text-ink-soft leading-relaxed">${esc(topic.description || 'A demonstrable skill in this domain.')}</p>
    </div>`));

  panel.querySelector('.quest-close').onclick = onClose;

  const body = el(`<div class="px-4 sm:px-5 pb-5 space-y-4"></div>`);

  if (locked) {
    body.appendChild(el(`<div class="rounded-xl border border-[#e6cbae] bg-[#fbf1e6] p-3.5">
      <p class="font-600 text-sm text-[#8a4a20] flex items-center gap-1.5"><i data-lucide="lock" class="w-4 h-4"></i>Foundations needed</p>
      <p class="text-sm text-[#8a5a2b] mt-1 leading-relaxed">${esc(why)}</p>
    </div>`));
  } else {
    body.appendChild(el(`<p class="text-sm text-ink-soft leading-relaxed">${esc(why)}</p>`));
  }

  if (hardPrereqs.length) {
    const box = el(`<div><p class="text-xs font-600 text-ink mb-2">Required foundations</p><div class="flex flex-wrap gap-1.5"></div></div>`);
    const chips = box.querySelector('div');
    for (const edge of hardPrereqs) {
      const other = byId.get(edge.id);
      if (!other) continue;
      const blocked = blockers.includes(edge.id);
      const chip = el(`<button type="button" class="px-2 py-1 rounded-full border text-xs ${blocked ? 'border-[#e6cbae] bg-[#fbf1e6] text-[#8a4a20]' : 'border-paper-line text-ink-soft'}">${esc(other.name)}</button>`);
      chip.onclick = () => onSelect(other.id);
      chips.appendChild(chip);
    }
    body.appendChild(box);
  }

  if (unlocks.length) {
    const box = el(`<div><p class="text-xs font-600 text-ink mb-2">What this unlocks</p><div class="flex flex-wrap gap-1.5"></div></div>`);
    const chips = box.querySelector('div');
    for (const edge of unlocks.slice(0, 8)) {
      const chip = el(`<button type="button" class="px-2 py-1 rounded-full border border-paper-line text-xs text-ink-soft">${esc(edge.topic.name)}</button>`);
      chip.onclick = () => onSelect(edge.topic.id);
      chips.appendChild(chip);
    }
    if (unlocks.length > 8) chips.appendChild(el(`<span class="text-xs text-ink-faint">+${unlocks.length - 8} more</span>`));
    body.appendChild(box);
  }

  body.appendChild(el(`<p class="text-[11px] text-ink-faint">Parent view only. Mastery is the existing 90% topic gate, not a new score.</p>`));

  const actions = el(`<div class="space-y-2"></div>`);
  const lesson = el(`<button type="button" class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium text-sm"><i data-lucide="book-open-text" class="w-4 h-4"></i>Open full lesson</button>`);
  lesson.onclick = () => openLesson(topic);
  actions.appendChild(lesson);

  const deep = el(`<button type="button" class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-paper border border-paper-line text-ink font-medium text-sm hover:border-brand/40"><i data-lucide="panel-right" class="w-4 h-4"></i>Open topic page</button>`);
  deep.onclick = () => navigate('topic', { id: topic.id });
  actions.appendChild(deep);

  if (active) {
    const evidence = el(`<button type="button" class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-paper border border-paper-line text-ink font-medium text-sm hover:border-brand/40"><i data-lucide="clipboard-pen" class="w-4 h-4"></i>Record evidence</button>`);
    evidence.onclick = () => openRecordForm(active.id, topic);
    actions.appendChild(evidence);

    if (locked) {
      const blocked = el(`<button type="button" disabled class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-paper border border-paper-line text-ink-faint text-sm cursor-not-allowed"><i data-lucide="lock" class="w-4 h-4"></i>Not ready to mark as learning</button>`);
      actions.appendChild(blocked);
    } else if (!mastered) {
      const mark = el(`<button type="button" class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-brand/30 text-brand-dark font-medium text-sm hover:bg-brand-light/60"><i data-lucide="sprout" class="w-4 h-4"></i>${state === 'in-progress' ? 'Keep as learning' : 'Mark as learning'}</button>`);
      mark.onclick = () => {
        store.setStatus(active.id, topic.id, 'learning');
        toast(`Marked as learning`, 'success');
      };
      actions.appendChild(mark);
    }
  }

  body.appendChild(actions);
  panel.appendChild(body);
  return panel;
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
      Switch to Visual to see the skill tree. Hard links are required before a mastery claim; soft links are helpful.
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
