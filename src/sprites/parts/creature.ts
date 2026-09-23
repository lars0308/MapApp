import { C, FIX, Painter } from '../painter';
import type { Creature, DemoPart, FitContext, SlotDef, View } from '../types';

// Creatures / monsters / enemies, 32 × 32. A body type (slime, bat, spider, ghost …) defines
// where eyes, mouth, horns, wings and limbs go, so every part fits every body.

export const CREATURE_SLOTS: SlotDef[] = [
  { id: 'shadow', label: 'Schatten' },
  { id: 'back', label: 'Flügel & Schwanz', multi: true },
  { id: 'body', label: 'Körper' },
  { id: 'pattern', label: 'Muster', multi: true },
  { id: 'limbs', label: 'Arme & Klauen' },
  { id: 'eyes', label: 'Augen' },
  { id: 'mouth', label: 'Maul' },
  { id: 'horns', label: 'Hörner & Ohren' },
  { id: 'aura', label: 'Aura', multi: true },
  { id: 'extra', label: 'Eigene', multi: true },
];

const P1 = C('primary');
const P2 = C('secondary');
const SKIN = C('skin');
const HAIR = C('hair');
const MET = C('metal');
const STONE = C('stone');
const LEAF = C('leaf');
const WOOD = C('wood');

type Paint = (c: Creature, p: Painter) => void;

/** side view: eyes and mouth move to the front (right), from behind they are hidden */
export function viewCreature(c: Creature, view: View): Creature {
  return { ...c, view };
}

const part = (slot: string, id: string, label: string, paint: Paint, opts: { outline?: boolean; shade?: boolean } = {}): DemoPart => ({
  id: `k.${slot}.${id}`,
  kind: 'creature',
  slot,
  label,
  paint: (ctx: FitContext) => {
    const p = new Painter();
    const c = ctx.creature;
    if (c.view === 'back' && (slot === 'eyes' || slot === 'mouth')) return p;
    if (c.view === 'side' && (slot === 'eyes' || slot === 'mouth')) {
      // one eye / mouth half at the front of the body
      paint({ ...c, eyeDX: 0, cx: c.cx + Math.max(2, c.rx * 0.45) }, p);
      if (slot === 'eyes') p.clearWhere((x) => x < c.cx);
    } else paint(c, p);
    if (c.view === 'side' && slot === 'back') p.shiftX(-3);
    if (c.view === 'back' && slot === 'back') {
      // seen from behind the wings are in front – nothing to change, the layer order does it
    }
    return p.finish(opts);
  },
});

const body = (id: string, label: string, m: Creature, paint: (p: Painter) => void): DemoPart => ({ ...part('body', id, label, (_, p) => paint(p)), creature: m });

// ---------------------------------------------------------------- bodies

