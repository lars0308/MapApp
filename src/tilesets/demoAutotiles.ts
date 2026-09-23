import type { Perspective, TileCategory, TileMeta, TileRole, Tileset } from '../types';
import { Rng } from '../generator/rng';

// Procedurally drawn auto-tile sets for the demo:
//  - "Demo Wände Top-Down": all wall roles + door frames + cliff rims (top_down)
//  - "Demo Wände 3/4":      same roles in 3/4 style + wall fronts + cliff faces (low_top_down, isometric_45)
//  - "Demo Gelände":        bridges (h/v), abyss edge, raised floor, wood/sand floors, transitions
// Tiles are 16×16 px. Each tile carries a role (auto-tile) plus a category (palette filter).

const T = 16;
const COLS = 8;

type Ctx = CanvasRenderingContext2D;

interface Def {
  role?: TileRole;
  category?: TileCategory;
  tags?: string[];
  weight?: number;
  collision?: boolean;
  sortOffset?: number;
  draw: (d: D) => void;
}

class D {
  constructor(
    public ctx: Ctx,
    public ox: number,
    public oy: number,
    public rng: Rng,
  ) {}
  rect(x: number, y: number, w: number, h: number, c: string) {
    if (w <= 0 || h <= 0) return;
    this.ctx.fillStyle = c;
    this.ctx.fillRect(this.ox + x, this.oy + y, w, h);
  }
  px(x: number, y: number, c: string) {
    this.rect(x, y, 1, 1, c);
  }
  speckle(colors: string[], p: number, x0 = 0, y0 = 0, w = T, h = T) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (this.rng.chance(p)) this.px(x, y, this.rng.pick(colors));
  }
}

/* ------------------------------------------------------------------ */
/* wall art                                                            */
/* ------------------------------------------------------------------ */

interface Rim {
  n?: boolean;
  e?: boolean;
  s?: boolean;
  w?: boolean;
  ne?: boolean;
  nw?: boolean;
  se?: boolean;
  sw?: boolean;
}

/** Which sides of a wall tile face the room, per role. */
const RIMS: Partial<Record<TileRole, Rim>> = {
  wall_top: { s: true },
  wall_bottom: { n: true },
  wall_left: { e: true },
  wall_right: { w: true },
  wall_horizontal: { n: true, s: true },
  wall_vertical: { e: true, w: true },
  corner_top_left: { se: true },
  corner_top_right: { sw: true },
  corner_bottom_left: { ne: true },
  corner_bottom_right: { nw: true },
  inner_corner_top_left: { n: true, w: true, se: false },
  inner_corner_top_right: { n: true, e: true },
  inner_corner_bottom_left: { s: true, w: true },
  inner_corner_bottom_right: { s: true, e: true },
  end_cap_top: { n: true, e: true, w: true },
  end_cap_bottom: { s: true, e: true, w: true },
  end_cap_left: { w: true, n: true, s: true },
  end_cap_right: { e: true, n: true, s: true },
  junction_t_up: { s: true, nw: true, ne: true },
  junction_t_down: { n: true, sw: true, se: true },
  junction_t_left: { e: true, nw: true, sw: true },
  junction_t_right: { w: true, ne: true, se: true },
  junction_cross: { ne: true, nw: true, se: true, sw: true },
};

const CAP = { base: '#1f1b23', joint: '#18151b', light: '#27222c' };
const RIM_HI = '#6a6273';
const RIM_MID = '#3f3946';

function capTexture(d: D, base = CAP.base, joint = CAP.joint) {
  d.rect(0, 0, T, T, base);
  for (let y = 3; y < T; y += 5) d.rect(0, y, T, 1, joint);
  for (let r = 0; r < 4; r++) for (let x = r % 2 ? 2 : 6; x < T; x += 8) d.rect(x, r * 5 - 2, 1, 5, joint);
  d.speckle([CAP.light], 0.1);
}

