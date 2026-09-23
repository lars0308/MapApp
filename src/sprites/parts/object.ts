import { C, FIX, Painter } from '../painter';
import type { Bounds, DemoPart, FitContext, SlotDef } from '../types';

// Objects, 32 × 32: a base shape + any number of details and effects.
// Details and effects attach to the bounds of the base shape, so they fit every base.

export const OBJECT_SLOTS: SlotDef[] = [
  { id: 'shadow', label: 'Schatten' },
  { id: 'base', label: 'Grundform' },
  { id: 'detail', label: 'Details', multi: true },
  { id: 'effect', label: 'Effekte', multi: true },
  { id: 'extra', label: 'Eigene', multi: true },
];

const WOOD = C('wood');
const WOOD_D = C('wood', 2);
const MET = C('metal');
const STONE = C('stone');
const LEAF = C('leaf');
const P1 = C('primary');
const P2 = C('secondary');

type Paint = (b: Bounds, p: Painter) => void;
const part = (slot: string, id: string, label: string, paint: Paint, opts: { outline?: boolean; shade?: boolean } = {}): DemoPart => ({
  id: `o.${slot}.${id}`,
  kind: 'object',
  slot,
  label,
  paint: (ctx: FitContext) => {
    const p = new Painter();
    paint(ctx.bounds, p);
    return p.finish(opts);
  },
});
const base = (id: string, label: string, bounds: Bounds, paint: (p: Painter) => void): DemoPart => ({
  ...part('base', id, label, (_, p) => paint(p)),
  bounds,
});

const BASES: DemoPart[] = [
  base('chest', 'Truhe', { x0: 6, y0: 9, x1: 25, y1: 26 }, (p) => {
    p.ell(16, 14.5, 10, 6, WOOD, (_, y) => y <= 14);
    p.rect(6, 15, 25, 26, WOOD);
    p.rect(6, 15, 25, 15, WOOD_D, true);
    p.rect(7, 21, 24, 21, WOOD_D, true);
  }),
  base('barrel', 'Fass', { x0: 7, y0: 7, x1: 24, y1: 27 }, (p) => {
    p.ell(16, 17, 8.4, 11, WOOD, (_, y) => y >= 7 && y <= 27);
    for (const x of [11, 16, 20]) p.line(x, 8, x, 26, WOOD_D, true);
    for (const y of [10, 24]) p.ell(16, 17, 8.4, 11, MET, (_, yy) => yy === y);
  }),
  base('crate', 'Kiste', { x0: 7, y0: 10, x1: 24, y1: 26 }, (p) => {
    p.rect(7, 10, 24, 26, WOOD);
    p.rect(9, 12, 22, 24, C('wood', 0), true);
    p.line(9, 12, 22, 24, WOOD_D, true).line(9, 13, 21, 24, WOOD_D, true);
  }),
  base('jar', 'Krug', { x0: 9, y0: 7, x1: 22, y1: 27 }, (p) => {
    p.ell(16, 19.5, 7, 7.5, P1);
    p.rect(13, 8, 18, 12, P1);
    p.rect(12, 7, 19, 8, C('primary', 0), true);
  }),
  base('sign', 'Wegweiser', { x0: 6, y0: 6, x1: 25, y1: 13 }, (p) => {
    p.rect(15, 13, 16, 28, WOOD);
    p.rect(6, 6, 24, 13, WOOD).tri(24, 6, 29, 9.5, 24, 13, WOOD);
    p.rect(8, 9, 20, 9, WOOD_D, true).rect(8, 11, 17, 11, WOOD_D, true);
  }),
  base('pillar', 'Säule', { x0: 9, y0: 4, x1: 22, y1: 28 }, (p) => {
    p.rect(9, 4, 22, 6, STONE);
    p.rect(11, 7, 20, 24, STONE);
    for (const x of [13, 16, 18]) p.line(x, 8, x, 23, C('stone', 2), true);
    p.rect(9, 25, 22, 28, STONE);
  }),
  base('tree', 'Baum', { x0: 6, y0: 2, x1: 26, y1: 28 }, (p) => {
    p.rect(14, 19, 17, 28, WOOD).px(13, 28, WOOD).px(18, 28, WOOD);
    p.ell(16, 11, 9.5, 8.5, LEAF).ell(10, 15, 4.5, 4, LEAF).ell(22, 15, 4.5, 4, LEAF);
    for (const [x, y] of [
      [12, 8],
      [18, 6],
      [20, 12],
      [13, 14],
    ])
      p.px(x, y, C('leaf', 0), true);
  }),
  base('rock', 'Fels', { x0: 5, y0: 13, x1: 27, y1: 28 }, (p) => {
    p.ell(16, 22, 10.5, 6.8, STONE).ell(11.5, 18, 5.5, 4.5, STONE).ell(20, 18.5, 5, 4, STONE);
  }),
  base('brazier', 'Feuerschale', { x0: 8, y0: 15, x1: 24, y1: 28 }, (p) => {
    p.ell(16, 16, 8, 5.5, MET, (_, y) => y >= 16);
    p.rect(8, 15, 24, 16, MET);
    p.line(11, 21, 9, 28, MET).line(21, 21, 23, 28, MET).line(16, 22, 16, 28, MET);
  }),
  base('table', 'Tisch', { x0: 4, y0: 13, x1: 27, y1: 28 }, (p) => {
    p.rect(4, 13, 27, 17, WOOD);
    p.rect(6, 18, 7, 28, WOOD).rect(24, 18, 25, 28, WOOD);
  }),
  base('shelf', 'Bücherregal', { x0: 5, y0: 3, x1: 26, y1: 28 }, (p) => {
    p.rect(5, 3, 26, 28, WOOD);
    const books = [P1, P2, LEAF, MET, P1, C('primary', 0), P2, LEAF];
    for (const [y0, y1] of [
      [5, 10],
      [13, 18],
      [21, 26],
    ]) {
      p.rect(7, y0, 24, y1, WOOD_D, true);
      let x = 7;
      let i = y0;
      while (x < 24) {
        const w = 2 + (i % 2);
        const h = 3 + ((i * 7) % 3);
        p.rect(x, y1 - h + 1, Math.min(23, x + w - 1), y1, books[i % books.length], true);
        x += w + 1;
        i += 3;
      }
    }
  }),
  base('crystal', 'Kristall', { x0: 7, y0: 4, x1: 26, y1: 26 }, (p) => {
    p.tri(16, 4, 11, 22, 21, 22, P1).tri(10, 11, 7, 25, 14, 25, P1).tri(22, 12, 19, 25, 26, 25, P1);
    p.line(16, 6, 16, 20, C('primary', 0), true);
  }),
  base('pot', 'Blumentopf', { x0: 9, y0: 5, x1: 22, y1: 27 }, (p) => {
    p.rect(10, 19, 21, 20, P1);
    for (let y = 21; y <= 27; y++) p.rect(11 + Math.floor((y - 21) / 3), y, 20 - Math.floor((y - 21) / 3), y, P1);
    p.ell(16, 13, 5, 6, LEAF).ell(11, 15, 3, 3, LEAF).ell(21, 14, 3, 3.5, LEAF);
  }),
];

