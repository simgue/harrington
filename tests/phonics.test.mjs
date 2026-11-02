// Decodable books (HAR-45): the sound sequence and known code, the
// decodability checker, the book bank, the picture library, the generator and
// booklet imposition (src/js/phonics/).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allGraphemes, allTrickyWords, defaultTricky, deriveStage, DOUBLES, makeCode, nextStage, sequenceById, stageSummary } from '../src/js/phonics/sequence.js';
import { checkBook, checkText, checkWord, hasCluster, parse, soundOf, wordsOf } from '../src/js/phonics/decodability.js';
import { BANK } from '../src/js/phonics/bank.js';
import { isPictureKind, PICTURE_KINDS, PICTURES, renderItem, renderScene, STROKE, VIEW_H, VIEW_W } from '../src/js/phonics/pictures.js';
import { acceptDraft, generateBook, NAMES, NOUNS, rng } from '../src/js/phonics/generator.js';
import { bookletSheets, padToFour } from '../src/js/phonics/imposition.js';
import { bookFacts, bookStage, booksFor, defaultFocus, describeMissing, knownCode, LAYOUTS, missingFor, normalizeReading, readingSummary, stageOf, trickyOf } from '../src/js/phonics/reading.js';

const seq = sequenceById();
const SET1 = ['s', 'a', 't', 'p'];
const SET12 = [...SET1, 'i', 'm', 'f', 'c'];
// The code a child has who knows the first n stages and their default words.
const codeAt = (n) => {
  const stages = seq.stages.slice(0, n);
  return makeCode({ graphemes: stages.flatMap((s) => s.graphemes), tricky: defaultTricky(n), clusters: stages.some((s) => s.clusters) });
};

// ---- sequence and known code -------------------------------------------------
test('the school sequence: eight sets, adjacent consonants, ai ay, ee ea', () => {
  assert.equal(seq.id, 'school-2026');
  assert.deepEqual(seq.stages.map((s) => s.graphemes.join(' ')), [
    's a t p', 'i m f c', 'o d g l', 'h b n v', 'e qu z r', 'u y j k', 'x w ck sh', 'ch th wh ng', '', 'ai ay', 'ee ea',
  ]);
  assert.equal(seq.stages[8].clusters, true);
  assert.deepEqual(allTrickyWords(), ['the', 'is', 'I', 'to', 'no', 'go', 'into', 'he', 'she', 'we', 'me', 'be', 'was', 'you', 'they', 'all', 'are', 'my', 'her']);
  assert.equal(allGraphemes().length, 36);
});

test('the stage is derived from the known code, never stored', () => {
  assert.equal(deriveStage(makeCode()), 0);
  assert.equal(deriveStage(makeCode({ graphemes: SET1 })), 1);
  assert.equal(deriveStage(makeCode({ graphemes: [...SET12, 'o', 'd', 'g'] })), 2, 'set 3 is not whole without l');
  // A set known out of order counts in the code but not in the stage.
  assert.equal(deriveStage(makeCode({ graphemes: [...SET1, 'o', 'd', 'g', 'l'] })), 1);
  // The clusters stage needs the tick, not new graphemes.
  const eight = seq.stages.slice(0, 8).flatMap((s) => s.graphemes);
  assert.equal(deriveStage(makeCode({ graphemes: [...eight, 'ai', 'ay'] })), 8);
  assert.equal(deriveStage(makeCode({ graphemes: [...eight, 'ai', 'ay'], clusters: true })), 10);
  assert.equal(deriveStage(codeAt(11)), 11);
  assert.deepEqual(nextStage(makeCode({ graphemes: SET1 })).missing, ['i', 'm', 'f', 'c']);
  assert.equal(nextStage(codeAt(11)), null);
  assert.equal(stageSummary(makeCode({ graphemes: [...SET12, 'o', 'd', 'g', 'l'] })), 'Reading at set 3. Next sounds: h b n v');
  assert.equal(stageSummary(makeCode()), 'Not started yet. Next sounds: s a t p');
  assert.equal(stageSummary(codeAt(8)), 'Reading at set 8. Next: adjacent consonants (words like stop, mist, jumps).');
  assert.match(stageSummary(codeAt(11)), /Every sound in the sequence is known/);
});

