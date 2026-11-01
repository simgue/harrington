// A child server's log arrives on its own pipes, so a line it writes while
// answering a request can reach the test after the response does (seen on a
// busy machine). Poll the captured output for the line instead of reading it
// once. Returns the output either way; the caller's assertion reports a miss.
export async function waitForOutput(read, pattern, { timeoutMs = 5000, stepMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (!pattern.test(read()) && Date.now() < deadline) await new Promise((r) => setTimeout(r, stepMs));
  return read();
}
