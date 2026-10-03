// Child-safe and parent-facing phrasing of taxonomy evidence statements.
// Pure, so the child card, the observation checklist and the level-set
// workbook share one wording and the tests can import it without the DOM.

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

// The workbook asks the parent about the child: "Can you add…?" becomes
// "Can they add…?", and "Given 7, can you…" becomes "Given 7, can they…".
export function canTheyPrompt(text) {
  return canYouPrompt(text).replace(/\b([Cc])an you\b/, (_, c) => `${c}an they`);
}

// The evidence entries a parent can watch for. Some taxonomy entries are
// citations or reading lists; canYouPrompt drops those, and so does this.
// Falls back to the topic's assessment prompt when nothing else is left.
export function checkableEvidence(topic, name = 'your child') {
  const items = (topic?.evidence || []).filter(e => typeof e === 'string' && canYouPrompt(e));
  if (items.length) return items;
  const prompt = assessmentQuestion(topic, name);
  return prompt ? [prompt] : [];
}

// The topic's suggested question with the learner's name filled in.
export function assessmentQuestion(topic, name = 'your child') {
  const p = topic && typeof topic.assessmentPrompt === 'string' ? topic.assessmentPrompt.trim() : '';
  return p ? p.replace(/\{\{name\}\}/g, name) : '';
}
