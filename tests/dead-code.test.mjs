import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const script = fileURLToPath(new URL('../scripts/dead-code.mjs', import.meta.url));

test(`no module uses another module's export without importing it`, async () => {
  // The script exits 1 when it finds anything, so read stdout either way.
  const { stdout } = await promisify(execFile)(process.execPath, [script]).catch((err) => err);
  assert.match(stdout, /^Uses of another module's export that is not imported \(0\)$/m, stdout);
  assert.match(stdout, /^Unreachable modules from src\/js\/app\.js \(0\)$/m, stdout);
});
