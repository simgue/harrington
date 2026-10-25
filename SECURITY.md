# Security Policy

## Reporting a vulnerability

If you discover a security issue, please **do not open a public issue**.
Instead, report it privately to the maintainer (see the contact in the
repository profile). Include steps to reproduce and the potential impact. We'll
acknowledge your report and work on a fix as quickly as we reasonably can.

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
  `HARRINGTON_AI_MODEL` are set. When they are set, requests go only to that
  configured OpenAI-compatible endpoint. Harrington never puts a learner's name,
  birth month or year, interests or record titles into a prompt itself. It
  replaces the learner names it knows with “the child” in transcripts and notes
  in the browser before any request is built, and again on the server in every
  message it forwards to the provider, with the same matching rules; the server
  also removes stored parent notes unless the parent opted in to that request. A
  learner name that is a common word ("Will": about 40 taxonomy topics contain
  "will") is replaced wherever it appears in the prompt, instructions and topic
  text included, which can degrade the answer. What still leaves the machine:
  topic text (for lessons, printables, activities, “Explain simply”,
  mini-quizzes, recall cards, tests and challenges) and the topic's age from the
  curriculum; the learner's exact age for whole-subject tests, discussion
  analyses (alongside a linked topic's age) and progress reviews; the adaptive
  “excelling” flag on topic and section tests; mastery counts and percentages,
  topic statuses, record counts and the average confidence rating for progress
  reviews; a discussion transcript when the parent asks for an analysis; and
  parent notes only when the parent opts in for that request. Only names entered
  in Harrington are replaced: a nickname, especially one that is an ordinary
  word, and other people's names in a transcript are sent as spoken, a
  one-letter name is not replaced, and names in scripts written without spaces
  (for example Chinese) are not matched when they run straight into other text.
  There are no features shared between families.
- An imported family file is checked before it replaces the family data, and
  the server applies the same check (`src/js/document.js`) to every save,
  answering 422; a save in a data format newer than the server's, or older
  than the stored document's, gets 409. A file from a newer data format
  (`schemaVersion`) is refused at import, and such a document already on the
  server opens read-only. Learner, record and result values are escaped in
  every view, and a stored AI analysis is rendered through an allowlist of
  the tags Harrington writes, never as raw HTML.
- The child-view PIN is a gentle barrier, not a lock. Four digits are 10,000
  guesses, and reloading the page always returns to the parent view. The
  family document (and every export) keeps only a SHA-256 hash of the PIN
  with a random per-family salt (`settings.parentPinHash` and
  `settings.parentPinSalt`), never the digits. A plain `parentPin` from an
  older document or export is hashed when it is loaded or imported (data
  format step 1 to 2); the server refuses a current-format save that still
  carries one. Anyone who can read the data folder or an export can still
  recover a 4-digit PIN by trying them all; the hash only keeps it out of
  plain sight.
- The "See how it works" figures (`src/figures/*.html`) run in an iframe
  sandboxed to `allow-scripts`, so in an opaque origin with no access to the
  app, its cookie or its storage. The server sends every file under
  `src/figures/` a policy with `default-src 'none'` and
  `sandbox allow-scripts`, decided on the resolved file whatever the URL's
  spelling, and the app's pages send `frame-src 'self'`, so a figure cannot
  load anything or navigate its frame to another origin. `/api/figures`
  lists only pages that pass `src/js/figures/contract.js` (no URL, external
  script, link or frame tag).
- Please never include real children's personal data in a report.

Thank you for helping keep families using Harrington safe.
