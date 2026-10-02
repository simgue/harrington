# Harrington, screen by screen

A tour of the whole application as the end-to-end suite sees it: what each
screen is for, how to get there, what the parent (or child) sees, what the
tests assert and anything that surprised us. Every image below is produced by
the suite (`npm run e2e:ui-docs`), with the synthetic family from
`tests/e2e/support/family.mjs`: **Wren Example** (3), **Rowan Example** (6)
and **Sage Example** (9). Unless a section says otherwise the active learner
is Rowan.

The clock is pinned to **Wednesday 7 October 2026, 10:30 UTC**, so the
greetings, dates and the day's plan are the same in every run. AI-backed
screens were captured against the deterministic mock provider described in
[README.md](README.md#the-mock-ai-provider); the text in them is canned.

Videos of the same flows (not in Git; produced in `docs/e2e/recordings/` and
uploaded by CI): `walkthrough-parent.webm` (first run to insights, about 80
seconds), `walkthrough-child-view.webm` and `walkthrough-mobile.webm` (about
25 seconds each).

Defects are numbered as in [FINDINGS.md](FINDINGS.md); coverage of every
audit feature is in [COVERAGE.md](COVERAGE.md).

**Contents:**
[First run](#1-first-run) ·
[Learners and placement](#2-learners-and-placement) ·
[Dashboard](#3-dashboard) ·
[Child view](#4-child-view) ·
[Map](#5-map) ·
[Topic page](#6-topic-page) ·
[Lessons, tests and recall](#7-lessons-tests-and-recall) ·
[Calendar](#8-calendar) ·
[Records and recordings](#9-records-and-recordings) ·
[Insights](#10-insights) ·
[Notifications and guide](#11-notifications-and-guide) ·
[Data safety](#12-data-safety) ·
[Without an AI provider](#13-without-an-ai-provider) ·
[Mobile](#14-mobile)

---

## 1. First run

**Purpose.** Create the first learner. There is no account.
**How to reach it.** Open Harrington on a server with no family data.

The form asks for a name, an optional birth month and a birth year (1990 to
the current year, HAR-22) and says the app runs on this computer only. With a
month the age is exact; without it, age counts from January.

| Empty | Filled in |
| --- | --- |
| ![First-run form](screenshots/onboarding/01-first-run-form.jpg) | ![Filled in](screenshots/onboarding/02-first-run-form-filled.jpg) |

After "Set up their learning space" a toast confirms the learner and the
dashboard opens. About half a second later the **welcome tour** appears: ten
slides (Welcome, Dashboard, Child view, Map, Growth stages, Calendar, Records
& recordings, Insights, Lessons tests & more, Guide). Every slide about an
AI-backed feature says "Needs a local AI provider; see the README."

| Tour, first slide | The AI slide |
| --- | --- |
| ![Welcome tour](screenshots/onboarding/03-welcome-tour-first-slide.jpg) | ![AI slide](screenshots/onboarding/04-welcome-tour-ai-slide.jpg) |

**What the tests assert** (`onboarding.spec.mjs`): the copy; the form is
required; the learner reaches the server with today's start date; the tour
opens once, Next walks all slides, Back works, the last button is "Start
learning", Skip also closes it, and after a reload it does not come back
(`localStorage` `harrington:welcomeSeen`). No console errors.

---

## 2. Learners and placement

**Purpose.** Several children in one family, and a quick way to mark what an
older child already knows.
**How to reach it.** The learner button at the top of the sidebar (the round
initials button on a phone).

The **Students** menu lists each learner with age and birth month and year,
the active one marked, a Switch button for the others, and placement, edit
and delete buttons. **Add** opens a short form (name, optional birth month,
birth year); a new learner becomes the active one. **Edit** (HAR-22) changes
the name, birth month and year, and the avatar color.

| Three learners | After removing one |
| --- | --- |
| ![Learner switcher](screenshots/learners/01-student-switcher-three-learners.jpg) | ![After remove](screenshots/learners/02-student-switcher-after-remove.jpg) |

![Edit learner](screenshots/learners/03-edit-learner.jpg)

**Placement** (HAR-14) opens from the list-check button on a learner row or on
a dashboard subject card. It picks a subject, an area (whole subject or one
domain) and "Up to age" (defaulting to the learner's age minus one), shows how
many topics would be marked mastered, and offers to include the hard
prerequisites they depend on (recommended). Confirming saves one record that
can be undone from Records.

| Placement for a 9-year-old | Dashboard after placement |
| --- | --- |
| ![Placement modal](screenshots/placement/01-placement-modal.jpg) | ![After placement](screenshots/placement/02-dashboard-after-placement.jpg) |

**What the tests assert** (`learners.spec.mjs`, `placement.spec.mjs`): add two
learners; switch; the active learner survives a reload; remove asks first
(Cancel keeps, OK removes) and HAR-10 now clears all of that learner's data
(`data-safety.spec.mjs`). Placement from a subject card and from the learner
menu, area and age filters, prerequisites on and off (fewer topics, with a
warning), the toast count matches the saved progress, every entry is tagged
`source: 'placement'`, and **Undo placement** returns Mathematics to 0/503.
Editing: the form opens filled in, a December birth month makes a 6-year-old
5 on 7 October, the new name and month reach the server and show in the hero
and the menu ("born December 2020").

**Caveats.** The delete button is an unlabeled icon (F14).

---

## 3. Dashboard

**Purpose.** The parent's view of the day.
**How to reach it.** Dashboard in the navigation; the default route.

![Dashboard for a 6-year-old](screenshots/dashboard/01-dashboard-six-year-old.jpg)

From top to bottom:

- **Hero**: greeting by time of day, "Rowan Example's Wednesday", the date,
  age and topics mastered, and four actions: Record what happened, Note, Open
  map, and the child view button.
- **Today's path**: a literacy and a numeracy choice with two options each
  (the child picks one; the arrow opens the topic), today's topics **from the
  calendar**, a **refresher quiz** once something is mastered (HAR-18), and
  **Record what happened** (Voice or
  Note). Once the child picks, the lane asks "How did it go?" with its own
  Voice and Note; their forms offer an opt-in "Mark curriculum coverage for
  …" checkbox, and a record that claims it turns the lane's line into
  **Evidence recorded** (HAR-17). A parent-only "Not yet: X needs Y first"
  line says which nearby topics are still locked.
- **Week** flowers and the **overall mastery** ring ("Only you can see this").
- **Interests** (HAR-17): suggestion chips, the parent's own chips and a
  free-text note per learner. Nothing uses them yet.
- **Stepping stones next**: four unlocked topics near the learner's age.
- **Active recall** and **Spaced practice** cards, which show a due count when
  something is due.
- **Subjects**: one card per subject with a petal ring, "n/total mastered",
  percent, growth stage, and a placement button.
- **Level** card with XP and the twelve badges, and the **Recordings folder**.
- **Recent growth** (topics whose status changed) and **Recent evidence**
  (latest records).
- The Marble Skill Taxonomy attribution.

| A pick made | 9-year-old | 3-year-old |
| --- | --- | --- |
| ![Literacy picked](screenshots/dashboard/02-today-path-literacy-picked.jpg) | ![Age 9](screenshots/dashboard/06-dashboard-nine-year-old.jpg) | ![Age 3](screenshots/dashboard/05-dashboard-three-year-old.jpg) |

| Spaced practice, nothing due | Recordings folder, empty |
| --- | --- |
| ![Spaced practice empty](screenshots/dashboard/03-spaced-practice-empty.jpg) | ![Recordings folder empty](screenshots/dashboard/04-recordings-folder-empty.jpg) |

| A pick with evidence recorded | Interests |
| --- | --- |
| ![Evidence recorded](screenshots/dashboard/07-pick-evidence-recorded.jpg) | ![Interests](screenshots/dashboard/08-interests-card.jpg) |

**What the tests assert** (`dashboard.spec.mjs`): every section above for ages
6 and 9; pick, unpick and re-pick a choice, the day's offers and picks saved
on the server, the pick survives a reload and shows in the child view;
calendar stop, pick arrow, stepping stone and subject card all navigate; Voice
and Note open the recorder and the record form; empty recall and practice
states; the recordings folder; no console errors. HAR-17: the coverage
checkbox is unchecked by default; a note without the claim is linked to the
pick (`source.kind: 'daily-pick'`, key `date|lane|topic`) but leaves "How did
it go?"; a claimed note saves `coverage` and shows Evidence recorded;
interest chips (suggested and custom) and the note are saved per learner.

**Caveats.**
- A 3-year-old gets no daily choices and no stepping stones, and the card
  says "Everything available is mastered" (F3).
- The yellow banner says AI is "not connected yet" even when it is (F4).
- "0 of 1590 topics" is not formatted like the map's "1,590" (F15).

---

## 4. Child view

**Purpose.** A score-free screen for the child: their garden, today's picks,
a few activities and a voice note.
**How to reach it.** The button with the child's name in the dashboard hero.
It covers the whole screen; the parent app underneath is inert.

![Child view](screenshots/child-view/01-child-view.jpg)

The child sees a greeting, one line of encouragement from real progress,
**Story time** and **Number time** picks, four big buttons (**Plant something
new**, **Memory walk**, **Beat the clock**, **My collection**), **Tell about
my day**, and **My garden**: one plant per subject described in words
(Planted, Sprouting, Budding, In bloom), never numbers.

Tapping a pick, or Plant something new, opens the **child topic card**
(HAR-15): the topic's mastery evidence rewritten as "Can you…?" questions,
activities to try with a grown-up, and **Tell about it** (a recording linked
to the topic).

| Child topic card | My collection | Challenge result |
| --- | --- | --- |
| ![Topic card](screenshots/child-view/04-child-topic-card.jpg) | ![Collection](screenshots/child-view/05-child-view-collection.jpg) | ![All done](screenshots/child-view/07-child-challenge-result.jpg) |

**Tell about my day** opens the recorder for a voice note from the child.

![Tell about my day](screenshots/child-view/06-child-view-tell-about-my-day.jpg)

**Grown-ups** leads back to the parent view through a 4-digit PIN. The first
time, the parent sets it (typed twice); after that it is required. A wrong PIN
keeps the child view open; reloading the page is the documented way out if it
is forgotten.

| Set a PIN | Wrong PIN |
| --- | --- |
| ![Set PIN](screenshots/child-view/02-set-pin.jpg) | ![Wrong PIN](screenshots/child-view/03-wrong-pin.jpg) |

**What the tests assert** (`child-view.spec.mjs`): no `%`, `XP`, `Level` or
"n/m" anywhere in the overlay, the topic card, a whole challenge or a recall
session; no badge, level-up or XP popups; results (8/8, XP) are still saved
for the parent. `#app` is `inert` and `aria-hidden` while it is open. Picks
show on the dashboard. PIN: too short, mismatch, wrong PIN, Back, and the PIN
saved to `settings.parentPin`. Beat the clock without a bloom shows "Grow a
bloom to unlock challenges!".

**Caveats.** The PIN is stored and exported in plain text (F16). A
3-year-old's Plant something new says "Ask a grown-up to choose" (F3); for
an older child it offers a topic already in progress (F18).

---

## 5. Map

**Purpose.** The connected curriculum as a map (Visual) or as lists (List).
**How to reach it.** Map in the navigation, or "Open map" on the dashboard.

The **world map** shows eight subject realms sized by topic count, with dots
for their domains and a quiet tint for mastery. Clicking (or pressing Enter
on) a realm or a dot opens that domain's **skill tree**.

![World map](screenshots/map/01-world-map.jpg)

The skill tree draws topics as plants (Seed locked, Sprout ready, Bud in
progress, Bloom mastered), solid lines for required foundations and dashed
for helpful ones, with neighboring domains as gateways.

![Skill tree](screenshots/map/02-skill-tree-default-domain.jpg)

Selecting a topic opens the **quest log**: its stage, why it is or is not
ready, required foundations and what it unlocks (both clickable), and Open
full lesson, Open topic page, Record evidence, Mark as learning and Mark as
mastered.

| Ready topic | Locked topic |
| --- | --- |
| ![Quest log ready](screenshots/map/03-quest-log-ready.jpg) | ![Quest log locked](screenshots/map/04-quest-log-locked.jpg) |

**List** drills from subject to domain to age band to topic, each level with a
parent-only "n of m mastered" bar, and topics showing their stage and
prerequisites. The Visual/List choice is saved with the family.

| Subjects | Age bands | Topics in a band |
| --- | --- | --- |
| ![List subjects](screenshots/map/05-list-subjects.jpg) | ![Age bands](screenshots/map/06-list-domain-age-bands.jpg) | ![Section topics](screenshots/map/07-list-section-topics.jpg) |

**What the tests assert** (`map.spec.mjs`): eight realms with domain counts,
mouse and keyboard; legend; node states; a locked node explains its
foundations, highlights the blocker and cannot be marked; Record evidence
saves a linked record; Mark as learning turns the node into a bud and shows on
the dashboard; Mark as mastered blooms it and unlocks the next skill; list
drill-down and breadcrumbs; the view choice survives a reload. The old
`#timeline` route was removed by HAR-13 and now opens the dashboard.
HAR-21: selecting a skill keeps the page where it is, the selection is in the
address, and Back to graph from the topic page returns to the same skill,
selected, at the same scroll.

---

## 6. Topic page

**Purpose.** Everything about one topic for the parent.
**How to reach it.** From the quest log, a stepping stone, a calendar day,
a record's topic link, Insights, or any connection.

![Topic page](screenshots/topic/01-topic-page.jpg)

- **Header**: subject, domain, ages and type, then the growth stage beside
  **Set status** (Not started, Learning, Practicing, Mastered), which the
  parent sets directly (HAR-14).
- **Ready-to-teach lesson** with Open full lesson and Print & go.
- **Topic mastery test**, **What mastery looks like** (the taxonomy's
  evidence), **Quick check**, **Active recall**, **AI teaching helper**
  (Explain simply, Make a mini-quiz), **Activities & games** (static ideas,
  each with "Get instructions"), **Records for this topic** (Record, Add).
- Side column: **Section check** (locked until every topic in the section is
  mastered), **Section recordings**, **How this connects** (what comes before
  and what it unlocks) and **Reference materials** (Khan Academy, BBC
  Bitesize, Wikipedia and two YouTube searches).

| A locked topic | Mastered by hand |
| --- | --- |
| ![Locked](screenshots/topic/02-topic-page-locked.jpg) | ![Mastered](screenshots/topic/04-topic-mastered-manually.jpg) |

| Set status (HAR-14) | Records for this topic |
| --- | --- |
| ![Set status](screenshots/topic/03-manual-status-control.jpg) | ![Topic records](screenshots/topic/05-topic-records.jpg) |

**What the tests assert** (`topic.spec.mjs`): header, evidence, quick check;
three unlocks that navigate, and the prerequisite seen from the other side
with a locked banner; five reference links open in a new tab with
`rel="noopener"`; each status change updates the chip, the toast, the section
count, the dashboard's hero count, Mathematics card and Recent growth; a
record added here appears here and on the server with its rating; Record and
Record for this section open the recorder linked to the topic or section.

**Caveats.** A topic set back to "Not started" stays in Recent growth (F12).

---

## 7. Lessons, tests and recall

These need an AI provider. With the mock provider:

**Full lesson.** Objective and duration, materials, notes for the parent
(focus, struggles, advice), a hook, teaching steps with what to say and do,
practice together, an independent activity, questions, mistakes to watch,
a mastery check, an extension and a Print & go shortcut. It is generated once
and cached on the server: after a reload the lesson comes from
`/api/lessons/topic:<id>` and the provider is not called again.

| Lesson | Print & go preview | Explain simply |
| --- | --- | --- |
| ![Lesson](screenshots/topic/06-lesson-plan.jpg) | ![Print & go](screenshots/topic/07-print-and-go-preview.jpg) | ![Explain](screenshots/topic/09-explain-simply.jpg) |

**Topic mastery test.** Choose On screen (recommended for math) or On paper /
hands-on, then "Create the test". The app asks the provider for a test, then
asks again to re-solve every question independently and keeps only questions
both agree on. On screen, a 100% pass marks the topic mastered, offers the
challenge and records exactly one result even after Review answers → Back. On
paper, the parent ticks what the child got right; the live score turns into
the result, and missed questions join **spaced practice**.

| Test intro | Answered | Passed |
| --- | --- | --- |
| ![Intro](screenshots/topic/11-mastery-test-intro.jpg) | ![Answered](screenshots/topic/12-mastery-test-answered.jpg) | ![Passed](screenshots/topic/13-mastery-test-passed.jpg) |

| Paper grading | Spaced practice retry | Section check ready |
| --- | --- | --- |
| ![Paper](screenshots/topic/18-paper-test-grading.jpg) | ![Practice](screenshots/topic/19-spaced-practice-correct.jpg) | ![Section](screenshots/topic/20-section-check-ready.jpg) |

**Activity instructions.** "Get instructions" on an activity or game asks the
provider for materials, setup, steps, an example and a tip.

![Activity instructions](screenshots/topic/10-activity-instructions.jpg)

**Challenge.** A two-minute, eight-question stretch for a mastered topic; the
best score shows on the topic page.

![Challenge intro](screenshots/topic/14-challenge-intro.jpg)

**Active recall.** Cards answered from memory, with a hint, graded Missed it,
Got it or Easy. Ungraded cards stay due today; graded ones come back on a
Leitner schedule (the dashboard shows "2 due" the next day).

| Challenge | Recall card | Due on the dashboard |
| --- | --- | --- |
| ![Challenge](screenshots/topic/15-challenge-result.jpg) | ![Recall](screenshots/topic/16-recall-card-answer.jpg) | ![Due](screenshots/topic/17-dashboard-recall-due.jpg) |

**What the tests assert** (`topic.spec.mjs`, `insights.spec.mjs`): the
sequence of provider calls for each tool (from the mock's log), that the
server always sends the configured model, that none of these prompts contains
the learner's name, every section of the lesson, caching, test results saved
with scope, mode and percent, a section check that unlocks after the last of
nine topics is mastered and passes, and a final subject test that unlocks
when every section is passed.

When the provider fails, the tool says what went wrong in plain words and
offers **Try again** (HAR-13); a failed "Generate a different version" no
longer leaves a spinner (F7, fixed).

![Regenerate failed](screenshots/topic/08-regenerate-failed.jpg)

**Caveats.** Recall cards are never cached because the server refuses arrays
(F1).

---

## 8. Calendar

**Purpose.** A plan of home learning days from the learner's start date,
which the parent can bend.
**How to reach it.** Calendar in the navigation, or "Open calendar" on the
dashboard.

![Calendar](screenshots/calendar/01-calendar-month.jpg)

A Monday-first month grid shows each day's topics (dots on a phone), extras
("+n") and done days. The day panel lists **New today** (each with Lesson,
Test and Move), **Extra practice** added by the parent, and **Daily
refreshers & extras**: a refresher quiz and an activity or game about a
mastered topic (before anything is mastered, a line says they start once
something is), and a stretch topic. **Extra practice** opens spaced
practice.

**Home days & breaks** (HAR-18) sets the family's learning weekdays (Monday
to Friday by default) and named breaks. Other weekdays and breaks are rest
days: nothing is scheduled, there is no Mark done and no refreshers, and the
track picks up on the next home day. A new learner's first days start with
an on-ramp of earlier foundation topics.

![Home days and breaks](screenshots/calendar/02-calendar-home-days-and-breaks.jpg)

| Add an extra | Extras on a day | Move a topic |
| --- | --- | --- |
| ![Add extra](screenshots/calendar/03-calendar-add-extra.jpg) | ![Extras](screenshots/calendar/04-calendar-extras.jpg) | ![Move](screenshots/calendar/05-calendar-move-topic.jpg) |

**What the tests assert** (`calendar.spec.mjs`): the start date and month;
previous, next and Today; rest (weekend) and outside-track days; changing the
start date reschedules; Mark done and reopen; each of the four extra kinds
(and the "pick a topic first" guard), the day's "+4", removing one, Extra
practice opening spaced practice; moving a topic to the next home day and to
a chosen date; no refresher before anything is mastered and refresher and
activity about the mastered topic after; every card's button opens its tool
and the old dead footer button is gone; Wednesdays off plus a "Fall break"
turn today into a rest day, the break days read "Break · Fall break", today's
topic moves to Thursday, and the settings are saved.

**Caveats.** The on-ramp order is not asserted.

---

## 9. Records and recordings

**Purpose.** Evidence of what happened: notes, observations and recordings.
**How to reach it.** Records in the navigation; Note, Voice and Record
buttons on the dashboard, topic page and quest log; the Recordings folder on
the dashboard.

Records are an Observation, Question, Discussion or Assessment, with an
optional linked topic, title, notes and a 1–5 confidence rating. The list
filters by type. Discussions and recordings offer **Analyze & get advice**
(AI); the analysis is saved on the record and can also be saved as an advice
record. Learner names are replaced with "the child" before anything is sent,
and the parent's notes go only when "Include my notes in this request" is
ticked (HAR-19); a note-only record's Analyze button waits for that box.

| New record | Records |
| --- | --- |
| ![Record form](screenshots/records/01-record-form.jpg) | ![Records list](screenshots/records/02-records-list.jpg) |

The **recorder** records from the microphone with a timer and (in browsers
that support it) a live transcript, then offers a preview, a topic link, a
title, notes and an editable transcript before saving the audio on the
server.

| Ready | Recording | Review |
| --- | --- | --- |
| ![Idle](screenshots/records/03-recorder-idle.jpg) | ![Recording](screenshots/records/04-recorder-recording.jpg) | ![Review](screenshots/records/05-recorder-review.jpg) |

The **Recordings folder** groups recordings by section, then by topic, then
"Not linked to a section" (HAR-16), with playback, transcript, analysis and
delete.

| Recordings folder | Discussion analysis |
| --- | --- |
| ![Folder](screenshots/records/06-recordings-folder.jpg) | ![Analysis](screenshots/records/07-discussion-analysis.jpg) |

**What the tests assert** (`records.spec.mjs`): the form offers exactly the
four types; a title or note is required; each type saves with its rating and
topic; filters; topic link; delete with confirm; a saved record marks the day
active. With Chromium's fake microphone: start, a four-second take, stop,
preview, link, transcript, save, the audio stored on the server with an audio
content type and played back. Escape mid-take asks before discarding. Folder
grouping, playback and delete (which removes the audio file). Analysis from
both places is saved and survives a reload. HAR-19: Analyze is disabled on a
note-only discussion until the box is ticked; with learner names written into
the note and the transcript, the mock provider receives "the child" and
"the child's", and no learner's name.

**Caveats.** Delete
buttons are unlabeled icons (F14). Live transcription uses the browser's
speech service and is not exercised by the suite.

---

## 10. Insights

**Purpose.** Subject by subject: how far along, what next, and (with AI) a
written review.
**How to reach it.** Insights in the navigation.

![Insights](screenshots/insights/01-insights-mathematics.jpg)

Subject chips switch the page. Each subject shows its percent mastered and
counts of Mastered, Practicing, Learning and Not started; the **final mastery
test** (locked until every section check is passed); a **Progress review**
(AI, with the same name replacement and notes opt-in as Records); and
**Recommended next** topics. Approved **adaptive suggestions** to
pitch a domain harder appear at the top, with a banner on the dashboard.

| Progress review | Final test passed | Adaptive suggestion |
| --- | --- | --- |
| ![Review](screenshots/insights/02-insights-progress-review.jpg) | ![Final](screenshots/insights/03-final-test-passed.jpg) | ![Suggestion](screenshots/insights/04-adaptive-suggestion.jpg) |

**What the tests assert** (`insights.spec.mjs`): the eight chips; counts that
match seeded progress; a recommendation opens its topic; the final test is
locked, then unlocks when every Mathematics section is passed, passes, and
offers "Mark all Mathematics topics as mastered" (100% afterwards) and a
certificate; a suggestion is approved (adaptation saved) and undone; the
progress review's prompt carries no learner name, leaves the note out until
the box is ticked, and then carries it with "the child".

---

## 11. Notifications and guide

**Notifications** (the bell beside the logo, or in the phone's top bar) list
family-wide news. On first run there is one: "Your curriculum is ready". A
curriculum that changed since the last visit adds "Curriculum updated — n new
topics".

| Unread | Curriculum update |
| --- | --- |
| ![Notifications](screenshots/notifications/01-notifications-unread.jpg) | ![Updated](screenshots/notifications/02-curriculum-updated.jpg) |

The **Guide** (sidebar, or the book icon on a phone) summarizes what works
today and what needs AI, replays the tour, prints the full guide and
downloads `GUIDE.md`.

| Guide | Printable guide |
| --- | --- |
| ![Guide](screenshots/notifications/03-guide-full.jpg) | ![Printable guide](screenshots/onboarding/05-printable-guide.jpg) |

**What the tests assert** (`notifications.spec.mjs`, `onboarding.spec.mjs`):
one welcome item and a "1" badge; Mark all read clears it; a second boot adds
nothing; clicking one marks only that one; the empty state; an older saved
curriculum snapshot raises the update item; the guide has ten entries and
replays the tour; the printable guide opens in a new window; `GUIDE.md` is
served.

**Caveats.** The bell's accessible name is its unread count (F13).

---

## 12. Data safety

**Purpose.** Keep family data safe across tabs, devices and restores (HAR-10).
**How to reach it.** **Export** and **Import** in the family box at the bottom
of the desktop sidebar.

| Export and Import | Import preview |
| --- | --- |
| ![Sidebar](screenshots/data-safety/01-sidebar-export-import.jpg) | ![Import preview](screenshots/data-safety/02-import-preview.jpg) |

Export downloads `harrington-family-<date>.json`: the whole family document
with `exportedAt` and `taxonomyVersion` (no recordings). Import checks the
file, previews each learner's topics, records and tests, and replaces the
family data only after "Replace family data". Every save carries the version
it started from; if another tab or device saved first, the losing tab reloads
the latest data and says so.

![Conflict toast](screenshots/data-safety/03-conflict-toast.jpg)

**What the tests assert** (`data-safety.spec.mjs`, `api.spec.mjs`): the export
file name and contents; a round trip (the exported file, imported back after
the family changed: preview, cancel, confirm, the same document restored,
reload) and refusal of non-JSON, non-export and malformed learner files; two
tabs: the second save loses, shows the toast, shows the first tab's change
and does not merge its own; removing a learner clears every per-learner key.
Over HTTP: 428 without `If-Match`, 400 for a malformed one, a new `ETag` on
success, 412 with the current document when stale, 403 for a cross-site
write, `stateVersion`/`stateBytes` in health, and the unload beacon's POST
(version in the body; 415 for `text/plain`, 403 cross-site, 412 stale).

**Caveats.** Export and Import are not reachable on a phone (F6). The PIN
travels in the export (F16). The losing tab first confirms the parent's
change, then discards it, and a tab's own boot write can lose too: the
screenshot shows the conflict toast twice (F17).

---

## 13. Without an AI provider

**Purpose.** Harrington works without AI; it should say so honestly
(HAR-13).
**How to reach it.** Run the server without `HARRINGTON_AI_BASE_URL` (the
`no-ai` project), or with a provider that is not running (the
`ai-unreachable` project).

With no provider configured, every AI-backed control is replaced by a quiet
**Needs a local AI provider** chip that opens the README's local-model
section in a new tab. Nothing is generated and nothing is saved as a result.
Everything else (status, records, planning, the map) works as usual.

| Topic page | Calendar day |
| --- | --- |
| ![Topic chips](screenshots/no-ai/01-topic-chips.jpg) | ![Calendar chips](screenshots/no-ai/02-calendar-chips.jpg) |

On the calendar, topic rows show a chip in place of Lesson (Test is hidden)
and the refresher, activity and stretch cards show chips; Move still works.
(For about an hour on 2 October a merge broke this page without a provider,
F19; #29 fixed it.)

| Progress review | Records |
| --- | --- |
| ![Insights chip](screenshots/no-ai/03-insights-chip.jpg) | ![Records chips](screenshots/no-ai/04-records-chips.jpg) |

The dashboard hides the refresher stop and disables the recall card with
"Recall cards need a local AI provider."; the child view simply leaves out
Memory walk and Beat the clock, with no provider wording in front of the
child.

| Dashboard | Child view |
| --- | --- |
| ![Dashboard](screenshots/no-ai/05-dashboard-no-ai.jpg) | ![Child view](screenshots/no-ai/06-child-view-no-ai.jpg) |

When a provider is configured but not running, the controls stay and a
failure says "Harrington couldn’t reach the AI provider. Check that it’s
running, then try again.", with **Try again**; the server's own error text
is never shown.

| AI helper | Full lesson |
| --- | --- |
| ![Helper unreachable](screenshots/ai-unreachable/01-helper-unreachable.jpg) | ![Lesson unreachable](screenshots/ai-unreachable/02-lesson-unreachable.jpg) |

**What the tests assert** (`no-ai.spec.mjs`, `ai-unreachable.spec.mjs`):
`/api/health` reports `aiConfigured`; `/api/ai` answers 503 with no provider
and 502 "unreachable" with a dead one. With no provider: no AI button on the
topic page (lesson, Print & go, helper, recall, test, challenge, activity
instructions), one chip per section and per activity, every chip links to
`README.md#optional-local-model-ollama` with `target="_blank"` and
`rel="noopener"` and opens it in a new tab; no "Couldn't … right now" or
"Try again" anywhere; no test or challenge saved; chips in the quest log,
the progress review and records; a saved analysis still shows without
Regenerate; the dashboard and child view as above; the guide labels AI
features; on the calendar a chip per topic and on the stretch card, Move
still there. With an unreachable provider: no chips, the message
above in the helper and the lesson, Try again fails the same way without
stacking, no "Writing…" spinner.

---

## 14. Mobile

At 390×844 the sidebar becomes a top bar (logo, guide, bell, learner) and a
bottom navigation with five tabs. Every route fits the screen without
scrolling sideways.

| Dashboard | Calendar | World map | Skill tree |
| --- | --- | --- | --- |
| ![Dashboard](screenshots/mobile/01-dashboard.jpg) | ![Calendar](screenshots/mobile/02-calendar.jpg) | ![World map](screenshots/mobile/03-world-map.jpg) | ![Skill tree](screenshots/mobile/04-skill-tree.jpg) |

| Topic | Records | Insights | List |
| --- | --- | --- | --- |
| ![Topic](screenshots/mobile/05-topic.jpg) | ![Records](screenshots/mobile/06-records.jpg) | ![Insights](screenshots/mobile/07-insights.jpg) | ![List](screenshots/mobile/08-list-section.jpg) |

| Child view | Quest log | Guide | Learners |
| --- | --- | --- | --- |
| ![Child view](screenshots/mobile/09-child-view.jpg) | ![Quest log](screenshots/mobile/10-quest-log.jpg) | ![Guide](screenshots/mobile/11-guide.jpg) | ![Learners](screenshots/mobile/12-learner-switcher.jpg) |

**What the tests assert** (`mobile.spec.mjs`): no horizontal overflow on the
dashboard, calendar, world map, skill tree, topic page, records, insights,
list view, child view and quest log, with no console errors; the bottom tabs
navigate and mark the current page; the top-bar guide and learner switcher
open.

**Caveats.** No Export or Import on a phone (F6).

---

## After a day

The parent walkthrough ends on the dashboard after a learner was added, a
choice picked, a topic marked as learning and then mastered by test, a
challenge and a recall session done, the calendar day marked and an extra
added, a discussion recorded and analyzed, a voice note saved and a review
generated:

![Dashboard after a day](screenshots/walkthrough/01-dashboard-after-a-day.jpg)
