import type { Tileset } from '../types';
import { D, build, type Def } from './demoAutotiles';

// "Demo Natur": bright summer tiles for outdoor maps – meadow, dirt paths and shores with soft,
// rounded edges, grassy cliffs and small plants. Paths and shores are corner-matched overlays:
// tag c<bits> says which tile corners lie inside (TL=1 TR=2 BR=4 BL=8), c15 is the full tile.
// The edge is computed per pixel from the four corners, so neighbouring tiles always line up.

const T = 16;

const SUMMER = {
  grass: { base: '#5fae45', light: '#72c052', dark: '#4e9a3a', blade: '#86d162', deep: '#43873a' },
  dirt: { base: '#d8b27a', light: '#e5c592', dark: '#bf955e', rim: '#a87d4c', pebble: '#c9a26d' },
  water: { deep: '#3f95cf', base: '#4aa6db', light: '#6cc0ea', foam: '#e6f7ff', sand: '#e4d29a', sandDark: '#cdb877' },
};
type Palette = typeof SUMMER;
/** climates of the same set (Außen / Dorf / Insel → Klima): snow with trodden paths and icy shores, sand with an oasis */
const CLIMATES: Record<'winter' | 'desert', Palette> = {
  winter: {
    grass: { base: '#e8f0f6', light: '#ffffff', dark: '#cddcea', blade: '#b7cddf', deep: '#a3bdd3' },
    dirt: { base: '#b7a58f', light: '#cbbba6', dark: '#9c8a74', rim: '#7f6e5a', pebble: '#a8977f' },
    water: { deep: '#3d7fb5', base: '#4e93c7', light: '#86bde0', foam: '#f4fbff', sand: '#e2eef6', sandDark: '#c3d6e5' },
  },
  desert: {
    grass: { base: '#e6c98a', light: '#f0d9a4', dark: '#d4b373', blade: '#c9a862', deep: '#bb9a58' },
    dirt: { base: '#c7a06a', light: '#d6b27e', dark: '#ab8552', rim: '#8e6c3f', pebble: '#b8915c' },
    water: { deep: '#2f8fa8', base: '#3ea8bf', light: '#6fcfe0', foam: '#e9fbff', sand: '#f3e2b0', sandDark: '#d9c38a' },
  },
};
// the drawing helpers read the palette of the set being built
let GRASS = SUMMER.grass;
let DIRT = SUMMER.dirt;
let WATER = SUMMER.water;
function usePalette(p: Palette) {
  GRASS = p.grass;
  DIRT = p.dirt;
  WATER = p.water;
}
// dungeon / cave pools: darker water with a wet stone rim instead of a beach
const POOL = { deep: '#1f4f78', base: '#28618f', light: '#3a7cab', foam: '#9fd0ea', sand: '#524b5a', sandDark: '#2d2932' };
const ROCK = { top: '#8e9aa6', face: '#6f7b88', dark: '#566270', light: '#a9b4bf', line: '#4a5461' };

/** 0..1 field of a corner mask at a pixel; > 0.5 = inside. Wobble is 0 on tile borders (seamless). */
function field(mask: number, x: number, y: number, wobble: number): number {
  const u = (x + 0.5) / T;
  const v = (y + 0.5) / T;
  // two opposite corners (river bend on the diagonal): one band through the middle, no pinched saddle
  if (mask === 5 || mask === 10) {
    const along = mask === 5 ? Math.abs(u - v) : Math.abs(u + v - 1);
    return Math.max(field(mask === 5 ? 1 : 2, x, y, wobble), field(mask === 5 ? 4 : 8, x, y, wobble), 0.86 - along * 1.25);
  }
  const tl = mask & 1 ? 1 : 0;
  const tr = mask & 2 ? 1 : 0;
  const br = mask & 4 ? 1 : 0;
  const bl = mask & 8 ? 1 : 0;
  const top = tl + (tr - tl) * u;
  const bottom = bl + (br - bl) * u;
  return top + (bottom - top) * v + wobble * Math.sin(Math.PI * 2 * u) * Math.sin(Math.PI * 2 * v);
}

