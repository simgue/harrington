// Printing a teaching guide (views/guideprint.js): the document is built from
// the curated record alone, escapes every value, ends with Marble's caveat and
// credit, and never names a learner.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { curateResearch, GUIDE_ATTRIBUTION } from '../src/js/teaching.js';
import { guidePrintDocument } from '../src/js/views/guideprint.js';

const HOSTILE = '<img src=x onerror="alert(1)">';
const CAVEAT = 'Agent-authored teaching research and proposed learning activities; not empirically validated interventions.';
const topic = { id: 'mt_test000001', name: `Counting <b>& friends</b>`, subject: 'Mathematics', domain: 'Counting & Cardinality', ageRangeStart: 4, ageRangeEnd: 6 };

const record = {
  topicId: topic.id,
  confidence: 'internal-only',
  learn: {
    summary: `Summary with ${HOSTILE}`,
    activities: [
      { title: `Activity ${HOSTILE}`, learnerActions: ['Step one', `Step <two>`], intendedInsight: 'Notice "this"', feedback: ['If wrong, try again'] },
      { title: 'Second activity', learnerActions: ['Only step'] },
    ],
  },
  assess: {
    method: 'two_tier',
    poeTask: 'Watch them count six buttons.',
    diagnosticPrompt: 'How many?',
    correctAnswer: 'Six.',
    probeDeeper: ['What if one rolls away?'],
    errorPatterns: [{ pattern: 'Skips one', revealedBy: 'Says five', nextMove: 'Touch each', reteachPrerequisiteId: 'mt_prereq0001' }],
    responseLevels: { gap: 'Guesses', partial: 'Counts twice', full: 'Counts once, says six' },
  },
  sources: [
    { source: 'Common Core', url: 'https://example.org/ccss?a=1&b=<2>' },
    { source: 'Bad link', url: 'javascript:alert(1)' },
  ],
};

const guide = { ...curateResearch(record), caveat: CAVEAT };
const html = guidePrintDocument(topic, guide, {
  topicName: (id) => (id === 'mt_prereq0001' ? 'One-to-one <counting>' : null),
  printedOn: new Date(2026, 10, 1),
});

test('every value from the record and the taxonomy is escaped', () => {
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /Activity &lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /<h1>Counting &lt;b&gt;&amp; friends&lt;\/b&gt;<\/h1>/);
  assert.match(html, /<title>Counting &lt;b&gt;&amp; friends&lt;\/b&gt; — Teaching guide<\/title>/);
  assert.match(html, /Step &lt;two&gt;/);
  assert.match(html, /Go back to: One-to-one &lt;counting&gt;/);
  // Sources as plain text URLs; a non-http link was already dropped.
  assert.match(html, /Common Core: https:\/\/example\.org\/ccss\?a=1&amp;b=%3C2%3E/);
  assert.doesNotMatch(html, /javascript:/);
  assert.doesNotMatch(html, /<a /, 'no links on paper');
});

test('the title block, every activity in full and the whole check', () => {
  assert.match(html, /<p class="kind">Teaching guide<\/p>/);
  assert.match(html, /Mathematics &middot; Counting &amp; Cardinality &middot; Ages 4–6/);
  for (const text of ['Summary with', 'Second activity', 'Only step', 'What they should notice', 'Notice &quot;this&quot;',
    'If they take a wrong turn', 'If wrong, try again', 'Check understanding', 'Predict, then explain', 'Watch them count six buttons.',
    '“How many?”', 'A strong answer', 'Six.', 'To dig deeper', 'What if one rolls away?', 'Common wrong turns', 'Skips one',
    'You may notice: Says five', 'Then try: Touch each', 'Not yet', 'Getting there', 'Got it', 'Counts once, says six']) {
    assert.ok(html.includes(text), text);
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
  assert.match(footer, /Printed from Harrington on November 1, 2026/);
});

test('no learner name and no name line: the guide is not per-learner', () => {
  assert.doesNotMatch(html, /Name:|Rowan|Sage|Wren|learner/i);
  // The builder takes no learner at all.
  assert.equal(guidePrintDocument.length, 2);
});

test('paper only: no colour fills, the printer\'s own paper size', () => {
  const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  assert.doesNotMatch(style, /background/);
  assert.doesNotMatch(style, /size:\s*(A4|letter)/i);
  assert.match(style, /@page\{margin:12mm\}/);
});

test('the print dialog opens only when asked', () => {
  assert.match(html, /window\.print\(\)/);
  assert.doesNotMatch(guidePrintDocument(topic, guide, { autoPrint: false }), /window\.print/);
});
