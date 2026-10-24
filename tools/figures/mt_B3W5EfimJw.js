// title: Toy cart
// hint: Push the cart, pull it back, then load it up and push again.
/* Pushes & Pulls (mt_B3W5EfimJw): a toy cart on a track with squares.
   A push moves the cart away from you, a pull on the rope brings it back, a harder push sends it farther,
   and a heavy block in the cart makes the same push move it less.
   Real sequence: cart at the start, next to you -> push (gently or hard) -> it rolls away and slows to a stop
   (the floor rubs it) -> pull the rope -> it rolls back to you. With the block in, every push moves it less. */
const BW = 44, BD = 210, BH = 4;          // board: x = depth, y = length (start near the viewer, at high y)
const START = 182, END = 34;              // cart centre at the start and where the bumper stops it
const SQ = 20;                            // one square on the track
const CL = 15, CX0 = 12, CX1 = 32;        // cart half-length along y, body depth x0..x1
const ZB = BH + 8, ZT = BH + 20;          // cart body bottom and top
const WR = 5.5;                           // wheel radius
const STONE = matOf('#a8a296');
const ROPE = '#8e6236';

const st = { pal: 'tomato', c: START, v: 0, block: false, pulling: false, pushed: '', moved: 0, running: false };

const mass = () => st.block ? 1.8 : 1;
const FRICTION = 60;                      // how fast the floor slows the cart (units/s²)

/* ---------- drawing ---------- */
function track(){
  let s = board(0, 0, BW, BD, BH, 6, WOOD);
  let ticks = '';
  for (let y = START; y >= END - 1; y -= SQ) ticks += pd([[4, y, BH + .1], [BW - 4, y, BH + .1]], false);
  s += `<path d="${ticks}" fill="none" stroke="${WOOD.d}" stroke-width="1" stroke-linecap="round" opacity=".7"/>`;
  s += box(14, 6, BH, 30, 12, BH + 10, DARK, toneI, 1.1);                 // bumper at the far end
  return s;
}
function wheel(x0, x1, y){ return cylX(x0, x1, y, BH + WR, WR, DARK, toneI, 1.2, 18) + shape(on(PX(Math.max(x0, x1) + .05), ellUV(y, BH + WR, 1.8, 1.8, 12)), METAL.l, .7); }
function forceArrow(y0, y1, z){
  const d = Math.sign(y1 - y0), w = 2.6, hw = 6.5, hl = 9 * d, xp = PX((CX0 + CX1) / 2);
  const uv = [[y0, z - w], [y1 - hl, z - w], [y1 - hl, z - hw], [y1, z], [y1 - hl, z + hw], [y1 - hl, z + w], [y0, z + w]];
  return shape(on(xp, uv), 'var(--accent,#f2c14e)', 1.4);
}
function rope(c){
  const a = [22, c + CL, ZB + 6];                                        // tied to the back of the cart
  if (st.pulling){
    const h = [22, c + CL + 26, ZT + 4];
    return line([a, h], 2.2) + rod([16, h[1], h[2]], [28, h[1], h[2]], 1.6, WOOD, toneI, 1);
  }
  // slack: down to the board, then lying along it to the handle
  const pts = [a, [22, c + CL + 4, ZB + 1], [22, c + CL + 8, BH + 1.2], [22, c + CL + 22, BH + 1.2]];
  const d = pd(pts, false);
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<path d="${d}" fill="none" stroke="${ROPE}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
    + rod([16, c + CL + 23, BH + 1.6], [28, c + CL + 23, BH + 1.6], 1.6, WOOD, toneI, 1);
}
function cart(c, m){
  const y0 = c - CL, y1 = c + CL;
  let s = '';
  s += castShadow([[CX0, y0, ZB], [CX1, y0, ZB], [CX1, y1, ZB], [CX0, y1, ZB], [CX0, y0, ZT], [CX1, y1, ZT], [CX0, y1, ZT]], BH, boardTop(0, 0, BW, BD, BH, 6));
  s += wheel(CX0 - 3, CX0, y0 + 7) + wheel(CX0 - 3, CX0, y1 - 7);          // back wheels, mostly hidden
  s += rope(c);
  s += box(CX0, y0, ZB, CX1, y1, ZT, m, tone, 1);
  s += shape(on(PZ(ZT + .05), rrUV(CX0 + 2.5, y0 + 2.5, CX1 - 2.5, y1 - 2.5, 1.5)), m.d, .9);   // the open top of the tray
  s += hullInk([[CX0, y0, ZB], [CX1, y0, ZB], [CX1, y1, ZB], [CX0, y1, ZB], [CX0, y0, ZT], [CX1, y0, ZT], [CX1, y1, ZT], [CX0, y1, ZT]], 2.4);
  s += wheel(CX1, CX1 + 3, y0 + 7) + wheel(CX1, CX1 + 3, y1 - 7);
  if (st.block) s += box(CX0 + 4, c - 8, ZT - 3, CX1 - 4, c + 8, ZT + 10, STONE, toneI, 1.2);
  return s;
}

