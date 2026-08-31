# Harrington proof of concept

Harrington begins with the complete Homestead application so the proof of
concept can test a real, connected learning experience instead of rebuilding
curriculum loading, graph navigation, scheduling, records, lessons, and mastery
mechanics from scratch.

The original Homestead repository remains configured as the `upstream` Git
remote. Harrington keeps the upstream MIT licence and the required Marble Skill
Taxonomy attribution.

Harrington now runs through its own small server. Family state, lesson caches,
and recordings are stored in a directory controlled by the family; no external
account is required. AI and Commune remain disabled until they have explicit,
self-hosted adapters.

## POC question

Can a parent use Marble's prerequisite graph to understand a child's possible
paths to mastery while Harrington keeps the child's experience interest-led,
nature-based, project-oriented, and free from visible scores?

## Active spine

The concrete domain-level focus is documented in
[POC-SPINE.md](POC-SPINE.md). Harrington continues to load the full taxonomy so
the focus layer does not break prerequisite paths.

The first proof of concept concentrates on:

1. **Curriculum graph** — load the Marble taxonomy and let a parent start at
   the top of the subject map, then drill into domains, sections, topics, and
   prerequisite / unlock paths.
2. **Child context** — begin with synthetic profiles corresponding to an early
   learner, a six-year-old hands-on learner, and a nine-year-old artistic
   learner. Do not enter real child records until storage and export have been
   reviewed.
3. **Parent-only progress** — retain scores and mastery evidence behind the
   scenes. Children receive descriptive feedback rather than numerical scores.
4. **Configurable gates** — treat literacy and numeracy as the first hard-gated
   subjects. Other domains can use observations, portfolios, explanations,
   projects, performances, and developmental milestones.
5. **Interest-led route** — let interests influence what appears as a useful
   next activity without pretending that an activity covers curriculum evidence
   it did not demonstrate.
6. **Daily evidence** — capture what actually happened separately from what was
   planned, so the next recommendation and later reporting can be grounded in
   real learning.

The parent graph is the current live surface. The daily focus layer
(literacy / numeracy / interest invitations) stays backlog until the local
runtime and graph explorer have been used.

## Keep, but do not optimise yet

The fork retains the complete upstream feature set. These capabilities remain
available for evaluation but are not part of the initial proof:

- AI-generated lessons and tests
- voice recording and transcript analysis
- child gamification and timed challenges
- Commune and external-teacher handoffs
- full-year scheduling and automated compliance reporting
- production hosting, authentication, and encrypted backups
- complete Victorian Curriculum or Wurundjeri seasonal overlays

Keeping these features avoids destructive pruning before the family has used
the product. They can be removed, redesigned, or promoted into the active spine
after the graph-first workflow has been tested.

## Family teaching constraints

- Waldorf-inspired developmental timing, nature and seasonality guide the
  learning experience without enforcing rigid Steiner blocks.
- Literacy and numeracy ideally happen early on home days through a mixture of
  explicit teaching, workbooks, games, discovery, and practical application.
- Children have meaningful choice over interests and projects.
- Projects should often culminate in authentic outcomes such as building,
  performing, presenting, planning, negotiating, or serving others.
- The early learner's progress is observational for now. The hands-on learner
  benefits from construction, movement, sport, and outdoor learning. The
  artistic learner benefits from musical and visual pathways plus gentle
  scaffolding toward self-direction.
- Creativity, curiosity, and motivation are never blocking metrics.
- First Nations material must come from published, community-authored or
  community-authorised sources with clear provenance; generative AI must not
  invent cultural knowledge.

## POC exit criteria

The proof is useful when a parent can answer, without exposing a child to scores:

- What could this child choose to explore today?
- Why is that topic ready, and what does it unlock?
- Which prerequisite needs more support?
- What evidence shows that a key skill was demonstrated?
- Are literacy and numeracy progressing?
- Which curriculum areas are being missed?
- Can all family-created data be exported and restored independently of its host?

The POC should be evaluated with synthetic data first. A production data model,
privacy review, Victorian mapping, and long-term hosting decision follow only
after this spine proves useful.
