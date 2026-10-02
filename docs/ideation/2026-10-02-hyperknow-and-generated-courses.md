# Generated courses on a real knowledge graph: what to borrow from HyperKnow

_Architect note, 2 October 2026. Companion to the full research report in
[2026-10-02-hyperknow-research.md](2026-10-02-hyperknow-research.md), which carries the
evidence and 84 sources. This note is the recommendation._

## The question

Harrington has a structured spine (the Marble Skill Taxonomy: 1,590 topics, 3,221
prerequisite edges, each with a reason) and a world-map and skill-tree view of it. What
it does not have is a way for a parent or child to say "I want to learn about volcanoes"
and get a course that lands on that map with its prerequisites in place. HyperKnow sells
exactly the first half of that sentence, so we looked at how it works.

## What HyperKnow actually does (and does not)

Evidence caveat: hyperknow.io itself was unreachable from the research sandbox, so the
product claims come from its own pages via search snippets and press, and the mechanics
come from three independent reverse-engineering repositories that captured the live
client-server protocol in September 2026. Treat the mechanics as well-supported but
unofficial.

**Does.**

- Turns a topic, a textbook or a stuck concept into a 1:1 course for university students:
  units, lessons, practice, exams, projects and an interactive whiteboard with voice.
- Runs a **staged, confirmation-gated pipeline**: intent check (one-off requests are
  rejected) → up to five rounds of web research with citation ids → draft syllabus → four
  scoping questions (prior knowledge, lens, target level, scale) → an editable course
  structure the learner must confirm → per-session outlines with key points → practice
  per session, exam per unit, project per course.
- Grounds lesson text by carrying citation ids (`[refId]`) from the research step into
  the prose, and cites uploaded files back to the page.
- Keeps a **typed memory** per learner (preference, knowledge, logistics) that steers
  quizzes toward weak concepts.
- Logs generation as a replayable event timeline, so a long run survives a disconnect.
- Is built as a FastAPI-shaped API with WebSocket channels, Supabase auth, S3 storage,
  Stripe billing and a Gemini-class model; no public API, no engineering blog.

**Does not.**

- Have a knowledge graph. A course is a strict tree (course → units → sessions → key
  points). Nothing is shared across courses, nothing is inferred as a prerequisite, and
  "prerequisite" is a question the learner answers, not a relation the system knows.
- Show a map. Progress is four flat tables and a syllabus sidebar.
- Publish any evaluation of correctness, or a child-safety policy. It is adult-facing.

That gap is Harrington's opening. We already own the half HyperKnow lacks: a curated,
reasoned prerequisite graph with mastery on every node. The work is to add the half they
have, generation on demand, without giving up the graph.

## What to add to Harrington

The feature, in one sentence: **a request becomes either a path through topics we already
have, or a small approved sub-graph grafted onto the taxonomy, and both look like any other
topic to the child.**

### Principles

1. **Graph first, never a parallel tree.** Generated content becomes nodes and edges of the
   same graph the map draws, with Marble-style fields (subject, domain, age range,
   evidence criteria, prerequisites with a reason). No separate "courses" object.
2. **Parent confirms before anything touches the graph.** HyperKnow's confirm step is the
   one thing worth copying exactly; for a family app it is also the safety gate.
3. **Scoping questions answered from data.** HyperKnow asks four questions; we already know
   age, mastery and the fringe of what is ready to learn, so we ask at most two (how deep,
   what angle).
4. **Cite or drop.** Every generated paragraph must point at a source we hold locally; a
   paragraph that cannot is removed, not kept.
5. **Lazy, cached, replayable.** Outline now, first lesson now, the rest in the background;
   everything through the existing lesson cache, with a dedicated cache kind and
   validator for each new artifact (quest proposal, replay log), because `isValidCached`
   accepts any kind it does not know; the child's session never waits on a model.
6. **Privacy posture kept, and tightened in one place.** No learner names (HAR-19), no
   external calls during a child session, local provider by default; and, as a change from
   HAR-19's current list, the age band instead of the exact age, so README and SECURITY
   must be updated when this ships.

### The flow

```
"I want to learn about volcanoes"  (parent types it; a child request goes to the parent's queue)
   │
   ▼
Topic finder (no AI): fuzzy match against 1,590 topic names, descriptions and evidence
   ├─ covered → show the path: matching topics, their unmet prerequisites, the next ready step.
   │             "Volcanoes" is mostly Earth science + states of matter; nothing to generate.
   └─ not covered, or only partly → propose a quest
          │
          ▼
       Quest proposal (AI, provider required)
          outline of 3 to 6 new nodes, each with: name, suggested domain, age band,
          2 to 4 evidence criteria, an assessment prompt, and typed edges to existing
          Marble topics (hard/soft + reason), chosen by retrieving the nearest topics
          and asking the model for the relation; cycles and edges to unknown ids rejected.
          │
          ▼
       Parent review screen: edit names, drop nodes, change edges, approve.
          │ approve
          ▼
       Nodes join the graph as "sprouts" on the nearest domain tree; map, quest log,
       daily choices and placement treat them as topics. Lessons, quick checks and
       recall are generated lazily through generateCached; evidence checklists work
       without AI at all.
```