const BODIES: DemoPart[] = [
  body('slime', 'Schleim', { cx: 16, cy: 22, rx: 10, ry: 8, ground: 28, top: 14, eyeY: 21, eyeDX: 4, mouthY: 25 }, (p) => {
    p.ell(16, 23, 10.5, 9, P1, (_, y) => y <= 28);
    p.rect(7, 27, 24, 28, P1);
    p.px(10, 29, P1).px(21, 29, P1);
    p.rect(10, 17, 11, 18, C('primary', 0), true).px(12, 16, C('primary', 0), true);
  }),
  body('bat', 'Fledermaus', { cx: 16, cy: 16, rx: 6, ry: 5.5, ground: 22, top: 9, eyeY: 15, eyeDX: 2.5, mouthY: 18, fly: true }, (p) => {
    p.ell(16, 16.5, 6, 5.8, P2);
    p.tri(11, 13, 13, 11, 11, 7, P2).tri(21, 13, 19, 11, 21, 7, P2);
    p.px(14, 23, P2).px(18, 23, P2);
  }),
  body('spider', 'Spinne', { cx: 16, cy: 19, rx: 7, ry: 5.5, ground: 28, top: 12, eyeY: 17, eyeDX: 2.5, mouthY: 21 }, (p) => {
    for (const [a, b, c] of [
      [9, 19, 3],
      [9, 21, 2],
      [10, 23, 3],
      [11, 24, 5],
    ]) {
      p.line(a, b, a - 4, b - c, P2).line(a - 4, b - c, a - 6, 28, P2);
      p.line(32 - a - 1, b, 32 - a + 3, b - c, P2).line(32 - a + 3, b - c, 32 - a + 5, 28, P2);
    }
    p.ell(16, 19, 7, 5.8, P2);
    p.ell(16, 24, 5, 3.5, C('secondary', 0));
  }),
  body('ghost', 'Geist', { cx: 16, cy: 16, rx: 8, ry: 9, ground: 27, top: 6, eyeY: 14, eyeDX: 3.5, mouthY: 19, fly: true }, (p) => {
    p.ell(16, 14.5, 8.2, 8.2, STONE, (_, y) => y <= 15);
    p.rect(8, 15, 23, 25, STONE);
    for (let x = 8; x <= 23; x++) if (Math.floor((x - 8) / 2) % 2 === 0) p.px(x, 26, STONE);
    p.px(9, 12, C('stone', 0), true).px(10, 10, C('stone', 0), true);
  }),
  body('eye', 'Schwebendes Auge', { cx: 16, cy: 15, rx: 8, ry: 8, ground: 26, top: 7, eyeY: 15, eyeDX: 0, mouthY: 21, fly: true }, (p) => {
    p.ell(16, 15.5, 8.5, 8.5, SKIN);
    p.ell(16, 15.5, 5.2, 5.2, FIX.WHITE, undefined, true);
  }),
  body('mushroom', 'Pilz', { cx: 16, cy: 19, rx: 5, ry: 7, ground: 27, top: 6, eyeY: 19, eyeDX: 2.5, mouthY: 22 }, (p) => {
    p.rect(11, 15, 20, 27, C('stone', 0));
    p.ell(16, 14, 11, 7.5, P1, (_, y) => y <= 15);
    p.rect(5, 14, 26, 15, P1);
    for (const [x, y] of [
      [10, 10],
      [16, 8],
      [21, 11],
      [13, 13],
    ])
      p.rect(x, y, x + 1, y + 1, FIX.WHITE, true);
  }),
  body('beetle', 'Käfer', { cx: 16, cy: 20, rx: 9, ry: 7, ground: 28, top: 9, eyeY: 13, eyeDX: 2.5, mouthY: 15 }, (p) => {
    for (const y of [18, 22, 25]) p.line(8, y, 4, y + 2, P2).line(23, y, 27, y + 2, P2);
    p.ell(16, 21, 9, 7.2, P1);
    p.line(16, 15, 16, 27, C('primary', 2), true);
    p.ell(16, 13.5, 5, 3.8, P2);
  }),
  body('wolf', 'Wolf', { cx: 16, cy: 15, rx: 7, ry: 6, ground: 29, top: 5, eyeY: 14, eyeDX: 3, mouthY: 20 }, (p) => {
    p.rect(10, 20, 21, 26, HAIR);
    p.rect(10, 26, 11, 29, HAIR).rect(20, 26, 21, 29, HAIR).rect(13, 26, 14, 29, HAIR).rect(17, 26, 18, 29, HAIR);
    p.ell(16, 15, 7.2, 6.3, HAIR);
    p.tri(10, 11, 13, 9, 10, 4, HAIR).tri(22, 11, 19, 9, 22, 4, HAIR);
    p.ell(16, 19, 3.6, 2.8, C('hair', 0));
    p.px(15, 17, FIX.EYE, true).px(16, 17, FIX.EYE, true);
  }),
  body('golem', 'Golem', { cx: 16, cy: 17, rx: 8, ry: 9, ground: 29, top: 5, eyeY: 9, eyeDX: 2, mouthY: 11 }, (p) => {
    p.rect(9, 13, 22, 26, STONE);
    p.rect(12, 6, 19, 12, STONE);
    p.rect(4, 13, 7, 24, STONE).rect(24, 13, 27, 24, STONE);
    p.rect(10, 27, 13, 29, STONE).rect(18, 27, 21, 29, STONE);
    p.px(12, 17, C('stone', 2), true).px(19, 21, C('stone', 2), true).px(15, 24, C('stone', 2), true);
  }),
  body('dragon', 'Drachenbaby', { cx: 16, cy: 20, rx: 7, ry: 6, ground: 28, top: 6, eyeY: 12, eyeDX: 3, mouthY: 15 }, (p) => {
    p.ell(16, 21.5, 7, 6.5, LEAF);
    p.ell(16, 23, 4, 4, C('leaf', 0));
    p.ell(16, 12.5, 6, 5, LEAF);
    p.rect(11, 27, 13, 28, LEAF).rect(18, 27, 20, 28, LEAF);
    p.px(14, 15, C('leaf', 2), true).px(17, 15, C('leaf', 2), true);
  }),
  body('goblin', 'Kobold', { cx: 16, cy: 13, rx: 6, ry: 5.5, ground: 29, top: 7, eyeY: 13, eyeDX: 2.5, mouthY: 16 }, (p) => {
    p.ell(16, 13, 6.2, 5.6, LEAF);
    p.rect(12, 18, 19, 24, WOOD);
    p.rect(10, 19, 11, 23, LEAF).rect(20, 19, 21, 23, LEAF);
    p.rect(13, 25, 14, 29, LEAF).rect(17, 25, 18, 29, LEAF);
  }),
  body('skeleton', 'Skelett', { cx: 16, cy: 12, rx: 6, ry: 5.5, ground: 29, top: 6, eyeY: 12, eyeDX: 2.5, mouthY: 15 }, (p) => {
    const B = C('stone', 0);
    p.ell(16, 12, 6, 5.6, B);
    p.rect(15, 18, 16, 25, B);
    for (const y of [19, 21, 23]) p.rect(12, y, 19, y, B);
    p.line(11, 19, 9, 24, B).line(20, 19, 22, 24, B);
    p.line(14, 26, 13, 29, B).line(17, 26, 18, 29, B);
    p.rect(13, 25, 18, 25, B);
  }),
];

