# End-to-end tests

Harrington has a Playwright suite that drives the real app in Chromium against
the real `server.mjs`. One command gives you a pass/fail report for every
user-facing flow, a fresh set of screenshots and video recordings of the
walkthroughs.

- [WALKTHROUGH.md](WALKTHROUGH.md): the whole application, screen by screen, with screenshots
- [COVERAGE.md](COVERAGE.md): every feature in the audit's §4 tables, mapped to the spec that covers it
- [FINDINGS.md](FINDINGS.md): defects and surprises the suite found, with repro steps

The unit tests (`npm test`) are separate and unchanged.

## Run it

```bash
npm ci
npx playwright install --with-deps chromium   # once per machine (see "Browsers" below)
npm run e2e
```

| Command | What it does |
| --- | --- |
| `npm run e2e` | Runs every project. Writes screenshots to `docs/e2e/screenshots/`, the HTML report to `playwright-report/`, and copies the walkthrough videos to `docs/e2e/recordings/`. Exits non-zero if any test fails. |
| `npm run e2e:ui-docs` | Deletes `docs/e2e/screenshots/` first so no stale image survives, records a video of **every** test (`E2E_VIDEO=all`), then runs as above. Use this to refresh the docs. |
| `npm run e2e -- --project=desktop map` | Anything after `--` goes to `playwright test`: a project, a file filter, `-g "title"`, `--headed`, `--ui`, `--debug`. |
| `npx playwright show-report` | Opens the last HTML report, with traces for failed tests. |
| `npm run e2e:mock-ai` | Starts only the mock AI provider on port 4311, handy for poking the app by hand. |

The first run downloads the Marble taxonomy (about 2.4 MB) into
`tests/e2e/.cache/taxonomy-<revision>/`. Later runs are offline.

A full run takes about seven minutes: the tests share one server
per project and reset the family state before each test, so they run one at a
time (`workers: 1`).

## What starts

`playwright.config.mjs` starts four servers through `webServer`, on ports
from `tests/e2e/support/env.mjs`:

| Port | Server | Used by |
| --- | --- | --- |
| 4311 | `tests/e2e/mock-ai-server.mjs`, an OpenAI-compatible `/v1/chat/completions` | the apps on 4312 and 4315 |
| 4312 | `node server.mjs` with `HARRINGTON_AI_BASE_URL=http://127.0.0.1:4311/v1` and `HARRINGTON_AI_MODEL=mock` | `api`, `desktop`, `mobile`, `walkthrough`, `walkthrough-mobile` |
| 4313 | `node server.mjs` with no AI provider | `no-ai` |
| 4314 | `node server.mjs` with `HARRINGTON_AI_BASE_URL=http://127.0.0.1:4319/v1`, where nothing listens | `ai-unreachable` |
| 4315 | `node server.mjs` with AI pointed at the mock and `HARRINGTON_AI_CAPABILITIES=lesson` | `lessons-only` |

Port 4319 must stay free: `globalSetup` stops the run if anything answers
there.

Each app server is launched by `tests/e2e/start-app.mjs`, which creates a fresh
temporary `HARRINGTON_DATA_DIR`, copies the cached taxonomy into it, starts
`server.mjs` and deletes the directory on exit. Playwright runs `webServer`
before `globalSetup`, so the taxonomy download happens in the launcher;
`tests/e2e/global-setup.mjs` then checks that each server is the one the
projects expect and clears the mock's request log.

**Taxonomy revision.** The specs assume one exact curriculum (1,590 topics,
fixed topic ids), so the suite downloads the taxonomy at a pinned commit,
`TAXONOMY_REVISION` in `tests/e2e/support/taxonomy.mjs`, never mutable `main`.
The local cache directory and the CI cache key both follow the pin. To move to
a newer taxonomy, change the pin, run `npm run e2e:ui-docs` and fix what the
specs assumed.

