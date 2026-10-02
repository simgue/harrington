# HyperKnow under the hood: how it generates courses and structures knowledge

_Research report, 2026-10-02. Evidence caveat: the sandbox proxy blocked direct fetches of hyperknow.io, archive.org, reader proxies and nearly every third-party site; only github.com was fetchable. Claims about the official product rest on (a) search-engine snippets of HyperKnow's own pages and press, and (b) three independent reverse-engineering repositories on GitHub that captured the live client-server protocol of agent.hyperknow.io in September 2026. Those repos are unofficial; anything sourced only from them is marked **[RE]**. Inferences are marked **[inference]**._

## Summary

- HyperKnow (legal entity Nutcracker AI Inc.) is a web-only "general AI agent for learning" for university students; founders Yilin Zhao and Ruohan "Leslie" Jiang, Columbia dropouts born 2005, raised a $1M seed led by ZhenFund and claim 100,000+ learners [1][17][18][19].
- Credit-based freemium: Starter $0, Pro $18/user/month ("memory enabled", no per-query upload cap), Max $50/user/month "for heavy daily research and course generation" [1][33].
- Timeline: 2024 hackathon prototype, Aug 2025 "world's first AI teacher to turn any hard topic into a 1:1 AI course", Nov 2025 "Hyperknow Agent", ~Feb 2026 "Hyperknow 3.0" proactive agent; Forbes 30 Under 30 Asia 2026 [11][16][18][27].
- Course generation is a staged, research-first WebSocket pipeline: boot → up to 5 rounds of web research with citation ids → initial syllabus → 4 profile questions (`prerequisite | course_specific | target_level | course_scale`) → editable structure the learner must confirm → per-session outlines with key points → practice/exam/project [30-RE].
- Structure is a tree, not a graph: course → units → (lectures) → sessions with `key_points[]`; progress is four flat tables (exam scores per unit, practice stats per session, project stage states, exam started) [30-RE].
- No knowledge-graph visualization, cross-course nodes or inferred prerequisites were found; "prerequisite" is a question the learner answers, plus a clone prompt asking the model to emit unit-level prerequisite ids as a DAG [30-RE][32-RE].
- Delivery is multimodal: an Excalidraw-style whiteboard driven by action groups (`board | speak | image_generation | highlight | animation | ask | done`) with TTS and voice interjection, Manim+Remotion videos, Gemini-generated diagrams, sandboxed HTML animations [4][15][30-RE].
- Personalization is a typed server-side memory (`preference | knowledge | logistics | other`) marketed as the "Learner's Persona", used to target weak concepts [16][26][30-RE].
- Back-end fingerprints: FastAPI-shaped API, Supabase auth, S3 (us-east-2), Stripe, Dub, Microsoft Clarity, Canvas LMS and Google Calendar connectors; `gemini-3-flash-preview` seen in tool-selection frames; no public API, GitHub org, job posts or engineering blog [8][10][30-RE][36].
- For a taxonomy-first self-hosted app, borrow the confirmation-gated stage machine, research-with-citation-ids, question-driven scoping, per-session key points and typed memory; do not borrow the tree-only structure, free-form prerequisite emission, credit economy or opaque model routing.

## Product

**What it is.** The site calls HyperKnow "The General AI Agent for Learning" that "automatically organizes to-dos from course files to LMS deadlines and guides you through every study session, turning any learning goal into a 1:1 AI course" [1]. The agent, nicknamed Orbie, "reads your uploaded files, understands your deadlines, builds a study plan, and starts preparing materials before you even ask" [15]. The official 3-minute guide lists a Knowledge Base ("connect Canvas or upload your course materials"), a Proactive Learning Feed ("auto-extracts deadlines and tasks from your syllabus"), Deep Learn Sessions ("locks you into a focused, structured session where the AI guides the pace") and generators for quizzes, flashcards, cheatsheets and explainer videos [2][3][5]. Uploads up to 1,000 pages are supported "with every concept cited back to its exact page" [5][15].

