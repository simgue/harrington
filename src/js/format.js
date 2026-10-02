// One way to print a count everywhere it is shown: grouped for the reader's
// locale ("1,590" in the United States, "1.590" in Germany).
const formatters = new Map();

export function formatCount(n, locale) {
  const value = Number(n);
  if (!Number.isFinite(value)) return '0';
  const key = locale || '';
  if (!formatters.has(key)) formatters.set(key, new Intl.NumberFormat(locale || undefined, { maximumFractionDigits: 0 }));
  return formatters.get(key).format(value);
}
