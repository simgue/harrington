// Retired topics: ids a family's data still mentions that the loaded taxonomy
// no longer has (a taxonomy revision removed them; docs/CURRICULUM.md). The
// data is kept as it is, never refused on load, import or save; the app
// leaves it out of counts and daily choices and Records lists it here as
// archived. Pure, so it can be tested without the store.

// What a learner's data holds for a topic, by kind, for the Records row.
const HELD = {
  mastered: ['mastered', 'mastered'],
  progress: ['in progress', 'in progress'],
  record: ['record', 'records'],
  test: ['test result', 'test results'],
  recall: ['recall card', 'recall cards'],
  practice: ['practice question', 'practice questions'],
  calendar: ['calendar entry', 'calendar entries'],
  daily: ['daily offer', 'daily offers'],
  request: ['topic request', 'topic requests'],
  levelset: ['workbook answer', 'workbook answers'],
  lesson: ['saved lesson', 'saved lessons'],
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const entries = (v) => (isObj(v) ? Object.entries(v) : []);

/**
 * doc: the family document (or the store's state); studentId: one learner.
 * isCurrent(id): true for an id the loaded taxonomy has.
 * Returns [{ id, name, held: { kind: count } }], by name (else id). `name` is
 * a name the family's data stored for the topic (a record's or calendar
 * entry's topicName), else null.
 */
export function retiredTopics(doc, studentId, isCurrent) {
  const found = new Map();
  const note = (id, kind, name = null) => {
    if (typeof id !== 'string' || !id || isCurrent(id)) return;
    const e = found.get(id) || { id, name: null, held: {} };
    e.held[kind] = (e.held[kind] || 0) + 1;
    if (!e.name && typeof name === 'string' && name.trim()) e.name = name.trim();
    found.set(id, e);
  };
  const of = (key) => (isObj(doc?.[key]) ? doc[key][studentId] : undefined);

  for (const [id, p] of entries(of('progress'))) {
    if (p?.status === 'mastered') note(id, 'mastered');
    else if (p?.status && p.status !== 'none') note(id, 'progress');
  }
  for (const r of list(of('records'))) {
    note(r?.topicId, 'record', r?.topicName);
    for (const c of list(r?.coverage)) note(c?.topicId, 'record', c?.topicName);
  }
  for (const t of list(of('tests'))) note(t?.topicId, 'test', t?.topicName);
  for (const t of list(of('challenges'))) note(t?.topicId, 'test');
  for (const [id, c] of entries(of('recall'))) note(c?.topicId || String(id).split('::')[0], 'recall');
  for (const [, c] of entries(of('practice'))) note(c?.topicId, 'practice');
  const plan = of('plan');
  for (const id of Object.keys(isObj(plan?.moves) ? plan.moves : {})) note(id, 'calendar');
  for (const [, items] of entries(plan?.extras)) for (const x of list(items)) note(x?.topicId, 'calendar', x?.topicName);
  for (const [, day] of entries(of('daily'))) {
    for (const [, ids] of entries(day?.offers)) for (const id of list(ids)) note(id, 'daily');
    for (const [, id] of entries(day?.picks)) note(id, 'daily');
  }
  for (const r of list(of('requests'))) note(r?.topicId, 'request');
  const ls = of('levelset');
  for (const id of list(ls?.observe)) note(id, 'levelset');
  for (const [, session] of entries(ls?.lanes)) for (const id of Object.keys(isObj(session?.answers) ? session.answers : {})) note(id, 'levelset');

  return [...found.values()].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
}

// Saved lesson cache keys ('topic:<id>', 'print:<id>', 'recall:<id>') whose
// topic is retired, added to `topics` (from retiredTopics) as a new list.
export function withRetiredLessons(topics, keys, isCurrent) {
  const byId = new Map(topics.map(t => [t.id, { ...t, held: { ...t.held } }]));
  for (const key of keys) {
    const id = String(key).replace(/^(topic|print|recall):/, '');
    if (id === key || !id || isCurrent(id)) continue;
    const e = byId.get(id) || { id, name: null, held: {} };
    e.held.lesson = (e.held.lesson || 0) + 1;
    byId.set(id, e);
  }
  return [...byId.values()].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
}

// "mastered · 2 records · 1 recall card"
export function heldLabel(held) {
  return Object.keys(HELD).filter(k => held[k]).map(k => {
    const [one, many] = HELD[k];
    return k === 'mastered' || k === 'progress' ? one : `${held[k]} ${held[k] === 1 ? one : many}`;
  }).join(' · ');
}

// The name to show: the stored one, else the id.
export const retiredName = (t) => t.name || t.id;