// ---------------------------------------------------------------- eyes / mouth

const eyePos = (c: Creature) => (c.eyeDX < 1 ? [Math.round(c.cx - 1)] : [Math.round(c.cx - c.eyeDX - 1), Math.round(c.cx + c.eyeDX - 1)]);

const EYES: DemoPart[] = [
  part(
    'eyes',
    'two',
    'Augen',
    (c, p) => {
      for (const x of eyePos(c)) p.rect(x, c.eyeY, x + 1, c.eyeY + 1, FIX.EYE, true).px(x + 1, c.eyeY, FIX.WHITE, true);
    },
    { outline: false, shade: false },
  ),
  part(
    'eyes',
    'angry',
    'Böse Augen',
    (c, p) => {
      for (const x of eyePos(c)) {
        const inner = x < c.cx ? x + 1 : x;
        p.rect(x, c.eyeY, x + 1, c.eyeY + 1, FIX.RED, true).px(inner, c.eyeY, FIX.EYE, true);
        p.line(x - (x < c.cx ? 1 : -2), c.eyeY - 2, inner, c.eyeY - 1, FIX.EYE, true);
      }
    },
    { outline: false, shade: false },
  ),
  part(
    'eyes',
    'cyclops',
    'Ein großes Auge',
    (c, p) => {
      const x = Math.round(c.cx);
      p.ell(x, c.eyeY + 0.5, 3.2, 3, FIX.WHITE, undefined, true).ell(x, c.eyeY + 0.5, 1.6, 1.8, P1, undefined, true).px(x - 1, c.eyeY, FIX.EYE, true).px(x, c.eyeY, FIX.EYE, true);
    },
    { shade: false },
  ),
  part(
    'eyes',
    'many',
    'Viele Augen',
    (c, p) => {
      for (const [dx, dy] of [
        [-4, 0],
        [-2, -1],
        [1, -1],
        [3, 0],
        [-1, 1],
        [0, 1],
      ])
        p.px(Math.round(c.cx + dx), c.eyeY + dy, FIX.RED, true);
    },
    { outline: false, shade: false },
  ),
  part(
    'eyes',
    'glow',
    'Leuchtende Augen',
    (c, p) => {
      for (const x of eyePos(c)) p.rect(x, c.eyeY, x + 1, c.eyeY, FIX.GLOW, true).rect(x, c.eyeY + 1, x + 1, c.eyeY + 1, FIX.GLOW_D, true);
    },
    { outline: false, shade: false },
  ),
  part(
    'eyes',
    'slit',
    'Schlitzaugen',
    (c, p) => {
      for (const x of eyePos(c)) p.rect(x, c.eyeY, x + 1, c.eyeY + 1, FIX.GOLD, true).px(x + (x < c.cx ? 1 : 0), c.eyeY, FIX.EYE, true).px(x + (x < c.cx ? 1 : 0), c.eyeY + 1, FIX.EYE, true);
    },
    { outline: false, shade: false },
  ),
  part(
    'eyes',
    'button',
    'Knopfaugen',
    (c, p) => {
      for (const x of eyePos(c)) p.px(x, c.eyeY, FIX.EYE, true).px(x + 1, c.eyeY, FIX.EYE, true);
    },
    { outline: false, shade: false },
  ),
];