**Who it is for.** College students: "trusted by students from 100+ universities worldwide" [1]; an earlier LinkedIn post cites "10,000+ users and partnered with 50+ colleges" [20]; a founder quoted on 1 Oct 2026 says "100,000+ learners" [17].

**Pricing and limits.** Starter $0 ("up to 10 files per query"), Pro $18 ("several times the usage ... memory enabled, no per-query file upload limit"), Max $50 ("lowest cost per credit") [1]; a September 2026 audit records the same prices and an earlier "Free + Pro $12" [33]. Pro buyers get "a 1:1 onboarding session with the founders and an invite to their official Discord" [1][37]. Captured frames show a Pro account with `max_credits: 80`, a 12-hour reset, `turn_cost: 1`, weekly caps of 50 uploads, 50 file generations, 20 calendar adds and 50 Deep Learn sessions, and 1 GB storage [30-RE].

**Platforms.** "Hyperknow is now available at their desktop site only" [1]; no app-store or extension listing surfaced. The app is the SPA at agent.hyperknow.io; chat.hyperknow.io is the status-page component [9][10].

**Team and funding.** Yilin Zhao (赵一霖) and Ruohan Jiang (蒋若涵; "Leslie Jiang - Founder @Hyperknow") met at a quantum-physics hackathon and left Columbia [16][19][20][25]; Lexus (Lingzhi) Chen is Head of Product [21]. Forbes lists "Nutcracker AI" on the 2026 30 Under 30 Asia AI list, says the founders "paused their studies at Columbia University to launch Nutcracker AI last April", and that it "raised $1 million in a seed led by ZhenFund in January" [18]; other sources date the seed to August 2025 [11][16]. Crunchbase's `hyperknow` profile is an unrelated, closed 2014 Brazilian video tool [29].

**Timeline.** 2024: a "deep knowledge search engine" built at a quantum-computing hackathon [27]; from September 2024, "five major version iterations" [25][26]; August 2025: X posts introduce an AI teacher that "writes on the board, creates animations" [11]; November 2025: Hyperknow Agent [16][25]; ~February 2026: Hyperknow 3.0 with Canvas LMS integration [11][25].

**Traction signals.** A DEV review praises "typing a URL and getting a rendered educational video in 2 minutes", Deep Learn sessions and citation accuracy, while noting the proactive system "works best when you upload structured materials" [15]. There is an official YouTube channel, a launch video and a Portuguese walkthrough [12][13][14], ZhenFund-syndicated Chinese coverage and a Bilibili founder talk [25][26][27]. No Product Hunt listing or Reddit thread was found. Status page: 99.858% uptime, incidents of 2-35 minutes in early 2026 [10].

## Course generation pipeline

Officially: "turns a topic, textbook, or stuck concept into a 1:1 course with units, lessons, practice, projects, and an interactive whiteboard" [17]; e.g. "build a beginner-friendly learning plan for machine learning from zero" [2]. The mechanics below are from the captured protocol [30-RE].

```
 learner query (+ uploads, + optional Canvas selection)
   │  start_course_generation{query, ui_language, course_uuid, attachment_paths[],
   │                          course_source_mode:"self_study", interactive_structure}
   ▼
 [intent router] -- one-off request? --> course_generation_rejected{reason_code:"one_off_artifact"}
   ▼
 [boot] → [researching_the_web]  up to 5 rounds: keywords → results{id,title,url,domain}
   │                                → round summary → "Selected N web source(s)" reference_ids[]
   ▼                                (lesson text cites sources as [refId])
 [generating_initial_syllabus]
   ▼
 [course_generation_questions]  4 × {question, options[{title,description}], is_multiple, allow_custom,
   │                                 category: prerequisite|course_specific|target_level|course_scale}
   ▼  answers
 [generating_course_structure] → {courseTitle, courseDescription, targetLearner, units[]}
   │  learner edits: structure/edit | apply | discard | regenerate | undo
   ▼  course_structure_confirm
 [generating_session_outlines]  "session_outline:<unitId>:<sessionId>" → key_points[], lecture outline
   ▼
 [generating_assessments]  practice (per session) · exam (per unit) · project (stages/steps per unit)
   ▼
 course_generation_complete{course} → optional course-calendar/draft → dated sessions
   ▼  study time
 whiteboard WS (board/speak/image/animation/ask + TTS, interjection) · Deep Learn plan · practice/exam/project REST
```

