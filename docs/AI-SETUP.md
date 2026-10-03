# Setting up AI, one capability at a time

Harrington works without AI (see the README's
[What works without an AI provider](../README.md#what-works-without-an-ai-provider)).
About half of what you see can also use an AI provider: lessons, print & go
sheets, mastery tests, challenges, recall cards, activity instructions,
discussion analysis and progress reviews. This guide sets one up on the
family's own computer and switches it on **one capability at a time**,
starting with lessons only.

The plan (HAR-26):

1. Week one: no AI. Use the map, the calendar, records and manual mastery.
2. Week two: a local model, **lessons only**. Run the experiment script below
   and rate the lessons it writes.
3. Widen to other capabilities only when the lessons hold up (see
   [When to widen](#when-to-widen-capabilities)).

Lessons go first because they are the most forgiving: one call, one JSON
object, read by a parent who can skip a weak step. Mastery tests and
challenges are the least forgiving: they need strict JSON with an answer key,
and a second call that re-solves every question. Small local models often
fail one or the other.

## 1. Run a local OpenAI-compatible endpoint

Any server that answers `POST /v1/chat/completions` the way OpenAI does will
work: [Ollama](https://ollama.com), llama.cpp's `llama-server`, LM Studio or
vLLM. This guide uses Ollama.

```bash
# Install Ollama from https://ollama.com, then pull an instruction model:
ollama pull qwen2.5:7b
# Check it answers on the OpenAI-compatible path:
curl http://127.0.0.1:11434/v1/models
```

### Choosing a model for JSON reliability

Harrington asks for lessons as one JSON object and refuses anything that does
not parse or lacks the lesson's shape (a non-empty objective and at least one
teaching step). It does not use a provider's "JSON mode", so the model has to
follow the instructions on its own.

- **Start at 7 to 8 billion parameters**, instruction-tuned: for example
  `qwen2.5:7b` or `llama3.1:8b`. Instruction models in this range usually
  return clean JSON for lessons.
- **3B and smaller** (such as `llama3.2`) are fast but more often wrap the
  JSON in prose, cut it off, or drop fields. Fine for trying the plumbing, not
  for judging lessons.
- **Bigger is steadier but slower.** A 14B model is worth trying if the 7B
  lessons are thin and the computer has the memory (roughly 10 GB free for a
  4-bit 14B model).
- **Give it room to finish.** A lesson is about 1,000 to 1,500 tokens of
  output. If lessons stop mid-sentence, raise Ollama's context
  (`OLLAMA_CONTEXT_LENGTH=8192 ollama serve`, or `num_ctx` in a Modelfile).

The experiment script measures this for you, so try two models and compare
their reports rather than trusting any list.

### How long it takes

The adapter waits up to **three minutes** per request
(`HARRINGTON_AI_TIMEOUT_MS`, in milliseconds, to change it) and then fails
closed: the parent sees "took too long" with Try again, and nothing is cached.

- **The first generation is the slowest**: the model is loaded into memory
  first, which can take from a few seconds to a minute.
- After that, a 7B lesson typically takes **10 to 40 seconds** with a recent
  GPU or Apple silicon, and **1 to 3 minutes** on a CPU only. A CPU-only
  computer that keeps hitting the three-minute limit needs a smaller model or
  a longer timeout.
- Ollama unloads an idle model after five minutes. `OLLAMA_KEEP_ALIVE=1h`
  keeps it loaded during a teaching session.

Each lesson is generated once per topic and then served from the lesson cache.

## 2. Point Harrington at it, lessons only

```bash
export HARRINGTON_AI_BASE_URL=http://127.0.0.1:11434/v1
export HARRINGTON_AI_MODEL=qwen2.5:7b
export HARRINGTON_AI_CAPABILITIES=lesson
npm start
```

Restart Harrington after changing any of these. Docker on the same computer as
Ollama usually needs `HARRINGTON_AI_BASE_URL=http://host.docker.internal:11434/v1`.

`HARRINGTON_AI_CAPABILITIES` is a comma list of what `/api/ai` may forward:

| Capability | What it writes |
| --- | --- |
| `lesson` | the full lesson plan |
| `printables` | print & go sheets |
| `activity` | instructions for an activity or game idea |
| `test` | topic, section and subject mastery tests (two calls: write, then verify) |
| `challenge` | the timed challenge quiz (two calls) |
| `recall` | active recall cards |
| `analysis` | advice on a recorded or typed discussion |
| `review` | the progress review on Insights |
| `explain` | "Explain simply" on the topic page |
| `quiz` | "Make a mini-quiz" on the topic page |

Plural spellings (`lessons`, `tests`) work too. Unset, blank or `all` switches
on everything, which is what a configured provider did before this setting
existed. Unknown names are ignored and logged at startup. Nothing is switched
on without `HARRINGTON_AI_BASE_URL` and `HARRINGTON_AI_MODEL`.

What the family sees with `HARRINGTON_AI_CAPABILITIES=lesson`:

- "Open full lesson" works everywhere it appears, and so does "Generate a
  different version" inside a lesson.
- Every other AI control shows a quiet **Not switched on yet** link (instead of
  "Needs a local AI provider"). It opens the README's
  [Optional local model](../README.md#optional-local-model-ollama) section,
  which links here. The child view leaves those actions out.
- Anything generated earlier (print sheets, activity instructions, recall
  cards) still opens from the cache.
- `/api/health` reports `aiCapabilities: ["lesson"]`, and the server refuses
  any other request with 403 even if a page asks.

### Where the variables live

The settings are environment variables of the Harrington server process. They
never go in the app, in family data, or in a committed file. Pick one of:

- **Exported in the shell** before starting, as above. They last until that
  terminal closes.
- **A `.env` file** next to `package.json`, started with Node's built-in loader
  (Node 20.6 or newer, no dependency). `.env` and `.env.*` are already in
  `.gitignore`.

  ```bash
  # .env
  HARRINGTON_AI_BASE_URL=http://127.0.0.1:11434/v1
  HARRINGTON_AI_MODEL=qwen2.5:7b
  HARRINGTON_AI_CAPABILITIES=lesson
  ```

  ```bash
  node --env-file=.env server.mjs
  # the experiment reads the same file:
  node --env-file=.env scripts/ai-experiment.mjs --data-dir ./data/scratch --learner "Sample Nine" --age 6
  ```

- **Docker Compose**: keep the committed `compose.yaml` as it is and add a
  local `compose.override.yaml` (Compose merges it automatically; do not
  commit it) that points at the same `.env`:

  ```yaml
  services:
    harrington:
      env_file: .env
  ```

  An `environment:` block in that override works too. Never put a key or a
  cloud endpoint in `compose.yaml` itself.

Restart the server after any change, then check `http://127.0.0.1:4173/api/health`:
`aiConfigured` should be `true` and `aiCapabilities` should list what you
switched on (for example `["lesson"]`).

## Or: Gemini (cloud) example

The same adapter talks to Google's Gemini through Gemini's OpenAI-compatible
endpoint. No code change is needed; Harrington appends `/chat/completions` to
the base URL.

```bash
# .env (never committed)
HARRINGTON_AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
HARRINGTON_AI_MODEL=gemini-2.5-flash
HARRINGTON_AI_API_KEY=your-key-from-google-ai-studio
HARRINGTON_AI_CAPABILITIES=lesson
```

- Create the key in [Google AI Studio](https://aistudio.google.com/apikey).
  Use a current Gemini model id; `gemini-2.5-flash` is an example.
- Harrington sends the key to Google as an `Authorization: Bearer` header, from
  the server only. The browser never sees it, and `/api/health` never reports it.
- The key lives only in the server's environment (one of the ways above). Never
  commit it, paste it into `compose.yaml`, or type it into the app. If it is
  ever exposed, delete it in AI Studio and create a new one.
- A cloud model answers in seconds rather than minutes, so the three-minute
  timeout is rarely an issue. The experiment script works the same way against
  it, and its report records the model, so a local and a cloud run compare
  side by side.

**Privacy.** A cloud endpoint means prompts leave the house and are handled
under Google's terms. A lesson prompt contains the topic's name, subject,
domain, age band, description and mastery evidence, and no learner data:
prompts always say "your child", never a name (HAR-19). Other capabilities send
more: discussion analysis sends the transcript with learners' names redacted
(nicknames and other people's names go as spoken), and parent notes go only
when the parent ticks "Include my notes in this request" for that one request.
`HARRINGTON_AI_CAPABILITIES` is how to keep a cloud key to lessons only: the
server refuses every other request before anything reaches Google.

## 3. Run the lessons experiment

`scripts/ai-experiment.mjs` writes lessons for the next ten topics a learner's
daily choice would offer, using exactly the prompt the app uses, and writes a
report to `docs/experiments/<date>-lessons.md`. Use a **scratch data dir and a
fictional learner**, never the family's real data:

```bash
export HARRINGTON_AI_BASE_URL=http://127.0.0.1:11434/v1
export HARRINGTON_AI_MODEL=qwen2.5:7b
export HARRINGTON_AI_CAPABILITIES=lesson

node scripts/ai-experiment.mjs --data-dir ./data/scratch --learner "Sample Nine" --age 6
```

- `--learner` is read from the data dir's family state; with `--age`, a
  learner who is not there yet is used as a new learner with nothing
  mastered (nothing is written to the family state).
- `--topics id1,id2` (or bare ids) uses those topics instead.
- `--retries 1` (the default) allows one more attempt after an answer that is
  not usable; `--count` changes how many daily-choice topics.
- The script refuses to run when `HARRINGTON_AI_CAPABILITIES` does not
  include lessons, and every prompt goes through the same learner-name
  redaction as the app (the report counts any redaction; it should be 0).
- Usable lessons are saved to the scratch data dir's lesson cache
  (`--no-save` to skip), so you can read them in Harrington:
  `HARRINGTON_DATA_DIR=./data/scratch HARRINGTON_PORT=4180 npm start`, then
  open each topic and "Open full lesson".

The report has, per topic: attempts, latency, whether the answer was valid
JSON, whether it passed Harrington's lesson check, and token counts when the
endpoint reports them. The last two columns, **parent usability rating** and
**notes**, are blank for you to fill in after reading each lesson.

### What to look for

- **Usable on the first try.** Count the lessons that were valid JSON *and*
  passed the lesson check without a retry. Retries double the wait.
- **Latency.** Ignore the first row (model loading). If the median is near
  three minutes, the timeout will bite during real use.
- **Teachability.** Would you teach it as written? Are the examples specific
  (real numbers, words, objects) rather than filler? Is it right for the age?
  Are the parent tips about *this* topic?
- **Correctness.** Any wrong fact, sum or spelling is a 1 or 2, however well
  written.
- **American English** spelling throughout.

## When to widen capabilities

Widen one capability at a time, and only when the lessons experiment shows:

- at least 9 of 10 lessons usable, most on the first try;
- a median parent rating of 4 or more, and no factual errors;
- a median latency the family is happy to wait for.

A sensible order, from most to least forgiving: `printables`, `activity`,
`explain`, `recall`, `quiz`, `analysis`, `review`, then `test` and
`challenge` last. Tests and challenges need strict JSON with an answer key
and a second verification call per test; if the model struggles with lessons,
keep them off. Add a capability by extending the list
(`HARRINGTON_AI_CAPABILITIES=lesson,printables`) and restarting.

If a capability disappoints, take it back out of the list: what it already
wrote stays in the cache and keeps opening.

Using a cloud or vendor endpoint instead means prompts leave the house; see
[Or: Gemini (cloud) example](#or-gemini-cloud-example) and the README's
[URL-swap priming](../README.md#url-swap-priming-same-adapter-no-batch-job).
