// title: Ice in the sun
// hint: Make the sun come out, move the shade, and see which ice melts first.
/* Sunlight warms things up (mt_iGSfQg3g5c): two dishes with an ice cube and a thermometer each; a shade roof
   stands over the right dish. When the sun comes out from behind the cloud, sunlight warms the dish it reaches:
   its thermometer climbs and its ice melts fast; the dish in the shade stays cooler and its ice melts slowly.
   Real sequence: ice from the tray -> into each dish -> sun comes out -> the sunny dish warms first and its ice
   melts -> pour away the water, take fresh ice from the tray. */
const BW = 86, BD = 170, BH = 4;
const DR = 15, DZ = BH + 3;                       // dish radius, dish top
const DISH = [[46, 136], [51, 78]];               // left dish (always in the open), right dish (under the roof)
const ROOF = { x0: 31, x1: 79, y0: 38, y1: 80, z: 46 };
const POSTS = [[33, 40], [33, 78]];
const TRAY = { x0: 60, x1: 82, y0: 6, y1: 30 };
const CELLS = [[66, 11], [76, 11], [66, 18], [76, 18], [66, 25], [76, 25]];
const SUN = [54, 44, 99];
const ICE = { l: '#eef9fd', m: '#c9eaf6', d: '#9fd0e4' };
const PLASTIC = matOf('#a9cde8');
const SHADEM = { l: '#f4e7c9', m: '#dccca8', d: '#a8977a' };
const WARM = 74, HOT = 96, COOL = 62;             // degrees F: cloudy day, in the shade, in the sun

const st = { pal: 'mustard', sunny: false, cloud: 1, shade: true, ice: [1, 1], water: [0, 0], T: [COOL, COOL], tray: 6, moving: null, running: false };

const lit = i => st.sunny && !(i === 1 && st.shade);   // does sunlight reach dish i?
const target = i => !st.sunny ? COOL : lit(i) ? HOT : WARM;

/* ---------- drawing ---------- */
function cube(x, y, z, s){ return box(x - s / 2, y - s / 2, z, x + s / 2, y + s / 2, z + s, ICE, toneI, 1.1)
  + fill(pd([[x + s / 2 + .1, y + s * .25, z + s * .3], [x + s / 2 + .1, y + s * .05, z + s * .3], [x + s / 2 + .1, y - s * .2, z + s * .85], [x + s / 2 + .1, y, z + s * .85]]), '#ffffff', 'opacity=".6"'); }