function scene(st, m){
  const c = st.c;
  let s = track();
  s += cart(c, m);
  if (st.pushed) s += forceArrow(c + CL + 30, c + CL + 4, ZT + 14);         // push: from behind, away from you
  if (st.pulling) s += forceArrow(c + CL + 12, c + CL + 34, ZT + 16);       // pull: toward you, along the rope
  const moving = Math.abs(st.v) > 1 || st.pulling;
  s += tag([CX1 - 2, c + CL, ZT - 2], -78, -46, 'PUSH', !!st.pushed);
  s += tag([22, c + CL + (st.pulling ? 26 : 23), st.pulling ? ZT + 4 : BH + 1.6], -40, 34, 'ROPE', st.pulling);
  s += tag([CX1 + 3, c - CL + 7, BH + WR], 46, 30, 'WHEELS', moving);
  if (st.block) s += tag([CX1 - 4, c + 3, ZT + 10], 40, -48, 'HEAVY BLOCK', true);
  return s;
}

/* ---------- behavior ---------- */
let ui;
const atStart = () => st.c >= START - 1;
const atEnd = () => st.c <= END + 1;
function run(){
  if (st.running) return;
  st.running = true;
  ui.animate(dt => {
    if (st.pulling){
      st.c = Math.min(START, st.c + 90 * dt);
      if (st.c >= START){ st.pulling = false; }
    } else if (st.v < 0){
      st.c += st.v * dt;
      st.v = Math.min(0, st.v + FRICTION * dt);
      if (st.v > -18) st.pushed = '';                                     // the hand lets go early on
      if (st.c <= END){ st.c = END; st.v = 0; ui.flash('Bump! The cart hit the end of the track.'); }
    }
    st.moved = Math.max(0, Math.round((START - st.c) / SQ));
    if (st.pulling || st.v < 0) return true;
    st.pushed = ''; st.running = false; return false;
  });
}
function push(hard){
  if (st.pulling) return ui.flash('Wait: the cart is being pulled back.');
  if (atEnd()) return ui.flash('The cart is at the end. Pull it back first.');
  // the same push gives a light cart more speed than a heavy one
  const v0 = (hard ? 120 : 85) / mass();
  st.v = Math.min(st.v, 0) - v0; st.pushed = hard ? 'hard' : 'gentle';
  run();
}
function pull(){
  if (st.pulling) return ui.flash('Already pulling.');
  if (atStart()) return ui.flash('The cart is right next to you. Push it away first.');
  st.v = 0; st.pushed = ''; st.pulling = true;
  run();
}
function toggleBlock(){
  if (st.pulling || st.v < 0) return ui.flash('Wait for the cart to stop.');
  st.block = !st.block;
  ui.flash(st.block ? 'The cart is heavy now. Try the same push.' : 'Block out: the cart is light again.');
}

ui = mountFigure({
  title: 'Toy cart',
  size: [BW, BD, 48], palette: 'tomato', state: st,
  scene,
  stats: st => [{ label: 'Squares', value: st.moved }],
  buttons: [
    { label: 'Push gently', onClick: () => push(false) },
    { label: 'Push hard', onClick: () => push(true) },
    { label: 'Pull back', onClick: pull },
    { label: 'Block in or out', onClick: toggleBlock },
  ],
  acts: {},
  params: (st, q) => {
    if (q.get('block') === '1') st.block = true;
    if (q.has('at')) { st.c = Math.max(END, START - SQ * +q.get('at')); st.moved = Math.round((START - st.c) / SQ); }
    if (q.get('pulling') === '1') st.pulling = true;
  },
});