// ---------------------------------------------------------------- details

const cxOf = (b: Bounds) => Math.floor((b.x0 + b.x1) / 2);
const hash = (n: number) => ((n * 2654435761) >>> 0) % 7;

const DETAILS: DemoPart[] = [
  part(
    'detail',
    'bands',
    'Beschläge',
    (b, p) => {
      const { x0, y0, x1, y1 } = b;
      for (const [x, sx] of [
        [x0, 1],
        [x1, -1],
      ])
        for (const [y, sy] of [
          [y0, 1],
          [y1, -1],
        ]) {
          p.rect(x, y, x + 2 * sx, y, MET);
          p.rect(x, y, x, y + 2 * sy, MET);
        }
    },
    { outline: false },
  ),
  part('detail', 'lock', 'Schloss', (b, p) => {
    const cx = cxOf(b);
    const y = Math.round(b.y0 + (b.y1 - b.y0) * 0.42);
    p.rect(cx - 1, y, cx + 2, y + 3, FIX.GOLD, true);
    p.px(cx, y + 1, FIX.EYE, true).px(cx, y + 2, FIX.EYE, true).px(cx - 1, y, FIX.GOLD_L, true);
  }),
  part(
    'detail',
    'moss',
    'Moos',
    (b, p) => {
      for (let x = b.x0; x <= b.x1; x++) {
        const h = hash(x);
        if (h < 4) p.px(x, b.y0 + (h % 2), C('leaf', h === 0 ? 0 : 1), true);
        if (h > 2) p.px(x, b.y1 - (h % 2), C('leaf', h === 6 ? 2 : 1), true);
        if (h === 5) p.px(x, b.y1 - 2, C('leaf', 1), true);
      }
    },
    { outline: false, shade: false },
  ),
  part(
    'detail',
    'cracks',
    'Risse',
    (b, p) => {
      const cx = cxOf(b);
      p.line(cx - 3, b.y0 + 2, cx - 1, b.y0 + 5, FIX.OUTLINE, true).line(cx - 1, b.y0 + 5, cx - 3, b.y0 + 8, FIX.OUTLINE, true);
      p.line(b.x1 - 3, b.y1 - 6, b.x1 - 5, b.y1 - 3, FIX.OUTLINE, true);
    },
    { outline: false, shade: false },
  ),
  part(
    'detail',
    'gold',
    'Goldmünzen',
    (b, p) => {
      const cx = cxOf(b);
      p.ell(cx - 2.5, b.y0 - 0.5, 2.6, 1.6, FIX.GOLD, undefined, true).ell(cx + 3, b.y0 - 0.5, 2.6, 1.6, FIX.GOLD, undefined, true).ell(cx + 0.5, b.y0 - 2, 2.6, 1.6, FIX.GOLD, undefined, true);
      p.px(cx - 3, b.y0 - 1, FIX.GOLD_L, true).px(cx, b.y0 - 3, FIX.GOLD_L, true).px(cx + 3, b.y0 - 1, FIX.GOLD_L, true);
    },
    { shade: false },
  ),
  part(
    'detail',
    'runes',
    'Runen',
    (b, p) => {
      const cx = cxOf(b);
      const cy = Math.round((b.y0 + b.y1) / 2);
      p.line(cx - 5, cy - 2, cx - 5, cy + 2, FIX.GLOW, true).line(cx - 5, cy - 2, cx - 3, cy, FIX.GLOW, true);
      p.line(cx, cy - 2, cx, cy + 2, FIX.GLOW, true).line(cx - 1, cy, cx + 1, cy, FIX.GLOW, true);
      p.line(cx + 4, cy - 2, cx + 5, cy + 2, FIX.GLOW, true).line(cx + 5, cy + 2, cx + 6, cy - 2, FIX.GLOW, true);
    },
    { outline: false, shade: false },
  ),
  part(
    'detail',
    'web',
    'Spinnweben',
    (b, p) => {
      const { x0, y0 } = b;
      p.line(x0, y0, x0 + 6, y0, FIX.WHITE, true).line(x0, y0, x0, y0 + 6, FIX.WHITE, true).line(x0, y0, x0 + 4, y0 + 4, FIX.WHITE, true);
      p.line(x0 + 3, y0, x0, y0 + 3, FIX.WHITE, true).line(x0 + 5, y0, x0 + 3, y0 + 3, FIX.WHITE, true).line(x0 + 3, y0 + 3, x0, y0 + 5, FIX.WHITE, true);
    },
    { outline: false, shade: false },
  ),
  part('detail', 'gems', 'Edelsteine', (b, p) => {
    const cx = cxOf(b);
    const y = Math.round(b.y0 + (b.y1 - b.y0) * 0.3);
    p.rect(cx - 5, y, cx - 4, y + 1, FIX.RED, true).rect(cx + 4, y, cx + 5, y + 1, FIX.GLOW_D, true).rect(cx, y - 1, cx, y, FIX.GOLD, true);
  }),
];

