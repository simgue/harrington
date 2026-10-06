// Settings > AI provider: the parent sets the provider, its API key and which
// AI capabilities are switched on, with no environment variables and no
// restart. The server keeps the key (data/private/secrets.json) and only ever
// shows its last four characters. Parent side only.
import * as backend from '../backend.js';
import * as store from '../store.js';
import { AI_CAPABILITIES } from '../ai-capabilities.js';
import { el, esc, refreshIcons, toast } from '../ui.js';

const CAPABILITY_LABELS = {
  lesson: 'Lessons',
  printables: 'Print & go sheets',
  activity: 'Activity and game instructions',
  test: 'Mastery tests',
  challenge: 'Challenge quizzes',
  recall: 'Recall cards',
  analysis: 'Discussion advice',
  review: 'Progress reviews',
  explain: 'Explain simply',
  quiz: 'Mini-quizzes',
};

// Survive a re-render (any store change redraws the page): what the parent
// has typed but not saved, and the last connection test.
let draft = null;
let lastTest = null;

const field = 'w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand';
const secondary = 'px-3.5 py-2 rounded-lg border border-paper-line bg-paper text-sm font-medium text-ink-soft hover:border-brand/40 transition-colors';

export function renderSettings() {
  const root = el(`<div class="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up">
    <div class="mb-5">
      <h1 class="font-display text-2xl sm:text-3xl font-600">AI provider</h1>
      <p class="text-ink-soft text-sm mt-1">Harrington works without AI. Set a provider here to write lessons and the other AI features, one capability at a time.</p>
    </div>
    <div id="body"><div class="flex items-center gap-2 text-sm text-ink-soft py-6"><div class="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>Loading the AI settings…</div></div>
  </div>`);
  const body = root.querySelector('#body');
  backend.loadAiSettings().then(
    (settings) => { body.replaceChildren(settingsForm(settings)); refreshIcons(); },
    () => { body.replaceChildren(el(`<p class="text-sm text-[#a4473a] py-6">Couldn’t reach the Harrington server to read the AI settings. Check that it’s still running, then reload.</p>`)); },
  );
  return root;
}

function statusCard(s) {
  const stored = Object.values(s.source).includes('app');
  if (!s.configured && !stored) {
    return el(`<div class="rounded-2xl border border-paper-line bg-paper p-4 mb-5">
      <p class="text-sm font-600">No AI provider is set up</p>
      <p class="text-sm text-ink-soft mt-0.5">Choose one of the presets below to add one.</p>
    </div>`);
  }
  if (s.source.baseUrl === 'env' && !stored) {
    return el(`<div class="rounded-2xl border border-paper-line bg-paper p-4 mb-5">
      <p class="text-sm font-600">Configured from the server environment</p>
      <p class="text-sm text-ink-soft mt-0.5 break-all">${esc(s.baseUrl)} · ${esc(s.model)}${s.hasApiKey ? ` · key ends in …${esc(s.apiKeyHint || '')}` : ''}</p>
      <p class="text-xs text-ink-faint mt-1">Saving here overrides these values. Removing what you saved returns to them.</p>
    </div>`);
  }
  return el(`<div class="rounded-2xl border border-brand/30 bg-brand-light/40 p-4 mb-5">
    <p class="text-sm font-600">${s.configured ? 'Saved in Harrington' : 'Saved in Harrington, but incomplete'}</p>
    <p class="text-sm text-ink-soft mt-0.5">${s.configured ? 'These settings are in use now.' : 'A base URL and a model are both needed.'}</p>
  </div>`);
}

