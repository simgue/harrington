import { getData, topicAge } from './data.js';
import * as store from './store.js';
import { keyOf } from './scheduler.js';

export const CURATED_INTEREST_CHIPS = [
  'Bird shelter',
  'Vegetable garden',
  'Bike repair',
  'Storytelling',
  'Cooking',
  'Music',
];

export const DAILY_CAPS = {
  invites: 3,
  ready: 3,
  blockers: 2,
  reviewEach: 3,
};

export const FOCUS_SPINE = {
  literacy: {
    subject: 'English',
    domains: [
      'Phonics & Word Reading',
      'Handwriting & Transcription',
      'Reading Comprehension',
      'Writing Composition',
      'Speaking & Listening',
    ],
  },
  numeracy: {
    subject: 'Mathematics',
    domains: [
      'Counting & Cardinality',
      'Number Representation & Place Value',
      'Addition & Subtraction',
      'Mathematical Thinking',
    ],
  },
};

const INVITE_MODES = ['make', 'research', 'practice'];

function norm(text) {
  return String(text || '').trim().toLowerCase();
}

function words(text) {
  return norm(text).split(/[^a-z0-9]+/).filter((token) => token.length >= 2);
}

function containsAny(haystack, needles) {
  const body = norm(haystack);
  return needles.some((needle) => body.includes(norm(needle)));
}

function statusOf(progress, topicId) {
  return progress[topicId] || 'none';
}

function isHardUnlocked(topicId, progress, prereqsOf) {
  const hard = (prereqsOf.get(topicId) || []).filter((edge) => edge.strength === 'hard');
  return hard.every((edge) => statusOf(progress, edge.id) === 'mastered');
}

function sortByScore(items) {
  return [...items].sort((a, b) => b.score - a.score || a.topic.name.localeCompare(b.topic.name));
}

function topicScore(topic, status, studentAge) {
  const ageGap = Math.abs(topicAge(topic) - studentAge);
  const startedBonus = status === 'practicing' ? 3 : status === 'learning' ? 2 : 0;
  return startedBonus * 3 - ageGap + (topic.centrality || 0) * 2;
}

function blockerPath(topicId, progress, data, depthCap = 5) {
  const path = [];
  const seen = new Set([topicId]);
  let current = topicId;
  for (let depth = 0; depth < depthCap; depth += 1) {
    const unmet = (data.prereqsOf.get(current) || [])
      .filter((edge) => edge.strength === 'hard' && statusOf(progress, edge.id) !== 'mastered')
      .map((edge) => ({ ...edge, topic: data.byId.get(edge.id) }))
      .filter((edge) => edge.topic);
    if (!unmet.length) break;
    const next = unmet
      .sort((a, b) => (b.topic.centrality || 0) - (a.topic.centrality || 0))[0];
    path.push({
      id: next.topic.id,
      name: next.topic.name,
      reason: next.reason || '',
    });
    if (seen.has(next.topic.id)) break;
    seen.add(next.topic.id);
    current = next.topic.id;
  }
  return path;
}

function toTopicRef(topic) {
  return {
    id: topic.id,
    name: topic.name,
    subject: topic.subject,
    domain: topic.domain,
    age: topicAge(topic),
  };
}

