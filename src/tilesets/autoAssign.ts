import type { TileCategory, TileMeta, TileRole, Tileset } from '../types';
import { loadImage } from '../utils/image';
import { learnedSuggestions } from './learning';

// Automatic first guess for uploaded tilesets: every tile gets a category / role from its pixels.
// Results are suggestions (meta.auto = true) – the user reviews and corrects them in the inspector.
//
// Features per tile:
//  - alpha shape: which border bands are opaque (walls / corners drawn on transparency)
//  - mean colour (water / lava / abyss, floor material)
//  - thin border lines (outermost pixel row/column vs. interior): light lines face the floor on
//    wall pieces, dark lines frame floor edges; a light top + dark bottom marks a wall front
//  - corner dots: outer wall corners

export interface Guess {
  category: TileCategory;
  role?: TileRole;
  tags: string[];
}

type Side = 't' | 'b' | 'l' | 'r';
type Corner = 'tl' | 'tr' | 'bl' | 'br';

interface Features {
  coverage: number;
  /** opaque share of the outer quarter band per side */
  band: Record<Side, number>;
  centerCoverage: number;
  /** mean colour of opaque pixels, 0..1 */
  hsv: [number, number, number];
  /** mean luminance of the interior (≥ 3 px from the border at 16 px) */
  inner: number;
  /** thin border line: luminance of the outermost pixel row/column − interior (NaN = transparent) */
  line: Record<Side, number>;
  /** small corner patches − interior */
  dot: Record<Corner, number>;
  /** mean luminance of the upper half, lower half and lowest quarter (3/4 fronts falling into darkness) */
  topHalf: number;
  bottomHalf: number;
  bottomQuarter: number;
}

const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function features(data: Uint8ClampedArray, imgW: number, x0: number, y0: number, s: number): Features {
  const q = Math.max(1, Math.round(s / 4));
  const e = Math.max(1, Math.round(s / 16));
  const e3 = e * 3;
  const c0 = q;
  const c1 = s - q;
  // accumulators: [sum, count]
  const acc = () => [0, 0];
  const line = { t: acc(), b: acc(), l: acc(), r: acc() };
  const dot = { tl: acc(), tr: acc(), bl: acc(), br: acc() };
  const inner = acc();
  const halves = { top: acc(), bottom: acc(), low: acc() };
  const band = { t: 0, b: 0, l: 0, r: 0 };
  let opaque = 0;
  let centerOpaque = 0;
  let sr = 0,
    sg = 0,
    sb = 0;
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      const i = ((y0 + y) * imgW + x0 + x) * 4;
      if (data[i + 3] < 128) continue;
      opaque++;
      const r = data[i] / 255,
        g = data[i + 1] / 255,
        b = data[i + 2] / 255;
      const L = lum(r, g, b);
      sr += r;
      sg += g;
      sb += b;
      if (y < q) band.t++;
      if (y >= s - q) band.b++;
      if (x < q) band.l++;
      if (x >= s - q) band.r++;
      if (x >= c0 && x < c1 && y >= c0 && y < c1) centerOpaque++;
      const add = (a: number[]) => ((a[0] += L), a[1]++);
      if (x >= e3 && x < s - e3 && y >= e3 && y < s - e3) add(inner);
      add(y < s / 2 ? halves.top : halves.bottom);
      if (y >= (s * 3) / 4) add(halves.low);
      // lines exclude the corners so a corner dot does not count as a line
      if (x >= e && x < s - e) {
        if (y < e) add(line.t);
        if (y >= s - e) add(line.b);
      }
      if (y >= e && y < s - e) {
        if (x < e) add(line.l);
        if (x >= s - e) add(line.r);
      }
      if (y < e && x < e) add(dot.tl);
      if (y < e && x >= s - e) add(dot.tr);
      if (y >= s - e && x < e) add(dot.bl);
      if (y >= s - e && x >= s - e) add(dot.br);
    }
  const mean = (a: number[]) => (a[1] ? a[0] / a[1] : NaN);
  const inn = mean(inner);
  const rel = (a: number[]) => mean(a) - inn;
  const bandArea = q * s;
  return {
    coverage: opaque / (s * s),
    band: { t: band.t / bandArea, b: band.b / bandArea, l: band.l / bandArea, r: band.r / bandArea },
    centerCoverage: centerOpaque / ((c1 - c0) * (c1 - c0)),
    hsv: opaque ? rgbToHsv(sr / opaque, sg / opaque, sb / opaque) : [0, 0, 0],
    inner: inn,
    line: { t: rel(line.t), b: rel(line.b), l: rel(line.l), r: rel(line.r) },
    dot: { tl: rel(dot.tl), tr: rel(dot.tr), bl: rel(dot.bl), br: rel(dot.br) },
    topHalf: mean(halves.top),
    bottomHalf: mean(halves.bottom),
    bottomQuarter: mean(halves.low),
  };
}

