// "See how it works" (HAR-34): a topic's interactive figure, on the topic page,
// in the child view and full size on its own route (#figure/<topicId>). The
// figure is a self-contained page from the app's own origin
// (src/figures/<topicId>.html), shown in an iframe sandboxed to allow-scripts
// only, so it runs in an opaque origin with no access to the app, its cookie
// or its storage; the server also sends it a CSP with no network access.
// Nothing is saved: pressing things in a figure changes only the figure.
import { getData } from '../data.js';
import { figureFor } from '../figures/index.js';
import { el, esc, refreshIcons } from '../ui.js';

const FRAME_HEIGHT = { normal: 'h-[30rem] sm:h-[34rem]', large: 'h-[34rem] sm:h-[42rem]' };

// The figure frame with its hint line, or null when the topic has no figure.
export function howItWorksFrame(topic, { size = 'normal' } = {}) {
  const fig = figureFor(topic?.id);
  if (!fig) return null;
  return el(`<div class="how-it-works">
    <iframe src="${esc(fig.src)}" title="${esc(fig.title)}: how it works" sandbox="allow-scripts" loading="lazy" referrerpolicy="no-referrer"
      class="block w-full ${FRAME_HEIGHT[size] || FRAME_HEIGHT.normal} rounded-xl border border-paper-line bg-paper"></iframe>
    <p class="text-sm text-ink-soft mt-2 leading-snug">${esc(fig.hint)}</p>
  </div>`);
}

// #figure/<topicId>: one figure, full size, with the way back to its topic.
export function renderFigure(params, { navigate }) {
  const topic = getData().byId.get(params.id);
  const fig = figureFor(params.id);
  const root = el(`<div class="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);
  if (topic) {
    const back = el(`<button class="flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink mb-4 min-h-[44px]"><i data-lucide="arrow-left" class="w-4 h-4"></i>Back to the topic</button>`);
    back.onclick = () => navigate('topic', { id: topic.id });
    root.appendChild(back);
  }
  if (!fig) {
    root.appendChild(el(`<p class="text-ink-soft">No figure for this topic yet.</p>`));
    refreshIcons();
    return root;
  }
  root.appendChild(el(`<div class="mb-4">
    <p class="text-sm font-medium text-ink-faint">See how it works${topic ? ` · ${esc(topic.name)}` : ''}</p>
    <h1 class="font-display text-2xl sm:text-3xl font-600 leading-tight">${esc(fig.title)}</h1>
  </div>`));
  root.appendChild(howItWorksFrame({ id: params.id }, { size: 'large' }));
  refreshIcons();
  return root;
}
