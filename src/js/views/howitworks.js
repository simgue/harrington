// "See how it works" (HAR-34): a topic's interactive figure, on the topic page
// and in the child view. The figure is a self-contained page from the app's
// own origin (src/figures/<topicId>.html), shown in an iframe sandboxed to
// allow-scripts only, so it runs in an opaque origin with no access to the
// app, its cookie or its storage; the server also sends it a CSP with no
// network access. Nothing is saved: pressing things in a figure changes only
// the figure.
import { figureFor } from '../figures/index.js';
import { el, esc } from '../ui.js';

// The figure frame with its hint line, or null when the topic has no figure.
export function howItWorksFrame(topic) {
  const fig = figureFor(topic?.id);
  if (!fig) return null;
  return el(`<div class="how-it-works">
    <iframe src="${esc(fig.src)}" title="${esc(fig.title)}: how it works" sandbox="allow-scripts" loading="lazy" referrerpolicy="no-referrer"
      class="block w-full h-[30rem] sm:h-[34rem] rounded-xl border border-paper-line bg-paper"></iframe>
    <p class="text-sm text-ink-soft mt-2 leading-snug">${esc(fig.hint)}</p>
  </div>`);
}
