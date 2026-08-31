// Curriculum hierarchy helpers. The browser view and tests share this module
// so subject → domain → section → topic drill-down stays consistent.

import { SUBJECTS, getData, orderTopics, topicAge } from './data.js';

export function buildCurriculumTree(data, subjects = SUBJECTS) {
  const clusterMap = data.clusterMap instanceof Map
    ? data.clusterMap
    : new Map(Object.entries(data.clusterMap || {}));
  const bySubject = data.bySubject || {};

  return Object.keys(subjects).map((subject) => {
    const topics = orderTopics(bySubject[subject] || []);
    const domains = new Map();
    for (const topic of topics) {
      const domain = topic.domain || 'General';
      if (!domains.has(domain)) domains.set(domain, []);
      domains.get(domain).push(topic);
    }

    return {
      subject,
      topics,
      domains: [...domains.entries()].map(([domain, domainTopics]) => {
        const byAge = new Map();
        for (const topic of domainTopics) {
          const age = topicAge(topic);
          if (!byAge.has(age)) byAge.set(age, []);
          byAge.get(age).push(topic);
        }
        return {
          subject,
          domain,
          topics: domainTopics,
          sections: [...byAge.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([age, sectionTopics]) => ({
              subject,
              domain,
              age,
              topics: sectionTopics,
              summary: clusterMap.get(`${subject}|${domain}|${age}`) || '',
            })),
        };
      }),
    };
  });
}

export function curriculumTree() {
  return buildCurriculumTree(getData());
}

export function findSubject(subject) {
  return curriculumTree().find((node) => node.subject === subject) || null;
}

export function findDomain(subject, domain) {
  return findSubject(subject)?.domains.find((node) => node.domain === domain) || null;
}

export function findSection(subject, domain, age) {
  const numericAge = Number(age);
  return findDomain(subject, domain)?.sections.find((node) => node.age === numericAge) || null;
}

export function localEdges(topics, prereqsOf) {
  const ids = new Set(topics.map((topic) => topic.id));
  const edges = [];
  for (const topic of topics) {
    for (const prereq of prereqsOf.get(topic.id) || []) {
      if (ids.has(prereq.id)) {
        edges.push({ from: prereq.id, to: topic.id, strength: prereq.strength });
      }
    }
  }
  return edges;
}

export const GRAPH_VIEW_ATLAS = 'atlas';
export const GRAPH_VIEW_LIST = 'list';
export const MAX_SECTION_HOPS = 6;

export function normalizeGraphView(mode) {
  return mode === GRAPH_VIEW_LIST ? GRAPH_VIEW_LIST : GRAPH_VIEW_ATLAS;
}

export function sectionKey(subject, domain, age) {
  return `${subject}|${domain}|${Number(age)}`;
}

export function topicSectionKey(topic) {
  return sectionKey(topic.subject, topic.domain, topicAge(topic));
}

export function hopNodeId(key) {
  return `hop:${key}`;
}

export function defaultSectionAge(domainNode, preferredAge = null) {
  const ages = (domainNode?.sections || []).map((section) => section.age);
  if (!ages.length) return null;
  if (preferredAge == null || Number.isNaN(Number(preferredAge))) return ages[0];
  const target = Number(preferredAge);
  return ages.reduce((best, age) => (
    Math.abs(age - target) < Math.abs(best - target) ? age : best
  ));
}

export function atlasIslandSpan(topicCount, maxCount) {
  if (!maxCount) return 3;
  const ratio = topicCount / maxCount;
  if (ratio >= 0.55) return 6;
  if (ratio >= 0.3) return 4;
  if (ratio >= 0.14) return 3;
  return 2;
}

