# End-to-end findings

What the e2e suite found while it was being written (1 October 2026). The
suite was last run against `main` at `add6a04`, which includes HAR-10, HAR-14,
HAR-15 and HAR-16. Nothing here is fixed in this pull request; each item names
the spec that shows it.

A test that pins a defect has **(finding)** in its title and asserts today's
behavior, so it fails as soon as the defect is fixed; flip the assertion then.

Severity: **High** affects data, privacy or the child view's promise;
**Medium** is a visible bug or a misleading screen; **Low** is polish or
accessibility.

HAR-13 (#18, honest no-AI mode) addresses some of these and had not merged
when this was written. Three findings from the first run were fixed by pull
requests that merged while the suite was being written; they are listed under
[Fixed since the audit](#fixed-since-the-audit).

## Summary

| # | Finding | Severity | Spec | Pending fix |
| --- | --- | --- | --- | --- |
| F1 | Recall cards are never cached: the server rejects them | High | `api`, `topic` | |
| F2 | Discussion analysis and progress review send the learner's name to the AI provider | High | `records`, `insights` | HAR-19 |
| F3 | A 3-year-old gets no daily choices and an "everything is mastered" message | Medium | `dashboard` | |
| F4 | The preview banner says AI is not connected even when it is | Medium | `dashboard` | |
| F5 | Day one offers a refresher quiz on a topic never taught | Medium | `dashboard`, `calendar` | |
| F6 | Export and Import are not reachable on a phone | Medium | `mobile` | |
| F7 | A failed "Generate a different version" leaves a spinner forever | Medium | `topic` | HAR-13 |
| F8 | "Extra practice" on the calendar opens a lesson | Medium | `calendar` | |
| F9 | "Refreshers change each day automatically" is a button that does nothing | Low | `calendar` | |
| F10 | Activity instructions failure says "Couldn't create the lesson" | Low | `no-ai` | HAR-13 |
| F11 | Selecting a skill scrolls the page to the top | Low | `map` | |
| F12 | Recent growth lists topics set back to "Not started" | Low | `topic` | |
| F13 | Notification bell has no accessible name | Low | `notifications` | |
| F14 | Icon-only delete and remove buttons have no accessible name | Low | `learners`, `records`, `calendar` | |
| F15 | Dashboard says "1590 topics" where the map says "1,590" | Low | `dashboard` | |
| F16 | The child-view PIN is stored and exported in plain text | Low | `data-safety` | |

Verified fixed since the 27 September audit (the suite now guards them):
see [the end of this page](#fixed-since-the-audit).

---

## F1. Recall cards are never cached: the server rejects them

**High.** `src/js/views/recall.js:14` saves a topic's recall cards with
`store.saveCachedLesson('recall:<topicId>', cards)`, where `cards` is an
**array**. `PUT /api/lessons/:key` only accepts a JSON object
(`server.mjs` `readJson`), answers `400 Request body must be a JSON object`,
and `saveCachedLesson` swallows the error.

Effect: every "Practice recall", "Memory walk" and dashboard "Review" asks the
AI provider for new cards. A real model returns different cards, but the
spaced-repetition schedule is keyed by `<topicId>::<index>`, so a card due for
review can come back with a different question, and the README's "made once,
then saved for reuse" is not true for recall cards.

Repro:
1. With a provider configured, open a topic and press **Practice recall**.
2. The server log shows `Error: Request body must be a JSON object`;
   `GET /api/lessons/recall%3A<topicId>` is 404.
3. Open **Practice recall** again: the provider is called again.

Shown by `api.spec.mjs` › "lessons: … arrays are refused (finding)" and by
the server log during `topic.spec.mjs` › "practice recall…".
Fix idea: wrap the cards (`{ cards }`) when caching and unwrap on read.

## F2. Discussion analysis and progress review send the learner's name to the AI provider

**High.** `records.js:166`, `recordings.js:155` and `insights.js:139` pass the
learner's real name into the prompt (`studentName`), and the progress review
also sends the parent's record notes. The README says "Never send a real
child's name into a model prompt"; the guide already admits this until HAR-19.
Lessons, tests, explain, quiz and activity prompts are clean (asserted in
`topic.spec.mjs`).

Repro: with a provider, Records › a discussion › **Analyze & get advice**;
the provider receives "…between the parent and Rowan Example (age 6)…".

Shown by `records.spec.mjs` › "analyze a discussion…" and
`insights.spec.mjs` › "generate a progress review (learner name goes into
the prompt: finding)", both reading the mock provider's request log.

## F3. A 3-year-old gets no daily choices and an "everything is mastered" message

**Medium.** `recommendedNext` and the daily lanes skip topics more than one
year above the learner's age (`mastery.js:65`); the taxonomy starts at 4–5,
so a 3-year-old has nothing. The dashboard shows no literacy or numeracy
choice and the stepping-stones card says "Everything available is mastered —
explore the map to go further." (`dashboard.js:99`), which is wrong for a
learner with nothing mastered. The child view's "Plant something new" says
"Ask a grown-up to choose".

Repro: add a learner born 2023, open the dashboard.

Shown by `dashboard.spec.mjs` › "a 3-year-old gets no daily choices and no
stepping stones (finding)". Screenshot: `screenshots/dashboard/05-dashboard-three-year-old.jpg`.

## F4. The preview banner says AI is not connected even when it is

**Medium.** The shell banner (`shell.js:96`) always reads "AI and
shared-family features are not connected yet", even when `/api/health`
reports `aiConfigured: true` and lessons work.

Shown by `dashboard.spec.mjs` › "the preview banner says AI is not connected
even when it is (finding)".

## F5. Day one offers a refresher quiz on a topic never taught

**Medium.** With fewer than three mastered topics, `dailyExtras`
(`scheduler.js:140`) draws the "refresher" from any topic at or below the
learner's age. A brand-new 6-year-old's Today's path shows "Refresher quiz ·
Coping with Life Changes — Keep an earlier Personal & Social Development
skill sharp", and the calendar shows a "REFRESHER QUIZ" card the same way.
(Audit §4.4, still present.)

Shown in `screenshots/dashboard/01-dashboard-six-year-old.jpg` and asserted
present by `dashboard.spec.mjs` and `calendar.spec.mjs`.

## F6. Export and Import are not reachable on a phone

**Medium.** HAR-10 put **Export** and **Import** in the desktop sidebar's
family box (`shell.js`, inside `aside.hidden.lg:flex`). Below the `lg`
breakpoint the sidebar is hidden and the phone top bar has no equivalent, so
a family using Harrington on a tablet or phone cannot back up or restore.

Shown by `mobile.spec.mjs` › "export and import are not reachable on a phone
(finding)".

## F7. A failed "Generate a different version" leaves a spinner forever

**Medium.** In the lesson modal, if regeneration fails (`lesson.js:60`) a
toast says "Could not regenerate" but the modal keeps "Writing a fresh
version…" with a spinner; the existing lesson is gone from view until the
modal is closed.

Repro: open a lesson, make the provider fail (the mock's `POST /__fail`),
press **Generate a different version**.

Shown by `topic.spec.mjs` › "\"Generate a different version\" failing leaves
a spinner (finding)". HAR-13 (#18) says it fixes this.

## F8. "Extra practice" on the calendar opens a lesson

**Medium.** An extra added as "Extra practice" opens the full lesson, the same
as "Re-teach lesson" (`calendar.js:229`). There is no practice flow behind it.

Shown by `calendar.spec.mjs` › "add an extra of each kind, open one, remove one".

## F9. "Refreshers change each day automatically" is a button that does nothing

**Low.** The footer of the calendar's refresher block is a `<button>`
(`calendar.js:442`) with no handler. Clicking it changes nothing.

Shown by `calendar.spec.mjs` › "refresher, activity and stretch cards open
their tools; the footer button does nothing (finding)".

## F10. Activity instructions failure says "Couldn't create the lesson"

**Low.** With no provider, an activity's **Get instructions** shows
"Couldn't create the lesson right now." because it reuses the lesson's error
block with `unconfigured = false` (`lesson.js:217, 246`). The lesson itself
says "AI is not configured."; the other AI buttons each have their own
generic "try again" wording.

Shown by `no-ai.spec.mjs`. HAR-13 (#18) replaces all of these messages.

## F11. Selecting a skill scrolls the page to the top

**Low.** Every node click in the skill tree calls `navigate()`, which calls
`window.scrollTo({ top: 0 })` (`app.js:25`). The tree's own scroll position
is restored, but the page jumps up. (Audit §4.3.)

Shown by `map.spec.mjs` › "selecting a skill scrolls the page back to the top
(finding)".

## F12. Recent growth lists topics set back to "Not started"

**Low.** `recentActivity` (`mastery.js:115`) lists every topic with a
progress entry, including one a parent marked "Not started" again, so the
dashboard's Recent growth shows "One-to-one counting · Sprout · Not started".

Shown by `topic.spec.mjs` › "manual status: every transition…".

## F13. Notification bell has no accessible name

**Low.** The bell (`notifications.js:16`) has only a `title`. With an unread
badge its accessible name is the count ("1") instead of "Notifications", so
a screen reader announces "1, button".

Shown by `notifications.spec.mjs` › "the bell is named by its unread count,
not \"Notifications\" (finding)".

## F14. Icon-only delete and remove buttons have no accessible name

**Low.** The trash and x buttons for a learner (`shell.js:141`), a record
(`records.js:81`), a recording (`recordings.js:98`) and a calendar extra
(`calendar.js:224`) contain only an icon. The specs have to reach them by
position or class.

Shown by `learners.spec.mjs` › "the learner menu buttons are reachable by role
(delete is icon-only)".

## F15. Dashboard says "1590 topics" where the map says "1,590"

**Low.** The dashboard hero prints `stats.total` raw (`dashboard.js:46`); the
map and the notification use `toLocaleString()`.

Seen in every dashboard screenshot.

## F16. The child-view PIN is stored and exported in plain text

**Low.** HAR-15 keeps the parent PIN as `settings.parentPin` in the family
document. It is returned by `GET /api/state` and written into every
**Export** file, so anyone who can open the export (or the data folder) can
read it. The pull request calls the PIN a convenience rather than
authentication, and reloading the page leaves the child view anyway, so this
is a note for when authentication arrives rather than a defect today.

Shown by `data-safety.spec.mjs` › "export downloads the whole family document
as JSON".

---

## Fixed since the audit

The suite confirms these audit items now behave, and fails if they regress:

| Audit item | Now | Spec |
| --- | --- | --- |
| Removing a learner orphaned their tests, plan, game, etc. | HAR-10 clears every per-learner key | `data-safety` |
| Two tabs silently overwrote each other | The losing tab reloads and says "Another device saved changes. Reloaded the latest." | `data-safety` |
| No export or restore | Export and Import with a preview (desktop only, see F6) | `data-safety` |
| Recall grading dropped the card's `topicId`, so due cards could not load | Every graded card keeps its `topicId`; "Review" opens the due card | `topic` |
| "Review answers → Back to result" re-saved the test and re-awarded XP | One test record per attempt | `topic` |
| Escape on the recorder left the microphone running | Escape asks "Discard this recording?" and stops the stream | `records` |
| Child view: activities showed percentages, answer keys and badge popups (first run's F3) | HAR-15: tests, challenges and recall launched from the child view end with "All done, well tried!", no counts, no popups; "Plant something new" opens a child topic card; Grown-ups needs a PIN; the parent shell is inert | `child-view` |
| Topic page scrolled sideways on a phone (first run's F7) | HAR-14 moved the growth chip into a wrapping status row; every route now fits 390 px | `mobile` |
| Recordings folder labeled the unfiled group with a topic; manual "Recording" records had no audio (first run's F11) | HAR-16: groups by section, then topic, then "Not linked to a section"; the form no longer offers "Recording"; analysis from Records is saved on the record; records count toward the day's activity | `records` |
| No placement; mastery near 0% for older learners | HAR-14 placement from the learner menu or a subject card, with prerequisites, and undo from Records | `placement` |
| Typed answers graded by substring | Not reachable with the digital tests the mock returns; covered by `tests/grading.test.mjs` | unit |
