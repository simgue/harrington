// A minimal fake DOM for rendering views in Node: an HTML parser for ui.el()
// and innerHTML, a simple selector engine (tag, #id, .class, [attr],
// [attr="v"], compound, descendant, comma lists), events, and inert layout
// (every size and scroll offset is 0). Enough for the views to build their
// nodes; not a browser. installFakeDom() puts document, window and friends on
// globalThis and returns the document.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', times: '×', hellip: '…', rarr: '→', larr: '←', mdash: '—', ndash: '–' };
const decode = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, code) => {
  if (code[0] !== '#') return ENTITIES[code] ?? all;
  return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
});
const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

class FakeEvent {
  constructor(type, init = {}) {
    Object.assign(this, { type, bubbles: !!init.bubbles, defaultPrevented: false, target: null, ...init });
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.stopped = true; }
  stopImmediatePropagation() { this.stopped = true; }
}

class Node {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
    this._listeners = new Map();
  }
  get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
  get firstChild() { return this.childNodes[0] ?? null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] ?? null; }
  get nextSibling() { const s = this.parentNode?.childNodes; return s ? s[s.indexOf(this) + 1] ?? null : null; }
  get previousSibling() { const s = this.parentNode?.childNodes; return s ? s[s.indexOf(this) - 1] ?? null : null; }
  get isConnected() {
    let node = this;
    while (node.parentNode) node = node.parentNode;
    return node === this.ownerDocument;
  }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(value) { this.replaceChildren(); if (value !== '' && value != null) this.appendChild(this.ownerDocument.createTextNode(String(value))); }
  contains(node) {
    for (let n = node; n; n = n.parentNode) if (n === this) return true;
    return false;
  }
  _adopt(nodes) {
    const out = [];
    for (const n of nodes) {
      const node = typeof n === 'string' ? this.ownerDocument.createTextNode(n) : n;
      if (node.nodeType === 11) { out.push(...node.childNodes); node.childNodes.forEach((c) => { c.parentNode = null; }); node.childNodes = []; } else out.push(node);
    }
    for (const node of out) node.parentNode?.removeChild(node);
    return out;
  }
  insertBefore(node, ref) {
    const nodes = this._adopt([node]);
    const at = ref ? this.childNodes.indexOf(ref) : -1;
    this.childNodes.splice(at === -1 ? this.childNodes.length : at, 0, ...nodes);
    for (const n of nodes) n.parentNode = this;
    return node;
  }
  appendChild(node) { return this.insertBefore(node, null); }
  append(...nodes) { for (const n of this._adopt(nodes)) this.appendChild(n); }
  prepend(...nodes) { const first = this.firstChild; for (const n of this._adopt(nodes)) this.insertBefore(n, first); }
  removeChild(node) {
    const i = this.childNodes.indexOf(node);
    if (i === -1) throw new Error('removeChild: not a child');
    this.childNodes.splice(i, 1);
    node.parentNode = null;
    return node;
  }
  replaceChild(next, old) { this.insertBefore(next, old); this.removeChild(old); return old; }
  replaceChildren(...nodes) {
    for (const c of [...this.childNodes]) this.removeChild(c);
    this.append(...nodes);
  }
  remove() { this.parentNode?.removeChild(this); }
  before(...nodes) { const p = this.parentNode; if (p) for (const n of this._adopt(nodes)) p.insertBefore(n, this); }
  after(...nodes) {
    const p = this.parentNode;
    if (!p) return;
    const next = this.nextSibling;
    for (const n of this._adopt(nodes)) p.insertBefore(n, next);
  }
  replaceWith(...nodes) {
    const p = this.parentNode;
    if (!p) return;
    const adopted = this._adopt(nodes.filter((n) => n !== this));
    for (const n of adopted) p.insertBefore(n, this);
    if (!nodes.includes(this)) p.removeChild(this);
  }
  addEventListener(type, fn) {
    if (!fn) return;
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    const list = this._listeners.get(type);
    if (list) this._listeners.set(type, list.filter((f) => f !== fn));
  }
  dispatchEvent(event) {
    event.target ??= this;
    for (let node = this; node && !event.stopped; node = event.bubbles ? node.parentNode : null) {
      event.currentTarget = node;
      for (const fn of node._listeners.get(event.type) || []) (typeof fn === 'function' ? fn : fn.handleEvent).call(node, event);
      node[`on${event.type}`]?.call(node, event);
    }
    return !event.defaultPrevented;
  }
}

