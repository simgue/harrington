# "See how it works" figures

Some Science topics for ages 5 to 8 have an interactive, hand-inked isometric
figure: the child presses buttons, the parts move, and each part's label
lights up while it works. The figure shows on the topic page and on the child
view's topic card (HAR-34). It needs no AI provider, works offline and saves
nothing.

**A page dropped into `src/figures/` that meets the contract below needs no
other change**: no list to edit, no code, no rebuild of the app. The server
finds it by its file name and the app shows it on that topic.

## The contract a figure page meets

The checks marked *(checked)* are in `src/js/figures/contract.js`: the server
skips a page that fails one (and names it in its log), and `npm test` fails.
The rest are checked by the e2e suite (`tests/e2e/figures.spec.mjs`).

1. **File name** is `src/figures/<topicId>.html`, where `<topicId>` is the
   taxonomy topic's id exactly, for example `mt_B3W5EfimJw.html` *(checked:
   `mt_` then 4 to 40 letters, digits, `_` or `-`)*. The id must be a topic in
   the pinned taxonomy (`TAXONOMY_REVISION` in `tests/e2e/support/taxonomy.mjs`)
   whose subject is Science and whose ages overlap 5 to 8 *(e2e)*. One figure
   per topic.
2. **Size**: at most 100 KB (102,400 bytes) *(checked)*.
3. **Title and hint** come from the page itself *(checked)*:
   - `<title>` is the figure's name, 1 to 40 characters ("Toy cart"). The
     app names the frame "<title>: how it works".
   - `<meta name="description" content="…">` is one line, 1 to 90
     characters, saying what to press ("Push the cart, pull it back, then load
     it up and push again."). The app shows it under the frame. Write `&amp;`
     and `&quot;` for `&` and `"`.
4. **Self-contained and quiet** *(checked)*: no `http://` or `https://`
   anywhere; no `<script src=…>`, `<link>`, `<iframe>`, `<object>`,
   `<embed>` or `<base>`; and no "Colorfigures", "april-zhu" or "Made with"
   (in any case). Everything (engine, figure script, styles) is inline. The
   server's policy blocks every request from the page anyway.
5. **Built on Harrington's engine** *(checked)*: the page inlines
   `src/js/figures/engine.js` (from its `// ---- engine ----` line down),
   carries the engine notice line exactly as `ENGINE_NOTICE` in
   `contract.js`, and draws through `mountFigure({...})`. The build script
   does all three; see "Write a figure" below.
6. **Labels** *(checked)*: 3 to 6 part labels, each one or two capital words
   ("BULB", "HEAVY BLOCK"), drawn with `tag(point, dx, dy, 'TEXT', on)` with
   `'TEXT'` as a single-quoted string literal. `on = true` while that part is
   working. Labels are **on by default**; the page's **Labels on** button
   hides them.
7. **Buttons** *(e2e)*: 2 to 5 actions, in the order a child would press
   them, each at least 44 px tall (the engine's shell does this). Every press,
   in order or out of it, changes the drawing or shows a short note
   (`ui.flash('The pot is cold. Heat the water first.')`); a press that
   changes nothing fails the suite. The e2e suite presses every action in
   order, then the last one first.
8. **Clean run** *(e2e)*: no script error, no console error, nothing in
   `<html data-errors>`, no request.
9. **Content**: one clear mechanism a child aged 5 to 8 can press and see
   why it happens; the real sequence of steps, with nothing appearing where it
   could not get to; American English in short, plain sentences; no emoji or
   symbols in drawn text.

### How the app shows a page

At start the app asks `GET /api/figures` for the list (`[{ id, title, hint }]`
of the pages that meet the checked rules) and shows "See how it works" on a
topic whose id is in it. The frame is
`<iframe src="figures/<topicId>.html" sandbox="allow-scripts">` with **no
query string**: labels start on and nothing is pressed. The page runs in an
opaque origin: it cannot read the app's cookie, storage or page, open windows
or submit forms. The server sends every `/figures/*.html` page a
Content-Security-Policy with `default-src 'none'` (inline script and style
only, `data:` images, no requests), `frame-ancestors 'self'` and
`sandbox allow-scripts`, so the same holds when a page is opened on its own.
Viewing or pressing a figure writes nothing to the family data.

### Query parameters a page understands

These are for authors and tests; the app passes none of them.

| Parameter | Effect |
| --- | --- |
| `?labels=0` | Start with the labels hidden. |
| `?press=Label@ms,Label@ms` | Click the action whose text starts with `Label` that many milliseconds after load. `Label>Choice` picks from a picker. An unknown label is recorded in `<html data-errors>`. |
| `?pal=mustard` | Start with another body color (`mustard`, `tomato`, `mint`, `cobalt`, `blush`). |
| anything else | Read by the figure's own `params(st, q)` to set a state for a screenshot (`?at=4&block=1`). |

## Where things live

| Path | What it is |
| --- | --- |
| `src/figures/<topicId>.html` | The pages. This folder is the list. |
| `src/js/figures/contract.js` | The checked rules, used by the server, the build and the tests. |
| `src/js/figures/engine.js` | The engine: projection, shapes, shading, ink, labels and the page shell. A classic script, not a module. Forked from the Colorfigures skill (MIT); its notice is the header comment. |
| `src/js/figures/index.js` | Loads the list from the server and answers `figureFor(topicId)`. |
| `src/js/views/howitworks.js` | The frame and hint line on the topic page and in the child view. |
| `tools/figures/<topicId>.js` | Sources for pages built here (optional for a supplied page). |
| `scripts/build-figures.mjs` | `npm run build:figures` builds a page for every source; `node scripts/build-figures.mjs <topicId>` builds one; `--check` fails if a built page is stale or any page breaks the contract. |
| `scripts/shot-figure.mjs` | Screenshots a page with Playwright's Chromium for the look-and-fix loop. |
| `tools/colorfigures/` | The unmodified authoring skill (MIT): `SKILL.md` is the drawing contract, `assets/examples/` two full figures. |

## Write a figure

The simplest way to meet rules 4 to 6 is to write a source and let the build
assemble the page.

1. Find the topic's id in the pinned taxonomy.
2. Write `tools/figures/<topicId>.js`. Its first two lines are the title and
   hint:

   ```js
   // title: Toy cart
   // hint: Push the cart, pull it back, then load it up and push again.
   ```

   Then the figure: geometry, state, `scene`, `buttons` and a
   `mountFigure({ title, size, palette, state, scene, buttons, stats, acts, params })`
   call. Start from a figure that is close (`mt_B3W5EfimJw.js`, the toy cart,
   is the simplest) and read `tools/colorfigures/SKILL.md` and its two
   examples. Never declare a name the engine owns (the list in `SKILL.md`,
   plus `LABEL_K`, `noteError`, `CORE_CSS` and `filterFor`); prefix short names.
3. Build and look:

   ```bash
   node scripts/build-figures.mjs <topicId>
   node scripts/shot-figure.mjs <topicId> --out idle.png
   node scripts/shot-figure.mjs <topicId> --query "press=Heat@200,Put the lid@2500" --wait 5000 --out run.png
   node scripts/shot-figure.mjs <topicId> --width 360 --height 470 --out phone.png
   ```

   The shot script exits 1 on a script error, an unknown label, `NaN` in the
   drawing or any request. Do two or three rounds of shoot and fix: the idle
   shot, the main sequence, one out-of-order press and the phone shot.
4. `npm run build:figures -- --check`, `npm test` and
   `npm run e2e -- --project=desktop figures`.

A page supplied without a source works the same once it meets the contract.
Keep its source next to it if you can: when the engine changes,
`npm run build:figures` rebuilds only the pages that have one.

### What Harrington's engine changes from the skill

- The page has no header, footer, hint text, wobble slider or credit link. It
  is one column for the frame: the actions, the figure, then **Labels on** and
  five body colors. Every control is at least 44 px; a picker stays inside the
  frame on a phone.
- On a small screen the label pills grow (`LABEL_K`) so their text stays
  about 9 px or more; check the phone shot for overlaps.
- Action labels, choices, notes and stats are set with `textContent`.
- `mountFigure`'s `fig`, `hint`, `idea`, `readout`, `credit` and
  `buttonsLabel` options are gone.
