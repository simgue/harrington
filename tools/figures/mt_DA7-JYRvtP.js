// title: Simple circuit
// hint: Clip the red wire, then the black wire, and watch the bulb light up.
/* Building a simple circuit (mt_DA7-JYRvtP): a battery, a bulb in its holder and two wires.
   Real sequence: both wires loose -> clip the red wire to the battery's top end -> clip the black wire to the
   other end -> the loop is closed, electricity flows from the battery, through the bulb and back, and the bulb
   lights. Unclip either wire and the loop is broken: the bulb goes out. One wire alone never lights it. */
const H = 3;                                   // board thickness
const BX = 16, BZ = H + 6, BR = 6;             // battery axis (along y) and radius
const BY0 = 34, BY1 = 70;                      // battery body, top end (+, low y) to bottom end (high y)
const HX0 = 54, HX1 = 68, HY0 = 42, HY1 = 58, HZ = H + 6;   // bulb holder
const SX = 61, SY = 50;                        // bulb socket centre
const GLASS = [SX, SY, HZ + 13];               // bulb glass centre
const BATT = matOf('#3d3935'), BTOP = matOf('#e0a33a');
const BOARD_TOP = boardTop(0, 10, 82, 92, H, 6);

// each wire: fixed part from the holder's screw, then the end that is clipped on or lying loose
const RED = {
  col: '#e2483d', screw: [57, 44, HZ + .1],
  fixed: [[57, 44, HZ + .1], [53, 44, H + 4], [50, 40, H + 1.2], [47, 25, H + 1.2], [37, 18, H + 1.2]],
  joined: [[26, 21, H + 2], [18, 27, H + 4.5], [BX, 30.6, BZ]],
  loose: [[31, 15, H + 1.2], [27, 14, H + 1.2], [23, 14.5, H + 1.2]],
};
const BLACK = {
  col: '#3d3935', screw: [57, 56, HZ + .1],
  fixed: [[57, 56, HZ + .1], [53, 56, H + 4], [50, 58, H + 1.2], [42, 72, H + 1.2], [30, 80, H + 1.2]],
  joined: [[22, 78, H + 2], [17, 74, H + 4.5], [BX, 70.6, BZ]],
  loose: [[28, 84, H + 1.2], [25, 86, H + 1.2], [22, 87, H + 1.2]],
};

const st = { pal: 'cobalt', red: 0, black: 0, redTo: 0, blackTo: 0, ph: 0, running: false };
const lit = () => st.red >= 1 && st.black >= 1;

