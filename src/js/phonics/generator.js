// "Make a new book" without AI (HAR-45): sentence frames filled from a small
// word bank, every word filtered by the child's known code, words with the
// focus sounds favored. Deterministic for a seed, so Shuffle is just another
// seed and a saved book can be made again. A book is only ever returned after
// it passes checkBook, the same gate the bank passes.
//
// The AI hook. A later drafter (a local model, say) would propose
// { title, pages: [{ text, scene }] } and hand it to acceptDraft(draft, code)
// below, which runs the same checks and returns null for anything that
// fails, so a drafted book can never ask for a sound the child does not
// know. That drafter must be given the known code and picture kinds only,
// never the learner's name or the parent's notes (HAR-19). Not built here.
import { checkBook, checkText, checkWord, soundOf } from './decodability.js';
import { PICTURE_KINDS, GROUND_Y } from './pictures.js';

// ---- the word bank -----------------------------------------------------------
// Story names: made up, never the learner's. hair/cap give each a look.
export const NAMES = [
  { name: 'Pat', cap: true }, { name: 'Tim' }, { name: 'Sam', hair: 'long' }, { name: 'Pam', hair: 'long' },
  { name: 'Tom', cap: true }, { name: 'Dot', hair: 'long' }, { name: 'Pip' }, { name: 'Meg', hair: 'long' },
  { name: 'Ben', cap: true }, { name: 'Kim', hair: 'long' }, { name: 'Jack', cap: true }, { name: 'Gus' },
  { name: 'Jen', hair: 'long' }, { name: 'Ted', cap: true }, { name: 'Liz', hair: 'long' }, { name: 'Dan' },
  { name: 'Fred', cap: true }, { name: 'Jay' }, { name: 'Dee', hair: 'long' }, { name: 'Viv', hair: 'long' },
];

// Nouns, each drawn by a picture. hold: small enough to hold; animal; seat:
// something to sit on; ride: something to get on; sky: drawn up in the air.
export const NOUNS = [
  { word: 'cat', pic: 'cat', animal: true },
  { word: 'dog', pic: 'dog', animal: true },
  { word: 'pig', pic: 'pig', animal: true },
  { word: 'hen', pic: 'hen', animal: true },
  { word: 'duck', pic: 'duck', animal: true },
  { word: 'frog', pic: 'frog', animal: true },
  { word: 'fish', pic: 'fish', animal: true, floats: true, hold: true },
  { word: 'bee', pic: 'bee', animal: true, floats: true, sky: true },
  { word: 'tap', pic: 'tap', floats: true, tap: true },
  { word: 'cap', pic: 'cap', hold: true, tap: true, wear: true },
  { word: 'hat', pic: 'hat', hold: true, tap: true },
  { word: 'map', pic: 'map', hold: true, floats: true, tap: true },
  { word: 'mat', pic: 'mat', seat: true, minor: true },
  { word: 'rug', pic: 'mat', seat: true, minor: true },
  { word: 'cup', pic: 'cup', hold: true, fill: true, tap: true, hot: true },
  { word: 'pot', pic: 'pot', hold: true, fill: true, tap: true, hot: true },
  { word: 'pan', pic: 'pan', hold: true, fill: true, tap: true, hot: true },
  { word: 'bag', pic: 'bag', hold: true, fill: true, pack: true },
  { word: 'box', pic: 'box', hold: true, fill: true, pack: true, seat: true, tap: true },
  { word: 'bed', pic: 'bed', seat: true },
  { word: 'bus', pic: 'bus', ride: true },
  { word: 'van', pic: 'van', ride: true },
  { word: 'ship', pic: 'ship', ride: true },
  { word: 'bell', pic: 'bell', hold: true, ring: true, tap: true },
  { word: 'sun', pic: 'sun', floats: true, sky: true, hot: true },
  { word: 'tree', pic: 'tree' },
];

