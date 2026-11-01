// Printing a teaching guide: Marble's teaching research for one topic as a
// paper page, the way the lesson prints (views/lesson.js printLesson): a new
// window with its own stylesheet, then the browser's print dialog. Every
// activity is written out in full, sources are plain URLs (links do nothing on
// paper), and Marble's caveat and credit close it. The guide is not
// per-learner, so no learner's name is ever on it. No AI, no request: the
// guide is already loaded.
import { esc, toast } from '../ui.js';
import { ageBand } from './printables.js';
import { GUIDE_ATTRIBUTION, GUIDE_GLOSS, LICENSE_HREF, MARBLE_HREF } from '../teaching.js';

// Paper only: no fills, thin rules, black and grey ink. No @page size, so the
// printer's paper (A4 or Letter) is used; 12 mm margins fit both. Activities
// and wrong turns sit in two columns, so a typical guide is about two pages.
const STYLE = `
  *{box-sizing:border-box}
  body{font-family:Georgia,serif;max-width:760px;margin:28px auto;padding:0 20px;color:#2e2a24;line-height:1.32;font-size:11px}
  h1{font-size:20px;margin:0 0 1px;line-height:1.2}
  .sub{color:#5f574c;font-size:11px}
  .kind{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#5f574c;margin:0 0 4px}
  header{border-bottom:1.5px solid #2e2a24;padding-bottom:6px;margin-bottom:10px}
  h2{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;margin:12px 0 5px;border-bottom:1px solid #d2c6ad;padding-bottom:2px}
  h3{font-size:12px;margin:0 0 2px;line-height:1.25}
  h4{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:#5f574c;margin:5px 0 1px}
  p{margin:2px 0}
  ul,ol{margin:1px 0 2px 16px;padding:0}
  li{margin-bottom:0}
  .cols{columns:2;column-gap:16px}
  .activity,.error,.check-part{break-inside:avoid;page-break-inside:avoid}
  .activity{border:1px solid #d2c6ad;border-radius:5px;padding:5px 8px;margin:0 0 6px}
  .error{border-left:2px solid #d2c6ad;padding-left:8px;margin:0 0 6px}
  .method{font-style:italic;color:#5f574c}
  dl{margin:2px 0}
  dt{font-weight:700}
  dd{margin:0 0 3px}
  .sources li{word-break:break-all}
  footer{margin-top:14px;border-top:1px solid #d2c6ad;padding-top:6px;font-size:9.5px;color:#5f574c;break-inside:avoid;page-break-inside:avoid}
  footer p{margin:1px 0}
  @page{margin:12mm}
  @media print{body{margin:0;max-width:none;padding:0}}
`;

const list = (items, tag = 'ul') => (items.length ? `<${tag}>${items.map(x => `<li>${esc(x)}</li>`).join('')}</${tag}>` : '');
const part = (title, html) => (html ? `<div class="check-part"><h4>${esc(title)}</h4>${html}</div>` : '');
const para = (text) => (text ? `<p>${esc(text)}</p>` : '');

function activity(a, i) {
  return `<section class="activity">
    <h3>${esc(i + 1)}. ${esc(a.title)}</h3>
    ${a.steps.length ? `<h4>Steps</h4>${list(a.steps, 'ol')}` : ''}
    ${a.insight ? `<h4>What they should notice</h4>${para(a.insight)}` : ''}
    ${a.feedback.length ? `<h4>If they take a wrong turn</h4>${list(a.feedback)}` : ''}
  </section>`;
}

function check(c, topicName) {
  const errors = c.errors.map(e => `<div class="error">
    <p><strong>${esc(e.pattern)}</strong></p>
    ${e.signs ? `<p>You may notice: ${esc(e.signs)}</p>` : ''}
    ${e.nextMove ? `<p>Then try: ${esc(e.nextMove)}</p>` : ''}
    ${e.reteachId && topicName(e.reteachId) ? `<p>Go back to: ${esc(topicName(e.reteachId))}</p>` : ''}
  </div>`).join('');
  return `<h2>Check understanding</h2>
    ${c.method ? `<p class="method">${esc(c.method)}</p>` : ''}
    ${part('Try this', para(c.task))}
    ${part('Ask', c.prompt ? `<p>“${esc(c.prompt)}”</p>` : '')}
    ${part('A strong answer', para(c.answer))}
    ${part('To dig deeper', list(c.followUps))}
    ${c.errors.length ? `<h4>Common wrong turns</h4><div class="cols">${errors}</div>` : ''}
    ${part('Where they are', c.levels.length ? `<dl>${c.levels.map(l => `<dt>${esc(l.label)}</dt><dd>${esc(l.text)}</dd>`).join('')}</dl>` : '')}`;
}

/**
 * The print document for one topic's guide (teaching.js curateResearch, with
 * the caveat), as a complete HTML page. Every value from the record or the
 * taxonomy is escaped. `topicName(id)` names a topic to go back to (optional);
 * `printedOn` is the date in the footer; `autoPrint` adds the script that opens
 * the print dialog once the page has loaded.
 */
export function guidePrintDocument(topic, guide, { topicName = () => null, printedOn = new Date(), autoPrint = true } = {}) {
  const date = printedOn.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const activities = guide.activities.map(activity).join('');
  const checkPart = guide.check ? check(guide.check, topicName) : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(topic.name)} — Teaching guide</title>
  <style>${STYLE}</style></head><body>
    <header>
      <p class="kind">Teaching guide</p>
      <h1>${esc(topic.name)}</h1>
      <p class="sub">${esc(topic.subject)} &middot; ${esc(topic.domain)} &middot; ${esc(ageBand(topic))}</p>
    </header>
    ${guide.summary ? `<h2>What they are learning</h2>${para(guide.summary)}` : ''}
    ${activities ? `<h2>Activities</h2><div class="cols">${activities}</div>` : ''}
    ${checkPart}
    ${guide.sources.length ? `<h2>Sources</h2><ul class="sources">${guide.sources.map(s => `<li>${esc(s.name)}: ${esc(s.url)}</li>`).join('')}</ul>` : ''}
    <footer>
      ${guide.caveat ? `<p class="caveat">${esc(guide.caveat)}</p>` : ''}
      <p>${esc(GUIDE_GLOSS)}</p>
      <p class="credit">${esc(GUIDE_ATTRIBUTION)}</p>
      <p>${esc(MARBLE_HREF)} &middot; ${esc(LICENSE_HREF)}</p>
      <p class="printed">Printed from Harrington on ${esc(date)}</p>
    </footer>
    ${autoPrint ? '<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>' : ''}
  </body></html>`;
}

// Opens the guide in a new window and the print dialog over it.
export function printTeachingGuide(topic, guide, { topicName } = {}) {
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print', 'error'); return; }
  w.document.write(guidePrintDocument(topic, guide, { topicName }));
  w.document.close();
}
