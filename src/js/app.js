import { loadTaxonomy } from './data.js';
import * as store from './store.js';
import { syncCurriculum } from './curriculum-sync.js';
import { maybeShowWelcome } from './views/guide.js';
import { el, refreshIcons, toast } from './ui.js';
import { renderShell } from './views/shell.js';
import { renderDashboard } from './views/dashboard.js';
import { renderTimeline } from './views/timeline.js';
import { renderCalendar } from './views/calendar.js';
import { renderTopic } from './views/topic.js';
import { renderRecords } from './views/records.js';
import { renderInsights } from './views/insights.js';

const app = document.getElementById('app');

const route = { name: 'dashboard', params: {} };

export function navigate(name, params = {}) {
  route.name = name;
  route.params = params;
  window.location.hash = name + (params.id ? '/' + params.id : '');
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function parseHash() {
  const h = window.location.hash.replace(/^#/, '');
  if (!h) return { name: 'dashboard', params: {} };
  const [name, id] = h.split('/');
  return { name, params: id ? { id } : {} };
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
    timeline: renderTimeline,
    topic: renderTopic,
    records: renderRecords,
    insights: renderInsights,
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
          <p class="text-ink-soft text-sm mt-1">Set up a sample learner so you can explore Harrington without creating an external account.</p>
        </div>
        <form id="f" class="bg-paper-card border border-paper-line rounded-2xl p-5 space-y-4">
          <div class="rounded-xl bg-[#f7f0dd] border border-[#ead8a7] px-3.5 py-3 text-xs text-[#6f5520] leading-relaxed">
            This preview saves to your local Harrington server. Use a sample name until encrypted backups and private remote access are ready.
          </div>
          <div>
            <label class="text-sm font-medium block mb-1.5">Student's name</label>
            <input name="name" required placeholder="e.g. Sample Learner" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
          </div>
          <div>
            <label class="text-sm font-medium block mb-1.5">Birth year</label>
            <input name="birthYear" type="number" required min="2005" max="2024" placeholder="e.g. 2017" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
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
    store.addStudent(name, by);
    toast(`${name}'s learning space is ready`, 'success');
    navigate('dashboard');
  };
  return node;
}

window.addEventListener('hashchange', () => {
  const r = parseHash();
  if (r.name !== route.name || r.params.id !== route.params.id) {
    route.name = r.name; route.params = r.params;
    render();
  }
});

store.subscribe(() => { if (taxonomyReady) render(); });

boot();