export function frontier_for({
  data,
  progress = {},
  studentAge = 6,
  subject,
  domains = [],
  capReady = DAILY_CAPS.ready,
  capBlocked = DAILY_CAPS.blockers,
}) {
  const allowedDomains = new Set(domains);
  const pool = data.topics.filter((topic) => {
    if (subject && topic.subject !== subject) return false;
    if (allowedDomains.size && !allowedDomains.has(topic.domain)) return false;
    return true;
  });

  const ready = [];
  const blocked = [];
  for (const topic of pool) {
    const status = statusOf(progress, topic.id);
    if (status === 'mastered') continue;
    const score = topicScore(topic, status, studentAge);
    const unlocked = isHardUnlocked(topic.id, progress, data.prereqsOf);
    if (unlocked) {
      ready.push({
        topic: toTopicRef(topic),
        status,
        score,
      });
      continue;
    }
    const blockers = (data.prereqsOf.get(topic.id) || [])
      .filter((edge) => edge.strength === 'hard' && statusOf(progress, edge.id) !== 'mastered')
      .map((edge) => {
        const b = data.byId.get(edge.id);
        return b ? {
          id: b.id,
          name: b.name,
          reason: edge.reason || '',
        } : null;
      })
      .filter(Boolean);
    if (!blockers.length) continue;
    blocked.push({
      topic: toTopicRef(topic),
      blockers,
      whyLockedPath: blockerPath(topic.id, progress, data),
      score,
    });
  }

  return {
    ready: sortByScore(ready).slice(0, capReady),
    blocked: sortByScore(blocked).slice(0, capBlocked),
    poolSize: pool.length,
  };
}

function interestHints(text) {
  const tokenSet = new Set(words(text));
  if (tokenSet.has('bird') || tokenSet.has('shelter') || tokenSet.has('nest')) {
    return {
      tokens: [...tokenSet, 'bird', 'shelter', 'habitat', 'measure', 'timber'],
      domains: ['Ecosystems & Habitats', 'Measurement', 'Matter & Materials', 'Writing Composition'],
    };
  }
  return { tokens: [...tokenSet], domains: [] };
}

function interestScore(topic, hints) {
  const haystack = `${topic.name} ${topic.domain} ${topic.description || ''}`.toLowerCase();
  let score = 0;
  for (const token of hints.tokens) {
    if (haystack.includes(token)) score += 2;
  }
  if (hints.domains.includes(topic.domain)) score += 3;
  return score;
}

export function path_to({
  data,
  progress = {},
  studentAge = 6,
  interestText = '',
  cap = 5,
}) {
  const hints = interestHints(interestText);
  if (!hints.tokens.length) return [];

  const scored = [];
  for (const topic of data.topics) {
    const lexical = interestScore(topic, hints);
    if (!lexical) continue;
    const status = statusOf(progress, topic.id);
    const score = lexical + topicScore(topic, status, studentAge);
    const ready = isHardUnlocked(topic.id, progress, data.prereqsOf);
    const blockers = ready
      ? []
      : (data.prereqsOf.get(topic.id) || [])
        .filter((edge) => edge.strength === 'hard' && statusOf(progress, edge.id) !== 'mastered')
        .map((edge) => {
          const b = data.byId.get(edge.id);
          return b ? { id: b.id, name: b.name, reason: edge.reason || '' } : null;
        })
        .filter(Boolean);
    scored.push({
      topic: toTopicRef(topic),
      score,
      ready,
      blockers,
      whyLockedPath: ready ? [] : blockerPath(topic.id, progress, data),
    });
  }
  return sortByScore(scored).slice(0, cap);
}

export function ageBandTone(age) {
  if (age <= 5) {
    return {
      id: 'early-observational',
      short: 'early observational',
      invitationHint: 'Keep this playful, sensory, and mostly observational.',
    };
  }
  if (age <= 7) {
    return {
      id: 'hands-on-six',
      short: 'hands-on',
      invitationHint: 'Use practical making, movement, and concrete steps.',
    };
  }
  return {
    id: 'artistic-nine',
    short: 'artistic',
    invitationHint: 'Encourage artistic expression, explanation, and reflection.',
  };
}

function pickUnusedTopic(candidates, usedIds) {
  const next = candidates.find((entry) => !usedIds.has(entry.topic.id));
  if (!next) return null;
  usedIds.add(next.topic.id);
  return next.topic;
}

function inviteEvidenceHints(kind) {
  if (kind === 'make') return ['Take a photo of the artifact', 'Add a short parent note', 'Capture a quick voice reflection'];
  if (kind === 'research') return ['Record one question asked', 'Capture a voice explanation', 'Attach a sketch or reference file'];
  return ['Write what strategy they used', 'Record a spoken explanation', 'Attach a worksheet/photo if helpful'];
}

