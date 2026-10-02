// The "where does Harrington run" copy follows /api/health (HAR-25): a
// loopback bind says "this computer only"; any other bind says it is shared.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bannerText, isShared, setHosting, sidebarLine, storedOn, whereItRuns } from '../src/js/hosting.js';

test('a loopback server keeps the "this computer only" copy', () => {
  setHosting({ host: 'loopback', authEnabled: false });
  assert.equal(isShared(), false);
  assert.equal(bannerText(), 'Runs on this computer only. Nothing leaves your home unless you configure an AI provider.');
  assert.equal(whereItRuns(), 'It runs on this computer only.');
  assert.equal(storedOn(), 'on this computer');
  assert.equal(sidebarLine(), 'Saved by Harrington');
});

test('a shared server never claims to run on this computer only', () => {
  for (const health of [
    { host: 'network', authEnabled: false },
    { host: 'network', authEnabled: true, signedIn: true },
  ]) {
    setHosting(health);
    assert.equal(isShared(), true);
    for (const text of [bannerText(), whereItRuns(), sidebarLine()]) {
      assert.doesNotMatch(text, /this computer only/);
    }
    assert.match(bannerText(), /^Shared on your home network\./);
    assert.equal(storedOn(), 'on the computer that runs Harrington');
  }
  setHosting({ host: 'network', authEnabled: false });
  assert.match(bannerText(), /anyone on the network can open it/);
  setHosting({ host: 'network', authEnabled: true, signedIn: true });
  assert.match(bannerText(), /This device is signed in/);
  assert.equal(sidebarLine(), 'Shared on your home network · signed in');
});

test('a missing or odd health answer falls back to loopback copy', () => {
  setHosting(undefined);
  assert.equal(isShared(), false);
  setHosting({ host: '10.0.0.5' });
  assert.equal(isShared(), false);
});
