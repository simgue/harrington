# "See how it works" figures

Some Science topics for ages 5 to 8 have an interactive, hand-inked isometric
figure: the child presses buttons, the parts move, and each part's label
lights up while it works. The figure shows on the topic page and on the child
view's topic card (HAR-34). It needs no AI provider, works offline and saves
nothing.

## Where things live

| Path | What it is |
| --- | --- |
| `src/js/figures/index.js` | Which topics have a figure: taxonomy topic id → `{ title, hint }`. The app reads only this. |
| `src/js/figures/engine.js` | The figure engine: projection, shapes, shading, ink, labels and the page shell. A classic script, not a module: the build inlines it into every page. Forked from the Colorfigures skill (MIT); its notice is the header comment. |
| `tools/figures/<topicId>.js` | One figure's script: geometry, state, buttons. This is what you write. |
| `src/figures/<topicId>.html` | The built page: shell + engine + figure script, all inline. Never edit by hand. |
| `scripts/build-figures.mjs` | `npm run build:figures` builds every page; `node scripts/build-figures.mjs <topicId>` builds one; `--check` fails if a page is stale. |
| `scripts/shot-figure.mjs` | Screenshots a built page with Playwright's Chromium for the look-and-fix loop. |
| `src/js/views/howitworks.js` | The iframe and hint line used by the topic page and the child view. |
| `tools/colorfigures/` | The unmodified authoring skill (MIT): `SKILL.md` is the drawing contract, `assets/examples/` two full figures. |

## Rules every figure keeps

- **One topic, one clear mechanism** a child aged 5 to 8 can press and see why
  it happens. Map it to the topic id in the pinned taxonomy
  (`TAXONOMY_REVISION` in `tests/e2e/support/taxonomy.mjs`); the e2e suite
  checks the id is a Science topic whose ages overlap 5 to 8.
- **3 to 6 labels**, one or two capital words each, written as string
  literals in `tag(point, dx, dy, 'TEXT', on)` (the unit test reads them from
  the source). Pass `on = true` while that part is working.
- **2 to 5 buttons**, in the order a child would press them, each with a real
  outcome. A press out of order answers: it runs the missing step or says why
  not with `ui.flash('The pot is cold. Heat the water first.')`. Never leave a
  press silently ignored; the e2e suite presses every button and fails if
  nothing changes.
- **Follow the real process.** Before drawing, write the sequence and where
  everything is after each step; nothing appears where it could not get to.
- **Self-contained and quiet**: no `http://` or `https://`, no
  `<script src=`, and no product name, credit line or "Made with" text
  anywhere in the page (`tests/figures.test.mjs` scans every file under
  `src/figures/`). No emoji or symbols in drawn text. American English, short
  plain sentences.
- **Under 100 KB** per built page (the engine is about 30 KB; aim for a figure
  script under 25 KB).
- Never declare a name the engine owns (the list in `tools/colorfigures/SKILL.md`,
  plus `LABEL_K`, `noteError`, `CORE_CSS` and `filterFor`). Prefix short names.

## What Harrington's engine changes from the skill

Read `tools/colorfigures/SKILL.md` for the drawing contract; these are the
differences:

- The page has no header, footer, hint, wobble slider or credit link. It is
  one column for an iframe: the buttons, the figure, then **Labels on** and
  five body colors. Every control is at least 44 px; the picker stays inside
  the frame on a phone.
- Labels start on. On a small screen the label pills grow (`LABEL_K`) so
  their text stays about 9 px or more; check a phone shot for overlaps.
- Button labels, choices, notes and stats are set with `textContent`.
- `mountFigure({ title, size, palette, state, scene, buttons, stats, acts, params })`:
  `fig`, `hint`, `idea`, `readout`, `credit` and `buttonsLabel` are gone. The
  hint lives in `src/js/figures/index.js` and is shown under the frame.

## How it is shown, and why it is safe

The topic page and the child view render
`<iframe src="figures/<topicId>.html" sandbox="allow-scripts">`. The page
comes from Harrington's own server, but the sandbox gives it an opaque origin:
it cannot read the app's cookie, storage or DOM, open windows or submit forms.
The server also sends every `/figures/*.html` page a Content-Security-Policy
with `default-src 'none'` (inline script and style only, no requests),
`frame-ancestors 'self'` and `sandbox allow-scripts`, so the same holds when a
page is opened on its own. Viewing or pressing a figure writes nothing to the
family data.

## Add a figure

1. Pick the topic and find its id in the pinned taxonomy.
2. Write `tools/figures/<topicId>.js`. Start from a figure that is close
   (`mt_B3W5EfimJw.js`, the toy cart, is the simplest) and read the two
   examples in `tools/colorfigures/assets/examples/`.
3. Add `'<topicId>': { title, hint }` to `src/js/figures/index.js`. Keep the
   hint to one line that says what to press.
4. Build and look:

   ```bash
   node scripts/build-figures.mjs <topicId>
   node scripts/shot-figure.mjs <topicId> --out idle.png
   node scripts/shot-figure.mjs <topicId> --query "press=Heat@200,Put the lid@2500" --wait 5000 --out run.png
   node scripts/shot-figure.mjs <topicId> --width 360 --height 470 --out phone.png
   ```

   `?press=Label@ms` clicks the button whose text starts with `Label`;
   `Label>Choice` picks from a picker; your `params(st, q)` can read other
   query values to set a state. The script exits 1 on a script error, an
   unknown label, `NaN` in the drawing or any request. Do at most two or
   three rounds of shoot and fix: the idle shot, the main sequence, one
   out-of-order press and the phone shot.
5. `npm run build:figures`, then `npm test` and
   `npm run e2e -- --project=desktop figures`. Add the figure to the list
   in the CHANGELOG entry.