/** Top-down wall: dark cap, light rim on every side facing the room. */
function drawTopDownWall(d: D, rim: Rim) {
  capTexture(d);
  const line = (x: number, y: number, w: number, h: number) => {
    d.rect(x, y, w, h, RIM_MID);
  };
  if (rim.n) (line(0, 0, T, 2), d.rect(0, 0, T, 1, RIM_HI));
  if (rim.s) (line(0, T - 2, T, 2), d.rect(0, T - 1, T, 1, RIM_HI));
  if (rim.w) (line(0, 0, 2, T), d.rect(0, 0, 1, T, RIM_HI));
  if (rim.e) (line(T - 2, 0, 2, T), d.rect(T - 1, 0, 1, T, RIM_HI));
  const dot = (x: number, y: number) => {
    d.rect(x, y, 3, 3, RIM_MID);
    d.rect(x + (x ? 2 : 0), y, 1, 3, RIM_HI);
    d.rect(x, y + (y ? 2 : 0), 3, 1, RIM_HI);
  };
  if (rim.nw) dot(0, 0);
  if (rim.ne) dot(T - 3, 0);
  if (rim.sw) dot(0, T - 3);
  if (rim.se) dot(T - 3, T - 3);
}

const FACE = { base: '#4a4351', line: '#2e2934', hi: '#554d5d', dark: '#3a3441' };

function bricks(d: D, x0: number, y0: number, w: number, h: number, offset = 0) {
  d.rect(x0, y0, w, h, FACE.base);
  for (let r = 0; r * 4 < h; r++) {
    const y = y0 + r * 4;
    d.rect(x0, y, w, 1, FACE.hi);
    d.rect(x0, Math.min(y0 + h - 1, y + 3), w, 1, FACE.line);
    for (let x = x0 + ((r + offset) % 2 ? 4 : 0); x < x0 + w; x += 8) d.rect(x, y, 1, Math.min(4, y0 + h - y), FACE.line);
  }
}

/**
 * 3/4 wall cap. Left/right walls show their raised inner face as a brick strip; the cap edge
 * above a wall front is a thin highlight; walls below the room only show their top lip.
 * Corners join these edges seamlessly: the side strip ends exactly where the front's top edge
 * (outer top corners) or the bottom lip (outer bottom corners) begins – no posts sticking out.
 */
function drawThreeQuarterWall(d: D, rim: Rim) {
  capTexture(d, '#2a2530', '#221e27');
  const S = 4; // width of the visible side face
  const face = (x: number) => {
    bricks(d, x, 0, S, T);
    d.rect(x === 0 ? S : x - 1, 0, 1, T, RIM_HI); // cap edge along the face
  };
  if (rim.e) face(T - S);
  if (rim.w) face(0);
  // part of the tile width not covered by side faces
  const x0 = rim.w ? S + 1 : 0;
  const x1 = rim.e ? T - S - 1 : T;
  // cap edge above a wall front (room below)
  if (rim.s) d.rect(x0, T - 1, x1 - x0, 1, RIM_HI);
  // wall below the room: only its top lip is visible
  if (rim.n) {
    d.rect(x0, 0, x1 - x0, 2, RIM_MID);
    d.rect(x0, 0, x1 - x0, 1, RIM_HI);
  }
  // outer corners: the edge turns around the corner
  // room diagonally below → the front's top edge meets the side face edge (L of highlight)
  if (rim.se) d.rect(T - S - 1, T - 1, S + 1, 1, RIM_HI);
  if (rim.sw) d.rect(0, T - 1, S + 1, 1, RIM_HI);
  // room diagonally above → the bottom lip meets the side face
  if (rim.ne) {
    d.rect(T - S - 1, 0, S + 1, 2, RIM_MID);
    d.rect(T - S - 1, 0, S + 1, 1, RIM_HI);
  }
  if (rim.nw) {
    d.rect(0, 0, S + 1, 2, RIM_MID);
    d.rect(0, 0, S + 1, 1, RIM_HI);
  }
}

