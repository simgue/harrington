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

export function graphHash(params = {}) {
  const parts = ['graph'];
  if (params.subject) parts.push(encodeURIComponent(params.subject));
  if (params.domain) parts.push(encodeURIComponent(params.domain));
  if (params.age != null && params.age !== '') parts.push(encodeURIComponent(String(params.age)));
  return parts.join('/');
}
