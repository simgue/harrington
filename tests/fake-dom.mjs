// A minimal fake document for DOM-level unit tests of views built with ui.el().
// It parses the well-formed markup the views write (elements, quoted attributes,
// text), and supports class/tag queries, classList, events and the few element
// properties the opt-in controls use. Not a browser: no layout, no CSS.

const VOID = new Set(['input', 'br', 'img', 'hr', 'meta', 'link']);
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

class FakeText {
  constructor(text) { this.text = text; this.parentNode = null; }
  get textContent() { return this.text; }
}

class FakeElement {
  constructor(tag, attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.attributes = { ...attrs };
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = {};
    this.hidden = 'hidden' in attrs;
    this.disabled = 'disabled' in attrs;
    this.checked = 'checked' in attrs;
    this.title = attrs.title || '';
    this.type = attrs.type || '';
    const classes = (attrs.class || '').split(/\s+/).filter(Boolean);
    this.classList = {
      contains: (c) => classes.includes(c),
      add: (...cs) => cs.forEach((c) => { if (!classes.includes(c)) classes.push(c); }),
      remove: (...cs) => cs.forEach((c) => { const i = classes.indexOf(c); if (i !== -1) classes.splice(i, 1); }),
      toggle: (c, on = !classes.includes(c)) => { if (on) this.classList.add(c); else this.classList.remove(c); return on; },
      replace: (a, b) => { const i = classes.indexOf(a); if (i === -1) return false; classes[i] = b; return true; },
      toString: () => classes.join(' '),
    };
  }
  get className() { return this.classList.toString(); }
  get children() { return this.childNodes.filter((n) => n instanceof FakeElement); }
  get firstElementChild() { return this.children[0] || null; }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(v) { this.childNodes = []; if (v !== '') this.appendChild(new FakeText(String(v))); }
  set innerHTML(html) { this.childNodes = []; for (const n of parse(html)) this.appendChild(n); }
  getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; }
  appendChild(node) { node.parentNode?.childNodes && node.parentNode.removeChild(node); node.parentNode = this; this.childNodes.push(node); return node; }
  removeChild(node) { this.childNodes = this.childNodes.filter((n) => n !== node); node.parentNode = null; return node; }
  closest(selector) { for (let n = this; n instanceof FakeElement; n = n.parentNode) if (matches(n, selector)) return n; return null; }
  querySelectorAll(selector) {
    const out = [];
    const walk = (n) => n.children.forEach((c) => { if (matches(c, selector)) out.push(c); walk(c); });
    walk(this);
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatchEvent(event) { for (const fn of this.listeners[event.type] || []) fn.call(this, event); return true; }
  // A click on a checkbox, or on the label that holds one, toggles it and fires `change`.
  click() {
    const box = this.type === 'checkbox' ? this : this.tagName === 'LABEL' ? this.querySelector('input') : null;
    if (box && !box.disabled) { box.checked = !box.checked; box.dispatchEvent({ type: 'change', target: box }); }
    if (typeof this.onclick === 'function' && !this.disabled) this.onclick({ type: 'click', target: this });
  }
}

// Tag, `.class`, or `tag.class` (several classes allowed).
function matches(node, selector) {
  const [tag, ...classes] = selector.trim().split('.');
  if (tag && node.tagName !== tag.toUpperCase()) return false;
  return classes.every((c) => node.classList.contains(c));
}

function parse(html) {
  const root = new FakeElement('#root');
  let at = root;
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*\/?>|([^<]+)/g;
  for (const m of html.matchAll(re)) {
    const [, closing, tag, attrText, text] = m;
    if (text !== undefined) { at.appendChild(new FakeText(decode(text))); continue; }
    if (closing) { at = at.parentNode || root; continue; }
    const attrs = {};
    for (const a of (attrText || '').matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) attrs[a[1]] = decode(a[2] ?? '');
    const node = at.appendChild(new FakeElement(tag.toLowerCase(), attrs));
    if (!VOID.has(tag.toLowerCase())) at = node;
  }
  return [...root.childNodes];
}

export function installFakeDocument() {
  globalThis.document = {
    createElement(tag) {
      const node = new FakeElement(tag);
      if (tag === 'template') {
        Object.defineProperty(node, 'content', { get: () => ({ firstElementChild: node.firstElementChild }) });
      }
      return node;
    },
  };
  return globalThis.document;
}
