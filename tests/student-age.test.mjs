import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { studentAge } from '../src/js/store.js';

// new Date(year, monthIndex, day): monthIndex 0 is January.
const on = (y, m, d) => new Date(y, m - 1, d);

describe('studentAge', () => {
  test('without a month it is the calendar-year difference', () => {
    const s = { birthYear: 2018 };
    assert.equal(studentAge(s, on(2026, 1, 1)), 8);
    assert.equal(studentAge(s, on(2026, 12, 31)), 8);
  });

  test('with a month it counts whole years completed', () => {
    const s = { birthYear: 2018, birthMonth: 10 };
    assert.equal(studentAge(s, on(2026, 9, 30)), 7, 'the day before the birth month');
    assert.equal(studentAge(s, on(2026, 10, 1)), 8, 'the first of the birth month');
    assert.equal(studentAge(s, on(2026, 12, 31)), 8);
    assert.equal(studentAge(s, on(2027, 1, 1)), 8, 'January after the birthday year');
  });

  test('January and December births at the year boundary', () => {
    assert.equal(studentAge({ birthYear: 2018, birthMonth: 1 }, on(2026, 1, 1)), 8);
    assert.equal(studentAge({ birthYear: 2018, birthMonth: 1 }, on(2025, 12, 31)), 7);
    assert.equal(studentAge({ birthYear: 2018, birthMonth: 12 }, on(2026, 11, 30)), 7);
    assert.equal(studentAge({ birthYear: 2018, birthMonth: 12 }, on(2026, 12, 1)), 8);
  });

  test('an invalid month falls back to the year, and missing data gives null', () => {
    assert.equal(studentAge({ birthYear: 2018, birthMonth: 13 }, on(2026, 3, 1)), 8);
    assert.equal(studentAge({ birthYear: 2018, birthMonth: '4' }, on(2026, 3, 1)), 8);
    assert.equal(studentAge({ birthYear: 2026, birthMonth: 11 }, on(2026, 3, 1)), 0);
    assert.equal(studentAge({}, on(2026, 3, 1)), null);
    assert.equal(studentAge(null), null);
  });

  test('defaults to today', () => {
    const now = new Date();
    assert.equal(studentAge({ birthYear: now.getFullYear() - 9 }), 9);
  });
});