function meadow(d: D, kind: 'plain' | 'blades' | 'flowers' | 'clover' | 'dark') {
  const g = kind === 'dark' ? { ...GRASS, base: GRASS.dark, light: GRASS.base, dark: GRASS.deep } : GRASS;
  d.rect(0, 0, T, T, g.base);
  d.speckle([g.light], 0.08);
  d.speckle([g.dark], 0.06);
  const tufts = kind === 'plain' ? 1 : kind === 'dark' ? 3 : 2;
  for (let k = 0; k < tufts; k++) {
    const x = d.rng.int(1, 13);
    const y = d.rng.int(2, 13);
    d.px(x, y, g.dark).px(x + 2, y, g.dark).px(x + 1, y - 1, GRASS.blade).px(x, y - 1, g.light).px(x + 2, y - 1, g.light);
  }
  if (kind === 'blades')
    for (let k = 0; k < 4; k++) {
      const x = d.rng.int(0, 15);
      const y = d.rng.int(1, 15);
      d.px(x, y, GRASS.blade).px(x, y - 1, g.light);
    }
  if (kind === 'flowers')
    for (let k = 0; k < 3; k++) {
      const x = d.rng.int(2, 13);
      const y = d.rng.int(2, 13);
      const c = d.rng.pick(['#fff6d8', '#ffd84a', '#f59ac0']);
      d.px(x, y - 1, c).px(x - 1, y, c).px(x + 1, y, c).px(x, y + 1, c).px(x, y, '#f0b030');
    }
  if (kind === 'clover')
    for (let k = 0; k < 3; k++) {
      const x = d.rng.int(2, 13);
      const y = d.rng.int(2, 13);
      d.px(x, y, GRASS.deep).px(x + 1, y, GRASS.blade).px(x, y + 1, GRASS.blade).px(x + 1, y + 1, GRASS.deep);
    }
}

/** dirt path overlay: transparent outside, dark rim along the edge, pebbles inside */
function dirt(d: D, mask: number) {
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const v = mask === 15 ? 1 : field(mask, x, y, 0.07);
      if (v < 0.5) continue;
      const rim = v < 0.5 + 1.2 / T;
      const inner = v < 0.5 + 2.4 / T;
      d.px(x, y, rim ? DIRT.rim : inner ? DIRT.dark : d.rng.chance(0.07) ? DIRT.light : d.rng.chance(0.05) ? DIRT.pebble : DIRT.base);
    }
}

/** shore / water overlay: sand rim on the land side, a foam line, light shallows, deep water */
function water(d: D, mask: number, sparkle: number, w = WATER) {
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      // c0: a single water cell – a round puddle in the middle of the tile
      const v = mask === 15 ? 1 : mask === 0 ? 1.05 - Math.hypot((x + 0.5) / T - 0.5, (y + 0.5) / T - 0.5) * 1.5 : field(mask, x, y, 0.08);
      if (v < 0.5 - 2 / T) continue;
      let c: string;
      if (v < 0.5 - 1 / T) c = w.sandDark;
      else if (v < 0.5) c = w.sand;
      else if (v < 0.5 + 1 / T) c = w.foam;
      else if (v < 0.5 + 3 / T) c = w.light;
      else if (v < 0.5 + 6 / T) c = w.base;
      else c = w.deep;
      d.px(x, y, c);
    }
  // little wave glints
  for (let k = 0; k < sparkle; k++) {
    const x = d.rng.int(1, 12);
    const y = d.rng.int(1, 14);
    if ((mask === 15 ? 1 : field(mask, x, y, 0.08)) > 0.5 + 4 / T) d.rect(x, y, 3, 1, w.light).px(x + 1, y, w.foam);
  }
}

/** grassy plateau rim: the edge side(s) get a dark outline and a lighter lip */
function cliffRim(d: D, sides: { n?: boolean; s?: boolean; w?: boolean; e?: boolean }) {
  meadow(d, 'plain');
  const lip = GRASS.blade;
  const out = GRASS === SUMMER.grass ? '#2f5f28' : GRASS.deep;
  if (sides.n) d.rect(0, 0, T, 1, out).rect(0, 1, T, 1, lip);
  if (sides.s) d.rect(0, T - 1, T, 1, out).rect(0, T - 2, T, 1, GRASS.dark);
  if (sides.w) d.rect(0, 0, 1, T, out).rect(1, 0, 1, T, lip);
  if (sides.e) d.rect(T - 1, 0, 1, T, out).rect(T - 2, 0, 1, T, GRASS.dark);
}