function hexToRgb(hex) {
  const raw = String(hex || '').replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return { r: 63, g: 125, b: 94 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  const to = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function quietMasteryFill(hex, pct, paper = '#fbf9f4') {
  const amount = 0.1 + (Math.max(0, Math.min(100, Number(pct) || 0)) / 100) * 0.22;
  const color = hexToRgb(hex);
  const base = hexToRgb(paper);
  return rgbToHex(
    base.r + (color.r - base.r) * amount,
    base.g + (color.g - base.g) * amount,
    base.b + (color.b - base.b) * amount,
  );
}

function hopSide(hop, homeAge) {
  if (hop.in && !hop.out) return 'in';
  if (hop.out && !hop.in) return 'out';
  if (hop.age < homeAge) return 'in';
  return 'out';
}

export function collectSectionHops(homeTopics, data, { cap = MAX_SECTION_HOPS, siblingAges = [] } = {}) {
  const homeIds = new Set(homeTopics.map((topic) => topic.id));
  const home = homeTopics[0];
  const homeKey = home ? topicSectionKey(home) : '';
  const homeAge = home ? topicAge(home) : 0;
  const hopMap = new Map();

  const ensure = (topic) => {
    if (!topic || homeIds.has(topic.id)) return null;
    const key = topicSectionKey(topic);
    if (key === homeKey) return null;
    if (!hopMap.has(key)) {
      hopMap.set(key, {
        key,
        subject: topic.subject,
        domain: topic.domain,
        age: topicAge(topic),
        edgeCount: 0,
        hardCount: 0,
        in: 0,
        out: 0,
        sibling: false,
      });
    }
    return hopMap.get(key);
  };

  for (const topic of homeTopics) {
    for (const prereq of data.prereqsOf.get(topic.id) || []) {
      const hop = ensure(data.byId.get(prereq.id));
      if (!hop) continue;
      hop.edgeCount += 1;
      if (prereq.strength === 'hard') hop.hardCount += 1;
      hop.in += 1;
    }
    for (const unlock of data.unlocksOf.get(topic.id) || []) {
      const hop = ensure(data.byId.get(unlock.id));
      if (!hop) continue;
      hop.edgeCount += 1;
      if (unlock.strength === 'hard') hop.hardCount += 1;
      hop.out += 1;
    }
  }

  for (const age of siblingAges) {
    if (age === homeAge) continue;
    const key = sectionKey(home.subject, home.domain, age);
    if (!hopMap.has(key)) {
      hopMap.set(key, {
        key,
        subject: home.subject,
        domain: home.domain,
        age,
        edgeCount: 0,
        hardCount: 0,
        in: 0,
        out: 0,
        sibling: true,
      });
    } else {
      hopMap.get(key).sibling = true;
    }
  }

  const all = [...hopMap.values()].map((hop) => ({ ...hop, side: hopSide(hop, homeAge) }));
  const siblings = all.filter((hop) => hop.sibling)
    .sort((a, b) => a.age - b.age);
  const room = Math.max(0, cap - siblings.length);
  const cross = all.filter((hop) => !hop.sibling)
    .sort((a, b) => b.hardCount - a.hardCount || b.edgeCount - a.edgeCount || a.domain.localeCompare(b.domain));
  const hops = [...siblings, ...cross.slice(0, room)];
  return { hops, truncated: hops.length < all.length, total: all.length };
}

function hopEdgesFor(homeTopics, hops, data) {
  const hopByKey = new Map(hops.map((hop) => [hop.key, hop]));
  const edges = [];
  const seen = new Set();
  const add = (from, to, strength) => {
    const id = `${from}|${to}|${strength}`;
    if (seen.has(id)) return;
    seen.add(id);
    edges.push({ from, to, strength });
  };

  for (const topic of homeTopics) {
    for (const prereq of data.prereqsOf.get(topic.id) || []) {
      const other = data.byId.get(prereq.id);
      if (!other) continue;
      const hop = hopByKey.get(topicSectionKey(other));
      if (hop) add(hopNodeId(hop.key), topic.id, prereq.strength);
    }
    for (const unlock of data.unlocksOf.get(topic.id) || []) {
      const other = data.byId.get(unlock.id);
      if (!other) continue;
      const hop = hopByKey.get(topicSectionKey(other));
      if (hop) add(topic.id, hopNodeId(hop.key), unlock.strength);
    }
  }
  return edges;
}

export function longestPathColumns(ids, edges) {
  const idSet = new Set(ids);
  const preds = new Map(ids.map((id) => [id, []]));
  for (const edge of edges) {
    if (!idSet.has(edge.from) || !idSet.has(edge.to)) continue;
    preds.get(edge.to).push(edge.from);
  }
  const memo = new Map();
  const visiting = new Set();
  const layerOf = (id) => {
    if (memo.has(id)) return memo.get(id);
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const incoming = preds.get(id) || [];
    const layer = incoming.length ? 1 + Math.max(...incoming.map(layerOf)) : 0;
    visiting.delete(id);
    memo.set(id, layer);
    return layer;
  };
  const columns = new Map();
  for (const id of ids) columns.set(id, layerOf(id));
  return columns;
}

export function layeredDagLayout(nodes, edges, opts = {}) {
  const {
    colWidth = 196,
    rowHeight = 64,
    paddingX = 24,
    paddingY = 20,
    nodeWidth = 168,
    nodeHeight = 44,
    hopWidth = 148,
    hopHeight = 52,
  } = opts;

  const topicNodes = nodes.filter((node) => node.kind !== 'hop');
  const hopNodes = nodes.filter((node) => node.kind === 'hop');
  const topicIds = topicNodes.map((node) => node.id);
  const topicIdSet = new Set(topicIds);
  const topicEdges = edges.filter((edge) => topicIdSet.has(edge.from) && topicIdSet.has(edge.to));
  const topicColumns = longestPathColumns(topicIds, topicEdges);

  const inHops = hopNodes.filter((node) => node.side === 'in');
  const outHops = hopNodes.filter((node) => node.side !== 'in');
  const shift = inHops.length ? 1 : 0;
  const maxTopicCol = topicColumns.size ? Math.max(0, ...topicColumns.values()) : 0;

  const placed = [];
  for (const node of topicNodes) {
    placed.push({
      ...node,
      column: (topicColumns.get(node.id) || 0) + shift,
      width: nodeWidth,
      height: nodeHeight,
    });
  }
  inHops.forEach((node, index) => {
    placed.push({ ...node, column: 0, rowHint: index, width: hopWidth, height: hopHeight });
  });
  const outCol = shift + maxTopicCol + (outHops.length || topicNodes.length ? 1 : 0);
  outHops.forEach((node, index) => {
    placed.push({ ...node, column: Math.max(outCol, shift + maxTopicCol + 1), rowHint: index, width: hopWidth, height: hopHeight });
  });

  const byCol = new Map();
  for (const node of placed) {
    if (!byCol.has(node.column)) byCol.set(node.column, []);
    byCol.get(node.column).push(node);
  }

  const predY = new Map();
  const columns = [...byCol.keys()].sort((a, b) => a - b);
  for (const column of columns) {
    const group = byCol.get(column);
    group.sort((a, b) => {
      const ay = predY.has(a.id) ? predY.get(a.id) : (a.rowHint ?? 0);
      const by = predY.has(b.id) ? predY.get(b.id) : (b.rowHint ?? 0);
      if (ay !== by) return ay - by;
      return String(a.id).localeCompare(String(b.id));
    });
    group.forEach((node, row) => {
      node.row = row;
      node.x = paddingX + column * colWidth;
      node.y = paddingY + row * rowHeight;
      predY.set(node.id, node.y);
    });
    for (const edge of edges) {
      if (!topicIdSet.has(edge.to) && !edge.to.startsWith('hop:')) continue;
      const from = group.find((node) => node.id === edge.from);
      if (from) {
        const current = predY.get(edge.to);
        predY.set(edge.to, current == null ? from.y : (current + from.y) / 2);
      }
    }
  }

  const width = paddingX * 2 + (columns.length ? (Math.max(...columns) + 1) * colWidth : colWidth);
  const height = paddingY * 2 + (placed.length
    ? (Math.max(...placed.map((node) => node.row || 0)) + 1) * rowHeight
    : rowHeight);

  return { nodes: placed, width, height, edges };
}

export function buildSectionGraph(section, data, { neighborCap = MAX_SECTION_HOPS, siblingAges = [] } = {}) {
  const homeTopics = section.topics || [];
  const local = localEdges(homeTopics, data.prereqsOf);
  const { hops, truncated, total } = collectSectionHops(homeTopics, data, {
    cap: neighborCap,
    siblingAges,
  });
  const nodes = [
    ...homeTopics.map((topic) => ({
      id: topic.id,
      kind: 'topic',
      label: topic.name,
      topic,
    })),
    ...hops.map((hop) => ({
      id: hopNodeId(hop.key),
      kind: 'hop',
      side: hop.side,
      label: hop.domain,
      sublabel: `Age ${hop.age}`,
      hop,
    })),
  ];
  const edges = [...local, ...hopEdgesFor(homeTopics, hops, data)];
  return {
    homeTopics,
    hops,
    nodes,
    edges,
    truncated,
    totalHops: total,
    layout: layeredDagLayout(nodes, edges),
  };
}

export function graphHash(params = {}) {
  const parts = ['graph'];
  if (params.subject) parts.push(encodeURIComponent(params.subject));
  if (params.domain) parts.push(encodeURIComponent(params.domain));
  if (params.age != null && params.age !== '') parts.push(encodeURIComponent(String(params.age)));
  return parts.join('/');
}