// Verbs, third person. Intransitive ones have a pose; transitive ones say
// which nouns they take.
const INTRANSITIVE = [
  { word: 'sat', pose: 'sit', arms: 'down' },
  { word: 'sits', pose: 'sit', arms: 'down' },
  { word: 'naps', pose: 'sit', arms: 'down' },
  { word: 'nods', arms: 'down' },
  { word: 'grins', arms: 'down' },
  { word: 'waits', arms: 'down' },
  { word: 'yells', arms: 'wave' },
  { word: 'sings', arms: 'wave' },
  { word: 'runs', arms: 'out' },
  { word: 'jogs', arms: 'out' },
  { word: 'claps', arms: 'both' },
];
const TRANSITIVE = [
  { word: 'has', arms: 'out', takes: (n) => n.hold },
  { word: 'gets', arms: 'out', takes: (n) => n.hold },
  { word: 'fills', arms: 'out', takes: (n) => n.fill },
  { word: 'packs', arms: 'out', takes: (n) => n.pack },
  { word: 'taps', arms: 'out', takes: (n) => n.tap },
  { word: 'rings', arms: 'out', takes: (n) => n.ring },
  { word: 'pats', pose: 'sit', arms: 'pat', takes: (n) => n.animal && !n.sky && !n.floats },
  { word: 'hugs', pose: 'sit', arms: 'pat', takes: (n) => n.animal && !n.sky && !n.floats },
  { word: 'fed', arms: 'pat', takes: (n) => n.animal && !n.sky && !n.floats },
  { word: 'feeds', arms: 'pat', takes: (n) => n.animal && !n.sky && !n.floats },
  { word: 'sees', arms: 'down', takes: () => true },
  { word: 'fits', arms: 'wave', takes: (n) => n.wear, wears: true },
];
const ADJECTIVES = [
  { word: 'big', fits: () => true, scale: 1.35 },
  { word: 'red', fits: (n) => !n.sky },
  { word: 'hot', fits: (n) => n.hot },
  { word: 'wet', fits: (n) => n.animal && !n.sky },
  { word: 'fat', fits: (n) => ['cat', 'pig', 'hen', 'dog', 'duck', 'frog'].includes(n.word), pose: 'fat' },
];

