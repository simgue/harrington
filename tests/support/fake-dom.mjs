// A minimal stand-in for the browser, enough to render the graph view in Node:
// an HTML parser for el(), simple selectors, focus, scroll offsets, a frame
// queue and a hash history with Back and Forward. Layout is whatever the test
// says it is (layoutOf); nothing is measured.

const VOID = new Set(['area', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" };
const decode = (text) => text.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, name) => ENTITIES[name]);

class FakeNode {
  constructor(doc) {
    this.ownerDocument = doc;
    this.parentNode = null;
    this.childNodes = [];
  }

  get parentElement() { return this.parentNode instanceof FakeElement ? this.parentNode : null; }

  get isConnected() {
    let at = this;
    while (at.parentNode) at = at.parentNode;
    return at === this.ownerDocument.documentElement;
  }

  remove() {
    if (!this.parentNode) return;
    const siblings = this.parentNode.childNodes;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentNode = null;
  }

  replaceWith(node) {
    const parent = this.parentNode;
    if (!parent) return;
    node.remove();
    parent.childNodes.splice(parent.childNodes.indexOf(this), 1, node);
    node.parentNode = parent;
    this.parentNode = null;
  }
}

class FakeText extends FakeNode {
  constructor(doc, text) {
    super(doc);
    this.nodeType = 3;
    this.data = text;
  }

  get textContent() { return this.data; }
}

class FakeElement extends FakeNode {
  constructor(doc, tag) {
    super(doc);
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.attrs = new Map();
    this.style = {};
    this.listeners = new Map();
    this.scrollLeft = 0;
    this.scrollTop = 0;
    this.focusCalls = [];
    this.scrollIntoViewCalls = [];
    this.dataset = new Proxy({}, {
      get: (_, name) => this.getAttribute(dataAttr(name)) ?? undefined,
      set: (_, name, value) => { this.setAttribute(dataAttr(name), value); return true; },
      has: (_, name) => this.hasAttribute(dataAttr(name)),
    });
    const element = this;
    this.classList = {
      contains: (name) => element.className.split(/\s+/).includes(name),
      add: (...names) => { element.className = [...new Set([...element.className.split(/\s+/), ...names])].filter(Boolean).join(' '); },
      remove: (...names) => { element.className = element.className.split(/\s+/).filter((n) => n && !names.includes(n)).join(' '); },
    };
  }

  get children() { return this.childNodes.filter((node) => node instanceof FakeElement); }
  get firstElementChild() { return this.children[0] || null; }
  get id() { return this.getAttribute('id') || ''; }
  get className() { return this.getAttribute('class') || ''; }
  set className(value) { this.setAttribute('class', value); }

  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  hasAttribute(name) { return this.attrs.has(name); }
  removeAttribute(name) { this.attrs.delete(name); }

  appendChild(node) {
    if (node.isFragment) {
      for (const child of [...node.childNodes]) this.appendChild(child);
      return node;
    }
    node.remove();
    this.childNodes.push(node);
    node.parentNode = this;
    return node;
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(typeof node === 'string' ? new FakeText(this.ownerDocument, node) : node);
  }

  set innerHTML(html) {
    for (const child of [...this.childNodes]) child.remove();
    for (const node of parseHtml(this.ownerDocument, html)) this.appendChild(node);
  }

  get textContent() { return this.childNodes.map((node) => node.textContent).join(''); }
  set textContent(text) {
    for (const child of [...this.childNodes]) child.remove();
    this.appendChild(new FakeText(this.ownerDocument, String(text)));
  }

  // <template>.content: the parsed children, in a detached fragment.
  get content() {
    const fragment = new FakeElement(this.ownerDocument, '#fragment');
    fragment.isFragment = true;
    for (const child of [...this.childNodes]) fragment.appendChild(child);
    return fragment;
  }

