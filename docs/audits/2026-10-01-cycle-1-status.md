# Harrington cycle 1 status and updated recommendations — 1 October 2026

**Purpose.** Companion to the [27 September platform audit](2026-09-27-platform-audit.md).
It records what shipped in the first development cycle after the audit, what is in flight,
what is queued, the decisions still owed by the family, and a re-ranked recommendation
list that replaces audit §7. Linear (team HAR) remains the source of truth for the work
items; this document is the narrative snapshot.

**Method.** Every pull request merged since the audit was read in full, run locally
(`npm test`, which builds Tailwind and the assets before `node --test`), checked by an
independent reviewer against the ticket's acceptance criteria, and merged only when CI
was green and the review verdict was MERGE. Review findings were sent back to the
implementing session as change lists and fixed before merge. Status as of main at
`add6a04` (2 October 2026).

---

## 1. TL;DR

- **Wave 1 (stabilisation) is merged.** Six pull requests closed every bug the audit
  called "actually broken" plus the data-safety gap. The test suite grew from 40 to 84
  tests. Main CI has been green on every merge.
- **Wave 2 (first-use readiness) is three-quarters merged.** Records integrity
  (HAR-16), child-view containment (HAR-15) and placement (HAR-14) are on main after
  independent review; honest no-AI mode (HAR-13) is merging last. The suite is at 106
  tests. An end-to-end Playwright harness with 90 browser tests, 90 screenshots and
  recorded walkthroughs is in review as PR #20.
- **Wave 3 has started**: interest capture and coverage-claim evidence (HAR-17) and
  learner editing (HAR-22) are in development; calendar realism, prompt privacy, cache
  hygiene and the skill-tree fix follow HAR-13.
- **Three decisions and one command are owed by the family** (section 5): the AI
  provider, the device topology, the placement workbook questions, and deleting the
  upstream telemetry shim from `src/index.html`.

| Audit question | 27 September | 1 October |
| --- | --- | --- |
| Tests | 40 | 106 unit tests on main, plus 90 end-to-end browser tests in PR #20 |
| Microphone left on after Escape or backdrop | Broken | Fixed (HAR-8) |
| Challenge timer runs on after dismissal, phantom result | Broken | Fixed (HAR-8) |
| "Review answers → Back" re-saves and re-awards | Broken | Fixed (HAR-9) |
| Typed-answer grader accepts any substring | Broken | Fixed, pure grader with tests (HAR-9) |
| Recall cards unloadable after first grading | Broken | Fixed (HAR-9) |
| Two devices overwrite each other silently | Risk | Version + If-Match, visible failures, reconcile (HAR-10) |
| No export, no backup | Gap | Export/import in the account box, `npm run backup` (HAR-10) |
| Unescaped names and record fields in `innerHTML` | Risk | Swept through `ui.esc()` across every view (HAR-11 part 1) |
| Tour, Guide, onboarding describe the upstream | Misleading | Rewritten to what works today; Harrington changelog started (HAR-12) |
| Placement for an older child | Missing | Merged: placement modal with prerequisite closure and undo (HAR-14) |
| Scores and XP leak into the child view | Leaking | Merged: parent PIN, inert shell, score-free child paths (HAR-15) |
| AI buttons dead-end without a provider | Confusing | Pull request #18 in final merge (HAR-13) |

### Report card delta

| Layer | 27 September | 1 October | Why |
| --- | --- | --- | --- |
| Platform & operations | Bud | **Bud+** | Versioned state, export/import, backup script, CSRF check on the beacon path. Still no auth or LAN story (HAR-25). |
| Curriculum & navigation | Bloom | Bloom | Unchanged. Scroll and selection loss on the skill tree is queued (HAR-21). |
| Learner model & daily rhythm | Bud | **Bloom** | Placement turns empty rings into useful ones for the 9-year-old; daily choices rebuild after a placement. |
| Instruction | Seed | Seed | Still fully AI-gated by design; honest gating lands with HAR-13. |
| Assessment | Seed | **Sprout** | Grading, duplicate results and empty tests fixed. A non-AI path is HAR-24. |
| Retention | Seed | Sprout | Recall scheduler repaired; still starved without a provider. |
| Evidence | Bud | **Bud+** | Mic cleanup, escaping, and the five records/recordings bugs fixed (HAR-16). |
| Analytics & insight | Sprout | Sprout | Unchanged. |
| Engagement | Sprout | **Bud** | PIN, inert parent shell, no celebrations or scores in the child view, child-safe topic card. |
| Collaboration | Seed | Seed | Still disabled by design. |
| Documentation & copy | Sprout | **Bud** | Tour, Guide, GUIDE.md, onboarding, changelog and PR template now describe Harrington. Repo description still says Homestead. |

