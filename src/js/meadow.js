// Storybook Meadow illustration pieces shared by views: layered flat hills,
// a sun, soft clouds, little flowers and petal-style progress rings.

// Rolling hills with a sun and clouds, anchored to the bottom-right of a
// header band. Scales to any width; pair with `.meadow-hero`.
export function meadowScene() {
  return `<svg class="meadow-scene" viewBox="0 0 1000 170" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
    <g fill="#fffdf8">
      <ellipse cx="520" cy="46" rx="34" ry="10"/><circle cx="508" cy="39" r="12"/><circle cx="530" cy="34" r="15"/>
      <ellipse cx="880" cy="30" rx="26" ry="8"/><circle cx="872" cy="24" r="10"/><circle cx="888" cy="21" r="12"/>
    </g>
    <path d="M455 72 q5 -5 10 0 q5 -5 10 0" fill="none" stroke="#5f574c" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M478 60 q4 -4 8 0 q4 -4 8 0" fill="none" stroke="#5f574c" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="640" cy="120" r="50" fill="#f2c14e" opacity="0.22"/>
    <circle cx="640" cy="120" r="36" fill="#f2c14e"/>
    <path d="M480 170 C530 122 590 108 670 114 C740 120 790 142 860 170 Z" fill="#cfe0c6"/>
    <path d="M0 170 L0 158 C120 148 260 164 380 154 C470 147 540 142 640 150 C750 159 830 138 920 140 C960 141 985 136 1000 136 L1000 170 Z" fill="#a9c9a0"/>
    <path d="M680 164 q2 -8 4 0 M684 164 q3 -10 5 0 M689 164 q2 -7 4 0" fill="none" stroke="#3f6b3b" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M880 150 q2 -8 4 0 M884 150 q3 -10 5 0" fill="none" stroke="#3f6b3b" stroke-width="1.6" stroke-linecap="round"/>
    ${flowerDot(720, 158, '#f3b7a8')}${flowerDot(830, 152, '#d6caea')}${flowerDot(560, 156, '#fffdf8')}${flowerDot(430, 160, '#f3b7a8')}
  </svg>`;
}

function flowerDot(x, y, petal) {
  return `<circle cx="${x}" cy="${y}" r="3.4" fill="${petal}"/><circle cx="${x}" cy="${y}" r="1.3" fill="#8a6412"/>`;
}

// A five-petal flower (bloomed) or a dashed bud outline (not yet), used for
// "days active this week".
export function weekFlower(bloomed, label) {
  if (!bloomed) {
    return `<span title="${label}" class="inline-flex"><svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="#9c9483" stroke-width="1.5" stroke-dasharray="2.5 2.5"/></svg></span>`;
  }
  return `<span title="${label}" class="inline-flex"><svg width="22" height="22" viewBox="0 0 14 14" aria-hidden="true"><g fill="#a9c9a0"><circle cx="7" cy="3.6" r="2.5"/><circle cx="10.2" cy="6" r="2.5"/><circle cx="9" cy="9.8" r="2.5"/><circle cx="5" cy="9.8" r="2.5"/><circle cx="3.8" cy="6" r="2.5"/></g><circle cx="7" cy="7" r="1.8" fill="#3f6b3b"/></svg></span>`;
}

// Soft ring with rounded caps and a pastel track, optionally with an icon in
// the middle. `size` is the outer box in px.
export function petalRing(pct, color, { size = 52, stroke = 6, icon = null, track = '#ede3cf' } = {}) {
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  const mid = size / 2;
  return `<span class="relative inline-flex items-center justify-center shrink-0" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${mid}" cy="${mid}" r="${r}" fill="${color}14" stroke="${track}" stroke-width="${stroke}"/>
      <circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 ${mid} ${mid})"/>
    </svg>
    ${icon ? `<i data-lucide="${icon}" class="w-4.5 h-4.5 absolute" style="color:${color}"></i>` : ''}
  </span>`;
}