**Taxonomy upstream.** The server's default upstream, jsDelivr, is blocked on
some networks. The launcher probes it (at the pinned revision) and falls back
to `raw.githubusercontent.com`, which serves the same files, and passes the
choice to the server as `HARRINGTON_TAXONOMY_UPSTREAM`. Set that variable
yourself to force one.

## Projects

| Project | Viewport | Specs | Notes |
| --- | --- | --- | --- |
| `api` | none | `api.spec.mjs` | HTTP only, against both app servers |
| `desktop` | 1280×900 | every other `*.spec.mjs` | AI pointed at the mock |
| `no-ai` | 1280×900 | `no-ai.spec.mjs` | no provider: HAR-13's "Needs a local AI provider" chips |
| `ai-unreachable` | 1280×900 | `ai-unreachable.spec.mjs` | a provider that is down: the "couldn't reach" copy and Try again |
| `lessons-only` | 1280×900 | `lessons-only.spec.mjs` | only lessons switched on: the "Not switched on yet" chip, a live lesson, cached content still opening |
| `mobile` | 390×844, touch | `mobile.spec.mjs` | asserts no horizontal overflow on every route |
| `walkthrough` | 1280×900 | `walkthrough.spec.mjs` | video on: parent and child walkthroughs |
| `walkthrough-mobile` | 390×844 | `walkthrough-mobile.spec.mjs` | video on: phone walkthrough |

