# Harrington Linear operating model

Linear is the source of truth for Harrington work. This matches Yew, FamousFor,
and AskBetter.

- Team: [Harrington](https://linear.app/karatgurk/team/HAR/overview) (`HAR`)
- Current project: [Harrington Family Learning POC](https://linear.app/karatgurk/project/harrington-family-learning-poc-c775761333f0)
- Operating manual: [Harrington Linear Operating Manual](https://linear.app/karatgurk/document/harrington-linear-operating-manual-71cae13f7c6a)
- Cycles: not used yet
- GitHub Issues are not used for backlog work

## What lives where

Linear owns roadmap, features, bugs, work-in-flight, priority, and PR linkage.
Repo docs own architecture, the proof-of-concept brief, and runbooks. Link the
repo doc from the Linear issue; do not paste long-form docs into issue bodies.

## PR convention

Include `Closes HAR-N` or `Related: HAR-N` in the pull request body.

## Agent loop

1. Query `team=Harrington label=agent-ready state=Backlog/Todo`.
2. Pick the highest-priority issue that fits the session.
3. Set status to In Progress and self-assign.
4. Use Linear's suggested branch name.
5. Implement against the acceptance criteria.
6. If scope drifts, file a new HAR issue instead of expanding silently.
7. If blocked externally, replace `agent-ready` with `blocked-external`.

## Labels

`agent-ready`, `needs-human`, `blocked-external`, `quick-win`, `deferred`,
plus type labels `Bug`, `Feature`, `Improvement`, `chore`.