**Research and grounding.** Progress frames read "Researching the web (round n/5)", "Round n fetched N page(s)", "Round n summary ready", "Selected N web source(s)" with `reference_ids`, and course text references sources as `[refId]` [30-RE]. A clone author summarizes the live behavior as "the agent researches university syllabi, asks 4 profile questions (prior knowledge / lens / mastery / scale), then streams a full course unit-by-unit" [31-RE]. Uploads enter via `attachment_paths` (S3-backed, with conversion, summary and thumbnail jobs scheduled on upload) and Canvas via `canvas_selection` [30-RE]. Official grounding claims: page-level citation for uploads [5] and "10+ citations per response" in Deep Learn [3].

**Outline first, then lessons.** `GET .../structure` returns `{courseTitle, courseDescription, targetLearner, units[...]}`; each session later carries model-generated `key_points[]` that persist with the course and drive the whiteboard outline panel (a `-live` marker shows the point being taught) [30-RE]. A clone mirroring the UI encodes Unit → Lecture → Session with `sessionTime` (10-45 min), depth tags (`intuition, definition, derivation, application, advanced`), unit `objectives`/`completionCriteria` and `prerequisites: [unitId]` "strictly acyclic (DAG)" [32-RE]; since server prompts are invisible to a client, treat that schema as reconstruction **[inference]**.

**Assessment layer.** Practice: 10-second timer per question, base 600 points, +200 fast bonus, streak bonus, and the UI states the set is marked "mastered" only when every answer is correct. Exam: per unit, 30-minute client-side timer, `POST exam/score`. Project: `projects[{final_deliverable}]` with `stages[{unit_id, deliverable_increment, steps[]}]`, a hint-only assistant and read-only server state (no grading endpoint found) [30-RE]. One-off `generate_quiz` and `generate_flashcards` tools exist; no spaced-repetition scheduler was observed, and the calendar places course objects via `course-calendar/draft{start_date, duration_days, preferred_weekdays}` [30-RE].

**Teaching surfaces.** Whiteboard sessions replay `group.actions[]` of types `board, speak, image_generation, highlight, circle, keypoint_complete, new_page, new_column, animation, ask, done, reward_user`; `ask` is multiple-choice (`correct_index`, `explanation`) or open; images are 512x512 `gemini_image` or crops of the uploaded slide (`source:"reference_page"`); animations are self-contained HTML under a strict CSP; voice interjection uses client-side Silero VAD and 24 kHz PCM streaming [30-RE]. The video tool runs `script_writing → generate_narration → code_generation → video_render × scenes → compose`, rendering scenes with Manim or Remotion [30-RE]; the official blog confirms "actual Manim animation code, not pseudocode" and ~2-minute output [4][15].

**Agent loop and models.** A `directorAgent` emits a thinking phase then `tool_selection{tool_name, model_name, response_style, guideline}` over 28+ tools (`memory_recall, search_files, search_and_summarize_web, generate_content, generate_cheatsheet, course_generation, create_deep_learn_session, add_to_calendar, add_memory ...`) and six skills (`conceptExplanation, systematicLearning, whiteboardSession, cheatsheetGeneration, planTasks, documentReading`); `speed_mode=fast` disables memory, questions and search [30-RE]. The only model name seen is `gemini-3-flash-preview`; diagrams are tagged `gemini-image` [30-RE]. HyperKnow does not name vendors; the privacy policy says content goes to "third-party AI model or infrastructure providers acting as service processors" and lists Stripe, Supabase, GCP and AWS as sub-processors [8].

**Memory.** `POST /memory/apply_memory_ops{operations[{memory_type: preference|knowledge|logistics|other, action}]}` [30-RE] backs the "Learner's Persona ... powered by a proprietary long-term memory system" [16]; quiz generation combines uploads with "user background and personalized memory to identify the most important knowledge points that users are least familiar with" [26].