  matches(selector) { return matchesSelector(this, selector); }
  closest(selector) {
    for (let at = this; at instanceof FakeElement; at = at.parentNode) if (at.matches(selector)) return at;
    return null;
  }
  querySelectorAll(selector) {
    const found = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  dispatch(type) {
    for (const fn of this.listeners.get(type) || []) fn({ type, target: this });
  }
  click() {
    if (this.hasAttribute('disabled')) return;
    if (this.onclick) this.onclick({ type: 'click', target: this, preventDefault() {}, stopPropagation() {} });
    this.dispatch('click');
  }
  focus(options) {
    this.focusCalls.push(options);
    this.ownerDocument.activeElement = this;
  }
  scrollIntoView(options) { this.scrollIntoViewCalls.push(options); }

  getBoundingClientRect() {
    const box = this.ownerDocument.layoutOf(this);
    return box ? { ...box, bottom: box.top + box.height, right: box.left + box.width } : { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 };
  }
  get offsetLeft() { return parseFloat(this.style.left || /left:(-?[\d.]+)px/.exec(this.getAttribute('style') || '')?.[1] || 0); }
  get offsetTop() { return parseFloat(this.style.top || /top:(-?[\d.]+)px/.exec(this.getAttribute('style') || '')?.[1] || 0); }
  get offsetWidth() { return parseFloat(/width:(-?[\d.]+)px/.exec(this.getAttribute('style') || '')?.[1] || 0); }
  get offsetHeight() { return parseFloat(/height:(-?[\d.]+)px/.exec(this.getAttribute('style') || '')?.[1] || 0); }
  get clientWidth() { return this.ownerDocument.layoutOf(this)?.width ?? 0; }
  get clientHeight() { return this.ownerDocument.layoutOf(this)?.height ?? 0; }
}

function dataAttr(name) {
  return 'data-' + String(name).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

// Compound selectors (tag, .class, #id, [attr], [attr="value"]) joined by
// descendant spaces. Enough for the queries the views make.
function matchesSelector(element, selector) {
  const parts = selector.trim().match(/(?:[^\s"[\]]+|\[[^\]]*\])+/g);
  const last = parts.pop();
  if (!matchesCompound(element, last)) return false;
  let at = element.parentElement;
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    while (at && !matchesCompound(at, parts[i])) at = at.parentElement;
    if (!at) return false;
    at = at.parentElement;
  }
  return true;
}

function matchesCompound(element, compound) {
  const re = /([a-zA-Z][\w-]*)|\.([\w-]+)|#([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g;
  let match;
  while ((match = re.exec(compound))) {
    const [, tag, cls, id, attr, value] = match;
    if (tag && element.tagName !== tag.toUpperCase()) return false;
    if (cls && !element.classList.contains(cls)) return false;
    if (id && element.id !== id) return false;
    if (attr && (!element.hasAttribute(attr) || (value !== undefined && element.getAttribute(attr) !== value))) return false;
  }
  return true;
}

function parseHtml(doc, html) {
  const root = new FakeElement(doc, '#root');
  const stack = [root];
  const token = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  let match;
  while ((match = token.exec(html))) {
    const [, close, open, attrs, selfClose, text] = match;
    const top = stack[stack.length - 1];
    if (text !== undefined) {
      top.appendChild(new FakeText(doc, decode(text)));
    } else if (close) {
      const at = stack.map((node) => node.tagName).lastIndexOf(close.toUpperCase());
      if (at > 0) stack.length = at;
    } else if (open) {
      const element = new FakeElement(doc, open);
      const attr = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let pair;
      while ((pair = attr.exec(attrs))) element.setAttribute(pair[1], decode(pair[2] ?? pair[3] ?? pair[4] ?? ''));
      top.appendChild(element);
      if (!selfClose && !VOID.has(open.toLowerCase())) stack.push(element);
    }
  }
  return [...root.childNodes];
}

class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement(this, 'html');
    this.body = new FakeElement(this, 'body');
    this.documentElement.appendChild(this.body);
    this.activeElement = this.body;
    this.layout = new Map(); // element -> { top, left, width, height }
  }

  layoutOf(element) { return this.layout.get(element) || null; }
  addEventListener() {}
  createElement(tag) { return new FakeElement(this, tag); }
  createElementNS(_, tag) { return new FakeElement(this, tag); }
  createTextNode(text) { return new FakeText(this, text); }
  querySelector(selector) { return this.documentElement.querySelector(selector); }
  querySelectorAll(selector) { return this.documentElement.querySelectorAll(selector); }
  getElementById(id) { return this.documentElement.querySelector(`#${id}`); }
}

// A window with a hash history. Pushes and replaces behave like the browser's
// (a fragment push starts with a null state); back() and forward() move
// through the entries and fire popstate then hashchange.
class FakeWindow {
  constructor() {
    this.scrollX = 0;
    this.scrollY = 0;
    this.innerHeight = 800;
    this.innerWidth = 1280;
    this.scrolls = [];
    this.listeners = new Map();
    this.entries = [{ hash: '', state: null }];
    this.index = 0;
    const win = this;
    this.location = {
      get hash() { return win.entries[win.index].hash; },
      set hash(value) {
        const hash = '#' + String(value).replace(/^#/, '');
        win.entries.length = win.index + 1;
        win.entries.push({ hash, state: null });
        win.index += 1;
      },
    };
    this.history = {
      get state() { return win.entries[win.index].state; },
      get length() { return win.entries.length; },
      replaceState(state, _title, url) {
        const entry = win.entries[win.index];
        entry.state = state == null ? null : structuredClone(state);
        if (url !== undefined) entry.hash = '#' + String(url).replace(/^#/, '');
      },
    };
  }

  scrollTo(options) {
    this.scrolls.push(options);
    if (options.left != null) this.scrollX = options.left;
    if (options.top != null) this.scrollY = options.top;
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  fire(type) { for (const fn of this.listeners.get(type) || []) fn({ type }); }

  // The user scrolls the page.
  scrollByUser(y) {
    this.scrollY = y;
    this.fire('scroll');
  }

  go(delta) {
    this.index += delta;
    this.fire('popstate');
    this.fire('hashchange');
  }
  back() { this.go(-1); }
  forward() { this.go(1); }
}

// Installs the fakes as globals. Call before importing any view module.
export function installFakeDom() {
  const document = new FakeDocument();
  const window = new FakeWindow();
  const frames = [];
  Object.assign(globalThis, {
    document,
    window,
    requestAnimationFrame: (fn) => frames.push(fn),
    CSS: { escape: (value) => String(value).replace(/["\\]/g, '\\$&') },
    getComputedStyle: (element) => ({
      transform: element.style.transform || 'none',
      scrollMarginTop: element.style.scrollMarginTop || '0px',
    }),
    DOMMatrixReadOnly: class {
      constructor(transform) {
        const values = /matrix\(([^)]*)\)/.exec(transform)[1].split(',').map(Number);
        this.m41 = values[4];
        this.m42 = values[5];
      }
    },
  });
  // Runs the frame callbacks queued so far, as the browser does before a paint.
  const flushFrame = () => {
    const due = frames.splice(0);
    for (const fn of due) fn();
    return due.length;
  };
  return { document, window, flushFrame, pendingFrames: () => frames.length };
}
