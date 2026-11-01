// Printing a teaching guide: Marble's teaching research for one topic as a
// paper page, the way the lesson prints (views/lesson.js printLesson): a new
// window with its own stylesheet, then the browser's print dialog. Every
// activity is written out in full, sources are plain URLs (links do nothing on
// paper), and Marble's caveat and credit close it. The guide is not
// per-learner, so no learner's name is ever on it. No AI, no request: the
// guide is already loaded.
import { esc, fmtDate, toast } from '../ui.js';
import { ageBand } from './printables.js';
import { GUIDE_ATTRIBUTION, GUIDE_GLOSS, LICENSE_HREF, MARBLE_HREF } from '../teaching.js';

// Paper only: no fills, thin rules, black and grey ink. The type follows the
// lesson's print (views/lesson.js): a 16 px Georgia body, 26 px title, 14 px
// section heads; nothing smaller than 13 px, and Marble's caveat at body size.
// No @page size, so the printer's paper (A4 or Letter) is used; 12 mm margins
// fit both. Activities and wrong turns sit in two columns and never split
// across a page.
const STYLE = `
  *{box-sizing:border-box}
  body{font-family:Georgia,serif;max-width:760px;margin:32px auto;padding:0 20px;color:#2e2a24;line-height:1.45;font-size:16px}
  h1{font-size:26px;margin:0 0 4px;line-height:1.2}
  .sub{color:#5f574c;font-size:14px}
  .kind{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#5f574c;margin:0 0 4px}
  header{border-bottom:1.5px solid #2e2a24;padding-bottom:8px;margin-bottom:14px}
  h2{font-size:14px;text-transform:uppercase;letter-spacing:.05em;margin:20px 0 6px;border-bottom:1px solid #d2c6ad;padding-bottom:3px}
  h3{font-size:16px;margin:0 0 4px;line-height:1.3}
  h4{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#5f574c;margin:8px 0 2px}
  p{margin:3px 0}
  ul,ol{margin:3px 0 4px 20px;padding:0}
  li{margin-bottom:2px}
  .cols{columns:2;column-gap:20px}
  .activity,.error,.check-part{break-inside:avoid;page-break-inside:avoid}
  .activity{border:1px solid #d2c6ad;border-radius:6px;padding:8px 12px;margin:0 0 10px}
  .error{border-left:2px solid #d2c6ad;padding-left:10px;margin:0 0 8px}
  .method{font-style:italic;color:#5f574c}
  dl{margin:3px 0}
  dt{font-weight:700}
  dd{margin:0 0 4px}
  .sources li{word-break:break-all}
  footer{margin-top:20px;border-top:1px solid #d2c6ad;padding-top:8px;font-size:13px;color:#5f574c;break-inside:avoid;page-break-inside:avoid}
  footer p{margin:2px 0}
  footer .caveat{font-size:16px;color:#2e2a24}
  @page{margin:12mm}
  @media print{body{margin:0;max-width:none;padding:0}}
`;

const list = (items, tag = 'ul') => (items.length ? `<${tag}>${items.map(x => `<li>${esc(x)}</li>`).join('')}</${tag}>` : '');
const part = (title, partHtml) => (partHtml ? `<div class="check-part"><h4>${esc(title)}</h4>${partHtml}</div>` : '');
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
  // The viewer's own date format, as everywhere else in the app.
  const date = fmtDate(printedOn);
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
