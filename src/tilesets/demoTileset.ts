import type { Perspective, TileCategory, TileMeta, Tileset } from '../types';
import { Rng } from '../generator/rng';

// Built-in pixel-art demo tileset, drawn procedurally at 16×16 px.
// Being generated in code keeps the bundle tiny and the result deterministic.

const T = 16;
const COLS = 8;
const ROWS = 6;

type Ctx = CanvasRenderingContext2D;

interface TileDef {
  draw: (d: Draw) => void;
  category?: TileCategory;
  weight?: number;
  tags?: string[];
}

class Draw {
  constructor(
    private ctx: Ctx,
    private ox: number,
    private oy: number,
    public rng: Rng,
  ) {}
  rect(x: number, y: number, w: number, h: number, c: string) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(this.ox + x, this.oy + y, w, h);
  }
  px(x: number, y: number, c: string) {
    this.rect(x, y, 1, 1, c);
  }
  speckle(colors: string[], density: number, x0 = 0, y0 = 0, w = T, h = T) {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) if (this.rng.chance(density)) this.px(x, y, this.rng.pick(colors));
  }
  circle(cx: number, cy: number, r: number, c: string) {
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.px(x, y, c);
  }
  ring(cx: number, cy: number, r: number, t: number, c: string) {
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const d = Math.sqrt((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2);
        if (d <= r && d > r - t) this.px(x, y, c);
      }
  }
}

const STONE = { base: '#3b3641', light: '#47414e', dark: '#2d2932', mortar: '#241f28', hi: '#524b5a' };
const DARK = { base: '#2a262f', light: '#332e39', dark: '#211d25', mortar: '#1a171e', hi: '#3b3542' };

function slabs(d: Draw, p: typeof STONE) {
  d.rect(0, 0, T, T, p.base);
  d.speckle([p.light, p.dark], 0.16);
  // 2×2 offset slabs
  d.rect(0, 7, T, 1, p.mortar);
  d.rect(0, 15, T, 1, p.mortar);
  d.rect(7, 0, 1, 7, p.mortar);
  d.rect(3, 8, 1, 7, p.mortar);
  d.rect(11, 8, 1, 7, p.mortar);
  d.rect(15, 0, 1, 7, p.mortar);
  // bevel highlights
  d.rect(0, 0, 7, 1, p.hi);
  d.rect(8, 0, 7, 1, p.hi);
  d.rect(4, 8, 7, 1, p.hi);
  d.rect(12, 8, 3, 1, p.hi);
  d.rect(0, 8, 3, 1, p.hi);
}

function cobble(d: Draw, dense: boolean) {
  d.rect(0, 0, T, T, '#3a2f27');
  const stones = dense
    ? [
        [0, 0, 5, 4], [6, 0, 5, 3], [12, 0, 4, 4], [0, 5, 3, 5], [4, 4, 6, 4], [11, 5, 5, 4],
        [4, 9, 4, 4], [9, 10, 6, 5], [0, 11, 3, 5], [4, 14, 4, 2],
      ]
    : [
        [0, 0, 7, 5], [8, 0, 8, 4], [0, 6, 5, 5], [6, 5, 5, 6], [12, 5, 4, 6], [0, 12, 8, 4], [9, 12, 7, 4],
      ];
  for (const [x, y, w, h] of stones) {
    d.rect(x, y, w, h, '#5b4a3b');
    d.rect(x, y, w, 1, '#6e5a47');
    d.rect(x, y + h - 1, w, 1, '#4a3c30');
  }
  d.speckle(['#6e5a47', '#43372c'], 0.06);
}

function wallCap(d: Draw) {
  d.rect(0, 0, T, T, '#1f1b23');
  d.speckle(['#27222c', '#1a171d'], 0.2);
}