**Latency, quality, updates, sharing, API.** Published timings: cheatsheet "roughly two minutes" [5], video ~2 minutes [15]; course-generation time is unpublished. Runs are logged as replayable event timelines and survive disconnects; Canvas changes arrive as `canvas-updates{newAssignments, changedDue, syllabusChanged, newModules ...}` [30-RE]. No evaluation method or hallucination policy was found. Courses are per-user objects (`/app/cache/database/user_data/<user_id>/coursesData/<course_uuid>`); a marketplace exists (33 course objects captured; `marketplace/courses/{id}/enroll`), conversations can be shared via `/share/c/<id>`, and `course-publish/availability` returned 404 in every capture, so learner publishing was not live in September 2026 [30-RE]. There is no public API or SDK; "no public Agent Skills repository; the workflows are locked inside the product" [33].

## Knowledge tree/graph

**Decomposition.** An LLM decomposes the topic top-down after web research into a strict tree: course → units → (lectures) → sessions → key points/steps [30-RE][32-RE]. Scale follows the `course_scale` answer (clone prompt: overview 3-4 units, systematic 6-8, deep 8-12) [32-RE]. Deep Learn uses a two-level plan `session_task_plan[{unit_name, tasks[{task_id "1.1"}]}]` with `step_completion{requires_acknowledgment:true}` gating progress [30-RE].

**Prerequisites.** Nothing observed infers prerequisites from content or a global concept graph. "Prerequisite" is one of the four question categories (the learner declares prior knowledge), and the clone's architect prompt asks the model to emit unit-level `prerequisites` as a DAG [30-RE][32-RE]. **[inference]** Ordering inside a course is an LLM judgment at generation time; no nodes are shared across courses.

**Mastery and progress.** `progress-status` returns `{examScores{unitId}, practiceStats{sessionId:{started,finished,correct,total}}, projectStages{stageId:{touched,completed}}, examStarted{}}`; `generation-status` carries `practiceBySession{sessionId:"locked"|...}` [30-RE]. Practice mastery is binary. A third-party audit rates long-term memory "medium" ("learning style / Memory profile, cannot be opened as a map") and visual knowledge structure "medium" ("explainer videos, no concept map") [33].

**Visualization and scope.** No node-link or zoomable graph appears in protocol, CSS or reviews. What exists: a syllabus sidebar ("white minimal, Inter font, large central search box ... left syllabus directory, answer area with book page left and source cards right" [34]), a course "journey" page whose next-step pill is colored by `session_type` (learn/practice/project/exam) [30-RE], the whiteboard key-point panel and inline diagrams. The manifesto's "reassembling [knowledge] into structures that can be understood, transferred, and reused" [6] is aspirational **[inference]**. Everything is per-user; only marketplace courses are shared [30-RE].

## Back-end and architecture signals

- **Hosts.** www.hyperknow.io (marketing, legal), agent.hyperknow.io (code-split SPA, chunks like `ExamPage-*.js`, 55 stylesheets), api.hyperknow.io (REST `/api/v1/*` plus five WebSocket channels: chat, whiteboard, course-generation, pdf-annotation, deep-learn), dev-api.hyperknow.io, chat.hyperknow.io, status.hyperknow.io [9][10][30-RE].
- **Framework fingerprints.** Validation errors have FastAPI/Pydantic shape (`{"detail":[{"type":"missing","loc":["body","duration_days"]}]}`), so the API is Python/FastAPI **[inference]**; `/app/cache/database/user_data/...` suggests containerised, file-per-user storage **[inference]** [30-RE]. Front end: KaTeX, pdf.js, tiptap (cheatsheet editor), Mermaid, Virgil/Xiaolai handwriting fonts with SVG turbulence filters for the board [30-RE][31-RE]. Clones assert HyperKnow uses LangChain without proof **[unverified]** [31-RE].
- **Identity, billing, growth.** Supabase JWTs (`iss=.../auth/v1`, project `mcpbxxrodqgsmatssajx.supabase.co`), 2-hour access tokens; Stripe plans and coupons; Dub links (`dub_click_id`, affiliate join); referral codes; Microsoft Clarity and an `aplo-evnt.com` intent pixel [30-RE]; sub-processors Stripe, Supabase, GCP, AWS [8].
- **Storage and media.** Public S3 bucket `nutcracker-hyperknow-public` (us-east-2); diagrams, animations, videos and whiteboard audio are served from unauthenticated api.hyperknow.io URLs; the RE authors also report an unauthenticated shared-conversation endpoint [30-RE].
- **Models and tooling.** `gemini-3-flash-preview`; `gemini_image` and `mermaid` diagram subtypes; Manim + Remotion; six branded TTS voices (`warm|calm|bright|gentle|firm|lively`, vendor undisclosed); Silero VAD v5 via onnxruntime-web [30-RE].
- **Integrations.** Canvas LMS (`canvas_lms{}`, `canvas_selection`, 12-field `canvas-updates`), Google Calendar connector status, Drive-style knowledge base with "Add to calendar" [2][30-RE].
- **People and process.** No job postings, engineering blog, docs, changelog or GitHub organization; the `hyperknow-dev` account has no public repos [36]. Founder talks exist on Bilibili and in ZhenFund-syndicated interviews [25][26][27]. All protocol detail dates from 3-16 September 2026 and may be stale.