/** Wall front; `end` shows the wall's side face where the front ends next to floor. */
function wallFront(d: D, opts: { base: boolean; upper?: boolean; broken?: boolean; end?: 'l' | 'r' }) {
  bricks(d, 0, 0, T, T, opts.upper ? 1 : 0);
  d.speckle([FACE.hi, FACE.dark], 0.06);
  if (opts.upper) d.rect(0, 0, T, 1, RIM_HI);
  if (opts.base) {
    d.rect(0, T - 2, T, 2, '#2a2530');
    d.rect(0, T - 1, T, 1, '#1b181f');
  }
  if (opts.broken) {
    d.rect(9, 3, 4, 3, '#2a2530');
    d.rect(10, 6, 2, 2, '#2a2530');
    d.px(3, 9, FACE.line);
    d.px(4, 10, FACE.line);
  }
  if (opts.end) {
    // side face of the wall block, same look as the side faces of left/right walls
    const x = opts.end === 'l' ? 0 : T - 4;
    bricks(d, x, 0, 4, T, 1);
    d.rect(opts.end === 'l' ? 4 : T - 5, 0, 1, T, FACE.line);
    d.rect(opts.end === 'l' ? 0 : T - 1, 0, 1, T, RIM_HI);
  }
}

const WOOD = { base: '#5c3f28', dark: '#48301e', light: '#6f4d31', gold: '#d8b45a' };

function doorFront(d: D) {
  bricks(d, 0, 0, T, T);
  d.rect(2, 2, 12, 14, '#57505f');
  d.rect(3, 3, 10, 13, WOOD.base);
  for (let x = 5; x < 13; x += 3) d.rect(x, 3, 1, 13, WOOD.dark);
  d.rect(3, 3, 10, 1, WOOD.light);
  d.rect(10, 9, 2, 2, WOOD.gold);
}

function doorTopDown(d: D, orient: 'h' | 'v') {
  d.rect(0, 0, T, T, '#2a2530');
  if (orient === 'h') {
    d.rect(0, 5, T, 6, WOOD.base);
    for (let x = 1; x < T; x += 4) d.rect(x, 5, 1, 6, WOOD.dark);
    d.rect(0, 5, T, 1, WOOD.light);
    d.rect(7, 7, 2, 2, WOOD.gold);
  } else {
    d.rect(5, 0, 6, T, WOOD.base);
    for (let y = 1; y < T; y += 4) d.rect(5, y, 6, 1, WOOD.dark);
    d.rect(5, 0, 1, T, WOOD.light);
    d.rect(7, 7, 2, 2, WOOD.gold);
  }
}

function frame(d: D, side: 'left' | 'right', style: 'front' | 'top') {
  if (style === 'front') wallFront(d, { base: true });
  else drawTopDownWall(d, { s: true, n: true });
  const x = side === 'left' ? T - 4 : 0;
  d.rect(x, 0, 4, T, '#6b4b30');
  d.rect(x + (side === 'left' ? 0 : 3), 0, 1, T, '#86603d');
  d.rect(x, 0, 4, 2, '#8a8195');
}

/* ------------------------------------------------------------------ */
/* cliff art                                                           */
/* ------------------------------------------------------------------ */

const ROCK = { base: '#57483f', dark: '#43372f', light: '#6c5a4e', hi: '#85705f', line: '#33291f' };

function rimOverlay(d: D, side: 'n' | 'e' | 's' | 'w', lip: boolean) {
  const t = lip ? 3 : 4;
  const r = (x: number, y: number, w: number, h: number) => {
    d.rect(x, y, w, h, ROCK.dark);
  };
  if (side === 'n') (r(0, 0, T, t), d.rect(0, t - 1, T, 1, ROCK.hi));
  if (side === 's') (r(0, T - t, T, t), d.rect(0, T - t, T, 1, ROCK.hi));
  if (side === 'w') (r(0, 0, t, T), d.rect(t - 1, 0, 1, T, ROCK.hi));
  if (side === 'e') (r(T - t, 0, t, T), d.rect(T - t, 0, 1, T, ROCK.hi));
}

