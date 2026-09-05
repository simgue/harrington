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
  name) is sent only to that configured OpenAI-compatible endpoint. Shared-family
  features remain disabled by default.
- Please never include real children's personal data in a report.

Thank you for helping keep families using Harrington safe.
