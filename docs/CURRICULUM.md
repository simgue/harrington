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

The upstream publishes more files (for example `teaching-research.json`).
Harrington does not download them yet.

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
  | `verified` | Every required file is cached and matches the pin; the optional `curriculum-standards.json` counts once it has been cached (see [Curriculum alignment](#curriculum-alignment)) |
  | `outdated` | A cached file does not match the pin. It is not served, and is replaced at its next use |
  | `integrity-failed` | The last download of a file did not match the pin and was refused |
  | `unchecked` | `HARRINGTON_TAXONOMY_UPSTREAM` points at a custom upstream |
  | `not-downloaded` | A required file has not been downloaded yet |

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
   for f in topics.json dependencies.json clusters.json curriculum-standards.json manifest.json; do
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
source SHA-256, so a replaced file is trimmed again. Until it is first
downloaded, `/api/health` still reports a complete curriculum. The file is
optional: its download gives up after 15 seconds, a failure is answered from memory for five minutes before the server tries again. The
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
