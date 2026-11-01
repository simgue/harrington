// Decodable books, entry level (HAR-45 first test): sets 1 and 2 of the
// sequence the school uses (s a t p / i m f c). Every word, title included, is
// checked against the sounds a book allows (plus its tricky words); if any
// book has a word that fails, nothing is printed. Not part of the app yet: a
// one-off generator.
//
// Black text only, and the pictures are black line art with white regions, so
// the children can color them in.
//
//   npm install --no-save @fontsource/andika     (the reading font, SIL OFL)
//   node tools/decodable-books/make-books.mjs [output folder]
//
// The output folder defaults to decodable-books/ at the repository root
// (gitignored). Writes, per book, an A4 booklet (print double-sided, flip on
// the short edge, fold, staple) and a flat A5 copy. If $CHROME is set, uses
// only that binary; otherwise Playwright's own Chromium, else a local Chrome or
// Chromium. Before rendering it removes only the files it writes itself (by
// exact name, per book); nothing else in the output folder is touched.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ? resolve(process.argv[2]) : resolve(HERE, '..', '..', 'decodable-books');
const PRINT_TIP = 'print double-sided, flip on the short edge, then fold and staple';

function fail(message) {
  console.error(message);
  process.exit(1);
}

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
  for (const text of [book.title, ...book.pages.map((p) => p.text)]) {
    for (const raw of text.split(/\s+/)) {
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

// ---- pictures: black line art to color in (400 x 300) ---------------------
// Every region is filled white so overlapping shapes hide what is behind them,
// and every outline is about STROKE units wide however a figure is scaled.
const INK = '#000';
const STROKE = 3.5;
const GROUND = 262;
const fig = (x, y, s, body) => `<g transform="translate(${x} ${y}) scale(${s})" fill="#fff" stroke="${INK}" stroke-width="${+(STROKE / s).toFixed(3)}" stroke-linejoin="round" stroke-linecap="round">${body}</g>`;
// A limb: an outlined tube of width w along the path d, white inside.
const tube = (d, w, s) => `<path d="${d}" fill="none" stroke-width="${w}"/><path d="${d}" fill="none" stroke="#fff" stroke-width="${+(w - 2 * STROKE / s).toFixed(3)}"/>`;
const dot = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${INK}" stroke="none"/>`;
const thin = (d, s, k = 0.7) => `<path d="${d}" fill="none" stroke-width="${+(k * STROKE / s).toFixed(3)}"/>`;

// A child. Feet (or bench legs) rest on the ground line. `hand` is where the
// right hand goes, in picture coordinates.
const person = (x, { sit = false, s = 1, cap = false, bunches = false, hand = null } = {}) => {
  const y = GROUND - 86 * s;
  // Sitting: seen from the front on a low bench, the body drops by `lift`.
  const lift = sit ? 12 : 0;
  const legs = sit
    ? `<rect x="-34" y="56" width="68" height="9" rx="3"/><rect x="-31" y="65" width="7" height="21"/><rect x="24" y="65" width="7" height="21"/>`
      + tube('M-9 60 V76', 13, s) + tube('M9 60 V76', 13, s) + '<ellipse cx="-11" cy="81" rx="10" ry="5"/><ellipse cx="11" cy="81" rx="10" ry="5"/>'
    : tube('M-8 42 V76', 14, s) + tube('M8 42 V76', 14, s) + '<ellipse cx="-11" cy="81" rx="10" ry="5"/><ellipse cx="11" cy="81" rx="10" ry="5"/>';
  const lap = sit ? '<rect x="-19" y="38" width="38" height="18" rx="7"/>' + thin('M0 41 V56', s, 0.8) : '';
  const [hx, hy] = hand ? [(hand[0] - x) / s, (hand[1] - y) / s - lift] : [26, 34];
  const arms = tube('M-12 4 L-26 34', 11, s) + tube(`M12 4 L${hx} ${hy}`, 11, s)
    + `<circle cx="-26" cy="35" r="6.5"/><circle cx="${hx}" cy="${hy}" r="6.5"/>`;
  const hair = (bunches ? '<circle cx="-25" cy="-36" r="9"/><circle cx="25" cy="-36" r="9"/>' : '');
  const top = cap
    ? '<path d="M-24 -34 C-24 -64 24 -64 24 -34 Z"/><path d="M18 -36 H40 Q45 -36 45 -32 V-31 H18 Z"/><circle cx="0" cy="-56" r="3"/>'
    : '<path d="M-23 -28 C-24 -62 24 -62 23 -28 C16 -40 -16 -40 -23 -28 Z"/>';
  return fig(x, y, s, `${legs}<g transform="translate(0 ${lift})">${arms}<rect x="-18" y="-4" width="36" height="48" rx="10"/>${lap}
    ${hair}<circle cx="0" cy="-30" r="22"/>${top}
    ${dot(-7, -28, 2.5)}${dot(7, -28, 2.5)}${thin('M-7 -18 Q0 -12 7 -18', s, 0.8)}</g>`);
};

// A cat facing left. Feet rest on `base` (the ground line unless on a mat).
// `paw` is where the front paw goes, in picture coordinates.
const cat = (x, { fat = false, s = 1, cap = false, sip = false, paw = null, base = GROUND } = {}) => {
  const rx = fat ? 58 : 40, ry = fat ? 34 : 26, cy = 20, foot = cy + ry + 2;
  const y = base - foot * s;
  const [hx, hy] = sip ? [-46, 4] : [-30, -20];
  const tail = tube(`M${rx - 6} 10 q46 -10 30 -50`, 11, s);
  const reach = paw ? (() => {
    const [px, py] = [(paw[0] - x) / s, (paw[1] - y) / s];
    return tube(`M-30 ${cy + 6} L${px} ${py}`, 12, s) + `<ellipse cx="${px}" cy="${py}" rx="9" ry="6"/>`;
  })() : '';
  const feet = `<ellipse cx="-24" cy="${foot - 5}" rx="10" ry="5"/><ellipse cx="-4" cy="${foot - 5}" rx="10" ry="5"/>`;
  const hat = cap ? '<path d="M-20 -18 C-20 -44 20 -44 20 -18 Z"/><path d="M14 -20 H36 Q40 -20 40 -16 V-15 H14 Z"/><circle cx="0" cy="-37" r="3"/>' : '';
  const bowl = sip ? '<path d="M-74 28 H-24 Q-24 48 -49 48 Q-74 48 -74 28 Z"/><path d="M-70 32 H-28" fill="none"/>' : '';
  return fig(x, y, s, `${tail}${reach}<ellipse cx="0" cy="${cy}" rx="${rx}" ry="${ry}"/>${feet}
    <g transform="translate(${hx} ${hy})">
      <path d="M-24 -6 L-20 -34 L-6 -20 Z M24 -6 L20 -34 L6 -20 Z"/>
      <circle r="26"/>${hat}
      ${dot(-9, -4, 3)}${dot(9, -4, 3)}<path d="M-3 6 L3 6 L0 9 Z" fill="${INK}"/>${thin('M0 9 V12 M0 12 Q-4 16 -7 13 M0 12 Q4 16 7 13', s, 0.8)}
      ${thin('M-14 8 H-38 M-14 13 L-36 18 M14 8 H38 M14 13 L36 18', s, 0.6)}
    </g>${bowl}`);
};

// A garden tap on a post that stands on the ground; drips fall from the spout.
const tap = (x, y, { drips = 0, s = 1 } = {}) => {
  const floor = (GROUND - y) / s;
  let d = '';
  for (let i = 0, t = 54; i < drips && t + 14 < floor - 2; i++, t += 22) d += `<path d="M42 ${t} Q35 ${t + 10} 42 ${t + 14} Q49 ${t + 10} 42 ${t} Z"/>`;
  return fig(x, y, s, `<rect x="-54" y="28" width="20" height="${floor - 28}"/>
    <rect x="-60" y="-10" width="32" height="40" rx="4"/>
    <rect x="-8" y="-32" width="16" height="34"/>
    <path d="M-28 0 H30 Q50 0 50 20 V44 H34 V24 Q34 18 28 18 H-28 Z"/>
    <rect x="-26" y="-40" width="52" height="10" rx="5"/>${d}`);
};

// A cap standing on the ground, peak to the right.
const capPic = (x, s = 1) => fig(x, GROUND - 16 * s, s, `<path d="M30 16 V10 H86 Q94 10 94 16 Z"/>
  <path d="M-50 16 C-50 -44 50 -44 50 16 Z"/>${thin('M0 -26 C-14 -10 -16 4 -16 16', s, 0.8)}<circle cx="0" cy="-31" r="5"/>`);

// A map lying flat on the floor, seen from above and in front.
const map = () => fig(0, 0, 1, `<path d="M40 226 H220 L250 290 H10 Z"/>
  ${thin('M100 226 L90 290 M160 226 L170 290', 1, 1)}
  <path d="M34 276 Q75 236 115 258 T188 252" fill="none" stroke-dasharray="7 7"/>
  <path d="M190 236 L206 252 M206 236 L190 252" fill="none" stroke-width="5"/>`);

const mat = (cx, w) => fig(0, 0, 1, `<rect x="${cx - w / 2}" y="252" width="${w}" height="10" rx="4"/>`);
const ground = `<path d="M0 ${GROUND} H400" stroke="${INK}" stroke-width="2.5"/>`;
const svg = (body) => `<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">${ground}${body}</svg>`;

// ---- the books ------------------------------------------------------------
const SAM = { bunches: true };
const books = [
  {
    id: 'book-1-tap-tap', title: 'Tap, tap', level: 'Set 1', sounds: SET1, tricky: [],
    cover: svg(tap(200, 110, { drips: 2, s: 1.6 })),
    pages: [
      { text: 'Tap.', pic: svg(tap(200, 92, { s: 1.7 })) },
      { text: 'Tap, tap, tap.', pic: svg(tap(200, 90, { drips: 3, s: 1.5 })) },
      { text: 'Pat sat.', pic: svg(person(200, { sit: true, s: 1.8 })) },
      { text: 'Pat sat at a tap.', pic: svg(person(110, { sit: true, s: 1.5 }) + tap(290, 142, { drips: 2, s: 1.2 })) },
      { text: 'Pat taps a tap.', pic: svg(tap(255, 168, { drips: 1, s: 1.2 }) + person(150, { s: 1.5, hand: [232, 110] })) },
      { text: 'Tap, tap! Pat sat.', pic: svg(tap(305, 122, { drips: 3, s: 1.2 }) + person(120, { sit: true, s: 1.5 })) },
    ],
  },
  {
    id: 'book-2-pip-the-cat', title: 'Pip the cat', level: 'Sets 1 and 2', sounds: [...SET1, ...SET2], tricky: ['the', 'is'],
    cover: svg(cat(200, { s: 1.8 })),
    pages: [
      { text: 'Pip is a cat.', pic: svg(cat(200, { s: 1.9 })) },
      { text: 'Pip sits.', pic: svg(mat(200, 300) + cat(200, { s: 1.8, base: 254 })) },
      { text: 'Tim pats Pip.', pic: svg(cat(270, { s: 1.3 }) + person(150, { s: 1.5, hand: [231, 132] })) },
      { text: 'Pip sips. Sip, sip, sip.', pic: svg(cat(250, { sip: true, s: 1.5 })) },
      { text: 'Pip is a fat cat!', pic: svg(cat(195, { fat: true, s: 1.7 })) },
      { text: 'Pip sits. Tim sits.', pic: svg(mat(290, 180) + cat(290, { s: 1.2, base: 254 }) + person(105, { sit: true, s: 1.4 })) },
    ],
  },
  {
    id: 'book-3-caps', title: 'Caps', level: 'Sets 1 and 2', sounds: [...SET1, ...SET2], tricky: ['the'],
    cover: svg(capPic(75, 1.2) + capPic(272, 1.2)),
    pages: [
      { text: 'A cap.', pic: svg(capPic(156, 2)) },
      { text: 'Sam fits a cap.', pic: svg(person(190, { ...SAM, cap: true, s: 1.6 })) },
      { text: 'Tim fits a cap.', pic: svg(person(190, { cap: true, s: 1.6 })) },
      { text: 'Pip fits a cap!', pic: svg(cat(200, { cap: true, s: 1.9 })) },
      { text: 'Sam, Tim, Pip. Caps!', pic: svg(person(75, { ...SAM, cap: true, s: 1.2 }) + person(195, { cap: true, s: 1.2 }) + cat(315, { cap: true, s: 0.95 })) },
      { text: 'Pip taps the map.', pic: svg(map() + cat(300, { s: 1.2, paw: [214, 256] })) },
    ],
  },
];

// ---- layout ---------------------------------------------------------------
function font(weight) {
  try {
    return readFileSync(require.resolve(`@fontsource/andika/files/andika-latin-${weight}-normal.woff2`)).toString('base64');
  } catch {
    fail('The reading font is missing. Run: npm install --no-save @fontsource/andika');
  }
}
const css = () => `
@font-face { font-family: Andika; src: url(data:font/woff2;base64,${font(400)}) format('woff2'); font-weight: 400; }
@font-face { font-family: Andika; src: url(data:font/woff2;base64,${font(700)}) format('woff2'); font-weight: 700; }
* { box-sizing: border-box; margin: 0; }
html, body { background: #fff; }
body { font-family: Andika, sans-serif; color: #000; font-variant-ligatures: none; }
.page { width: 148mm; height: 210mm; padding: 12mm 12mm 10mm; display: flex; flex-direction: column; position: relative; overflow: hidden; }
.pic { flex: 1; display: flex; align-items: center; justify-content: center; }
.pic svg { width: 100%; max-height: 120mm; }
.text { font-size: 30pt; line-height: 1.35; text-align: center; min-height: 40mm; display: flex; align-items: center; justify-content: center; letter-spacing: 0.02em; word-spacing: 0.25em; }
.num { position: absolute; bottom: 6mm; left: 0; right: 0; text-align: center; font-size: 10pt; }
.cover h1 { font-size: 40pt; text-align: center; margin-top: 4mm; }
.cover .lvl { text-align: center; font-size: 13pt; }
.cover .owner { margin-top: auto; font-size: 13pt; display: flex; align-items: flex-end; gap: 3mm; }
.cover .owner .line { flex: 1; border-bottom: 1pt solid #000; height: 1em; }
.back { font-size: 11.5pt; line-height: 1.45; }
.back h2 { font-size: 15pt; margin: 3mm 0 1.5mm; }
.back .sounds { font-size: 26pt; letter-spacing: 0.3em; }
.back .words { font-size: 14pt; word-spacing: 0.6em; }
.back ul { padding-left: 5mm; }
.back .small { font-size: 9pt; margin-top: auto; }
.sheet { width: 297mm; height: 210mm; display: flex; page-break-after: always; }
`;
function pagesOf(book, words) {
  const cover = `<div class="page cover"><div class="lvl">${book.level}: ${book.sounds.join(' ')}</div><h1>${book.title}</h1>
    <div class="pic">${book.cover}</div><div class="owner"><span>This book belongs to</span><span class="line"></span></div></div>`;
  const story = book.pages.map((p, i) => `<div class="page"><div class="pic">${p.pic}</div><div class="text">${p.text}</div><div class="num">${i + 2}</div></div>`);
  const back = `<div class="page back"><h2>Sounds in this book</h2><div class="sounds">${book.sounds.join(' ')}</div>
    ${book.tricky.length ? `<h2>Tricky words</h2><div class="words">${book.tricky.join(' ')}</div><p>Say these together; they don't follow the sounds yet.</p>` : ''}
    <h2>Words to sound out</h2><div class="words">${words.join(' ')}</div>
    <h2>Reading it together</h2><ul>
      <li>Before reading: point to each sound on this page and say it together.</li>
      <li>Sound out each word, then blend: "s-a-t, sat."</li>
      <li>Say a name with a capital letter the same way: "P-a-t, Pat."</li>
      <li>Read it again tomorrow. The second read is where fluency comes from.</li>
    </ul>
    <h2>For different ages</h2><ul>
      <li><b>About 3:</b> read it to them, point under each word, and play "what sound does it start with?"</li>
      <li><b>About 6:</b> they sound out, you help blend.</li>
      <li><b>About 9:</b> the reader for a younger sibling, or try writing a page of their own using only these sounds.</li>
    </ul>
    <div class="small">Harrington decodable reader. Every word checked against the sounds above. Color in the pictures!</div></div>`;
  return [cover, ...story, back];
}

// ---- browser --------------------------------------------------------------
const BROWSERS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];
async function launchBrowser() {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch {
    fail('Playwright is missing. Run npm install (or npm ci) in the repository first.');
  }
  const tries = process.env.CHROME ? [process.env.CHROME] : [null, ...BROWSERS.filter((p) => existsSync(p))];
  let lastError = '';
  for (const executablePath of tries) {
    try { return await chromium.launch(executablePath ? { executablePath } : {}); } catch (e) {
      lastError = `${executablePath ?? "Playwright's Chromium"}: ${String(e?.message ?? e).split('\n')[0]}`; // try the next one
    }
  }
  fail(`Could not start a browser to make the PDFs${process.env.CHROME ? ` (CHROME=${process.env.CHROME} did not start)` : ''}. `
    + (lastError ? `Last launch error: ${lastError}. ` : '')
    + 'Either point the script at a Chrome or Chromium you already have, for example '
    + 'CHROME=<path to a Chrome or Chromium binary> node tools/decodable-books/make-books.mjs, '
    + 'or install the browser Playwright uses with: npx playwright install chromium');
}

// ---- run --------------------------------------------------------------------
// 1. Check everything first: the checker itself, then every book.
const refuses = (book, words) => {
  try { check(book); } catch (e) { return e.message.endsWith(`: ${words}`); }
  return false;
};
if (!refuses({ title: 'Pat', sounds: SET1, tricky: [], pages: [{ text: 'Pat sat on a mat.' }] }, 'on, mat')
  || !refuses({ title: 'Pat on a mat', sounds: SET1, tricky: [], pages: [{ text: 'Pat sat.' }] }, 'on, mat')) {
  fail('Checker self-test failed: it let a word outside the code through.');
}
const checked = [];
for (const book of books) {
  try { checked.push({ book, words: check(book) }); } catch (e) { fail(`Nothing printed. ${e.message}`); }
}
console.log('checker self-test: refuses "on" and "mat" for set 1, in the text and in a title');

// 2. Then remove this script's own earlier output (exact names only) and render.
const style = css();
const doc = (body, size) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page { size: ${size}; margin: 0; } ${style}</style></head><body>${body}</body></html>`;
const browser = await launchBrowser();
mkdirSync(OUT, { recursive: true });
const flatName = (id) => `${id}-flat-A5.pdf`;
const bookletName = (id) => `${id}-booklet-A4-print-double-sided-short-edge-flip.pdf`;
const legacyBookletName = (id) => `${id}-booklet-A4.pdf`; // first version's name
for (const { book } of checked) {
  for (const name of [flatName(book.id), bookletName(book.id), legacyBookletName(book.id)]) rmSync(join(OUT, name), { force: true });
}
const page = await browser.newPage();
for (const { book, words } of checked) {
  const p = pagesOf(book, words); // 8 pages: 1 cover, 2-7 story, 8 back
  if (p.length !== 8) fail('8 pages expected');
  // Flat: one A5 page per sheet, in reading order.
  await page.setContent(doc(p.map((x) => `<div style="page-break-after:always">${x}</div>`).join(''), 'A5 portrait'));
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: join(OUT, flatName(book.id)), width: '148mm', height: '210mm', printBackground: true, preferCSSPageSize: true });
  // Booklet: A4 landscape, two A5 pages a side; print both sides, flip on the short edge, fold, staple.
  const order = [[8, 1], [2, 7], [6, 3], [4, 5]];
  await page.setContent(doc(order.map(([l, r]) => `<div class="sheet">${p[l - 1]}${p[r - 1]}</div>`).join(''), 'A4 landscape'));
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: join(OUT, bookletName(book.id)), width: '297mm', height: '210mm', printBackground: true, preferCSSPageSize: true });
  console.log(`${book.title}: decodable, words: ${words.join(' ')}`);
}
await browser.close();
console.log(`\nPDFs in ${OUT}\nBooklets (A4): ${PRINT_TIP}. Flat copies (A5): print as they are.`);
