// Honest no-AI mode: one place that explains AI failures and renders the
// quiet "Needs a local AI provider" chip for controls that need the provider.
import * as store from './store.js';
import { el, esc, refreshIcons, toast } from './ui.js';

// The README section that walks a family through setting up a local model.
const AI_HELP_HREF = 'https://github.com/simgue/harrington/blob/main/README.md#optional-local-model-ollama';
const AI_UNAVAILABLE_LABEL = 'Needs a local AI provider';

const MESSAGES = {
  unconfigured: 'This needs a local AI provider, and none is set up on this Harrington server yet. Everything else keeps working.',
  timeout: 'The AI provider took too long to answer. It may still be loading the model, so try again in a minute.',
  unreachable: 'Harrington couldn’t reach the AI provider. Check that it’s running, then try again.',
  provider: 'The AI provider sent back an error or an answer Harrington couldn’t use. Try again.',
  offline: 'Couldn’t reach the Harrington server. Check that it’s still running, then try again.',
  failed: 'Something went wrong while preparing this. Try again.',
};

// Classify an error thrown by an AI-backed action. The server's messages
// arrive through backend.js as the Error message (see server.mjs /api/ai).
export function explainAiError(err) {
  const text = String(err?.message ?? err ?? '');
  let kind = 'failed';
  if (/not configured/i.test(text)) kind = 'unconfigured';
  else if (/timed out|timeout/i.test(text) || err?.name === 'AbortError') kind = 'timeout';
  else if (/AI provider is unreachable/i.test(text)) kind = 'unreachable';
  else if (/AI provider (failed|returned)/i.test(text) || err?.name === 'SyntaxError') kind = 'provider';
  else if (err?.name === 'TypeError' && /fetch|network|load failed/i.test(text)) kind = 'offline';
  return { kind, message: MESSAGES[kind] };
}

// A quiet, disabled-looking chip that links to the setup instructions.
export function aiUnavailableChip(href = AI_HELP_HREF) {
  return el(`<a href="${esc(href)}" target="_blank" rel="noopener" title="Set up a local AI provider to use this" class="ai-unavailable inline-flex max-w-full items-center gap-1.5 px-2.5 py-1 rounded-full border border-paper-line bg-paper text-xs font-medium text-ink-faint hover:text-ink-soft hover:border-ink-faint/40 transition-colors"><i data-lucide="plug-zap" class="w-3.5 h-3.5"></i>${AI_UNAVAILABLE_LABEL}</a>`);
}

// The control itself when the provider is set up, otherwise the chip (or
// `fallback`). With `cachedKey`, a control that only opens content already in
// the lesson cache replaces the placeholder once the cache confirms it.
export function gateAi(control, options = {}) {
  const { href = AI_HELP_HREF, cachedKey = null, fallback = null } = typeof options === 'string' ? { href: options } : options;
  if (store.aiAvailable()) return control;
  const placeholder = fallback || aiUnavailableChip(href);
  if (cachedKey) {
    store.hasCachedLesson(cachedKey).then(found => {
      if (!found || !placeholder.parentNode) return;
      placeholder.replaceWith(control);
      refreshIcons();
    });
  }
  return placeholder;
}

// The "Generate a different version" action, or the chip without a provider.
export function generateAnotherButton(onRegen) {
  const btn = el(`<button class="ai-regen flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"><i data-lucide="refresh-cw" class="w-4 h-4"></i>Generate a different version</button>`);
  btn.onclick = onRegen;
  return gateAi(btn);
}

// `render(value)` returns a detached node and may throw. Both helpers render
// before anything is shown or saved; `onShow(value)` runs once it is on screen.

// "Generate a different version": shows `loading`, then the new version. On
// any failure (provider, shape, render or save) the previous content comes
// back with an inline error and Retry above it, and the cache keeps it too.
export async function regenerateInto(stage, opts) {
  const { key, generate, render, loading, onShow = null } = opts;
  const previous = [...stage.childNodes].filter(n => !n.classList?.contains('ai-regen-error'));
  stage.replaceChildren(loading);
  refreshIcons();
  try {
    const fresh = await store.generateCached(key, generate, { force: true, accept: render });
    stage.replaceChildren(render(fresh));
    refreshIcons();
    onShow?.(fresh);
    return fresh;
  } catch (err) {
    const block = aiErrorBlock(err, () => regenerateInto(stage, opts), { compact: true });
    block.classList.add('ai-regen-error');
    stage.replaceChildren(block, ...previous);
    refreshIcons();
    return null;
  }
}

// Opens cached or freshly generated content. A failure to generate shows the
// error with `retry`; a cached value that no longer renders offers a fresh
// version instead of reading the same cache again.
export async function showGenerated(stage, { key, generate, render, loading, retry, onShow = null }) {
  let value;
  try {
    value = await store.generateCached(key, generate, { accept: render });
  } catch (err) {
    stage.replaceChildren(aiErrorBlock(err, retry));
    return null;
  }
  try {
    stage.replaceChildren(render(value));
    refreshIcons();
    onShow?.(value);
    return value;
  } catch (err) {
    console.error(err);
    const block = aiErrorBlock(store.invalidResult(), () => regenerateInto(stage, { key, generate, render, loading, onShow }));
    block.classList.add('ai-regen-error');
    stage.replaceChildren(block);
    return null;
  }
}

// Replaces every "Couldn't … right now" message. `retry` re-runs the action;
// for "not configured" the button re-reads /api/health first.
export function aiErrorBlock(err, retry = null, { compact = false } = {}) {
  const { kind, message } = explainAiError(err);
  const unconfigured = kind === 'unconfigured';
  if (!unconfigured) console.error(err); // a missing provider is expected, not an error
  const b = el(compact
    ? `<div class="py-2"><p class="text-sm ${unconfigured ? 'text-ink-soft' : 'text-[#a4473a]'} leading-relaxed">${esc(message)}</p><div class="actions flex flex-wrap items-center gap-3 mt-2"></div></div>`
    : `<div class="text-center py-10">
        <i data-lucide="${unconfigured ? 'plug-zap' : 'cloud-off'}" class="w-8 h-8 text-ink-faint mx-auto mb-3"></i>
        <p class="text-sm text-ink-soft mb-3 max-w-sm mx-auto leading-relaxed">${esc(message)}</p>
        <div class="actions flex flex-wrap items-center justify-center gap-3"></div>
      </div>`);
  const actions = b.querySelector('.actions');
  if (unconfigured) {
    actions.appendChild(el(`<a href="${AI_HELP_HREF}" target="_blank" rel="noopener" class="text-sm font-medium text-brand-dark underline underline-offset-2">How to set one up</a>`));
  }
  if (retry) {
    const btn = el(`<button class="px-4 py-2 rounded-lg ${compact ? 'border border-paper-line text-ink-soft hover:border-brand/40' : 'bg-brand text-white'} text-sm font-medium">${unconfigured ? 'Retry' : 'Try again'}</button>`);
    btn.onclick = async () => {
      if (unconfigured) {
        btn.disabled = true;
        let available;
        try { available = await store.refreshHealth(); }
        catch (healthErr) {
          // The server or network is down; say so instead of "no provider".
          b.replaceWith(aiErrorBlock(healthErr, retry, { compact }));
          return;
        }
        btn.disabled = false;
        if (!available) { toast('Still no AI provider on this server'); return; }
      }
      retry();
    };
    actions.appendChild(btn);
  }
  if (!actions.children.length) actions.remove();
  refreshIcons();
  return b;
}
