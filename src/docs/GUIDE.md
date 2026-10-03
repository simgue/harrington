# Harrington guide

Harrington is a self-hosted family learning platform. It shows the open
[Marble Skill Taxonomy](https://github.com/withmarbleapp/os-taxonomy) (about
1,590 connected topics across 8 subjects) as a map for parents, offers small
daily literacy and numeracy choices, and keeps a record of what your child
actually did.

By default it runs on this computer only. It can also be shared from one host
computer with your other devices, so tablets and phones open it in a browser;
[DEPLOYMENT.md](https://github.com/simgue/harrington/blob/main/docs/DEPLOYMENT.md)
has the steps. Family data stays on the computer that runs Harrington unless you
configure an AI provider.

The in-app **Guide** (sidebar on a computer, book icon at the top of the screen
on a phone) covers the same ground in short form. This file is the longer
written version.

> **Needs a local AI provider; see the README.** This line marks every feature
> that is written by an AI model. Without a provider those buttons show an
> error and nothing else happens. See "What needs an AI provider" at the end.

---

## Getting started

1. **Start Harrington.** Run `npm start` and open `http://127.0.0.1:4173`.
   There is no account and no sign-in. The first start downloads the
   curriculum, so it needs the internet once.
2. **Add a learner.** Enter a name, birth year and, optionally, birth month.
   Harrington uses the age to suggest age-appropriate topics and to build the
   calendar; with the month the age is exact. Edit a learner's name, birthday
   or color later with the pencil button in the learner selector.
3. **Look around.** The sidebar (or the bottom bar on a phone) has
   **Dashboard, Calendar, Map, Records** and **Insights**. **Guide** is in the
   sidebar, or behind the book icon on a phone. The **child view** opens from
   the dashboard.

Add or switch learners from the selector at the top of the sidebar (the round
button at the top right on a phone). Each learner keeps their own progress,
calendar, records and recordings.

---

## Dashboard

The parent's view of the day.

- **Today's path.** A short literacy choice and a short numeracy choice, two
  options each, drawn from the focus domains in
  [POC-SPINE.md](https://github.com/simgue/harrington/blob/main/docs/POC-SPINE.md). Topics already in progress and
  domains that have gone quiet come first. Your child picks one of each, here
  or in the child view, and the day's options and picks are saved. Very young
  learners may get a gentle review day instead.
- **From the calendar.** Topics scheduled for today. Opening a lesson or a
  refresher quiz from here needs a local AI provider.
- **Stepping stones next.** Unlocked, age-appropriate topics to try next.
- **Subjects, recent growth and recent evidence.** Per-subject progress, recent
  status changes and the latest records. The parent view shows numbers by
  design ("Only you can see this").
- **Quick buttons.** **Record what happened** (voice), **Note**, **Open map**,
  and a button with your child's name that opens the child view.

## Child view

Opened from the button with your child's name on the dashboard. **Grown-ups**
returns to the parent view.

- **My garden.** One plant per subject, described in words, never numbers.
- **Story time and number time.** Today's literacy and numeracy options for
  your child to pick from.
- **Tell about my day.** A voice note saved to the learner's records.
- **Plant something new, Memory walk, Beat the clock.** These open a test,
  recall cards or a challenge. Needs a local AI provider; see the README.

The child view itself shows no levels, XP or percentages.

## Map

The connected curriculum, in two modes.

- **World map.** The eight subjects as realms, with their domains as dots sized
  by topic count. Mastery shows as a quiet tint rather than a percentage.
- **Skill tree.** Enter a domain to see its topics as a tree. Solid links are
  **required** foundations; dashed links are **helpful** ones. Gateway domains
  that feed this one are shown too.
- **Quest log.** Select a topic to see the foundations it needs, what it
  unlocks, and buttons to open the topic page, **record evidence**, or **mark
  it as learning**. "Open full lesson" needs a local AI provider.
- **List.** Prefer text? Switch to the list and drill from subject to domain
  to age band to topic.

## Growth stages and mastery

Progress is shown as a plant:

| Stage | Meaning |
| --- | --- |
| **Seed** | Foundations not yet in place |
| **Sprout** | Ready to start |
| **Bud** | Being learned |
| **Bloom** | Mastered |

The same stages appear on the map, the dashboard and the child's garden.

You decide a topic's status. Use **Mark as learning** in the quest log, or open
**Set status manually instead** on the topic page to choose not started,
learning, practicing or mastered. A topic unlocks once every required
foundation is mastered.

## Topic page

Open a topic from the map, the dashboard or a record.

**Works today:** description, **What mastery looks like**, a **Quick check**
prompt, how the topic connects (comes before / leads to), records for the
topic, activity and game ideas, reference links, and manual status.

**Reference links** are searches on Khan Academy, BBC Bitesize, Wikipedia and
YouTube. YouTube results are not filtered for children, so the link reads
"YouTube search (supervise)".

**Needs a local AI provider; see the README:** open full lesson, print & go
materials, the topic mastery test, the challenge, recall cards, "Explain
simply", "Make a mini-quiz", and step-by-step instructions for an activity.

## Calendar

A day-by-day plan from your start date, on the home days you choose.

- **Start date.** Change it and the plan reschedules.
- **Home days and breaks.** Topics go on your home days (Monday to Friday
  unless you change them under **Home days & breaks**). Other days and the
  breaks you add are rest days: nothing is scheduled, and the plan picks up
  after them.
- **Month grid and day panel.** Each home day lists its topics.
- **Younger topics first.** Literacy and numeracy topics below your child's
  age that are not mastered yet come first, each after what it builds on.
  Placement marks what they already know.
- **Refreshers.** Refresher quizzes and activities come only from mastered
  topics, so there are none until something is mastered.
- **Bend the plan.** **Mark done**, **move** a topic to the next home day or
  any date, and **add extras** to any day.
- Opening a lesson, test, challenge or recall review from a day needs a local
  AI provider; see the README.

## Records and recordings

- **Records.** Log an observation, question, discussion or assessment,
  optionally linked to a topic, with a title, notes and a confidence rating.
  Filter by type and open the linked topic from any record.
- **Voice recording.** Record a conversation from the dashboard, a topic page
  or the child view. Audio is saved on the computer that runs Harrington and
  plays back inline.
- **Live transcript.** Live transcript uses your browser's speech service,
  which may send audio to the browser vendor. There is no switch for it in
  Harrington yet; if you prefer, write a note instead of recording. Firefox
  does not offer a live transcript.
- **Recordings folder.** From the dashboard: every recording, grouped by
  section, with playback and transcript.
- **Discussion analysis.** Advice based on a transcript or your notes. Needs a
  local AI provider; see the README.

## Insights

- **Subject summary.** How many topics are mastered, practicing, learning or
  not started in each subject.
- **Recommended next.** The best unlocked topics in that subject.
- **Progress review, subject test and adaptive suggestions.** Needs a local AI
  provider; see the README.

## Notifications

The bell shows a welcome note on first run. The curriculum is downloaded once
and kept on the computer that runs Harrington; it does not update on its own,
so the bell does not report curriculum changes.

## Privacy and data

- Learners, progress, records, recordings and settings are stored in the
  private data folder (`data/private/`) on the computer that runs Harrington.
  The server listens only on that computer by default. When it is shared with
  your other devices, each device can be asked to sign in once with the family
  access token, and the in-app Guide says which applies.
- Nothing leaves your devices unless you configure an AI provider. If you do,
  lessons, tests, challenges and cards send it topic text and the topic's age
  from the curriculum; whole-subject tests, discussion analyses and progress
  reviews send your child's exact age instead. A discussion analysis sends the
  transcript; analyses and progress reviews send your notes only when you tick
  "Include my notes in this request". Learner names are replaced with "the
  child" before any request is built. The live transcript is the exception
  described above.
- There is no sign-in or encryption yet. Do not expose Harrington to the public
  internet.

## What needs an AI provider

Everything below stays off until `HARRINGTON_AI_BASE_URL` and
`HARRINGTON_AI_MODEL` are set (see the README):

- Ready-to-teach lessons and print & go materials
- Topic, section and subject mastery tests, and certificates
- Timed challenges and adaptive (parent-approved) difficulty suggestions
- Recall cards and memory review
- Activity instructions, "Explain simply" and "Make a mini-quiz"
- Discussion analysis and progress reviews

---

*Curriculum: Marble Skill Taxonomy (v1) · © Generative Spark, Inc. · licensed
under ODbL 1.0 (database) and CC BY-SA 4.0 (content).*