test('the default tricky words follow the stage until the parent edits them', () => {
  assert.deepEqual(defaultTricky(1), []);
  assert.deepEqual(defaultTricky(2), ['the', 'is']);
  assert.deepEqual(defaultTricky(3), ['the', 'is', 'I', 'to', 'no', 'go', 'into']);
  assert.deepEqual(trickyOf({ graphemes: SET12 }), ['the', 'is']);
  assert.deepEqual(trickyOf({ graphemes: SET12, tricky: ['was'] }), ['was'], 'an edited list is the parent\'s');
  assert.deepEqual(trickyOf({ graphemes: SET12, tricky: [] }), []);
  // Tricky words compare in lower case: "I" is "i".
  assert.ok(knownCode({ graphemes: [...SET12, 'o', 'd', 'g', 'l'] }).tricky.has('i'));
  assert.equal(stageOf({ graphemes: SET12 }), 2);
  assert.equal(readingSummary({ graphemes: SET12 }), 'Reading at set 2. Next sounds: o d g l');
});

test('normalizeReading fills a setup from nothing and drops what it cannot use', () => {
  const empty = normalizeReading(undefined);
  assert.deepEqual(empty, { sequence: 'school-2026', graphemes: [], clusters: false, tricky: null, custom: { graphemes: [], tricky: [] }, prefs: { nameOnCover: true, layout: 'booklet' }, library: [] });
  const messy = normalizeReading({ graphemes: ['S', 's', 'a', 7, 'toolong', 'é'], tricky: ['I', 'i', 'the', '2'], prefs: { layout: 'scroll', nameOnCover: false }, library: [null, { id: 'x' }, { id: 'b', book: { title: 'T', pages: [] } }], sequence: 'other' });
  assert.deepEqual(messy.graphemes, ['s', 'a']);
  assert.deepEqual(messy.tricky, ['I', 'the']);
  assert.deepEqual(messy.prefs, { nameOnCover: false, layout: 'booklet' });
  assert.equal(messy.library.length, 1);
  assert.equal(messy.sequence, 'school-2026');
  assert.deepEqual(LAYOUTS, ['booklet', 'flat']);
});

// ---- decodability ---------------------------------------------------------------
test('parse: longest grapheme first, doubled consonants as one sound', () => {
  const all = allGraphemes();
  assert.deepEqual(parse('sat', SET1), ['s', 'a', 't']);
  assert.deepEqual(parse('ship', all), ['sh', 'i', 'p']);
  assert.deepEqual(parse('chick', all), ['ch', 'i', 'ck']);
  assert.deepEqual(parse('quack', all), ['qu', 'a', 'ck']);
  assert.deepEqual(parse('rain', all), ['r', 'ai', 'n']);
  assert.deepEqual(parse('seat', all), ['s', 'ea', 't']);
  assert.deepEqual(parse('sing', all), ['s', 'i', 'ng']);
  // Doubled consonants read as the single sound once its letter is known.
  assert.deepEqual(parse('miss', SET12), ['m', 'i', 'ss']);
  assert.deepEqual(parse('off', [...SET12, 'o']), ['o', 'ff']);
  assert.deepEqual(parse('bell', ['b', 'e', 'l']), ['b', 'e', 'll']);
  assert.deepEqual(parse('buzz', ['b', 'u', 'z']), ['b', 'u', 'zz']);
  assert.deepEqual(parse('egg', ['e', 'g']), ['e', 'gg']);
  assert.deepEqual(parse('add', ['a', 'd']), ['a', 'dd']);
  assert.deepEqual(parse('odd', ['o', 'd']), ['o', 'dd']);
  assert.deepEqual(parse('inn', ['i', 'n']), ['i', 'nn']);
  assert.deepEqual(parse('ebb', ['e', 'b']), ['e', 'bb']);
  assert.deepEqual(DOUBLES, ['ss', 'ff', 'll', 'zz', 'tt', 'pp', 'mm', 'bb', 'dd', 'gg', 'nn', 'rr']);
  assert.ok(!DOUBLES.includes('cc'), 'cc is two sounds in accent');
  assert.equal(soundOf('rr'), 'r');
  assert.equal(parse('tell', ['t', 'e']), null, 'll needs l');
  // A digraph the child does not know is not read as its letters.
  assert.equal(parse('ship', ['s', 'h', 'i', 'p']), null);
  assert.equal(parse('duck', ['d', 'u', 'c', 'k']), null);
  assert.equal(parse('mat', SET1), null);
  assert.equal(parse('Sat', SET1), null, 'parse takes lower case');
});