## Comparable products table

| Product | How it builds structure | Distinctive |
|---|---|---|
| Oboe [38][39] | Diagnostic conversation, then a "multi-agent architecture" with parallel agents for architecture, verification, scripts, images and audits | Closest commercial analog; course in seconds, nine formats |
| Khanmigo / Khan Academy [40][41][42] | Hand-built course → unit → lesson → skill with Attempted/Familiar/Proficient/Mastered; Khanmigo is given "a student's mastery of a skill and its prerequisites" | Curated prerequisite graph plus Socratic tutor; no generation |
| Google Learn About / LearnLM [43][44] | Conversational answers with "Interactive Lists" drill-downs and quizzes; LearnLM fine-tuned for pedagogy | Navigational structure, no persistent learner graph |
| OpenAI Study Mode [45] | "Custom system instructions" with pedagogy experts; scaffolded Socratic turns | Prompt-level only |
| NotebookLM [46][47] | "Mind Maps turn a notebook's selected sources into an expandable concept tree"; nodes open grounded, cited chats | Best grounded, source-bounded tree |
| Learney [48][49] | Community-curated "concepts as nodes, with edges representing prerequisites", continuous short-question assessment, shortest path to goal | True prerequisite graph with progress |
| Hyperskill [50] | "Thousands of topics ... connected by prerequisites", tree and graph views | Mature production prerequisite map |
| Open Knowledge Graph [51] | 15,290 topics, 19 domains, prerequisite edges, 24-question calibration | Large open graph; edge provenance unclear |
| Vitsi AI [52] | "Nodes ... tiny bits of knowledge ... edges are the prerequisites"; MIT | Small open-source DAG |
| Learning Commons KG [53] | Standards, learning components, progressions ("Math Coherence Map") as JSONL; REST and MCP | Standards-aligned edge source for K-12 |
| Marble Skill Taxonomy [54] | 1,590 micro-topics, 3,221 hard/soft edges each with a `reason`, evidence criteria, age ranges | Harrington's spine; README has no grafting procedure |
| KnowGraph [55] | Hand-authored 142-concept graph; read → mentor → paraphrase → LLM-graded evaluate (0-120 rubric), local-first BYOK | Rubric-graded mastery on a graph |
| Coursebox [56] | "Maps your course outline, then builds the modules, quizzes and assessments underneath it"; user edits before lessons | Outline-first with approval, like HyperKnow |
| Mindgrasp / LearnWorlds AI [57][58] | Materials → lesson plans; LearnWorlds asks questions then drafts "5 sections" | Authoring tools, no learner model |
| Synthesis Tutor [59] | Placement assessment, then adaptive conversational math tutoring | Child-facing placement |
| Perplexity Pages [60] | Research reshaped into sections with inline citations and references | Citation-id pattern like `[refId]` |
| MindPal [61] | Generic multi-agent workflows; Bloom's-taxonomy lesson planner | Workflow builder |
| Obsidian Knowledge Brain / Knowledge Overview; AI-AnkiSync [62][63][64] | Notes → concept DAG; subject → chaptered course with review questions; notes → Anki | Local-first storage and review patterns |

