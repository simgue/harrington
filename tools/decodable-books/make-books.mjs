// Decodable books, entry level (HAR-45 first test): sets 1 and 2 of the
// sequence the school uses (s a t p / i m f c). Every word is checked against
// the sounds a book allows (plus its tricky words); a book with a word that
// fails is not printed. Not part of the app yet: a one-off generator.
//
//   npm install --no-save @fontsource/andika     (the reading font, SIL OFL)
//   node tools/decodable-books/make-books.mjs decodable-books
//
// Writes, per book, an A4 booklet (print double-sided, flip on the short
// edge, fold, staple) and a flat A5 copy. Set CHROME to a Chromium binary if
// Playwright's own is not installed. Output is gitignored.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || 'decodable-books';
const FONT = (w) => readFileSync(createRequire(import.meta.url).resolve(`@fontsource/andika/files/andika-latin-${w}-normal.woff2`)).toString('base64');

// ---- decodability -------------------------------------------------------
const SET1 = ['s', 'a', 't', 'p'];
const SET2 = ['i', 'm', 'f', 'c'];
function decodable(word, graphemes) {
  // Longest match first; a doubled consonant (ss, tt, pp, mm, ff) is one sound.
  const list = [...graphemes, ...graphemes.filter((g) => g.length === 1 && g !== 'a' && g !== 'i').map((g) => g + g)]
    .sort((x, y) => y.length - x.length);
  let i = 0;
  const parts = [];
  while (i < word.length) {
    const g = list.find((x) => word.startsWith(x, i));
    if (!g) return null;
    parts.push(g); i += g.length;
  }
  return parts;
}
function check(book) {
  const bad = [];
  const words = new Set();
  for (const page of book.pages) {
    for (const raw of page.text.split(/\s+/)) {
      const w = raw.toLowerCase().replace(/[^a-z]/g, '');
      if (!w) continue;
      words.add(w);
      if (book.tricky.includes(w)) continue;
      if (!decodable(w, book.sounds)) bad.push(w);
    }
  }
  if (bad.length) throw new Error(`${book.title}: not decodable with ${book.sounds.join(' ')}: ${[...new Set(bad)].join(', ')}`);
  return [...words].filter((w) => !book.tricky.includes(w)).sort();
}