---

## 2. Shipped since the audit (wave 1)

All six pull requests were authored by Opus 5.5 development sessions working from a
Linear ticket, reviewed by an independent reviewer, and merged by the architect session
after a local full-suite run and green CI.

| PR | Ticket | What changed | Review findings fixed before merge |
| --- | --- | --- | --- |
| [#10](https://github.com/simgue/harrington/pull/10) | HAR-12 | Welcome tour, in-app Guide, printable guide, `src/docs/GUIDE.md`, onboarding and first-run notification describe only what works today. Guide reachable on phones. A Harrington `CHANGELOG.md` replaces the inherited one. PR template and `.gitignore` comment corrected. README gains "What works without an AI provider". | Privacy sentence under-claimed what AI features send; fixed in #14. |
| [#14](https://github.com/simgue/harrington/pull/14) | HAR-12 | Follow-up: the AI privacy sentence says exactly what leaves the machine; GUIDE.md link and changelog note corrected. | — |
| [#11](https://github.com/simgue/harrington/pull/11) | HAR-8 | `createModalStack()` in `ui.js`: `openModal(el, { beforeClose })`, one Escape listener, top-most modal only, backdrop and Escape run the same cleanup as the close button. The recorder releases the microphone and the challenge timer is cleared on every dismissal path. Leaving a test in progress asks for confirmation. | — |
| [#13](https://github.com/simgue/harrington/pull/13) | HAR-11 (part 1) | Every learner name, record field and taxonomy string interpolated into `innerHTML` goes through `ui.esc()`, across fifteen views and the shell. | Part 2, deleting the telemetry shim from `src/index.html`, could not be committed by the agent and is with the family (section 5). |
| [#9](https://github.com/simgue/harrington/pull/9) | HAR-9 | Pure grader in `src/js/grading.js` (`isCorrect`, `normalizeAnswer`, `parseNumber`): dash variants, sign-preserving hyphens, thousands separators, digit and letter boundaries, mixed fractions. Results recorded once; empty tests refused; task items supported; recall `topicId` repaired on load; `store.setStatusBulk` for one-persist batch writes. | Four grader defects from the review (negative numbers, spacing, unit suffixes, fraction forms). |
| [#12](https://github.com/simgue/harrington/pull/12) | HAR-10 | The family document carries `version`, `updatedAt` and a client `writeId`. `GET /api/state` returns `ETag: "vN"`; `PUT` requires `If-Match` and answers 412 with the current document, 428 when missing, 400 when malformed, inside the per-path write queue. `POST /api/state` is the unload beacon path (JSON only, cross-site requests refused). Save failures are visible; a stale tab reconciles on return instead of overwriting. Export and import live in the sidebar account box; `npm run backup` copies `data/private`. `removeStudent` clears all twelve per-learner keys and deletes audio after a confirmed save. `/api/health` reports `stateVersion` and `stateBytes`. | A beacon could overwrite a newer write; cross-site beacons were accepted; a 412 caused by our own lost write was retried as a no-op. All three fixed and covered by tests. |

Also closed: [PR #2](https://github.com/simgue/harrington/pull/2) (superseded by the
self-hosting work merged on 5 September).

---

## 3. Wave 2 and the end-to-end harness

| Ticket | Pull request | State on 2 October | Independent review |
| --- | --- | --- | --- |
| HAR-16 Records and recordings integrity | [#15](https://github.com/simgue/harrington/pull/15) | **Merged** (1a981ba) | FIX-FIRST on one regression (topic-linked recordings filed under a group named "Section"), fixed and re-verified, then MERGE. |
| HAR-15 Child view containment | [#16](https://github.com/simgue/harrington/pull/16) | **Merged** (838b958) | MERGE. Containment survived Tab, Shift+Tab, programmatic focus, hit-tests, keys, hash changes and history navigation; the parent shell is inert while the child view is open; recall, challenge and test end score-free. |
| HAR-14 Placement and manual status | [#17](https://github.com/simgue/harrington/pull/17) | **Merged** (add6a04) | FIX-FIRST on stale daily choices after a placement, fixed and re-verified, then MERGE. The prerequisite closure matched an independent implementation across a 72-case subject and age sweep; placement no longer counts as a learning day. |
| HAR-13 Honest no-AI mode | [#18](https://github.com/simgue/harrington/pull/18) | Open, merging last | FIX-FIRST on a calendar layout defect (extra-practice rows lost their title when the chip replaced the button), fixed; two ungated recall paths and the stray `#timeline` route closed. Waiting on the merge of main with the agreed child-view and Regenerate resolutions. |
| End-to-end harness and walkthrough | [#20](https://github.com/simgue/harrington/pull/20) | Open, CI green (unit and e2e) | Under review. Playwright 1.56 against the real server with a deterministic mock AI provider; 90 tests across api, desktop, no-ai, mobile and walkthrough projects; 90 JPEG screenshots committed (5.3 MB); videos as CI artifacts; `docs/e2e/` README, WALKTHROUGH, COVERAGE and FINDINGS (16 open findings, two rated high). |

Merge order was HAR-16, HAR-15, HAR-14, then HAR-13, because HAR-13 overlaps the
other three in the child view and the Records card. Each merge was preceded by a
full-suite run on the branch, an integration run of all open branches on top of main,
and green CI.

---

## 4. Queued (wave 3)

| Ticket | Title | Depends on | Why it is in this wave |
| --- | --- | --- | --- |
| HAR-17 | Salvage PR #5 onto `daily.js`: coverage-claim evidence, "why locked" line, interest capture | — | **In development.** Finishes HAR-4 the second way; PR #5 closes with a pointer once this merges. |
| HAR-18 | Calendar realism: holidays and term breaks, on-ramp for younger topics | — | Audit §4.4; the calendar is otherwise unusable for a real term. |
| HAR-19 | Never send learner names or parent notes into AI prompts; extend the privacy copy | — | Must land before any AI provider is switched on. |
| HAR-20 | Generated-content caches: regenerate buttons, never cache empty results | HAR-13 | Only matters once a provider exists. Now also carries the recall-cache bug (cards are never persisted because the server refuses a bare array) and an "open cached" upgrade so generated content stays reachable when the server starts without a provider. |
| HAR-21 | Skill tree: keep scroll position and selection on node click and status change | HAR-11, HAR-14 | Status buttons on the quest log make the reset more visible. |
| HAR-22 | Learner editing: name, birth month and year, colour | wave 2 | **In development.** Kept out of wave 2 to avoid conflicts in the shell. |
| HAR-23 | Prune dead code and unused imports after the stabilisation wave | all of the above | Last, so it does not conflict with anything. |
| HAR-24 | Evidence-checklist mastery and level-set placement workbook (non-AI assessment) | HAR-14 | The non-AI way to pass a section; needs the family's answers in section 5. |
| HAR-25 | Multi-device deployment: LAN access, shared secret, TLS, secure-context microphone | decision | See section 5. |
| HAR-26 | AI provider decision and first experiment: lessons only, local first | HAR-13, HAR-19 | See section 5. |
| HAR-27 | Notifications: remove the bell or give it a real source | — | Small; can ride with HAR-22. |

Also pending: HAR-11 part 2 (section 5), [PR #4](https://github.com/simgue/harrington/pull/4)
(a 16-line Cursor environment file on a stale branch; merge or close), and the GitHub
repository description, which still describes Homestead.

---

## 5. Decisions and actions owed by the family

1. **Delete the telemetry shim (HAR-11 part 2).** Lines 7–12 of `src/index.html` still
   post every error to `window.parent`. The implementing agent could not commit the
   deletion, so it is a one-minute task on a laptop:

   ```sh
   sed -i '7,12d' src/index.html
   ```

   and add this line to `tests/isolation.test.mjs` next to the other `index.html` assertions:

   ```js
   assert.doesNotMatch(index, /postMessage|window\.parent/);
   ```

2. **AI provider for week one.** Recommendation unchanged: run week one **without** a
   provider. HAR-13 makes the app honest about it. Once HAR-13 and HAR-19 are merged,
   run the HAR-26 experiment: a local OpenAI-compatible endpoint (Ollama or similar) on
   the server machine, lessons only, with a model that follows JSON schemas reliably.
   Tests, challenges and recall come later and only if lesson quality is good.

3. **Device topology (HAR-25).** The rule that keeps data safe is **one server, one data
   directory**. HAR-10 protects against two tabs or two devices talking to the *same*
   server; nothing protects against two servers writing to a folder that a sync service
   (iCloud, Dropbox, OneDrive) merges later. Recommended setup:
   - Run the server on one always-on machine. Every other device uses the browser.
   - Reach it over the home network or a private mesh (Tailscale or equivalent) rather
     than exposing a port.
   - The microphone needs a secure context: `localhost` on the server machine, or HTTPS
     via the mesh's certificate feature or a local reverse proxy on other devices.
   - Schedule `npm run backup` nightly on the server machine and run an export from the
     account box before every upgrade.
   - Never run `npm start` on two machines against the same synced folder.

4. **Placement workbook (HAR-24).** To design the level-set exercise the ticket needs
   answers to: which two subjects to place first per child (recommendation: literacy and
   numeracy); whether placement is by age band alone (the HAR-14 modal) or age band plus
   an evidence checklist per domain; paper or on-screen; how long per sitting
   (recommendation: twenty minutes per child per subject, over the first week).

5. **Housekeeping.** Re-authorize the Linear connector so ticket states can be updated;
   change the GitHub repository description; decide PR #4.

---

## 6. Updated recommendation list (replaces audit §7)

### Tier 0 — before first real use

1. Merge wave 2: HAR-16, HAR-14, HAR-15, then HAR-13.
2. Delete the telemetry shim (section 5, item 1).
3. Set up the single server and the nightly backup (section 5, item 3). This is the
   step that protects the family's data; everything else is recoverable.
4. Run a first placement per child with the HAR-14 modal (literacy and numeracy, up to
   age minus one) so the map, rings and daily choices start from reality.
5. Land the end-to-end harness so every later change is checked against recorded
   walkthroughs, not memory.

### Tier 1 — first two weeks of use

- HAR-24 evidence-checklist mastery and the level-set workbook (the non-AI way to pass
  a section or subject; matches the POC's preference for observed evidence).
- HAR-19 prompt privacy, then the HAR-26 lessons-only experiment.
- HAR-17 interest-led invitations and the coverage-claim rule.
- HAR-18 calendar realism.
- HAR-22 learner editing and HAR-27 notifications.
- HAR-21 skill-tree scroll and selection.

### Tier 2 — later

- HAR-25 LAN access with a shared secret and TLS, once more than one device is in use.
- HAR-20 regenerate buttons and cache hygiene, once a provider exists.
- HAR-23 dead-code prune; a state-schema version with a migration hook.
- Photo evidence attachments stored as blobs next to audio.
- The fate of Commune, the Day Sheet and the Helper.
- Victorian curriculum mapping and seasonal overlays (outside the POC).

---

## 7. How the cycle ran

- Linear is the backlog; every pull request body carries `Closes HAR-N`.
- One Opus 5.5 development session per ticket, started from `main`, pushing to the
  ticket's suggested branch and opening a draft pull request.
- One independent reviewer per pull request, working from a read-only checkout against
  the ticket's acceptance criteria, producing a criterion table, blocking defects with
  reproductions, and a MERGE or FIX-FIRST verdict.
- The architect session merges only after a local full-suite run on the branch, green CI
  and a MERGE verdict, then tells the owning session to stand down.
- Findings from the audit that were not tickets became tickets (HAR-8 to HAR-27); no
  scope was added silently to a pull request.