## Techniques and references

1. **Reference Distance (RefD)**, Liang et al., EMNLP 2015 [65]: scores prerequisite direction from asymmetric reference patterns (A's text links to B far more than B's to A ⇒ B precedes A). Needs only Wikipedia or your own lesson texts; cheap and explainable.
2. **Concept maps from textbooks**, Wang et al., CIKM 2016 (code CMEB) [66][67]: jointly extracts key concepts and prerequisite edges from table-of-contents order plus Wikipedia features, evaluated on six subjects; applicable to "generated lessons → candidate concepts → edges".
3. **Representation learning and survey**: Pan et al., ACL 2017 (MOOC prerequisites) [68][69]; Bai et al., "Prerequisite Relation Learning: A Survey and Outlook", ACM Computing Surveys 2025 [70]; curated list [71]. The survey's four families (multi-source features for knowledge components, semantic features for learning objects, and the cross-enhanced variants) map the feature choices when you hold both a taxonomy and lesson text.
4. **LLM-era graph construction**: Graphusion (Yang, Li et al. 2024; code CGPrompt; TutorQA benchmark) does zero-shot triplet extraction with a global fusion step for entity merging and conflict resolution [72][73][74]; MAS-KCL (2025) learns knowledge-component graph structure with an LLM multi-agent loop and bidirectional feedback [75]. Both are prompt-plus-validation designs that run on local models.
5. **Knowledge tracing**: BKT (Corbett and Anderson 1995; `pip install pyBKT`, MIT) with prior/learn/guess/slip/forget per skill [76]; DKT (Piech et al. 2015) [77]; 2024 IEEE TLT survey [78]. For three children BKT is the right size; DKT needs far more data.
6. **Knowledge Space Theory / ALEKS** (Doignon and Falmagne) [79][80]: teach from the "outer fringe" (items whose prerequisites are mastered) and place adaptively in ~25-30 questions; this formalises how a generated mini-course attaches to an existing mastery map.

## Implications for a self-hosted, taxonomy-first app

**Worth borrowing.**
- The *confirmation-gated stage machine*: research → draft syllabus → scoping questions → editable structure → confirm → lessons → assessments. For Harrington the parent confirms proposed nodes and edges before anything touches the taxonomy.
- *Scoping questions by category*; `prerequisite` and `target_level` can be answered from mastery data, leaving only scale and interest to ask.
- *Research with citation ids* carried into lesson text as `[refId]`, plus a rejection path for one-off requests. Forcing every paragraph to cite a retrieved chunk is the most effective grounding device observed.
- *Per-session key points* as the atomic unit of assessment and progress; map each to a Marble micro-topic or a new child topic. This is the graft seam.
- *Typed memory* (`preference | knowledge | logistics`) as structured rows, which suits a no-names, fail-closed privacy posture.
- *Replayable generation logs*, since generation on a local model is long-running and the UI must re-attach.

**Not worth borrowing.**
- The tree-only course object with no cross-course nodes; new content should become graph nodes and edges, not a parallel tree.
- Opaque per-tool model routing, credit metering and 12-hour resets.
- Client-side exam timers and speed bonuses tuned to adults cramming.
- Public unauthenticated artifact URLs and analytics pixels.
- Letting the LLM emit prerequisite ids freely (`prerequisites: ["unit-1"]`); edges must be validated against the taxonomy.

