# Curriculum

## Curriculum alignment

Marble's topics carry `standards` codes from several curricula. Harrington
uses one of them, the Australian Curriculum version 9 (`acara-v9:` codes,
Foundation to Year 6), the only one with verbatim text at the pinned
revision that suits Harrington's ages. The server downloads
`curriculum-standards.json` (2.7 MB, every curriculum, pinned by SHA-256 in
`lib/taxonomy-pin.mjs`) but never sends it to the browser: on the first
request it derives `GET /api/taxonomy/standards/acara-v9.json` (620 content
descriptions: code, title, strand, learning area, subject, year levels; about
165 KB) with `trimStandards` in `src/js/curriculum.js` and keeps it in memory.
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
and the coverage report's statuses (Mastered, Evidence, Not yet) describe
the family's own records, not a judgment that a content description is met.

A learner's optional `curriculum: { id: 'acara-v9', year }` turns on the
year-level order: `curriculumBoost` gives 2 to a topic linked at the learner's
year and 1 to an unmastered topic linked at the year below, and the daily
choices, recommendations, finder, map list and placement default rank by it
before the age order. It is a soft boost; nothing is filtered out.

Wherever Australian Curriculum text is shown (topic chips, the coverage
report, the guide's credits, README and NOTICE), the ACARA notice
(`ACARA_NOTICE` in `src/js/curriculum.js`) is quoted verbatim.