test('graphemes the sequence does not teach are not read letter by letter', () => {
  const six = codeAt(6);
  // oo oa ar or: one grapheme each, unknown, so the word fails at set 5 and 6.
  for (const code of [codeAt(5), six]) {
    for (const w of ['book', 'boat', 'car', 'for', 'of']) assert.equal(checkWord(w, code).ok, false, `${w} at set ${code === six ? 6 : 5}`);
  }
  assert.deepEqual(parse('book', allGraphemes()), null);
  assert.deepEqual(parse('book', [...allGraphemes(), 'oo']), ['b', 'oo', 'k'], 'a parent who adds oo gets it');
  assert.equal(checkWord('of', makeCode({ graphemes: allGraphemes(), tricky: ['of'] })).ok, true, 'of reads as a tricky word');
  for (const w of ['term', 'turn', 'cow', 'out', 'coin', 'boy', 'high', 'pie', 'cue', 'new', 'saw', 'haul']) assert.equal(checkWord(w, codeAt(11)).ok, false, w);
  // A vowel, a consonant and a final e is a split digraph, not three sounds.
  for (const w of ['cake', 'like', 'home', 'cute', 'quake']) assert.equal(checkWord(w, six).ok, false, `${w} at set 6`);
  assert.equal(checkWord('cake', makeCode({ graphemes: [...six.graphemes, 'a-e'] })).ok, true, 'a code with a-e reads cake');
  // Not split digraphs: a final e alone, ee, a double before e, a digraph word.
  for (const w of ['bee', 'tree', 'the', 'she']) assert.equal(checkWord(w, makeCode({ graphemes: allGraphemes(), clusters: true })).ok, true, w);
});

test('adjacent consonants need the clusters stage; a final -s does not count', () => {
  const all = allGraphemes();
  assert.equal(hasCluster(parse('stop', all)), true);
  assert.equal(hasCluster(parse('mist', all)), true);
  assert.equal(hasCluster(parse('jumps', all)), true);
  assert.equal(hasCluster(parse('taps', all)), false);
  assert.equal(hasCluster(parse('ducks', all)), false);
  assert.equal(hasCluster(parse('shop', all)), false, 'a digraph is one sound');
  assert.equal(hasCluster(parse('quiz', all)), false);
  assert.deepEqual(checkText('Stop at the tap.', codeAt(8)), ['stop']);
  assert.deepEqual(checkText('Stop at the tap.', codeAt(9)), []);
});

test('checkText: tricky words pass, names are lowercased, non-ASCII and digits fail', () => {
  const code = makeCode({ graphemes: SET12, tricky: ['the', 'is', 'I'] });
  assert.deepEqual(checkText('Pip is a cat. Tim pats the cat!', code), []);
  assert.deepEqual(checkText('I sit.', code), []);
  assert.deepEqual(checkText('“Sam, Tim, Pip. Caps!”', code), [], 'quotes and punctuation are stripped');
  assert.deepEqual(checkText('Pat sat on a mat.', makeCode({ graphemes: SET1 })), ['on', 'mat']);
  assert.deepEqual(checkText('The cat sat.', makeCode({ graphemes: SET12 })), ['the'], 'a tricky word must be known as one');
  // Non-ASCII letters and digits fail rather than being stripped.
  assert.deepEqual(checkText('Pát sat.', code), ['pát']);
  assert.deepEqual(checkText('Pat sat 3 taps.', code), ['3']);
  assert.deepEqual(checkText('Pip2 sat.', code), ['pip2']);
  assert.deepEqual(checkText("Pip's cap.", code), ["pip's"]);
  assert.deepEqual(checkText('Tip-tap.', code), ['tip-tap']);
  assert.deepEqual(wordsOf('  Tap, tap!  '), ['Tap', 'tap']);
  // Each failing word once, in order.
  assert.deepEqual(checkText('dog dog cat log', code), ['dog', 'log']);
});