const MOUTHS: DemoPart[] = [
  part(
    'mouth',
    'smile',
    'Lächeln',
    (c, p) => {
      const x = Math.round(c.cx);
      p.px(x - 2, c.mouthY, FIX.EYE, true).rect(x - 1, c.mouthY + 1, x, c.mouthY + 1, FIX.EYE, true).px(x + 1, c.mouthY, FIX.EYE, true);
    },
    { outline: false, shade: false },
  ),
  part(
    'mouth',
    'teeth',
    'Zähne',
    (c, p) => {
      const x = Math.round(c.cx);
      p.rect(x - 3, c.mouthY, x + 2, c.mouthY + 1, FIX.EYE, true);
      for (let i = x - 3; i <= x + 2; i += 2) p.px(i, c.mouthY, FIX.WHITE, true);
    },
    { outline: false, shade: false },
  ),
  part(
    'mouth',
    'fangs',
    'Reißzähne',
    (c, p) => {
      const x = Math.round(c.cx);
      p.rect(x - 2, c.mouthY, x + 1, c.mouthY, FIX.EYE, true).px(x - 2, c.mouthY + 1, FIX.WHITE, true).px(x + 1, c.mouthY + 1, FIX.WHITE, true);
    },
    { outline: false, shade: false },
  ),
  part(
    'mouth',
    'open',
    'Offenes Maul',
    (c, p) => {
      const x = Math.round(c.cx);
      p.ell(x, c.mouthY + 1, 2.8, 2, FIX.EYE, undefined, true).rect(x - 1, c.mouthY + 2, x, c.mouthY + 2, FIX.RED, true);
    },
    { outline: false, shade: false },
  ),
  part(
    'mouth',
    'tongue',
    'Zunge raus',
    (c, p) => {
      const x = Math.round(c.cx);
      p.rect(x - 2, c.mouthY, x + 1, c.mouthY, FIX.EYE, true).rect(x, c.mouthY + 1, x + 1, c.mouthY + 2, FIX.RED, true);
    },
    { shade: false },
  ),
  part(
    'mouth',
    'mandibles',
    'Kieferzangen',
    (c, p) => {
      const x = Math.round(c.cx);
      p.line(x - 2, c.mouthY, x - 3, c.mouthY + 3, C('secondary', 0)).line(x + 1, c.mouthY, x + 2, c.mouthY + 3, C('secondary', 0));
    },
    { shade: false },
  ),
];

// ---------------------------------------------------------------- horns / ears