function settingsForm(s) {
  const values = draft || {
    baseUrl: s.baseUrl,
    model: s.model,
    // Nothing chosen anywhere yet: lessons first, as docs/AI-SETUP.md suggests.
    capabilities: !s.configured && s.source.capabilities === 'none' ? ['lesson'] : [...s.capabilities],
    timeoutSeconds: Math.round(s.timeoutMs / 1000),
  };
  const keyFromApp = s.source.apiKey === 'app';
  const keyPlaceholder = s.hasApiKey
    ? (s.apiKeyHint ? `Saved, ends in …${s.apiKeyHint}` : 'Saved')
    : 'Paste the key from your provider, if it needs one';
  const stored = Object.values(s.source).includes('app');

  const form = el(`<form class="space-y-5" autocomplete="off">
    <div id="status"></div>
    <div>
      <p class="text-sm font-medium mb-2">Provider</p>
      <div class="flex flex-wrap gap-2" id="presets"></div>
    </div>
    <label class="block">
      <span class="text-sm font-medium">Base URL</span>
      <input name="baseUrl" type="url" inputmode="url" spellcheck="false" class="${field} mt-1" placeholder="http://127.0.0.1:11434/v1" />
    </label>
    <label class="block">
      <span class="text-sm font-medium">Model</span>
      <input name="model" spellcheck="false" class="${field} mt-1" placeholder="The model name your provider lists" />
    </label>
    <div>
      <label class="block">
        <span class="text-sm font-medium">API key</span>
        <input name="apiKey" type="password" spellcheck="false" autocomplete="new-password" class="${field} mt-1" placeholder="${esc(keyPlaceholder)}" />
      </label>
      <div class="flex flex-wrap items-center gap-2 mt-2" id="key-actions"></div>
      <p class="text-xs text-ink-faint mt-1.5">Kept on the Harrington server only and never shown again or sent to this page. Export and <code>npm run backup</code> leave it out.</p>
    </div>
    <fieldset>
      <legend class="text-sm font-medium">Switched on</legend>
      <p class="text-xs text-ink-faint mb-2">Start with lessons. The rest show “Not switched on yet” until you tick them.</p>
      <div class="grid sm:grid-cols-2 gap-1.5" id="caps"></div>
    </fieldset>
    <details class="rounded-xl border border-paper-line bg-paper px-3.5 py-2.5">
      <summary class="text-sm font-medium cursor-pointer">Advanced</summary>
      <label class="block mt-3">
        <span class="text-sm">Timeout, in seconds</span>
        <input name="timeoutSeconds" type="number" min="1" max="3600" step="1" class="${field} mt-1" />
      </label>
      <p class="text-xs text-ink-faint mt-1">How long to wait for one answer. Local models can take a few minutes for a lesson.</p>
    </details>
    <div class="flex flex-wrap items-center gap-2">
      <button type="submit" class="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white text-sm font-medium transition-colors">Save</button>
      <button type="button" id="test" class="${secondary}">Test connection</button>
      ${stored ? `<button type="button" id="remove-all" class="${secondary}">Remove saved settings</button>` : ''}
    </div>
    <div id="test-result" aria-live="polite"></div>
    <div class="rounded-2xl bg-paper p-4 text-sm text-ink-soft leading-relaxed">
      <p class="font-600 text-ink mb-1 flex items-center gap-1.5"><i data-lucide="shield" class="w-4 h-4"></i>What leaves this computer</p>
      <p>With a provider on this computer (such as Ollama), nothing leaves the house. With a cloud provider, the prompts go to that company: for lessons, only the topic: its name, subject, description and age band. Learners’ names are never put in a prompt, and your notes are sent only when you tick “Include my notes in this request” for one request.</p>
    </div>
  </form>`);

  form.querySelector('#status').replaceWith(statusCard(s));
  const input = (name) => form.querySelector(`[name="${name}"]`);
  input('baseUrl').value = values.baseUrl || '';
  input('model').value = values.model || '';
  input('timeoutSeconds').value = values.timeoutSeconds || '';

  const caps = form.querySelector('#caps');
  for (const capability of AI_CAPABILITIES) {
    const row = el(`<label class="flex items-center gap-2 text-sm py-1"><input type="checkbox" class="w-4 h-4 accent-[#3f6b3b]" value="${capability}" />${esc(CAPABILITY_LABELS[capability] || capability)}</label>`);
    row.querySelector('input').checked = values.capabilities.includes(capability);
    caps.appendChild(row);
  }
  const checked = () => [...caps.querySelectorAll('input:checked')].map((box) => box.value);

  const remember = () => {
    draft = {
      baseUrl: input('baseUrl').value,
      model: input('model').value,
      capabilities: checked(),
      timeoutSeconds: input('timeoutSeconds').value,
    };
  };
  form.addEventListener('input', remember);

  // Presets fill the address and a suggested model; a cloud one switches on lessons only.
  const presets = form.querySelector('#presets');
  for (const preset of s.presets) {
    const chip = el(`<button type="button" class="px-3 py-1.5 rounded-full border border-paper-line bg-paper text-sm hover:border-brand/40 transition-colors" aria-pressed="false">${esc(preset.label)}</button>`);
    if (preset.baseUrl && preset.baseUrl === input('baseUrl').value) chip.setAttribute('aria-pressed', 'true');
    chip.onclick = () => {
      input('baseUrl').value = preset.baseUrl;
      input('model').value = preset.model;
      if (preset.cloud) caps.querySelectorAll('input').forEach((box) => { box.checked = box.value === 'lesson'; });
      presets.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === chip)));
      remember();
      (preset.model ? input('apiKey') : input(preset.baseUrl ? 'model' : 'baseUrl')).focus();
    };
    presets.appendChild(chip);
  }

  // Replace focuses the key field; Remove forgets the saved key at once.
  const keyActions = form.querySelector('#key-actions');
  if (s.hasApiKey) {
    const replace = el(`<button type="button" class="${secondary}">Replace</button>`);
    replace.onclick = () => { input('apiKey').placeholder = 'Paste the new key'; input('apiKey').focus(); };
    keyActions.appendChild(replace);
  }
  if (keyFromApp) {
    const remove = el(`<button type="button" class="${secondary}">Remove</button>`);
    remove.onclick = () => run(form, () => backend.saveAiSettings({ apiKey: '' }), 'API key removed');
    keyActions.appendChild(remove);
  }
  if (s.hasApiKey && !keyFromApp) {
    keyActions.appendChild(el(`<span class="text-xs text-ink-faint">This key comes from the server environment; a key saved here takes its place.</span>`));
  }
  if (!keyActions.children.length) keyActions.remove();

  // Save sends a field only when the parent changed it or it is already saved
  // here, so a value from the server environment stays the environment's.
  const sameSet = (a, b) => a.length === b.length && a.every((c) => b.includes(c));
  form.onsubmit = (e) => {
    e.preventDefault();
    const seconds = String(input('timeoutSeconds').value).trim();
    const now = {
      baseUrl: input('baseUrl').value.trim(),
      model: input('model').value.trim(),
      capabilities: checked(),
      timeoutMs: seconds ? Math.round(Number(seconds) * 1000) : null,
    };
    const changed = {
      baseUrl: now.baseUrl !== s.baseUrl,
      model: now.model !== s.model,
      capabilities: !sameSet(now.capabilities, s.capabilities),
      timeoutMs: now.timeoutMs !== null && Math.round(now.timeoutMs / 1000) !== Math.round(s.timeoutMs / 1000),
    };
    const patch = {};
    for (const name of Object.keys(now)) {
      if (!changed[name] && s.source[name] !== 'app') continue;
      patch[name] = name === 'capabilities' ? now[name] : (now[name] || null);
    }
    const key = input('apiKey').value.trim();
    if (key) patch.apiKey = key;
    run(form, () => backend.saveAiSettings(patch), 'AI settings saved');
  };
  form.querySelector('#remove-all')?.addEventListener('click', () => {
    if (!confirm('Remove the AI settings saved here, including the API key? Anything set in the server environment applies again.')) return;
    run(form, () => backend.removeAiSettings(), 'Saved AI settings removed');
  });

  const result = form.querySelector('#test-result');
  if (lastTest) result.replaceChildren(testLine(lastTest));
  form.querySelector('#test').onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    result.replaceChildren(el(`<p class="text-sm text-ink-soft flex items-center gap-2"><span class="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin"></span>Testing the saved settings…</p>`));
    try {
      lastTest = await backend.testAiSettings();
    } catch (err) {
      lastTest = err?.status === 403 ? { ok: false, error: 'refused', message: err.message } : { ok: false, error: 'offline' };
    }
    btn.disabled = false;
    result.replaceChildren(testLine(lastTest));
    await syncHealth();
  };

  // Without an access token, only the computer running Harrington may change
  // these. Last, so every control added above is covered.
  if (s.canChange === false) {
    form.querySelector('#test-result').before(el(`<p class="read-only-note text-sm text-[#a4473a]">AI provider settings can only be changed from the computer running Harrington, or from any signed-in device once an access token is set.</p>`));
    form.querySelectorAll('input, button, select, textarea').forEach((node) => {
      node.disabled = true;
      node.classList.add('opacity-50', 'cursor-not-allowed');
    });
  }

  return form;
}

