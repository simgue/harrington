# End-to-end findings

What the e2e suite found while it was being written (1 and 2 October 2026). The
suite was last run against `main` at `8665fdc`, which includes HAR-10, HAR-13
through HAR-22 and the #27 and #29 follow-ups. Nothing here is fixed in this pull request;
each item names the spec that shows it.

A test that pins a defect has **(finding F<n>)** in its title and asserts
today's behavior, so it fails as soon as the defect is fixed; flip the
assertion then. Search the specs for the number to find them all.

Severity: **High** affects data, privacy or the child view's promise;
**Medium** is a visible bug or a misleading screen; **Low** is polish or
accessibility.

Some findings were fixed by pull requests that merged while the suite was
being written: three from the first run, F7 and F10 (HAR-13, #18), F2
(HAR-19, #24), F1 (HAR-20, #26), F5, F8 and F9 (HAR-18, #25), F11 (HAR-21,
#23), F19, a regression from a merge that #29 fixed within the hour, and
F6, F14, F15 and F16 (findings bundle B, #38). They are listed under
[Fixed since the audit](#fixed-since-the-audit); their entries below are kept
so the numbers stay stable.

## Summary

| # | Finding | Severity | Spec | Pending fix |
| --- | --- | --- | --- | --- |
| ~~F1~~ | ~~Recall cards are never cached: the server rejects them~~ | High | `topic` | Fixed by HAR-20 (`8311b03`) |
| ~~F2~~ | ~~Discussion analysis and progress review send the learner's name to the AI provider~~ | High | `records`, `insights` | Fixed by HAR-19 (`cffc6ab`) |
| F3 | A 3-year-old gets no daily choices and an "everything is mastered" message | Medium | `dashboard` | |
| F4 | The preview banner says AI is not connected even when it is | Medium | `dashboard` | |
| ~~F5~~ | ~~Day one offers a refresher quiz on a topic never taught~~ | Medium | `dashboard`, `calendar` | Fixed by HAR-18 (`428e9ea`) |
| ~~F6~~ | ~~Export and Import are not reachable on a phone~~ | Medium | `mobile` | Fixed by findings bundle B (#38) |
| ~~F7~~ | ~~A failed "Generate a different version" leaves a spinner forever~~ | Medium | `topic` | Fixed by HAR-13 |
| ~~F8~~ | ~~"Extra practice" on the calendar opens a lesson~~ | Medium | `calendar` | Fixed by HAR-18 (`428e9ea`) |
| ~~F9~~ | ~~"Refreshers change each day automatically" is a button that does nothing~~ | Low | `calendar` | Fixed by HAR-18 (`428e9ea`) |
| ~~F10~~ | ~~Activity instructions failure says "Couldn't create the lesson"~~ | Low | `ai-unreachable` | Fixed by HAR-13 |
| ~~F11~~ | ~~Selecting a skill scrolls the page to the top~~ | Low | `map` | Fixed by HAR-21 (`68a94c9`) |
| F12 | Recent growth lists topics set back to "Not started" | Low | `topic` | |
| F13 | Notification bell has no accessible name | Low | `notifications` | |
| ~~F14~~ | ~~Icon-only delete and remove buttons have no accessible name~~ | Low | `learners`, `records`, `calendar`, `mobile` | Fixed by findings bundle B (#38) |
| ~~F15~~ | ~~Dashboard says "1590 topics" where the map says "1,590"~~ | Low | `dashboard` | Fixed by findings bundle B (#38) |
| ~~F16~~ | ~~The child-view PIN is stored and exported in plain text~~ | Low | `data-safety`, `child-view` | Fixed by findings bundle B (#38) |
| F17 | A losing tab confirms a change, then discards it; a tab's own boot write can raise the conflict | Medium | `data-safety` | |
| F18 | "Plant something new" in the child view offers a topic already in progress | Low | `child-view` | |
| ~~F19~~ | ~~Without an AI provider the Calendar does not render (`gateAi is not defined`)~~ | High | `no-ai` | Fixed by #29 (`8665fdc`) |

Verified fixed since the 27 September audit (the suite now guards them):
see [the end of this page](#fixed-since-the-audit).

---

## F1. Recall cards are never cached: the server rejects them

**Fixed by HAR-20 (#26, `8311b03`).** Recall cards are cached as `{ cards }`
(old arrays still read). `topic.spec.mjs` › "practice recall: cards cached on
the server (F1, fixed by HAR-20)…" reads `/api/lessons/recall:<topic>` back
and checks that opening recall again asks the provider for nothing new. The
server still refuses a bare array (`api.spec.mjs`), which is now intended.

Original report: **High.** `src/js/views/recall.js:14` saves a topic's recall cards with
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

It was pinned by `api.spec.mjs` (finding F1); the fix wraps the cards as
suggested.

## F2. Discussion analysis and progress review send the learner's name to the AI provider

**Fixed by HAR-19 (#24, `cffc6ab`).** Every learner's name (and its possessive) is
replaced with "the child" before a discussion analysis or progress review
leaves, and parent notes go out only when "Include my notes in this request"
is ticked (unchecked by default; Analyze waits for it on a note-only record).
`records.spec.mjs` and `insights.spec.mjs` put learner names inside the notes
and the transcript and assert that no learner's name reaches the mock
provider, that the note stays home without the opt-in, and that it arrives
as "the child …" with it.

Original report: **High.** `records.js:166`, `recordings.js:155` and `insights.js:139` pass the
learner's real name into the prompt (`studentName`), and the progress review
also sends the parent's record notes. The README says "Never send a real
child's name into a model prompt"; the guide already admits this until HAR-19.
Lessons, tests, explain, quiz and activity prompts are clean (asserted in
`topic.spec.mjs`).

Repro: with a provider, Records › a discussion › **Analyze & get advice**;
the provider receives "…between the parent and Rowan Example (age 6)…".

It was pinned by the `records.spec.mjs` and `insights.spec.mjs` tests marked
(finding F2), now flipped as above.

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
stepping stones (finding F3)". Screenshot: `screenshots/dashboard/05-dashboard-three-year-old.jpg`.

## F4. The preview banner says AI is not connected even when it is

**Medium.** The shell banner (`shell.js:96`) always reads "AI and
shared-family features are not connected yet", even when `/api/health`
reports `aiConfigured: true` and lessons work.

Shown by `dashboard.spec.mjs` › "the preview banner says AI is not connected
even when it is (finding F4)".

## F5. Day one offers a refresher quiz on a topic never taught

**Fixed by HAR-18 (#25, `428e9ea`).** Refreshers and activities now come only from
mastered topics. With nothing mastered the dashboard has no refresher stop
and the calendar says "Refresher quizzes and activities start once … has
mastered a topic."; with one topic mastered both are about it
(`calendar.spec.mjs`, `dashboard.spec.mjs`).

Original report: **Medium.** With fewer than three mastered topics, `dailyExtras`
(`scheduler.js:140`) draws the "refresher" from any topic at or below the
learner's age. A brand-new 6-year-old's Today's path shows "Refresher quiz ·
Coping with Life Changes — Keep an earlier Personal & Social Development
skill sharp", and the calendar shows a "REFRESHER QUIZ" card the same way.
(Audit §4.4, still present.)

It was pinned by the `dashboard.spec.mjs` and `calendar.spec.mjs` tests
marked (finding F5), now flipped.

## F6. Export and Import are not reachable on a phone

**Fixed by findings bundle B (#38).** Below `lg`, Export and Import sit at
the bottom of the learner selector (the round button in the top bar) and
call the same download and the same preview and confirm as the sidebar.
`mobile.spec.mjs` › "export and import from the learner menu on a phone (F6)"
downloads the file, opens the import preview from it and checks that neither
the menu nor the preview scrolls sideways.

Original report: **Medium.** HAR-10 put **Export** and **Import** in the desktop sidebar's
family box (`shell.js`, inside `aside.hidden.lg:flex`). Below the `lg`
breakpoint the sidebar is hidden and the phone top bar has no equivalent, so
a family using Harrington on a tablet or phone cannot back up or restore.

It was pinned by `mobile.spec.mjs` › "export and import are not reachable on a
phone (finding F6)", now flipped as above.

## F7. A failed "Generate a different version" leaves a spinner forever

**Fixed by HAR-13 (#18).** The modal now shows "The AI provider sent back an
error or an answer Harrington couldn’t use. Try again." with **Try again**,
which recovers. `topic.spec.mjs` › "\"Generate a different version\" failing
explains the error and Try again recovers (F7, fixed by HAR-13)" guards it.

Original report: **Medium.** In the lesson modal, if regeneration fails (`lesson.js:60`) a
toast says "Could not regenerate" but the modal keeps "Writing a fresh
version…" with a spinner; the existing lesson is gone from view until the
modal is closed.

Repro: open a lesson, make the provider fail (the mock's `POST /__fail`),
press **Generate a different version**.

It was pinned by `topic.spec.mjs` › "\"Generate a different version\"
failing leaves a spinner (finding F7)", now flipped as above.

## F8. "Extra practice" on the calendar opens a lesson

**Fixed by HAR-18 (#25, `428e9ea`).** It now opens spaced practice ("All caught up!"
when nothing is due), asserted in `calendar.spec.mjs`.

Original report: **Medium.** An extra added as "Extra practice" opens the full lesson, the same
as "Re-teach lesson" (`calendar.js:229`). There is no practice flow behind it.

It was pinned by `calendar.spec.mjs`, now flipped.

## F9. "Refreshers change each day automatically" is a button that does nothing

**Fixed by HAR-18 (#25, `428e9ea`).** The button is gone (asserted in
`calendar.spec.mjs`).

Original report: **Low.** The footer of the calendar's refresher block is a `<button>`
(`calendar.js:442`) with no handler. Clicking it changes nothing.

It was pinned by `calendar.spec.mjs`, now flipped.

## F10. Activity instructions failure says "Couldn't create the lesson"

**Fixed by HAR-13 (#18).** With no provider the button is replaced by the
"Needs a local AI provider" chip (`no-ai.spec.mjs`); with a provider that is
down, the instructions modal says "Harrington couldn’t reach the AI
provider…" with **Try again** (`ai-unreachable.spec.mjs` › "activity
instructions: the same message, not the lesson's wording (F10, fixed by
HAR-13)").

Original report: **Low.** With no provider, an activity's **Get instructions** shows
"Couldn't create the lesson right now." because it reuses the lesson's error
block with `unconfigured = false` (`lesson.js:217, 246`). The lesson itself
says "AI is not configured."; the other AI buttons each have their own
generic "try again" wording.

It was shown by the pre-HAR-13 `no-ai.spec.mjs`.

## F11. Selecting a skill scrolls the page to the top

**Fixed by HAR-21 (#23, `68a94c9`).** Selecting a skill keeps the page's scroll, the
selection is in the address (`?skill=`), and "Back to graph" from the topic
page returns to the same skill, selected, at the same scroll (`map.spec.mjs`).

Original report: **Low.** Every node click in the skill tree calls `navigate()`, which calls
`window.scrollTo({ top: 0 })` (`app.js:25`). The tree's own scroll position
is restored, but the page jumps up. (Audit §4.3.)

It was pinned by `map.spec.mjs`, now flipped.

## F12. Recent growth lists topics set back to "Not started"

**Low.** `recentActivity` (`mastery.js:115`) lists every topic with a
progress entry, including one a parent marked "Not started" again, so the
dashboard's Recent growth shows "One-to-one counting · Sprout · Not started".

Shown by `topic.spec.mjs` › "manual status: every transition… (finding F12)".

## F13. Notification bell has no accessible name

**Low.** The bell (`notifications.js:16`) has only a `title`. With an unread
badge its accessible name is the count ("1") instead of "Notifications", so
a screen reader announces "1, button".

Shown by `notifications.spec.mjs` › "the bell is named by its unread count,
not \"Notifications\" (finding F13)".

## F14. Icon-only delete and remove buttons have no accessible name

**Fixed by findings bundle B (#38).** The buttons are named for what they
act on: "Remove learner <name>", "Delete record <title>", "Delete recording
<title>" and "Remove extra <title>". On a phone every one of them is at
least 44 × 44 px: the learner row's placement, edit and remove buttons move
to a labeled line of their own (24 px icons on a desktop, as before), Switch
and Add are 44 px tall, the delete and remove buttons have a 44 px hit area
around the same icon, and the HAR-19 "Include my notes" checkbox is 20 px in
a 44 px label that ticks it. `learners`, `records` and `calendar` reach the
buttons by name; `mobile.spec.mjs` measures the targets at 390 px and checks
the learner menu at 360 px (no sideways scroll, no name cut off).

Original report: **Low.** The trash and x buttons for a learner (`shell.js:141`), a record
(`records.js:81`), a recording (`recordings.js:98`) and a calendar extra
(`calendar.js:224`) contain only an icon. The specs have to reach them by
position or class.

It was pinned by `learners.spec.mjs` › "the learner delete button is icon-only
with no accessible name (finding F14)", now flipped.

## F15. Dashboard says "1590 topics" where the map says "1,590"

**Fixed by findings bundle B (#38).** `formatCount` and `countLabel`
(`src/js/format.js`, `Intl.NumberFormat` and `Intl.PluralRules` for
`en-US`, since all copy is American English) print the counts on the
dashboard, the map, the topic page, the recordings folder, the import
preview and the curriculum notice; the hero reads "0 of 1,590 topics
mastered" and the map "Computing realm, 1 domain" (`dashboard.spec.mjs`,
`map.spec.mjs`, `tests/format.test.mjs`).

Original report: **Low.** The dashboard hero prints `stats.total` raw (`dashboard.js:46`); the
map and the notification use `toLocaleString()`.

It was pinned by `dashboard.spec.mjs` › "hero greeting and every dashboard
section…", which expected "0 of 1590 topics mastered"; now flipped.

## F16. The child-view PIN is stored and exported in plain text

**Fixed by findings bundle B (#38).** The family document keeps
`settings.parentPinHash`, a SHA-256 of the PIN with `settings.parentPinSalt`,
a random salt per family (a plain-JS SHA-256, which also works where a page
served over plain http on the home network has no Web Crypto). A plain
`parentPin` is hashed whenever a document is applied (load, a conflict
reload, import) and again at export, so no save writes it back and no export
carries one; a hash or salt that is not lowercase hex of the right length is
dropped.
`data-safety.spec.mjs` seeds a plain PIN and checks the export holds only the
hash; `child-view.spec.mjs` checks a newly set PIN is saved hashed;
`tests/pin.test.mjs` and `tests/family-data.test.mjs` cover the round trip
and the migration. SECURITY and both guides say a 4-digit PIN is a gentle
barrier, not a lock.

Original report: **Low.** HAR-15 keeps the parent PIN as `settings.parentPin` in the family
document. It is returned by `GET /api/state` and written into every
**Export** file, so anyone who can open the export (or the data folder) can
read it. The pull request calls the PIN a convenience rather than
authentication, and reloading the page leaves the child view anyway, so this
is a note for when authentication arrives rather than a defect today.

It was pinned by `data-safety.spec.mjs` › "export downloads the whole family
document as JSON, PIN included (finding F16)", now flipped.

## F17. A losing tab confirms a change, then discards it; a tab's own boot write can raise the conflict

**Medium.** Two problems around HAR-10's conflict reload, both visible in
`screenshots/data-safety/03-conflict-toast.jpg`, where the losing tab shows
"Another device saved changes. Reloaded the latest." twice with "Marked as
practicing" between them.

1. The status buttons (and every other edit) toast success at once
   (`topic.js:197`), and the save goes out 400 ms later. When that save gets
   412, `reloadFromServer` (`store.js:139`) replaces the state and the
   parent's change is gone. The parent was told "Marked as practicing", then
   "Another device saved changes"; nothing says their own change was not
   kept.
2. Opening the app writes the family document on boot when it adds the
   welcome notification or the curriculum snapshot. Two tabs opened close
   together both write; the second gets 412 and shows the conflict toast
   before the parent has done anything. That is the first toast in the
   screenshot.

These are two separate 412s, not one conflict reported twice. Request log
from the spec (version sent → server version): A boot write `v2` → 204
(`v3`); B boot write `v2` → 412, reload, toast; A status change `v3` → 204
(`v4`); B "Practicing" `v3` → 412, reload, toast, change discarded.

Repro: open Harrington in two windows side by side on a family without a
saved curriculum snapshot (or within a second of each other). Mark a topic in
window A, then mark a different topic in window B without reloading it.

Shown by `data-safety.spec.mjs` › "two tabs: the second save loses and
reloads the first one's data, after a success toast (finding F17)".

## F18. "Plant something new" in the child view offers a topic already in progress

**Low.** The child view's **Plant something new** button takes the first
result of `recommendedNext()` (`kidmode.js:190`), which ranks topics the
learner is already learning or practicing first (`mastery.js:68`). A child
practicing "One-to-one counting" is offered "One-to-one counting" as
something new.

Repro: set a topic to Practicing for a learner, open their child view and
read the Plant something new button.

Shown by `child-view.spec.mjs` › "\"Plant something new\" offers a topic
already in progress (finding F18)".

## F19. Without an AI provider the Calendar does not render (`gateAi is not defined`)

**Fixed by #29 (`8665fdc`)**, which restored the import and added
`tests/ai-status-imports.test.mjs` so a dropped import fails the unit tests.
`no-ai.spec.mjs` checks the calendar's chips again.

Original report: **High.** A regression on `main` from the HAR-18 merge (`428e9ea`). HAR-20
(#26) made the calendar's topic rows call `gateAi(lesson, { cachedKey })`
(`src/js/views/calendar.js:370`) and imported it; HAR-18's merge resolved the
import line to its own version, `import { aiUnavailableChip } from
'../ai-status.js';` (`calendar.js:12`), which drops `gateAi`. With a provider
configured the branch is never reached. Without one, any day with a
scheduled topic throws `ReferenceError: gateAi is not defined`: clicking
**Calendar** changes the URL to `#calendar` but the previous screen stays,
so a family without AI cannot open the calendar at all. The fix is adding
`gateAi` back to that import.

Repro: run the server without `HARRINGTON_AI_BASE_URL`, add a learner and
click **Calendar**; the console shows the error.

It was pinned by a `no-ai.spec.mjs` test marked (finding F19), now replaced
by the calendar checks in "quest log, calendar, insights, records and
recordings show chips".

---

## Fixed since the audit

The suite confirms these audit items now behave, and fails if they regress:

| Audit item | Now | Spec |
| --- | --- | --- |
| Removing a learner orphaned their tests, plan, game, etc. | HAR-10 clears every per-learner key | `data-safety` |
| Two tabs silently overwrote each other | The losing tab reloads and says "Another device saved changes. Reloaded the latest." | `data-safety` |
| No export or restore | Export and Import with a preview, on a phone from the learner selector (F6) | `data-safety`, `mobile` |
| Recall grading dropped the card's `topicId`, so due cards could not load | Every graded card keeps its `topicId`; "Review" opens the due card | `topic` |
| "Review answers → Back to result" re-saved the test and re-awarded XP | One test record per attempt | `topic` |
| Escape on the recorder left the microphone running | Escape asks "Discard this recording?"; Cancel keeps the microphone track live, OK ends every track the recorder opened | `records` |
| Child view: activities showed percentages, answer keys and badge popups (first run's F3) | HAR-15: tests, challenges and recall launched from the child view end with "All done, well tried!", no counts, no popups; "Plant something new" opens a child topic card; Grown-ups needs a PIN; the parent shell is inert | `child-view` |
| Topic page scrolled sideways on a phone (first run's F7) | HAR-14 moved the growth chip into a wrapping status row; every route now fits 390 px | `mobile` |
| Recordings folder labeled the unfiled group with a topic; manual "Recording" records had no audio (first run's F11) | HAR-16: groups by section, then topic, then "Not linked to a section"; the form no longer offers "Recording"; analysis from Records is saved on the record; records count toward the day's activity | `records` |
| No placement; mastery near 0% for older learners | HAR-14 placement from the learner menu or a subject card, with prerequisites, and undo from Records | `placement` |
| Recall cards were never cached (F1) | HAR-20: cached as `{ cards }`; a second recall opens from the cache | `topic` |
| Selecting a skill scrolled the page to the top (F11) | HAR-21: scroll and selection kept, also on return from the topic page | `map` |
| No calendar without a provider after a merge (F19) | #29 restored the import | `no-ai` |
| Discussion analysis and progress review sent the learner's name (F2) | HAR-19: names become "the child" before sending; notes need an opt-in | `records`, `insights` |
| Day-one refresher on untaught material (F5) | HAR-18: refreshers and activities only from mastered topics | `dashboard`, `calendar` |
| Calendar "Extra practice" opened a lesson (F8) | HAR-18: opens spaced practice | `calendar` |
| Dead "Refreshers change each day automatically" button (F9) | HAR-18 removed it | `calendar` |
| A failed lesson regenerate left a spinner (F7) | HAR-13: the plain-language error block with Try again | `topic` |
| Activity instructions failure reused the lesson's wording (F10) | HAR-13: chips with no provider; one set of messages (unreachable, timeout, provider error) everywhere | `no-ai`, `ai-unreachable` |
| AI buttons failed with "Couldn't … right now" when no provider was set up | HAR-13: "Needs a local AI provider" chips linking to the README; the dashboard and child view hide what needs AI | `no-ai` |
| The unlinked `#timeline` route | HAR-13 removed it; the URL now opens the dashboard | `map` |
| Export and Import not reachable on a phone (F6) | Findings bundle B: in the learner selector below `lg` | `mobile` |
| Icon-only buttons without a name (F14) | Findings bundle B: named for what they act on; 44 px targets on a phone | `learners`, `records`, `calendar`, `mobile` |
| "1590 topics" on the dashboard (F15) | Findings bundle B: one count and plural formatter (`en-US`) | `dashboard` |
| The PIN in plain text in the document and export (F16) | Findings bundle B: salted SHA-256 hash; plain PINs migrate on load and import | `data-safety`, `child-view` |
| Typed answers graded by substring | Not reachable with the digital tests the mock returns; covered by `tests/grading.test.mjs` | unit |