const HORNS: DemoPart[] = [
  part('horns', 'horns', 'Hörner', (c, p) => {
    const t = c.top;
    p.tri(c.cx - 5, t + 3, c.cx - 2, t + 1.5, c.cx - 6, t - 3, C('stone', 0)).tri(c.cx + 5, t + 3, c.cx + 2, t + 1.5, c.cx + 6, t - 3, C('stone', 0));
  }),
  part(
    'horns',
    'devil',
    'Teufelshörner',
    (c, p) => {
      const t = c.top;
      p.tri(c.cx - 4, t + 2, c.cx - 2, t + 1, c.cx - 4, t - 3, FIX.RED).tri(c.cx + 4, t + 2, c.cx + 2, t + 1, c.cx + 4, t - 3, FIX.RED);
    },
    { shade: false },
  ),
  part('horns', 'antennae', 'Fühler', (c, p) => {
    const t = c.top;
    p.line(c.cx - 2, t + 1, c.cx - 5, t - 4, FIX.EYE, true).line(c.cx + 1, t + 1, c.cx + 4, t - 4, FIX.EYE, true);
    p.px(c.cx - 5, t - 5, FIX.GOLD, true).px(c.cx + 4, t - 5, FIX.GOLD, true);
  }),
  part('horns', 'ears', 'Spitze Ohren', (c, p) => {
    p.tri(c.cx - c.rx + 1, c.eyeY - 1, c.cx - c.rx + 1, c.eyeY + 2, c.cx - c.rx - 4, c.eyeY - 4, LEAF).tri(c.cx + c.rx - 1, c.eyeY - 1, c.cx + c.rx - 1, c.eyeY + 2, c.cx + c.rx + 4, c.eyeY - 4, LEAF);
  }),
  part('horns', 'spikes', 'Stacheln', (c, p) => {
    for (let i = -2; i <= 2; i++) p.tri(c.cx + i * 3 - 1.5, c.top + 2, c.cx + i * 3 + 1.5, c.top + 2, c.cx + i * 3, c.top - 2 + Math.abs(i), MET);
  }),
  part('horns', 'unicorn', 'Einhorn', (c, p) => {
    p.tri(c.cx - 1.5, c.top + 1, c.cx + 1.5, c.top + 1, c.cx + 0.5, c.top - 6, FIX.GOLD);
  }),
  part(
    'horns',
    'crown',
    'Krone (Boss)',
    (c, p) => {
      const t = c.top;
      p.rect(c.cx - 4, t - 1, c.cx + 3, t, FIX.GOLD, true);
      for (const x of [c.cx - 4, c.cx - 1, c.cx + 2]) p.rect(x, t - 3, x + 1, t - 2, FIX.GOLD, true);
      p.px(c.cx - 1, t, FIX.RED, true);
    },
    { shade: false },
  ),
];

// ---------------------------------------------------------------- wings & tails (behind)

const BACK: DemoPart[] = [
  part('back', 'batwings', 'Fledermausflügel', (c, p) => {
    const y = c.cy - 2;
    p.tri(c.cx - c.rx + 2, y - 1, c.cx - c.rx - 8, y - 5, c.cx - c.rx - 7, y + 6, P2).tri(c.cx + c.rx - 2, y - 1, c.cx + c.rx + 8, y - 5, c.cx + c.rx + 7, y + 6, P2);
    p.clear(c.cx - c.rx - 5, y + 4, c.cx - c.rx - 4, y + 6).clear(c.cx + c.rx + 4, y + 4, c.cx + c.rx + 5, y + 6);
  }),
  part('back', 'dragonwings', 'Drachenflügel', (c, p) => {
    const y = c.cy - 3;
    p.tri(c.cx - 3, y, c.cx - c.rx - 7, y - 7, c.cx - c.rx - 5, y + 5, LEAF).tri(c.cx + 3, y, c.cx + c.rx + 7, y - 7, c.cx + c.rx + 5, y + 5, LEAF);
    p.line(c.cx - 4, y, c.cx - c.rx - 6, y - 6, C('leaf', 2), true).line(c.cx + 4, y, c.cx + c.rx + 6, y - 6, C('leaf', 2), true);
  }),
  part(
    'back',
    'bugwings',
    'Insektenflügel',
    (c, p) => {
      const y = c.cy - 3;
      p.ell(c.cx - c.rx - 2, y, 4, 2.5, FIX.GLOW, undefined, true).ell(c.cx + c.rx + 2, y, 4, 2.5, FIX.GLOW, undefined, true);
    },
    { shade: false },
  ),
  part('back', 'tail', 'Schwanz', (c, p) => {
    for (let i = 0; i < 7; i++) p.ell(c.cx + c.rx - 1 + i * 0.9, c.ground - 2 - Math.sin((i / 6) * Math.PI) * 3 - i * 0.5, 1.4, 1.4, P1);
  }),
  part('back', 'spiketail', 'Stachelschwanz', (c, p) => {
    for (let i = 0; i < 6; i++) p.ell(c.cx + c.rx - 1 + i, c.ground - 2 - i * 0.8, 1.3, 1.3, LEAF);
    p.tri(c.cx + c.rx + 4, c.ground - 8, c.cx + c.rx + 7, c.ground - 9, c.cx + c.rx + 6, c.ground - 12, MET);
  }),
];

