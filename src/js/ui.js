// Small UI helpers: DOM, icons, toasts, modals.

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// "1 topic", "3 topics". Until the shared count formatter lands, the one
// plural rule for counts shown in the views.
export function countOf(n, singular, plural = `${singular}s`) {
  return `${n} ${Number(n) === 1 ? singular : plural}`;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let iconTimer = null;
export function refreshIcons() {
  clearTimeout(iconTimer);
  iconTimer = setTimeout(() => { try { window.lucide?.createIcons(); } catch (e) {} }, 10);
}

export function toast(msg, kind = 'default') {
  const root = document.getElementById('toast-root');
  const colors = {
    default: 'bg-ink text-white',
    success: 'bg-brand text-white',
    error: 'bg-[#a4473a] text-white',
  };
  const t = el(`<div class="px-4 py-2.5 rounded-lg text-sm font-medium ${colors[kind] || colors.default} shadow-lg flex items-center gap-2 opacity-0 translate-y-2 transition-all duration-300">${esc(msg)}</div>`);
  root.appendChild(t);
  requestAnimationFrame(() => { t.classList.remove('opacity-0', 'translate-y-2'); });
  setTimeout(() => {
    t.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => t.remove(), 300);
  }, 2800);
}

// Bookkeeping for open modals, kept free of the DOM so tests can drive it.
// A single Escape listener is attached while any modal is open and dismisses
// only the top-most one; it is detached when the last modal closes.
export function createModalStack(listen, unlisten) {
  const stack = [];
  const onKey = e => {
    if (e.key !== 'Escape' || !stack.length) return;
    e.preventDefault?.();
    stack[stack.length - 1].dismiss();
  };
  return {
    size: () => stack.length,
    // teardown removes the modal from view; beforeClose may return false to
    // cancel a dismissal. Callers may override handle.close to run cleanup,
    // and every close path (button, Escape, backdrop) goes through it.
    open(teardown, beforeClose = null) {
      let closed = false;
      const handle = {
        beforeClose,
        close() {
          if (closed) return;
          closed = true;
          const i = stack.indexOf(handle);
          if (i >= 0) stack.splice(i, 1);
          if (!stack.length) unlisten(onKey);
          teardown();
        },
        dismiss() {
          if (closed) return false;
          if (handle.beforeClose && handle.beforeClose() === false) return false;
          handle.close();
          return true;
        },
        isOpen: () => !closed,
      };
      if (!stack.length) listen(onKey);
      stack.push(handle);
      return handle;
    },
  };
}

let modals = null;

// opts.beforeClose: optional guard run on Escape or a backdrop tap; return
// false to keep the modal open (e.g. after a declined confirm()).
export function openModal(contentEl, opts = {}) {
  modals ||= createModalStack(
    fn => document.addEventListener('keydown', fn),
    fn => document.removeEventListener('keydown', fn));
  const root = document.getElementById('modal-root');
  const overlay = el(`<div class="fixed inset-0 z-[99] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-ink/40 backdrop-blur-sm opacity-0 transition-opacity duration-200"></div>`);
  const panel = el(`<div class="bg-paper-card w-full ${opts.wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto border border-paper-line translate-y-4 sm:translate-y-0 sm:scale-95 transition-all duration-200"></div>`);
  panel.appendChild(contentEl);
  overlay.appendChild(panel);
  root.appendChild(overlay);
  refreshIcons();
  requestAnimationFrame(() => {
    overlay.classList.remove('opacity-0');
    panel.classList.remove('translate-y-4', 'sm:scale-95');
  });
  const handle = modals.open(() => {
    overlay.classList.add('opacity-0');
    panel.classList.add('sm:scale-95');
    setTimeout(() => overlay.remove(), 200);
  }, opts.beforeClose || null);
  handle.panel = panel;
  overlay.addEventListener('click', e => { if (e.target === overlay) handle.dismiss(); });
  return handle;
}

export function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
export function fmtDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function initials(name) {
  return (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}
