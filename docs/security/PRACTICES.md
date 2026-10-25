# Security practices for HAR-36 (baseline)

These are the practices that would have prevented the gaps in
[THREAT-MODEL.md](THREAT-MODEL.md) and [GAPS.md](GAPS.md), or the findings
already filed from exploratory testing. Each one names the gap or ticket it
comes from. HAR-36 decides which ones become the baseline and how each is
enforced.

## Server and routes

1. **One write guard for every state-changing route.** The guard checks, in
   order:
   1. `Sec-Fetch-Site` is same-origin or none;
   2. the body has a JSON content type;
   3. the cookie gate passes.

   A test lists the routes, so a new route can't skip the guard. (G5)
2. **The Host-header allowlist is always on**, whatever the bind address.
   Tests cover both the loopback server and the shared server. (G1)
3. **Security headers come from one helper:** a Content-Security-Policy,
   `Referrer-Policy: no-referrer`, `X-Frame-Options`, `nosniff`, and a
   `Permissions-Policy` that allows the microphone for the app only. A test
   checks them on a page, an API response and a recording. (G6)
4. **Stored uploads have a content-type allowlist.** The server never echoes
   a client's Content-Type back, and serves user content with `sandbox` and
   `attachment`. (G2)
5. **Authentication failures are rate-limited and logged** with the source
   address. The secret itself is never logged. (G3)
6. **Proxy headers count only when told to.** `X-Forwarded-Proto` counts only
   when a `HARRINGTON_TRUST_PROXY` setting is on. (TB1)
7. **Settings that send a secret elsewhere never trust "loopback" behind a
   proxy.** The AI base URL is one: once Harrington is shared, changing it
   requires the token. (#37, section 7 of the threat model)

## Data and secrets

8. **Secrets live only in the environment or a 0600 file.** They never appear
   in the family document, an export, a backup or a log. A test greps an
   export and a backup archive for a planted fake token and key. (TB6)
9. **File modes:** folders 0700, files and archives 0600, with `chmod`
   after each write, because the umask narrows the mode a write asks for.
   (G7)
10. **Every stored field has a `document.js` rule, and documents are
    validated on load as well as on save.** Unknown fields are capped. (G11,
    HAR-38, HAR-39)
11. **Sync rules:**
    - adopt a server document as the tab's own write only if its version
      moved forward;
    - never mark a change saved before the server confirms it.

    (HAR-43, HAR-44)

## AI and external content

12. **Every prompt goes through `ask()`,** so browser and server redaction
    both apply. Stored names are split on all punctuation, and a test covers
    each name shape. (G9, HAR-41)
13. **External content is pinned and verified:** the taxonomy by commit and
    SHA-256, dependencies with exact versions installed by `npm ci`. (G10)

## Process

14. **Containers run as a non-root user.** (G13)
15. **New attack surface updates the threat model.** A PR that adds a route, a
    stored field, an external call or a secret updates
    `docs/security/THREAT-MODEL.md`, and the PR template gets a checklist line
    for it.
16. **Tests run with a fake token and a fake key set,** and assert that
    neither appears in any response or log line.
