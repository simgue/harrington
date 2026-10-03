# E2E coverage of the platform audit

Every row of the feature tables in
[§4 of the 27 September platform audit](../audits/2026-09-27-platform-audit.md#4-feature-inventory-and-completeness),
mapped to the spec that covers it.

**Status**
- **covered**: exercised end to end against the real server, without AI.
- **covered with mock AI**: exercised against the mock provider
  (`tests/e2e/mock-ai-server.mjs`); the same controls are also checked with
  no provider in `no-ai.spec.mjs` (HAR-13 chips) and, for the error copy,
  with a provider that is down in `ai-unreachable.spec.mjs`.
- **partly covered**: the main path is exercised; what is not is listed.
- **not covered**: with the reason.

HAR-10, HAR-13, HAR-14, HAR-15 and HAR-16 merged while the suite was being
written and are covered; no row is waiting on an open pull request.

Specs live in `tests/e2e/`; "F" numbers point to [FINDINGS.md](FINDINGS.md).

## 4.1 Platform and operations

| Feature | Status | Spec | Notes |
| --- | --- | --- | --- |
| Self-hosted server (static, state, lessons, audio, taxonomy, AI proxy) | covered | `api` | Health, taxonomy files and 404, state round trip and bad bodies, lessons, audio put/get/delete, static files, traversal, 405. Every browser spec also runs against it. |
| OpenAI-compatible AI adapter | covered with mock AI | `api`, `topic`, `records`, `insights`, `no-ai`, `ai-unreachable` | 400 without messages, 200 through the mock, 502 on provider failure (no detail leaked), 502 "unreachable" when nothing listens at the provider URL, 503 with no provider. The browser sends no model field (HAR-23); the server uses `HARRINGTON_AI_MODEL`, so the mock receives `mock`. |
| Honest no-AI mode (HAR-13) | covered | `no-ai`, `ai-unreachable`, `topic` | No provider: every AI control on the topic page, quest log, calendar, insights and records is a "Needs a local AI provider" chip linking to `README.md#optional-local-model-ollama` (new tab, `rel="noopener"`); the dashboard hides the refresher and disables recall with an explanation; the child view hides Memory walk and Beat the clock with no provider wording. Provider down: controls stay, failures say "Harrington couldn’t reach the AI provider…" with Try again (helper, lesson, activity instructions). Provider error: lesson regenerate shows the error block and Try again recovers. Timeout and offline copy are not exercised (covered by `tests/ai-status.test.mjs`). |
| Taxonomy fetch and cache | covered | `start-app.mjs`, `api` | The launcher fetches once (falling back from jsDelivr to GitHub raw) and seeds each data dir; `/api/health` reports `taxonomyCached: true`. Revalidation does not exist, so it is not tested. |
| Persistence | partly covered | `data-safety`, `api`, every spec via `api.waitForState` | HAR-10 versioning: 428 without If-Match, 412 when stale, 403 cross-site, two-tab conflict reload with toast (F17). The unload beacon's server side over HTTP: JSON POST with `version` in the body → 204 and the state advances, stale → 412, no version → 428, `text/plain` → 415, cross-site → 403; malformed `If-Match` → 400. The browser actually sending a beacon on close mid-debounce is not exercised. |
| Backup, export, restore | partly covered | `data-safety` | In-app Export (download, contents) and Import (invalid files), and a true round trip: the exported file is imported back (preview, cancel, confirm) and restores the same document. `npm run backup` (tar of the data dir) is not run by the suite. Not reachable on a phone (F6). PIN in the export (F16). |
| Authentication, TLS, LAN access | not covered | | Missing by design in the preview. |
| Docker / Compose | not covered | | The suite runs `node server.mjs` directly; building the image is out of scope. |
| CI | not covered (infrastructure) | `.github/workflows/e2e.yml` | No test exercises CI itself; this suite adds a workflow that runs it on pull requests and on `main`. The unit workflow is unchanged. |
| Upstream telemetry shim | not covered | | `src/index.html` posts errors to `window.parent`; observable only when embedded in a frame. Left for the fix (audit recommends removal). |

## 4.2 Learner model and daily rhythm

| Feature | Status | Spec | Notes |
| --- | --- | --- | --- |
| Onboarding (first learner) | covered | `onboarding` | Copy, required fields, HAR-22 birth-year bounds (1990 to this year) and optional birth month, learner saved with the month, tour once. |
| Multi-learner: add, edit, switch, remove | covered | `learners`, `data-safety` | Add two, switch, active learner survives reload, remove with confirm (cancel and OK), removal clears every per-learner key (HAR-10). HAR-22 edit: prefilled form, name and birth month saved, month-aware age (December birthday → 5, not 6, on 7 October) in the hero and the menu. The color picker is not exercised. |
| Mastery status per topic | covered | `topic`, `map` | HAR-14's always-visible "Set status" row: all four statuses and their effect on the page, dashboard and growth list; "Mark as learning" and "Mark as mastered" in the quest log. |
| Placement / bulk mastery | covered | `placement`, `insights` | HAR-14: from a subject card and from the learner menu; default age, area and age filters, prerequisites on and off, toast, one placement record, undo from Records restores the ring. Also the post-final-test "Mark all … as mastered". |
| Prerequisite gating (hard edges) | covered | `map`, `topic` | Locked node, "Foundations needed", disabled "Not ready to mark as learning", unlock after mastering the foundation, locked banner on the topic page. |
| Daily literacy/numeracy pick-one | covered | `dashboard`, `child-view` | Two lanes × two options, pick, unpick, saved offers and picks, survives reload, shown in the child view and back. HAR-17 evidence: the pick's Note form has the coverage claim unchecked by default; an unclaimed note links to the pick without counting; a claimed one saves `coverage` and shows "Evidence recorded". The "Not yet: … needs … first" line is rendered but its wording is not asserted. |
| Learner interests (HAR-17) | covered | `dashboard` | Suggested and custom chips toggle and save per learner with the free-text note. Nothing reads them yet. |
| Recommended next ("Stepping stones") | partly covered | `dashboard`, `insights` | Four stones for ages 6 and 9, none for age 3 (F3), and a stone opens its topic. Which topics are chosen (started first, age fit, centrality) is not asserted, except where it shows in the child view's "Plant something new" (F18). |
| Growth stages (Seed/Sprout/Bud/Bloom) | covered | `map`, `topic`, `dashboard`, `child-view` | Legend, node states, chips through every status, child garden words. |
| Activity streak and week flowers | partly covered | `dashboard` | The week card renders with zero activity. Streak growth over several days is not driven. |

## 4.3 Curriculum and navigation

| Feature | Status | Spec | Notes |
| --- | --- | --- | --- |
| World map | covered | `map` | Eight realms with domain counts, click and keyboard Enter, topic and link totals. |
| Skill tree per domain | covered | `map` | Default domain, legend, node states, breadcrumbs, gateway domains rendered. HAR-21: selecting a skill keeps the page scroll and puts `?skill=` in the address; Back to graph from the topic page returns to the same skill, selected, at the same scroll (F11 fixed). |
| Quest log | covered with mock AI | `map`, `no-ai` | Open topic page, record evidence, mark as learning, foundations and unlock chips, close; "Open full lesson" with and without a provider. |
| List drill-down | covered | `map`, `mobile` | Subject → domain → age band → topic, breadcrumbs, prerequisite chips, toggle saved with the family and restored after reload. |
| Topic page | covered with mock AI | `topic`, `no-ai`, `mobile` | Header chips and status row, evidence, quick check, connections both ways, records, section recordings, every AI tool; fits a 390 px screen. |
| Topic finder: search | covered | `find`, `mobile` | A request from the dashboard link lists eight ranked matches with domain and age band ("Fits age 6"); no close match shows the "Try other words" state; an all-phrasing request asks for topic words; reload keeps the request (it rides in `#find?q=`). Ranking, synonyms and the age boost are unit-tested in `tests/finder.test.mjs`; fits a 390 px screen. |
| Topic finder: path and next step | covered | `find`, `mobile` | Choosing a match shows six steps for a learner with one foundation mastered and one started: states, "Needs … first", "Builds on". Next ready step: Add to today (saved as a move or an extra on today), Plan it (date modal), Find on skill tree (selects the skill through `?skill=`, quest log open), Open topic page. A mastered target says so and has no next step. The skill tree's "Find a topic" link opens the finder. |
| Topic finder: request log | covered | `find` | Each request is saved under the learner, then the chosen topic on the same entry; the log lists them newest first and re-runs one on click; another learner's log is separate. Cap, cleaning and the export/import round trip are unit-tested in `tests/finder.test.mjs` and `tests/family-data.test.mjs`. |
| Timeline (mastery ladder) | removed | `map` | HAR-13 removed the route; `#timeline` now opens the dashboard without errors. |
| Reference links | covered | `topic` | Five links, `target="_blank"` and `rel="noopener"`. The targets are external and not loaded. |
| Curriculum-change notifications | covered | `notifications` | First-run welcome item; no new item on a second boot; an older saved snapshot raises "Curriculum updated — 5 new topics". In practice it cannot fire, because the cache never revalidates. |

## 4.4 Planning

| Feature | Status | Spec | Notes |
| --- | --- | --- | --- |
| Calendar (start date, month grid, move, mark done, extras) | covered | `calendar` | Month navigation, Today, rest and outside-track days, start-date change, mark done and reopen, add each of the four extra kinds, remove one, move to the next home day and to a chosen date. HAR-18 home days & breaks: weekdays toggled, a named break, rest days with nothing scheduled and no Mark done, the topic moved to the next home day, settings saved. The "clear moved topics?" prompt on a start-date change with moves is not exercised. |
| Scheduler | partly covered | `calendar`, `dashboard` | Day-one topics, rest days, reschedule on start-date change, refreshers and activities only from mastered topics (F5 fixed by HAR-18). The on-ramp order and multi-year ranges are not asserted (the pure scheduler core has unit tests). |
| Calendar launch targets | covered with mock AI | `calendar` | Refresher quiz, activity instructions, stretch lesson, topic Lesson and Test, extra Open (Extra practice opens spaced practice). Without a provider: a chip per topic row and on the stretch card, Move still works (`no-ai`). |
| Small calendar bugs | covered | `calendar`, `no-ai` | F8 and F9 fixed by HAR-18, F19 fixed by #29; all asserted fixed. |

## 4.5 Instruction

| Feature | Status | Spec | Notes |
| --- | --- | --- | --- |
| Ready-to-teach lesson | covered with mock AI | `topic`, `no-ai` | Every section renders; cached on the server and served from `/api/lessons` on a second open after reload (no second AI call). A chip with no provider. A failed regenerate (HTTP 500, or a 200 with an unusable lesson from the mock's `/__malformed`) shows the error above the previous lesson, which the cache keeps; Try again recovers (F7 fixed, HAR-20). |
| Print & go materials | covered with mock AI | `topic`, `no-ai` | Worksheet and flashcards, Preview. The print window itself is not opened. |
| Activities & games | covered with mock AI | `topic`, `calendar`, `no-ai` | Static ideas render; "Get instructions" opens step-by-step detail. A chip per activity with no provider; the unreachable message with a dead one (F10 fixed). |
| Explain simply / Make a mini-quiz | covered with mock AI | `topic`, `no-ai` | Output rendered as prose; prompts carry no learner name. |

## 4.6 Assessment

| Feature | Status | Spec | Notes |
| --- | --- | --- | --- |
| Topic, section and subject mastery tests | covered with mock AI | `topic`, `insights`, `child-view`, `no-ai` | Digital topic test: unanswered warning, pass, Review answers and back records once, topic becomes mastered. Paper mode: answer key, live score, 75% recorded as not mastered. Section check unlocks after all nine topics are mastered and passes. Final subject test unlocks when every section is passed. Normalize + independent verify both run (mock log). |
| Manual mastery override | covered | `topic` | Topic level; section check becomes available from manual mastery. |
| Certificates | partly covered | `insights` | "Print certificate" is offered after a passed final test; the print window is not opened. |
| Timed challenge | covered with mock AI | `topic`, `walkthrough`, `no-ai` | Intro, 8 questions, 8/8 result saved, best score shown on the topic page; Escape mid-challenge asks to confirm and closes the challenge (walkthrough). The timer running out is not waited for. |
| Adaptivity (parent-approved difficulty) | covered | `insights` | A pending suggestion shows on the dashboard and Insights; approve sets the adaptation; undo clears it. Generating a suggestion from a real challenge needs two aced challenges and is not driven. |

## 4.7 Retention

| Feature | Status | Spec | Notes |
| --- | --- | --- | --- |
| Active recall cards (Leitner boxes) | covered with mock AI | `topic`, `child-view`, `no-ai` | Hint, reveal, grade, ungraded card stays due, dashboard "1 due", review from the dashboard, and two due the next day. HAR-20: the cards are cached on the server as `{ cards }` and a second open calls the provider for nothing new (F1 fixed). |
| Spaced practice for missed test questions | covered with mock AI | `topic`, `dashboard` | A question missed on a paper test is queued, shows as "1 due", is retried and leaves the due list. |

## 4.8 Evidence

| Feature | Status | Spec | Notes |
| --- | --- | --- | --- |
| Records | covered | `records`, `topic`, `map`, `dashboard` | One of each type the form offers (HAR-16 removed "Recording"), required title or note, rating, topic link and navigation, filters, delete with confirm, the day counts as active. HAR-17 coverage claims and `source` links from a daily pick (`dashboard`). |
| Voice recorder with live transcript | covered | `records`, `child-view`, `walkthrough` | Fake microphone: start, timer, stop, preview, link topic, transcript, save, audio on the server, playback, Escape asks before discarding (Cancel keeps the microphone track live; OK ends every track). Live speech recognition itself is not exercised (needs a real speech service). |
| Recordings folder | covered | `records`, `dashboard` | Empty state, HAR-16 grouping (section, topic, "Not linked to a section"), playback request, delete removes the audio file. |
| AI discussion analysis | covered with mock AI | `records`, `no-ai` | From Records (saved on the record with Regenerate, and as an advice record) and from the folder (saved on the recording, survives reload). HAR-19: no learner's name reaches the provider (names written into notes and transcripts arrive as "the child"), notes only with the "Include my notes" opt-in, Analyze disabled on a note-only record until then (F2 fixed). |
| Photo / file attachments | not covered | | Does not exist on `main`. |

## 4.9 Analytics and insight

| Feature | Status | Spec | Notes |
| --- | --- | --- | --- |
| Dashboard | covered | `dashboard` | Every section listed in the audit, for ages 3, 6 and 9, with no console errors. Banner wording (F4), count formatting (F15). |
| Insights: subject stats, recommended next | covered | `insights` | Subject chips, the four counts, recommendation opens its topic. |
| Insights: progress review, final test, adaptive suggestions | covered with mock AI | `insights`, `no-ai` | Review generated; HAR-19: no learner name in the prompt, notes left out by default and sent (with names replaced) once the box is ticked (F2 fixed); final test locked and unlocked; suggestions approved and undone. |
| Notifications bell | covered | `notifications` | Unread badge, mark all read, mark one read, empty state. Accessible name (F13). |

## 4.10 Engagement

| Feature | Status | Spec | Notes |
| --- | --- | --- | --- |
| Child view | covered with mock AI | `child-view`, `walkthrough`, `mobile`, `no-ai` | HAR-15: no `%`, `XP`, `Level` or scores in the overlay or in the challenge, recall and topic card it opens, and no popups; results still saved for the parent; picks open the child topic card; set, confirm and enter the PIN (too short, mismatch, wrong PIN); parent shell inert while open. PIN in plain text (F16). "Plant something new" offers a topic in progress (F18). |
| XP, levels, 12 badges, confetti and sound | partly covered | `dashboard`, `child-view`, `topic` | Level card renders; a passed topic test unlocks "First Steps" with its popup in the parent view, and the child view shows no popups; the collection shows 10 badges (no level badges). Level-up and the sound are not asserted. |

## 4.11 Collaboration (retained, disabled)

| Feature | Status | Spec | Notes |
| --- | --- | --- | --- |
| Commune | removed (HAR-23) | | Unrouted views deleted; only the fail-closed `src/js/coop.js` stub remains, covered by `tests/isolation.test.mjs`. |
| Printable Day Sheet | removed (HAR-23) | | Deleted with the Commune views. |
| Harrington Helper chat | removed (HAR-23) | | Never mounted; the view, its prompt builder and the mock's `chat` responder are deleted. |