export function buildInterestInvitations({
  interestText = '',
  age = 6,
  candidates = [],
  literacyReady = [],
  numeracyReady = [],
  count = DAILY_CAPS.invites,
}) {
  const label = interestText.trim() || 'today’s family interest';
  const bird = containsAny(label, ['bird shelter', 'bird', 'nest']);
  const tone = ageBandTone(age);
  const used = new Set();
  const candidateTopics = candidates.map((entry) => entry.topic);
  const litTopics = literacyReady.map((entry) => entry.topic);
  const numTopics = numeracyReady.map((entry) => entry.topic);

  const invites = [];
  for (const mode of INVITE_MODES.slice(0, count)) {
    const targetFromInterest = pickUnusedTopic(candidates, used);
    const fallback = mode === 'practice'
      ? (pickUnusedTopic(numeracyReady, used) || pickUnusedTopic(literacyReady, used))
      : (pickUnusedTopic(candidates, used) || pickUnusedTopic(literacyReady, used) || pickUnusedTopic(numeracyReady, used));
    const primary = targetFromInterest || fallback || candidateTopics[0] || litTopics[0] || numTopics[0] || null;
    const targetTopicIds = [primary?.id, litTopics[0]?.id, numTopics[0]?.id].filter(Boolean).slice(0, 3);
    const uniqueTargetIds = [...new Set(targetTopicIds)];
    const titleCore = bird ? 'bird shelter' : label;

    let title;
    let prompt;
    if (mode === 'make') {
      title = `Make · ${bird ? 'Build a simple bird shelter' : `Create around ${titleCore}`}`;
      prompt = bird
        ? `Build a small shelter model and talk through material choices. ${tone.invitationHint}`
        : `Build or craft something connected to ${titleCore}. ${tone.invitationHint}`;
    } else if (mode === 'research') {
      title = `Research · ${bird ? 'Observe birds and habitat needs' : `Investigate ${titleCore}`}`;
      prompt = bird
        ? `Observe local birds, list what shelter features they need, and compare at least two ideas. ${tone.invitationHint}`
        : `Gather observations, questions, and sources about ${titleCore}. ${tone.invitationHint}`;
    } else {
      title = `Practice · ${bird ? 'Measure, count, and explain your plan' : `Practice key skills through ${titleCore}`}`;
      prompt = bird
        ? `Use measurement/counting and a short explanation to justify the shelter design. ${tone.invitationHint}`
        : `Use literacy and numeracy skills while practicing ${titleCore}. ${tone.invitationHint}`;
    }

    invites.push({
      id: `invite-${mode}-${Math.random().toString(36).slice(2, 8)}`,
      mode,
      title,
      prompt,
      targetTopicIds: uniqueTargetIds,
      evidenceHints: inviteEvidenceHints(mode),
    });
  }
  return invites;
}

function hydrateInvite(data, invite, progress = {}) {
  const topics = (invite.targetTopicIds || [])
    .map((id) => data.byId.get(id))
    .filter(Boolean);
  return {
    ...invite,
    topics: topics.map((topic) => ({
      ...toTopicRef(topic),
      status: statusOf(progress, topic.id),
      ready: isHardUnlocked(topic.id, progress, data.prereqsOf),
    })),
  };
}

export function invitationEvidenceSummary(records, invitationId) {
  const linked = (records || []).filter((record) => record.invitationId === invitationId);
  const coverageCount = linked.filter((record) => Array.isArray(record.coverage) && record.coverage.length > 0).length;
  return {
    recordCount: linked.length,
    coverageCount,
  };
}

export function interestKey({ chips = [], freeText = '' }) {
  return JSON.stringify({
    chips: [...new Set((chips || []).map((chip) => String(chip).trim()).filter(Boolean))].sort(),
    freeText: String(freeText || '').trim().toLowerCase(),
  });
}

