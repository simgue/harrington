// The contract every "See how it works" page in src/figures/ meets (HAR-34,
// docs/FIGURES.md). A page is found by its file name alone: the server lists
// only the pages that pass figureProblems(), with the title and hint read
// from the page itself, so a page dropped into src/figures/ needs no other
// change. The build and the unit tests apply the same checks.
export const MAX_FIGURE_BYTES = 100 * 1024;
export const MAX_TITLE = 40;
export const MAX_HINT = 90;

// Every page carries this pointer to the engine's MIT notice (the notice itself
// names the product, which may not appear in a page).
export const ENGINE_NOTICE = '/* Harrington figure engine (src/js/figures/engine.js). MIT License. Copyright (c) 2026 April Zhu;'
  + ' Copyright (c) 2026 Tolga Cohce. The full notice is in src/js/figures/engine.js and NOTICE. */';

// src/figures/<topicId>.html, where the id is a taxonomy topic id.
const FILE = /^(mt_[A-Za-z0-9_-]{4,40})\.html$/;
export const figureIdOf = (fileName) => FILE.exec(fileName)?.[1] ?? null;

// Nothing in a page may reach outside it or credit anyone in the UI.
const FORBIDDEN = [
  [/https?:\/\//i, 'an http(s) URL'],
  [/colorfigures/i, 'the name Colorfigures'],
  [/april-zhu/i, 'april-zhu'],
  [/made with/i, 'a "Made with" line'],
  [/<script[^>]*\ssrc\s*=/i, 'a <script src>'],
  [/<link\b/i, 'a <link> tag'],
  [/<(?:iframe|object|embed|base)\b/i, 'an <iframe>, <object>, <embed> or <base> tag'],
];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ENTITIES[e]);

// The figure's title (<title>) and one-line hint (<meta name="description">).
export function figureMeta(html) {
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1];
  const hint = /<meta\s+name="description"\s+content="([^"]*)"\s*\/?>/i.exec(html)?.[1];
  return { title: title == null ? '' : decode(title).trim(), hint: hint == null ? '' : decode(hint).trim() };
}

// The part labels a page draws: every string literal in the text argument of
// tag(point, dx, dy, TEXT, on), so a plain 'BULB' and both labels of a
// conditional (st.cut ? 'CUT WIRE' : 'WIRE') count. A label built any other
// way (a variable, a template) is not seen, and the contract asks for literals.
export function figureLabels(html) {
  const labels = new Set();
  for (const call of html.matchAll(/\btag\(/g)) {
    // split the call's arguments at top-level commas, skipping strings and brackets
    const args = [];
    let depth = 0, quote = null, start = call.index + call[0].length;
    for (let i = start; i < html.length; i += 1) {
      const c = html[i];
      if (quote) { if (c === '\\') i += 1; else if (c === quote) quote = null; continue; }
      if (c === "'" || c === '"' || c === '`') quote = c;
      else if ('([{'.includes(c)) depth += 1;
      else if (')]}'.includes(c)) { if (depth === 0) { args.push(html.slice(start, i)); break; } depth -= 1; }
      else if (c === ',' && depth === 0) { args.push(html.slice(start, i)); start = i + 1; }
    }
    for (const lit of (args[3] || '').matchAll(/'([^'\\]*)'|"([^"\\]*)"/g)) labels.add(lit[1] ?? lit[2]);
  }
  return [...labels];
}

// Everything wrong with a page, as short phrases; [] when it meets the contract.
export function figureProblems(fileName, html) {
  const problems = [];
  if (!figureIdOf(fileName)) problems.push('the file name is not <topicId>.html');
  const bytes = new TextEncoder().encode(html).length;
  if (bytes > MAX_FIGURE_BYTES) problems.push(`it is ${bytes} bytes (the limit is ${MAX_FIGURE_BYTES})`);
  const { title, hint } = figureMeta(html);
  if (!title || title.length > MAX_TITLE) problems.push(`the <title> must be 1 to ${MAX_TITLE} characters`);
  if (!hint || hint.length > MAX_HINT) problems.push(`the description hint must be 1 to ${MAX_HINT} characters`);
  for (const [pattern, what] of FORBIDDEN) if (pattern.test(html)) problems.push(`it has ${what}`);
  if (!html.includes(ENGINE_NOTICE)) problems.push('it lacks the engine notice line');
  if (!/\bmountFigure\(/.test(html)) problems.push('it does not call mountFigure()');
  const labels = figureLabels(html);
  if (labels.length < 3 || labels.length > 6) problems.push(`it has ${labels.length} labels (3 to 6)`);
  for (const label of labels) {
    if (!/^[A-Z][A-Z]{0,11}(?: [A-Z]{1,11})?$/.test(label)) problems.push(`the label "${label}" is not one or two capital words`);
  }
  return problems;
}