**Hard problems.**
- *Grounding on a local model*: HyperKnow leans on five rounds of web search and Gemini-class models; a 7-14B local model needs a fixed curated corpus (curriculum pages, encyclopaedic sources, the family's books) and a strict cite-or-drop rule.
- *Prerequisite inference onto an existing taxonomy*: attach new nodes ("how volcanoes form") to Marble topics (plate tectonics, states of matter, heat) with hard/soft edges and a `reason`. Recipe: embed new key points, retrieve nearest Marble topics, ask the model for a typed edge with a reason, validate with RefD-style asymmetry on the retrieved sources, reject cycles.
- *Keeping the graph coherent*: enforce the DAG, cap fan-in, require at least one taxonomy parent and Marble-style evidence criteria per new node, and quarantine generated subgraphs until approved.
- *Cost and latency*: generate the outline synchronously and lessons lazily (first session now, the rest in the background), cache by topic, never block the child's session on generation.
- *Child-safe content*: HyperKnow is adult-facing with no visible content policy; a family app needs source allow-lists, a safety pass on every retrieved chunk, age tagging reused from Marble's `ageRangeStart/End`, and no external calls during the learner's session.
- *Evaluation*: HyperKnow publishes none. Start with parent-checked edge precision on a sample, KST fringe consistency after placement, per-lesson citation coverage, and BKT mastery versus parent notes; KnowGraph's rubric-graded "explain it back" is a cheap child-friendly signal.

## Open questions

- Which LLMs power generation, memory and the director agent beyond the observed `gemini-3-flash-preview`, and whether they run on GCP [8][30-RE].
- Whether the live course schema includes unit-level prerequisite ids and depth tags as the clone prompt assumes [32-RE].
- End-to-end course generation time and failure rates.
- Whether learner publishing and a community library have shipped since September 2026 [30-RE].
- Exact seed date (January vs August 2025) and headcount [16][18].
- Whether Canvas sync regenerates structure or only the calendar [30-RE].

## Sources

1. https://www.hyperknow.io/ (homepage, pricing; via search snippets)
2. https://www.hyperknow.io/blogs/3-minute-guide-hyperknow
3. https://www.hyperknow.io/blogs/study-with-ai
4. https://www.hyperknow.io/blogs/get-explainer-video
5. https://www.hyperknow.io/blogs/ai-cheatsheet-generator
6. https://www.hyperknow.io/manifesto
7. https://www.hyperknow.io/terms-of-service
8. https://www.hyperknow.io/privacy-policy
9. https://agent.hyperknow.io/
10. https://status.hyperknow.io/
11. https://x.com/hyperknow_ai?lang=en
12. https://www.youtube.com/@hyperknow-me
13. https://www.youtube.com/watch?v=ow89q9qD9dk
14. https://www.youtube.com/watch?v=aHw9n_-OAC4
15. https://dev.to/aniruddhaadak/i-gave-an-ai-my-study-materials-and-it-planned-my-entire-learning-schedule-hyperknow-is-not-just-53g
16. https://grokipedia.com/page/Hyperknow
17. https://www.theneuron.ai/digest/everything-that-happened-in-ai-today-thursday-october-1-2026/
18. https://www.forbes.com/profile/nutcracker-ai/
19. https://lapost.us/?p=80806
20. https://www.linkedin.com/in/leslie-jiang-75a808335/
21. https://www.linkedin.com/in/lexus-lingzhi-chen-4a30b81bb/
22. https://theorg.com/org/hyperknow
23. https://www.aitoolnet.com/hyperknow
24. https://aikii.org/products/hyperknow
25. https://www.163.com/dy/article/KN0LO5300511B6FU.html
26. https://www.bilibili.com/video/BV13kP5zREiN/
27. https://m.aitntnews.com/newDetail.html?newId=19973
28. https://ai-bot.cn/hyperknow/
29. https://www.crunchbase.com/organization/hyperknow (unrelated company) and https://www.crunchbase.com/organization/hyperknow-6c43
30. https://github.com/LaplaceYoung/betterknow — hyperclone/spec/PROTOCOL.md, hyperclone/spec/DESIGN_GAPS.md, hyperclone/README.md (raw files fetched 2026-10-02) [RE]
31. https://github.com/junjiezhou1122/OpenHyperKnow — README.md, docs/PLAN.md [RE]
32. https://github.com/lizuyi-6/zaochang — HYPERKNOW.md, app/api/_lib/hyperknow/prompts.ts [RE]
33. https://github.com/kms9/ai-tutor-awesome — product/hyperknow/README.md (audit dated 2026-09-22)
34. https://github.com/MrParamecium/Fourier — workspace/memory/2026-04-07.md (UI description)
35. https://github.com/duxiaomeng1/hyperknow (namesake Gemini "Director Agent" demo, unrelated)
36. https://github.com/hyperknow-dev
37. https://discord.com/invite/WXhsUSxtGH
38. https://techcrunch.com/2025/09/10/after-selling-to-spotify-anchors-co-founders-are-back-with-oboe-an-ai-powered-app-for-learning/
39. https://www.allaboutai.com/ai-news/anchor-co-founders-return-with-oboe-an-ai-agent-that-builds-courses/
40. https://support.khanacademy.org/hc/en-us/articles/5548760867853--How-do-Khan-Academy-s-Mastery-levels-work
41. https://support.khanacademy.org/hc/en-us/articles/115002552631-What-are-Course-and-Unit-Mastery
42. https://blog.khanacademy.org/learning-in-the-open-what-ai-is-and-isnt-changing/
43. https://www.searchenginejournal.com/googles-ai-search-experiment-learn-about/532840/
44. https://blog.google/products-and-platforms/products/education/google-gemini-learnlm-update/
45. https://openai.com/index/chatgpt-study-mode/
46. https://blog.google/technology/google-labs/notebooklm-studying-help/
47. https://www.xda-developers.com/ways-i-use-notebooklms-mind-maps/
48. https://www.producthunt.com/products/learney-2
49. https://news.ycombinator.com/item?id=27651047
50. https://hyperskill.org/knowledge-map
51. https://openknowledgegraph.com/
52. https://github.com/oseducation/knowledge-graph
53. https://github.com/learning-commons-org/knowledge-graph
54. https://github.com/withmarbleapp/os-taxonomy
55. https://github.com/Felichz/KnowGraph
56. https://www.coursebox.ai/ai-curriculum-generator
57. https://www.mindgrasp.ai/productivity/ai-workbook-creator
58. https://www.learnworlds.com/docs/ai-course-creator/
59. https://opened.co/tools/synthesis
60. https://aigoestocollege.substack.com/p/pages-perplexityais-hidden-superpower
61. https://docs.mindpal.space/workflow
62. https://community.obsidian.md/plugins/knowledge-brain
63. https://community.obsidian.md/plugins/knowledge-overview
64. https://www.obsidianstats.com/plugins/ai-enhanced-anki-sync
65. Liang et al., "Measuring Prerequisite Relations Among Concepts", EMNLP 2015 — listed at https://github.com/harrylclc/concept-prerequisite-papers
66. https://clgiles.ist.psu.edu/pubs/CIKM2016-textbooks.pdf
67. https://github.com/dayouzi/CMEB
68. https://aclanthology.org/P17-1133.pdf
69. https://keg.cs.tsinghua.edu.cn/jietang/publications/ACL17-Pan-et-al-Prerequisite-Relationship-MOOCs.pdf
70. https://doi.org/10.1145/3733593
71. https://github.com/harrylclc/concept-prerequisite-papers
72. https://arxiv.org/abs/2407.10794
73. https://github.com/IreneZihuiLi/CGPrompt
74. https://huggingface.co/datasets/li-lab/tutorqa
75. https://arxiv.org/abs/2505.14126
76. https://github.com/CAHLR/pyBKT
77. https://www.researchgate.net/publication/278969484_Deep_Knowledge_Tracing
78. https://dl.acm.org/doi/10.1109/TLT.2024.3383325
79. https://www.aleks.com/about_aleks/knowledge_space_theory
80. https://www.aleks.com/about_aleks/Science_Behind_ALEKS.pdf
81. https://arxiv.org/pdf/1811.12640 (PREREQ, Roy et al.)
82. https://ojs.aaai.org/index.php/AAAI/article/view/32156 (global knowledge relation optimization, AAAI 2025)
83. https://arxiv.org/pdf/2608.03006 (ProPRL)
84. https://www.sohu.com/a/1081920028_413980 (VideoTutor / Kai Zhao, $11M seed — a different company, checked to avoid conflation)
