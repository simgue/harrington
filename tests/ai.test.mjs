import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// Every prompt leaves through backend.chat(), which POSTs to /api/ai. ES module
// exports cannot be reassigned, so the mock sits one step lower, on fetch: it
// records each /api/ai body (what backend.chat would send) and answers with a
// completion every builder can parse. Store saves and the taxonomy load are
// answered here too, so nothing reaches the network.
const sent = [];
const COMPLETION = JSON.stringify({ objective: 'ok', questions: [], results: [], cards: [], printables: [], materials: [] });
const TAXONOMY = {
  'topics.json': { topics: [
    { id: 'count-to-5', name: 'Count to 5', subject: 'Mathematics', domain: 'Number', ageRangeStart: 4, ageRangeEnd: 6, description: 'Count five objects.', evidence: [] },
    { id: 'letter-sounds', name: 'Letter sounds', subject: 'English', domain: 'Phonics', ageRangeStart: 4, ageRangeEnd: 6, description: 'Say letter sounds.', evidence: [] },
  ] },
  'dependencies.json': { dependencies: [] },
};
globalThis.fetch = async (path, options = {}) => {
  const url = String(path);
  const json = (body, ok = true) => ({ ok, status: ok ? 200 : 404, headers: new Headers({ ETag: '"v1"' }), json: async () => body });
  if (url === '/api/ai') {
    sent.push(JSON.parse(options.body));
    return json({ content: COMPLETION });
  }
  if (url.startsWith('/api/taxonomy/')) {
    const body = TAXONOMY[url.slice('/api/taxonomy/'.length)];
    return json(body || {}, !!body);
  }
  return json({});
};

const ai = await import('../src/js/ai.js');
const store = await import('../src/js/store.js');
const { loadTaxonomy } = await import('../src/js/data.js');
const { buildExplainPrompt, buildLessonPrompt, redactNames } = ai;

const repoRoot = new URL('..', import.meta.url);
const source = (path) => readFile(new URL(path, repoRoot), 'utf8');

const topic = {
  id: 'count-to-5',
  name: 'Count to 5',
  subject: 'Mathematics',
  domain: 'Number',
  ageRangeStart: 4,
  ageRangeEnd: 6,
  description: 'Count five objects.',
  evidence: ['Says numbers in order'],
};

// A fictional learner whose name cannot collide with prompt text.
const LEARNER = 'Zebulon Quixote';
const LEAK = /zebulon|quixote/i;
const NOTE_MARKER = 'tangerine-umbrella';
const sid = store.addStudent(LEARNER, 2019);
store.addStudent('Sample Nine', 2018); // a sibling; their name is redacted too
store.setActiveStudent(sid);

const transcript = `Parent: How many apples, Zebulon?\nZebulon: Five! That's Zebulon's answer.\nParent: Good, ZEBULON QUIXOTE. Sample said four.`;
const note = `${NOTE_MARKER}: Zebulon Quixote counted past five on his own.`;
const records = [
  { type: 'observation', rating: 4, note, title: 'Zebulon counted', topicName: 'Count to 5' },
  { type: 'question', rating: null, note: `${NOTE_MARKER} Quixote asked why`, title: '', topicName: 'Letter sounds' },
];
const stats = { mastered: 1, total: 4, pct: 25, inProgress: 2 };

const outgoing = () => sent.map(b => b.messages.map(m => m.content).join('\n')).join('\n');