export function buildDailySurfaceFromContext({
  data,
  studentAge = 6,
  progress = {},
  interests = { chips: [], freeText: '' },
  queueInvites = [],
  reviewDue = { recall: [], practice: [] },
}) {
  const chips = (interests.chips || []).filter(Boolean);
  const freeText = String(interests.freeText || '').trim();
  const interestText = [chips.join(', '), freeText].filter(Boolean).join(' · ') || 'Bird shelter';
  const literacy = frontier_for({
    data,
    progress,
    studentAge,
    subject: FOCUS_SPINE.literacy.subject,
    domains: FOCUS_SPINE.literacy.domains,
  });
  const numeracy = frontier_for({
    data,
    progress,
    studentAge,
    subject: FOCUS_SPINE.numeracy.subject,
    domains: FOCUS_SPINE.numeracy.domains,
  });
  const interestPath = path_to({ data, progress, studentAge, interestText });
  const generatedInvites = buildInterestInvitations({
    interestText,
    age: studentAge,
    candidates: interestPath,
    literacyReady: literacy.ready,
    numeracyReady: numeracy.ready,
  });
  const invites = (queueInvites && queueInvites.length ? queueInvites : generatedInvites)
    .slice(0, DAILY_CAPS.invites)
    .map((invite) => hydrateInvite(data, invite, progress));

  return {
    tone: ageBandTone(studentAge),
    interests: { chips, freeText, interestText },
    literacy,
    numeracy,
    interestPath: interestPath.slice(0, DAILY_CAPS.ready),
    invites,
    reviewDue: {
      recall: (reviewDue.recall || []).slice(0, DAILY_CAPS.reviewEach),
      practice: (reviewDue.practice || []).slice(0, DAILY_CAPS.reviewEach),
    },
  };
}

export function buildDailyQueue(studentId, interests, dateKey = keyOf(new Date())) {
  const data = getData();
  const student = store.get().students.find((item) => item.id === studentId) || null;
  const studentAge = store.studentAge(student) || 6;
  const progress = store.progressFor(studentId);
  const surface = buildDailySurfaceFromContext({
    data,
    studentAge,
    progress,
    interests,
  });
  return {
    dateKey,
    interestKey: interestKey(interests),
    invites: surface.invites.map((invite) => ({
      id: invite.id,
      mode: invite.mode,
      title: invite.title,
      prompt: invite.prompt,
      targetTopicIds: invite.targetTopicIds,
      evidenceHints: invite.evidenceHints,
    })),
  };
}

function dueRecallForSurface(studentId, data) {
  return store.dueRecallCards(studentId).map((card) => {
    const topic = data.byId.get(card.topicId);
    return {
      id: card.id,
      topicId: card.topicId,
      topicName: topic?.name || card.topicId,
      subject: topic?.subject || 'Unknown',
      type: 'recall',
    };
  });
}

function duePracticeForSurface(studentId, data) {
  return store.duePracticeItems(studentId).map((item) => {
    const topic = data.byId.get(item.topicId);
    return {
      id: item.id,
      topicId: item.topicId,
      topicName: topic?.name || item.topicId,
      subject: topic?.subject || item.subject || 'Unknown',
      type: 'practice',
    };
  });
}

export function buildDailyParentSurface(studentId, { interests = null, queueInvites = null } = {}) {
  const data = getData();
  const state = store.get();
  const student = state.students.find((item) => item.id === studentId) || null;
  const studentAge = store.studentAge(student) || 6;
  const progress = store.progressFor(studentId);
  const daily = store.dailyState(studentId);
  const selectedInterests = interests || { chips: daily.chips || [], freeText: daily.freeText || '' };
  const records = store.recordsFor(studentId);
  const reviewDue = {
    recall: dueRecallForSurface(studentId, data),
    practice: duePracticeForSurface(studentId, data),
  };
  const surface = buildDailySurfaceFromContext({
    data,
    studentAge,
    progress,
    interests: selectedInterests,
    queueInvites: queueInvites || daily.queue?.invites || [],
    reviewDue,
  });

  surface.invites = surface.invites.map((invite) => ({
    ...invite,
    evidence: invitationEvidenceSummary(records, invite.id),
  }));
  return surface;
}