// ---- pictures (simple flat drawings, 400 x 300) ---------------------------
const INK = '#2b2b2b';
const person = (x, y, { shirt = '#e07a5f', hair = '#5a3e2b', sit = false, s = 1, cap = null, arm = 'down' } = {}) => {
  const legs = sit
    ? `<rect x="-30" y="44" width="56" height="12" rx="3" fill="#c9a27a"/><path d="M-24 56 v28 M20 56 v28" stroke="#8a6a4a" stroke-width="6"/><path d="M-6 40 h30 v30 M8 40 h24 v30" fill="none" stroke="#3d5a80" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="M-8 40 v44 M8 40 v44" stroke="#3d5a80" stroke-width="10" stroke-linecap="round"/>`;
  const arms = arm === 'pat'
    ? `<path d="M-16 6 l-10 30 M16 6 l40 26" stroke="${shirt}" stroke-width="9" stroke-linecap="round"/>`
    : arm === 'out'
    ? `<path d="M-16 6 l-26 10 M16 6 l30 -6" stroke="${shirt}" stroke-width="9" stroke-linecap="round"/>`
    : `<path d="M-16 6 l-10 30 M16 6 l10 30" stroke="${shirt}" stroke-width="9" stroke-linecap="round"/>`;
  const hat = cap ? `<path d="M-22 -40 q22 -26 44 0 z" fill="${cap}"/><path d="M14 -42 h22 v6 h-22z" fill="${cap}"/>` : `<path d="M-22 -38 q22 -30 44 0 q-6 -10 -22 -10 q-16 0 -22 10z" fill="${hair}"/>`;
  return `<g transform="translate(${x} ${y}) scale(${s})" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round">
    ${legs}${arms}<rect x="-18" y="-4" width="36" height="48" rx="10" fill="${shirt}"/>
    <circle cx="0" cy="-30" r="22" fill="#f2c9a0"/>${hat}
    <circle cx="-7" cy="-30" r="2.5" fill="${INK}" stroke="none"/><circle cx="7" cy="-30" r="2.5" fill="${INK}" stroke="none"/>
    <path d="M-7 -20 q7 6 14 0" fill="none"/></g>`;
};
const cat = (x, y, { fat = false, s = 1, cap = null, sip = false } = {}) => {
  const rx = fat ? 58 : 40;
  const hat = cap ? `<path d="M-24 -16 q24 -34 48 0 z" fill="${cap}" /><path d="M16 -18 h26 v6 h-26z" fill="${cap}"/>` : '';
  const bowl = sip ? `<path d="M-90 30 h44 q0 22 -22 22 q-22 0 -22 -22z" fill="#81b29a"/><path d="M-86 32 h36" stroke="#4f8fc0" stroke-width="5"/>` : '';
  return `<g transform="translate(${x} ${y}) scale(${s})" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round">
    ${bowl}<path d="M${rx - 6} 10 q46 -10 30 -50" fill="none" stroke="#f4a259" stroke-width="10" stroke-linecap="round"/>
    <path d="M${rx - 6} 10 q46 -10 30 -50" fill="none"/>
    <ellipse cx="0" cy="20" rx="${rx}" ry="${fat ? 34 : 26}" fill="#f4a259"/>
    <g transform="translate(${sip ? -38 : -28} ${sip ? 0 : -28})">
      <path d="M-24 -6 l4 -26 l14 16 z M24 -6 l-4 -26 l-14 16 z" fill="#f4a259"/>
      <circle r="26" fill="#f4a259"/>${hat}
      <circle cx="-9" cy="-4" r="3" fill="${INK}" stroke="none"/><circle cx="9" cy="-4" r="3" fill="${INK}" stroke="none"/>
      <path d="M-3 6 l3 3 l3 -3" fill="none"/><path d="M-28 6 h-14 M-28 12 h-12 M28 6 h14 M28 12 h12" stroke-width="1.5"/>
    </g></g>`;
};
const tap = (x, y, { drips = 0, s = 1 } = {}) => {
  let d = '';
  for (let i = 0; i < drips; i++) d += `<path d="M44 ${62 + i * 30} q-8 12 0 16 q8 -4 0 -16z" fill="#4f8fc0"/>`;
  return `<g transform="translate(${x} ${y}) scale(${s})" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round">
    <rect x="-60" y="-10" width="30" height="40" rx="4" fill="#b8c0c8"/>
    <path d="M-30 0 h60 q20 0 20 20 v24 h-16 v-20 q0 -6 -6 -6 h-58z" fill="#cfd6dc"/>
    <rect x="-8" y="-30" width="16" height="22" fill="#cfd6dc"/><rect x="-26" y="-38" width="52" height="10" rx="5" fill="#e07a5f"/>
    ${d}</g>`;
};
const capPic = (x, y, color = '#3d5a80', s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round">
  <path d="M-50 10 q50 -80 100 0 z" fill="${color}"/><path d="M30 6 h56 q6 0 6 6 v4 h-62z" fill="${color}"/><circle cx="0" cy="-30" r="5" fill="#fff"/></g>`;
const map = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round">
  <path d="M-90 -55 l60 12 l60 -12 l60 12 v110 l-60 -12 l-60 12 l-60 -12z" fill="#f6e7c1"/>
  <path d="M-30 -43 v110 M30 -55 v110" fill="none"/>
  <path d="M-70 30 q30 -40 60 -10 t70 -20" fill="none" stroke="#e07a5f" stroke-dasharray="7 6"/>
  <path d="M58 -14 l14 14 M72 -14 l-14 14" stroke="#e07a5f" stroke-width="5"/></g>`;
const mat = (x, y, w = 200) => `<rect x="${x - w / 2}" y="${y}" width="${w}" height="16" rx="6" fill="#81b29a" stroke="${INK}" stroke-width="2.5"/>`;
const ground = `<path d="M0 262 h400" stroke="#c9c1b4" stroke-width="3"/>`;
const svg = (body) => `<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">${ground}${body}</svg>`;

// ---- the books ------------------------------------------------------------
const PAT = { shirt: '#e07a5f', hair: '#7a4a2b' };
const TIM = { shirt: '#3d5a80', hair: '#2b2b2b' };
const SAM = { shirt: '#81b29a', hair: '#c47a2c' };
const books = [
  {
    id: 'book-1-tap-tap', title: 'Tap, tap', level: 'Set 1', sounds: SET1, tricky: [],
    cover: svg(tap(200, 120, { drips: 2, s: 1.3 })),
    pages: [
      { text: 'Tap.', pic: svg(tap(200, 130, { s: 1.4 })) },
      { text: 'Tap, tap, tap.', pic: svg(tap(200, 110, { drips: 3, s: 1.3 })) },
      { text: 'Pat sat.', pic: svg(person(200, 175, { ...PAT, sit: true, s: 1.3 })) },
      { text: 'Pat sat at a tap.', pic: svg(person(120, 175, { ...PAT, sit: true, s: 1.2 }) + tap(290, 120, { drips: 1 })) },
      { text: 'Pat taps a tap.', pic: svg(person(130, 165, { ...PAT, arm: 'out', s: 1.2 }) + tap(270, 120, { drips: 2 })) },
      { text: 'Tap, tap! Pat sat.', pic: svg(tap(300, 110, { drips: 3 }) + person(130, 175, { ...PAT, sit: true, s: 1.2 })) },
    ],
  },
  {
    id: 'book-2-pip-the-cat', title: 'Pip the cat', level: 'Sets 1 and 2', sounds: [...SET1, ...SET2], tricky: ['the', 'is'],
    cover: svg(cat(200, 190, { s: 1.4 })),
    pages: [
      { text: 'Pip is a cat.', pic: svg(cat(200, 200, { s: 1.4 })) },
      { text: 'Pip sits.', pic: svg(mat(200, 238, 240) + cat(200, 196, { s: 1.3 })) },
      { text: 'Tim pats Pip.', pic: svg(person(150, 165, { ...TIM, arm: 'pat', s: 1.2 }) + cat(255, 208, { s: 1.05 })) },
      { text: 'Pip sips. Sip, sip, sip.', pic: svg(cat(240, 200, { sip: true, s: 1.2 })) },
      { text: 'Pip is a fat cat!', pic: svg(cat(200, 196, { fat: true, s: 1.3 })) },
      { text: 'Pip sits. Tim sits.', pic: svg(mat(200, 238, 320) + cat(280, 200, { s: 1 }) + person(120, 175, { ...TIM, sit: true, s: 1.1 })) },
    ],
  },
  {
    id: 'book-3-caps', title: 'Caps', level: 'Sets 1 and 2', sounds: [...SET1, ...SET2], tricky: ['the', 'is'],
    cover: svg(capPic(130, 170, '#e07a5f') + capPic(270, 170, '#3d5a80')),
    pages: [
      { text: 'A cap.', pic: svg(capPic(200, 180, '#e07a5f', 1.5)) },
      { text: 'Sam fits a cap.', pic: svg(person(200, 170, { ...SAM, cap: '#e07a5f', s: 1.3 })) },
      { text: 'Tim fits a cap.', pic: svg(person(200, 170, { ...TIM, cap: '#3d5a80', s: 1.3 })) },
      { text: 'Pip fits a cap!', pic: svg(cat(200, 200, { cap: '#f2cc8f', s: 1.4 })) },
      { text: 'Sam, Tim, Pip. Caps!', pic: svg(person(90, 170, { ...SAM, cap: '#e07a5f' }) + person(200, 170, { ...TIM, cap: '#3d5a80' }) + cat(320, 210, { cap: '#f2cc8f', s: 0.9 })) },
      { text: 'Pip taps the map.', pic: svg(map(170, 150, 1.1) + cat(330, 215, { s: 0.8 })) },
    ],
  },
];

// ---- layout ---------------------------------------------------------------
const css = `
@font-face { font-family: Andika; src: url(data:font/woff2;base64,${FONT(400)}) format('woff2'); font-weight: 400; }
@font-face { font-family: Andika; src: url(data:font/woff2;base64,${FONT(700)}) format('woff2'); font-weight: 700; }
* { box-sizing: border-box; margin: 0; }
body { font-family: Andika, sans-serif; color: #2b2b2b; }
.page { width: 148mm; height: 210mm; padding: 12mm 12mm 10mm; display: flex; flex-direction: column; position: relative; overflow: hidden; }
.pic { flex: 1; display: flex; align-items: center; justify-content: center; }
.pic svg { width: 100%; max-height: 120mm; }
.text { font-size: 30pt; line-height: 1.35; text-align: center; min-height: 40mm; display: flex; align-items: center; justify-content: center; letter-spacing: 0.02em; word-spacing: 0.25em; }
.num { position: absolute; bottom: 6mm; left: 0; right: 0; text-align: center; font-size: 10pt; color: #8a8a8a; }
.cover h1 { font-size: 40pt; text-align: center; margin-top: 4mm; }
.cover .lvl { text-align: center; font-size: 13pt; color: #6b6b6b; }
.cover .owner { margin-top: auto; font-size: 13pt; border-top: 1.5px solid #bbb; padding-top: 3mm; }
.back { font-size: 11.5pt; line-height: 1.45; }
.back h2 { font-size: 15pt; margin: 3mm 0 1.5mm; }
.back .sounds { font-size: 26pt; letter-spacing: 0.3em; }
.back .words { font-size: 14pt; word-spacing: 0.6em; }
.back ul { padding-left: 5mm; }
.back .small { font-size: 9pt; color: #777; margin-top: auto; }
.sheet { width: 297mm; height: 210mm; display: flex; page-break-after: always; }
.sheet .page { border-right: 0.3pt dashed #ddd; }
`;
function pagesOf(book, words) {
  const cover = `<div class="page cover"><div class="lvl">${book.level}: ${book.sounds.join(' ')}</div><h1>${book.title}</h1>
    <div class="pic">${book.cover}</div><div class="owner">This book belongs to</div></div>`;
  const story = book.pages.map((p, i) => `<div class="page"><div class="pic">${p.pic}</div><div class="text">${p.text}</div><div class="num">${i + 2}</div></div>`);
  const back = `<div class="page back"><h2>Sounds in this book</h2><div class="sounds">${book.sounds.join(' ')}</div>
    ${book.tricky.length ? `<h2>Tricky words</h2><div class="words">${book.tricky.join(' ')}</div><p>Say these ones together; they don't follow the sounds yet.</p>` : ''}
    <h2>Words to sound out</h2><div class="words">${words.join(' ')}</div>
    <h2>Reading it together</h2><ul>
      <li>Before reading: point to each sound on this page and say it together.</li>
      <li>Sound out each word, then blend: "s-a-t, sat".</li>
      <li>Say a name with a capital letter the same way: "P-a-t, Pat".</li>
      <li>Read it again tomorrow. The second read is where fluency comes from.</li>
    </ul>
    <h2>For different ages</h2><ul>
      <li><b>About 3:</b> read it to them, point under each word, and play "what sound does it start with?".</li>
      <li><b>About 6:</b> they sound out, you help blend.</li>
      <li><b>About 9:</b> the reader for a younger sibling, or try writing a page of their own using only these sounds.</li>
    </ul>
    <div class="small">Harrington decodable reader. Every word checked against the sounds above.</div></div>`;
  return [cover, ...story, back];
}
const doc = (body, size) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page { size: ${size}; margin: 0; } ${css}</style></head><body>${body}</body></html>`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await browser.newPage();
for (const book of books) {
  const words = check(book);
  const p = pagesOf(book, words); // 8 pages: 1 cover, 2-7 story, 8 back
  if (p.length !== 8) throw new Error('8 pages expected');
  // Flat: one A5 page per sheet, in reading order.
  await page.setContent(doc(p.map((x) => `<div style="page-break-after:always">${x}</div>`).join(''), 'A5 portrait'));
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: join(OUT, `${book.id}-flat-A5.pdf`), width: '148mm', height: '210mm', printBackground: true, preferCSSPageSize: true });
  // Booklet: A4 landscape, two A5 pages a side; print both sides, flip on the short edge, fold, staple.
  const order = [[8, 1], [2, 7], [6, 3], [4, 5]];
  await page.setContent(doc(order.map(([l, r]) => `<div class="sheet">${p[l - 1]}${p[r - 1]}</div>`).join(''), 'A4 landscape'));
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: join(OUT, `${book.id}-booklet-A4.pdf`), width: '297mm', height: '210mm', printBackground: true, preferCSSPageSize: true });
  console.log(`${book.title}: decodable, words: ${words.join(' ')}`);
}
// A self-test of the checker: a word outside the code must be refused.
try { check({ title: 'self-test', sounds: SET1, tricky: [], pages: [{ text: 'Pat sat on a mat.' }] }); throw new Error('checker let a bad word through'); }
catch (e) { if (!/not decodable.*on, mat/.test(e.message)) throw e; console.log('checker self-test: refuses "on" and "mat" for set 1'); }
await browser.close();
