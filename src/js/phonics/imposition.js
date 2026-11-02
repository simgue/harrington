// Booklet imposition (HAR-45): which two pages share each side of a sheet so
// that printing double-sided (flip on the short edge), folding the stack in
// half and stapling gives the pages in reading order. Pages are numbered from
// 1; a booklet has a multiple of 4 pages (one sheet holds four).
//
//   bookletSheets(8)  -> [[8,1],[2,7],[6,3],[4,5]]
//   bookletSheets(12) -> [[12,1],[2,11],[10,3],[4,9],[8,5],[6,7]]
//
// Each pair is [left, right] for one printed side; sides alternate front and
// back of a sheet.
export function bookletSheets(n) {
  if (!Number.isInteger(n) || n < 4 || n % 4 !== 0) throw new Error(`A booklet needs a multiple of 4 pages, not ${n}`);
  const sides = [];
  for (let i = 0; i < n / 2; i++) {
    sides.push(i % 2 === 0 ? [n - i, i + 1] : [i + 1, n - i]);
  }
  return sides;
}

// `pages` padded with `blank` (a function giving one blank page, or a value)
// up to the next multiple of 4. The back cover stays last: blanks go in
// before it.
export function padToFour(pages, blank = null) {
  const out = [...pages];
  const make = typeof blank === 'function' ? blank : () => blank;
  while (out.length % 4 !== 0) out.splice(Math.max(out.length - 1, 0), 0, make());
  return out;
}