test('checkBook checks the title and every page', () => {
  const code = makeCode({ graphemes: SET1 });
  const book = { title: 'Tap, tap', pages: [{ text: 'Pat taps.' }, { text: 'Pat sat.' }] };
  const ok = checkBook(book, code);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.words, ['pat', 'sat', 'tap', 'taps']);
  assert.deepEqual(new Set(ok.graphemes), new Set(['p', 'a', 't', 's']));
  assert.deepEqual(checkBook({ ...book, title: 'The tap' }, code).failing, ['the']);
  assert.deepEqual(checkBook({ ...book, pages: [...book.pages, { text: 'Pat sips.' }] }, code).failing, ['sips']);
});

// ---- the bank ------------------------------------------------------------------
test('every bank book passes checkBook against its own declared code', () => {
  for (const book of BANK) {
    const own = makeCode({ graphemes: book.graphemes, tricky: book.tricky, clusters: book.clusters });
    const result = checkBook(book, own);
    assert.deepEqual(result.failing, [], `${book.title}: ${result.failing.join(', ')}`);
    // It declares exactly what it uses, so "needs" on a muted card is true.
    assert.deepEqual(new Set(result.graphemes), new Set(book.graphemes), `${book.title} declares the graphemes it uses`);
    assert.deepEqual(new Set(result.tricky), new Set(book.tricky), `${book.title} declares the tricky words it uses`);
    assert.equal(result.clusters, book.clusters, `${book.title} declares whether it needs adjacent consonants`);
    for (const g of book.focus) assert.ok(book.graphemes.includes(g), `${book.title}: focus ${g} is used`);
    assert.equal(book.pages.length, 6, `${book.title} has six story pages`);
    for (const p of book.pages) assert.ok(p.text.split(/\s+/).length <= 8, `${book.title}: "${p.text}" is short`);
  }
  assert.equal(new Set(BANK.map((b) => b.id)).size, BANK.length, 'ids are unique');
});

test('every scene item in the bank is a picture the library has', () => {
  for (const book of BANK) {
    for (const scene of [book.cover, ...book.pages.map((p) => p.scene)]) {
      assert.ok(Array.isArray(scene) && scene.length, `${book.title} has a picture on every page`);
      for (const item of scene) {
        assert.ok(PICTURE_KINDS.includes(item.kind), `${book.title}: ${item.kind}`);
        for (const k of ['x', 'y', 'scale']) assert.equal(typeof item[k], 'number');
      }
    }
  }
});

test('every stage from set 1 to ee ea has a bank book, and the ported three are there', () => {
  const stages = new Set(BANK.map((b) => bookStage(b)));
  for (let n = 1; n <= seq.stages.length; n += 1) assert.ok(stages.has(n), `a book for ${seq.stages[n - 1].label}`);
  for (const title of ['Tap, tap', 'Pip the cat', 'Caps']) assert.ok(BANK.some((b) => b.title === title), title);
  // Made-up names only: every capitalized word is a name of the generator's list
  // or a sentence start.
  const names = new Set([...NAMES.map((n) => n.name), 'Bob', 'Chip', 'Fred', 'Meg', 'Jack', 'Jay', 'Dee']);
  for (const book of BANK) {
    for (const p of book.pages) {
      const words = p.text.split(/\s+/);
      words.forEach((w, i) => {
        const bare = w.replace(/[^A-Za-z]/g, '');
        const start = i === 0 || /[.!?]$/.test(words[i - 1]);
        if (/^[A-Z]/.test(bare) && !start) assert.ok(names.has(bare), `${book.title}: ${bare} is a made-up name`);
      });
    }
  }
});

