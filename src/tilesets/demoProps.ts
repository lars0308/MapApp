import type { Tileset } from '../types';
import { D, build, type Def } from './demoAutotiles';

// "Demo Ausstattung": props that make places feel lived in.
//  dungeon (tag dungeon): barrel, crate, brazier, table, sack – deco along the walls
//  village (tag village): crop fields, cabbages, hay, flower bed, fences, sign post
// Field tiles are laid out by the village generator next to the houses; fences block.

const T = 16;
const WOOD = { base: '#9a6a3c', light: '#c18d55', dark: '#6b4524', line: '#3d2714' };
const IRON = { base: '#6f7580', light: '#a3aab5', dark: '#484d56' };

const shadow = (d: D, x: number, w: number) => d.rect(x, 14, w, 2, 'rgba(20,20,30,0.35)');

function barrel(d: D) {
  shadow(d, 3, 10);
  d.rect(4, 3, 8, 12, WOOD.base).rect(3, 5, 10, 8, WOOD.base);
  d.rect(4, 3, 8, 2, WOOD.light).rect(5, 4, 6, 1, WOOD.dark);
  d.rect(3, 6, 10, 1, IRON.dark).rect(3, 11, 10, 1, IRON.dark);
  d.rect(10, 5, 2, 9, WOOD.dark);
}

function crate(d: D) {
  shadow(d, 2, 12);
  d.rect(2, 4, 12, 11, WOOD.base).rect(2, 4, 12, 1, WOOD.light).rect(2, 14, 12, 1, WOOD.line);
  d.rect(2, 4, 1, 11, WOOD.dark).rect(13, 4, 1, 11, WOOD.dark);
  for (let k = 0; k < 9; k++) d.px(3 + k, 5 + k, WOOD.dark);
  d.rect(2, 9, 12, 1, WOOD.dark);
}

function brazier(d: D) {
  shadow(d, 4, 8);
  d.rect(7, 9, 2, 5, IRON.dark).rect(5, 13, 6, 1, IRON.dark);
  d.rect(4, 7, 8, 3, IRON.base).rect(4, 7, 8, 1, IRON.light);
  d.rect(5, 3, 6, 4, '#ff8a2a').rect(6, 1, 4, 3, '#ffc34a').rect(7, 0, 2, 2, '#fff1a6');
}

function table(d: D) {
  shadow(d, 1, 14);
  d.rect(1, 5, 14, 5, WOOD.base).rect(1, 5, 14, 1, WOOD.light).rect(1, 9, 14, 1, WOOD.dark);
  d.rect(2, 10, 2, 4, WOOD.dark).rect(12, 10, 2, 4, WOOD.dark);
  d.rect(4, 3, 3, 2, '#d9d2c0').rect(10, 2, 2, 3, '#c9a24a');
}

function sack(d: D) {
  shadow(d, 3, 10);
  d.rect(4, 6, 8, 8, '#c9b58a').rect(3, 8, 10, 5, '#c9b58a').rect(6, 4, 4, 2, '#b39f74');
  d.rect(6, 5, 4, 1, '#7a6a48').rect(10, 8, 2, 5, '#b39f74');
}

function crops(d: D, kind: 'wheat' | 'wheat2' | 'cabbage') {
  d.rect(0, 0, T, T, '#8a5a34');
  for (let y = 1; y < T; y += 4) d.rect(0, y, T, 1, '#6e4526');
  if (kind === 'cabbage')
    for (let y = 2; y < T; y += 4)
      for (let x = 2; x < T; x += 5) d.rect(x, y - 1, 3, 3, '#5fae45').px(x + 1, y - 1, '#86d162').px(x + 1, y + 1, '#3f7a34');
  else
    for (let y = 0; y < T; y += 4)
      for (let x = 1; x < T; x += 3) {
        const c = kind === 'wheat' ? '#e5c35a' : '#cfae4a';
        d.rect(x, y, 1, 3, c).px(x, y, '#f5dc84');
      }
}

function hay(d: D) {
  shadow(d, 2, 12);
  d.rect(2, 5, 12, 9, '#e0c064').rect(2, 5, 12, 2, '#f0d884').rect(2, 13, 12, 1, '#b8993f');
  d.rect(2, 8, 12, 1, '#a88732').rect(2, 11, 12, 1, '#a88732');
}

function flowerbed(d: D) {
  d.rect(1, 4, 14, 10, '#7a4a2a').rect(1, 4, 14, 1, '#9a6a3c').rect(1, 13, 14, 1, '#5a341c');
  for (const [x, y, c] of [[3, 6, '#f59ac0'], [7, 7, '#ffd84a'], [11, 6, '#fff6d8'], [5, 10, '#ffd84a'], [9, 10, '#f59ac0'], [12, 10, '#9fb8ff']] as const)
    d.rect(x, y, 2, 2, c).px(x, y + 2, '#3f7a34');
}

function fence(d: D, dir: 'h' | 'v') {
  if (dir === 'h') {
    d.rect(0, 6, T, 2, WOOD.base).rect(0, 10, T, 2, WOOD.base).rect(0, 6, T, 1, WOOD.light);
    for (const x of [1, 13]) d.rect(x, 3, 2, 11, WOOD.dark).rect(x, 3, 2, 1, WOOD.light);
    d.rect(0, 14, T, 1, 'rgba(20,40,20,0.3)');
  } else {
    d.rect(6, 0, 2, T, WOOD.base).rect(9, 0, 2, T, WOOD.base).rect(6, 0, 1, T, WOOD.light);
    for (const y of [2, 10]) d.rect(5, y, 7, 3, WOOD.dark).rect(5, y, 7, 1, WOOD.light);
  }
}

function sign(d: D) {
  shadow(d, 5, 6);
  d.rect(7, 6, 2, 9, WOOD.dark);
  d.rect(2, 2, 12, 5, WOOD.base).rect(2, 2, 12, 1, WOOD.light).rect(2, 6, 12, 1, WOOD.line);
  d.rect(4, 4, 8, 1, WOOD.line);
}

function defs(): Def[] {
  const deco = (tags: string[], draw: (d: D) => void, weight = 50): Def => ({ category: 'deco', tags, weight, collision: false, draw });
  return [
    deco(['dungeon', 'barrel'], barrel, 60),
    deco(['dungeon', 'crate'], crate, 50),
    deco(['dungeon', 'light'], brazier, 30),
    deco(['dungeon', 'table'], table, 20),
    deco(['dungeon', 'sack'], sack, 30),
    { category: 'deco', tags: ['village', 'field', 'wheat'], collision: false, weight: 60, draw: (d) => crops(d, 'wheat') },
    { category: 'deco', tags: ['village', 'field', 'wheat'], collision: false, weight: 40, draw: (d) => crops(d, 'wheat2') },
    { category: 'deco', tags: ['village', 'field', 'cabbage'], collision: false, draw: (d) => crops(d, 'cabbage') },
    deco(['village', 'hay'], hay),
    deco(['village', 'flowers'], flowerbed),
    { category: 'obstacle', tags: ['village', 'fence', 'h'], collision: true, draw: (d) => fence(d, 'h') },
    { category: 'obstacle', tags: ['village', 'fence', 'v'], collision: true, draw: (d) => fence(d, 'v') },
    deco(['village', 'sign'], sign, 20),
  ];
}

export const DEMO_PROPS_ID = 'demo_props';

export function createDemoPropsTileset(firstGid: number): Tileset {
  return build(DEMO_PROPS_ID, 'Demo Ausstattung', defs(), ['top_down', 'low_top_down', 'isometric_45', 'isometric'], firstGid, 8801);
}