/** Material tag from the mean colour (feeds the terrain sets). */
function materialTag([h, s, v]: [number, number, number]): string {
  if (v < 0.18) return 'dark';
  if (s < 0.16) return 'stone';
  if (h >= 70 && h < 170) return 'grass';
  if (h >= 40 && h < 70) return 'sand';
  if (h >= 15 && h < 40) return s > 0.45 && v > 0.55 ? 'sand' : 'wood';
  return 'stone';
}

// wall pieces: light border lines face the floor
const WALL_BY_LINES: Record<string, [TileCategory, TileRole]> = {
  b: ['wallTop', 'wall_top'],
  t: ['wallBottom', 'wall_bottom'],
  r: ['wallLeft', 'wall_left'],
  l: ['wallRight', 'wall_right'],
  tb: ['wallTop', 'wall_horizontal'],
  lr: ['wallLeft', 'wall_vertical'],
  tl: ['innerCorner', 'inner_corner_top_left'],
  tr: ['innerCorner', 'inner_corner_top_right'],
  bl: ['innerCorner', 'inner_corner_bottom_left'],
  br: ['innerCorner', 'inner_corner_bottom_right'],
  tlr: ['wallTop', 'end_cap_top'],
  blr: ['wallTop', 'end_cap_bottom'],
  tbl: ['wallTop', 'end_cap_left'],
  tbr: ['wallTop', 'end_cap_right'],
  tblr: ['wallTop', 'junction_cross'],
};
// outer corner: only a light dot in the corner diagonal to the floor
const CORNER_BY_DOT: Record<Corner, TileRole> = { br: 'corner_top_left', bl: 'corner_top_right', tr: 'corner_bottom_left', tl: 'corner_bottom_right' };