### Data model

A new top-level key in the family document, versioned and exported like everything else:

```
state.extensions = {
  nodes: {
    "x_volcano_01": {
      name, subject, domain, ageRangeStart, ageRangeEnd,
      description, evidence: [...], assessmentPrompt,
      prerequisites: [{ id: "<marble or x_ id>", kind: "hard" | "soft", reason }],
      sources: [{ title, locator }],          // what the lessons may cite
      status: "proposed" | "approved" | "retired",
      requestedBy: "parent" | "child", createdAt, approvedAt, provider
    }
  },
  requests: [{ id, text, learnerId, createdAt, outcome: "path" | "quest" | "declined" }]
}
```

Rules the store enforces: an approved node has at least one taxonomy parent; the combined
graph stays acyclic; fan-in is capped; mastery for `x_` ids lives in the same `progress`
map as everything else, so placement, rings and the child view need no special cases.
Retiring a node keeps its mastery history.

### Grounding on a local model

HyperKnow leans on five rounds of live web search and a frontier model. A 7 to 14 billion
parameter local model cannot be trusted to free-write children's content. The order of
preference:

1. **Week one, no provider:** the topic finder and the manual "Add a topic" (parent types
   the node, picks prerequisites from the taxonomy, writes two evidence lines). This is
   useful on its own and is the foundation for everything below.
2. **With a provider, no corpus:** generate the outline and the evidence criteria only;
   lessons stay parent-written or come from the family's own books. Honest and cheap.
3. **With a corpus:** a local folder of allow-listed sources (the family's books as text,
   an offline encyclopedia dump, curriculum pages), chunked once and searched locally;
   lessons must cite chunk ids; uncited paragraphs are dropped. This is the HyperKnow
   grounding pattern made offline.

### Child safety and the child view

- A child can type a request in the child view ("I want to learn about…"), but it only
  queues for the parent; nothing is generated or shown until approved.
- Generated nodes carry an age band; the child view shows only nodes within the learner's
  band, like Marble topics.
- No external call happens while the child view is open.
- Lessons for `x_` nodes pass the same child-safe rendering paths as everything else: no
  scores, no provider wording, and a safety self-check prompt before caching.

### Evaluation (how we will know it works)

- Edge precision: the parent accepts or rejects each proposed prerequisite; track the
  acceptance rate per provider and prompt version.
- Citation coverage: share of lesson paragraphs with a valid local citation.
- Fringe consistency: after approval, the new nodes should sit on the learner's outer
  fringe (prerequisites mastered, node not), the Knowledge Space Theory test.
- "Explain it back": a rubric-graded retelling (the KnowGraph pattern) as a child-friendly,
  non-score signal of mastery, recorded as evidence.
- Later, Bayesian Knowledge Tracing per node (pyBKT-sized, right for three learners) to
  compare with the parent's judgment.

## Tickets to file (in order)

| Ticket | Scope | Needs AI | Depends on |
| --- | --- | --- | --- |
| Topic finder | Free-text request → matching taxonomy topics, unmet prerequisites, next ready step; request log | No | HAR-14 (placement), HAR-21 (graph selection) |
| Add a topic (manual extension nodes) | `state.extensions` data model, validation (parent, DAG, fan-in), parent form with prerequisite picker, rendering as sprouts on the map and quest log, mastery and daily choices treat them as topics, export/import | No | Topic finder, HAR-10, HAR-22 |
| Quest proposal | Outline, evidence criteria, typed edges with reasons via nearest-topic retrieval, parent review screen, approve/decline, replayable generation log in the lesson cache | Yes | HAR-13, HAR-19, HAR-20, Add a topic |
| Local corpus and citations | Allow-listed source folder, chunking and local search, cite-or-drop lessons, source panel on the topic page | Yes | Quest proposal |
| Explain-it-back assessment | Rubric-graded retelling recorded as evidence, child-safe result | Yes (grading) or parent-graded | HAR-24 (evidence checklist) |
| Child request queue | "I want to learn about…" box in the child view, parent notification and review | No | Add a topic, HAR-27 (notifications) |

The first two are the recommended next build after wave 3: they deliver the "tell me what I
need to learn to get to X" experience with zero AI risk, and they are the seam every later
piece grafts onto.

## Decisions for the family

1. **Where do generated nodes live on the map?** Recommendation: grafted onto the nearest
   existing domain tree, drawn as a different plant, rather than a separate "Explorations"
   realm. A separate realm is simpler to build but recreates HyperKnow's parallel tree.
2. **Can children request directly?** Recommendation: yes, into a parent queue; nothing
   appears until approved.
3. **Corpus.** Which sources may lessons cite: the family's own books, an offline
   encyclopedia, both, or none for now.
4. **Provider.** The quest proposal step is the first feature where a stronger model
   pays for itself (prerequisite relations with reasons). Decide whether that step may use
   a vendor endpoint under the HAR-19 rules while lessons stay local, or whether
   everything stays local and we accept more parent editing.

## What we are deliberately not copying

Credit metering and 12-hour resets; opaque per-tool model routing; speed bonuses and
timed exams; a tree-only course object; letting the model emit prerequisite ids without
validation; public unauthenticated media URLs and analytics pixels.
