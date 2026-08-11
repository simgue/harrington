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
- AI and shared-family features are disabled by default. No family data is sent
  to an AI provider by this preview.
- Please never include real children's personal data in a report.

Thank you for helping keep families using Harrington safe.