// ---------------------------------------------------------------- effects

const EFFECTS: DemoPart[] = [
  part(
    'effect',
    'fire',
    'Feuer',
    (b, p) => {
      const cx = cxOf(b) + 0.5;
      p.ell(cx, b.y0 - 3.5, 3.6, 4.8, FIX.FIRE_D, undefined, true).tri(cx - 2, b.y0 - 6, cx + 1, b.y0 - 6, cx - 1, b.y0 - 11, FIX.FIRE_D);
      p.ell(cx, b.y0 - 3, 2.5, 3.6, FIX.FIRE, undefined, true).ell(cx, b.y0 - 2, 1.3, 2.2, FIX.FIRE_L, undefined, true);
    },
    { shade: false },
  ),
  part(
    'effect',
    'sparkle',
    'Funkeln',
    (b, p) => {
      for (const [x, y] of [
        [b.x0 - 1, b.y0 + 2],
        [b.x1 + 1, b.y0 + 5],
        [cxOf(b) + 3, b.y0 - 2],
      ]) {
        p.px(x, y, FIX.WHITE, true).px(x - 1, y, FIX.GLOW, true).px(x + 1, y, FIX.GLOW, true).px(x, y - 1, FIX.GLOW, true).px(x, y + 1, FIX.GLOW, true);
      }
    },
    { outline: false, shade: false },
  ),
  part(
    'effect',
    'smoke',
    'Rauch',
    (b, p) => {
      const cx = cxOf(b);
      p.ell(cx + 2, b.y0 - 3, 2.6, 2, C('stone', 0), undefined, true).ell(cx - 1, b.y0 - 7, 3, 2.2, C('stone', 0), undefined, true).ell(cx + 1, b.y0 - 11, 2, 1.6, C('stone', 0), undefined, true);
    },
    { outline: false, shade: false },
  ),
  part(
    'effect',
    'glow',
    'Leuchten',
    (b, p) => {
      for (let x = b.x0 - 1; x <= b.x1 + 1; x += 2) p.px(x, b.y0 - 2, FIX.GLOW_D, true).px(x + 1, b.y1 + 2, FIX.GLOW_D, true);
      for (let y = b.y0; y <= b.y1; y += 2) p.px(b.x0 - 2, y, FIX.GLOW_D, true).px(b.x1 + 2, y + 1, FIX.GLOW_D, true);
    },
    { outline: false, shade: false },
  ),
];

const SHADOWS: DemoPart[] = [
  part(
    'shadow',
    'soft',
    'Schatten',
    (b, p) => {
      p.ell((b.x0 + b.x1 + 1) / 2, Math.min(30.5, 29.5), (b.x1 - b.x0) / 2 + 2, 2, FIX.SHADOW, undefined, true);
    },
    { outline: false, shade: false },
  ),
];

export const OBJECT_PARTS: DemoPart[] = [...BASES, ...DETAILS, ...EFFECTS, ...SHADOWS];
