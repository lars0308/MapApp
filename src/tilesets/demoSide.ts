import type { Tileset } from '../types';
import { build, type D, type Def } from './demoAutotiles';

// Demo tiles for side-scroller maps (perspective side_view), 16 × 16 px:
// grass ground and cave stone with all edge roles, one-way wooden platforms, ladder,
// spikes, water / lava (surface + deep), cave back wall, small deco, goal flag and chest.
// Every tile carries the tag "side" so it wins over top-down tiles of the same role.

const T = 16;

interface Pal {
  base: string;
  light: string;
  dark: string;
  deep: string;
  line: string;
}
const DIRT: Pal = { base: '#7a5236', light: '#936544', dark: '#5c3c28', deep: '#4a2f20', line: '#2a1c14' };
const STONE: Pal = { base: '#57526a', light: '#6d6784', dark: '#433f53', deep: '#35323f', line: '#1d1b24' };
const GRASS = { base: '#5fa84a', light: '#8fd05c', dark: '#3f7a34' };
const MOSS = { base: '#6d6784', light: '#8a84a3', dark: '#57526a' };
const WOOD = { base: '#a0703f', light: '#c28c52', dark: '#6e4a28', line: '#3a2616' };
const METAL = { base: '#9aa3b0', light: '#d7dde6', dark: '#5f6772', line: '#2a2e35' };

function fill(d: D, p: Pal) {
  d.rect(0, 0, T, T, p.base);
  d.speckle([p.light, p.dark], 0.12);
  // a few pebbles
  for (let k = 0; k < 3; k++) {
    const x = d.rng.int(1, 13);
    const y = d.rng.int(2, 14);
    d.rect(x, y, 2, 1, p.light);
    d.px(x, y + 1, p.deep);
  }
}

type Edge = { top?: boolean; left?: boolean; right?: boolean; bottom?: boolean; innerL?: boolean; innerR?: boolean };

function ground(d: D, p: Pal, cover: typeof GRASS, e: Edge) {
  fill(d, p);
  if (e.left) {
    d.rect(0, 0, 1, T, p.line);
    d.rect(1, 0, 1, T, p.dark);
  }
  if (e.right) {
    d.rect(T - 1, 0, 1, T, p.line);
    d.rect(T - 2, 0, 1, T, p.dark);
  }
  if (e.bottom) {
    d.rect(0, T - 1, T, 1, p.line);
    d.rect(0, T - 2, T, 1, p.dark);
    for (let x = 2; x < T - 2; x += 5) d.px(x + d.rng.int(0, 2), T - 3, p.dark);
  }
  if (e.top) {
    // grass / moss cap with an uneven lower edge
    d.rect(0, 0, T, 4, cover.base);
    d.rect(0, 0, T, 1, cover.light);
    for (let x = 0; x < T; x++) {
      if (d.rng.chance(0.55)) d.px(x, 4, cover.base);
      if (d.rng.chance(0.3)) d.px(x, 5, cover.dark);
      if (d.rng.chance(0.25)) d.px(x, 1, cover.light);
    }
    d.rect(0, 3, T, 1, cover.dark);
    if (e.left) {
      d.rect(0, 0, 2, 7, cover.base);
      d.rect(0, 0, 1, 7, cover.dark);
    }
    if (e.right) {
      d.rect(T - 2, 0, 2, 7, cover.base);
      d.rect(T - 1, 0, 1, 7, cover.dark);
    }
  }
  // inner corner: the cap of the lower neighbour runs into this cell
  if (e.innerL) {
    d.rect(0, 0, 3, 3, cover.base);
    d.px(0, 0, cover.light).px(1, 0, cover.light);
    d.px(3, 0, cover.dark).px(0, 3, cover.dark);
  }
  if (e.innerR) {
    d.rect(T - 3, 0, 3, 3, cover.base);
    d.px(T - 1, 0, cover.light).px(T - 2, 0, cover.light);
    d.px(T - 4, 0, cover.dark).px(T - 1, 3, cover.dark);
  }
}

