// Teaching guides: Marble's teaching research for one topic, fetched from
// the server one topic at a time (GET /api/taxonomy/research/<id>) and cut
// down to what a parent can use at the kitchen table. Needs no AI.
//
// The text is shown verbatim (CC BY-SA 4.0). If Harrington ever edits it,
// the edit must be marked as such where it is shown.

export const GUIDE_ATTRIBUTION = 'From the Marble Skill Taxonomy teaching research · © Generative Spark, Inc. (Marble) · CC BY-SA 4.0';
// Marble's own caveat (notes[0] of the research file) comes from the server
// with the index and is shown verbatim. This gloss is Harrington's own words,
// shown apart from it and marked as such.
export const GUIDE_GLOSS = 'Harrington’s note: AI agents wrote these from teaching research. They are ideas to try, not methods tested in studies.';
export const MARBLE_HREF = 'https://github.com/withmarbleapp/os-taxonomy';
export const LICENSE_HREF = 'https://creativecommons.org/licenses/by-sa/4.0/';

// How the check is run, in words a parent would use.
const METHODS = {
  two_tier: 'Predict, then explain',
  performance_task: 'Watch them do it',
  open_epistemic_probe: 'An open question',
  interpret_translate: 'Read it and explain it',
  use_in_context: 'Use it in a real situation',
};

const LEVELS = [['gap', 'Not yet'], ['partial', 'Getting there'], ['full', 'Got it']];

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const texts = (v) => (Array.isArray(v) ? v.map(text).filter(Boolean) : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// Only http(s) links are shown; anything else is dropped.
function safeUrl(v) {
  const s = text(v);
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
}

// The parts of a research record a parent uses. Leaves out the internal
// metadata (confidence, provenance, review notes, publication notes, source
// claims, authoring constraints). Returns null when nothing usable is left.
export function curateResearch(record) {
  const r = obj(record);
  const learn = obj(r.learn);
  const assess = obj(r.assess);

  const activities = (Array.isArray(learn.activities) ? learn.activities : []).map((a) => {
    const act = obj(a);
    return {
      title: text(act.title),
      steps: texts(act.learnerActions),
      insight: text(act.intendedInsight),
      feedback: texts(act.feedback),
    };
  }).filter((a) => a.title && (a.steps.length || a.insight || a.feedback.length));

  const levelsIn = obj(assess.responseLevels);
  const check = {
    method: typeof assess.method === 'string' && Object.hasOwn(METHODS, assess.method) ? METHODS[assess.method] : '',
    task: text(assess.poeTask),
    prompt: text(assess.diagnosticPrompt),
    answer: text(assess.correctAnswer),
    followUps: texts(assess.probeDeeper),
    errors: (Array.isArray(assess.errorPatterns) ? assess.errorPatterns : []).map((e) => {
      const ep = obj(e);
      const reteach = text(ep.reteachPrerequisiteId);
      return { pattern: text(ep.pattern), signs: text(ep.revealedBy), nextMove: text(ep.nextMove), reteachId: reteach || null };
    }).filter((e) => e.pattern),
    levels: LEVELS.map(([key, label]) => ({ key, label, text: text(levelsIn[key]) })).filter((l) => l.text),
  };
  const hasCheck = !!(check.task || check.prompt || check.errors.length || check.levels.length);

  const sources = (Array.isArray(r.sources) ? r.sources : []).map((s) => {
    const src = obj(s);
    return { name: text(src.source), url: safeUrl(src.url) };
  }).filter((s) => s.name && s.url)
    .filter((s, i, all) => all.findIndex((o) => o.url === s.url) === i);

  const summary = text(learn.summary);
  if (!summary && !activities.length && !hasCheck) return null;
  return { topicId: text(r.topicId), summary, activities, check: hasCheck ? check : null, sources };
}

// ---- Fetching (browser only) ----
// The server's list of topic ids with research is fetched once, so a topic
// without a guide costs no request (and no 404). It carries Marble's caveat,
// which each guide is given. Each guide is fetched once per page load.
// Failures are not cached, so a later visit tries again.
let index = null;
const guides = new Map();

function researchIndex() {
  index ??= fetch('/api/taxonomy/research').then(async (res) => {
    if (!res.ok) throw new Error(`Teaching guides unavailable (${res.status})`);
    const body = await res.json();
    return { ids: new Set(body.topicIds || []), caveat: typeof body.caveat === 'string' ? body.caveat : '' };
  }).catch((error) => {
    index = null;
    throw error;
  });
  return index;
}

// Whether a topic has a guide. False when the list cannot be loaded (for
// example offline before the first download).
export async function hasTeachingGuide(topicId) {
  try {
    return (await researchIndex()).ids.has(topicId);
  } catch {
    return false;
  }
}

// The curated guide with Marble's caveat, or null when the topic has none.
export function loadTeachingGuide(topicId) {
  if (!guides.has(topicId)) {
    const pending = researchIndex().then(async ({ ids, caveat }) => {
      if (!ids.has(topicId)) return null;
      const res = await fetch(`/api/taxonomy/research/${encodeURIComponent(topicId)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Teaching guide unavailable (${res.status})`);
      const guide = curateResearch(await res.json());
      return guide && { ...guide, caveat };
    });
    pending.catch(() => guides.delete(topicId));
    guides.set(topicId, pending);
  }
  return guides.get(topicId);
}
