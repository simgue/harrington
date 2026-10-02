# Security Policy

## Reporting a vulnerability

If you discover a security issue, please **do not open a public issue**. Instead,
report it privately to the maintainer (see the contact in the repository
profile). Include steps to reproduce and the potential impact. We'll acknowledge
your report and work on a fix as quickly as we reasonably can.

## Scope & notes

- Harrington includes a small local server. It binds to `127.0.0.1` by default
  and stores family state, lesson caches, and recordings under
  `data/private/` (or `HARRINGTON_DATA_DIR`).
- The preview does not yet include application authentication. Do not bind it to
  a public interface or expose it to the internet without a trusted
  authentication reverse proxy.
- AI generation is disabled until `HARRINGTON_AI_BASE_URL` and
  `HARRINGTON_AI_MODEL` are set. When they are set, topic text (never a child's
  name) is sent only to that configured OpenAI-compatible endpoint. Names of
  learners in this app are replaced with “the child” in the browser before any
  request is built. What still leaves the machine: topic text and the topic's
  age from the curriculum, the learner's exact age for whole-subject tests,
  discussion analyses and progress reviews, mastery percentages, topic
  statuses, record counts and the average confidence rating, a discussion
  transcript when the parent asks for an analysis, and parent notes only when
  the parent opts in for that request (record titles are never sent).
  Nicknames and other people's names in a transcript are sent as spoken, and
  names in scripts written without spaces (for example Chinese) are not matched
  when they run straight into other text. There are no shared-family features.
- Please never include real children's personal data in a report.

Thank you for helping keep families using Harrington safe.