function classify(f: Features): Guess | null {
  const [h, sat, val] = f.hsv;
  const on = (x: number) => x > 0.6;
  const off = (x: number) => x < 0.25;

  // --- tiles drawn on transparency: shape decides (thin transparent margins count as full tiles) ---
  if (f.coverage < 0.8) {
    const { t, b, l, r } = f.band;
    // bridge: solid in the middle, open along two opposite sides
    if (f.coverage > 0.55 && f.centerCoverage > 0.9 && ((off(l) && off(r) && on(t) && on(b)) || (off(t) && off(b) && on(l) && on(r)) || (Number.isNaN(f.line.l) && Number.isNaN(f.line.r)) || (Number.isNaN(f.line.t) && Number.isNaN(f.line.b))))
      return { category: 'bridge', role: 'bridge_middle', tags: [] };
    const hollow = f.centerCoverage < 0.35;
    if (hollow) {
      const sides = `${on(t) ? 't' : ''}${on(b) ? 'b' : ''}${on(l) ? 'l' : ''}${on(r) ? 'r' : ''}`;
      if (sides === 'tl' && off(b) && off(r)) return { category: 'outerCorner', role: 'corner_top_left', tags: [] };
      if (sides === 'tr' && off(b) && off(l)) return { category: 'outerCorner', role: 'corner_top_right', tags: [] };
      if (sides === 'bl' && off(t) && off(r)) return { category: 'outerCorner', role: 'corner_bottom_left', tags: [] };
      if (sides === 'br' && off(t) && off(l)) return { category: 'outerCorner', role: 'corner_bottom_right', tags: [] };
      if (sides === 't') return { category: 'wallTop', role: 'wall_top', tags: [] };
      if (sides === 'b') return { category: 'wallBottom', role: 'wall_bottom', tags: [] };
      if (sides === 'l') return { category: 'wallLeft', role: 'wall_left', tags: [] };
      if (sides === 'r') return { category: 'wallRight', role: 'wall_right', tags: [] };
      if (sides === 'tb') return { category: 'wallTop', role: 'wall_horizontal', tags: [] };
      if (sides === 'lr') return { category: 'wallLeft', role: 'wall_vertical', tags: [] };
    }
    // compact object in the middle
    if (f.coverage < 0.5 && f.centerCoverage > Math.max(t, b, l, r)) return { category: 'deco', tags: [] };
    if (f.coverage >= 0.5) return { category: 'obstacle', tags: [] };
    return { category: 'deco', tags: [] };
  }

  // --- full tiles: colour first ---
  if (val < 0.09 || f.inner < 0.06) return { category: 'abyss', role: 'abyss', tags: [] };
  if (h >= 180 && h <= 250 && sat > 0.35 && val > 0.25) return { category: 'water', role: 'water', tags: [] };
  if ((h <= 35 || h >= 345) && sat > 0.55 && val > 0.5) return { category: 'lava', role: 'lava', tags: [] };

  const sides: Side[] = ['t', 'b', 'l', 'r'];
  const L = f.line;
  // walls: light thin lines on the sides that face the floor
  const light = sides.filter((k) => L[k] >= 0.15).join('');
  if (light && WALL_BY_LINES[light]) {
    const [category, role] = WALL_BY_LINES[light];
    return { category, role, tags: [] };
  }
  const quiet = sides.every((k) => Number.isNaN(L[k]) || Math.abs(L[k]) < 0.1);
  if (quiet) {
    const dots = (Object.keys(f.dot) as Corner[]).filter((k) => f.dot[k] >= 0.15);
    if (dots.length === 1) return { category: 'outerCorner', role: CORNER_BY_DOT[dots[0]], tags: [] };
    // plain dark block: wall fill / cap
    if (f.inner < 0.13) return { category: 'wallTop', role: 'junction_cross', tags: [] };
  }
  // 3/4 wall front dropping into darkness (pit / shadow below): light upper part, very dark bottom
  if (f.topHalf - f.bottomHalf >= 0.1 && f.bottomQuarter < 0.12) return { category: 'wallFront', role: 'wall_front', tags: [] };
  // wall front: highlight along the top edge, shadow along the bottom (or a dark mortar band top and bottom)
  if (L.t - L.b >= 0.17 || (L.t <= -0.1 && L.b <= -0.1 && Math.abs(L.l) < 0.06 && Math.abs(L.r) < 0.06))
    return { category: 'wallFront', role: 'wall_front', tags: [] };

  // wooden bridge: plank colour with rails / open margins on two opposite sides
  const rail = (k: Side) => Number.isNaN(L[k]) || L[k] >= 0.05;
  if (h >= 15 && h < 45 && sat > 0.3 && ((rail('t') && rail('b')) || (rail('l') && rail('r'))))
    return { category: 'bridge', role: 'bridge_middle', tags: [] };

  // floor, possibly with a darker border line
  const tag = materialTag(f.hsv);
  const dark = sides.filter((k) => L[k] <= -0.12);
  if (dark.length === 1) {
    const role: TileRole = dark[0] === 't' ? 'floor_edge_top' : dark[0] === 'b' ? 'floor_edge_bottom' : dark[0] === 'l' ? 'floor_edge_left' : 'floor_edge_right';
    return { category: 'floor', role, tags: [tag, 'edge'] };
  }
  if (dark.length === 2 && dark.some((k) => k === 't' || k === 'b') && dark.some((k) => k === 'l' || k === 'r'))
    return { category: 'floor', role: 'floor_corner', tags: [tag, 'edge'] };
  return { category: 'floor', role: 'floor_center', tags: [tag] };
}

/**
 * Suggests metas for all non-empty tiles. Tiles that already have a category or role
 * are left alone unless `overwrite` is set.
 */
