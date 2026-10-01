// Child-safe topic card, opened from the child view: the topic, its evidence
// phrased as "Can you…?" prompts, a few things to try, and a way to tell a
// grown-up about it. No tests, scores or percentages.
import * as store from '../store.js';
import { SUBJECTS } from '../data.js';
import { el, esc, refreshIcons, toast, openModal } from '../ui.js';
import { activityIdeas } from '../resources.js';
import { openRecorder } from '../recorder.js';
import { growthIcon, stageForStatus, GROWTH } from '../meadow.js';

// Verbs that lead taxonomy evidence statements (base form). Anything else
// (a noun phrase, a name, "Given…") is asked as "Can you show: …?".
const VERBS = new Set(`explain describe use identify name state give compare write calculate read draw
  solve distinguish choose define find create sort count convert list recognise recognize apply place
  spell match add construct predict order measure estimate demonstrate determine select analyse analyze
  show express point suggest say retell answer evaluate check connect interpret understand represent
  round combine set complete label generate classify discuss ask spot present build record translate
  plot rewrite recite make relate listen notice trace locate compute expand correct replace design model
  subtract follow form share justify recall break reflect derive begin maintain group take respond
  organise organize test simplify partition join summarise summarize divide know multiply verify
  decompose observe propose compose edit paraphrase acknowledge act decide shade sketch link insert
  punctuate blend reread re-read segment synthesise synthesize try deliver perform rehearse include help
  provide plan carry continue substitute collect tile leave capitalise capitalize transform introduce
  reduce clap self-correct revise infer recommend adjust adapt incorporate look contribute review assess
  talk accept tell rearrange skip-count fold put rotate mark prove specify weigh work roll wait argue
  prepare cite outline narrate refute contrast categorise categorize supply arrange ensure hold sound
  change associate track turn decode note retrieve map request speak wonder explore participate stay
  recount self-assess redirect integrate attempt practise practice type sustain jot end proof-read
  signal develop open craft employ keep gather do pick stack graph enlarge generalise generalize stand
  avoid sequence align scale exchange bundle pair appreciate flip pull conduct rate challenge approach
  face role-play receive pause start assign train`.split(/\s+/).filter(Boolean));

const isVerb = word => VERBS.has(baseVerb(word.replace(/[^A-Za-z-]+$/, '')));

const LEAD_INS = new Set(['given', 'when', 'after', 'before', 'during', 'from', 'if']);

// "Describes the water cycle." -> "Can you describe the water cycle?"
// "Correctly adds 2-digit numbers" -> "Can you correctly add 2-digit numbers?"
// "Given 7, respond '3' to make 10" -> "Given 7, can you respond '3' to make 10?"
// "A rope is 2.5 m long — how much is left?" stays a question as written.
// Citations in the taxonomy ("Wineburg sourcing heuristic") give ''.
export function canYouPrompt(text) {
  const clean = String(text ?? '').trim().replace(/[.!?;:,\s]+$/, '');
  if (!clean) return '';
  const [first, second, ...rest] = clean.split(/\s+/);
  if (isVerb(first)) return ['Can you', baseVerb(first), second, ...rest].filter(w => w != null).join(' ') + '?';
  if (/ly$/i.test(first) && second && isVerb(second)) {
    return ['Can you', first.toLowerCase(), baseVerb(second), ...rest].join(' ') + '?';
  }
  const lead = clean.match(/^([^,]+),\s+(\S+)\s*(.*)$/);
  if (LEAD_INS.has(first.toLowerCase()) && lead && isVerb(lead[2])) {
    return `${lead[1]}, can you ${baseVerb(lead[2])}${lead[3] ? ' ' + lead[3] : ''}?`;
  }
  if (/[?—–]|;\s*(how|what|which|when|find)\b/i.test(clean)) return /\?$/.test(text.trim()) ? text.trim() : `${clean}?`;
  // Some evidence entries are citations or reading lists, not something a
  // child can show; keep only fallbacks with a verb or a number in them.
  const words = clean.toLowerCase().split(/[^a-z-]+/);
  if (/^[a-z]/.test(clean) || /\((19|20)\d\d|\b(19|20)\d\d\)|\([A-Z][^)]*\)$/.test(clean)) return '';
  if (!/\d/.test(clean) && !words.some(w => VERBS.has(w))) return '';
  return `Can you show: ${clean}?`;
}

