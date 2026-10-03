// A minimal fake document for view tests: enough of the DOM for ui.el(),
// openModal(), toast() and the recall, lesson and records views. It parses
// the markup the views build, supports `#id`, `.class` and `tag` selectors
// (compound, with descendant combinators) and click handlers. Not a browser.
const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'source']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ENTITIES[e]);

class Text {
  constructor(text) { this.nodeType = 3; this.data = text; this.parentNode = null; }
  get textContent() { return this.data; }
  remove() { detach(this); }
}

function detach(node) {
  const parent = node.parentNode;
  if (!parent) return;
  const i = parent.childNodes.indexOf(node);
  if (i >= 0) parent.childNodes.splice(i, 1);
  node.parentNode = null;
}

class Element {
  constructor(tag, attrs = {}) {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.attrs = attrs;
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = {};
    this.onclick = null;
    this.disabled = 'disabled' in attrs;
    this.style = {};
    const el = this;
    this.classList = {
      get set() { return new Set((el.attrs.class || '').split(/\s+/).filter(Boolean)); },
      write(set) { el.attrs.class = [...set].join(' '); },
      add(...c) { const s = this.set; c.forEach(x => s.add(x)); this.write(s); },
      remove(...c) { const s = this.set; c.forEach(x => s.delete(x)); this.write(s); },
      contains(c) { return this.set.has(c); },
      toggle(c, on) { const s = this.set; const want = on ?? !s.has(c); if (want) s.add(c); else s.delete(c); this.write(s); return want; },
    };
  }
  get id() { return this.attrs.id || ''; }
  get className() { return this.attrs.class || ''; }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get firstElementChild() { return this.children[0] || null; }
  get textContent() { return this.childNodes.map(n => n.textContent).join(''); }
  set textContent(text) { this.replaceChildren(new Text(String(text))); }
  set innerHTML(html) { this.replaceChildren(...parse(html)); }
  getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  appendChild(child) {
    detach(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  append(...nodes) { nodes.forEach(n => this.appendChild(typeof n === 'string' ? new Text(n) : n)); }
  replaceChildren(...nodes) {
    for (const n of [...this.childNodes]) detach(n);
    nodes.forEach(n => this.appendChild(n));
  }
  replaceWith(node) {
    const parent = this.parentNode;
    if (!parent) return;
    detach(node);
    const i = parent.childNodes.indexOf(this);
    parent.childNodes.splice(i, 1, node);
    node.parentNode = parent;
    this.parentNode = null;
  }
  remove() { detach(this); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); }
  click() {
    if (this.disabled) return;
    const event = { target: this, preventDefault() {}, stopPropagation() {} };
    this.onclick?.(event);
    (this.listeners.click || []).forEach(fn => fn(event));
  }
  focus() {}
  matches(selector) { return matchCompound(this, selector); }
  querySelectorAll(selector) {
    const parts = selector.trim().split(/\s+/);
    const out = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (matchesPath(child, parts, this)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function matchCompound(node, compound) {
  const m = compound.match(/^([a-z0-9-]*)((?:[#.][\w-]+)*)$/i);
  if (!m) throw new Error(`fake-dom does not support the selector "${compound}"`);
  if (m[1] && node.tagName !== m[1].toUpperCase()) return false;
  for (const [, kind, name] of m[2].matchAll(/([#.])([\w-]+)/g)) {
    if (kind === '#' && node.id !== name) return false;
    if (kind === '.' && !node.classList.contains(name)) return false;
  }
  return true;
}

// Descendant combinators only: the last part matches the node, earlier parts an ancestor below `root`.
function matchesPath(node, parts, root) {
  if (!matchCompound(node, parts[parts.length - 1])) return false;
  let i = parts.length - 2;
  for (let a = node.parentNode; i >= 0 && a && a !== root; a = a.parentNode) {
    if (matchCompound(a, parts[i])) i--;
  }
  return i < 0;
}

function parse(html) {
  const root = new Element('#root');
  let current = root;
  const re = /<!--[\s\S]*?-->|<\/([a-z0-9-]+)\s*>|<([a-z0-9-]+)((?:\s+[^\s=>\/]+(?:\s*=\s*"[^"]*")?)*)\s*\/?>|([^<]+)/gi;
  for (const [, close, open, attrText, text] of html.matchAll(re)) {
    if (text !== undefined) { current.appendChild(new Text(decode(text))); continue; }
    if (close) {
      for (let n = current; n !== root; n = n.parentNode) {
        if (n.tagName === close.toUpperCase()) { current = n.parentNode; break; }
      }
      continue;
    }
    if (!open) continue;
    const attrs = {};
    for (const [, name, value] of (attrText || '').matchAll(/([^\s=]+)(?:\s*=\s*"([^"]*)")?/g)) attrs[name] = value === undefined ? '' : decode(value);
    const node = current.appendChild(new Element(open, attrs));
    if (!VOID.has(open.toLowerCase())) current = node;
  }
  const nodes = [...root.childNodes];
  nodes.forEach(detach);
  return nodes;
}

// Installs globals: document (with body, #modal-root and #toast-root),
// a window that ignores listeners, and requestAnimationFrame. Returns the document.
export function installFakeDom() {
  const body = new Element('body');
  body.appendChild(new Element('div', { id: 'modal-root' }));
  body.appendChild(new Element('div', { id: 'toast-root' }));
  const listeners = {};
  const document = {
    body,
    createElement(tag) {
      if (tag !== 'template') return new Element(tag);
      const holder = new Element('template');
      return {
        set innerHTML(html) { holder.innerHTML = html; },
        get content() { return holder; },
      };
    },
    getElementById(id) { return body.querySelector(`#${id}`); },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter(f => f !== fn); },
  };
  globalThis.document = document;
  globalThis.window = { addEventListener() {}, removeEventListener() {}, open: () => null };
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  return document;
}

// Resolves once `check()` returns something truthy, polling the event loop.
export async function waitFor(check, { timeout = 2000 } = {}) {
  const start = Date.now();
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error('waitFor timed out');
    await new Promise(resolve => setImmediate(resolve));
  }
}

// Buttons under `root` whose text includes `label`.
export function buttons(root, label) {
  return root.querySelectorAll('button').filter(b => b.textContent.includes(label));
}
