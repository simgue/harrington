// A view that uses an ai-status.js helper must import it. A missing import is
// a ReferenceError only at render time (the calendar went blank on main after
// two clean merges), so check the source text instead of rendering.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const jsRoot = new URL('../src/js/', import.meta.url);

async function jsFiles(dir, prefix = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...await jsFiles(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`));
    else if (entry.name.endsWith('.js')) out.push(`${prefix}${entry.name}`);
  }
  return out;
}

// Comments and string contents can mention a helper without using it.
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

test('every ai-status.js helper a file uses is imported or defined there', async () => {
  const helpers = [...(await readFile(new URL('ai-status.js', jsRoot), 'utf8'))
    .matchAll(/^export (?:async )?(?:function|const|let) (\w+)/gm)].map((m) => m[1]);
  for (const name of ['gateAi', 'aiErrorBlock', 'explainAiError', 'aiUnavailableChip', 'generateAnotherButton', 'AI_HELP_HREF']) {
    assert.ok(helpers.includes(name), `ai-status.js no longer exports ${name}`);
  }

  for (const file of await jsFiles(jsRoot)) {
    if (file === 'ai-status.js') continue;
    const code = stripComments(await readFile(new URL(file, jsRoot), 'utf8'));
    const imported = new Set([...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[./]*ai-status\.js'/g)]
      .flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean)));
    for (const name of helpers) {
      if (!new RegExp(`\\b${name}\\b`).test(code)) continue;
      const defined = new RegExp(`\\b(?:function|const|let|var|class)\\s+${name}\\b`).test(code);
      assert.ok(imported.has(name) || defined, `src/js/${file} uses ${name} without importing it from ai-status.js`);
    }
  }
});
