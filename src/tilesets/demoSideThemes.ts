import type { Tileset } from '../types';
import { build, type D, type Def } from './demoAutotiles';
import { groundDefs, type Pal } from './demoSide';

// More side-scroller themes (Seitenansicht → Umgebung): castle, snow, desert – ground with every
// edge role, a castle back wall and themed deco. Tags: side + castle / snow / sand.
// A tileset of its own, so the gids of the older side-view set stay as they are.

const T = 16;

const CASTLE: Pal = { base: '#6b6a78', light: '#86859a', dark: '#51505c', deep: '#3e3d48', line: '#24232b' };
const CASTLE_CAP = { base: '#8a8a9c', light: '#b0b0c2', dark: '#5d5d6c' };
const FROZEN: Pal = { base: '#6b7f93', light: '#8499ad', dark: '#536577', deep: '#435261', line: '#27313b' };
const SNOW = { base: '#eef6fb', light: '#ffffff', dark: '#b9d3e4' };
const SAND: Pal = { base: '#d9b36a', light: '#ecca86', dark: '#bb9350', deep: '#9f7a3e', line: '#6f5327' };
const SAND_CAP = { base: '#f0d28e', light: '#fbe6b4', dark: '#cfae66' };

function bricks(d: D, dark: boolean) {
  d.rect(0, 0, T, T, dark ? '#2c2a36' : '#34323f');
  for (let r = 0; r < 4; r++) {
    const y = r * 4;
    d.rect(0, y, T, 1, '#1f1e27');
    for (let x = (r % 2) * 4; x < T; x += 8) d.rect(x, y, 1, 4, '#1f1e27');
  }
  d.speckle(['#3d3a4a'], 0.05);
}

function defs(): Def[] {
  const deco = (tags: string[], draw: (d: D) => void): Def => ({ category: 'deco', tags: ['side', ...tags], collision: false, draw });
  return [
    ...groundDefs(CASTLE, CASTLE_CAP, 'castle'),
    ...groundDefs(FROZEN, SNOW, 'snow'),
    ...groundDefs(SAND, SAND_CAP, 'sand'),
    { role: 'back_wall', category: 'floor', tags: ['side', 'castle'], collision: false, draw: (d) => bricks(d, false) },
    { role: 'back_wall', category: 'floor', tags: ['side', 'castle'], collision: false, weight: 50, draw: (d) => bricks(d, true) },
    deco(['castle'], (d) => {
      // torch on the wall
      d.rect(7, 8, 2, 7, '#6e4a28').rect(6, 7, 4, 2, '#8a8f99');
      d.rect(6, 3, 4, 4, '#ff9a2e').rect(7, 1, 2, 3, '#ffd04a').px(7, 0, '#fff2a8');
    }),
    deco(['castle'], (d) => {
      // banner
      d.rect(3, 1, 10, 1, '#8a8f99');
      d.rect(4, 2, 8, 10, '#a3303a').rect(4, 2, 8, 1, '#c8434e');
      d.rect(7, 5, 2, 4, '#e8c35a');
      d.px(4, 12, '#a3303a').px(6, 13, '#a3303a').px(9, 13, '#a3303a').px(11, 12, '#a3303a');
    }),
    deco(['snow'], (d) => {
      // small pine with snow
      d.rect(7, 12, 2, 4, '#5c3c28');
      for (let k = 0; k < 4; k++) {
        const w = (k + 1) * 3 + 1;
        const x = 8 - Math.ceil(w / 2);
        d.rect(x, 3 + k * 3, w, 3, '#2f6b4f').rect(x, 3 + k * 3, w, 1, SNOW.base);
      }
      d.px(7, 2, SNOW.light).px(8, 2, SNOW.light);
    }),
    deco(['snow'], (d) => {
      // ice crystal
      d.rect(7, 6, 2, 10, '#9fd8f2').rect(4, 10, 2, 6, '#bfe8fa').rect(10, 9, 2, 7, '#bfe8fa');
      d.rect(7, 6, 1, 10, '#e6f7ff').px(7, 5, '#ffffff');
    }),
    deco(['sand'], (d) => {
      // cactus
      d.rect(7, 3, 3, 13, '#4f9a4c').rect(7, 3, 1, 13, '#6fbf5d');
      d.rect(3, 7, 2, 5, '#4f9a4c').rect(3, 11, 4, 2, '#4f9a4c');
      d.rect(12, 5, 2, 5, '#4f9a4c').rect(10, 9, 3, 2, '#4f9a4c');
      d.px(8, 2, '#f59ac0');
    }),
    deco(['sand'], (d) => {
      // bleached bones
      d.rect(3, 13, 10, 2, '#efe6cf').rect(2, 12, 2, 4, '#efe6cf').rect(12, 12, 2, 4, '#efe6cf');
      d.rect(3, 15, 10, 1, '#c9bda0');
    }),
  ];
}

export const DEMO_SIDE_THEMES_ID = 'demo_side_themes';

export function createDemoSideThemesTileset(firstGid: number): Tileset {
  return build(DEMO_SIDE_THEMES_ID, 'Demo Seitenansicht Themen', defs(), ['side_view'], firstGid, 8601);
}
