import { loadTaxonomy } from './data.js';
import * as store from './store.js';
import { syncCurriculum } from './curriculum-sync.js';
import { maybeShowWelcome } from './views/guide.js';
import { el, refreshIcons, toast } from './ui.js';
import { renderShell } from './views/shell.js';
import { graphHash, parseGraphHash } from './graph.js';
import { commitNavigation } from './navigation.js';
import { renderDashboard } from './views/dashboard.js';
import { renderCalendar } from './views/calendar.js';
import { renderTopic } from './views/topic.js';
import { renderGraph } from './views/graph.js';
import { renderRecords } from './views/records.js';
import { renderInsights } from './views/insights.js';
import { renderLevelset } from './views/levelset.js';

const app = document.getElementById('app');

const route = { name: 'dashboard', params: {} };

function navigate(name, params = {}, options = {}) {
  route.name = name;
  route.params = params;
  commitNavigation(window, hashFor(name, params), render, options);
}

function hashFor(name, params = {}) {
  if (name === 'graph') return graphHash(params);
  return name + (params.id ? '/' + params.id : '');
}

function parseHash() {
  const h = window.location.hash.replace(/^#/, '');
  if (!h) return { name: 'dashboard', params: {} };
  const graph = parseGraphHash(h);
  if (graph) return { name: 'graph', params: graph };
  const parts = h.split('/').map((part) => {
    try { return decodeURIComponent(part); }
    catch { return part; }
  });
  const [name, ...rest] = parts;
  return { name, params: rest[0] ? { id: rest[0] } : {} };
}

function sameRoute(a, b) {
  return hashFor(a.name, a.params) === hashFor(b.name, b.params);
}

let taxonomyReady = false;
let welcomeChecked = false;

async function boot() {
  renderLoading('Loading your homeschool workspace\u2026');
  try {
    await Promise.all([store.connect(), store.loadAll()]);
    await loadTaxonomy();
    taxonomyReady = true;
    try { syncCurriculum(); } catch (e) { console.warn('sync failed', e); }
  } catch (e) {
    console.error(e);
    renderError(e.message || 'Something went wrong while starting up.');
    return;
  }
  const r = parseHash();
  route.name = r.name; route.params = r.params;
  render();
}

function render() {
  if (!taxonomyReady) return;
  const state = store.get();

  if (state.students.length === 0 && route.name !== 'onboard') {
    route.name = 'onboard';
  }

  const views = {
    dashboard: renderDashboard,
    calendar: renderCalendar,
    graph: renderGraph,
    topic: renderTopic,
    records: renderRecords,
    insights: renderInsights,
    levelset: renderLevelset,
    onboard: renderOnboard,
  };
  const viewFn = views[route.name] || renderDashboard;

  if (route.name === 'onboard') {
    app.innerHTML = '';
    app.appendChild(renderOnboard());
    refreshIcons();
    return;
  }

  const content = viewFn(route.params, { navigate });
  const shell = renderShell({ route, navigate, content });
  app.innerHTML = '';
  app.appendChild(shell);
  refreshIcons();

  // Show the welcome tour once, after the first family-workspace render.
  if (!welcomeChecked) {
    welcomeChecked = true;
    setTimeout(() => { try { maybeShowWelcome(); } catch (e) {} }, 400);
  }
}

// ---- Boot-time screens ----
function renderLoading(msg) {
  app.innerHTML = '';
  app.appendChild(el(`
    <div class="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
      <div class="w-11 h-11 rounded-xl bg-brand flex items-center justify-center">
        <i data-lucide="compass" class="w-6 h-6 text-white"></i>
      </div>
      <div class="flex items-center gap-2 text-ink-soft text-sm">
        <div class="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>
        ${msg}
      </div>
    </div>`));
  refreshIcons();
}

function renderError(msg) {
  app.innerHTML = '';
  const node = el(`
    <div class="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
      <i data-lucide="cloud-off" class="w-10 h-10 text-ink-faint"></i>
      <p class="text-ink-soft max-w-sm">${msg}</p>
      <button id="retry" class="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium">Try again</button>
    </div>`);
  node.querySelector('#retry').onclick = () => boot();
  app.appendChild(node);
  refreshIcons();
}

function renderOnboard() {
  const node = el(`
    <div class="min-h-screen flex items-center justify-center p-6">
      <div class="max-w-md w-full fade-up">
        <div class="text-center mb-6">
          <div class="w-12 h-12 rounded-xl bg-brand-light flex items-center justify-center mx-auto mb-4">
            <i data-lucide="user-plus" class="w-6 h-6 text-brand-dark"></i>
          </div>
          <h1 class="font-display text-2xl font-600">Add your first student</h1>
          <p class="text-ink-soft text-sm mt-1">Add a learner to get started. There is no account to create.</p>
        </div>
        <form id="f" class="bg-paper-card border border-paper-line rounded-2xl p-5 space-y-4">
          <div class="rounded-xl bg-[#fbecc4] border border-[#f2c14e] px-3.5 py-3 text-xs text-[#6b4d0e] leading-relaxed">
            Runs on this computer only. Nothing leaves your home unless you configure an AI provider.
          </div>
          <div>
            <label class="text-sm font-medium block mb-1.5">Student's name</label>
            <input name="name" required placeholder="e.g. Sample Learner" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
          </div>
          <div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="ob-month" class="text-sm font-medium block mb-1.5">Birth month <span class="text-ink-faint font-normal">(optional)</span></label>
                <select id="ob-month" name="birthMonth" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand">
                  <option value="">Not set</option>
                  ${store.MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}
                </select>
              </div>
              <div>
                <label for="ob-year" class="text-sm font-medium block mb-1.5">Birth year</label>
                <input id="ob-year" name="birthYear" type="number" required min="${store.MIN_BIRTH_YEAR}" max="${new Date().getFullYear()}" placeholder="e.g. 2017" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
              </div>
            </div>
            <p class="text-xs text-ink-faint mt-1">We use this to show age-relevant ideas and connections for you to consider.</p>
          </div>
          <button class="w-full px-4 py-3 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors">Set up their learning space</button>
        </form>
      </div>
    </div>`);
  node.querySelector('#f').onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = fd.get('name').trim();
    const by = parseInt(fd.get('birthYear'), 10);
    if (!name || !by) return;
    store.addStudent(name, by, parseInt(fd.get('birthMonth'), 10) || null);
    toast(`${name}'s learning space is ready`, 'success');
    navigate('dashboard');
  };
  return node;
}

window.addEventListener('hashchange', () => {
  const r = parseHash();
  if (!sameRoute(r, route)) {
    route.name = r.name; route.params = r.params;
    render();
  }
});

store.subscribe(() => { if (taxonomyReady) render(); });

boot();