// ---------------------------------------------------------------- limbs

const LIMBS: DemoPart[] = [
  part('limbs', 'claws', 'Klauen', (c, p) => {
    const y = c.cy;
    const l = c.cx - c.rx - 1;
    const r = c.cx + c.rx;
    p.rect(l - 1, y, l, y + 3, P1).rect(r, y, r + 1, y + 3, P1);
    for (const x of [l - 2, l, r, r + 2]) p.px(x, y + 4, FIX.WHITE, true);
  }),
  part('limbs', 'tentacles', 'Tentakel', (c, p) => {
    for (const dx of [-5, -2, 1, 4]) for (let i = 0; i < 6; i++) p.px(c.cx + dx + Math.round(Math.sin(i + dx) * 0.8), c.ground - 3 + i, SKIN);
  }),
  part('limbs', 'arms', 'Kleine Arme', (c, p) => {
    const y = c.cy + 1;
    p.line(c.cx - c.rx, y, c.cx - c.rx - 3, y + 3, P1).line(c.cx + c.rx - 1, y, c.cx + c.rx + 2, y + 3, P1);
  }),
  part('limbs', 'club', 'Keule', (c, p) => {
    const x = Math.round(c.cx + c.rx + 1);
    const y = Math.round(c.cy + 2);
    p.rect(x, y - 6, x, y + 2, WOOD).ell(x + 0.5, y - 8, 2, 2.6, WOOD);
  }),
  part('limbs', 'sword', 'Schwert', (c, p) => {
    const x = Math.round(c.cx + c.rx + 1);
    const y = Math.round(c.cy + 3);
    p.rect(x, y - 11, x + 1, y - 2, MET).rect(x - 1, y - 1, x + 2, y - 1, C('metal', 2), true).rect(x, y, x + 1, y + 1, WOOD);
  }),
  part(
    'limbs',
    'staff',
    'Zauberstab',
    (c, p) => {
      const x = Math.round(c.cx + c.rx + 1);
      p.rect(x, c.top + 2, x, c.ground, WOOD).ell(x + 0.5, c.top, 2, 2, FIX.GLOW_D, undefined, true).px(x, c.top - 1, FIX.GLOW, true);
    },
    { shade: false },
  ),
];

// ---------------------------------------------------------------- pattern (on the body)

const inBody = (c: Creature) => (x: number, y: number) => ((x + 0.5 - c.cx) / (c.rx - 1)) ** 2 + ((y + 0.5 - c.cy) / (c.ry - 1)) ** 2 <= 1;

