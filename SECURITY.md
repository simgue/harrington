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
- `HARRINGTON_HOST` changes the bind address. When Harrington is shared with
  other devices, set `HARRINGTON_ACCESS_TOKEN`: every `/api/*` request except
  `/api/health` then needs an HttpOnly, SameSite=Strict cookie that a one-time
  sign-in at `/login` sets (a password form, or a `?token=` link; compared in
  constant time; the cookie is derived from the token, never the token
  itself). Once shared, the server answers only to the family's host names
  and IP addresses (`421` otherwise) to stop DNS rebinding. Harrington does
  not terminate TLS; put a WireGuard mesh with HTTPS (such as Tailscale) or a
  local reverse proxy with an internal certificate authority in front of it.
  [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) has the steps. There are no user
  accounts, and the token is a single family secret: do not expose Harrington
  to the public internet.
- What the token does not protect:
  - there is no limit on sign-in attempts, so the token must be long and
    random;
  - a `?token=` sign-in link stays in browser history, address-bar
    suggestions and synced history (the form avoids this);
  - the cookie is a 400-day credential, identical on every device, and the
    only way to sign out one device is to change the token for everyone;
  - over plain HTTP the token and the cookie cross the network in clear;
  - `/api/health` is open and reveals whether the server is shared and
    whether the token is on (no family data);
  - anyone holding a signed-in device, a child included, has full access.
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
