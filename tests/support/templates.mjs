// Source-level scan of template literals, for the escaping checks in
// tests/isolation.test.mjs. Not a JavaScript parser: it knows strings,
// comments, regex literals and nested `${}` well enough for src/js.

// Every template literal in `src`, nested ones included, as
// { text, exprs, parent, line }: `text` is the static part (each `${}` becomes
// \0), `exprs` the trimmed source of each interpolation.
export function templateLiterals(src) {
  const out = [];
  let i = 0;
  const lineAt = (at) => src.slice(0, at).split('\n').length;
  const skipQuoted = (q) => {
    for (i++; i < src.length && src[i] !== q; i++) if (src[i] === '\\') i++;
    i++;
  };
  const skipRegex = () => {
    let inClass = false;
    for (i++; i < src.length; i++) {
      const c = src[i];
      if (c === '\\') { i++; continue; }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) break;
    }
    for (i++; /[a-z]/i.test(src[i] || ''); i++);
  };
  // Code up to the `}` that closes an interpolation (inExpr) or the end.
  const code = (parent, inExpr) => {
    let depth = 0;
    let prev = '';
    while (i < src.length) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl; continue; }
      if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 2; continue; }
      if (c === '"' || c === "'") { skipQuoted(c); prev = 'a'; continue; }
      if (c === '`') { template(parent); prev = 'a'; continue; }
      if (c === '/' && (!prev || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || /\b(?:return|typeof|case|in|of)$/.test(src.slice(0, i).trimEnd()))) {
        skipRegex(); prev = 'a'; continue;
      }
      if (c === '{') depth++;
      if (c === '}') { if (inExpr && depth === 0) return; depth--; }
      if (!/\s/.test(c)) prev = c;
      i++;
    }
  };
  const template = (parent) => {
    const t = { text: '', exprs: [], parent, line: lineAt(i) };
    out.push(t);
    for (i++; i < src.length && src[i] !== '`';) {
      if (src[i] === '\\') { t.text += src.slice(i, i + 2); i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') {
        i += 2;
        const start = i;
        code(t, true);
        t.exprs.push(src.slice(start, i).trim());
        t.text += '\0';
        i++;
        continue;
      }
      t.text += src[i++];
    }
    i++;
  };
  code(null, false);
  return out;
}

// A template is markup when its own text has a tag, or it sits inside one.
export function isMarkup(t) {
  for (let cur = t; cur; cur = cur.parent) if (/<\/?[a-z]/i.test(cur.text)) return true;
  return false;
}

// `expr` with every string and template literal replaced by S, so its shape
// can be matched (the templates themselves are checked on their own).
function shape(expr) {
  let out = '';
  for (let i = 0; i < expr.length;) {
    const c = expr[i];
    if (c === '"' || c === "'" || c === '`') {
      let depth = 0;
      for (i++; i < expr.length; i++) {
        if (expr[i] === '\\') { i++; continue; }
        if (c === '`' && expr[i] === '$' && expr[i + 1] === '{') { depth++; i++; continue; }
        if (depth && expr[i] === '}') { depth--; continue; }
        if (!depth && expr[i] === c) break;
      }
      i++;
      out += 'S';
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

// Escaping helpers from src/js/ui.js: esc() for text and attributes,
// analysisHtml() for stored AI analysis markup.
const ESCAPERS = ['esc', 'analysisHtml'];

// Whether `expr` is one call to an escaper and nothing else ("esc(a) + b" is not).
function wholeEscCall(expr) {
  const s = shape(expr);
  const name = ESCAPERS.find(n => s.startsWith(`${n}(`));
  if (!name) return false;
  let depth = 0;
  for (let i = name.length; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')' && --depth === 0) return i === s.length - 1;
  }
  return false;
}

// An interpolation that cannot carry unescaped data into markup: an escaper call, a
// ternary choosing between literals, a .map(x => `...`).join(...) of templates
// (each checked on its own), or an entry of `allowed` (exact source).
export function safeInterpolation(expr, allowed = new Set()) {
  if (allowed.has(expr) || wholeEscCall(expr)) return true;
  const s = shape(expr).replace(/\s+/g, ' ');
  if (/^[^?]+\? ?S ?: ?S$/.test(s)) return true;
  return /^[\w$.]+\.map\(\(?\w+\)? => S\)\.join\((?:S)?\)$/.test(s);
}

// Interpolations in markup templates of `src` that are not safe, as "line: expr".
export function unescapedInterpolations(src, allowed) {
  return templateLiterals(src)
    .filter(isMarkup)
    .flatMap(t => t.exprs.filter(e => !safeInterpolation(e, allowed)).map(e => `${t.line}: ${e}`));
}