export async function autoAssign(ts: Pick<Tileset, 'dataUrl' | 'tileSize' | 'columns' | 'rows' | 'emptyTiles' | 'tiles'>, overwrite = false): Promise<Record<number, TileMeta>> {
  const img = await loadImage(ts.dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const empty = new Set(ts.emptyTiles);
  const out: Record<number, TileMeta> = {};
  const floors: { i: number; hsv: [number, number, number] }[] = [];
  for (let i = 0; i < ts.columns * ts.rows; i++) {
    if (empty.has(i)) continue;
    const cur = ts.tiles[i];
    if (!overwrite && (cur?.category || cur?.role)) continue;
    const f = features(data, canvas.width, (i % ts.columns) * ts.tileSize, Math.floor(i / ts.columns) * ts.tileSize, ts.tileSize);
    const g = classify(f);
    if (!g) continue;
    const keep = (cur?.tags ?? []).filter((t) => !['stone', 'grass', 'sand', 'wood', 'dark', 'edge'].includes(t));
    out[i] = { ...(cur ?? { weight: 50 }), category: g.category, role: g.role, tags: [...new Set([...keep, ...g.tags])], weight: cur?.weight ?? 50, auto: true };
    if (g.role === 'floor_center') floors.push({ i, hsv: f.hsv });
  }
  // the most common floor colour is the main floor, rarer looks become variants of it
  if (floors.length > 2) {
    const key = (h: [number, number, number]) => `${Math.round(h[0] / 30)}:${Math.round(h[1] * 4)}:${Math.round(h[2] * 5)}`;
    const groups = new Map<string, number[]>();
    for (const f of floors) groups.set(key(f.hsv), [...(groups.get(key(f.hsv)) ?? []), f.i]);
    const sizes = [...groups.values()].sort((a, b) => b.length - a.length);
    const main = sizes[0].length;
    for (const g of sizes.slice(1)) if (g.length * 4 <= main) for (const i of g) out[i] = { ...out[i], weight: 15, tags: [...out[i].tags, 'variant'] };
  }
  // what the user taught the app wins over the rules (see learning.ts)
  const learned = await learnedSuggestions({ ...ts, tiles: { ...ts.tiles, ...out } });
  for (const [k, m] of Object.entries(learned)) {
    const i = Number(k);
    if (!overwrite && ts.tiles[i] && !ts.tiles[i].auto && (ts.tiles[i].category || ts.tiles[i].role)) continue;
    const keep = (out[i]?.tags ?? []).filter((t) => ['stone', 'grass', 'sand', 'wood', 'dark'].includes(t));
    out[i] = { ...m, tags: [...new Set([...keep, 'learned'])] };
  }
  return out;
}

/** Short label shown on a tile, e.g. "Boden", "Wand ↑", "Ecke ┌". */
const ROLE_SHORT: Partial<Record<TileRole, string>> = {
  floor_center: 'Boden',
  floor_edge_top: 'Rand ↑',
  floor_edge_bottom: 'Rand ↓',
  floor_edge_left: 'Rand ←',
  floor_edge_right: 'Rand →',
  floor_corner: 'Randecke',
  wall_horizontal: 'Wand ─',
  wall_vertical: 'Wand │',
  wall_top: 'Wand ↑',
  wall_bottom: 'Wand ↓',
  wall_left: 'Wand ←',
  wall_right: 'Wand →',
  corner_top_left: 'Ecke ┌',
  corner_top_right: 'Ecke ┐',
  corner_bottom_left: 'Ecke └',
  corner_bottom_right: 'Ecke ┘',
  inner_corner_top_left: 'Innen ┌',
  inner_corner_top_right: 'Innen ┐',
  inner_corner_bottom_left: 'Innen └',
  inner_corner_bottom_right: 'Innen ┘',
  end_cap_top: 'Ende ↑',
  end_cap_bottom: 'Ende ↓',
  end_cap_left: 'Ende ←',
  end_cap_right: 'Ende →',
  junction_t_up: 'T ↑',
  junction_t_down: 'T ↓',
  junction_t_left: 'T ←',
  junction_t_right: 'T →',
  junction_cross: 'Kreuz',
  wall_front: 'Front',
  wall_front_upper: 'Front ↑',
  door: 'Tür',
  door_frame_left: 'Rahmen ←',
  door_frame_right: 'Rahmen →',
  bridge_start: 'Brücke',
  bridge_middle: 'Brücke',
  bridge_end: 'Brücke',
  bridge_left: 'Brücke',
  bridge_right: 'Brücke',
  cliff_top: 'Klippe ↑',
  cliff_front: 'Klippe',
  cliff_left: 'Klippe ←',
  cliff_right: 'Klippe →',
  cliff_inner_corner: 'Klippe ┘',
  cliff_outer_corner: 'Klippe ┌',
  cliff_bottom: 'Klippe ↓',
  cliff_shadow: 'Schatten',
  stairs: 'Treppe',
  water: 'Wasser',
  lava: 'Lava',
  abyss: 'Abgrund',
  abyss_edge: 'Abgrund',
  raised_floor: 'Erhöht',
  transition: 'Übergang',
  shadow: 'Schatten',
  ground_top: 'Gras ↑',
  ground_top_left: 'Gras ┌',
  ground_top_right: 'Gras ┐',
  ground_left: 'Erde ←',
  ground_right: 'Erde →',
  ground_bottom: 'Erde ↓',
  ground_inner_left: 'Erde ┘',
  ground_inner_right: 'Erde └',
  ground_fill: 'Erde',
  platform: 'Plattform',
  platform_left: 'Plattf. ←',
  platform_right: 'Plattf. →',
  ladder: 'Leiter',
  spikes: 'Stacheln',
  back_wall: 'Hintergrund',
};

const CATEGORY_SHORT: Record<TileCategory, string> = {
  floor: 'Boden',
  floorVariant: 'Variante',
  path: 'Weg',
  wallTop: 'Wand ↑',
  wallBottom: 'Wand ↓',
  wallLeft: 'Wand ←',
  wallRight: 'Wand →',
  wallFront: 'Front',
  innerCorner: 'Innenecke',
  outerCorner: 'Ecke',
  door: 'Tür',
  water: 'Wasser',
  lava: 'Lava',
  abyss: 'Abgrund',
  deco: 'Deko',
  obstacle: 'Hindernis',
  bridge: 'Brücke',
  pillar: 'Säule',
  stairs: 'Treppe',
  transition: 'Übergang',
  spawn: 'Spawn',
  special: 'Spezial',
  shadow: 'Schatten',
};

export type LabelGroup = 'floor' | 'wall' | 'liquid' | 'passage' | 'object' | 'other';

const GROUP_OF: Record<TileCategory, LabelGroup> = {
  floor: 'floor',
  floorVariant: 'floor',
  path: 'floor',
  transition: 'floor',
  wallTop: 'wall',
  wallBottom: 'wall',
  wallLeft: 'wall',
  wallRight: 'wall',
  wallFront: 'wall',
  innerCorner: 'wall',
  outerCorner: 'wall',
  water: 'liquid',
  lava: 'liquid',
  abyss: 'liquid',
  door: 'passage',
  bridge: 'passage',
  stairs: 'passage',
  deco: 'object',
  obstacle: 'object',
  pillar: 'object',
  spawn: 'other',
  special: 'other',
  shadow: 'other',
};

function groupOfRole(role: TileRole): LabelGroup {
  if (role.startsWith('floor') || role === 'raised_floor' || role === 'transition') return 'floor';
  if (role === 'water' || role === 'lava' || role.startsWith('abyss')) return 'liquid';
  if (role === 'door' || role.startsWith('bridge') || role === 'stairs') return 'passage';
  if (role === 'shadow' || role === 'cliff_shadow') return 'other';
  return 'wall';
}

export function tileLabel(meta: TileMeta | undefined): { text: string; group: LabelGroup; auto: boolean } | null {
  if (!meta || (!meta.role && !meta.category)) return null;
  const text = (meta.role && ROLE_SHORT[meta.role]) || (meta.category && CATEGORY_SHORT[meta.category]) || meta.role || '';
  const group = meta.role ? groupOfRole(meta.role) : GROUP_OF[meta.category!];
  return { text, group, auto: !!meta.auto };
}