function bricks(d: Draw, broken: boolean) {
  // cap
  d.rect(0, 0, T, 4, '#1f1b23');
  d.speckle(['#27222c'], 0.25, 0, 0, T, 4);
  d.rect(0, 4, T, 1, '#5e5667');
  // face
  d.rect(0, 5, T, 11, '#4a4351');
  const rows = [5, 9, 13];
  rows.forEach((y, r) => {
    d.rect(0, y + 3, T, 1, '#2e2934');
    const off = r % 2 ? 4 : 0;
    for (let x = off; x < T; x += 8) d.rect(x, y, 1, 3, '#2e2934');
    d.rect(0, y, T, 1, '#554d5d');
  });
  d.speckle(['#554d5d', '#3f3946'], 0.08, 0, 5, T, 10);
  d.rect(0, 15, T, 1, '#1b181f');
  if (broken) {
    d.rect(9, 6, 4, 3, '#2a2530');
    d.rect(10, 9, 2, 2, '#2a2530');
    d.px(8, 10, '#2a2530');
    d.px(3, 12, '#2e2934');
    d.px(4, 13, '#2e2934');
    d.px(4, 14, '#2e2934');
  }
}

/** Full-height brick wall face (front of a wall in 3/4 perspectives). */
function brickFace(d: Draw, opts: { base: boolean; broken?: boolean; capEdge?: boolean }) {
  d.rect(0, 0, T, T, '#4a4351');
  for (let r = 0; r < 4; r++) {
    const y = r * 4;
    d.rect(0, y + 3, T, 1, '#2e2934');
    const off = r % 2 ? 4 : 0;
    for (let x = off; x < T; x += 8) d.rect(x, y, 1, 3, '#2e2934');
    d.rect(0, y, T, 1, '#554d5d');
  }
  d.speckle(['#554d5d', '#3f3946'], 0.08);
  if (opts.capEdge) d.rect(0, 0, T, 1, '#6a6273');
  if (opts.base) {
    d.rect(0, 14, T, 2, '#2a2530');
    d.rect(0, 15, T, 1, '#1b181f');
  }
  if (opts.broken) {
    d.rect(9, 2, 4, 3, '#2a2530');
    d.rect(10, 5, 2, 2, '#2a2530');
    d.px(3, 9, '#2e2934');
    d.px(4, 10, '#2e2934');
  }
}

/** Visible side face of a wall (45° view): brick strip along one edge. */
function sideFace(d: Draw, side: 'left' | 'right') {
  wallCap(d);
  const x0 = side === 'left' ? 0 : T - 6;
  d.rect(x0, 0, 6, T, '#3f3946');
  for (let y = 0; y < T; y += 4) d.rect(x0, y + 3, 6, 1, '#2a2530');
  d.rect(side === 'left' ? 5 : T - 6, 0, 1, T, '#5e5667');
}

/** Soft shadow gradient cast by a wall. */
function shadow(d: Draw, dir: 'top' | 'left' | 'corner') {
  for (let i = 0; i < 7; i++) {
    const a = (0.34 * (1 - i / 7)).toFixed(3);
    const c = `rgba(8,6,12,${a})`;
    if (dir === 'top' || dir === 'corner') d.rect(0, i, T, 1, c);
    if (dir === 'left' || dir === 'corner') d.rect(i, dir === 'corner' ? 7 : 0, 1, dir === 'corner' ? T - 7 : T, c);
  }
}

function ledge(d: Draw, side: 'top' | 'bottom' | 'left' | 'right') {
  wallCap(d);
  const hi = '#5e5667';
  const mid = '#3d3744';
  if (side === 'top') {
    d.rect(0, 0, T, 2, mid);
    d.rect(0, 0, T, 1, hi);
  } else if (side === 'bottom') {
    d.rect(0, T - 2, T, 2, mid);
    d.rect(0, T - 1, T, 1, hi);
  } else if (side === 'left') {
    d.rect(0, 0, 2, T, mid);
    d.rect(0, 0, 1, T, hi);
  } else {
    d.rect(T - 2, 0, 2, T, mid);
    d.rect(T - 1, 0, 1, T, hi);
  }
}