/** rock face below a plateau: vertical slabs, grass overhang on top, darker foot */
function cliffFace(d: D, bottom: boolean) {
  d.rect(0, 0, T, T, ROCK.face);
  for (let x = 0; x < T; x += 4) {
    const w = 4;
    d.rect(x, 0, 1, T, ROCK.line);
    d.rect(x + 1, 0, 1, T, ROCK.light);
    if (d.rng.chance(0.6)) d.rect(x + 1, d.rng.int(4, 11), w - 1, 1, ROCK.dark);
  }
  d.rect(0, 0, T, 2, GRASS.dark).px(d.rng.int(1, 14), 2, GRASS.dark).px(d.rng.int(1, 14), 2, GRASS.deep);
  if (bottom) d.rect(0, T - 3, T, 3, ROCK.dark).rect(0, T - 1, T, 1, 'rgba(20,50,20,0.55)');
}

function steps(d: D) {
  meadow(d, 'plain');
  for (let k = 0; k < 4; k++) {
    const y = 1 + k * 4;
    d.rect(2, y, 12, 3, k % 2 ? ROCK.face : ROCK.top).rect(2, y, 12, 1, ROCK.light).rect(2, y + 3, 12, 1, ROCK.dark);
  }
  d.rect(1, 0, 1, T, GRASS.deep).rect(14, 0, 1, T, GRASS.deep);
}

function bush(d: D, berries: boolean) {
  const c = (x: number, y: number, r: number, col: string) => {
    for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) if (xx * xx + yy * yy <= r * r + r) d.px(x + xx, y + yy, col);
  };
  d.rect(3, 13, 10, 2, 'rgba(20,50,20,0.35)');
  c(5, 10, 3, SUMMER.grass.deep);
  c(10, 10, 3, SUMMER.grass.deep);
  c(8, 7, 4, SUMMER.grass.dark);
  c(7, 6, 2, SUMMER.grass.base);
  c(10, 8, 2, SUMMER.grass.base);
  d.px(6, 4, SUMMER.grass.blade).px(7, 4, SUMMER.grass.blade).px(10, 6, SUMMER.grass.blade);
  if (berries) d.px(5, 9, '#d8403a').px(10, 10, '#d8403a').px(8, 6, '#d8403a');
}

function rock(d: D, big: boolean) {
  const w = big ? 10 : 6;
  const h = big ? 7 : 4;
  const x0 = (T - w) >> 1;
  const y0 = T - h - 3;
  d.rect(x0, y0 + h, w, 2, 'rgba(20,50,20,0.35)');
  d.rect(x0 + 1, y0, w - 2, h, ROCK.face).rect(x0, y0 + 1, w, h - 1, ROCK.face);
  d.rect(x0 + 1, y0, w - 3, 2, ROCK.light).rect(x0 + 1, y0 + h - 1, w - 1, 1, ROCK.dark);
}

function stump(d: D) {
  d.rect(4, 12, 9, 2, 'rgba(20,50,20,0.35)');
  d.rect(5, 7, 7, 6, '#8a5a34').rect(5, 7, 7, 2, '#c8965c').rect(7, 8, 3, 1, '#a8744a').rect(11, 9, 1, 4, '#6c4428');
}

function mushrooms(d: D) {
  const m = (x: number, y: number) => d.rect(x, y, 3, 1, '#e0473f').px(x + 1, y, '#fff').rect(x + 1, y + 1, 1, 2, '#f1e3c8');
  m(4, 9);
  m(9, 11);
}

function reeds(d: D) {
  for (const x of [5, 7, 9, 11]) {
    const h = d.rng.int(5, 8);
    d.rect(x, 14 - h, 1, h, SUMMER.grass.dark).px(x, 13 - h, '#7b5a34');
  }
}