test('booksFor lists books within the code, newest sounds first, and those just beyond with what they need', () => {
  const { within, beyond } = booksFor(codeAt(2));
  assert.deepEqual(within.map((b) => b.title).sort(), ['Caps', 'Pip the cat', 'Tap, tap']);
  assert.notEqual(within[within.length - 1].title, 'Caps', 'newest sounds first: set 1 is last');
  assert.equal(within[within.length - 1].title, 'Tap, tap');
  const dot = beyond.find((b) => b.book.title === 'Dot the dog');
  assert.deepEqual(dot.missing.graphemes, ['o', 'd', 'g']);
  assert.equal(describeMissing(dot.missing), 'o d g');
  assert.ok(!beyond.some((b) => b.book.title === 'A bee in a tree'), 'far books are not listed');
  assert.deepEqual(booksFor(makeCode()).within, []);
  // Every bank book is within the whole code.
  assert.equal(booksFor(codeAt(11)).within.length, BANK.length);
  const duck = BANK.find((b) => b.title === 'A duck on a ship');
  assert.equal(describeMissing(missingFor(duck, codeAt(6))), 'w ck sh');
  const frog = BANK.find((b) => b.title === 'Fred the frog');
  assert.equal(describeMissing(missingFor(frog, makeCode({ graphemes: allGraphemes() }))), 'adjacent consonants', 'the and is decode with every sound known');
  assert.equal(describeMissing(missingFor(frog, makeCode({ graphemes: SET12, clusters: true }))).endsWith('tricky: the'), true, 'is decodes from i and s; the needs th');
  // Every sound, adjacent consonants and an emptied tricky list: every book reads.
  const full = makeCode({ graphemes: allGraphemes(), clusters: true, tricky: [] });
  const { within: fullWithin, beyond: fullBeyond } = booksFor(full);
  assert.equal(fullWithin.length, BANK.length, fullBeyond.map((b) => `${b.book.title}: ${describeMissing(b.missing)}`).join('; '));
});