function cliffFace(d: D, bottom: boolean) {
  d.rect(0, 0, T, T, ROCK.base);
  for (let y = 2; y < T; y += 4) {
    d.rect(0, y, T, 1, ROCK.dark);
    d.rect(d.rng.int(0, 10), y + 1, d.rng.int(3, 6), 1, ROCK.light);
  }
  for (let i = 0; i < 4; i++) d.rect(d.rng.int(0, 14), d.rng.int(0, 12), 1, d.rng.int(2, 4), ROCK.line);
  d.speckle([ROCK.dark, ROCK.light], 0.08);
  if (!bottom) d.rect(0, 0, T, 1, ROCK.hi);
  if (bottom) {
    d.rect(0, T - 3, T, 3, ROCK.dark);
    [[2, 13], [6, 14], [11, 13]].forEach(([x, y]) => d.rect(x, y, 2, 2, ROCK.light));
  }
}

function stairsDown(d: D) {
  const shades = ['#6a6273', '#5b5364', '#4c4555', '#3e3847'];
  shades.forEach((c, i) => {
    d.rect(0, i * 4, T, 4, c);
    d.rect(0, i * 4, T, 1, i ? shades[i - 1] : '#80778a');
  });
  d.rect(0, 0, 2, T, ROCK.dark);
  d.rect(T - 2, 0, 2, T, ROCK.dark);
}

function shadowGrad(d: D) {
  for (let i = 0; i < 8; i++) d.rect(0, i, T, 1, `rgba(8,6,12,${(0.42 * (1 - i / 8)).toFixed(3)})`);
}

/* ------------------------------------------------------------------ */
/* terrain art                                                         */
/* ------------------------------------------------------------------ */

function slabs(d: D, base: string, light: string, dark: string, mortar: string) {
  d.rect(0, 0, T, T, base);
  d.speckle([light, dark], 0.16);
  d.rect(0, 7, T, 1, mortar);
  d.rect(0, 15, T, 1, mortar);
  d.rect(7, 0, 1, 7, mortar);
  d.rect(3, 8, 1, 7, mortar);
  d.rect(11, 8, 1, 7, mortar);
}

function planks(d: D, worn: boolean) {
  d.rect(0, 0, T, T, '#6d4a2d');
  for (let y = 0; y < T; y += 4) {
    d.rect(0, y + 3, T, 1, '#4a311d');
    d.rect(0, y, T, 1, '#7f5935');
    const joint = (y / 4) % 2 ? 5 : 11;
    d.rect(joint, y, 1, 3, '#4a311d');
  }
  d.speckle(['#5c3e25', '#7a5533'], worn ? 0.12 : 0.05);
}

function sand(d: D, ripples: boolean) {
  d.rect(0, 0, T, T, '#b39a66');
  d.speckle(['#c4ab76', '#a08857', '#cdb785'], 0.3);
  if (ripples) for (let y = 3; y < T; y += 5) d.rect(d.rng.int(0, 4), y, d.rng.int(6, 10), 1, '#9c8452');
}

/** Bridge tile drawn vertically (walked north–south); horizontal ones are rotated. */
function bridgeV(d: D, part: 'start' | 'middle' | 'end' | 'left' | 'right') {
  d.rect(0, 0, T, T, 'rgba(0,0,0,0)');
  const railL = part !== 'right';
  const railR = part !== 'left';
  d.rect(2, 0, 12, T, '#5a3d27');
  for (let y = 0; y < T; y += 3) {
    d.rect(2, y, 12, 2, '#6d5037');
    d.rect(2, y, 12, 1, '#80613f');
  }
  if (railL) (d.rect(1, 0, 2, T, '#8c7a5c'), d.rect(1, 0, 1, T, '#a8946f'));
  if (railR) (d.rect(13, 0, 2, T, '#8c7a5c'), d.rect(14, 0, 1, T, '#6d5f47'));
  if (part === 'left' || part === 'right') {
    // wide bridge: plank continues to the tile edge on the open side
    d.rect(part === 'left' ? 13 : 0, 0, 3, T, '#6d5037');
  }
  if (part === 'start') (d.rect(0, 0, T, 2, '#4a4352'), d.rect(1, 2, 2, 3, '#a8946f'), d.rect(13, 2, 2, 3, '#a8946f'));
  if (part === 'end') (d.rect(0, T - 2, T, 2, '#4a4352'), d.rect(1, T - 5, 2, 3, '#a8946f'), d.rect(13, T - 5, 2, 3, '#a8946f'));
}

