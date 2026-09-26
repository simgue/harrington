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