// ---- pictures ------------------------------------------------------------------
test('pictures are outlines to color: black strokes, white fills, no color', () => {
  for (const kind of ['person', 'cat', 'dog', 'tap', 'cap', 'map', 'mat', 'sun', 'hat', 'bus', 'pig', 'hen', 'cup', 'bed', 'fish', 'ship', 'duck', 'frog', 'bell', 'cloud', 'tree', 'bee']) {
    assert.ok(PICTURES[kind], `the library has ${kind}`);
  }
  const variants = [
    ...PICTURE_KINDS.map((kind) => ({ kind })),
    { kind: 'person', pose: 'sit', arms: 'pat' }, { kind: 'person', arms: 'wave', cap: true }, { kind: 'person', arms: 'out', hair: 'long' },
    { kind: 'person', pose: 'sit', seat: false }, { kind: 'cat', pose: 'fat', cap: true }, { kind: 'cat', pose: 'sip' }, { kind: 'cat', pose: 'nap' },
    { kind: 'dog', pose: 'sit' }, { kind: 'tap', drips: 3 },
  ];
  for (const v of variants) {
    for (const scale of [0.6, 1, 1.5]) {
      const svg = renderScene([{ ...v, x: 200, y: 262, scale }]);
      const colors = new Set([...svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]));
      for (const c of colors) assert.ok(['#000', '#fff', 'none'].includes(c), `${v.kind}: ${c}`);
      // Every closed shape is filled white (or black, for an eye).
      for (const m of svg.matchAll(/<(rect|circle|ellipse)\b[^>]*>/g)) assert.match(m[0], /fill="#(fff|000)"/, `${v.kind}: ${m[0]}`);
      for (const m of svg.matchAll(/<path\b[^>]*>/g)) {
        if (/Z"/.test(m[0]) || /z"/.test(m[0])) assert.match(m[0], /fill="#(fff|000)"/, `${v.kind}: closed path filled`);
      }
      // Strokes print 3.5 units wide whatever the scale (the union outline is
      // twice that, half of it hidden; the ground line is thin).
      const item = renderItem({ ...v, x: 200, y: 262, scale });
      const w = Number(item.match(/stroke-width="([\d.]+)"/)[1]) * scale;
      assert.ok(Math.abs(w - STROKE) < 0.01, `${v.kind} at ${scale}: ${w}`);
      assert.ok(STROKE >= 3 && STROKE <= 4);
      assert.match(svg, /stroke-linejoin="round" stroke-linecap="round"/);
    }
  }
  const svg = renderScene([]);
  assert.match(svg, new RegExp(`viewBox="0 0 ${VIEW_W} ${VIEW_H}"`));
  assert.match(svg, /<path d="M8 262 H392"[^>]*stroke-width="1.5"/, 'a thin ground line');
  assert.throws(() => renderItem({ kind: 'dragon' }), /No picture called "dragon"/);
  // A scene from a newer version or a hand-edited file: unknown kinds are left
  // out, never thrown, and an inherited name is not a picture.
  assert.equal(renderScene([{ kind: 'kite' }]), renderScene([]));
  assert.equal(renderScene([{ kind: 'constructor' }, { kind: 'toString' }, { kind: '__proto__' }, null, { kind: 'cat' }]), renderScene([{ kind: 'cat' }]));
  assert.doesNotMatch(renderScene([{ kind: 'constructor' }]), /object Object/);
  assert.equal(isPictureKind('constructor'), false);
  assert.equal(isPictureKind('cat'), true);
  // A tilted item turns about its anchor.
  assert.match(renderItem({ kind: 'pot', x: 200, y: 200, tilt: 72 }), /translate\(200 200\) rotate\(72\) scale/);
  assert.match(renderScene([], { label: 'A <cat>' }), /aria-label="A &lt;cat&gt;"/);
});

// ---- generator -----------------------------------------------------------------
test('the generator\'s books pass checkBook at every stage, over many seeds and both lengths', () => {
  for (let n = 1; n <= seq.stages.length; n += 1) {
    const code = codeAt(n);
    const focus = seq.stages[n - 1].graphemes;
    for (let seed = 1; seed <= 60; seed += 1) {
      for (const pages of [6, 10]) {
        const book = generateBook(code, { focus, seed, pages, focusClusters: !focus.length });
        const at = `stage ${n}, seed ${seed}, ${pages} pages`;
        assert.ok(book, `${at}: a book`);
        assert.equal(book.pages.length, pages);
        assert.deepEqual(checkBook(book, code).failing, [], at);
        for (const scene of [book.cover, ...book.pages.map((p) => p.scene)]) {
          for (const item of scene) assert.ok(PICTURE_KINDS.includes(item.kind));
        }
        assert.ok(NAMES.some((nm) => book.title.includes(nm.name)) || /^(The|A) /.test(book.title), book.title);
        // The cover names only sounds the book uses.
        const facts = bookFacts(book);
        for (const g of facts.focus) assert.ok(facts.sounds.includes(g), `${at}: cover sound ${g} is in the book`);
        // A clusters book has a word with adjacent consonants.
        if (!focus.length) assert.ok(book.clusters, `${at}: a word with two consonants together`);
        // No sentence twice once the code can say more than set 1.
        if (n > 1) assert.equal(new Set(book.pages.map((p) => p.text)).size, pages, `${at}: no repeated page`);
      }
    }
  }
});