const DEFS: (TileDef | null)[] = [
  // row 0 – ground
  { draw: (d) => slabs(d, STONE), category: 'floor', weight: 70, tags: ['stone', 'clean', 'dungeon'] },
  {
    draw: (d) => {
      slabs(d, STONE);
      const c = '#1f1b23';
      [[2, 2], [3, 3], [4, 3], [5, 4], [5, 5], [6, 6], [9, 9], [10, 10], [10, 11], [11, 12], [12, 12]].forEach(([x, y]) => d.px(x, y, c));
    },
    category: 'floor',
    weight: 20,
    tags: ['stone', 'broken', 'dungeon'],
  },
  { draw: (d) => slabs(d, DARK), category: 'floor', weight: 10, tags: ['stone', 'dark', 'dungeon'] },
  {
    draw: (d) => {
      slabs(d, STONE);
      d.speckle(['#4c5a3d', '#5b6c47', '#3f4b33'], 0.22, 0, 0, 9, 9);
      d.speckle(['#4c5a3d', '#5b6c47'], 0.12, 8, 8, 8, 8);
    },
    category: 'floorVariant',
    weight: 100,
    tags: ['stone', 'moss'],
  },
  { draw: (d) => cobble(d, false), category: 'path', weight: 60, tags: ['stone'] },
  { draw: (d) => cobble(d, true), category: 'path', weight: 40, tags: ['stone', 'broken'] },
  {
    draw: (d) => {
      d.rect(0, 0, T, T, '#0b0a0d');
      for (let y = 1; y < T; y += 3) {
        d.rect(2, y, 12, 2, '#6d5037');
        d.rect(2, y, 12, 1, '#80613f');
      }
      d.rect(1, 0, 1, T, '#8c7a5c');
      d.rect(14, 0, 1, T, '#8c7a5c');
    },
    category: 'bridge',
    weight: 100,
    tags: ['wood'],
  },
  {
    draw: (d) => {
      const shades = ['#57505f', '#4a4351', '#3d3744', '#302b36', '#241f28'];
      shades.forEach((c, i) => {
        d.rect(0, i * 3, T, 3, c);
        d.rect(0, i * 3, T, 1, i === 0 ? '#6a6273' : shades[Math.max(0, i - 1)]);
      });
      d.rect(0, 15, T, 1, '#141216');
      d.rect(0, 0, 1, T, '#1f1b23');
      d.rect(15, 0, 1, T, '#1f1b23');
    },
    category: 'stairs',
    weight: 100,
    tags: ['stone'],
  },
  // row 1 – walls
  { draw: (d) => ledge(d, 'bottom'), category: 'wallTop', weight: 100, tags: ['stone', 'dungeon'] },
  { draw: (d) => ledge(d, 'top'), category: 'wallBottom', weight: 100, tags: ['stone'] },
  { draw: (d) => ledge(d, 'right'), category: 'wallLeft', weight: 100, tags: ['stone'] },
  { draw: (d) => ledge(d, 'left'), category: 'wallRight', weight: 100, tags: ['stone'] },
  {
    draw: (d) => {
      wallCap(d);
      d.rect(0, 0, 2, 2, '#3d3744');
      d.px(0, 0, '#5e5667');
    },
    category: 'innerCorner',
    weight: 100,
    tags: ['stone'],
  },
  {
    draw: (d) => wallCap(d),
    category: 'outerCorner',
    weight: 100,
    tags: ['stone'],
  },
  { draw: (d) => bricks(d, true), category: 'wallFront', weight: 20, tags: ['stone', 'broken'] },
  {
    draw: (d) => {
      d.rect(0, 0, T, T, '#2a2530');
      d.rect(1, 1, 14, 15, '#57505f');
      d.rect(3, 3, 10, 13, '#5c3f28');
      for (let x = 5; x < 13; x += 3) d.rect(x, 3, 1, 13, '#48301e');
      d.rect(3, 3, 10, 1, '#6f4d31');
      d.rect(3, 8, 10, 1, '#3e2a1b');
      d.rect(10, 9, 2, 2, '#d8b45a');
      d.px(10, 9, '#f2d58a');
    },
    category: 'door',
    weight: 100,
    tags: ['wood'],
  },
  // row 2 – terrain & objects
  {
    draw: (d) => {
      d.rect(0, 0, T, T, '#1e4654');
      d.speckle(['#245364', '#1a3d49'], 0.3);
      [[1, 3, 5], [8, 6, 6], [3, 11, 5], [10, 13, 4]].forEach(([x, y, w]) => {
        d.rect(x, y, w, 1, '#3d7f92');
        d.px(x + 1, y - 1, '#5aa2b3');
      });
    },
    category: 'water',
    weight: 100,
    tags: ['water'],
  },
  {
    draw: (d) => {
      d.rect(0, 0, T, T, '#b3401f');
      d.speckle(['#c9531f', '#9c351a'], 0.35);
      [[2, 2, 4, 3], [9, 4, 5, 3], [4, 10, 5, 3], [11, 12, 3, 2]].forEach(([x, y, w, h]) => {
        d.rect(x, y, w, h, '#e3762b');
        d.rect(x + 1, y + 1, Math.max(1, w - 2), Math.max(1, h - 2), '#f4ae4b');
      });
      d.speckle(['#6e2412'], 0.05);
    },
    category: 'lava',
    weight: 100,
    tags: ['lava', 'hot'],
  },
  {
    draw: (d) => {
      d.rect(0, 0, T, T, '#08070a');
      d.speckle(['#110f15', '#0d0b10'], 0.3);
      d.rect(0, 0, T, 1, '#1a1720');
    },
    category: 'abyss',
    weight: 100,
    tags: ['dark'],
  },
  {
    draw: (d) => {
      d.circle(8.5, 9.5, 6.5, 'rgba(0,0,0,0.35)');
      d.circle(8, 8, 6, '#4f4857');
      d.circle(7.5, 7.5, 4.5, '#5f5768');
      d.circle(6.5, 6.5, 2, '#72697c');
      d.ring(8, 8, 6, 1, '#2b2731');
    },
    category: 'pillar',
    weight: 100,
    tags: ['stone'],
  },
  {
    draw: (d) => {
      d.circle(9, 11, 5.5, 'rgba(0,0,0,0.35)');
      d.circle(8, 9, 5.5, '#5a5360');
      d.circle(7, 8, 3.5, '#6b6372');
      d.px(5, 6, '#857c8c');
      d.px(6, 6, '#857c8c');
      d.px(10, 11, '#3f3945');
      d.px(11, 10, '#3f3945');
    },
    category: 'obstacle',
    weight: 60,
    tags: ['stone'],
  },
  {
    draw: (d) => {
      d.rect(3, 4, 11, 11, 'rgba(0,0,0,0.35)');
      d.rect(2, 2, 11, 11, '#6b4b30');
      d.rect(2, 2, 11, 1, '#86603d');
      d.rect(2, 12, 11, 1, '#4a3320');
      d.rect(2, 2, 1, 11, '#4a3320');
      d.rect(12, 2, 1, 11, '#4a3320');
      for (let i = 0; i < 9; i++) d.px(3 + i, 3 + i, '#553a24');
    },
    category: 'obstacle',
    weight: 40,
    tags: ['wood'],
  },
  {
    draw: (d) => {
      const b = '#cbc2b3';
      const s = '#8f877b';
      d.rect(3, 9, 7, 1, b);
      d.px(2, 8, b);
      d.px(2, 10, b);
      d.px(10, 8, b);
      d.px(10, 10, b);
      d.rect(9, 4, 1, 4, b);
      d.px(8, 3, b);
      d.px(10, 3, b);
      d.rect(3, 10, 7, 1, s);
    },
    category: 'deco',
    weight: 30,
    tags: ['bones'],
  },
  {
    draw: (d) => {
      const g = ['#5b7a45', '#6c8f51', '#4a653a'];
      [[4, 9], [6, 7], [8, 8], [10, 6], [12, 9]].forEach(([x, y], i) => {
        d.rect(x, y, 1, 13 - y, g[i % 3]);
      });
      d.px(5, 10, g[1]);
      d.px(9, 9, g[0]);
    },
    category: 'deco',
    weight: 40,
    tags: ['moss'],
  },
  // row 3 – deco & gameplay markers
  {
    draw: (d) => {
      const c = '#d6cdbd';
      d.rect(5, 5, 6, 5, c);
      d.rect(6, 10, 4, 2, c);
      d.rect(6, 7, 1, 2, '#1c1a1f');
      d.rect(9, 7, 1, 2, '#1c1a1f');
      d.px(7, 11, '#8f877b');
      d.px(8, 11, '#8f877b');
      d.rect(5, 12, 6, 1, 'rgba(0,0,0,0.3)');
    },
    category: 'deco',
    weight: 15,
    tags: ['bones', 'dark'],
  },
  {
    draw: (d) => {
      d.circle(8, 8, 5, 'rgba(240,190,90,0.12)');
      d.rect(7, 8, 2, 5, '#e6dcc4');
      d.rect(6, 13, 4, 1, '#8f877b');
      d.px(8, 7, '#1c1a1f');
      d.rect(7, 4, 2, 3, '#f0a93e');
      d.px(7, 5, '#fbe19a');
      d.px(8, 3, '#f0a93e');
    },
    category: 'deco',
    weight: 15,
    tags: ['light'],
  },
  {
    draw: (d) => {
      d.rect(2, 5, 12, 9, 'rgba(0,0,0,0.35)');
      d.rect(2, 4, 12, 9, '#7a4e2a');
      d.rect(2, 4, 12, 3, '#945f33');
      d.rect(2, 7, 12, 1, '#c79a3d');
      d.rect(2, 4, 1, 9, '#c79a3d');
      d.rect(13, 4, 1, 9, '#c79a3d');
      d.rect(7, 7, 2, 2, '#f2d27a');
    },
    category: 'special',
    weight: 100,
    tags: ['treasure', 'loot'],
  },
  {
    draw: (d) => {
      d.ring(8, 8, 7, 1.5, '#7fc59a');
      d.circle(8, 8, 2.5, '#7fc59a');
    },
    category: 'spawn',
    weight: 100,
    tags: ['player'],
  },
  {
    draw: (d) => {
      d.ring(8, 8, 7, 1.5, '#d0616b');
      d.rect(5, 5, 6, 6, '#d0616b');
      d.rect(6, 6, 4, 4, '#1c1a1f');
    },
    category: 'spawn',
    weight: 100,
    tags: ['enemy'],
  },
  {
    draw: (d) => {
      d.rect(0, 0, T, T, 'rgba(220,70,90,0.18)');
      for (let i = -T; i < T; i += 4)
        for (let k = 0; k < T; k++) {
          const x = i + k;
          if (x >= 0 && x < T) d.px(x, k, 'rgba(230,90,110,0.55)');
        }
      d.rect(0, 0, T, 1, 'rgba(230,90,110,0.8)');
      d.rect(0, 15, T, 1, 'rgba(230,90,110,0.8)');
      d.rect(0, 0, 1, T, 'rgba(230,90,110,0.8)');
      d.rect(15, 0, 1, T, 'rgba(230,90,110,0.8)');
    },
    category: 'special',
    weight: 100,
    tags: ['collision'],
  },
  {
    draw: (d) => {
      d.circle(8, 8, 7, '#2c2140');
      d.circle(8, 8, 5.5, '#4a3470');
      d.circle(8, 8, 3.5, '#7a5bb0');
      d.circle(8, 8, 1.5, '#cdb8f0');
    },
    category: 'transition',
    weight: 100,
    tags: ['portal'],
  },
  {
    draw: (d) => {
      const c = '#e8a0bf';
      for (let i = 0; i <= 5; i++) {
        d.rect(8 - i, 2 + i, 1 + i * 2 - (i ? 1 : 0), 1, c);
        d.rect(8 - i, 13 - i, 1 + i * 2 - (i ? 1 : 0), 1, c);
      }
      d.rect(4, 7, 8, 2, c);
      d.rect(7, 6, 2, 4, '#1c1a1f');
    },
    category: 'special',
    weight: 100,
    tags: ['marker', 'quest'],
  },
  // row 4 – additional spawns & small deco
  {
    draw: (d) => {
      d.ring(8, 8, 7, 1.5, '#6fa6d6');
      d.circle(8, 6.5, 2, '#6fa6d6');
      d.rect(6, 9, 4, 3, '#6fa6d6');
    },
    category: 'spawn',
    weight: 100,
    tags: ['npc'],
  },
  {
    draw: (d) => {
      d.ring(8, 8, 7, 1.5, '#d9b45b');
      d.rect(6, 6, 4, 4, '#d9b45b');
    },
    category: 'spawn',
    weight: 100,
    tags: ['loot'],
  },
  {
    draw: (d) => {
      d.ring(8, 8, 7, 1.5, '#a98ad6');
      d.rect(7, 4, 2, 5, '#a98ad6');
      d.rect(7, 10, 2, 2, '#a98ad6');
    },
    category: 'spawn',
    weight: 100,
    tags: ['quest'],
  },
  {
    draw: (d) => {
      const c = 'rgba(20,17,24,0.8)';
      [[3, 4], [4, 5], [5, 5], [6, 6], [7, 7], [7, 8], [8, 9], [9, 9], [10, 10], [6, 5], [11, 11]].forEach(([x, y]) => d.px(x, y, c));
    },
    category: 'deco',
    weight: 30,
    tags: ['broken'],
  },
  {
    draw: (d) => {
      [[4, 10, 2], [7, 11, 3], [11, 9, 2], [9, 6, 1], [5, 5, 1]].forEach(([x, y, s]) => {
        d.rect(x, y, s, s, '#5a5360');
        d.px(x, y, '#72697c');
      });
    },
    category: 'deco',
    weight: 30,
    tags: ['stone'],
  },
  // row 4 (rest) + row 5 – perspective tiles (wall fronts, side faces, shadows)
  { draw: (d) => bricks(d, false), category: 'wallFront', weight: 80, tags: ['stone', 'dungeon'] },
  { draw: (d) => brickFace(d, { base: true }), category: 'wallFront', weight: 70, tags: ['stone', 'base'] },
  { draw: (d) => brickFace(d, { base: true, broken: true }), category: 'wallFront', weight: 15, tags: ['stone', 'base', 'broken'] },
  { draw: (d) => brickFace(d, { base: false, capEdge: true }), category: 'wallFront', weight: 100, tags: ['stone', 'upper'] },
  { draw: (d) => sideFace(d, 'right'), category: 'wallLeft', weight: 100, tags: ['stone', 'side'] },
  { draw: (d) => sideFace(d, 'left'), category: 'wallRight', weight: 100, tags: ['stone', 'side'] },
  { draw: (d) => shadow(d, 'top'), category: 'shadow', weight: 100, tags: ['top'] },
  { draw: (d) => shadow(d, 'left'), category: 'shadow', weight: 100, tags: ['side'] },
  { draw: (d) => shadow(d, 'corner'), category: 'shadow', weight: 100, tags: ['corner'] },
  null,
  null,
];

export const DEMO_TILESET_ID = 'demo_dungeon';

export function createDemoTileset(firstGid = 1): Tileset {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * T;
  canvas.height = ROWS * T;
  const ctx = canvas.getContext('2d')!;
  const tiles: Record<number, TileMeta> = {};
  const empty: number[] = [];
  DEFS.forEach((def, i) => {
    if (!def) {
      empty.push(i);
      return;
    }
    const ox = (i % COLS) * T;
    const oy = Math.floor(i / COLS) * T;
    def.draw(new Draw(ctx, ox, oy, new Rng(1000 + i * 97)));
    tiles[i] = { category: def.category, weight: def.weight ?? 100, tags: def.tags ?? [] };
  });
  return {
    id: DEMO_TILESET_ID,
    name: 'Demo Dungeon',
    source: 'demo',
    dataUrl: canvas.toDataURL('image/png'),
    imageWidth: canvas.width,
    imageHeight: canvas.height,
    tileSize: T,
    columns: COLS,
    rows: ROWS,
    firstGid,
    active: true,
    tiles,
    emptyTiles: empty,
    perspectives: ['top_down', 'low_top_down', 'isometric_45'] as Perspective[],
  };
}