function defs(): Def[] {
  const out: Def[] = [
    { category: 'floor', role: 'floor_center', tags: ['grass', 'summer'], weight: 40, draw: (d) => meadow(d, 'plain') },
    { category: 'floor', role: 'floor_center', tags: ['grass', 'summer'], weight: 30, draw: (d) => meadow(d, 'blades') },
    { category: 'floor', role: 'floor_center', tags: ['grass', 'summer', 'flowers'], weight: 10, draw: (d) => meadow(d, 'flowers') },
    { category: 'floor', role: 'floor_center', tags: ['grass', 'summer'], weight: 12, draw: (d) => meadow(d, 'clover') },
    { category: 'floor', role: 'floor_center', tags: ['grass', 'summer', 'dark'], weight: 30, draw: (d) => meadow(d, 'dark') },
    { category: 'floor', role: 'raised_floor', tags: ['grass', 'summer'], draw: (d) => meadow(d, 'blades') },
  ];
  // paths: 15 corner shapes + two full variants
  // partial shapes carry no category: category pools (plain "Weg" / "Wasser") only get the full tile
  for (let m = 1; m <= 15; m++) out.push({ category: m === 15 ? 'path' : undefined, role: 'path_edge', tags: ['dirt', `c${m}`], collision: false, draw: (d) => dirt(d, m) });
  out.push({ category: 'path', role: 'path_edge', tags: ['dirt', 'c15'], weight: 40, collision: false, draw: (d) => dirt(d, 15) });
  // shores: 15 corner shapes + calm / rippled open water
  for (let m = 1; m <= 15; m++) out.push({ category: m === 15 ? 'water' : undefined, role: 'shore', tags: ['water', 'sand', `c${m}`], collision: true, draw: (d) => water(d, m, m === 15 ? 2 : 1) });
  out.push({ category: 'water', role: 'shore', tags: ['water', 'sand', 'c15'], weight: 60, collision: true, draw: (d) => water(d, 15, 0) });
  // grassy plateaus: rims on top, rock faces below
  out.push(
    { category: 'wallTop', role: 'cliff_top', tags: ['grass'], collision: false, draw: (d) => cliffRim(d, { n: true }) },
    { category: 'wallTop', role: 'cliff_bottom', tags: ['grass'], collision: false, draw: (d) => cliffRim(d, { s: true }) },
    { category: 'wallTop', role: 'cliff_left', tags: ['grass'], collision: false, draw: (d) => cliffRim(d, { w: true }) },
    { category: 'wallTop', role: 'cliff_right', tags: ['grass'], collision: false, draw: (d) => cliffRim(d, { e: true }) },
    { category: 'wallTop', role: 'cliff_outer_corner', tags: ['grass', 'left'], collision: false, draw: (d) => cliffRim(d, { n: true, w: true }) },
    { category: 'wallTop', role: 'cliff_outer_corner', tags: ['grass', 'right'], collision: false, draw: (d) => cliffRim(d, { n: true, e: true }) },
    { category: 'wallTop', role: 'cliff_inner_corner', tags: ['grass', 'left'], collision: false, draw: (d) => cliffRim(d, { s: true, w: true }) },
    { category: 'wallTop', role: 'cliff_inner_corner', tags: ['grass', 'right'], collision: false, draw: (d) => cliffRim(d, { s: true, e: true }) },
    { category: 'wallFront', role: 'cliff_front', tags: ['grass'], draw: (d) => cliffFace(d, false) },
    { category: 'wallFront', role: 'cliff_bottom', tags: ['grass', 'face'], draw: (d) => cliffFace(d, true) },
  );
  // plants and stones (deco on meadows: tag grass)
  out.push(
    { category: 'deco', tags: ['grass', 'bush'], weight: 40, collision: false, draw: (d) => bush(d, false) },
    { category: 'deco', tags: ['grass', 'bush'], weight: 15, collision: false, draw: (d) => bush(d, true) },
    { category: 'deco', tags: ['grass', 'stone'], weight: 25, collision: false, draw: (d) => rock(d, false) },
    { category: 'deco', tags: ['grass', 'stone'], weight: 10, collision: false, draw: (d) => rock(d, true) },
    { category: 'deco', tags: ['grass', 'wood'], weight: 10, collision: false, draw: (d) => stump(d) },
    { category: 'deco', tags: ['grass', 'moss'], weight: 12, collision: false, draw: (d) => mushrooms(d) },
    { category: 'deco', tags: ['grass', 'reeds'], weight: 8, collision: false, draw: (d) => reeds(d) },
  );
  // pools in dungeons and caves (stone rim); appended so older tiles keep their ids
  for (let m = 1; m <= 15; m++) out.push({ role: 'shore', tags: ['water', 'stone', `c${m}`], collision: true, draw: (d) => water(d, m, 1, POOL) });
  // single-cell puddles (c0), beach and stone rim
  out.push({ role: 'shore', tags: ['water', 'sand', 'c0'], collision: true, draw: (d) => water(d, 0, 0) });
  out.push({ role: 'shore', tags: ['water', 'stone', 'c0'], collision: true, draw: (d) => water(d, 0, 0, POOL) });
  // full stone-rimmed pool (c15) with glints
  out.push({ role: 'shore', tags: ['water', 'stone', 'c15'], weight: 60, collision: true, draw: (d) => water(d, 15, 2, POOL) });
  // v3.27, appended: grassy stone steps up a plateau (outdoors)
  out.push({ category: 'stairs', role: 'stairs', tags: ['grass'], collision: false, draw: (d) => steps(d) });
  return out;
}