function abyssEdge(d: D) {
  d.rect(0, 0, T, T, '#08070a');
  d.rect(0, 0, T, 5, '#3b3641');
  d.rect(0, 5, T, 3, '#1f1b23');
  d.rect(0, 8, T, 3, '#121015');
  d.speckle(['#47414e'], 0.2, 0, 0, T, 4);
  d.rect(0, 4, T, 1, '#524b5a');
}

function transition(d: D) {
  // rubble / worn border overlay (transparent background)
  for (let i = 0; i < 18; i++) {
    const x = d.rng.int(0, 14);
    const y = d.rng.int(0, 14);
    const c = d.rng.pick(['rgba(90,74,59,0.9)', 'rgba(110,90,71,0.85)', 'rgba(60,54,65,0.8)']);
    d.rect(x, y, d.rng.int(1, 3), d.rng.int(1, 2), c);
  }
}

/* ------------------------------------------------------------------ */

const WALL_ROLES = Object.keys(RIMS) as TileRole[];

const WALL_CATEGORY: Partial<Record<TileRole, TileCategory>> = {
  wall_top: 'wallTop',
  wall_bottom: 'wallBottom',
  wall_left: 'wallLeft',
  wall_right: 'wallRight',
  wall_horizontal: 'wallTop',
  wall_vertical: 'wallLeft',
  corner_top_left: 'outerCorner',
  corner_top_right: 'outerCorner',
  corner_bottom_left: 'outerCorner',
  corner_bottom_right: 'outerCorner',
  inner_corner_top_left: 'innerCorner',
  inner_corner_top_right: 'innerCorner',
  inner_corner_bottom_left: 'innerCorner',
  inner_corner_bottom_right: 'innerCorner',
};