// Every exported function that builds or sends a prompt, called with every
// name-bearing input it could be given (including stale `studentName` and
// `childName` arguments that callers used to pass).
const PROMPT_CALLS = {
  buildExplainPrompt: () => ai.buildExplainPrompt(topic, LEARNER),
  buildLessonPrompt: () => ai.buildLessonPrompt(topic, LEARNER),
  buildDiscussionPrompt: () => ai.buildDiscussionPrompt({ studentName: LEARNER, age: 6, topic, transcript, note, includeNotes: true }),
  buildFeedbackPrompt: () => ai.buildFeedbackPrompt({ studentName: LEARNER, age: 6, subject: 'Mathematics', stats, recentTopics: [{ name: 'Count to 5', status: 'learning' }], records, includeNotes: true }),
  aiExplain: () => ai.aiExplain(topic, LEARNER),
  aiQuiz: () => ai.aiQuiz(topic, LEARNER),
  aiLesson: () => ai.aiLesson(topic, LEARNER),
  aiPrintables: () => ai.aiPrintables(topic, LEARNER),
  aiActivityDetail: () => ai.aiActivityDetail(topic, { title: 'Apple count', body: 'Count apples together.' }, 'activity'),
  aiMasteryTest: () => ai.aiMasteryTest({ studentName: LEARNER, subject: 'Mathematics', age: 6, topicNames: ['Count to 5'], mode: 'digital', topic }),
  aiChallenge: () => ai.aiChallenge({ studentName: LEARNER, subject: 'Mathematics', age: 6, topic }),
  aiRecallCards: () => ai.aiRecallCards(topic, 6),
  verifyTest: () => ai.verifyTest({ questions: [{ type: 'multiple_choice', q: '2+3?', options: ['4', '5'], answer: 1 }] }),
  aiDiscussionAnalysis: async () => {
    await ai.aiDiscussionAnalysis({ studentName: LEARNER, age: 6, topic, transcript, note });
    await ai.aiDiscussionAnalysis({ studentName: LEARNER, age: 6, topic, transcript, note, includeNotes: true });
    await ai.aiDiscussionAnalysis({ studentName: LEARNER, age: 6, topic, transcript: '', note, includeNotes: true });
  },
  aiFeedback: async () => {
    await ai.aiFeedback({ studentName: LEARNER, age: 6, subject: 'Mathematics', stats, recentTopics: [], records });
    await ai.aiFeedback({ studentName: LEARNER, age: 6, subject: 'Mathematics', stats, recentTopics: [], records, includeNotes: true });
  },
  aiParentChat: () => ai.aiParentChat(
    [{ role: 'user', content: 'Zebulon keeps mixing up 4 and 5.' }, { role: 'assistant', content: '' }, { role: 'user', content: "What should Quixote's next step be?" }],
    `Student: ${LEARNER}, age 6.`,
  ),
};
// Exports that neither build nor send a prompt.
const NOT_PROMPTS = new Set(['promptLearnerLabel', 'safeCalc', 'normalizeTest', 'redactNames', 'redactLearnerNames', 'summarizeRecords']);

test('every exported prompt function is covered by the name guard', () => {
  const exported = Object.entries(ai).filter(([, v]) => typeof v === 'function').map(([k]) => k);
  const uncovered = exported.filter(k => !(k in PROMPT_CALLS) && !NOT_PROMPTS.has(k));
  assert.deepEqual(uncovered, [], 'add new prompt functions to PROMPT_CALLS in this test');
});

test(`no prompt function sends a learner name, with "${LEARNER}" in state`, async () => {
  for (const [name, call] of Object.entries(PROMPT_CALLS)) {
    sent.length = 0;
    const result = await call();
    if (name.startsWith('build')) {
      assert.equal(typeof result, 'string');
      assert.doesNotMatch(result, LEAK, `${name} interpolated a learner name`);
      assert.doesNotMatch(result, /Sample Nine|\bSample\b/, `${name} interpolated a sibling's name`);
    } else {
      assert.ok(sent.length > 0, `${name} sent nothing to backend.chat`);
      assert.doesNotMatch(outgoing(), LEAK, `${name} sent a learner name`);
      assert.doesNotMatch(outgoing(), /\bSample\b/, `${name} sent a sibling's name`);
    }
  }
});

test('discussion analysis sends a redacted transcript and leaves notes out unless opted in', async () => {
  sent.length = 0;
  await ai.aiDiscussionAnalysis({ age: 6, topic, transcript, note });
  const withoutOptIn = outgoing();
  assert.match(withoutOptIn, /How many apples, the child\?/);
  assert.match(withoutOptIn, /That's the child's answer/);
  assert.match(withoutOptIn, /your child \(age 6\)/);
  assert.doesNotMatch(withoutOptIn, new RegExp(NOTE_MARKER), 'notes were sent without the opt-in');

  sent.length = 0;
  await ai.aiDiscussionAnalysis({ age: 6, topic, transcript, note, includeNotes: true });
  const withOptIn = outgoing();
  assert.match(withOptIn, new RegExp(`${NOTE_MARKER}: the child counted past five`));
  assert.doesNotMatch(withOptIn, LEAK);
});

test('a discussion with notes only and no opt-in sends no notes', () => {
  const prompt = ai.buildDiscussionPrompt({ age: 6, topic, transcript: '', note, includeNotes: false });
  assert.doesNotMatch(prompt, new RegExp(NOTE_MARKER));
  assert.match(prompt, /did not share a transcript or notes/);
});

test('progress review summarizes records as counts and topic names unless opted in', async () => {
  sent.length = 0;
  await ai.aiFeedback({ age: 6, subject: 'Mathematics', stats, recentTopics: [], records });
  const summary = outgoing();
  assert.match(summary, /2 records \(1 observation, 1 question\)/);
  assert.match(summary, /Topics they mention: Count to 5; Letter sounds/);
  assert.match(summary, /Average parent confidence rating: 4\.0\/5/);
  assert.doesNotMatch(summary, new RegExp(NOTE_MARKER));
  assert.doesNotMatch(summary, /counted/, 'record titles are parent text too');

  sent.length = 0;
  await ai.aiFeedback({ age: 6, subject: 'Mathematics', stats, recentTopics: [], records, includeNotes: true });
  const shared = outgoing();
  assert.match(shared, /The parent chose to share these notes/);
  assert.match(shared, new RegExp(`${NOTE_MARKER}: the child counted past five`));
  assert.doesNotMatch(shared, LEAK);
});