Every browser test runs with the clock pinned to Wednesday 7 October 2026,
10:30 UTC (`page.clock.setFixedTime`, so timers still run), in the `en-US`
locale and UTC time zone, and with a seeded `Math.random` (a fresh stream per
page load, numbered within the test, so ids never repeat across reloads or
tabs). The app derives a new learner's id from `Math.random` and the day's
refresher and choices from that id, so without the seed every run would plan
a different day. Together they make the greeting, dates, the weekday plan and
the screenshots the same on every run; `test.use({ fixedClock: false })` or
`test.use({ fixedRandom: false })` turns either off. A test that needs time to pass (a
recording's length, recall cards coming due tomorrow) moves the fixed time on.

## Environment variables

| Variable | Default | Effect |
| --- | --- | --- |
| `E2E_CHROMIUM` | unset | Path to a Chromium or `headless_shell` binary to launch instead of Playwright's own. Use it when the installed browsers do not match the Playwright version. |
| `E2E_PORT_BASE` | `4310` | Ports are base+1 (mock AI), base+2 (app with AI), base+3 (app without AI), base+4 (app with an unreachable AI) and base+9 (kept free as that unreachable AI). |
| `E2E_SCREENSHOTS` | on | Set to `0` to skip writing screenshots. |
| `E2E_VIDEO` | unset | `all` records every test, not just the walkthroughs (`e2e:ui-docs` sets it). |
| `HARRINGTON_TAXONOMY_UPSTREAM` | probed | Where the launcher downloads the taxonomy from on the first run. |
| `CI` | unset | On CI, `test.only` fails the run. |

The suite never reuses a server that is already listening on its ports: every
test overwrites `/api/state`, and that server could be a real family's. If a
port is taken, Playwright stops with "is already used"; stop that server or
move the suite with `E2E_PORT_BASE`.

### Browsers

CI installs Chromium with `npx playwright install --with-deps chromium`.

In a sandbox without browser downloads (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`
and browsers under `PLAYWRIGHT_BROWSERS_PATH`), the pinned `@playwright/test`
1.56.1 expects Chromium revision 1194. If the installed revision differs, point
`E2E_CHROMIUM` at it, for example:

```bash
E2E_CHROMIUM=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell npm run e2e
```

The recorder flows launch Chromium with `--use-fake-device-for-media-stream`
and `--use-fake-ui-for-media-stream` and grant the microphone permission, so
"Start recording" captures a synthetic tone.

## Where things land

| Output | Path | In Git? |
| --- | --- | --- |
| Screenshots (JPEG, quality 55 full-page, 70 otherwise) | `docs/e2e/screenshots/<area>/<nn>-<name>.jpg` | yes |
| Walkthrough videos | `docs/e2e/recordings/*.webm` | no |
| Raw videos, traces, failure screenshots, `results.json` | `test-results/` | no |
| HTML report | `playwright-report/` | no |
| Taxonomy cache | `tests/e2e/.cache/` | no |

`<area>` is the spec file name (`dashboard`, `topic`, …). `<nn>` counts up per
area through a full run in file order, so run the whole suite (ideally
`npm run e2e:ui-docs`) before committing screenshots; a filtered run numbers
from 01 and can overwrite images with different content. The counters live
in the worker process, and Playwright starts a new worker after a failed
test, so after a failure the following shots of that area number from 01
again too: only commit screenshots from a run with no failures.

**Stable images.** Before each screenshot `shot()` moves the pointer to the
corner (so the last clicked button is not left in its hover style), scrolls
to the top for a full-page capture (fixed elements such as the sidebar and
toasts are drawn at the current scroll offset), waits
for web fonts, images and Lucide's icon swap, and waits until the scroll
position has stopped moving. The app's `html { scroll-behavior: smooth }` is
overridden in tests: with it, Playwright's scroll-into-view glides and a
re-render can stop it anywhere. The screenshot itself disables CSS
animations and transitions, and a full-page `shot()` throws while a modal or
the child view is open (fixed to the viewport, it would leave the page
underneath visible below the fold); pass `{ full: false }` or a locator.
Measured on two back-to-back `npm run e2e:ui-docs` runs (decoding both sets
and comparing pixels): 64 of 92 images are byte-identical, 25 differ only by
JPEG noise (mean difference under 0.02 of 255, nothing visible), and 3
differ visibly: two where the page behind a blurred modal backdrop is
scrolled differently, and one where a toast is caught as it expires (toasts
last 2.8 seconds). Before these changes, 30 of 90 images changed between
runs, mostly from smooth scrolling, hover styles and a different learner id
(so a different refresher topic) on every onboarding. If a refresh shows a
large change in an image whose screen did not change, treat it as a bug in
the spec or in `settle()`.

**Size budget.** Screenshots stay under 8 MB in total (91 images, about
4.9 MB today). Full-page captures are written at JPEG quality 55 and the
rest at 70; a long page (2,000 to 2,900 px tall, such as the topic page or
the dashboard) still comes to 150 to 210 KB. Videos are never committed: the three walkthroughs are about
14 MB together and `e2e:ui-docs` produces about 40 MB for every test, so they
live in `docs/e2e/recordings/` (git-ignored) locally and in the CI artifacts.

`tests/e2e/collect-recordings.mjs` copies videos out of `test-results/` after
each run, named `<project>--<spec>--<test>.webm`, or by a test's `recording`
annotation (`walkthrough-parent.webm`, `walkthrough-child-view.webm`,
`walkthrough-mobile.webm`). It reads `test-results/results.json`, so keep the
JSON reporter when you pass your own `--reporter`.

On CI (`.github/workflows/e2e.yml`) the report, the screenshots and the videos
are uploaded as artifacts for 14 days, and the job summary links each one, so
the recordings are one click from the pull request's checks. Changes that
only touch `docs/` or Markdown files do not run the suite.

## The mock AI provider

`tests/e2e/mock-ai-server.mjs` answers `POST /v1/chat/completions` with
deterministic content picked by keywords in the prompt, in exactly the JSON
shapes `src/js/ai.js` expects:

| Prompt contains | Kind | Answer |
| --- | --- | --- |
| `homeschool curriculum writer` | `lesson` | the `buildLessonPrompt` shape |
| `homeschool materials designer` | `printables` | a worksheet and flashcards |
| `do-it-now instructions` | `activity` | materials, setup, steps, example, tip |
| `Explain the topic` / `mini-quiz` | `explain` / `quiz` | short Markdown |
| `homeschool assessor writing a test` | `mastery-test` | 4 multiple-choice questions with `answer`, `answerText`, `verify` |
| `meticulous exam checker` | `verify` | `{ results: [...] }` agreeing with the key, so every question survives |
| `TIMED "challenge" quiz` | `challenge` | 8 multiple-choice questions |
| `ACTIVE RECALL flashcards` | `recall` | 3 cards |
| `Analyze the following discussion` / `progress review` | `discussion` / `review` | Markdown with fixed headings |

The questions and the marker phrases are exported (`MASTERY_QUESTIONS`,
`CHALLENGE_QUESTIONS`, `RECALL_CARDS`, `MARKERS`) so specs can answer
correctly and look for the output. Test-only endpoints: `GET /__log` lists
every prompt it received with its kind (specs use it to check caching and
what is sent), `DELETE /__log` clears it, `POST /__fail {"count":n}` makes
the next n completions fail with HTTP 500, `POST /__malformed {"count":n}`
makes them answer 200 with JSON that is not a usable lesson
(`MALFORMED_LESSON`), and `DELETE /__fail` cancels both.
`globalSetup` resets both, and the `mockAi` fixture cancels any armed failure
before and after each test that uses it.

## Writing a spec

1. Create `tests/e2e/<area>.spec.mjs`. The `desktop` project picks it up; add
   it to a project's `testMatch` in `playwright.config.mjs` only if it needs a
   different server or viewport.
2. Import from `./fixtures.mjs`, not from `@playwright/test`:

   ```js
   import { test, expect, modal, nav, expectToast } from './fixtures.mjs';
   import { TOPICS } from './support/family.mjs';

   test('marks a topic as learning', async ({ page, api, gotoApp, shot }) => {
     await gotoApp({ seed: {}, hash: `topic/${TOPICS.oneToOne.id}` });
     // …drive the UI with roles and visible text…
     await shot('my-step');                       // docs/e2e/screenshots/<area>/nn-my-step.jpg
     await api.waitForState((s) => /* the save reached the server */ true);
   });
   ```

3. Fixtures and helpers:
   - `gotoApp({ seed, hash })` seeds the synthetic family (`seed: null` for an
     empty server) and opens a route. `seed` takes `learners`, `active`,
     `progress` (`{ topicId: status }`), `records` and `extra` (any other
     state keys); see `support/family.mjs`.
   - `api.putState(state)` / `api.getState()` / `api.waitForState(fn)`. Writes
     read the state's `ETag` first and send it back as `If-Match`.
   - `mockAi.log()`, `mockAi.kinds()`, `mockAi.clear()`, `mockAi.failNext(n)`,
     `mockAi.malformedNext(n)`, `mockAi.stopFailing()`.
   - `shot(name, { full, locator, target })` takes a full-page JPEG by
     default; pass `full: false` for modals, `locator` for one element.
   - `errors` collects console errors and page errors; end a test with
     `expect(errors).toEqual([])` where none are expected.
   - `modal(page)`, `closeModal(page)`, `nav(page, 'Map')`,
     `expectToast(page, text)`, `noHorizontalOverflow(page)`,
     `dismissCelebration(page)` (the badge or level-up popup).
   - `test.use({ tour: true })` keeps the welcome tour; by default it is
     marked as seen before the page loads.
4. Select by role and visible text, not Tailwind classes. Where the app gives
   no role or name (icon-only buttons), use the nearest stable hook and note
   the gap in [FINDINGS.md](FINDINGS.md).
5. Use the fake names in `support/family.mjs`. Never put a real child's name
   in a spec, a fixture or a screenshot.
6. A test that pins a known defect asserts today's behavior and has
   `(finding F<n>)` in its title, matching its entry in FINDINGS.md, so it
   fails loudly when the bug is fixed and can be flipped then.