// ---- a seeded random stream (mulberry32) -------------------------------------
export function rng(seed) {
  // Neighboring seeds (1, 2, 3 …) start far apart.
  let a = Math.imul((Number(seed) >>> 0) || 1, 0x9e3779b1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cap = (w) => w[0].toUpperCase() + w.slice(1);

// ---- scenes ----------------------------------------------------------------
const PERSON_SCALE = 1.05;
const scaleOf = (n) => ({ bus: 0.95, van: 1, ship: 0.95, bed: 0.9, tree: 0.9, mat: 1, sun: 0.9 }[n.pic] || 1);
const look = (who) => ({ ...(who.cap ? { cap: true } : {}), ...(who.hair ? { hair: who.hair } : {}) });

function thing(n, x, { scale = scaleOf(n), pose } = {}) {
  const item = { kind: n.pic, x, y: n.sky ? 80 : n.floats ? 150 : GROUND_Y, scale };
  if (pose) item.pose = pose;
  if (n.pic === 'tap') item.y = 110;
  return item;
}

function personItem(who, x, { pose = 'stand', arms = 'down', scale = PERSON_SCALE, cap: wears = false } = {}) {
  const item = { kind: 'person', x, y: GROUND_Y, scale, pose, arms, ...look(who) };
  if (wears) item.cap = true;
  return item;
}

// A held thing sits at the hand of a person whose right arm is out.
function held(n, x, s) {
  const scale = 0.55 * scaleOf(n);
  const hand = [x + 72 * s, GROUND_Y - 114 * s];
  if (n.floats) return { kind: n.pic, x: hand[0] + 34, y: hand[1] + 6, scale };
  return { kind: n.pic, x: hand[0] + 28, y: hand[1] + 40, scale };
}

// ---- frames ----------------------------------------------------------------
// Each frame lists its candidate sentences for a protagonist, as
// { text, scene, about: [nouns] }.
function candidates(who, other, nouns) {
  const out = [];
  const add = (text, scene, about = []) => out.push({ text, scene, about });
  const N = who.name;
  for (const v of INTRANSITIVE) {
    add(`${N} ${v.word}.`, [personItem(who, 200, { pose: v.pose, arms: v.arms, scale: 1.1 })]);
    if (other) {
      const plural = v.word.endsWith('s') && v.word !== 'has' ? v.word.slice(0, -1) : null;
      if (plural) add(`${N} and ${other.name} ${plural}.`, [personItem(who, 120, { pose: v.pose, arms: v.arms }), personItem(other, 285, { pose: v.pose, arms: v.arms, scale: 1 })]);
    }
  }
  for (const n of nouns) {
    for (const v of TRANSITIVE) {
      if (!v.takes(n)) continue;
      let scene;
      if (v.wears) scene = [personItem(who, 200, { arms: v.arms, cap: true, scale: 1.1 })];
      else if (v.arms === 'out' && n.hold) scene = [personItem(who, 120, { arms: 'out' }), held(n, 120, PERSON_SCALE)];
      else if (v.arms === 'pat') scene = [personItem(who, 125, { pose: v.pose || 'stand', arms: 'pat' }), thing(n, 270, { scale: 0.9 })];
      else scene = [personItem(who, 110, { arms: v.arms }), thing(n, 280, { scale: 0.85 * scaleOf(n) })];
      add(`${N} ${v.word} a ${n.word}.`, scene, [n]);
      add(`${N} ${v.word} the ${n.word}!`, scene, [n]);
    }
    if (n.seat) {
      const top = { mat: 16, rug: 16, bed: 52, box: 64 }[n.word] || 16;
      add(`${N} sits on the ${n.word}.`, [thing(n, 200, { scale: n.word === 'bed' ? 1.1 : 1.3 }), personItem(who, n.word === 'bed' ? 230 : 200, { pose: 'sit', scale: 0.95 })].map((it, i) => (i === 1 ? { ...it, y: GROUND_Y - top * (n.word === 'bed' ? 1.1 : 1.3), seat: false } : it)), [n]);
    }
    if (n.ride) add(`${N} gets on the ${n.word}.`, [thing(n, 215, { scale: 1.15 }), personItem(who, 360, { arms: 'wave', scale: 0.8 })], [n]);
    add(`It is a ${n.word}.`, [thing(n, 200, { scale: 1.3 * scaleOf(n) })], [n]);
    for (const a of ADJECTIVES) {
      if (!a.fits(n)) continue;
      const scale = (a.scale || 1.2) * scaleOf(n);
      add(`The ${n.word} is ${a.word}.`, [thing(n, 200, { scale, pose: a.pose })], [n]);
      if ((n.hold || n.animal || n.ride) && !n.sky) add(`${N} has a ${a.word} ${n.word}.`, [personItem(who, 110), thing(n, 285, { scale: 0.9 * (a.scale || 1) * scaleOf(n), pose: a.pose })], [n]);
    }
    if (n.pic === 'tap') add('Tap, tap!', [thing(n, 200, { scale: 1.3 })].map((it) => ({ ...it, drips: 2 })), [n]);
  }
  // Something on something: a small thing or an animal on a seat or a ride.
  for (const top of nouns.filter((n) => (n.animal && !n.sky && !n.floats) || (n.hold && !n.floats))) {
    for (const base of nouns.filter((n) => (n.seat || n.ride) && n !== top)) {
      const h = { mat: 16, rug: 16, bed: 50, box: 70, bus: 104, van: 94, ship: 82 }[base.word] || 20;
      const s = base.ride ? 1.1 : 1.2;
      add(`A ${top.word} is on the ${base.word}.`, [thing(base, 200, { scale: s }), { ...thing(top, 200, { scale: 0.75 }), y: GROUND_Y - h * s }], [top, base]);
    }
  }
  return out;
}

// ---- the generator ---------------------------------------------------------
// Words of a sentence that use the focus graphemes, counted (adjacent
// consonants count when they are the focus).
function focusScore(text, code, focus, focusClusters) {
  let score = 0;
  for (const w of text.split(/\s+/)) {
    const r = checkWord(w.replace(/[^A-Za-z]/g, ''), code);
    if (!r.parts) continue;
    score += r.parts.filter((p) => focus.includes(soundOf(p))).length;
    if (focusClusters && r.parts.length > 3) score += 1;
  }
  return score;
}

function pick(list, rand, weight = () => 1) {
  const ws = list.map(weight);
  const total = ws.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < list.length; i++) {
    r -= ws[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

const readable = (text, code) => checkText(text, code).length === 0;

/**
 * Accept a drafted book only if it passes checkBook against the code and
 * every scene uses pictures the library has. Returns the book (with the
 * graphemes, tricky words and word list the check found) or null.
 */
export function acceptDraft(draft, code) {
  if (!draft || typeof draft.title !== 'string' || !Array.isArray(draft.pages) || !draft.pages.length) return null;
  const scenes = [draft.cover || [], ...draft.pages.map((p) => p.scene || [])];
  if (!scenes.every((s) => Array.isArray(s) && s.every((item) => PICTURE_KINDS.includes(item?.kind)))) return null;
  const result = checkBook(draft, code);
  if (!result.ok) return null;
  return { ...draft, graphemes: result.graphemes, tricky: result.tricky, clusters: result.clusters, words: result.words };
}

/**
 * A new book for `code` ({ graphemes, tricky, clusters } as sequence.js
 * makeCode gives). `focus`: graphemes to favor; `pages`: 6 or 10 story pages;
 * `seed`: any integer. Returns null when the code is too small to write
 * anything (no name or no sentence it can read).
 */
export function generateBook(code, { focus = [], focusClusters = false, pages = 6, seed = 1 } = {}) {
  const rand = rng(seed);
  const names = NAMES.filter((n) => readable(n.name, code));
  if (!names.length) return null;
  const nouns = NOUNS.filter((n) => readable(n.word, code));
  const score = (text) => focusScore(text, code, focus, focusClusters);
  const who = pick(names, rand, (n) => 1 + 2 * score(n.name));
  const others = names.filter((n) => n !== who);
  const other = others.length ? pick(others, rand) : null;
  const all = candidates(who, other, nouns).filter((c) => readable(c.text, code));
  if (!all.length) return null;
  // The main thing of the story: a noun the sentences can use, focus first.
  // A mat is too plain to carry a story; it stays a side thing.
  const usable = nouns.filter((n) => all.some((c) => c.about.includes(n)));
  const leads = usable.filter((n) => !n.minor);
  const main = leads.length ? pick(leads, rand, (n) => 1 + 3 * score(n.word)) : usable.length ? pick(usable, rand) : null;
  // Two more things at most, so the story stays about a few things.
  const side = [];
  for (let i = 0; i < 2; i++) {
    const rest = usable.filter((n) => n !== main && !side.includes(n));
    if (rest.length) side.push(pick(rest, rand, (n) => 1 + 2 * score(n.word)));
  }
  const cast = new Set([main, ...side]);
  const inStory = all.filter((c) => c.about.every((n) => cast.has(n)));
  const weight = (c) => (1 + 2 * score(c.text)) * (main && c.about.includes(main) ? 3 : 1) * (c.about.length ? 1 : 0.6);

  const chosen = [];
  // Page 1 introduces the main thing when it can.
  const intro = all.filter((c) => main && c.about[0] === main && /^(\w+ has a|It is a) /.test(c.text));
  if (intro.length) chosen.push(pick(intro, rand));
  const fresh = (list) => list.filter((c) => !chosen.some((x) => x.text === c.text));
  while (chosen.length < pages) {
    // Sentences about the story's things first, then any other; a small code
    // may not have enough different sentences, and repeats one then.
    const pool = fresh(inStory).length ? fresh(inStory) : fresh(all);
    chosen.push(pick(pool.length ? pool : all, rand, weight));
  }

  const titles = [
    main && `${who.name} and the ${main.word}`,
    main && `The ${main.word}`,
    main && `${who.name} has a ${main.word}`,
    main && `A ${main.word}`,
    `${who.name}`,
  ].filter(Boolean).filter((t) => readable(t, code));
  const title = titles.length > 1 && rand() < 0.3 ? titles[1] : titles[0];
  const cover = main
    ? [personItem(who, 120), thing(main, 285, { scale: main.ride ? 0.8 : 0.9 * scaleOf(main) })]
    : [personItem(who, 200, { arms: 'wave', scale: 1.1 })];
  const book = acceptDraft({
    id: `made-${seed}`,
    title,
    focus: [...focus],
    seed,
    cover,
    pages: chosen.map((c) => ({ text: c.text, scene: c.scene })),
  }, code);
  return book;
}