function wallDefs(style: 'top' | 'front'): Def[] {
  const defs: Def[] = WALL_ROLES.map((role) => ({
    role,
    category: WALL_CATEGORY[role],
    tags: ['stone', 'wall'],
    weight: 100,
    collision: true,
    draw: (d: D) => (style === 'top' ? drawTopDownWall(d, RIMS[role]!) : drawThreeQuarterWall(d, RIMS[role]!)),
  }));
  if (style === 'front') {
    defs.push(
      { role: 'wall_front', category: 'wallFront', tags: ['stone', 'base'], weight: 85, collision: true, draw: (d) => wallFront(d, { base: true }) },
      { role: 'wall_front', category: 'wallFront', tags: ['stone', 'base', 'broken'], weight: 15, collision: true, draw: (d) => wallFront(d, { base: true, broken: true }) },
      { role: 'wall_front_upper', category: 'wallFront', tags: ['stone', 'upper'], weight: 100, collision: true, sortOffset: 1, draw: (d) => wallFront(d, { base: false, upper: true }) },
      // front ends: the wall block's side face where a front stops next to floor
      { role: 'wall_front', category: 'wallFront', tags: ['stone', 'base', 'end_l'], weight: 100, collision: true, draw: (d) => wallFront(d, { base: true, end: 'l' }) },
      { role: 'wall_front', category: 'wallFront', tags: ['stone', 'base', 'end_r'], weight: 100, collision: true, draw: (d) => wallFront(d, { base: true, end: 'r' }) },
      { role: 'wall_front_upper', category: 'wallFront', tags: ['stone', 'upper', 'end_l'], weight: 100, collision: true, sortOffset: 1, draw: (d) => wallFront(d, { base: false, upper: true, end: 'l' }) },
      { role: 'wall_front_upper', category: 'wallFront', tags: ['stone', 'upper', 'end_r'], weight: 100, collision: true, sortOffset: 1, draw: (d) => wallFront(d, { base: false, upper: true, end: 'r' }) },
      { role: 'door', category: 'door', tags: ['wood', 'front'], weight: 100, collision: false, draw: doorFront },
      { role: 'door', category: 'door', tags: ['wood', 'h'], weight: 100, collision: false, draw: (d) => doorTopDown(d, 'h') },
      { role: 'door', category: 'door', tags: ['wood', 'v'], weight: 100, collision: false, draw: (d) => doorTopDown(d, 'v') },
      { role: 'door_frame_left', tags: ['front'], weight: 100, collision: true, draw: (d) => frame(d, 'left', 'front') },
      { role: 'door_frame_right', tags: ['front'], weight: 100, collision: true, draw: (d) => frame(d, 'right', 'front') },
      // cliffs (3/4): rims are overlays on the raised floor, faces are opaque and y-sorted
      { role: 'cliff_top', tags: ['rock'], draw: (d) => rimOverlay(d, 'n', true) },
      { role: 'cliff_left', tags: ['rock'], draw: (d) => rimOverlay(d, 'w', true) },
      { role: 'cliff_right', tags: ['rock'], draw: (d) => rimOverlay(d, 'e', true) },
      { role: 'cliff_outer_corner', tags: ['rock', 'left'], draw: (d) => (rimOverlay(d, 'n', true), rimOverlay(d, 'w', true)) },
      { role: 'cliff_outer_corner', tags: ['rock', 'right'], draw: (d) => (rimOverlay(d, 'n', true), rimOverlay(d, 'e', true)) },
      { role: 'cliff_inner_corner', tags: ['rock'], draw: (d) => d.rect(0, 0, 4, 4, ROCK.dark) },
      { role: 'cliff_front', tags: ['rock'], weight: 100, collision: true, draw: (d) => cliffFace(d, false) },
      { role: 'cliff_bottom', tags: ['rock'], weight: 100, collision: true, draw: (d) => cliffFace(d, true) },
      { role: 'stairs', category: 'stairs', tags: ['stone'], weight: 100, collision: false, draw: stairsDown },
    );
  } else {
    defs.push(
      { role: 'door', category: 'door', tags: ['wood', 'h'], weight: 100, collision: false, draw: (d) => doorTopDown(d, 'h') },
      { role: 'door', category: 'door', tags: ['wood', 'v'], weight: 100, collision: false, draw: (d) => doorTopDown(d, 'v') },
      { role: 'door_frame_left', tags: ['top'], weight: 100, collision: true, draw: (d) => frame(d, 'left', 'top') },
      { role: 'door_frame_right', tags: ['top'], weight: 100, collision: true, draw: (d) => frame(d, 'right', 'top') },
      { role: 'cliff_top', tags: ['rock'], draw: (d) => rimOverlay(d, 'n', false) },
      { role: 'cliff_left', tags: ['rock'], draw: (d) => rimOverlay(d, 'w', false) },
      { role: 'cliff_right', tags: ['rock'], draw: (d) => rimOverlay(d, 'e', false) },
      { role: 'cliff_bottom', tags: ['rock'], draw: (d) => rimOverlay(d, 's', false) },
      { role: 'cliff_outer_corner', tags: ['rock', 'left'], draw: (d) => (rimOverlay(d, 'n', false), rimOverlay(d, 'w', false)) },
      { role: 'cliff_outer_corner', tags: ['rock', 'right'], draw: (d) => (rimOverlay(d, 'n', false), rimOverlay(d, 'e', false)) },
      { role: 'cliff_inner_corner', tags: ['rock', 'left'], draw: (d) => (rimOverlay(d, 's', false), rimOverlay(d, 'w', false)) },
      { role: 'cliff_inner_corner', tags: ['rock', 'right'], draw: (d) => (rimOverlay(d, 's', false), rimOverlay(d, 'e', false)) },
      { role: 'stairs', category: 'stairs', tags: ['stone'], weight: 100, collision: false, draw: stairsDown },
    );
  }
  return defs;
}

