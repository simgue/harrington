// Pure answer grading shared by mastery tests, spaced practice, and challenges.
// No DOM or store access so it can be unit tested directly.

// Text normalisation for typed answers: case, accents, punctuation, spacing,
// and a leading article are ignored ("The Nile." === "nile").
export function normalizeAnswer(s) {
  return String(s ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}

// Parse the WHOLE answer as a number, or return null. Accepts an optional sign,
// thousands separators ("1,000"), decimals, and simple fractions ("3/4").
// Anything with extra words ("World War 2", "5 apples") is not a number.
export function parseNumber(s) {
  const t = String(s ?? '').trim().replace(/\s+/g, '');
  if (!t) return null;
  const frac = t.match(/^([-+]?\d+)\/(\d+)$/);
  if (frac) {
    const den = Number(frac[2]);
    return den ? Number(frac[1]) / den : null;
  }
  if (!/^[-+]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?$/.test(t) || !/\d/.test(t)) return null;
  return Number(t.replace(/,/g, ''));
}

// Single source of truth for whether a given answer is correct.
// Multiple choice: `given` is the chosen option index.
// Typed answers: numeric equality when both sides are whole numbers, otherwise
// an exact match after normalisation. No partial or substring credit.
export function isCorrect(q, given) {
  if (!q) return false;
  if (q.type === 'multiple_choice') {
    return Number.isInteger(given) && given === q.answer;
  }
  const a = normalizeAnswer(given);
  if (!a) return false;
  const an = parseNumber(given), kn = parseNumber(q.answer);
  if (an !== null && kn !== null) return Math.abs(an - kn) < 1e-9;
  return a === normalizeAnswer(q.answer);
}
