# Harrington Linear operating model

Linear is the source of truth for Harrington work. This matches Yew, FamousFor,
and AskBetter. GitHub Issues are not used for backlog.

- Team: [Harrington](https://linear.app/karatgurk/team/HAR/overview) (`HAR`)
- Current project: [Harrington Family Learning POC](https://linear.app/karatgurk/project/harrington-family-learning-poc-c775761333f0)
- Operating manual: [Harrington Linear Operating Manual](https://linear.app/karatgurk/document/harrington-linear-operating-manual-71cae13f7c6a)
- Cycles: off for now

The Linear API cannot create teams. The Harrington team is a one-click action in
Linear settings (Settings → Teams → Join or create a team → Harrington). That
admin step was [HAR-1](https://linear.app/karatgurk/issue/HAR-1/create-a-dedicated-harrington-linear-team-har)
(originally YEW-389). New work uses `HAR-N` IDs.

## What lives where

Linear owns product roadmap, features, bugs found in use, multi-step work,
work-in-flight, and handoff state.

Repo docs own architecture decisions, runbooks, design specs, solutions, and
plans. Link repo docs from Linear issues; do not duplicate long-form docs into
issue bodies.

GitHub is only for security advisories, external contributor reports, or
PR-tightly-coupled defects.

## Capture rule

If a different agent or person picked this up cold in two weeks and would need
queryable state, file it in Linear.

## PR convention

Include `Closes HAR-N` or `Related: HAR-N` in the pull request body.

## Agent loop

1. Query `team=Harrington label=agent-ready state=Backlog/Todo`.
2. Pick the highest-priority issue that fits the session.
3. Set status to In Progress and self-assign.
4. Use Linear's suggested branch name, for example `simonguerin/har-N-short-desc`.
5. Implement against the acceptance criteria.
6. If scope drifts, file a new HAR issue instead of expanding silently.
7. If blocked externally, replace `agent-ready` with `blocked-external`.

## Issue shape

```md
## Context
Why this matters, what surface it touches.

## Acceptance criteria
- [ ] Specific, testable outcome

## Scope
**In:** files/areas the agent should touch
**Out:** explicitly off-limits

## References
- Repo paths
- Related docs
- Related issues
```

## Labels

`agent-ready`, `needs-human`, `blocked-external`, `quick-win`, `deferred`,
plus type labels `Bug`, `Feature`, `Improvement`, `chore`.
Area labels reused workspace-wide: `ios`, `android`, `backend`, `marketing`,
`legal`, `testing`.

## Current product decisions

- Everything runs on the family's own machine. No Puter account, token, or subdomain.
- The full Marble taxonomy stays available as a parent drill-down graph.
- Mastery evidence is parent-only. Children do not see scores.
- Synthetic learners until privacy, export, and backups are reviewed.
- The daily focus layer is backlog ([HAR-4](https://linear.app/karatgurk/issue/HAR-4/daily-focus-layer-literacy-numeracy-interest-invitations-evidence), originally YEW-392).