function groundDefs(p: Pal, cover: typeof GRASS, tag: string): Def[] {
  const tags = ['side', tag];
  const g = (role: Def['role'], e: Edge, weight = 100): Def => ({ role, category: 'wallTop', tags, weight, draw: (d) => ground(d, p, cover, e) });
  return [
    g('ground_top', { top: true }),
    g('ground_top', { top: true }, 60),
    g('ground_top_left', { top: true, left: true }),
    g('ground_top_right', { top: true, right: true }),
    g('ground_left', { left: true }),
    g('ground_right', { right: true }),
    g('ground_bottom', { bottom: true }),
    g('ground_inner_left', { innerL: true }),
    g('ground_inner_right', { innerR: true }),
    g('ground_fill', {}),
    g('ground_fill', {}, 50),
  ];
}

function plank(d: D, end: 'left' | 'right' | null) {
  d.rect(0, 0, T, 5, WOOD.base);
  d.rect(0, 0, T, 1, WOOD.light);
  d.rect(0, 4, T, 1, WOOD.dark);
  d.rect(0, 5, T, 1, WOOD.line);
  for (let x = 3; x < T; x += 6) d.rect(x, 1, 1, 3, WOOD.dark);
  d.px(1, 2, METAL.dark).px(T - 2, 2, METAL.dark);
  if (end === 'left') {
    d.rect(0, 0, 1, 6, WOOD.line);
    // bracket
    for (let k = 0; k < 4; k++) d.px(2 + k, 6 + k, WOOD.dark);
    d.rect(2, 6, 1, 5, WOOD.dark);
  }
  if (end === 'right') {
    d.rect(T - 1, 0, 1, 6, WOOD.line);
    for (let k = 0; k < 4; k++) d.px(T - 3 - k, 6 + k, WOOD.dark);
    d.rect(T - 3, 6, 1, 5, WOOD.dark);
  }
}

function liquid(d: D, top: boolean, c: { base: string; light: string; dark: string; foam: string }, alpha: number) {
  d.ctx.globalAlpha = alpha;
  const y0 = top ? 4 : 0;
  d.rect(0, y0, T, T - y0, c.base);
  for (let y = y0 + 2; y < T; y += 4) for (let x = (y * 3) % 5; x < T; x += 7) d.rect(x, y, 3, 1, c.dark);
  d.ctx.globalAlpha = 1;
  if (top) {
    for (let x = 0; x < T; x++) d.px(x, 4 + (Math.floor(x / 4) % 2), c.foam);
    d.rect(0, 6, T, 1, c.light);
  }
}

const WATER = { base: '#3b7fc4', light: '#6fb0e8', dark: '#2d62a0', foam: '#cfe9ff' };
const LAVA = { base: '#e0582a', light: '#ffb347', dark: '#a8321c', foam: '#ffe08a' };

function backWall(d: D, alt: boolean) {
  d.rect(0, 0, T, T, '#2b2835');
  d.speckle(['#332f40', '#24212d'], 0.18);
  d.rect(0, alt ? 5 : 9, T, 1, '#1f1c27');
  d.rect(alt ? 10 : 5, 0, 1, alt ? 5 : 9, '#1f1c27');
  d.rect(alt ? 3 : 12, alt ? 6 : 10, 1, 6, '#1f1c27');
}

