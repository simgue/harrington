import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { hashPin, hasPin, migratePinSettings, newSalt, pinSettings, sha256Hex, verifyPin } from '../src/js/pin.js';

const nodeSha = (text) => createHash('sha256').update(text).digest('hex');

test('the plain-JS SHA-256 matches Node', () => {
  for (const text of ['', 'abc', '0420', 'a'.repeat(55), 'b'.repeat(56), 'c'.repeat(64), 'd'.repeat(200), 'naïve 🌱']) {
    assert.equal(sha256Hex(text), nodeSha(text), text.slice(0, 10));
  }
});

test('a new salt is 16 random bytes in hex', () => {
  const a = newSalt();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, newSalt());
});

test('set a PIN, then verify it: only the salted hash is kept', () => {
  const settings = pinSettings({ calendar: { homeDays: [1] } }, '0420');
  assert.deepEqual(Object.keys(settings).sort(), ['calendar', 'parentPinHash', 'parentPinSalt']);
  assert.equal(settings.parentPinHash, nodeSha(`${settings.parentPinSalt}:0420`));
  assert.equal(settings.parentPinHash, hashPin('0420', settings.parentPinSalt));
  assert.doesNotMatch(JSON.stringify(settings), /"0420"/);
  assert.equal(hasPin(settings), true);
  assert.equal(verifyPin('0420', settings), true);
  assert.equal(verifyPin('0421', settings), false);
  assert.equal(verifyPin('42', settings), false);
  assert.equal(verifyPin('', settings), false);
  // Changing the PIN draws a new salt.
  const changed = pinSettings(settings, '1357');
  assert.notEqual(changed.parentPinSalt, settings.parentPinSalt);
  assert.equal(verifyPin('1357', changed), true);
  assert.equal(verifyPin('0420', changed), false);
  // A stored hash needs nothing migrated: the same object back.
  assert.equal(migratePinSettings(changed), changed);
});

test('no PIN set', () => {
  assert.equal(hasPin({}), false);
  assert.equal(hasPin(undefined), false);
  assert.equal(verifyPin('0000', {}), false);
  assert.equal(migratePinSettings(undefined), undefined);
  const plain = { calendar: {} };
  assert.equal(migratePinSettings(plain), plain);
});

test('a plain PIN from an older family document migrates to the hash', () => {
  const old = { parentPin: '2468', calendar: { homeDays: [1, 2] } };
  assert.equal(hasPin(old), true);
  assert.equal(verifyPin('2468', old), true);
  const migrated = migratePinSettings(old);
  assert.equal('parentPin' in migrated, false);
  assert.deepEqual(migrated.calendar, { homeDays: [1, 2] });
  assert.equal(verifyPin('2468', migrated), true);
  assert.equal(verifyPin('1111', migrated), false);
  assert.doesNotMatch(JSON.stringify(migrated), /"2468"/);
  // A hand-edited number still counts.
  assert.equal(verifyPin('1234', migratePinSettings({ parentPin: 1234 })), true);
  // A plain PIN wins over a stale hash next to it (an older tab saved it).
  const stale = { ...pinSettings({}, '9999'), parentPin: '1357' };
  const fresh = migratePinSettings(stale);
  assert.equal(verifyPin('1357', fresh), true);
  assert.equal(verifyPin('9999', fresh), false);
  // The salt can be injected for fixtures.
  const fixed = migratePinSettings({ parentPin: '2468' }, { salt: 'a'.repeat(32) });
  assert.equal(fixed.parentPinSalt, 'a'.repeat(32));
  assert.equal(fixed.parentPinHash, nodeSha(`${'a'.repeat(32)}:2468`));
  // An empty or malformed plain PIN is dropped, not hashed.
  assert.deepEqual(migratePinSettings({ parentPin: '' }), {});
  assert.deepEqual(migratePinSettings({ parentPin: 'abcd', calendar: {} }), { calendar: {} });
});

test('a malformed or half-present hash and salt are dropped, and count as no PIN', () => {
  const good = pinSettings({}, '0420');
  const cases = [
    { parentPinHash: good.parentPinHash },                                  // no salt
    { parentPinSalt: good.parentPinSalt },                                  // no hash
    { parentPinHash: good.parentPinHash.toUpperCase(), parentPinSalt: good.parentPinSalt },
    { parentPinHash: good.parentPinHash.slice(1), parentPinSalt: good.parentPinSalt },
    { parentPinHash: good.parentPinHash, parentPinSalt: `${good.parentPinSalt}0` },
    { parentPinHash: 42, parentPinSalt: null },
  ];
  for (const settings of cases) {
    const label = JSON.stringify(settings);
    assert.equal(hasPin(settings), false, label);
    assert.equal(verifyPin('0420', settings), false, label);
    assert.deepEqual(migratePinSettings({ ...settings, calendar: {} }), { calendar: {} }, label);
  }
});