// Saves, removes or tests, then redraws from what the server now has, and
// re-reads /api/health so every AI control on the page follows.
async function run(form, action, done) {
  const buttons = [...form.querySelectorAll('button')];
  buttons.forEach((b) => { b.disabled = true; });
  try {
    const settings = await action();
    draft = null;
    lastTest = null;
    toast(done, 'success');
    form.replaceWith(settingsForm(settings));
    refreshIcons();
    await syncHealth();
  } catch (err) {
    buttons.forEach((b) => { b.disabled = false; });
    toast(err?.status === 400 || err?.status === 403 ? err.message : 'Couldn’t save the AI settings. Check that Harrington is still running.', 'error');
  }
}

async function syncHealth() {
  try { await store.refreshHealth(); } catch { /* the page already says what happened */ }
}

function testLine(t) {
  if (t.ok) {
    return el(`<p class="text-sm text-brand-dark flex items-center gap-1.5"><i data-lucide="check-circle-2" class="w-4 h-4"></i>Connected. The provider answered in ${(t.latencyMs / 1000).toFixed(1)} s.</p>`);
  }
  let why;
  if (t.error === 'refused') return el(`<p class="text-sm text-[#a4473a]">${esc(t.message)}</p>`);
  if (t.error === 'not configured') why = 'save a base URL and a model first.';
  else if (t.error === 'offline') why = 'Harrington’s server didn’t answer.';
  else if (t.error === 'timed out') why = 'the provider took too long to answer. A local model may still be loading; try again in a minute.';
  else if (t.error === 'unreachable') why = 'nothing answered at that base URL. Check the address and that the provider is running.';
  else if (t.status === 401 || t.status === 403) why = `the provider refused the API key (HTTP ${t.status}).`;
  else if (t.status === 404) why = 'the provider doesn’t know that address or model (HTTP 404).';
  else if (t.status) why = `the provider answered with an error (HTTP ${t.status}).`;
  else why = 'the provider’s answer wasn’t usable.';
  return el(`<p class="text-sm text-[#a4473a] flex items-start gap-1.5"><i data-lucide="alert-circle" class="w-4 h-4 shrink-0 mt-0.5"></i><span>Couldn’t connect: ${esc(why)}</span></p>`);
}