function decoDefs(): Def[] {
  const deco = (tags: string[], draw: (d: D) => void): Def => ({ category: 'deco', tags: ['side', ...tags], collision: false, draw });
  return [
    deco(['grass'], (d) => {
      for (const [x, h] of [
        [3, 4],
        [5, 6],
        [7, 3],
        [10, 5],
        [12, 4],
      ])
        d.rect(x, T - h, 1, h, x % 2 ? GRASS.dark : GRASS.base), d.px(x, T - h, GRASS.light);
    }),
    deco(['grass', 'flower'], (d) => {
      d.rect(5, 11, 1, 5, GRASS.dark).rect(10, 9, 1, 7, GRASS.dark);
      d.rect(4, 9, 3, 2, '#e84a5f').px(5, 10, '#ffd34a');
      d.rect(9, 7, 3, 2, '#ffd34a').px(10, 8, '#e87a2a');
      d.px(6, 13, GRASS.base).px(11, 12, GRASS.base);
    }),
    deco(['grass'], (d) => {
      // bush
      d.rect(2, 9, 12, 7, GRASS.dark);
      d.rect(3, 8, 10, 7, GRASS.base);
      d.rect(5, 7, 6, 2, GRASS.base);
      d.px(5, 8, GRASS.light).px(6, 7, GRASS.light).px(9, 9, GRASS.light).px(4, 10, GRASS.light);
      d.px(7, 11, '#e84a5f').px(11, 10, '#e84a5f');
    }),
    deco(['grass'], (d) => {
      // mushroom
      d.rect(6, 11, 3, 5, '#efe3cf');
      d.rect(4, 8, 7, 3, '#d94a4a');
      d.rect(5, 7, 5, 1, '#d94a4a');
      d.px(5, 9, '#fff').px(8, 8, '#fff');
    }),
    deco(['grass', 'cave'], (d) => {
      // rock
      d.rect(4, 11, 9, 5, STONE.dark);
      d.rect(5, 10, 7, 5, STONE.base);
      d.rect(6, 10, 3, 1, STONE.light);
      d.rect(4, 15, 9, 1, STONE.line);
    }),
    deco(['cave'], (d) => {
      // crystals
      d.rect(5, 8, 2, 8, '#6fd3e8').rect(8, 5, 3, 11, '#4ab0d9').rect(11, 10, 2, 6, '#6fd3e8');
      d.px(9, 5, '#d8f6ff').px(5, 8, '#d8f6ff').rect(9, 6, 1, 6, '#9be6f5');
    }),
    deco(['cave'], (d) => {
      // stalagmite
      d.rect(6, 9, 4, 7, STONE.base).rect(7, 5, 2, 4, STONE.base).px(7, 4, STONE.light);
      d.rect(6, 9, 1, 7, STONE.light);
    }),
    deco(['cave'], (d) => {
      // glowing mushrooms
      d.rect(4, 12, 1, 4, '#a6e3c7').rect(10, 10, 1, 6, '#a6e3c7');
      d.rect(3, 10, 3, 2, '#5ff0b0').rect(9, 8, 3, 2, '#5ff0b0');
      d.px(4, 10, '#e0fff2').px(10, 8, '#e0fff2');
    }),
  ];
}

