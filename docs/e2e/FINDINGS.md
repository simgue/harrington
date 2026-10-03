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
#23), and F19, a regression from a merge that #29 fixed within the hour.
F3, F4, F12, F17 and F18 were fixed afterwards (e2e findings batch A). They are listed under
[Fixed since the audit](#fixed-since-the-audit); their entries below are kept
so the numbers stay stable.

## Summary

| # | Finding | Severity | Spec | Pending fix |
| --- | --- | --- | --- | --- |
| ~~F1~~ | ~~Recall cards are never cached: the server rejects them~~ | High | `topic` | Fixed by HAR-20 (`8311b03`) |
| ~~F2~~ | ~~Discussion analysis and progress review send the learner's name to the AI provider~~ | High | `records`, `insights` | Fixed by HAR-19 (`cffc6ab`) |
| ~~F3~~ | ~~A 3-year-old gets no daily choices and an "everything is mastered" message~~ | Medium | `dashboard` | Fixed by e2e findings batch A |
| ~~F4~~ | ~~The preview banner says AI is not connected even when it is~~ | Medium | `dashboard` | Fixed by e2e findings batch A |
| ~~F5~~ | ~~Day one offers a refresher quiz on a topic never taught~~ | Medium | `dashboard`, `calendar` | Fixed by HAR-18 (`428e9ea`) |
| F6 | Export and Import are not reachable on a phone | Medium | `mobile` | |
| ~~F7~~ | ~~A failed "Generate a different version" leaves a spinner forever~~ | Medium | `topic` | Fixed by HAR-13 |
| ~~F8~~ | ~~"Extra practice" on the calendar opens a lesson~~ | Medium | `calendar` | Fixed by HAR-18 (`428e9ea`) |
| ~~F9~~ | ~~"Refreshers change each day automatically" is a button that does nothing~~ | Low | `calendar` | Fixed by HAR-18 (`428e9ea`) |
| ~~F10~~ | ~~Activity instructions failure says "Couldn't create the lesson"~~ | Low | `ai-unreachable` | Fixed by HAR-13 |
| ~~F11~~ | ~~Selecting a skill scrolls the page to the top~~ | Low | `map` | Fixed by HAR-21 (`68a94c9`) |
| ~~F12~~ | ~~Recent growth lists topics set back to "Not started"~~ | Low | `topic` | Fixed by e2e findings batch A |
| F13 | Notification bell has no accessible name | Low | `notifications` | |
| F14 | Icon-only delete and remove buttons have no accessible name | Low | `learners`, `records`, `calendar` | |
| F15 | Dashboard says "1590 topics" where the map says "1,590" | Low | `dashboard` | |
| F16 | The child-view PIN is stored and exported in plain text | Low | `data-safety` | |
| ~~F17~~ | ~~A losing tab confirms a change, then discards it; a tab's own boot write can raise the conflict~~ | Medium | `data-safety` | Fixed by e2e findings batch A |
| ~~F18~~ | ~~"Plant something new" in the child view offers a topic already in progress~~ | Low | `child-view` | Fixed by e2e findings batch A |
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

**Fixed by e2e findings batch A.** `ageCeiling` (`daily.js`) never lets the
reach drop below the taxonomy's youngest band, so `recommendedNext` and the
daily lanes offer that band to a learner younger than it. The empty
stepping-stones copy says "Everything available is mastered" only when
`allReachableMastered` is true, and "Nothing is ready to start yet" otherwise.
`dashboard.spec.mjs` › "a 3-year-old gets the youngest band's daily choices
and stepping stones (F3, fixed)"; unit tests in `growth.test.mjs` and
`daily.test.mjs`.

Original report: **Medium.** `recommendedNext` and the daily lanes skip topics more than one
year above the learner's age (`mastery.js:65`); the taxonomy starts at 4–5,
so a 3-year-old has nothing. The dashboard shows no literacy or numeracy
choice and the stepping-stones card says "Everything available is mastered —
explore the map to go further." (`dashboard.js:99`), which is wrong for a
learner with nothing mastered. The child view's "Plant something new" says
"Ask a grown-up to choose".

Repro: add a learner born 2023, open the dashboard.

It was pinned by `dashboard.spec.mjs` (finding F3), now flipped. Screenshot: `screenshots/dashboard/05-dashboard-three-year-old.jpg`.

## F4. The preview banner says AI is not connected even when it is

**Fixed by e2e findings batch A.** The banner reads `store.aiAvailable()`
(from `/api/health`): "AI provider set up" or "No AI provider set up;
everything else works". A configured provider can still be unreachable, so
it never says "connected"; the per-feature chips carry the rest.
`dashboard.spec.mjs` › "the preview banner says an AI provider is set up…
(F4, fixed)", the no-provider line in `no-ai.spec.mjs` and the
`ai-unreachable.spec.mjs` check that it never says "connected".

Original report: **Medium.** The shell banner (`shell.js:96`) always reads "AI and
shared-family features are not connected yet", even when `/api/health`
reports `aiConfigured: true` and lessons work.

It was pinned by `dashboard.spec.mjs` (finding F4), now flipped.

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

**Medium.** HAR-10 put **Export** and **Import** in the desktop sidebar's
family box (`shell.js`, inside `aside.hidden.lg:flex`). Below the `lg`
breakpoint the sidebar is hidden and the phone top bar has no equivalent, so
a family using Harrington on a tablet or phone cannot back up or restore.

Shown by `mobile.spec.mjs` › "export and import are not reachable on a phone
(finding F6)".

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

**Fixed by e2e findings batch A.** `recentActivity` drops entries whose
status is not started (placement entries stay out, per HAR-14).
`topic.spec.mjs` › "manual status… (F12, fixed)"; unit test in
`growth.test.mjs`.

Original report: **Low.** `recentActivity` (`mastery.js:115`) lists every topic with a
progress entry, including one a parent marked "Not started" again, so the
dashboard's Recent growth shows "One-to-one counting · Sprout · Not started".

It was pinned by `topic.spec.mjs` (finding F12), now flipped.

## F13. Notification bell has no accessible name

**Low.** The bell (`notifications.js:16`) has only a `title`. With an unread
badge its accessible name is the count ("1") instead of "Notifications", so
a screen reader announces "1, button".

Shown by `notifications.spec.mjs` › "the bell is named by its unread count,
not \"Notifications\" (finding F13)".

## F14. Icon-only delete and remove buttons have no accessible name

**Low.** The trash and x buttons for a learner (`shell.js:141`), a record
(`records.js:81`), a recording (`recordings.js:98`) and a calendar extra
(`calendar.js:224`) contain only an icon. The specs have to reach them by
position or class.

Shown by `learners.spec.mjs` › "the learner delete button is icon-only with no
accessible name (finding F14)".

## F15. Dashboard says "1590 topics" where the map says "1,590"

**Low.** The dashboard hero prints `stats.total` raw (`dashboard.js:46`); the
map and the notification use `toLocaleString()`.

Shown by `dashboard.spec.mjs` › "hero greeting and every dashboard section
for a 6-year-old, refresher included (finding F5, finding F15)", which
expects "0 of 1590 topics mastered".

## F16. The child-view PIN is stored and exported in plain text

**Low.** HAR-15 keeps the parent PIN as `settings.parentPin` in the family
document. It is returned by `GET /api/state` and written into every
**Export** file, so anyone who can open the export (or the data folder) can
read it. The pull request calls the PIN a convenience rather than
authentication, and reloading the page leaves the child view anyway, so this
is a note for when authentication arrives rather than a defect today.

Shown by `data-safety.spec.mjs` › "export downloads the whole family document
as JSON, PIN included (finding F16)".

## F17. A losing tab confirms a change, then discards it; a tab's own boot write can raise the conflict

**Fixed by e2e findings batch A.** The store keeps the document as last
agreed with the server; on a 412, `reloadFromServer` compares it with the
tab's state (`diffDocuments`), reloads once and emits one `conflict` event
listing what was discarded. The shell shows one toast naming it ("Not kept
here: How Many in Total? marked practicing.") with **Try again** when the
change can simply be applied again (status changes, added records and
notes); the toast names up to three changes, then "and N more". Empty
containers created on read (such as `recall[learner]`) are not changes, and
changes for a learner removed elsewhere are not re-applied. The tab's own
bookkeeping (curriculum snapshot, welcome or curriculum notification, and a
day's daily offers written while rendering) is put back only where the
fresh document lacks it, silently, so two tabs opened together no longer
conflict. `data-safety.spec.mjs` › "two tabs: the losing tab says which
change it discarded…", "…from the dashboard…" and "two tabs opened together
on the dashboard…" (F17, fixed); unit tests in `store-conflict.test.mjs`.

Original report: **Medium.** Two problems around HAR-10's conflict reload, both visible in
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

It was pinned by `data-safety.spec.mjs` (finding F17), now flipped.

## F18. "Plant something new" in the child view offers a topic already in progress

**Fixed by e2e findings batch A.** `plantNext` (`mastery.js`) offers the
best unlocked topic not yet started; the one in progress comes back only
when nothing else is open, and the button then reads "Keep growing".
`child-view.spec.mjs` › "\"Plant something new\" offers a topic not yet
started… (F18, fixed)"; unit tests in `growth.test.mjs`.

Original report: **Low.** The child view's **Plant something new** button takes the first
result of `recommendedNext()` (`kidmode.js:190`), which ranks topics the
learner is already learning or practicing first (`mastery.js:68`). A child
practicing "One-to-one counting" is offered "One-to-one counting" as
something new.

Repro: set a topic to Practicing for a learner, open their child view and
read the Plant something new button.

It was pinned by `child-view.spec.mjs` (finding F18), now flipped.

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
| Two tabs silently overwrote each other | The losing tab reloads and names the change it did not keep, with Try again (F17) | `data-safety` |
| No export or restore | Export and Import with a preview (desktop only, see F6) | `data-safety` |
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
| A 3-year-old had no daily choices and "everything is mastered" (F3) | Batch A: the youngest band is offered; the mastered copy only when true | `dashboard` |
| The banner said AI was not connected when it was (F4) | Batch A: reads `/api/health`; says "set up", never "connected" | `dashboard`, `no-ai`, `ai-unreachable` |
| Recent growth listed topics set back to "Not started" (F12) | Batch A: dropped | `topic` |
| A losing tab confirmed, then silently discarded a change; boot writes raised conflicts (F17) | Batch A: one toast naming the discarded change, with Try again; boot writes never conflict | `data-safety` |
| "Plant something new" offered the topic in progress (F18) | Batch A: a topic not yet started, or "Keep growing" when nothing else is open | `child-view` |
| Day-one refresher on untaught material (F5) | HAR-18: refreshers and activities only from mastered topics | `dashboard`, `calendar` |
| Calendar "Extra practice" opened a lesson (F8) | HAR-18: opens spaced practice | `calendar` |
| Dead "Refreshers change each day automatically" button (F9) | HAR-18 removed it | `calendar` |
| A failed lesson regenerate left a spinner (F7) | HAR-13: the plain-language error block with Try again | `topic` |
| Activity instructions failure reused the lesson's wording (F10) | HAR-13: chips with no provider; one set of messages (unreachable, timeout, provider error) everywhere | `no-ai`, `ai-unreachable` |
| AI buttons failed with "Couldn't … right now" when no provider was set up | HAR-13: "Needs a local AI provider" chips linking to the README; the dashboard and child view hide what needs AI | `no-ai` |
| The unlinked `#timeline` route | HAR-13 removed it; the URL now opens the dashboard | `map` |
| Typed answers graded by substring | Not reachable with the digital tests the mock returns; covered by `tests/grading.test.mjs` | unit |