const PATTERNS: DemoPart[] = [
  part(
    'pattern',
    'spots',
    'Punkte',
    (c, p) => {
      const ok = inBody(c);
      for (const [dx, dy] of [
        [-4, 2],
        [3, 3],
        [-1, 4],
        [5, -1],
        [-5, -2],
      ]) {
        const x = Math.round(c.cx + dx);
        const y = Math.round(c.cy + dy);
        if (ok(x, y)) p.px(x, y, C('secondary', 0), true);
      }
    },
    { outline: false, shade: false },
  ),
  part(
    'pattern',
    'stripes',
    'Streifen',
    (c, p) => {
      const ok = inBody(c);
      for (let y = Math.round(c.cy - c.ry); y <= c.cy + c.ry; y += 3) for (let x = Math.round(c.cx - c.rx); x <= c.cx + c.rx; x++) if (ok(x, y) && Math.abs(x - c.cx) > 1) p.px(x, y, C('secondary', 2), true);
    },
    { outline: false, shade: false },
  ),
  part(
    'pattern',
    'belly',
    'Bauch',
    (c, p) => {
      p.ell(c.cx, c.cy + c.ry * 0.35, c.rx * 0.5, c.ry * 0.45, C('skin', 0), undefined, true);
    },
    { outline: false, shade: false },
  ),
  part(
    'pattern',
    'cracks',
    'Risse',
    (c, p) => {
      p.line(c.cx - 3, c.cy - 3, c.cx - 1, c.cy, FIX.OUTLINE, true).line(c.cx - 1, c.cy, c.cx - 2, c.cy + 3, FIX.OUTLINE, true).line(c.cx + 3, c.cy + 1, c.cx + 4, c.cy + 3, FIX.OUTLINE, true);
    },
    { outline: false, shade: false },
  ),
  part(
    'pattern',
    'scars',
    'Narben',
    (c, p) => {
      p.line(c.cx + 1, c.cy - 2, c.cx + 4, c.cy + 1, FIX.RED, true).line(c.cx - 4, c.cy + 2, c.cx - 2, c.cy + 3, FIX.RED, true);
    },
    { outline: false, shade: false },
  ),
];

// ---------------------------------------------------------------- aura / effects

const AURA: DemoPart[] = [
  part(
    'aura',
    'fire',
    'Feuer-Aura',
    (c, p) => {
      for (let i = 0; i < 7; i++) {
        const a = (i / 6) * Math.PI;
        const x = c.cx + Math.cos(a) * (c.rx + 2);
        const y = c.cy - Math.sin(a) * (c.ry + 2);
        p.px(x, y, i % 2 ? FIX.FIRE : FIX.FIRE_L, true).px(x, y - 1, FIX.FIRE_D, true);
      }
    },
    { outline: false, shade: false },
  ),
  part(
    'aura',
    'poison',
    'Gift-Blasen',
    (c, p) => {
      for (const [dx, dy, r] of [
        [-c.rx - 1, -2, 1.4],
        [c.rx + 1, -4, 1.1],
        [c.rx - 1, -c.ry - 2, 1.6],
        [-c.rx + 2, -c.ry - 1, 1],
      ])
        p.ell(c.cx + dx, c.cy + dy, r, r, C('leaf', 0), undefined, true);
    },
    { shade: false },
  ),
  part(
    'aura',
    'shadow',
    'Schatten-Rauch',
    (c, p) => {
      for (let x = Math.round(c.cx - c.rx - 1); x <= c.cx + c.rx + 1; x += 2) p.px(x, c.ground + 1 - ((x * 7) % 3), C('secondary', 2), true).px(x + 1, c.ground - ((x * 5) % 2), C('secondary', 2), true);
    },
    { outline: false, shade: false },
  ),
  part(
    'aura',
    'sparks',
    'Funken',
    (c, p) => {
      for (const [dx, dy] of [
        [-c.rx - 2, -c.ry],
        [c.rx + 2, -c.ry + 3],
        [c.rx, c.ry - 1],
      ])
        p.px(c.cx + dx, c.cy + dy, FIX.WHITE, true).px(c.cx + dx - 1, c.cy + dy, FIX.GOLD, true).px(c.cx + dx + 1, c.cy + dy, FIX.GOLD, true).px(c.cx + dx, c.cy + dy - 1, FIX.GOLD, true).px(c.cx + dx, c.cy + dy + 1, FIX.GOLD, true);
    },
    { outline: false, shade: false },
  ),
];

const SHADOWS: DemoPart[] = [
  part(
    'shadow',
    'soft',
    'Schatten',
    (c, p) => {
      p.ell(c.cx, c.fly ? 29.5 : c.ground + 1.5, c.fly ? c.rx * 0.7 : c.rx + 1, 1.6, FIX.SHADOW, undefined, true);
    },
    { outline: false, shade: false },
  ),
];

export const DEFAULT_CREATURE: Creature = BODIES[0].creature!;
export const CREATURE_PARTS: DemoPart[] = [...BODIES, ...EYES, ...MOUTHS, ...HORNS, ...BACK, ...LIMBS, ...PATTERNS, ...AURA, ...SHADOWS];