function defs(): Def[] {
  const side = ['side'];
  return [
    ...groundDefs(DIRT, GRASS, 'grass'),
    ...groundDefs(STONE, MOSS, 'cave'),
    { role: 'platform_left', category: 'bridge', tags: side, collision: false, draw: (d) => plank(d, 'left') },
    { role: 'platform', category: 'bridge', tags: side, collision: false, draw: (d) => plank(d, null) },
    { role: 'platform_right', category: 'bridge', tags: side, collision: false, draw: (d) => plank(d, 'right') },
    {
      role: 'ladder',
      category: 'stairs',
      tags: side,
      collision: false,
      draw: (d) => {
        d.rect(3, 0, 2, T, WOOD.base).rect(11, 0, 2, T, WOOD.base);
        d.rect(3, 0, 1, T, WOOD.light).rect(12, 0, 1, T, WOOD.dark);
        for (const y of [2, 6, 10, 14]) d.rect(5, y, 6, 2, WOOD.base), d.rect(5, y + 1, 6, 1, WOOD.dark);
      },
    },
    {
      role: 'spikes',
      category: 'obstacle',
      tags: side,
      collision: false,
      draw: (d) => {
        d.rect(0, 13, T, 3, METAL.dark).rect(0, 15, T, 1, METAL.line);
        for (let k = 0; k < 4; k++) {
          const x0 = k * 4;
          for (let y = 0; y < 8; y++) {
            const half = Math.floor(y / 4);
            d.rect(x0 + 1 - half + 1, 5 + y, 1 + half * 2 - (y < 2 ? 0 : 0), 1, y < 2 ? METAL.light : METAL.base);
          }
          d.px(x0 + 2, 5, METAL.light);
          d.rect(x0 + 3, 9, 1, 4, METAL.dark);
        }
      },
    },
    { role: 'water', category: 'water', tags: ['side', 'top'], collision: false, draw: (d) => liquid(d, true, WATER, 0.85) },
    { role: 'water', category: 'water', tags: ['side', 'deep'], collision: false, draw: (d) => liquid(d, false, WATER, 0.85) },
    { role: 'lava', category: 'lava', tags: ['side', 'top'], collision: false, draw: (d) => liquid(d, true, LAVA, 1) },
    { role: 'lava', category: 'lava', tags: ['side', 'deep'], collision: false, draw: (d) => liquid(d, false, LAVA, 1) },
    { role: 'back_wall', category: 'floor', tags: ['side', 'cave'], collision: false, draw: (d) => backWall(d, false) },
    { role: 'back_wall', category: 'floor', tags: ['side', 'cave'], collision: false, weight: 60, draw: (d) => backWall(d, true) },
    ...decoDefs(),
    {
      category: 'special',
      tags: ['side', 'end', 'goal'],
      collision: false,
      draw: (d) => {
        d.rect(4, 1, 1, 15, METAL.dark).px(4, 0, '#ffd34a');
        d.rect(5, 2, 8, 5, '#e84a5f').rect(5, 2, 8, 1, '#ff7a8a');
        d.px(8, 4, '#fff').px(9, 4, '#fff');
        d.rect(2, 15, 5, 1, METAL.line);
      },
    },
    {
      category: 'spawn',
      tags: ['side', 'loot', 'treasure'],
      collision: false,
      draw: (d) => {
        d.rect(2, 8, 12, 8, WOOD.base).rect(2, 8, 12, 3, WOOD.light);
        d.rect(2, 11, 12, 1, WOOD.line).rect(2, 15, 12, 1, WOOD.line);
        d.rect(7, 10, 2, 3, '#ffd34a');
        d.rect(2, 8, 1, 8, WOOD.line).rect(13, 8, 1, 8, WOOD.line);
      },
    },
    // lift (moving platform) and its rail – appended, so older projects keep their tile ids
    {
      role: 'lift',
      category: 'bridge',
      tags: side,
      collision: false,
      draw: (d) => {
        d.rect(0, 0, T, 6, METAL.base).rect(0, 0, T, 1, METAL.light).rect(0, 5, T, 1, METAL.line);
        for (let x = 0; x < T; x += 4) d.rect(x, 2, 2, 2, '#f2c14e');
        d.rect(6, 6, 4, 3, METAL.dark).rect(7, 9, 2, 1, METAL.line);
      },
    },
    {
      role: 'lift_track',
      category: 'deco',
      tags: ['side', 'track'],
      collision: false,
      draw: (d) => {
        d.ctx.globalAlpha = 0.85;
        d.rect(3, 0, 2, T, METAL.dark).rect(11, 0, 2, T, METAL.dark);
        d.rect(3, 0, 1, T, METAL.base).rect(11, 0, 1, T, METAL.base);
        for (const y of [3, 11]) d.rect(5, y, 6, 1, METAL.line);
        d.ctx.globalAlpha = 1;
      },
    },
  ];
}

export const DEMO_SIDE_ID = 'demo_side';

export function createDemoSideTileset(firstGid: number): Tileset {
  return build(DEMO_SIDE_ID, 'Demo Seitenansicht', defs(), ['side_view'], firstGid, 8101);
}