test('redactNames replaces whole names, possessives and any case', () => {
  const names = ['Zebulon Quixote', 'Zebulon', 'Quixote'];
  assert.equal(redactNames('Zebulon Quixote said hi', names), 'the child said hi');
  assert.equal(redactNames("zebulon's cup and QUIXOTE’s hat", names), "the child's cup and the child’s hat");
  assert.equal(redactNames('Zebulon\nQuixote', names), 'the child', 'a full name across a line break');
  assert.equal(redactNames('Ask Zebulon, then Zebulon.', names), 'Ask the child, then the child.');
  assert.equal(redactNames('', names), '');
  assert.equal(redactNames(null, names), '');
});

test('redactNames treats names that are common words as whole words only', () => {
  const names = ['Will', 'Rose'];
  assert.equal(redactNames('Will is willing; rose roses arose. Will’s turn.', names), 'the child is willing; the child roses arose. the child’s turn.');
  assert.equal(redactNames('Alexander and Xander', ['Xander']), 'Alexander and the child');
  assert.equal(redactNames('Dr. O(Neil)', ['O(Neil)']), 'Dr. the child', 'regex characters in a name are literal');
});

test('redactLearnerNames covers every learner in state, not only the active one', () => {
  assert.equal(ai.redactLearnerNames('Zebulon and Sample Nine and Nine-pins'), 'the child and the child and the child-pins');
});

test('the assistant context carries no name and no parent notes', async () => {
  await loadTaxonomy();
  store.setStatus(sid, 'count-to-5', 'learning');
  store.addRecord(sid, { type: 'observation', note, title: 'Zebulon at the table', topicId: 'count-to-5', topicName: 'Count to 5' });
  const { buildContext } = await import('../src/js/views/assistant.js');
  const context = buildContext();
  assert.doesNotMatch(context, LEAK);
  assert.doesNotMatch(context, new RegExp(NOTE_MARKER));
  assert.match(context, /your child, age \d+/);
  assert.match(context, /Currently working on: Count to 5/);
  assert.match(context, /1 record \(1 observation\)/);
});

test('views stop passing the learner name into prompt builders', async () => {
  const [records, recordings, insights, assistant] = await Promise.all([
    source('src/js/views/records.js'),
    source('src/js/views/recordings.js'),
    source('src/js/views/insights.js'),
    source('src/js/views/assistant.js'),
  ]);
  for (const src of [records, recordings, insights]) assert.doesNotMatch(src, /studentName/);
  assert.doesNotMatch(assistant, /\$\{s\.name\}/);
  // The opt-in is per request: both analysis views and the review read the box.
  assert.match(recordings, /Include my notes in this request/);
  assert.match(recordings, /Learner names are replaced with/);
  assert.match(records, /analysisOptIn\(/);
  assert.match(insights, /includeNotes: !!privacy\.querySelector\('\.include-notes'\)\?\.checked/);
});

test('lesson and explain prompts use a generic learner and age band, never a child name', () => {
  const secret = 'SecretChildXYZ';
  const lesson = buildLessonPrompt(topic, secret);
  const explain = buildExplainPrompt(topic, secret);

  for (const prompt of [lesson, explain]) {
    assert.doesNotMatch(prompt, new RegExp(secret));
    assert.match(prompt, /your child/i);
    assert.match(prompt, /ages 4-6/);
    assert.match(prompt, /Count to 5/);
  }
});

test('lesson generators and callers do not interpolate learner names into prompts', async () => {
  const [ai, lesson, printables, daysheet, topicView] = await Promise.all([
    source('src/js/ai.js'),
    source('src/js/views/lesson.js'),
    source('src/js/views/printables.js'),
    source('src/js/views/daysheet.js'),
    source('src/js/views/topic.js'),
  ]);

  assert.match(ai, /buildLessonPrompt/);
  assert.doesNotMatch(ai, /childName \|\| 'your child'/);
  assert.doesNotMatch(ai, /childName \|\| 'a young learner'/);
  assert.doesNotMatch(ai, /studentName/);
  assert.doesNotMatch(lesson, /childName \|\| student\?\.name/);
  assert.doesNotMatch(printables, /aiPrintables\(topic, student\?\.name\)/);
  assert.doesNotMatch(daysheet, /aiLesson\(topic, childName\)/);
  assert.doesNotMatch(topicView, /fn\(t, student\?\.name\)/);
  assert.match(lesson, /store\.aiAvailable\(\)/);
});
