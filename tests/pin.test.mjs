import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { hashPin, hasPin, migratePinSettings, newSalt, pinSettings, sha256Fallback, sha256Hex, verifyPin } from '../src/js/pin.js';

const nodeSha = (text) => createHash('sha256').update(text).digest('hex');

test('SHA-256 matches with and without Web Crypto', async () => {
  for (const text of ['', 'abc', '0420', 'a'.repeat(55), 'b'.repeat(56), 'c'.repeat(64), 'd'.repeat(200), 'naïve 🌱']) {
    const expected = nodeSha(text);
    assert.equal(await sha256Hex(text), expected, `subtle: ${text.slice(0, 10)}`);
    assert.equal(await sha256Hex(text, { subtle: null }), expected, `fallback: ${text.slice(0, 10)}`);
    assert.equal(sha256Fallback(new TextEncoder().encode(text)), expected);
  }
});

test('a new salt is 16 random bytes in hex', () => {
  const a = newSalt();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, newSalt());
});

test('set a PIN, then verify it: only the salted hash is kept', async () => {
  const settings = await pinSettings({ calendar: { homeDays: [1] } }, '0420');
  assert.deepEqual(Object.keys(settings).sort(), ['calendar', 'parentPinHash', 'parentPinSalt']);
  assert.equal(settings.parentPinHash, nodeSha(`${settings.parentPinSalt}:0420`));
  assert.equal(settings.parentPinHash, await hashPin('0420', settings.parentPinSalt));
  assert.doesNotMatch(JSON.stringify(settings), /"0420"/);
  assert.equal(hasPin(settings), true);
  assert.equal(await verifyPin('0420', settings), true);
  assert.equal(await verifyPin('0421', settings), false);
  assert.equal(await verifyPin('42', settings), false);
  assert.equal(await verifyPin('', settings), false);
  // Changing the PIN draws a new salt.
  const changed = await pinSettings(settings, '1357');
  assert.notEqual(changed.parentPinSalt, settings.parentPinSalt);
  assert.equal(await verifyPin('1357', changed), true);
  assert.equal(await verifyPin('0420', changed), false);
});

test('no PIN set', async () => {
  assert.equal(hasPin({}), false);
  assert.equal(hasPin(undefined), false);
  assert.equal(await verifyPin('0000', {}), false);
});

test('a plain PIN from an older family document migrates to the hash', async () => {
  const old = { parentPin: '2468', calendar: { homeDays: [1, 2] } };
  assert.equal(hasPin(old), true);
  assert.equal(await verifyPin('2468', old), true);
  const migrated = await migratePinSettings(old);
  assert.equal('parentPin' in migrated, false);
  assert.deepEqual(migrated.calendar, { homeDays: [1, 2] });
  assert.equal(await verifyPin('2468', migrated), true);
  assert.equal(await verifyPin('1111', migrated), false);
  assert.doesNotMatch(JSON.stringify(migrated), /"2468"/);
  // A hand-edited number still counts.
  assert.equal(await verifyPin('1234', await migratePinSettings({ parentPin: 1234 })), true);
  // Nothing to migrate: the same object back.
  const hashed = await pinSettings({}, '9999');
  assert.equal(await migratePinSettings(hashed), hashed);
  assert.equal(await migratePinSettings(undefined), undefined);
  // An empty or malformed plain PIN is dropped, not hashed.
  assert.deepEqual(await migratePinSettings({ parentPin: '' }), {});
  assert.deepEqual(await migratePinSettings({ parentPin: 'abcd', calendar: {} }), { calendar: {} });
});
