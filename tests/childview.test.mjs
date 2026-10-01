import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const repoRoot = new URL('..', import.meta.url);
const source = (path) => readFile(new URL(path, repoRoot), 'utf8');

// store.persist() saves through fetch after a debounce; keep it off the network.
const saved = [];
globalThis.fetch = async (path, options = {}) => {
  if (options.body) saved.push(JSON.parse(options.body));
  return { ok: true, status: 200, json: async () => ({}) };
};

const store = await import('../src/js/store.js');
const game = await import('../src/js/game.js');
const { canYouPrompt } = await import('../src/js/views/childtopic.js');

test('the child view never launches a mastery test', async () => {
  const kidmode = await source('src/js/views/kidmode.js');
  assert.doesNotMatch(kidmode, /openMasteryTest/);
  assert.doesNotMatch(kidmode, /masterytest\.js/);
  assert.match(kidmode, /import \{ openChildTopic \} from '\.\/childtopic\.js'/);
  assert.match(kidmode, /store\.setChildViewOpen\(true\)/);
  assert.match(kidmode, /store\.setChildViewOpen\(false\)/);
});

test('tests and challenges have a score-free child result', async () => {
  for (const path of ['src/js/views/masterytest.js', 'src/js/views/challenge.js']) {
    const code = await source(path);
    assert.match(code, /store\.isChildViewOpen\(\)/, `${path} has no child-safe branch`);
    assert.match(code, /All done, well tried!/, `${path} has no child-safe result`);
  }
});

test('celebrations are silent while the child view is open', () => {
  assert.equal(store.isChildViewOpen(), false);
  assert.equal(game.celebrationsAllowed(), true);

  store.setChildViewOpen(true);
  try {
    assert.equal(game.celebrationsAllowed(), false);
    // There is no DOM here, so any popup, chip or confetti would throw.
    assert.doesNotThrow(() => game.celebrate({ xp: 25, leveledUp: true, level: 2, badges: [game.BADGES[0]] }));
  } finally {
    store.setChildViewOpen(false);
  }
  assert.equal(game.celebrationsAllowed(), true);
  // Outside the child view celebrate() reaches for the DOM.
  assert.throws(() => game.celebrate({ xp: 25 }), ReferenceError);
});

test('award() still records XP in the child view', () => {
  const id = 's_child_test';
  const before = store.gameState(id).xp;
  store.setChildViewOpen(true);
  try {
    const res = game.award(id, null, 40);
    assert.equal(res.xp, 40);
  } finally {
    store.setChildViewOpen(false);
  }
  assert.equal(store.gameState(id).xp, before + 40);
});

test('the parent PIN is four digits and persisted with the family settings', async () => {
  assert.equal(store.parentPin(), null);
  assert.equal(store.setParentPin('12a4'), false);
  assert.equal(store.setParentPin('123'), false);
  assert.equal(store.parentPin(), null);
  assert.equal(store.setParentPin('0420'), true);
  assert.equal(store.parentPin(), '0420');
  await store.flushSaves?.();
  await new Promise(resolve => setTimeout(resolve, 450));
  assert.equal(saved.at(-1)?.settings?.parentPin, '0420');
});

test('taxonomy evidence reads as "Can you…?" prompts', () => {
  assert.equal(canYouPrompt('Explain how plants grow.'), 'Can you explain how plants grow?');
  assert.equal(canYouPrompt('Identifies 270° as three right angles'), 'Can you identify 270° as three right angles?');
  assert.equal(canYouPrompt('Describes the water cycle'), 'Can you describe the water cycle?');
  assert.equal(canYouPrompt('Uses a ruler to measure'), 'Can you use a ruler to measure?');
  assert.equal(canYouPrompt('Distinguishes living and non-living things'), 'Can you distinguish living and non-living things?');
  assert.equal(canYouPrompt('Organizes data in a table'), 'Can you organize data in a table?');
  assert.equal(canYouPrompt('Given a shape, name it'), 'Given a shape, name it: can you?');
  assert.equal(canYouPrompt('  '), '');
});
