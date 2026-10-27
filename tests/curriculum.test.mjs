import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACARA_NOTICE, YEARS, ageForYear, coverageReport, curriculumBoost, curriculumProblem, indexStandards,
  learnerYear, normalizeYear, rankByCurriculum, standardStatus, topicCodes, topicEvidence, topicStandards,
  trimStandards, yearForAge, yearLabel, yearsLabel, boosterFor,
} from '../src/js/curriculum.js';
import { validateDocument } from '../src/js/document.js';
import { laneOptions, LANES } from '../src/js/daily.js';
import { searchTopics } from '../src/js/finder.js';

// A small curriculum-standards.json in the taxonomy's shape.
const SOURCE = {
  note: 'test',
  curricula: [
    { slug: 'uk-nc-2013', topics: [{ key: 'uk-nc-2013:X', code: 'X', data: { title: 'not this one' } }] },
    {
      slug: 'acara-v9', name: 'Australian Curriculum, Version 9', version: 'v9', sourceUrl: 'https://v9.australiancurriculum.edu.au/',
      topics: [
        { key: 'acara-v9:AC9MFN01', code: 'AC9MFN01', data: { title: 'name, represent and order numbers', description: 'name, represent and order numbers', strand: 'Number', subject: 'Mathematics', learningArea: 'Mathematics', yearLevels: ['F'] } },
        { key: 'acara-v9:AC9M1N01', code: 'AC9M1N01', data: { title: 'recognise numbers  to 120', description: 'recognise numbers to 120', strand: 'Number', subject: 'Mathematics', learningArea: 'Mathematics', yearLevels: ['1'] } },
        { key: 'acara-v9:AC9M2N01', code: 'AC9M2N01', data: { title: 'order numbers to 1000', description: 'order numbers to at least 1000', strand: 'Number', subject: 'Mathematics', learningArea: 'Mathematics', yearLevels: ['2'] } },
        { key: 'acara-v9:AC9E2LY01', code: 'AC9E2LY01', data: { title: 'read texts', description: 'read texts', strand: 'Literacy', subject: 'English', learningArea: 'English', yearLevels: ['2'] } },
        { key: 'acara-v9:AC9HP2M01', code: 'AC9HP2M01', data: { title: 'move', description: 'move', strand: 'Movement and physical activity', subject: 'Health and Physical Education', learningArea: 'Health and Physical Education', yearLevels: ['2', '1'] } },
      ],
    },
  ],
};
const { standards } = trimStandards(SOURCE);
const index = indexStandards(standards);
const topic = (id, codes, extra = {}) => ({ id, name: id, subject: 'Mathematics', domain: 'Counting & Cardinality', ageRangeStart: 5, ageRangeEnd: 6, centrality: 0.5, standards: [...codes.map(c => `acara-v9:${c}`), 'ccss-math:K.CC.1'], ...extra });