test('the generator is deterministic for a seed, favors the focus and needs some code', () => {
  const code = codeAt(7);
  const a = generateBook(code, { focus: ['ck', 'sh'], seed: 42 });
  assert.deepEqual(generateBook(code, { focus: ['ck', 'sh'], seed: 42 }), a);
  assert.notDeepEqual(generateBook(code, { focus: ['ck', 'sh'], seed: 43 }), a);
  // Across seeds, focus books use the focus sounds more than unfocused ones.
  const uses = (focus) => {
    let n = 0;
    for (let seed = 1; seed <= 40; seed += 1) n += generateBook(code, { focus, seed }).graphemes.filter((g) => ['ck', 'sh'].includes(g)).length;
    return n;
  };
  assert.ok(uses(['ck', 'sh']) > uses([]), 'the focus is favored');
  assert.equal(generateBook(makeCode(), { seed: 1 }), null);
  assert.equal(generateBook(makeCode({ graphemes: ['i', 'm'] }), { seed: 1 }), null, 'no name to write about');
  // Names come from the made-up list, never the learner.
  for (let seed = 1; seed <= 20; seed += 1) {
    const book = generateBook(codeAt(5), { seed });
    assert.ok(!JSON.stringify(book).includes('Rowan'));
  }
  assert.equal(rng(5)(), rng(5)());
  // A story never uses a learner's first name (read on this computer only).
  for (let seed = 1; seed <= 40; seed += 1) {
    const book = generateBook(codeAt(5), { seed, avoidNames: ['Sam Smith', 'kim', 'Ben'] });
    assert.ok(!/\b(Sam|Kim|Ben)\b/.test(JSON.stringify(book.pages.map((p) => p.text)) + book.title), `seed ${seed}`);
  }
  assert.equal(generateBook(makeCode({ graphemes: SET1 }), { avoidNames: ['Pat'] }), null, 'no name left to use');
  assert.ok(NOUNS.every((n) => PICTURE_KINDS.includes(n.pic)));
});

test('acceptDraft: the gate a drafted book must pass', () => {
  const code = makeCode({ graphemes: SET1 });
  const draft = { title: 'Tap', cover: [{ kind: 'tap', x: 200, y: 120, scale: 1 }], pages: [{ text: 'Pat taps.', scene: [{ kind: 'tap', x: 200, y: 120, scale: 1 }] }] };
  const ok = acceptDraft(draft, code);
  assert.deepEqual(ok.words, ['pat', 'tap', 'taps']);
  assert.equal(acceptDraft({ ...draft, pages: [{ text: 'Pat sits.', scene: [] }] }, code), null, 'an unreadable word');
  assert.equal(acceptDraft({ ...draft, cover: [{ kind: 'dragon' }] }, code), null, 'an unknown picture');
  assert.equal(acceptDraft({ title: 'Tap', pages: [] }, code), null);
});

test('the default focus is the newest set known', () => {
  assert.deepEqual(defaultFocus({ graphemes: SET12 }), { graphemes: ['i', 'm', 'f', 'c'], clusters: false });
  assert.deepEqual(defaultFocus({}), { graphemes: [], clusters: false });
  const eight = seq.stages.slice(0, 8).flatMap((s) => s.graphemes);
  assert.deepEqual(defaultFocus({ graphemes: eight, clusters: true }), { graphemes: [], clusters: true });
});

// ---- imposition ----------------------------------------------------------------
test('booklet imposition for 8 and 12 pages, and padding to a multiple of four', () => {
  assert.deepEqual(bookletSheets(8), [[8, 1], [2, 7], [6, 3], [4, 5]]);
  assert.deepEqual(bookletSheets(12), [[12, 1], [2, 11], [10, 3], [4, 9], [8, 5], [6, 7]]);
  assert.deepEqual(bookletSheets(4), [[4, 1], [2, 3]]);
  for (const n of [8, 12, 16]) assert.deepEqual(bookletSheets(n).flat().sort((a, b) => a - b), Array.from({ length: n }, (_, i) => i + 1));
  assert.throws(() => bookletSheets(6), /multiple of 4/);
  assert.deepEqual(padToFour([1, 2, 3, 4, 5, 6, 7, 'back'], 0), [1, 2, 3, 4, 5, 6, 7, 'back']);
  assert.deepEqual(padToFour(['cover', 2, 3, 4, 'back'], 'blank'), ['cover', 2, 3, 4, 'blank', 'blank', 'blank', 'back']);
});
