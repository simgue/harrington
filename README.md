# Harrington

**A family learning platform built around interests, projects, and clear paths
to mastery.**

Harrington is a family-specific fork of
[Homestead](https://github.com/tbh-23/Homestead). It keeps the useful learning
mechanics while we test a much smaller proof of concept: can Marble's connected
curriculum help parents see progress and possible paths to mastery without making
the child's day feel school-like, score-led, or predetermined?

Start with the [Harrington proof-of-concept brief](docs/POC.md) and its
[small learning spine](docs/POC-SPINE.md). Work is tracked in Linear on the
[Harrington](https://linear.app/karatgurk/team/HAR/overview) team; see
[docs/LINEAR.md](docs/LINEAR.md). Homestead remains an upstream code reference,
not a Harrington deployment or service dependency.

## Current self-hosted preview

Harrington no longer requires an external account. Its own Node server stores
family state, lesson caches, and recordings in a family-controlled data
directory. Lesson generation is optional: it stays fail-closed until you point
Harrington at a local OpenAI-compatible endpoint (Ollama is the documented
example). Commune is still disabled until it has an explicit self-hosted adapter.

This preview binds to the local computer only. Use synthetic learner names until
authentication, encrypted backups, and private remote access are implemented.
Never send a real child's name into a model prompt — generators use “your child”
and an age band only.

## Highlights

- **Mastery ladder** — Topics → Sections → Subjects, each gated at 90%+ so
  learning always builds on solid foundations.
- **Curriculum graph** — parents start at a subject and drill into domains,
  age-banded sections, and topics. Prerequisites and unlocks stay visible;
  mastery stays in the parent view.
- **Ready-to-teach lessons** — **Open full lesson** calls the family-controlled
  `/api/ai` adapter, then caches the result once per topic (`topic:{id}`) on the
  family server. Unconfigured servers keep returning 503. Do not pre-generate the
  whole taxonomy.
- **Verified tests (retained)** — generation and independent re-solving require
  a future AI provider adapter; digital and printable test mechanics remain.
- **Active recall (retained)** — generated memory cards require the same future
  provider adapter; the spaced-review mechanics remain.
- **Spaced practice** — mastery-test questions a child misses are queued and
  resurfaced on an expanding review schedule until they stick, extending spaced
  repetition from facts to problem-solving.
- **Adaptivity** — timed challenges and parent-approved difficulty increases when
  a child excels.
- **Adaptive daily calendar** — a day-by-day plan you can reschedule, mark done,
  and add extra practice to.
- **Records & voice capture** — log observations and store lesson recordings on
  the family server. AI coaching is disabled in this preview.
- **Harrington Helper (retained, disabled)** — the upstream AI coach remains in
  the codebase while a family-controlled provider interface is designed.
- **Retained for evaluation** — the inherited XP, levels, collectible badges,
  celebration effects, and full-screen **Kid Mode** remain in the codebase, but
  the POC does not expose Kid Mode through normal navigation.
- **Commune (retained, disabled)** — the shared-teaching experience remains for
  later migration to Harrington-owned infrastructure. It is not exposed in the
  preview navigation. The intended experience lets families team up in a private
  “commune,” approve and share what a child is working on for a given day, and
  cover each other's kids with a one-tap printable Day Sheet. Only the day's
  topics and an optional note are shared; each family's data stays on its own
  server.
- **Insights & notifications**, a **streak tracker**, and a **downloadable guide**.

## Research-Backed Evidence

Harrington is built on learning-science foundations, not ad hoc design choices.
Each one below comes with its main caveat too — the lab effect and the
classroom effect aren't always the same size.

- **Mastery learning** — requiring students to reach a high level of
  proficiency (Harrington uses 90%+) on one unit before advancing to the next
  produces large, consistent achievement gains, especially for struggling
  learners. See Kulik, Kulik & Bangert-Drowns (1990), *Effectiveness of
  Mastery Learning Programs: A Meta-Analysis*, Review of Educational
  Research — [SAGE Journals](https://journals.sagepub.com/doi/10.3102/00346543060002265).
  *Caveat:* the largest effect sizes come mostly from shorter studies using
  experimenter-made tests aligned to the intervention; effects measured with
  independent, standardized tests over full courses tend to be smaller
  (though still positive). Mastery gating also only helps if there's a real
  remediation loop behind it, not just a repeated pass/fail gate.
- **Active recall (retrieval practice)** — testing yourself on material,
  rather than re-reading or re-watching it, produces stronger and more
  durable learning than nearly every other studied technique. See Dunlosky
  et al. (2013), *Improving Students' Learning With Effective Learning
  Techniques*, Psychological Science in the Public Interest —
  [APS summary](https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html).
  *Caveat:* the effect is strongest for material tested the same way it was
  practiced (facts, definitions, recall-type questions); it transfers less
  reliably to novel problem-solving or far-transfer tasks, which is part of
  why Harrington also spaces problem-solving retries, not just flashcards.
- **Spaced (distributed) practice** — spreading study of the same material
  over expanding intervals, instead of massing it into one session, is the
  other top-rated technique alongside testing. See Cepeda, Pashler, Vul,
  Wixted & Rohrer (2006), *Distributed Practice in Verbal Recall Tasks: A
  Review and Quantitative Synthesis*, Psychological Bulletin 132(3):
  354–380 — [author's copy](https://www.yorku.ca/ncepeda/publications/CPVWR2006.html)
  — and Hattie & Donoghue (2021), *A Meta-Analysis of Ten Learning
  Techniques*, Frontiers in Education —
  [open access](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2021.581216/full).
  Harrington's memory cards use a Leitner-style expanding schedule, and
  missed mastery-test questions are now queued for spaced retry the same
  way, extending the effect from facts to problem-solving.
  *Caveat:* the effect is less bulletproof in real classrooms than in the
  lab. A 2025 study in real primary-school settings found the retrieval
  (testing) effect held up, but the spacing-interval manipulation itself
  did not reach significance for those students — see [Retrieval practice
  enhances learning in real primary school settings, whether distributed or
  not](https://pmc.ncbi.nlm.nih.gov/articles/PMC12372469/).

## Commune — shared teaching

Homeschooling parents often share teaching duties. **Commune** lets a small
group of families do that inside Harrington without giving up their privacy.

**Intended design (not active in the preview):**

1. **Open the Commune tab** and either create a commune or join one with an
   invite code another family shares.
2. **Share a child's day.** For a day another parent is covering your child,
   choose “Share today's focus,” pick the child, the date, and the topics they
   should work on, add an optional note, and share it with the commune.
3. **Cover and teach.** When you're covering, the “Covering today” section shows
   each child shared with you. Choose **Teach** on a topic for the full lesson,
   or **Print day sheet** for one packet covering every child you have that day —
   lessons, activities, resources, and the sharing parent's note.

**What stays private:** only the topics a parent explicitly approves for that day
(plus an optional note) are ever shared. Progress, mastery, records, and
recordings never leave a family's own server. The covering parent's app rebuilds
each lesson locally from the shared topic, so *what and how to teach* is available
without ever exposing how the child is actually doing.

Commune is unavailable in the self-hosted preview. It will return only after its
membership and sharing service can be operated independently by Harrington.

## Tech

- Browser app: HTML + CSS + vanilla JavaScript (ES modules), styled with a
  locally built Tailwind stylesheet and vendored Lucide icons.
- Dependency-free Node server for static files, family state, lesson caches, and
  recordings.
- No external account or application bundler. `server.mjs` is the entry point;
  the committed browser assets are regenerated with `npm run build`.
- Marble remains an open runtime curriculum source. AI is optional and
  fail-closed until `HARRINGTON_AI_BASE_URL` and `HARRINGTON_AI_MODEL` are set.

## Running locally

Install and start Harrington:

```bash
npm install
npm start
```

Then open `http://127.0.0.1:4173`. No login is required. Private preview data is
written under `data/private/` and excluded from Git.

### Optional local model (Ollama)

Lesson generation stays off until both of these are set. There is no default
cloud URL or API key.

```bash
# Install Ollama from https://ollama.com, then pull one instruction model:
ollama pull llama3.2

export HARRINGTON_AI_BASE_URL=http://127.0.0.1:11434/v1
export HARRINGTON_AI_MODEL=llama3.2
# Optional. Ollama usually needs none; some reverse proxies want Bearer:
# export HARRINGTON_AI_API_KEY=your-proxy-token

npm start
```

Restart Harrington after changing these variables. `/api/health` reports
`aiConfigured: true` only when both the base URL and model are set. Inherited
client aliases (`small`, `strong`, `gpt-4o-mini`, `gpt-4o`) are mapped to
`HARRINGTON_AI_MODEL`; the adapter never calls a vendor by those names.

Local models can take a while to write lesson JSON. The adapter waits up to
three minutes (`HARRINGTON_AI_TIMEOUT_MS` to override) and then fails closed.

Docker on the same machine as Ollama typically needs
`HARRINGTON_AI_BASE_URL=http://host.docker.internal:11434/v1`. Do not publish a
key or a cloud endpoint in `compose.yaml`.

### URL-swap priming (same adapter, no batch job)

The adapter is URL-swappable. Point `HARRINGTON_AI_BASE_URL` at any
OpenAI-compatible `/v1` (Ollama, llama.cpp, vLLM, or a vendor/LiteLLM endpoint
on the family server) without code changes.

Do **not** pre-generate all ~1,590 Marble topics. The lesson cache is
generate-once per topic the family actually opens. If a local model's JSON is
weak, you may temporarily point at a stronger endpoint to fill **only the
topics you open** (or a small focus band later), then switch back to Ollama.
A cloud or vendor endpoint means topic text leaves the house. Never use Puter.
Never put learner names in prompts.

Chat / Harrington Helper is a later slice: interactive chat needs a live local
model, and progress or records must not be dumped into prompts. The same
`/api/ai` pipe would use whatever is configured.

Docker is also supported:

```bash
docker compose up --build
```

## Deployment

The included container stores private data in the `harrington-data` volume and
publishes only to `127.0.0.1:4173`. This is safe for a local preview, but it is
not a production internet deployment: authentication, TLS, encrypted backups,
and restore testing must be added before remote access.

## The curriculum data

The curriculum is **not** committed to Git. The local Harrington server fetches
the open-source **Marble Skill Taxonomy** once, caches it under
`data/private/taxonomy/`, and serves it to the browser at `/api/taxonomy/*`:

- https://github.com/withmarbleapp/os-taxonomy

The first launch needs the network for that download. Later launches use the
on-disk cache. The app notifies you when topics are added or removed upstream.

## Licensing

Harrington is derived from Homestead under the MIT License. The original
copyright and licence notice are preserved, and Homestead remains configured as
the `upstream` Git remote for future comparison and selective updates.

- **Application code:** MIT — see [`LICENSE`](LICENSE).
- **Curriculum data:** licensed separately by its authors (ODbL 1.0 for the
  database, CC BY-SA 4.0 for the text) and **must be attributed**. See
  [`NOTICE`](NOTICE) and [`DATA-LICENSE.md`](DATA-LICENSE.md) for details and
  obligations.

Using the taxonomy inside this app is a "produced work," so the MIT license on
the code is compatible — you only owe attribution (and share-alike if you ever
redistribute a *modified copy of the dataset itself*).

### Required attribution

> Marble Skill Taxonomy (v1) · © Generative Spark, Inc. (Marble) ·
> https://withmarble.com · licensed under ODbL 1.0 (database) and
> CC BY-SA 4.0 (content).

## Contributing

Work is tracked in Linear, not GitHub Issues. See [`docs/LINEAR.md`](docs/LINEAR.md).
Pull requests are welcome. By contributing, you agree your contributions are
licensed under the MIT License. Please don't commit copies of the taxonomy
dataset into this repository — Harrington caches it locally at runtime.
