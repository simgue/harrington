// The shared fake DOM (tests/support/fake-dom.mjs): the activation rules the
// view tests rely on, so a change to the helper cannot quietly weaken them.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installFakeDom } from './support/fake-dom.mjs';

const { document, window, flushFrame, pendingFrames } = installFakeDom();

function render(html) {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.replaceChildren(root);
  return root;
}

test('a disabled control ignores click()', () => {
  const root = render('<button disabled>Go</button>');
  let clicks = 0;
  root.querySelector('button').onclick = () => { clicks += 1; };
  root.querySelector('button').click();
  assert.equal(clicks, 0);
});

test('clicks bubble to ancestors', () => {
  const root = render('<div><span><button>Go</button></span></div>');
  const seen = [];
  root.addEventListener('click', (event) => seen.push(event.target.localName));
  root.querySelector('button').click();
  assert.deepEqual(seen, ['button']);
});

test('a checkbox toggles, then fires input and change; preventDefault undoes it', () => {
  const root = render('<input type="checkbox" id="opt">');
  const box = root.querySelector('#opt');
  const events = [];
  box.addEventListener('input', () => events.push('input'));
  box.addEventListener('change', () => events.push(`change:${box.checked}`));
  box.click();
  assert.equal(box.checked, true);
  assert.deepEqual(events, ['input', 'change:true']);
  box.addEventListener('click', (event) => event.preventDefault());
  box.click();
  assert.equal(box.checked, true, 'a prevented click leaves the box as it was');
  assert.deepEqual(events, ['input', 'change:true']);
});

test('a label activates its control, by for= or by nesting', () => {
  const root = render('<label for="a">A</label><input type="checkbox" id="a"><label><input type="checkbox" class="b"> B</label>');
  let changes = 0;
  root.addEventListener('change', () => { changes += 1; });
  root.querySelector('label').click();
  assert.equal(root.querySelector('#a').checked, true);
  root.querySelectorAll('label')[1].click();
  assert.equal(root.querySelector('.b').checked, true);
  assert.equal(changes, 2);
});

test('inputs report their type; classList.toggle adds and removes', () => {
  const root = render('<input><input type="checkbox"><div class="a"></div>');
  const [text, box] = root.querySelectorAll('input');
  assert.equal(text.type, 'text');
  assert.equal(box.type, 'checkbox');
  const div = root.querySelector('div');
  assert.equal(div.classList.toggle('b'), true);
  assert.equal(div.classList.toggle('a'), false);
  assert.equal(div.className, 'b');
});

test('replaceChildren swaps an element\'s children (used by PR #41\'s cache views)', () => {
  const root = render('<ul><li>a</li><li>b</li></ul>');
  const list = root.querySelector('ul');
  const item = document.createElement('li');
  item.textContent = 'c';
  list.replaceChildren(item, 'd');
  assert.equal(list.innerHTML, '<li>c</li>d');
  list.replaceChildren();
  assert.equal(list.childNodes.length, 0);
});

test('frames wait for flushFrame; history moves fire popstate then hashchange', () => {
  let ran = 0;
  requestAnimationFrame(() => { ran += 1; });
  assert.equal(pendingFrames(), 1);
  assert.equal(flushFrame(), 1);
  assert.equal(ran, 1);
  window.location.hash = 'calendar';
  window.location.hash = 'records';
  const fired = [];
  window.addEventListener('popstate', () => fired.push(`popstate ${window.location.hash}`));
  window.addEventListener('hashchange', () => fired.push(`hashchange ${window.location.hash}`));
  window.back();
  assert.deepEqual(fired, ['popstate #calendar', 'hashchange #calendar']);
});