function dish(i){
  const [x, y] = DISH[i], ice = st.ice[i];
  let s = cyl(x, y, BH, DZ, DR, CERAMIC, toneI, 1.3, 28);
  s += fill(pd(on(PZ(DZ + .05), ellUV(x, y, DR - 2.2, DR - 2.2, 28))), CERAMIC.m);
  const wet = Math.min(DR - 3, 3 + 10 * st.water[i]);                      // melt water spreads in the dish
  if (st.water[i] > .02) s += shape(on(PZ(DZ + .1), ellUV(x, y, wet, wet * .92, 24)), '#a9d8ee', .6);
  if (ice > .02) s += cube(x, y, DZ, 4 + 10 * ice);
  return s;
}
function thermometer(i){
  const [x, y] = DISH[i], tx = x - 9, ty = y + 7, top = DZ + 34;
  const level = DZ + 5 + Math.max(0, Math.min(1, (st.T[i] - 50) / 50)) * 27;
  let s = rod([tx, ty, DZ], [tx, ty, top], 2, CERAMIC, toneI, 1.1);
  s += rod([tx + .4, ty, DZ + 2], [tx + .4, ty, level], .95, matOf('#e2483d'), toneI, .5);
  const [bx, by] = P(tx, ty, DZ + 2.2);
  s += `<circle cx="${f(bx)}" cy="${f(by)}" r="3.4" fill="#e2483d" stroke="${INK}" stroke-width="1"/>`;
  for (let k = 0; k < 4; k++) s += line([[tx + 2, ty, DZ + 10 + k * 7], [tx + 2, ty - 1.6, DZ + 10 + k * 7]], .6);
  return s;
}
function tray(){
  let s = box(TRAY.x0, TRAY.y0, BH, TRAY.x1, TRAY.y1, BH + 4, PLASTIC, toneI, 1.2);
  CELLS.forEach(([x, y], k) => {
    s += shape(on(PZ(BH + 4.05), rectUV(x - 3.4, y - 2.8, x + 3.4, y + 2.8)), k < st.tray ? '#dff2fa' : PLASTIC.d, .6);
    if (k < st.tray) s += box(x - 2.6, y - 2.2, BH + 4, x + 2.6, y + 2.2, BH + 7, ICE, toneI, .8);
  });
  return s;
}
const roofPts = () => [[ROOF.x0, ROOF.y0, ROOF.z], [ROOF.x1, ROOF.y0, ROOF.z], [ROOF.x1, ROOF.y1, ROOF.z], [ROOF.x0, ROOF.y1, ROOF.z]];
// a pale sunbeam from the sun to a point (where it lands: a dish, or the roof that stops it)
function beam(to, w){
  const a = [SUN[0], SUN[1] - 3, SUN[2]], b = [SUN[0], SUN[1] + 3, SUN[2]];
  return fill(pd([a, b, [to[0], to[1] + w, to[2]], [to[0], to[1] - w, to[2]]]), '#ffe58a', 'opacity=".42"');
}
// which = 'dishes' (drawn early, under everything) or 'roof' (the beam the roof stops, drawn on top of the roof)
function beams(which){
  if (!st.sunny || st.cloud > .6) return '';
  let s = '';
  if (which === 'dishes'){
    s += beam([DISH[0][0], DISH[0][1], DZ], 12);
    if (!st.shade) s += beam([DISH[1][0], DISH[1][1], DZ], 12);
  } else if (st.shade){
    const t = (SUN[2] - ROOF.z - 2.4) / (SUN[2] - DZ);
    s += beam([SUN[0] + (DISH[1][0] - SUN[0]) * t, SUN[1] + (DISH[1][1] - SUN[1]) * t, ROOF.z + 2.4], 12);
  }
  return `<g opacity="${f(1 - st.cloud)}">${s}</g>`;
}
function sun(){
  const [x, y] = P(...SUN), r = 10;
  let s = '';
  for (let k = 0; k < 10; k++){ const a = k / 10 * 2 * Math.PI, c = Math.cos(a), d = Math.sin(a);
    s += `<path d="M${f(x + c * 13)} ${f(y + d * 13)}L${f(x + c * 18)} ${f(y + d * 18)}" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>`; }
  s += `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="#f6c844" stroke="${INK}" stroke-width="1.6"/>`;
  // the cloud: in front of the sun when it is cloudy, drifting off to the right as the sun comes out
  const cx = x + 4 + (1 - st.cloud) * 46, cy = y + 4, op = .25 + .75 * st.cloud;
  const puffs = [[-11, 3, 8], [-2, -3, 10.5], [9, 1, 9], [16, 5, 6.5], [-17, 6, 5.5]];
  let c = '';
  for (const [dx, dy, pr] of puffs) c += `<circle cx="${f(cx + dx)}" cy="${f(cy + dy)}" r="${pr}" fill="#fbfaf3" stroke="${INK}" stroke-width="1.3"/>`;
  for (const [dx, dy, pr] of puffs) c += `<circle cx="${f(cx + dx)}" cy="${f(cy + dy)}" r="${pr - 1.1}" fill="#fbfaf3"/>`;
  c += `<path d="M${f(cx - 20)} ${f(cy + 11)}L${f(cx + 22)} ${f(cy + 11)}" stroke="#dcd8ca" stroke-width="2"/>`;
  return s + `<g opacity="${f(op)}">${c}</g>`;
}
function moving(){
  const m = st.moving; if (!m) return '';
  const t = ease(Math.min(1, m.t)), [x0, y0] = CELLS[m.from], [x1, y1] = DISH[m.to];
  return cube(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, BH + 7 + (DZ - BH - 7) * t + 22 * Math.sin(Math.PI * t), 5 + 9 * t);
}

function scene(st){
  const bt = boardTop(0, 0, BW, BD, BH, 6);
  let s = board(0, 0, BW, BD, BH, 6, BOARD);
  // a sharp shadow only when the sun is out; on a cloudy day the roof casts none
  if (st.shade && st.cloud < 1) s += `<g opacity="${f(1 - st.cloud)}">${castShadow([...roofPts(), ...POSTS.map(([x, y]) => [x, y, BH])], BH, bt)}</g>`;
  s += beams('dishes');
  s += tray();
  if (st.shade) for (const [x, y] of POSTS) s += rod([x, y, BH], [x, y, ROOF.z], 1.1, WOOD, toneI, 1);
  s += dish(1) + thermometer(1);
  if (st.shade && st.sunny) s += `<g opacity="${f(.28 * (1 - st.cloud))}">${clipTo(on(PZ(DZ), ellUV(DISH[1][0], DISH[1][1], DR + 1, DR + 1)), fill(pd(on(PZ(DZ), ellUV(DISH[1][0], DISH[1][1], DR + 1, DR + 1))), SHADOW))}</g>`;
  if (st.shade) s += box(ROOF.x0, ROOF.y0, ROOF.z, ROOF.x1, ROOF.y1, ROOF.z + 2.4, SHADEM, toneI, 1.4) + beams('roof');
  s += dish(0) + thermometer(0);
  s += moving();
  s += sun();
  const [ax, ay] = DISH[0];
  s += tag(SUN.map((v, k) => k === 2 ? v - 10 : v), -64, 4, 'SUN', st.sunny);
  if (st.shade) s += tag([ROOF.x1, ROOF.y0 + 6, ROOF.z + 2.4], 54, -18, 'SHADE', st.sunny);
  if (st.ice[0] > .02) s += tag([ax + 2, ay - 2, DZ + 4 + 10 * st.ice[0]], 50, 20, 'ICE', st.sunny && st.ice[0] > .02);
  s += tag([ax - 9, ay + 7, DZ + 30], -56, -26, 'THERMOMETER', st.T[0] < target(0) - .5);
  return s;
}