export const DEMO_NATURE_ID = 'demo_nature';

export function createDemoNatureTileset(firstGid: number): Tileset {
  usePalette(SUMMER);
  return build(DEMO_NATURE_ID, 'Demo Natur', defs(), ['top_down', 'low_top_down', 'isometric_45', 'isometric'], firstGid, 8101);
}

/** snowy bush / rock / stump: the summer art with a white cap */
function snowCap(d: D, x0: number, x1: number, y: number) {
  for (let x = x0; x <= x1; x++) d.px(x, y + (x % 3 === 0 ? 1 : 0), '#ffffff').px(x, y + 1, '#e4eef6');
}
function iceCrystal(d: D) {
  d.rect(7, 5, 2, 9, '#9fd8f2').rect(4, 9, 2, 5, '#bfe8fa').rect(10, 8, 2, 6, '#bfe8fa').rect(7, 5, 1, 9, '#e6f7ff').rect(4, 14, 9, 1, 'rgba(60,90,120,0.3)');
}
function cactus(d: D) {
  d.rect(4, 14, 8, 1, 'rgba(90,60,20,0.3)');
  d.rect(7, 3, 3, 11, '#4f9a4c').rect(7, 3, 1, 11, '#6fbf5d');
  d.rect(3, 7, 2, 4, '#4f9a4c').rect(3, 10, 4, 2, '#4f9a4c');
  d.rect(12, 5, 2, 4, '#4f9a4c').rect(10, 8, 3, 2, '#4f9a4c');
}
function dryBush(d: D) {
  d.rect(3, 13, 10, 2, 'rgba(90,60,20,0.3)');
  for (const [x, y] of [[5, 8], [8, 6], [11, 8], [6, 11], [10, 11], [8, 9]]) d.rect(x, y, 2, 3, '#9a8a4a').px(x, y, '#b8a660');
  d.rect(7, 12, 2, 2, '#6e5a2e');
}
function bones(d: D) {
  d.rect(3, 12, 10, 2, '#efe6cf').rect(2, 11, 2, 4, '#efe6cf').rect(12, 11, 2, 4, '#efe6cf').rect(3, 14, 10, 1, '#c9bda0');
}

