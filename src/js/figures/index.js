// Which topics have a "See how it works" figure (HAR-34). The server lists the
// pages in src/figures/ that meet the contract (contract.js); the app loads
// that list once at start. A failed or empty list only means no figures show.
import { listFigures } from '../backend.js';
import { MAX_HINT, MAX_TITLE, figureIdOf } from './contract.js';

let figures = new Map();

const valid = (f) => f && figureIdOf(`${f.id}.html`) === f.id
  && typeof f.title === 'string' && f.title.length > 0 && f.title.length <= MAX_TITLE
  && typeof f.hint === 'string' && f.hint.length > 0 && f.hint.length <= MAX_HINT;

export async function loadFigures() {
  try {
    const list = await listFigures();
    figures = new Map((Array.isArray(list) ? list : []).filter(valid).map((f) => [f.id, { id: f.id, title: f.title, hint: f.hint }]));
  } catch {
    figures = new Map();
  }
}

// The figure for a topic id, or null. src is relative to the app page.
export function figureFor(topicId) {
  const f = typeof topicId === 'string' ? figures.get(topicId) : null;
  return f ? { ...f, src: `figures/${f.id}.html` } : null;
}