// Third person to base form for the leading verb, lower-cased unless it is an
// acronym ("Identifies" -> "identify", "Uses" -> "use", "Matches" -> "match").
function baseVerb(word) {
  if (/^[A-Z0-9]{2,}$/.test(word)) return word;
  let w = word.toLowerCase();
  if (/[^aeiou]ies$/.test(w)) w = w.slice(0, -3) + 'y';
  else if (/(ss|sh|ch|x|zz)es$/.test(w)) w = w.slice(0, -2);
  else if (/[^su]s$/.test(w) || /[aeiou][sz]es$/.test(w)) w = w.slice(0, -1);
  return w;
}

// The static ideas are written for grown-ups; drop any that are about scores.
function childIdeas(topic) {
  return activityIdeas(topic).filter(a => !/\bscore\b/i.test(`${a.title} ${a.body}`));
}

export function openChildTopic(topic) {
  const student = store.activeStudent();
  if (!student) { toast('Add a student first', 'error'); return; }
  if (!topic) { toast('Ask a grown-up to pick something new'); return; }
  const meta = SUBJECTS[topic.subject] || { color: '#3f6b3b', icon: 'sprout' };
  const stage = stageForStatus(store.statusOf(student.id, topic.id), true);
  const prompts = (topic.evidence || []).map(canYouPrompt).filter(Boolean).slice(0, 5);
  const ideas = childIdeas(topic);

  const body = el(`<div class="p-5 sm:p-6">
    <div class="flex items-center gap-3">
      ${growthIcon(stage, 56)}
      <div class="min-w-0">
        <p class="text-sm font-600 flex items-center gap-1.5" style="color:${meta.color}"><i data-lucide="${meta.icon}" class="w-4 h-4"></i>${esc(topic.subject)}</p>
        <h2 class="font-display text-2xl font-600 leading-tight">${esc(topic.name)}</h2>
        <p class="text-sm font-600" style="color:${GROWTH[stage].color}">${GROWTH[stage].kid}</p>
      </div>
    </div>
    ${prompts.length ? `<section class="mt-5" aria-labelledby="ct-try">
      <h3 id="ct-try" class="font-display text-xl font-600 mb-2">Try these</h3>
      <ul class="space-y-2">${prompts.map(p => `<li class="meadow-card px-4 py-3 flex gap-3 text-[15px] leading-snug"><i data-lucide="sparkle" class="w-5 h-5 shrink-0 text-butter-deep mt-0.5"></i><span>${esc(p)}</span></li>`).join('')}</ul>
    </section>` : ''}
    ${ideas.length ? `<section class="mt-5" aria-labelledby="ct-ideas">
      <h3 id="ct-ideas" class="font-display text-xl font-600 mb-2">Things to try with a grown-up</h3>
      <div class="grid gap-2.5">${ideas.map(a => `<div class="rounded-2xl bg-paper border border-paper-line p-4 flex gap-3">
        <span class="w-10 h-10 rounded-full bg-paper-card flex items-center justify-center shrink-0" style="color:${meta.color}"><i data-lucide="${a.icon}" class="w-5 h-5"></i></span>
        <span class="min-w-0"><span class="block font-600">${esc(a.title)}</span><span class="block text-sm text-ink-soft leading-snug mt-0.5">${esc(a.body)}</span></span>
      </div>`).join('')}</div>
    </section>` : ''}
    <button id="tell" class="mt-6 w-full h-14 rounded-full bg-brand hover:bg-brand-dark text-paper-card font-display text-lg font-600 flex items-center justify-center gap-3">
      <span class="w-9 h-9 rounded-full bg-butter text-ink flex items-center justify-center"><i data-lucide="mic" class="w-5 h-5"></i></span>Tell about it</button>
    <button id="done" class="mt-2 w-full px-4 py-2.5 rounded-full text-ink-soft font-medium hover:bg-paper transition-colors">Back to my garden</button>
  </div>`);

  const m = openModal(body, { wide: true });
  body.querySelector('#tell').onclick = () => { m.close(); openRecorder(student.id, topic); };
  body.querySelector('#done').onclick = () => m.close();
  refreshIcons();
  return m;
}
