# Curriculum data

Harrington's map, daily choices, calendar and tests all come from the
[Marble Skill Taxonomy](https://github.com/withmarbleapp/os-taxonomy): about
1,845 small topics in 9 subjects, each with an age range, evidence of mastery
and a suggested question, joined by about 3,941 prerequisite links ("this
topic builds on that one"). Harrington reads five of its files:

| File | What Harrington uses it for |
| --- | --- |
| `topics.json` | Every topic: id, subject, domain, name, description, ages, evidence, `assessmentPrompt`, `standards` (curriculum codes; Harrington uses the Australian ones), and any field Harrington does not use yet, served as is |
| `dependencies.json` | Prerequisite links, `hard` (required) or `soft` (helpful), each with a reason |
| `clusters.json` | Parent-facing summaries of a domain at one age |
| `manifest.json` | Counts, `taxonomyVersion`, `generatedAt` and the upstream's own file hashes |
| `curriculum-standards.json` | Read by the server only, to derive the Australian Curriculum list (see [Curriculum alignment](#curriculum-alignment)); never sent to the browser |
| `teaching-research.json` | The teaching guides on topic pages (see [Teaching research](#teaching-research)); never served whole |

The upstream publishes more files; Harrington does not download them yet.

## Licence

The data is not Harrington's. The database (structure, ids, links) is under
**ODbL 1.0** and the text (names, descriptions, evidence, reasons, summaries)
under **CC BY-SA 4.0**; curriculum-standard codes keep their own licences.
Harrington uses the data as a produced work and keeps the attribution in the
app, [`NOTICE`](../NOTICE) and the README. See
[`DATA-LICENSE.md`](../DATA-LICENSE.md). Never commit a copy of the files.

## How Harrington gets the files

The revision is pinned in one place, [`lib/taxonomy-pin.mjs`](../lib/taxonomy-pin.mjs):

```js
export const TAXONOMY_PIN = {
  revision: '<40-character commit>',
  date: 'YYYY-MM-DD',
  upstream: 'https://raw.githubusercontent.com/withmarbleapp/os-taxonomy/<commit>/data',
  files: { 'topics.json': '<sha256>', 'dependencies.json': '<sha256>', ... },
};
```

`server.mjs`, the e2e suite (`tests/e2e/support/taxonomy.mjs`) and
`npm run taxonomy:check` all import it.

- The server serves a curriculum file only if its SHA-256 matches `files`.
  It caches files in `HARRINGTON_DATA_DIR/taxonomy/`. On a request it checks
  the cached file; if the file is missing **or does not match** (an older
  revision, a cache an earlier Harrington filled from jsDelivr, a hand edit),
  it downloads the file from the pinned commit, checks it, and replaces the
  cached copy. So an install moves to a new pin by itself on first use after
  an upgrade, Docker included, and revisions never mix.
- A download that does not match is refused and not saved. The browser shows
  "Curriculum file … failed its integrity check, so it was not saved"; the
  server log has both hashes. If that download fails or does not match, the
  old cached file is left on disk but not served: the curriculum does not load
  until the pinned file can be downloaded.
- A matching cache is served with no further network calls. The download is
  Harrington's one outbound call that needs no opt-in, and it happens only for
  a file that is missing or does not match the pin.
- Hashes are remembered per file with its size and modification time, so a
  file changed on disk is checked again on its next use; no restart is needed.
- `/api/health` (signed in) reports `taxonomy`:

  | Value | Meaning |
  | --- | --- |
  | `verified` | Every file the browser loads is cached and matches the pin (`curriculum-standards.json` and `teaching-research.json` count only when a download of theirs is refused) |
  | `outdated` | A cached file does not match the pin. It is not served, and is replaced at its next use |
  | `integrity-failed` | The last download of a file did not match the pin and was refused |
  | `unchecked` | `HARRINGTON_TAXONOMY_UPSTREAM` points at a custom upstream |
  | `not-downloaded` | A file the browser loads has not been downloaded yet |

  and `taxonomyRevision`: the pinned commit when `taxonomy` is `verified`,
  else `null`.
- `npm run taxonomy:check` is a diagnostic for pin bumps and CI: it downloads
  the pinned files, checks their hashes against the pin and the upstream
  manifest, and writes nothing.

### A custom upstream (experiments only)

`HARRINGTON_TAXONOMY_UPSTREAM=<url ending in /data>` makes the server download
from somewhere else, for example a local fork. **Files from a custom upstream
are not checked**: the server logs a warning at startup, health says
`unchecked` with no revision, and the files are cached in their own folder,
`taxonomy/custom-<first 12 hex digits of the URL's SHA-256>/`, never next to
the pinned ones. Setting the variable to the pinned URL itself is not custom.
Unset it to go back: the server serves only the pinned, checked files again,
downloading them if needed. The custom folder can be deleted.

### Moving an existing install to the pinned revision

Nothing to do: upgrade Harrington and open it. The first request for each file
finds the old cached copy does not match, downloads the pinned one and replaces
it. The machine needs to reach `raw.githubusercontent.com` once. Read "Retired
topics" below first: a revision can retire topics the family has worked on.

## Bumping the pin

1. **Pick the commit.** Take a commit of `withmarbleapp/os-taxonomy` (never a
   branch). Read its `data/manifest.json` at that commit: `counts`
   (topics, `topicsBySubject`, dependencies, clusters) and
   `files.<name>.sha256`.
2. **Get the hashes and check them yourself.**

   ```bash
   R=<commit>
   for f in topics.json dependencies.json clusters.json manifest.json curriculum-standards.json teaching-research.json; do
     curl -sSfo "/tmp/$f" "https://raw.githubusercontent.com/withmarbleapp/os-taxonomy/$R/data/$f"
   done
   sha256sum /tmp/*.json
   ```

   Every file but `manifest.json` must equal the manifest's `sha256`.
   `manifest.json` does not list itself; take its hash from `sha256sum`.
3. **Edit `lib/taxonomy-pin.mjs`:** `revision`, `date`, `upstream` and the
   file hashes. Nothing else holds the revision.
4. **Verify:** `npm run taxonomy:check` (CI's isolation job runs it too, and
   downloads the files for the server's integrity tests).
5. **Diff the two revisions** before touching fixtures: new and removed
   subjects, removed topic ids, topics whose subject, domain, `ageRangeStart`
   or `name` changed. A short Node script over the old and new `topics.json`
   does it.
6. **New subjects:** add each to `SUBJECTS` in `src/js/data.js` (a colour with
   at least 4.5:1 contrast on the paper background and a Lucide icon from the
   vendored set), to `REALM_PLACES` in `src/js/graph.js` (a free spot on the
   world map) and to `DEFAULT_MODE` in `src/js/views/masterytest.js`. Until you
   do, the app still shows the subject in neutral grey and logs one warning.
7. **Fixtures.** `git grep -n -E "<old topic count>|<old link count>"` finds the
   counts the specs and docs hard-code (api, dashboard, map, topic,
   walkthrough). Per-subject counts (`/576 mastered`), section sizes
   (`COUNTING_SECTION_OTHERS` in `tests/e2e/support/family.mjs`) and the
   one-domain realm in `map.spec.mjs` follow the diff. Prefer topic ids to
   names in specs: names change between revisions.
8. **Run** `npm test`, then `npm run e2e:ui-docs`, which downloads the new pin
   into `tests/e2e/.cache/taxonomy-<commit>/` and regenerates the screenshots
   in `docs/e2e/screenshots`. The CI cache key follows the pin file.
9. **Write it up:** a CHANGELOG entry with the before and after counts, the
   retired ids and any behaviour a parent will notice (daily choices shift
   when topics change age), and the counts in README, the Guide
   (`src/docs/GUIDE.md`, `src/js/views/guide.js`) and this file.

## Retired topics

A revision can drop a topic id. The 2026-10-24 revision retired one:
`mt_3XJkeIn6J6` (Mathematics / Measurement, "Estimating answers (age 7+)"),
with no recorded replacement.

A family document may still hold mastery, test, practice, recall, calendar,
daily-offer, workbook or request entries for such an id, and the server's
lesson cache may hold a saved lesson for it. Harrington's rule:

- **Keep the data.** Nothing is deleted, and load, import and save never refuse
  a document for it. An export still carries it.
- **Leave it out of counts and choices.** Topic counts, progress rings,
  recommendations, daily choices, the calendar track, recall and practice due
  counts and the bell skip it. Its recall cards and practice questions keep
  their schedule but are never due.
- **Show it.** Records lists it under **Archived topics** for each learner
  whose data mentions it, with the name that data stored for it (from a
  record or calendar entry), else its id, and what is kept. A saved lesson
  alone does not make a row: the lesson cache is family-wide and stays on the
  server untouched. A workbook Yes on it is never written as mastery; a
  calendar move of it is kept when "Clear moves" clears the others. Its old
  topic page says "This topic is no longer in the curriculum" and opens the
  Records of the learner whose data holds it. An id no learner's data
  mentions is still "Topic not found".

If a later revision brings the id back, everything reappears as it was.

## Age shifts

A revision can move a topic's starting age (113 topics moved in 2026-10-24).
Harrington derives ages from the taxonomy each time it reads them; nothing in
the family's data stores a topic's age except history:

- The calendar track, daily choices, sections and placement are worked out
  from the current ages, so today's choices may differ after a refresh.
- A level-set workbook sheet reads its age band from its topics' current ages;
  the band stored on the sheet is only a fallback.
- Test results keep the section id they were taken in (`Subject|Domain|age`)
  and a placement record keeps its title ("up to age 8"): they record what
  happened then.

## Curriculum alignment

Marble's topics carry `standards` codes from several curricula. Harrington
uses one of them, the Australian Curriculum version 9 (`acara-v9:` codes,
Foundation to Year 6), the only one with verbatim text at the pinned
revision that suits Harrington's ages. The server downloads
`curriculum-standards.json` (2.7 MB, every curriculum, pinned by SHA-256 in
`lib/taxonomy-pin.mjs`) but never sends it to the browser: on the first
request it derives `GET /api/taxonomy/standards/acara-v9.json` (620 content
descriptions: code, title, strand, learning area, subject, year levels; about
165 KB) with `trimStandards` in `src/js/curriculum.js`. The source file is
cached and re-verified against the pin like every other file (a custom
upstream in its own folder), and the derived list is kept in memory per
source SHA-256, so a replaced file is trimmed again. Like the teaching
research, it counts in `/api/health` only when its download is refused
(`integrity-failed`). The file is optional: its download gives up after 15 seconds, a failure is answered from memory for five minutes before the server tries again. The
app never waits for the list at start-up: it loads in the background and the
page showing renders again when it arrives or fails. Until then, today's
choices for a learner with a curriculum year are not saved; a pick made
before then saves the offers shown first, so it is never lost.
Year levels are normalised to `F` and `1` to `6`; 111 codes span two years
(Health and Physical Education and Technologies bands).

At revision `7bd8b67`, 872 of 1,845 topics link to at least one Australian
code, and 593 of the 620 content descriptions have a linked topic. The 27
without one are the Movement and physical activity strand of Health and
Physical Education, which the taxonomy does not cover; the coverage report
lists them as "Not yet" with "No Harrington topic is linked".

The links are Marble's map, not a certificate: Marble notes that 572 of its
earlier "fully covered" claims were not independently rechecked. The app
therefore says a topic is "linked to" a code, never that it satisfies one,
and the coverage report's statuses (Linked topics mastered, Evidence, Not
yet) describe the learner's own records, not a judgment that a content
description is met. Evidence is a record about a linked topic (an
observation, a discussion, a recording, a mastery observation's
assessment), a passed topic check, a challenge at 80% or better, or a
practice question; a saved lesson is a plan, not evidence.

A learner's optional `curriculum: { id: 'acara-v9', year }` turns on the
year-level order: `curriculumBoost` gives 2 to a topic linked at the learner's
year and 1 to an unmastered topic linked at the year below, and the daily
choices, recommendations, finder, map list and placement default weigh it
with the age order. It is a soft boost; nothing is filtered out. Any other
curriculum id is refused by the import check and the server.

The ACARA notice (`ACARA_NOTICE` in `src/js/curriculum.js`) is quoted
verbatim wherever Australian Curriculum codes or text appear in the app: once
on a topic page below its chips (shown whenever the chips are), in the
coverage report's footer, and in the in-app guide's credits; also in the
README, NOTICE and DATA-LICENSE. The written guide points to the README.

## Teaching research

Marble also publishes `data/teaching-research.json`: for 1,049 topics
(Mathematics 502 of 576, Science 547 of 576 at revision `7bd8b67`; no other
subject yet), a summary of how the topic is learned, proposed activities with
feedback for common wrong turns, and an assessment (a task or question, error
patterns and response levels), with the curricula and papers it draws on.
Marble's own notes describe the records; the first, "Agent-authored teaching
research and proposed learning activities; not empirically validated
interventions.", is kept in the split's `index.json` (so it follows the pin),
served with the topic list and shown verbatim at the end of every guide and
with the guide's question in the observation check. Harrington's plain-English
gloss sits apart from it, labelled as Harrington's note.

**How Harrington uses it.** The file is about 23.5 MB, so the browser never
receives it whole. Every topic page asks for the topic list (and, without
an AI provider, so do the calendar and the map's quest log), so the first such
view makes the server download the file once, through the same cache and
SHA-256 check as the other taxonomy files (it is in `lib/taxonomy-pin.mjs`,
and `npm run taxonomy:check` verifies it too). `/api/health`'s `taxonomy`
status counts it only when its download is refused (`integrity-failed`);
`verified` and `outdated` look at the four files the browser loads. A failed
download is not retried for three minutes, so an offline first run does not
start a 23.5 MB download on every page. The server then splits the file into
`taxonomy/research/<topicId>.json` plus `taxonomy/research/index.json` (the
topic ids, the source file's SHA-256 and Marble's caveat). The split is built
in a staging directory and swapped in with two renames; a staging or old
directory left by a crash is removed by the next split. The split sits in the
same cache folder as its source, so from a custom upstream both live in that
upstream's own `custom-…` folder and are never used once the variable is unset. The split takes a few seconds once
(about 3 s including the download on a fast connection) and about 23 MB on
disk next to the 23.5 MB source; it runs again only when the source changes (for
example after a pin bump, when the cached split no longer matches the pin, or
when a file from a custom upstream changes).
`GET /api/taxonomy/research` lists the topic ids, and
`GET /api/taxonomy/research/<topicId>` returns one record (404 when the topic
has none; the id is validated before any file is touched). Both routes follow
the same access-token rules as the other `/api/taxonomy/` routes.

The topic page shows a curated subset (`curateResearch` in
`src/js/teaching.js`): the learning summary, each activity's steps, intended
insight and feedback, and the assessment's method, task, diagnostic prompt,
strong answer, follow-up questions, error patterns and response levels, plus
the source links. It leaves out internal metadata: confidence, provenance,
review and publication notes, source claims and authoring constraints.

**Licence.** The research text is CC BY-SA 4.0 (attribution and
share-alike). Harrington shows it verbatim, never through an AI model, with
this line at the end of every guide and in the app's credits:

> From the Marble Skill Taxonomy teaching research · © Generative Spark, Inc.
> (Marble) · CC BY-SA 4.0

linking to the taxonomy repository and to the license. Dropping fields is a
selection, not an edit of the text. If Harrington ever edits the text itself
(shortens, rewrites or translates it), the edit must be marked where it is
shown, and the edited text stays under CC BY-SA 4.0. The sources inside each
record (curricula and papers) are shown as plain links; their own works stay
under their own terms, and Marble has already replaced long passages of
codes-only curricula with "[curriculum wording omitted; …]" markers, which
Harrington shows as they are.
