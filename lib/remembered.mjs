// Remembers a failed load for a while: until `retryMs` has passed since a
// load for `key` failed, every caller gets that same rejected promise at once
// instead of starting the load again; after it, the next call loads afresh.
// Callers that arrive while a load is under way share it. A success is not
// kept: each later call loads again, so the caller keeps its own cache. The
// server reads the optional curriculum-standards.json this way, so an
// unreachable upstream costs one wait per five minutes, not one per page
// load. `now` is injectable for tests.
export function rememberFailures(load, { retryMs, now = () => Date.now() }) {
  const entries = new Map(); // key -> { pending, done, failed, failedAt }
  return (key) => {
    const known = entries.get(key);
    if (known && (!known.done || (known.failed && now() - known.failedAt < retryMs))) return known.pending;
    const entry = { pending: null, done: false, failed: false, failedAt: 0 };
    entry.pending = Promise.resolve().then(() => load(key)).then(
      (value) => { entry.done = true; return value; },
      (error) => {
        entry.done = true;
        entry.failed = true;
        entry.failedAt = now();
        throw error;
      },
    );
    // A remembered failure is answered from here later, so this one is handled.
    entry.pending.catch(() => {});
    entries.set(key, entry);
    return entry.pending;
  };
}