test('normalizeYear reads Foundation and year levels in their common spellings', () => {
  for (const f of ['F', 'f', 'Foundation', ' foundation ', 'Prep', 'K', 'Kindergarten', 'Reception', 0, '0']) assert.equal(normalizeYear(f), 'F', String(f));
  assert.equal(normalizeYear('2'), '2');
  assert.equal(normalizeYear(2), '2');
  assert.equal(normalizeYear('Year 6'), '6');
  assert.equal(normalizeYear('y3'), '3');
  for (const bad of ['7', 'Year 7', '', null, undefined, 'F-2', '1.5', {}]) assert.equal(normalizeYear(bad), null, String(bad));
  assert.deepEqual(YEARS.map(yearLabel), ['Foundation', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6']);
  assert.equal(yearsLabel(['1', '2']), 'Year 1/Year 2');
});

test('the year from age: Foundation is 5, Year 6 is 11, clamped at both ends', () => {
  assert.equal(yearForAge(5), 'F');
  assert.equal(yearForAge(6), '1');
  assert.equal(yearForAge(11), '6');
  assert.equal(yearForAge(3), 'F');
  assert.equal(yearForAge(14), '6');
  assert.equal(yearForAge(null), null);
  assert.equal(ageForYear('F'), 5);
  assert.equal(ageForYear('2'), 7);
  assert.equal(ageForYear(null), null);
});

test('learnerYear reads only an Australian Curriculum setting', () => {
  assert.equal(learnerYear({ curriculum: { id: 'acara-v9', year: '2' } }), '2');
  assert.equal(learnerYear({ curriculum: { id: 'other', year: '2' } }), null);
  assert.equal(learnerYear({}), null);
  assert.equal(learnerYear(null), null);
});

test('the validator accepts an absent or valid curriculum and refuses a malformed one', () => {
  const doc = (curriculum) => ({ students: [{ id: 's_1', name: 'Rowan Example', birthYear: 2019, ...(curriculum === undefined ? {} : { curriculum }) }] });
  assert.equal(validateDocument(doc(undefined)), null);
  assert.equal(validateDocument(doc(null)), null);
  for (const y of YEARS) assert.equal(validateDocument(doc({ id: 'acara-v9', year: y })), null, y);
  // A curriculum from a newer Harrington is kept.
  assert.equal(validateDocument(doc({ id: 'nz-2026', year: 'Year 3' })), null);
  assert.match(validateDocument(doc({ id: 'acara-v9', year: '7' })), /Rowan Example.*Australian Curriculum year other than F or 1 to 6/);
  assert.match(validateDocument(doc({ id: 'acara-v9', year: 2 })), /Australian Curriculum year/);
  assert.match(validateDocument(doc({ id: 'acara-v9', year: 'Foundation' })), /Australian Curriculum year/);
  assert.match(validateDocument(doc('acara-v9')), /curriculum setting that is not in the expected shape/);
  assert.match(validateDocument(doc([])), /curriculum setting that is not in the expected shape/);
  assert.match(validateDocument(doc({ year: '2' })), /without a curriculum id/);
  assert.equal(curriculumProblem({ id: 'nz-2026', year: 3 }), 'has a curriculum year that is not text');
});

test('trimStandards keeps one curriculum and only the fields the app shows', () => {
  const trimmed = trimStandards(SOURCE);
  assert.deepEqual(trimmed.curriculum, { id: 'acara-v9', name: 'Australian Curriculum, Version 9', version: 'v9', sourceUrl: 'https://v9.australiancurriculum.edu.au/' });
  assert.equal(trimmed.standards.length, 5);
  assert.deepEqual(trimmed.standards[0], { code: 'AC9MFN01', title: 'name, represent and order numbers', strand: 'Number', learningArea: 'Mathematics', subject: 'Mathematics', yearLevels: ['F'] });
  // Whitespace is normalized; a description that differs from the title is kept.
  assert.equal(trimmed.standards[1].title, 'recognise numbers to 120');
  assert.equal(trimmed.standards[1].description, undefined);
  assert.equal(trimmed.standards[2].description, 'order numbers to at least 1000');
  // Year levels in order.
  assert.deepEqual(trimmed.standards[4].yearLevels, ['1', '2']);
  assert.throws(() => trimStandards({ curricula: [] }), /no acara-v9 entry/);
  assert.throws(() => trimStandards(null), /no acara-v9 entry/);
});

test('a topic lists only its Australian codes, linked standards in year order', () => {
  const t = topic('t', ['AC9M2N01', 'AC9MFN01', 'AC9X9Z99']);
  assert.deepEqual(topicCodes(t), ['AC9M2N01', 'AC9MFN01', 'AC9X9Z99']);
  assert.deepEqual(topicStandards(t, index).map(s => s.code), ['AC9MFN01', 'AC9M2N01']);
  assert.deepEqual(topicStandards(t, null), []);
  assert.deepEqual(topicCodes({ id: 'x' }), []);
});

test('the boost: 2 at the learner year, 1 at the year below while unmastered, else 0', () => {
  const y2 = topic('y2', ['AC9M2N01']);
  const y1 = topic('y1', ['AC9M1N01']);
  const yF = topic('yF', ['AC9MFN01']);
  const band = topic('band', ['AC9HP2M01']); // Years 1 and 2
  const none = topic('none', []);
  const ctx = { year: '2', index };
  assert.equal(curriculumBoost(y2, ctx), 2);
  assert.equal(curriculumBoost(band, ctx), 2);
  assert.equal(curriculumBoost(y1, ctx), 1);
  assert.equal(curriculumBoost(y1, { ...ctx, mastered: id => id === 'y1' }), 0);
  assert.equal(curriculumBoost(yF, ctx), 0);
  assert.equal(curriculumBoost(none, ctx), 0);
  assert.equal(curriculumBoost(y2, { year: null, index }), 0);
  assert.equal(curriculumBoost(y2, { year: '2', index: null }), 0);
  assert.equal(curriculumBoost(yF, { year: 'F', index }), 2);
  assert.equal(boosterFor(null, index)(y2), 0);
  assert.equal(boosterFor('2', index)(y2), 2);
});

test('rankByCurriculum moves linked topics forward and removes nothing', () => {
  const list = [topic('a', []), topic('y1', ['AC9M1N01']), topic('b', ['AC9MFN01']), topic('y2', ['AC9M2N01']), topic('c', [])];
  assert.deepEqual(rankByCurriculum(list, { year: '2', index }).map(t => t.id), ['y2', 'y1', 'a', 'b', 'c']);
  assert.deepEqual(rankByCurriculum(list, { year: null, index }).map(t => t.id), ['a', 'y1', 'b', 'y2', 'c']);
  assert.deepEqual(rankByCurriculum(list, { year: '2', index: null }).map(t => t.id), ['a', 'y1', 'b', 'y2', 'c']);
});

test('daily choices put a year-linked topic first, even above the age ceiling, without dropping others', () => {
  const lane = LANES.numeracy;
  const topics = [
    topic('age5', [], { ageRangeStart: 5, centrality: 0.9 }),
    topic('age5b', [], { ageRangeStart: 5, centrality: 0.8, domain: 'Addition & Subtraction' }),
    topic('y2', ['AC9M2N01'], { ageRangeStart: 9, centrality: 0.1, domain: 'Addition & Subtraction' }),
  ];
  const ctx = {
    age: 5, dateKey: '2026-10-07', now: 0, statusOf: () => 'none', isUnlocked: () => true, lastTouched: () => 0,
    topicAge: t => t.ageRangeStart,
  };
  assert.deepEqual(laneOptions(topics, lane, ctx).options.map(t => t.id), ['age5', 'age5b']);
  const boosted = laneOptions(topics, lane, { ...ctx, boost: boosterFor('2', index) });
  assert.deepEqual(boosted.options.map(t => t.id), ['y2', 'age5']);
});

test('the finder nudges a year-linked match up and reports its boost', () => {
  const topics = [
    { id: 'plain', name: 'Counting numbers', description: 'count numbers', subject: 'Mathematics', domain: 'Counting', ageRangeStart: 7, ageRangeEnd: 8, centrality: 0.5 },
    { id: 'linked', name: 'Counting numbers', description: 'count numbers', subject: 'Mathematics', domain: 'Counting', ageRangeStart: 7, ageRangeEnd: 8, centrality: 0.4, standards: ['acara-v9:AC9M2N01'] },
  ];
  assert.equal(searchTopics(topics, 'counting numbers').results[0].topic.id, 'plain');
  const { results } = searchTopics(topics, 'counting numbers', { boost: boosterFor('2', index) });
  assert.deepEqual(results.map(r => [r.topic.id, r.boost]), [['linked', 2], ['plain', 0]]);
});

test('topicEvidence lists records, passed topic checks, practice and saved lessons', () => {
  const sources = {
    records: [{ type: 'observation', topicId: 'a' }, { type: 'note', coverage: [{ topicId: 'b', topicName: 'B' }] }, { type: 'assessment', placement: { topicIds: ['c'] } }],
    tests: [{ scope: 'topic', topicId: 'c', passed: false }, { scope: 'topic', topicId: 'd', passed: true }, { scope: 'section', topicId: 'e', passed: true }],
    practice: { p1: { topicId: 'e' } },
    lessonTopics: new Set(['f']),
  };
  assert.deepEqual(topicEvidence('a', sources), ['record']);
  assert.deepEqual(topicEvidence('b', sources), ['record']);
  assert.deepEqual(topicEvidence('c', sources), [], 'a placement record and a failed check are not evidence');
  assert.deepEqual(topicEvidence('d', sources), ['test']);
  assert.deepEqual(topicEvidence('e', sources), ['practice']);
  assert.deepEqual(topicEvidence('f', sources), ['lesson']);
  assert.deepEqual(topicEvidence('z', {}), []);
});

test('standardStatus: mastered needs every linked topic, evidence needs one, else not yet', () => {
  const status = { a: 'mastered', b: 'mastered', c: 'learning', d: 'none' };
  const ev = { c: ['record'] };
  const ctx = { statusOf: id => status[id] || 'none', evidenceOf: id => ev[id] || [] };
  assert.equal(standardStatus(['a', 'b'], ctx), 'mastered');
  assert.equal(standardStatus(['a', 'd'], ctx), 'evidence');
  assert.equal(standardStatus(['c', 'd'], ctx), 'evidence');
  assert.equal(standardStatus(['d'], ctx), 'not-yet');
  assert.equal(standardStatus([], ctx), 'not-yet');
});

test('coverageReport groups one year by learning area with counts', () => {
  const topics = [topic('y2a', ['AC9M2N01']), topic('y2b', ['AC9M2N01']), topic('lit', ['AC9E2LY01']), topic('y1', ['AC9M1N01'])];
  const status = { y2a: 'mastered', y2b: 'mastered' };
  const report = coverageReport({
    year: 'Year 2', standards, topics,
    statusOf: id => status[id] || 'none', evidenceOf: id => (id === 'lit' ? ['test'] : []),
  });
  assert.equal(report.year, '2');
  assert.deepEqual(report.areas.map(a => a.learningArea), ['Mathematics', 'English', 'Health and Physical Education']);
  assert.deepEqual(report.counts, { total: 3, mastered: 1, evidence: 1, 'not-yet': 1 });
  const maths = report.areas[0];
  assert.deepEqual(maths.standards.map(s => [s.standard.code, s.status, s.topics.map(t => t.id)]), [['AC9M2N01', 'mastered', ['y2a', 'y2b']]]);
  assert.deepEqual(report.areas[1].standards[0].evidence, ['test']);
  // A description no topic links to is listed as not yet.
  assert.deepEqual(report.areas[2].standards[0].topics, []);
  assert.equal(report.areas[2].standards[0].status, 'not-yet');
  assert.deepEqual(coverageReport({ year: 'nope', standards, topics, statusOf: () => 'none', evidenceOf: () => [] }).areas, []);
});

test('the ACARA notice is quoted in full', () => {
  assert.match(ACARA_NOTICE, /^© Australian Curriculum, Assessment and Reporting Authority \(ACARA\) 2009 to present/);
  assert.match(ACARA_NOTICE, /licensed under CC BY 4\.0 \(https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/\)/);
  assert.match(ACARA_NOTICE, /It is up to each person to make their own assessment of the product\.$/);
});
