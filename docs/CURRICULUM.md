# Curriculum

Harrington's curriculum is the open
[Marble Skill Taxonomy](https://github.com/withmarbleapp/os-taxonomy). The
server downloads it at runtime into `taxonomy/` in the data directory and
never commits a copy (see [`DATA-LICENSE.md`](../DATA-LICENSE.md)).

## Teaching research

Marble also publishes `data/teaching-research.json`: for 1,049 topics
(Mathematics 502 of 576, Science 547 of 576 at revision `7bd8b67`; no other
subject yet), a summary of how the topic is learned, proposed activities with
feedback for common wrong turns, and an assessment (a task or question, error
patterns and response levels), with the curricula and papers it draws on.
Marble's own notes describe the records as "agent-authored teaching research
and proposed learning activities; not empirically validated interventions".
Harrington says so in one line at the end of every guide.

**How Harrington uses it.** The file is about 23.5 MB, so the browser never
receives it whole. On the first request for a guide the server downloads it
once through the same cache as the other taxonomy files and splits it into
`taxonomy/research/<topicId>.json` plus `taxonomy/research/index.json` (the
topic ids and the source file's SHA-256). The split takes a few seconds once
(about 3 s including the download on a fast connection) and about 23 MB on
disk next to the 23.5 MB source; it runs again only when the source changes.
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

**License.** The research text is CC BY-SA 4.0 (attribution and
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
