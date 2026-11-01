// Printing a teaching guide (views/guideprint.js): the document is built from
// the curated record alone, escapes every value, ends with Marble's caveat and
// credit, and never names a learner.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { curateResearch, GUIDE_ATTRIBUTION } from '../src/js/teaching.js';
import { fmtDate } from '../src/js/ui.js';
import { guidePrintDocument } from '../src/js/views/guideprint.js';

// The same markup in every field that reaches the page, numbered so each one
// can be found escaped.
const H = (n) => `<img src=x onerror="alert(${n})">`;
const ESCAPED = (n) => `&lt;img src=x onerror=&quot;alert(${n})&quot;&gt;`;
const FIELDS = ['summary', 'activity title', 'step', 'insight', 'feedback', 'task', 'prompt', 'answer', 'follow-up',
  'error pattern', 'signs', 'next move', 'level gap', 'level partial', 'level full', 'source name', 'caveat', 'topic to go back to',
  'topic name', 'subject', 'domain'];
const h = (field) => H(FIELDS.indexOf(field));

const CAVEAT = 'Agent-authored teaching research and proposed learning activities; not empirically validated interventions.';
const topic = { id: 'mt_test000001', name: `Counting ${h('topic name')}`, subject: `Mathematics ${h('subject')}`, domain: `Counting ${h('domain')}`, ageRangeStart: 4, ageRangeEnd: 6 };

const record = {
  topicId: topic.id,
  confidence: 'internal-only',
  learn: {
    summary: `Summary ${h('summary')}`,
    activities: [
      { title: `Activity ${h('activity title')}`, learnerActions: ['Step one', `Step ${h('step')}`], intendedInsight: `Notice ${h('insight')}`, feedback: [`If wrong ${h('feedback')}`] },
      { title: 'Second activity', learnerActions: ['Only step'] },
    ],
  },
  assess: {
    method: 'two_tier',
    poeTask: `Task ${h('task')}`,
    diagnosticPrompt: `How many ${h('prompt')}`,
    correctAnswer: `Six ${h('answer')}`,
    probeDeeper: [`What if ${h('follow-up')}`],
    errorPatterns: [{ pattern: `Skips one ${h('error pattern')}`, revealedBy: `Says five ${h('signs')}`, nextMove: `Touch each ${h('next move')}`, reteachPrerequisiteId: 'mt_prereq0001' }],
    responseLevels: { gap: `Guesses ${h('level gap')}`, partial: `Counts twice ${h('level partial')}`, full: `Counts once ${h('level full')}` },
  },
  sources: [
    { source: `Common Core ${h('source name')}`, url: 'https://example.org/ccss?a=1&b=<2>' },
    { source: 'Bad link', url: 'javascript:alert(1)' },
  ],
};

const guide = { ...curateResearch(record), caveat: `${CAVEAT} ${h('caveat')}` };
const printedOn = new Date(2026, 10, 1);
const html = guidePrintDocument(topic, guide, {
  topicName: (id) => (id === 'mt_prereq0001' ? `One-to-one ${h('topic to go back to')}` : null),
  printedOn,
});
const text = html.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');

test('every field that reaches the page is escaped', () => {
  assert.doesNotMatch(html, /<img/);
  for (const [n, field] of FIELDS.entries()) assert.ok(html.includes(ESCAPED(n)), `${field} is on the page, escaped`);
  assert.match(html, /<title>Counting &lt;img/);
  // Sources as plain text URLs; a non-http link was already dropped.
  assert.match(html, /: https:\/\/example\.org\/ccss\?a=1&amp;b=%3C2%3E/);
  assert.doesNotMatch(html, /javascript:/);
  assert.doesNotMatch(html, /<a /, 'no links on paper');
});

test('the title block, every activity in full and the whole check', () => {
  assert.match(html, /<p class="kind">Teaching guide<\/p>/);
  assert.match(html, /Ages 4–6<\/p>/);
  for (const part of ['Summary', 'Second activity', 'Only step', 'What they should notice', 'If they take a wrong turn',
    'Check understanding', 'Predict, then explain', 'Try this', 'Ask', 'A strong answer', 'To dig deeper', 'Common wrong turns',
    'You may notice: Says five', 'Then try: Touch each', 'Go back to: One-to-one', 'Not yet', 'Getting there', 'Got it']) {
    assert.ok(html.includes(part), part);
  }
  assert.equal(html.match(/<section class="activity">/g).length, 2);
  // No <details>: nothing is folded away on paper. Activities do not split.
  assert.doesNotMatch(html, /<details/);
  assert.match(html, /\.activity,\.error,\.check-part\{break-inside:avoid/);
  // Internal metadata stays out.
  assert.doesNotMatch(html, /internal-only|confidence/);
});

test('Marble\'s caveat verbatim, the credit and the print date close the page', () => {
  const footer = html.slice(html.indexOf('<footer>'));
  assert.ok(footer.includes(CAVEAT));
  assert.ok(footer.includes(GUIDE_ATTRIBUTION));
  assert.ok(footer.includes('From the Marble Skill Taxonomy teaching research · © Generative Spark, Inc. (Marble) · CC BY-SA 4.0'));
  assert.ok(footer.includes('https://creativecommons.org/licenses/by-sa/4.0/'));
  // The viewer's own date format, as elsewhere in the app.
  assert.ok(footer.includes(`Printed from Harrington on ${fmtDate(printedOn)}`));
});

test('no learner on the page: no name, no name line, nothing about a child by name', () => {
  for (const word of ['Name:', 'Rowan', 'Sage', 'Wren', 'learner', 'Student']) {
    assert.ok(!text.includes(word), `the printed text does not mention "${word}"`);
  }
});

test('the lesson print\'s type scale, no colour fills, the printer\'s own paper size', () => {
  const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  assert.match(style, /body\{[^}]*font-size:16px/);
  assert.match(style, /h1\{font-size:26px/);
  // Nothing smaller than 13 px; Marble's caveat at body size, in ink.
  const sizes = [...style.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  assert.ok(Math.min(...sizes) >= 13, `smallest type ${Math.min(...sizes)} px`);
  assert.match(style, /footer \.caveat\{font-size:16px;color:#2e2a24\}/);
  assert.doesNotMatch(style, /background/);
  assert.doesNotMatch(style, /size:\s*(A4|letter)/i);
  assert.match(style, /@page\{margin:12mm\}/);
});

test('the print dialog opens only when asked', () => {
  assert.match(html, /window\.print\(\)/);
  assert.doesNotMatch(guidePrintDocument(topic, guide, { autoPrint: false }), /window\.print/);
});