function terrainDefs(): Def[] {
  const defs: Def[] = [
    { role: 'raised_floor', tags: ['stone', 'raised'], weight: 100, draw: (d) => slabs(d, '#4a4452', '#57505f', '#3f3946', '#2e2934') },
    { category: 'floor', role: 'floor_center', tags: ['wood'], weight: 70, draw: (d) => planks(d, false) },
    { category: 'floor', role: 'floor_center', tags: ['wood', 'broken'], weight: 30, draw: (d) => planks(d, true) },
    { category: 'floor', role: 'floor_center', tags: ['sand'], weight: 60, draw: (d) => sand(d, false) },
    { category: 'floor', role: 'floor_center', tags: ['sand'], weight: 40, draw: (d) => sand(d, true) },
    { role: 'transition', tags: ['transition'], weight: 100, draw: transition },
    { role: 'abyss_edge', category: 'abyss', tags: ['edge'], weight: 100, collision: true, draw: abyssEdge },
    { role: 'cliff_shadow', category: 'shadow', tags: ['top'], weight: 100, draw: shadowGrad },
  ];
  for (const orient of ['v', 'h'] as const)
    for (const part of ['start', 'middle', 'end', 'left', 'right'] as const)
      defs.push({
        role: `bridge_${part}` as TileRole,
        category: 'bridge',
        tags: ['wood', orient],
        weight: 100,
        collision: false,
        // horizontal bridges: the vertical art rotated counter-clockwise (north rail = "left")
        draw: (d) => bridgeV(d, orient === 'h' && part === 'left' ? 'right' : orient === 'h' && part === 'right' ? 'left' : part),
        ...(orient === 'h' ? { rotate: true } : {}),
      } as Def);
  return defs;
}

function build(id: string, name: string, defs: Def[], perspectives: Perspective[], firstGid: number, seed: number): Tileset {
  const rows = Math.ceil(defs.length / COLS);
  const canvas = document.createElement('canvas');
  canvas.width = COLS * T;
  canvas.height = rows * T;
  const ctx = canvas.getContext('2d')!;
  const tmp = document.createElement('canvas');
  tmp.width = T;
  tmp.height = T;
  const tctx = tmp.getContext('2d')!;
  const tiles: Record<number, TileMeta> = {};
  defs.forEach((def, i) => {
    const ox = (i % COLS) * T;
    const oy = Math.floor(i / COLS) * T;
    const rotate = (def as Def & { rotate?: boolean }).rotate;
    if (rotate) {
      tctx.clearRect(0, 0, T, T);
      def.draw(new D(tctx, 0, 0, new Rng(seed + i * 131)));
      ctx.save();
      ctx.translate(ox, oy + T);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(tmp, 0, 0);
      ctx.restore();
    } else def.draw(new D(ctx, ox, oy, new Rng(seed + i * 131)));
    tiles[i] = {
      category: def.category,
      role: def.role,
      tags: def.tags ?? [],
      weight: def.weight ?? 100,
      ...(def.collision !== undefined ? { collision: def.collision } : {}),
      ...(def.sortOffset ? { sortOffset: def.sortOffset } : {}),
    };
  });
  const count = rows * COLS;
  const empty: number[] = [];
  for (let i = defs.length; i < count; i++) empty.push(i);
  return {
    id,
    name,
    source: 'demo',
    dataUrl: canvas.toDataURL('image/png'),
    imageWidth: canvas.width,
    imageHeight: canvas.height,
    tileSize: T,
    columns: COLS,
    rows,
    firstGid,
    active: true,
    tiles,
    emptyTiles: empty,
    perspectives,
  };
}

export const DEMO_AUTOTILE_IDS = ['demo_walls_top', 'demo_walls_34', 'demo_terrain'];

/** Build the auto-tile demo sets starting at `firstGid`. */
export function createDemoAutotileSets(firstGid: number): Tileset[] {
  const a = build('demo_walls_top', 'Demo Wände Top-Down', wallDefs('top'), ['top_down'], firstGid, 7001);
  const b = build('demo_walls_34', 'Demo Wände 3/4', wallDefs('front'), ['low_top_down', 'isometric_45'], a.firstGid + a.columns * a.rows, 7301);
  const c = build('demo_terrain', 'Demo Gelände', terrainDefs(), [], b.firstGid + b.columns * b.rows, 7601);
  return [a, b, c];
}