/** winter / desert: same shapes (paths, shores, plateaus, steps) in the climate's colours + its own plants */
function climateDefs(climate: 'winter' | 'desert'): Def[] {
  const t = (tags: string[]) => [...tags, climate];
  const out: Def[] = [
    { category: 'floor', role: 'floor_center', tags: t(['grass']), weight: 45, draw: (d) => meadow(d, 'plain') },
    { category: 'floor', role: 'floor_center', tags: t(['grass']), weight: 30, draw: (d) => meadow(d, 'blades') },
    { category: 'floor', role: 'floor_center', tags: t(['grass', 'dark']), weight: 25, draw: (d) => meadow(d, 'dark') },
    { category: 'floor', role: 'raised_floor', tags: t(['grass']), draw: (d) => meadow(d, 'blades') },
  ];
  for (let m = 1; m <= 15; m++) out.push({ category: m === 15 ? 'path' : undefined, role: 'path_edge', tags: t(['dirt', `c${m}`]), collision: false, draw: (d) => dirt(d, m) });
  for (let m = 0; m <= 15; m++) out.push({ category: m === 15 ? 'water' : undefined, role: 'shore', tags: t(['water', 'sand', `c${m}`]), collision: true, draw: (d) => water(d, m, m === 15 ? 2 : m === 0 ? 0 : 1) });
  out.push(
    { category: 'wallTop', role: 'cliff_top', tags: t(['grass']), collision: false, draw: (d) => cliffRim(d, { n: true }) },
    { category: 'wallTop', role: 'cliff_bottom', tags: t(['grass']), collision: false, draw: (d) => cliffRim(d, { s: true }) },
    { category: 'wallTop', role: 'cliff_left', tags: t(['grass']), collision: false, draw: (d) => cliffRim(d, { w: true }) },
    { category: 'wallTop', role: 'cliff_right', tags: t(['grass']), collision: false, draw: (d) => cliffRim(d, { e: true }) },
    { category: 'wallTop', role: 'cliff_outer_corner', tags: t(['grass', 'left']), collision: false, draw: (d) => cliffRim(d, { n: true, w: true }) },
    { category: 'wallTop', role: 'cliff_outer_corner', tags: t(['grass', 'right']), collision: false, draw: (d) => cliffRim(d, { n: true, e: true }) },
    { category: 'wallTop', role: 'cliff_inner_corner', tags: t(['grass', 'left']), collision: false, draw: (d) => cliffRim(d, { s: true, w: true }) },
    { category: 'wallTop', role: 'cliff_inner_corner', tags: t(['grass', 'right']), collision: false, draw: (d) => cliffRim(d, { s: true, e: true }) },
    { category: 'wallFront', role: 'cliff_front', tags: t(['grass']), draw: (d) => cliffFace(d, false) },
    { category: 'wallFront', role: 'cliff_bottom', tags: t(['grass', 'face']), draw: (d) => cliffFace(d, true) },
    { category: 'stairs', role: 'stairs', tags: t(['grass']), collision: false, draw: (d) => steps(d) },
  );
  const deco = (tags: string[], weight: number, draw: (d: D) => void): Def => ({ category: 'deco', tags: t(['grass', ...tags]), weight, collision: false, draw });
  if (climate === 'winter')
    out.push(
      deco(['bush'], 40, (d) => (bush(d, false), snowCap(d, 4, 12, 3))),
      deco(['stone'], 25, (d) => (rock(d, false), snowCap(d, 6, 10, 9))),
      deco(['stone'], 10, (d) => (rock(d, true), snowCap(d, 4, 12, 6))),
      deco(['wood'], 10, (d) => (stump(d), snowCap(d, 5, 11, 6))),
      deco(['ice'], 12, iceCrystal),
      deco(['reeds'], 8, reeds),
    );
  else
    out.push(
      deco(['bush'], 35, dryBush),
      deco(['cactus'], 30, cactus),
      deco(['stone'], 25, (d) => rock(d, false)),
      deco(['stone'], 10, (d) => rock(d, true)),
      deco(['bones'], 8, bones),
      deco(['reeds'], 10, reeds),
    );
  return out;
}

export const DEMO_NATURE_CLIMATE_IDS = { winter: 'demo_nature_winter', desert: 'demo_nature_desert' } as const;

export function createDemoNatureClimateTileset(climate: 'winter' | 'desert', firstGid: number): Tileset {
  usePalette(CLIMATES[climate]);
  const ts = build(DEMO_NATURE_CLIMATE_IDS[climate], climate === 'winter' ? 'Demo Natur Winter' : 'Demo Natur Wüste', climateDefs(climate), ['top_down', 'low_top_down', 'isometric_45', 'isometric'], firstGid, climate === 'winter' ? 8301 : 8401);
  usePalette(SUMMER);
  return ts;
}
