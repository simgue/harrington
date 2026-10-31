// A value loaded once and kept, with a failure remembered for a while: until
// `retryMs` has passed, every caller gets the same rejected promise at once
// instead of starting the load again; after it, the next call loads afresh.
// The server keeps the trimmed Australian Curriculum list this way, so an
// unreachable upstream costs one wait per five minutes, not one per page load.
// `now` is injectable for tests.
export function rememberLoads(load, { retryMs, now = () => Date.now() }) {
  const entries = new Map(); // key -> { pending, failed, failedAt }
  return (key) => {
    const known = entries.get(key);
    if (known && !(known.failed && now() - known.failedAt >= retryMs)) return known.pending;
    const entry = { pending: null, failed: false, failedAt: 0 };
    entry.pending = Promise.resolve().then(() => load(key)).catch((error) => {
      entry.failed = true;
      entry.failedAt = now();
      throw error;
    });
    // A remembered failure is answered from here later, so this one is handled.
    entry.pending.catch(() => {});
    entries.set(key, entry);
    return entry.pending;
  };
}