// ---- Growth stages (from the Paper Garden theme) ----
// Progress shown as a plant instead of a score: Seed (not yet open),
// Sprout (ready to start), Bud (being learned), Bloom (mastered). Each stage
// differs in shape as well as colour, and always travels with a word.
export const GROWTH = {
  seed:   { label: 'Seed',   kid: 'Planted',   color: '#6f665a', tint: '#f1e6cc' },
  sprout: { label: 'Sprout', kid: 'Sprouting', color: '#3f6b3b', tint: '#e4eedf' },
  bud:    { label: 'Bud',    kid: 'Budding',   color: '#8a6412', tint: '#fbecc4' },
  bloom:  { label: 'Bloom',  kid: 'In bloom',  color: '#a4473a', tint: '#fbe5de' },
};

// Skill-tree state → stage.
export function stageForSkillState(state) {
  return { locked: 'seed', ready: 'sprout', 'in-progress': 'bud', mastered: 'bloom' }[state] || 'seed';
}

// Mastery status (none/learning/practicing/mastered) → stage. A topic nobody
// has started is a sprout when its foundations are in place, else a seed.
export function stageForStatus(status, unlocked = false) {
  if (status === 'mastered') return 'bloom';
  if (status === 'learning' || status === 'practicing') return 'bud';
  return unlocked ? 'sprout' : 'seed';
}

// A whole subject or area: bloom once mostly mastered, bud while growing.
export function stageForArea(pct, started = false) {
  if (pct >= 90) return 'bloom';
  if (pct >= 30) return 'bud';
  if (pct > 0 || started) return 'sprout';
  return 'seed';
}

const SOIL = '<path d="M4 27C9 21.5 23 21.5 28 27Z" fill="#d9ccb0"/>';
const LEAVES = '<path d="M16 19.5C12 19.5 9 16.5 9 13.5C13 13.5 16 15.5 16 19.5Z" fill="#a9c9a0" stroke="#3f6b3b" stroke-width="1.1"/><path d="M16 17.5C20 17.5 23 14.5 23 11.5C19 11.5 16 13.5 16 17.5Z" fill="#a9c9a0" stroke="#3f6b3b" stroke-width="1.1"/>';
const PLANTS = {
  seed: `${SOIL}<ellipse cx="16" cy="22.5" rx="3.1" ry="4.2" fill="#8a6412" transform="rotate(-24 16 22.5)"/><path d="M14.6 20.6q1-1.4 2.2-1.6" fill="none" stroke="#fbecc4" stroke-width="1" stroke-linecap="round"/>`,
  sprout: `${SOIL}<path d="M16 25V15" stroke="#3f6b3b" stroke-width="2" stroke-linecap="round"/>${LEAVES}`,
  bud: `${SOIL}<path d="M16 25V11" stroke="#3f6b3b" stroke-width="2" stroke-linecap="round"/>${LEAVES}<path d="M16 3.5C20 6.5 20.2 11 16 12.5C11.8 11 12 6.5 16 3.5Z" fill="#f2c14e" stroke="#8a6412" stroke-width="1.1"/><path d="M13.2 11.2Q16 9.6 18.8 11.2" fill="none" stroke="#3f6b3b" stroke-width="1.1"/>`,
  bloom: `${SOIL}<path d="M16 25V12" stroke="#3f6b3b" stroke-width="2" stroke-linecap="round"/>${LEAVES}<g fill="#f3b7a8" stroke="#a4473a" stroke-width="0.9"><circle cx="16" cy="4.6" r="3"/><circle cx="20.2" cy="7.7" r="3"/><circle cx="18.6" cy="12.3" r="3"/><circle cx="13.4" cy="12.3" r="3"/><circle cx="11.8" cy="7.7" r="3"/></g><circle cx="16" cy="8.8" r="2.5" fill="#f2c14e" stroke="#8a6412" stroke-width="0.9"/>`,
};

// The plant for a stage as inline SVG, decorative (pair it with a label).
export function growthIcon(stage, size = 24) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true" class="shrink-0">${PLANTS[stage] || PLANTS.seed}</svg>`;
}

// Small pill: plant + stage word (+ optional detail such as "Learning").
export function growthChip(stage, detail = '', { kid = false } = {}) {
  const g = GROWTH[stage] || GROWTH.seed;
  return `<span class="inline-flex items-center gap-1 pl-0.5 pr-2 py-0.5 rounded-full text-xs font-600" style="background:${g.tint};color:${g.color}">${growthIcon(stage, 18)}${kid ? g.kid : g.label}${detail ? `<span class="font-500 opacity-90">· ${detail}</span>` : ''}</span>`;
}