class Text extends Node {
  constructor(doc, data) { super(doc); this.nodeType = 3; this.nodeName = '#text'; this.data = data; }
  get textContent() { return this.data; }
  set textContent(value) { this.data = String(value); }
  get nodeValue() { return this.data; }
  cloneNode() { return new Text(this.ownerDocument, this.data); }
}

class Comment extends Node {
  constructor(doc, data) { super(doc); this.nodeType = 8; this.nodeName = '#comment'; this.data = data; }
  get textContent() { return ''; }
  cloneNode() { return new Comment(this.ownerDocument, this.data); }
}

class ParentNode extends Node {
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get firstElementChild() { return this.children[0] ?? null; }
  get lastElementChild() { const c = this.children; return c[c.length - 1] ?? null; }
  get childElementCount() { return this.children.length; }
  querySelectorAll(selector) {
    const groups = parseSelector(selector);
    const out = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (groups.some((g) => matchesGroup(child, g, this))) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  getElementById(id) { return this.querySelector(`#${id}`); }
}

class DocumentFragment extends ParentNode {
  constructor(doc) { super(doc); this.nodeType = 11; this.nodeName = '#document-fragment'; }
  cloneNode(deep) {
    const copy = new DocumentFragment(this.ownerDocument);
    if (deep) for (const c of this.childNodes) copy.appendChild(c.cloneNode(true));
    return copy;
  }
}

class ClassList {
  constructor(el) { this.el = el; }
  _get() { return (this.el.getAttribute('class') || '').split(/\s+/).filter(Boolean); }
  _set(list) { this.el.setAttribute('class', [...new Set(list)].join(' ')); }
  get length() { return this._get().length; }
  contains(c) { return this._get().includes(c); }
  add(...cs) { this._set([...this._get(), ...cs]); }
  remove(...cs) { this._set(this._get().filter((c) => !cs.includes(c))); }
  toggle(c, force) {
    const on = force ?? !this.contains(c);
    if (on) this.add(c); else this.remove(c);
    return on;
  }
  replace(a, b) { if (!this.contains(a)) return false; this._set(this._get().map((c) => (c === a ? b : c))); return true; }
  [Symbol.iterator]() { return this._get()[Symbol.iterator](); }
}

const camelToData = (key) => `data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

class Element extends ParentNode {
  constructor(doc, tag, ns = null) {
    super(doc);
    this.nodeType = 1;
    this.namespaceURI = ns;
    this.localName = ns ? tag : tag.toLowerCase();
    this.attributes = new Map();
    this.classList = new ClassList(this);
    this.style = new Proxy({ setProperty() {}, removeProperty() {}, getPropertyValue: () => '' }, {
      set: (target, key, value) => { target[key] = value; return true; },
    });
    this.dataset = new Proxy({}, {
      get: (_, key) => (typeof key === 'string' ? this.getAttribute(camelToData(key)) ?? undefined : undefined),
      set: (_, key, value) => { this.setAttribute(camelToData(key), value); return true; },
      deleteProperty: (_, key) => { this.removeAttribute(camelToData(key)); return true; },
      has: (_, key) => this.hasAttribute(camelToData(key)),
    });
    this.scrollTop = 0;
    this.scrollLeft = 0;
    if (this.localName === 'template') this.content = new DocumentFragment(doc);
  }
  get tagName() { return this.namespaceURI ? this.localName : this.localName.toUpperCase(); }
  get nodeName() { return this.tagName; }
  getAttribute(name) { return this.attributes.has(name.toLowerCase()) ? this.attributes.get(name.toLowerCase()) : null; }
  setAttribute(name, value) { this.attributes.set(name.toLowerCase(), String(value)); }
  removeAttribute(name) { this.attributes.delete(name.toLowerCase()); }
  hasAttribute(name) { return this.attributes.has(name.toLowerCase()); }
  toggleAttribute(name, force) {
    const on = force ?? !this.hasAttribute(name);
    if (on) this.setAttribute(name, ''); else this.removeAttribute(name);
    return on;
  }
  get id() { return this.getAttribute('id') ?? ''; }
  set id(v) { this.setAttribute('id', v); }
  get className() { return this.getAttribute('class') ?? ''; }
  set className(v) { this.setAttribute('class', v); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(v) { this.toggleAttribute('hidden', !!v); }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(v) { this.toggleAttribute('disabled', !!v); }
  get checked() { return this._checked ?? this.hasAttribute('checked'); }
  set checked(v) { this._checked = !!v; }
  get value() {
    if (this._value !== undefined) return this._value;
    if (this.localName === 'textarea') return this.textContent;
    if (this.localName === 'select') {
      const opts = this.querySelectorAll('option');
      const opt = opts.find((o) => o.hasAttribute('selected')) || opts[0];
      return opt ? opt.value : '';
    }
    if (this.localName === 'option') return this.getAttribute('value') ?? this.textContent;
    return this.getAttribute('value') ?? '';
  }
  set value(v) { this._value = String(v); }
  get href() { return this.getAttribute('href') ?? ''; }
  set href(v) { this.setAttribute('href', v); }
  get title() { return this.getAttribute('title') ?? ''; }
  set title(v) { this.setAttribute('title', v); }
  get type() { return this.getAttribute('type') ?? (this.localName === 'button' ? 'submit' : ''); }
  get name() { return this.getAttribute('name') ?? ''; }
  get innerText() { return this.textContent; }
  set innerText(v) { this.textContent = v; }
  get innerHTML() { return this.childNodes.map(serialize).join(''); }
  set innerHTML(html) {
    const target = this.localName === 'template' ? this.content : this;
    target.replaceChildren(...parseHTML(this.ownerDocument, String(html), this.namespaceURI));
  }
  get outerHTML() { return serialize(this); }
  get nextElementSibling() { const s = this.parentNode?.children; return s ? s[s.indexOf(this) + 1] ?? null : null; }
  get previousElementSibling() { const s = this.parentNode?.children; return s ? s[s.indexOf(this) - 1] ?? null : null; }
  get offsetWidth() { return 0; }
  get offsetHeight() { return 0; }
  get offsetTop() { return 0; }
  get offsetLeft() { return 0; }
  get clientWidth() { return 0; }
  get clientHeight() { return 0; }
  get scrollWidth() { return 0; }
  get scrollHeight() { return 0; }
  getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  getBBox() { return { x: 0, y: 0, width: 0, height: 0 }; }
  getTotalLength() { return 0; }
  scrollTo() {}
  scrollBy() {}
  scrollIntoView() {}
  focus() { this.ownerDocument.activeElement = this; }
  blur() {}
  select() {}
  click() { this.dispatchEvent(new FakeEvent('click', { bubbles: true })); }
  matches(selector) { return parseSelector(selector).some((g) => matchesGroup(this, g, null)); }
  closest(selector) {
    for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (n.matches(selector)) return n;
    return null;
  }
  insertAdjacentHTML(where, html) {
    const nodes = parseHTML(this.ownerDocument, html, this.namespaceURI);
    if (where === 'beforebegin') this.before(...nodes);
    else if (where === 'afterbegin') this.prepend(...nodes);
    else if (where === 'beforeend') this.append(...nodes);
    else this.after(...nodes);
  }
  insertAdjacentElement(where, node) { this.insertAdjacentHTML(where, ''); ({ beforebegin: () => this.before(node), afterbegin: () => this.prepend(node), beforeend: () => this.append(node), afterend: () => this.after(node) })[where](); return node; }
  animate() { return { finished: Promise.resolve(), cancel() {}, onfinish: null }; }
  cloneNode(deep) {
    const copy = new Element(this.ownerDocument, this.localName, this.namespaceURI);
    for (const [k, v] of this.attributes) copy.attributes.set(k, v);
    if (deep) for (const c of this.childNodes) copy.appendChild(c.cloneNode(true));
    if (this.content) copy.content = this.content.cloneNode(true);
    return copy;
  }
}

function serialize(node) {
  if (node.nodeType === 3) return escapeText(node.data);
  if (node.nodeType === 8) return `<!--${node.data}-->`;
  if (node.nodeType === 11) return node.childNodes.map(serialize).join('');
  const attrs = [...node.attributes].map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
  if (VOID.has(node.localName)) return `<${node.localName}${attrs}>`;
  return `<${node.localName}${attrs}>${node.childNodes.map(serialize).join('')}</${node.localName}>`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function parseHTML(doc, html, ns = null) {
  const root = new DocumentFragment(doc);
  const stack = [{ node: root, ns }];
  const top = () => stack[stack.length - 1];
  const re = /<!--([\s\S]*?)-->|<\/([\w:-]+)\s*>|<([\w:-]+)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+|<)/g;
  let m;
  while ((m = re.exec(html))) {
    const [, comment, close, open, attrText, selfClose, text] = m;
    if (comment !== undefined) top().node.appendChild(new Comment(doc, comment));
    else if (close) {
      const name = close.toLowerCase();
      const i = stack.map((s) => s.node.localName?.toLowerCase()).lastIndexOf(name);
      if (i > 0) stack.length = i;
    } else if (open) {
      const name = open.toLowerCase();
      const inSvg = top().ns === SVG_NS || name === 'svg';
      const el = new Element(doc, inSvg ? open : name, inSvg ? SVG_NS : null);
      for (const a of attrText.matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        el.setAttribute(a[1], decode(a[2] ?? a[3] ?? a[4] ?? ''));
      }
      top().node.appendChild(el);
      if (selfClose || (!inSvg && VOID.has(name))) continue;
      if (RAW_TEXT.has(name)) {
        const end = html.toLowerCase().indexOf(`</${name}`, re.lastIndex);
        const raw = html.slice(re.lastIndex, end === -1 ? html.length : end);
        if (raw) el.appendChild(new Text(doc, name === 'textarea' || name === 'title' ? decode(raw) : raw));
        re.lastIndex = end === -1 ? html.length : html.indexOf('>', end) + 1;
        continue;
      }
      stack.push({ node: name === 'template' ? el.content : el, ns: el.namespaceURI });
    } else if (text) top().node.appendChild(new Text(doc, decode(text)));
  }
  return [...root.childNodes];
}

// Selectors: groups of compound selectors joined by descendant (' ') or
// child ('>') combinators. Pseudo-classes other than :not() are not supported.
function parseSelector(selector) {
  return selector.split(',').map((group) => {
    const parts = [];
    let combinator = ' ';
    for (const token of group.trim().match(/>|(?:[^\s>[]+|\[[^\]]*\])+/g) || []) {
      if (token === '>') { combinator = '>'; continue; }
      parts.push({ combinator, test: compound(token) });
      combinator = ' ';
    }
    return parts;
  });
}
function compound(token) {
  const checks = [];
  const re = /^([\w*-]+)|#([\w-]+)|\.([\w-]+(?:\\.[\w-]*)*)|\[([\w-]+)(?:([~^$*|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]|:not\(([^)]*)\)/g;
  let m;
  let seen = 0;
  while ((m = re.exec(token))) {
    seen += m[0].length;
    const [, tag, id, cls, attr, op, v1, v2, v3, not] = m;
    if (tag && tag !== '*') checks.push((el) => el.localName.toLowerCase() === tag.toLowerCase());
    else if (id) checks.push((el) => el.id === id);
    else if (cls) { const c = cls.replace(/\\/g, ''); checks.push((el) => el.classList.contains(c)); }
    else if (attr) {
      const want = v1 ?? v2 ?? v3;
      checks.push((el) => {
        const have = el.getAttribute(attr);
        if (have === null) return false;
        if (!op) return true;
        if (op === '=') return have === want;
        if (op === '~=') return have.split(/\s+/).includes(want);
        if (op === '^=') return have.startsWith(want);
        if (op === '$=') return have.endsWith(want);
        if (op === '*=') return have.includes(want);
        return have === want || have.startsWith(`${want}-`);
      });
    } else if (not) checks.push((el) => !el.matches(not));
    if (m[0] === '') re.lastIndex += 1;
  }
  if (seen !== token.length) throw new Error(`fake-dom: unsupported selector "${token}"`);
  return (el) => checks.every((check) => check(el));
}
function matchesGroup(el, parts, scope) {
  const match = (node, i) => {
    if (!parts[i].test(node)) return false;
    if (i === 0) return true;
    const up = (n) => (n && n !== scope && n.nodeType === 1 ? n : null);
    if (parts[i].combinator === '>') { const p = up(node.parentNode); return !!p && match(p, i - 1); }
    for (let p = up(node.parentNode); p; p = up(p.parentNode)) if (match(p, i - 1)) return true;
    return false;
  };
  return match(el, parts.length - 1);
}

class Document extends ParentNode {
  constructor() {
    super(null);
    this.ownerDocument = this;
    this.nodeType = 9;
    this.nodeName = '#document';
    this.activeElement = null;
    this.documentElement = new Element(this, 'html');
    this.head = new Element(this, 'head');
    this.body = new Element(this, 'body');
    this.appendChild(this.documentElement);
    this.documentElement.append(this.head, this.body);
    this.activeElement = this.body;
    this.visibilityState = 'visible';
    this.fonts = { ready: Promise.resolve() };
  }
  createElement(tag) { return new Element(this, tag); }
  createElementNS(ns, tag) { return new Element(this, tag, ns); }
  createTextNode(text) { return new Text(this, String(text)); }
  createComment(text) { return new Comment(this, String(text)); }
  createDocumentFragment() { return new DocumentFragment(this); }
}

// A fresh document with the page's roots (#app, #modal-root, #toast-root)
// and the browser globals the views touch. Timers are left real.
export function installFakeDom() {
  const document = new Document();
  for (const id of ['app', 'modal-root', 'toast-root']) {
    const div = document.createElement('div');
    div.id = id;
    document.body.appendChild(div);
  }
  const listeners = new Node(document);
  const location = { hash: '', href: 'http://harrington.test/', origin: 'http://harrington.test', pathname: '/' };
  const window = {
    document,
    location,
    history: { pushState() {}, replaceState() {}, back() {} },
    innerWidth: 1280,
    innerHeight: 900,
    scrollX: 0,
    scrollY: 0,
    devicePixelRatio: 1,
    lucide: null,
    addEventListener: listeners.addEventListener.bind(listeners),
    removeEventListener: listeners.removeEventListener.bind(listeners),
    dispatchEvent: listeners.dispatchEvent.bind(listeners),
    scrollTo() {},
    print() {},
    open() { return null; },
    matchMedia: (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
  };
  const storage = () => {
    const map = new Map();
    return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), clear: () => map.clear() };
  };
  const globals = {
    document,
    window,
    location,
    localStorage: storage(),
    sessionStorage: storage(),
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame,
    matchMedia: window.matchMedia,
    getComputedStyle: window.getComputedStyle,
    CSS: { escape: (s) => String(s).replace(/[^\w-]/g, (c) => `\\${c}`) },
    Event: FakeEvent,
    CustomEvent: FakeEvent,
    KeyboardEvent: FakeEvent,
    MouseEvent: FakeEvent,
    HTMLElement: Element,
    Element,
    Node,
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  return document;
}