/* ---------- drawing ---------- */
const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function wirePts(w, t){ const e = ease(t); return [...w.fixed, ...w.joined.map((p, i) => lerp3(w.loose[i], p, e))]; }
function wire(w, t){
  const pts = wirePts(w, t), d = pd(pts, false);
  let s = `<path d="${d}" fill="none" stroke="${INK}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<path d="${d}" fill="none" stroke="${w.col}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  const a = pts[pts.length - 2], b = pts[pts.length - 1], u = norm(sub(b, a));
  s += rod(lerp3(b, a, .0).map((v, i) => v - u[i] * 3.4), b, 1.5, METAL, toneI, 1);     // metal clip at the end
  return s;
}
function battery(){
  let s = castShadow([[BX - BR, 31, H], [BX + BR, 31, H], [BX - BR, BY1, H], [BX + BR, BY1, H], [BX, 31, BZ + BR], [BX, BY1, BZ + BR]], H, BOARD_TOP);
  s += rod([BX, 31, BZ], [BX, BY0, BZ], 2.2, METAL, toneI, 1);      // the bump on the top end
  s += rod([BX, BY0, BZ], [BX, 41, BZ], BR, BTOP, toneI, 1.4);
  s += rod([BX, 41, BZ], [BX, BY1, BZ], BR, BATT, toneI, 1.4);
  s += hullInk([[BX, BY0, BZ - BR], [BX, BY0, BZ + BR], [BX - BR, BY0, BZ], [BX + BR, BY0, BZ], [BX, BY1, BZ - BR], [BX, BY1, BZ + BR], [BX - BR, BY1, BZ], [BX + BR, BY1, BZ]], 2);
  return s;
}
function holder(m){
  let s = castShadow([[HX0, HY0, H], [HX1, HY0, H], [HX1, HY1, H], [HX0, HY1, H], [SX, SY, GLASS[2] + 7]], H, BOARD_TOP);
  s += box(HX0, HY0, H, HX1, HY1, HZ, m, tone, 1);
  s += hullInk([[HX0, HY0, H], [HX1, HY0, H], [HX1, HY1, H], [HX0, HY1, H], [HX0, HY0, HZ], [HX1, HY0, HZ], [HX1, HY1, HZ], [HX0, HY1, HZ]], 2);
  return s;
}
const screwHead = p => shape(on(PZ(p[2] + .1), ellUV(p[0], p[1], 1.9, 1.9, 12)), METAL.l, .8);
function bulb(on){
  const [X, Y] = P(...GLASS), r = 7.5 * 1.2247;
  let s = '';
  if (on) s += `<circle cx="${f(X)}" cy="${f(Y)}" r="${f(r * 1.9)}" fill="#fff1a8" opacity=".5"/><circle cx="${f(X)}" cy="${f(Y)}" r="${f(r * 1.35)}" fill="#ffe680" opacity=".6"/>`;
  s += cyl(SX, SY, HZ, HZ + 6, 4.2, METAL, toneI, 1.1, 18);
  for (const z of [HZ + 1.6, HZ + 3.4]) s += line(on_ring(z), .6);
  s += `<circle cx="${f(X)}" cy="${f(Y)}" r="${f(r)}" fill="${on ? '#ffe27a' : '#e4f2f4'}" opacity="${on ? '.95' : '.75'}"/>`;
  const fil = [[SX, SY - 2, HZ + 6], [SX, SY - 2, HZ + 12], [SX, SY - 1, HZ + 13.4], [SX, SY, HZ + 12], [SX, SY + 1, HZ + 13.4], [SX, SY + 2, HZ + 12], [SX, SY + 2, HZ + 6]];
  s += `<path d="${pd(fil, false)}" fill="none" stroke="${on ? '#e2483d' : INK}" stroke-width="${on ? 1.4 : .8}" stroke-linejoin="round"/>`;
  s += `<circle cx="${f(X + r * .35)}" cy="${f(Y - r * .4)}" r="${f(r * .2)}" fill="#ffffff" opacity=".8"/>`;
  s += `<circle cx="${f(X)}" cy="${f(Y)}" r="${f(r)}" fill="none" stroke="${INK}" stroke-width="1.4"/>`;
  return s;
}
const on_ring = z => on(PZ(z), ellUV(SX, SY, 4.25, 4.25, 18)).filter((p, i) => i >= 1 && i <= 11);

// electricity: little dots running out of the battery's top end, along the red wire, through the bulb and back
function current(){
  const loop = [...wirePts(RED, 1).reverse(), [SX, SY, HZ + 2], ...wirePts(BLACK, 1)];
  const seg = [], lens = []; let total = 0;
  for (let i = 0; i < loop.length - 1; i++){ const l = Math.hypot(...sub(loop[i + 1], loop[i])); seg.push([loop[i], loop[i + 1]]); lens.push(l); total += l; }
  let s = '';
  for (let d = (st.ph * 10) % 10; d < total; d += 10){
    let k = 0, rest = d; while (k < lens.length - 1 && rest > lens[k]){ rest -= lens[k]; k++; }
    const p = lerp3(seg[k][0], seg[k][1], rest / lens[k]);
    if (p[0] > HX0 - 1 && p[1] > HY0 && p[1] < HY1) continue;          // inside the holder: hidden
    const [X, Y] = P(...p);
    s += `<circle cx="${f(X)}" cy="${f(Y)}" r="1.5" fill="#ffe27a" stroke="${INK}" stroke-width=".6"/>`;
  }
  return s;
}

function scene(st, m){
  const on = lit();
  let s = board(0, 10, 82, 92, H, 6, BOARD);
  s += battery();
  s += wire(RED, st.red) + wire(BLACK, st.black);
  if (on) s += current();
  s += holder(m) + screwHead(RED.screw) + screwHead(BLACK.screw);
  s += bulb(on);
  s += tag([BX, 52, BZ + BR], -40, -44, 'BATTERY', on);
  s += tag([38, 74, H + 1.2], -24, 44, 'WIRES', on);
  s += tag([SX, SY, GLASS[2] + 8], 52, -18, 'BULB', on);
  return s;
}

/* ---------- behavior ---------- */
let ui;
function run(){
  if (st.running) return;
  st.running = true;
  ui.animate(dt => {
    for (const k of ['red', 'black']){
      const to = st[k + 'To'];
      if (st[k] !== to) st[k] = to > st[k] ? Math.min(to, st[k] + dt / .7) : Math.max(to, st[k] - dt / .7);
    }
    if (lit()) st.ph += dt * 2.2;
    const moving = st.red !== st.redTo || st.black !== st.blackTo;
    if (moving || lit()) return true;
    st.running = false; return false;
  });
}
function afterChange(){
  const both = st.redTo && st.blackTo, one = st.redTo || st.blackTo;
  if (both) ui.flash('A full loop! Electricity flows round and the bulb lights.');
  else if (one) ui.flash('One wire is not enough. Electricity needs a full loop.');
  run();
}
function clip(k, name){
  if (st[k + 'To']) return ui.flash(`The ${name} wire is already clipped on.`);
  st[k + 'To'] = 1; afterChange();
}
function unclip(){
  if (!st.redTo && !st.blackTo) return ui.flash('Both wires are loose already.');
  const wasLit = st.redTo && st.blackTo;
  if (st.blackTo) st.blackTo = 0; else st.redTo = 0;
  if (wasLit) { ui.flash('The loop is broken, so the bulb goes out.'); run(); } else run();
}

ui = mountFigure({
  title: 'Simple circuit',
  size: [82, 92, 34], palette: 'cobalt', state: st,
  scene,
  buttons: [
    { label: 'Clip the red wire', onClick: () => clip('red', 'red') },
    { label: 'Clip the black wire', onClick: () => clip('black', 'black') },
    { label: 'Unclip a wire', onClick: unclip },
  ],
  acts: {},
  params: (st, q) => {
    if (q.get('red') === '1') st.red = st.redTo = 1;
    if (q.get('black') === '1') st.black = st.blackTo = 1;
    if (q.has('ph')) st.ph = +q.get('ph');
  },
});
if (lit()) run();
