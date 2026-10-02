// Commits a route change to the browser: the hash, the history entry and the
// window scroll. Kept apart from app.js (which boots on import) so the
// push/replace/scroll contract can be tested against a stand-in window.
//
// Options:
// - preserveScroll: keep the window where it is (same-route updates such as
//   selecting a skill in the tree) instead of jumping to the top.
// - replace: rewrite the current history entry instead of pushing a new one.
// - render: false only syncs the hash; the caller is mid-render.
export function commitNavigation(win, hash, render, { preserveScroll = false, replace = false, render: rerender = true } = {}) {
  const x = win.scrollX;
  const y = win.scrollY;
  if (replace) win.history.replaceState(win.history.state, '', '#' + hash);
  else win.location.hash = hash;
  if (!rerender) return;
  render();
  if (preserveScroll) win.scrollTo({ left: x, top: y, behavior: 'instant' });
  else win.scrollTo({ top: 0, behavior: 'instant' });
}
