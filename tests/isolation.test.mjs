import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { unescapedInterpolations } from './support/templates.mjs';

const repoRoot = new URL('..', import.meta.url);
const source = (path) => readFile(new URL(path, repoRoot), 'utf8');
const importSource = async (path) => {
  const code = await source(path);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

test('the Harrington runtime has no Puter dependency', async () => {
  const runtimePaths = [
    'package.json',
    'src/index.html',
    'src/js/app.js',
    'src/js/backend.js',
    'src/js/store.js',
    'src/js/recorder.js',
    'src/js/ai.js',
    'src/js/coop.js',
    'src/js/graph.js',
    'src/js/views/graph.js',
    'src/js/mastery.js',
    'server.mjs',
  ];
  const runtimeSources = await Promise.all(runtimePaths.map(source));

  for (let index = 0; index < runtimeSources.length; index += 1) {
    assert.doesNotMatch(
      runtimeSources[index],
      /\bputer\b/i,
      `${runtimePaths[index]} still contains a Puter runtime reference`,
    );
  }
});

test('the browser starts in a private family workspace without sign-in', async () => {
  const [app, store, shell] = await Promise.all([
    source('src/js/app.js'),
    source('src/js/store.js'),
    source('src/js/views/shell.js'),
  ]);

  assert.doesNotMatch(app, /renderSignIn|sign in to begin/i);
  assert.match(store, /username:\s*'Family'/);
  assert.match(shell, /Private family space/);
  assert.doesNotMatch(shell, /Sign out/);
});

test('unmigrated connected features fail closed', async () => {
  const [ai, backend, coopSource, coop] = await Promise.all([
    source('src/js/ai.js'),
    source('src/js/backend.js'),
    source('src/js/coop.js'),
    importSource('src/js/coop.js'),
  ]);

  assert.match(ai, /backend\.chat/);
  assert.doesNotMatch(ai, /https?:\/\//);
  assert.match(backend, /\/api\/ai/);
  assert.match(coopSource, /not available in the self-hosted preview/i);
  assert.doesNotMatch(coopSource, /https?:\/\//);
  for (const action of [
    () => coop.createPod(),
    () => coop.joinPod(),
    () => coop.myPods(),
    () => coop.shareCard(),
    () => coop.cardsSharedToMe(),
  ]) {
    await assert.rejects(action, /not available in the self-hosted preview/i);
  }
});

test('interface assets are served by Harrington instead of public CDNs', async () => {
  const [index, ui, data] = await Promise.all([
    source('src/index.html'),
    source('src/js/ui.js'),
    source('src/js/data.js'),
  ]);

  assert.doesNotMatch(index, /cdn\.tailwindcss\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.doesNotMatch(ui, /cdn\.jsdelivr\.net|https?:\/\//);
  assert.doesNotMatch(data, /cdn\.jsdelivr\.net/);
  assert.match(data, /\/api\/taxonomy/);
  assert.match(index, /css\/tailwind\.css/);
  assert.match(index, /vendor\/lucide\.min\.js/);
});

test('views escape learner, record and taxonomy strings with the shared esc()', async () => {
  const sharedImport = /import \{[^}]*\besc\b[^}]*\} from '\.\.\/ui\.js';/;
  const localCopy = /function esc\(/;
  const views = [
    'topic', 'calendar', 'graph',
    'records', 'insights', 'recordings', 'masterytest', 'challenge', 'recall',
    'notifications', 'shell',
  ];
  for (const name of views) {
    const code = await source(`src/js/views/${name}.js`);
    assert.match(code, sharedImport, `views/${name}.js does not import esc from ../ui.js`);
    assert.doesNotMatch(code, localCopy, `views/${name}.js still defines a local esc copy`);
  }
});

test('esc() neutralizes markup and attribute breakouts', async () => {
  const { esc } = await importSource('src/js/ui.js');
  assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(esc(`"a" & 'b'`), '&quot;a&quot; &amp; &#39;b&#39;');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(7), '7');
});

// Markup templates in these files interpolate only escaped values (HAR-11):
// esc(), analysisHtml(), a ternary or .map().join() of literal templates, or
// an entry below. A new `${t.name}` in markup fails here.
const ESCAPED_MARKUP = {
  'src/js/recorder.js': [
    'coverageClaimField(coverageTopics)', // escapes each name; tested in daily.test.mjs
  ],
  'src/js/views/records.js': [
    "coverageNames(r).map(esc).join(' · ')",
    'coverageClaimField(coverageTopics)',
  ],
  'src/js/views/recordings.js': [],
};

test('record and recording markup interpolates only escaped values', async () => {
  for (const [path, allowed] of Object.entries(ESCAPED_MARKUP)) {
    const unescaped = unescapedInterpolations(await source(path), new Set(allowed));
    assert.deepEqual(unescaped, [], `${path} interpolates unescaped values into markup (line: expression)`);
  }
});

test('the markup escaping check flags what it should and nothing else', () => {
  const flagged = (code) => unescapedInterpolations(code).map((hit) => hit.replace(/^\d+: /, ''));
  // Flagged: raw values, values next to an esc() call, values in nested markup.
  assert.deepEqual(flagged('el(`<span>${t.name}</span>`)'), ['t.name']);
  assert.deepEqual(flagged('el(`<b title="${esc(a) + b}">`)'), ['esc(a) + b']);
  assert.deepEqual(flagged('el(`<i>${on ? `x ${t.subject}` : \'\'}</i>`)'), ['t.subject']);
  assert.deepEqual(flagged('el(`<i>${on ? t.subject : \'\'}</i>`)'), ["on ? t.subject : ''"]);
  assert.deepEqual(flagged('el(`<i>${xs.map(x => x.name).join(\'\')}</i>`)'), ['xs.map(x => x.name).join(\'\')']);
  // Not flagged: escaped values, literal choices, non-markup templates.
  assert.deepEqual(flagged('el(`<span title="${esc(t.id)}">${esc(t.name)}</span>`)'), []);
  assert.deepEqual(flagged('el(`<i class="${on ? \'a\' : \'b\'}">${xs.map(x => `<b>${esc(x)}</b>`).join(\' \')}</i>`)'), []);
  assert.deepEqual(flagged('const key = `${t.subject}|${t.domain}`;'), []);
  // Comments, regex literals and strings with backticks or braces do not derail the scan.
  assert.deepEqual(flagged('// a `quoted` word\nconst re = /`{/g; const s = \'`}\';\nel(`<p>${t.name}</p>`)'), ['t.name']);
});

test('stored analysis HTML keeps only the tags toHtml() writes', async () => {
  const { analysisHtml } = await importSource('src/js/ui.js');
  const fine = '<h4>Summary</h4><p>Counted to <strong>ten</strong> &amp; <em>back</em>.</p><ul><li>a &lt;b&gt;</li></ul>';
  assert.equal(analysisHtml(fine), fine);
  // An imported document can carry any string here.
  const hostile = '<p onclick="x()">Hi</p><img src=x onerror=alert(1)><script>alert(2)</script><a href="javascript:x">y</a><svg/onload=z><!-- c --><p';
  const out = analysisHtml(hostile);
  assert.doesNotMatch(out, /<(?!\/?(?:p|h4|ul|li|strong|em)>)/, out);
  assert.equal(out, '&lt;p onclick=&quot;x()&quot;&gt;Hi</p>&lt;img src=x onerror=alert(1)&gt;&lt;script&gt;alert(2)&lt;/script&gt;'
    + '&lt;a href=&quot;javascript:x&quot;&gt;y&lt;/a&gt;&lt;svg/onload=z&gt;&lt;!-- c --&gt;&lt;p');
  assert.equal(analysisHtml('a > b <<p>c'), 'a &gt; b &lt;<p>c');
  assert.equal(analysisHtml(null), '');
  assert.equal(analysisHtml(7), '7');
});