/* ---------- behavior ---------- */
let ui;
const steady = () => !st.moving && Math.abs(st.cloud - (st.sunny ? 0 : 1)) < .001
  && st.T.every((T, i) => Math.abs(T - target(i)) < .3) && st.ice.every((v, i) => v <= 0 || st.T[i] <= COOL + 2);
function run(){
  if (st.running) return;
  st.running = true;
  ui.animate(dt => {
    const goal = st.sunny ? 0 : 1;
    st.cloud += Math.sign(goal - st.cloud) * Math.min(Math.abs(goal - st.cloud), dt / .9);
    for (let i = 0; i < 2; i++){
      const want = st.sunny ? COOL + (target(i) - COOL) * (1 - st.cloud) : target(i);
      st.T[i] += (want - st.T[i]) * Math.min(1, dt * .9);
      // warmer than a cool day melts the ice: about 4 s in the sun, much longer in the shade
      const melt = Math.min(st.ice[i], Math.max(0, st.T[i] - (COOL + 2)) / (HOT - COOL - 2) * .26 * dt);
      st.ice[i] -= melt; st.water[i] = Math.min(1, st.water[i] + melt);
    }
    if (st.moving){
      st.moving.t += dt / .9;
      if (st.moving.t >= 1){ st.ice[st.moving.to] = 1; st.moving = st.moving.next; }
    }
    if (steady()){ st.running = false; return false; }
    return true;
  });
}
function sunOut(){
  if (st.sunny) return ui.flash('The sun is already out. Watch the ice!');
  st.sunny = true; run();
}
function cloudIn(){
  if (!st.sunny) return ui.flash('The sun is already behind the cloud.');
  st.sunny = false; run();
}
function toggleShade(){
  st.shade = !st.shade;
  ui.flash(st.shade ? 'Shade on: the right dish is in the shade.' : 'Shade off: both dishes are in the sun.');
  run();
}
function freshIce(){
  if (st.moving) return ui.flash('Wait: fresh ice is on its way.');
  const need = [0, 1].filter(i => st.ice[i] < .9);
  if (!need.length) return ui.flash('The ice has not melted yet.');
  if (st.tray < need.length){
    ui.flash('The tray is empty. It goes in the freezer to make more ice.');
    setTimeout(() => { st.tray = 6; ui.render(); }, 1600);
    return;
  }
  // pour away the melt water, then a cube from the tray into each dish that needs one
  let chain = null;
  for (const i of need.slice().reverse()){ st.tray--; chain = { from: st.tray, to: i, t: 0, next: chain }; }
  for (const i of need){ st.ice[i] = 0; st.water[i] = 0; }
  st.moving = chain;
  run();
}

ui = mountFigure({
  title: 'Ice in the sun',
  size: [BW, BD, 104], palette: 'mustard', state: st,
  scene,
  stats: st => [{ label: 'Left dish', value: `${Math.round(st.T[0])}°F` }, { label: 'Right dish', value: `${Math.round(st.T[1])}°F`, small: true }],
  buttons: [
    { label: 'Sun comes out', onClick: sunOut },
    { label: 'Cloud covers sun', onClick: cloudIn },
    { label: 'Shade on or off', onClick: toggleShade },
    { label: 'Fresh ice', onClick: freshIce },
  ],
  acts: {},
  params: (st, q) => {
    if (q.get('sunny') === '1'){ st.sunny = true; st.cloud = 0; }
    if (q.get('shade') === '0') st.shade = false;
    if (q.has('ice')) { const v = q.get('ice').split(',').map(Number); st.ice = [v[0], v[1] ?? v[0]].map(x => Math.max(0, Math.min(1, x))); st.water = st.ice.map(x => 1 - x); }
    if (q.has('temp')) { const v = q.get('temp').split(',').map(Number); st.T = [v[0], v[1] ?? v[0]]; }
    if (q.has('tray')) st.tray = Math.max(0, Math.min(6, +q.get('tray')));
  },
});
