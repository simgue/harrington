# Changelog

All notable changes to Harrington are documented here. This project loosely
follows [Keep a Changelog](https://keepachangelog.com/). Harrington has not
tagged a release yet; everything below is on `main`.

## [Unreleased]

### Changed
- Calendar follows the family's home days and breaks (set under Home days &
  breaks); rest days schedule nothing. Unmastered literacy and numeracy topics
  below the learner's age come first, after their prerequisites. Refreshers
  come only from mastered topics, Extra practice opens spaced practice, and
  changing the start date offers to clear moved topics (HAR-18).
- Learners can be edited (name, birth month and year, color) from the learner
  selector, and onboarding and Add student take an optional birth month. Age
  counts whole years when the month is known; the map, daily choices,
  placement and calendar follow an edited age (HAR-22).
- Selecting a skill in the skill tree keeps the page and the tree where they
  are, and "Back to graph" from a topic page returns to the same skill,
  selected, at the same scroll. The selection is in the address
  (`?skill=`) and resets when the learner changes (HAR-21).
- A learner switched away from the map (from the dashboard, say) keeps the
  skill they open next: "Back to graph" from their topic page selects it
  instead of clearing it as the previous learner's (HAR-21 follow-up).
- Generated lessons, print sheets, activity instructions and recall cards are
  never cached empty or malformed, open once for rapid repeat clicks, and each
  has "Generate a different version" that keeps the previous version if it
  fails. Recall cards now persist, printed sheets show topic, subject and age,
  and cached content opens without an AI provider (HAR-20).
- Welcome tour, in-app Guide, printable guide and `src/docs/GUIDE.md` describe
  only what works today. AI-backed features carry one line: "Needs a local AI
  provider; see the README." The curriculum auto-update claim is gone, and the
  live transcript is labeled as using the browser's speech service (HAR-12).
- Guide is reachable on phones from a book icon in the header (HAR-12).
- Onboarding, the first-run notification and the YouTube reference link use
  plain, accurate wording (HAR-12).

### Added
- Today's pick-one stops record evidence for the pick: the note and voice
  forms offer an opt-in "Mark curriculum coverage" checkbox, and a pick shows
  "Evidence recorded" only once a linked record claims coverage. Each stop
  also shows a parent-only "Not yet: <topic> needs <prerequisite> first" line,
  and the dashboard captures each learner's interests as chips and free text
  (HAR-17, salvaged from PR #5).
- Platform audit of 27 September 2026 (`docs/audits/`).
- Daily literacy and numeracy pick-one choices on Today's path and in the
  child view, drawn from the POC focus domains (HAR-4, PR #7).
- Growth stages (Seed, Sprout, Bud, Bloom) in place of scores, and a child
  view opened from the dashboard with no levels, XP or percentages.
- Storybook Meadow theme with self-hosted fonts.
- Map: world map of subject realms, per-domain skill tree with quest log, and
  a list drill-down (HAR-3, HAR-5, HAR-6).
- Local OpenAI-compatible AI adapter, fail-closed until
  `HARRINGTON_AI_BASE_URL` and `HARRINGTON_AI_MODEL` are set (HAR-7).
- Dependency-free Node server storing family state, lesson caches, recordings
  and the taxonomy cache under `data/private/`; Docker and Compose bound to
  loopback; CI running `npm test` (HAR-2).

### Removed
- Dead code after the stabilization wave: the unmounted Harrington Helper
  chat, the unrouted Commune and Day Sheet views, the unlinked timeline view,
  the unused section-graph helpers, unused exports and imports, and the
  ignored client model aliases; README, SECURITY, CONTRIBUTING and the POC
  notes no longer describe them. `scripts/dead-code.mjs` lists what is left
  and flags a use of another module's export whose import is missing (HAR-23).
- Hosted sign-in, cloud storage and the hosted deploy workflow inherited from
  Homestead (HAR-2).

### Fixed
- The Calendar page rendered blank without an AI provider (`gateAi` was
  called but not imported); a source test now checks every file that uses an
  `ai-status.js` helper imports it (HAR-18, HAR-20).
- The in-app Guide and `src/docs/GUIDE.md` no longer say the child's name is
  sent to the AI provider; README, SECURITY and both guides state the same
  data, including which requests carry the learner's exact age (HAR-19).
- Export and Import are reachable on a phone or tablet, at the bottom of the
  learner selector, with the same preview and confirm as on a computer
  (e2e finding F6).
- Icon-only buttons are named for what they act on ("Remove learner …",
  "Delete record …", "Delete recording …", "Remove extra …"). On a phone
  every tap target there is at least 44 px: the learner selector's
  placement, edit and remove buttons get a labeled line of their own (so the
  name is no longer cut off), Switch and Add grow, the delete and remove
  buttons get a 44 px hit area around the same icon, and the "Include my
  notes" checkbox is larger in a 44 px clickable label (e2e finding F14).
- Counts are printed one way everywhere ("1,590", American grouping whatever
  the browser's locale) with the right singular or plural: the dashboard said
  "1590 topics" where the map said "1,590", and the map said "1 domains"
  and "1 required skill still sit" (e2e finding F15).
- The child-view PIN is stored and exported only as a salted SHA-256 hash
  (a random salt per family); a plain PIN from an older family document,
  another tab's save or an export is hashed whenever a document is applied,
  so no save writes it back, and a malformed hash or salt is dropped. SECURITY and both guides say plainly
  that a 4-digit PIN is a gentle barrier, not a lock (e2e finding F16).

## Forked from Homestead (2026-08-11)

Harrington started as a fork of
[Homestead](https://github.com/tbh-23/Homestead) under the MIT License.

### Inherited from Homestead 1.0.0

Most of these remain in the codebase. Features marked (AI) need a local AI
provider in Harrington; Commune and the Helper chat are disabled.

- Mastery ladder: topics, sections and subjects gated at 90%+.
- Curriculum from the Marble Skill Taxonomy's prerequisite graph, with a
  "How this connects" flow and an age-ordered timeline.
- Lessons, print & go materials and activity instructions (AI).
- Topic, section and subject mastery tests, digital or printable, with
  certificates (AI).
- Recall cards with spaced repetition (AI), and spaced practice for missed
  test questions (fed only by AI-generated tests).
- Timed challenges and parent-approved adaptivity (AI).
- Day-by-day calendar with moves, done days and extras.
- Records, voice recording with live transcript, recordings folder, and
  discussion analysis (AI).
- Insights with progress reviews (AI) and recommended next topics.
- XP, levels, badges and celebrations; notification center; streak tracker;
  downloadable guide and welcome tour.
- Commune shared teaching and the Helper chat (disabled in Harrington).
