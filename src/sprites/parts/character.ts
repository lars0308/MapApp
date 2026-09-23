import { C, FIX, Painter } from '../painter';
import type { Body, DemoPart, FitContext, SlotDef } from '../types';

// Chibi characters, front view, 32 × 32. Every part is painted from the body measurements,
// so clothes, hair and weapons fit all body types (plug and play).

export const CHARACTER_SLOTS: SlotDef[] = [
  { id: 'shadow', label: 'Schatten' },
  { id: 'body', label: 'Körper' },
  { id: 'legs', label: 'Hose' },
  { id: 'feet', label: 'Schuhe' },
  { id: 'top', label: 'Oberteil' },
  { id: 'hands', label: 'Hände' },
  { id: 'face', label: 'Gesicht' },
  { id: 'headx', label: 'Kopf-Extra' },
  { id: 'hair', label: 'Haare' },
  { id: 'hat', label: 'Kopfbedeckung' },
  { id: 'weapon', label: 'Waffe' },
  { id: 'offhand', label: 'Zweite Hand' },
  { id: 'extra', label: 'Eigene', multi: true },
];

export const BODIES: Record<string, Body> = {
  normal: { hx: 16, hy: 10, hrx: 6.8, hry: 6.2, t: [11, 16, 20, 23], aL: [8, 9], aR: [22, 23], ay: [17, 24], lL: [12, 14], lR: [17, 19], ly: [24, 29] },
  strong: { hx: 16, hy: 10, hrx: 7.2, hry: 6.3, t: [10, 16, 21, 23], aL: [7, 8], aR: [23, 24], ay: [17, 24], lL: [11, 14], lR: [17, 20], ly: [24, 29] },
  slim: { hx: 16, hy: 10, hrx: 6.4, hry: 6.2, t: [12, 16, 19, 23], aL: [9, 10], aR: [21, 22], ay: [17, 24], lL: [13, 14], lR: [17, 18], ly: [24, 29] },
  child: { hx: 16, hy: 12, hrx: 6.6, hry: 6, t: [12, 18, 19, 24], aL: [9, 10], aR: [21, 22], ay: [19, 25], lL: [13, 14], lR: [17, 18], ly: [25, 29] },
};

const SKIN = C('skin');
const HAIR = C('hair');
const P1 = C('primary');
const P2 = C('secondary');
const MET = C('metal');
const WOOD = C('wood');

const head = (b: Body) => ({ xl: Math.floor(b.hx - b.hrx), xr: Math.ceil(b.hx + b.hrx) - 1, top: Math.floor(b.hy - b.hry), ey: Math.round(b.hy) });

type Paint = (b: Body, p: Painter) => void;
const part = (slot: string, id: string, label: string, paint: Paint, opts: { outline?: boolean; shade?: boolean } = {}): DemoPart => ({
  id: `c.${slot}.${id}`,
  kind: 'character',
  slot,
  label,
  paint: (ctx: FitContext) => {
    const p = new Painter();
    paint(ctx.body, p);
    return p.finish(opts);
  },
});

const bodyPart = (id: string, label: string, b: Body): DemoPart => ({
  ...part('body', id, label, (_, p) => {
    p.ell(b.hx, b.hy, b.hrx, b.hry, SKIN);
    const [x0, y0, x1, y1] = b.t;
    p.rect(x0, y0, x1, y1, SKIN);
    p.rect(b.aL[0], b.ay[0], b.aL[1], b.ay[1], SKIN);
    p.rect(b.aR[0], b.ay[0], b.aR[1], b.ay[1], SKIN);
    p.rect(b.lL[0], b.ly[0], b.lL[1], b.ly[1], SKIN);
    p.rect(b.lR[0], b.ly[0], b.lR[1], b.ly[1], SKIN);
  }),
  body: b,
});

// ---------------------------------------------------------------- face (no outline)

const eyes2 = (b: Body, p: Painter, h = 2) => {
  const { ey } = head(b);
  for (const ex of [b.hx - 4, b.hx + 2]) {
    p.rect(ex, ey, ex + 1, ey + h - 1, FIX.EYE, true);
    p.px(ex + 1, ey, FIX.WHITE, true);
  }
};
const mouth = (b: Body, p: Painter) => {
  const { ey } = head(b);
  p.rect(b.hx - 1, ey + 3, b.hx, ey + 3, C('skin', 2), true);
};

const FACES: DemoPart[] = [
  part('face', 'normal', 'Normal', (b, p) => (eyes2(b, p), mouth(b, p)), { outline: false, shade: false }),
  part(
    'face',
    'happy',
    'Fröhlich',
    (b, p) => {
      const { ey } = head(b);
      for (const ex of [b.hx - 4, b.hx + 2]) p.px(ex, ey + 1, FIX.EYE, true).px(ex + 1, ey, FIX.EYE, true).px(ex + 2, ey + 1, FIX.EYE, true);
      p.px(b.hx - 2, ey + 3, FIX.EYE, true).rect(b.hx - 1, ey + 4, b.hx, ey + 4, FIX.EYE, true).px(b.hx + 1, ey + 3, FIX.EYE, true);
      p.px(b.hx - 5, ey + 2, FIX.RED, true).px(b.hx + 4, ey + 2, FIX.RED, true);
    },
    { outline: false, shade: false },
  ),
  part(
    'face',
    'grim',
    'Grimmig',
    (b, p) => {
      const { ey } = head(b);
      p.rect(b.hx - 4, ey + 1, b.hx - 3, ey + 1, FIX.EYE, true).rect(b.hx + 2, ey + 1, b.hx + 3, ey + 1, FIX.EYE, true);
      p.line(b.hx - 5, ey - 1, b.hx - 3, ey, FIX.EYE, true).line(b.hx + 4, ey - 1, b.hx + 2, ey, FIX.EYE, true);
      p.rect(b.hx - 2, ey + 3, b.hx + 1, ey + 3, C('skin', 2), true);
    },
    { outline: false, shade: false },
  ),
  part('face', 'big', 'Große Augen', (b, p) => (eyes2(b, p, 3), p.px(b.hx - 3, head(b).ey + 2, FIX.WHITE, true), p.px(b.hx + 3, head(b).ey + 2, FIX.WHITE, true), mouth(b, p)), {
    outline: false,
    shade: false,
  }),
  part(
    'face',
    'sleepy',
    'Müde',
    (b, p) => {
      const { ey } = head(b);
      p.rect(b.hx - 4, ey + 1, b.hx - 3, ey + 1, FIX.EYE, true).rect(b.hx + 2, ey + 1, b.hx + 3, ey + 1, FIX.EYE, true);
      p.px(b.hx, ey + 3, C('skin', 2), true);
    },
    { outline: false, shade: false },
  ),
];

// ---------------------------------------------------------------- hair

const cap = (b: Body, p: Painter) => {
  // hairline stays above the eyes (its outline must not cover them)
  p.ell(b.hx, b.hy - 0.6, b.hrx + 0.7, b.hry + 0.4, HAIR, (_, y) => y <= b.hy - 3);
  const { xl, xr } = head(b);
  p.rect(xl, b.hy - 3, xl + 1, b.hy - 1, HAIR).rect(xr - 1, b.hy - 3, xr, b.hy - 1, HAIR);
};

const HAIRS: DemoPart[] = [
  part('hair', 'short', 'Kurz', (b, p) => {
    cap(b, p);
    p.rect(b.hx - 4, b.hy - 2, b.hx - 2, b.hy - 2, HAIR).px(b.hx + 1, b.hy - 2, HAIR);
  }),
  part('hair', 'long', 'Lang', (b, p) => {
    cap(b, p);
    const { xl, xr } = head(b);
    p.rect(xl - 1, b.hy - 3, xl, b.hy + 7, HAIR).rect(xr, b.hy - 3, xr + 1, b.hy + 7, HAIR);
    p.rect(b.hx - 4, b.hy - 2, b.hx - 3, b.hy - 2, HAIR);
  }),
  part('hair', 'spiky', 'Stachelig', (b, p) => {
    cap(b, p);
    const t = b.hy - b.hry;
    for (const [x, h] of [
      [-5, 3],
      [-2, 4.5],
      [1, 4.5],
      [4, 3],
    ])
      p.tri(b.hx + x - 2, t + 2, b.hx + x + 2, t + 2, b.hx + x + (x < 0 ? -1 : 1), t + 2 - h, HAIR);
  }),
  part('hair', 'tail', 'Zopf', (b, p) => {
    cap(b, p);
    const { xr } = head(b);
    p.ell(xr + 3, b.hy + 2, 2.2, 4.2, HAIR);
    p.px(xr + 2, b.hy - 2, C('primary', 1), true).px(xr + 3, b.hy - 2, C('primary', 1), true);
  }),
  part('hair', 'mohawk', 'Irokese', (b, p) => {
    p.rect(b.hx - 2, b.hy - b.hry - 3, b.hx + 1, b.hy - 3, HAIR);
  }),
  part('hair', 'curly', 'Locken', (b, p) => {
    cap(b, p);
    for (let a = 0; a <= 6; a++) {
      const ang = Math.PI + (a / 6) * Math.PI;
      p.ell(b.hx + Math.cos(ang) * (b.hrx + 0.3), b.hy - 0.5 + Math.sin(ang) * (b.hry + 0.2), 2.2, 2.2, HAIR);
    }
  }),
  part('hair', 'bun', 'Dutt', (b, p) => {
    cap(b, p);
    p.ell(b.hx, b.hy - b.hry - 1.2, 3, 2.4, HAIR);
  }),
];

// ---------------------------------------------------------------- head extras

const HEADX: DemoPart[] = [
  part('headx', 'elf', 'Elfenohren', (b, p) => {
    const { xl, xr } = head(b);
    p.tri(xl + 1, b.hy - 1, xl + 1, b.hy + 2, xl - 3, b.hy - 4, SKIN).tri(xr, b.hy - 1, xr, b.hy + 2, xr + 4, b.hy - 4, SKIN);
  }),
  part('headx', 'horns', 'Hörner', (b, p) => {
    const t = b.hy - b.hry;
    p.tri(b.hx - 6, t + 3, b.hx - 3, t + 1.5, b.hx - 7, t - 3, C('stone', 0)).tri(b.hx + 6, t + 3, b.hx + 3, t + 1.5, b.hx + 7, t - 3, C('stone', 0));
  }),
  part('headx', 'beard', 'Bart', (b, p) => {
    p.ell(b.hx, b.hy + 3.5, b.hrx - 1.2, 4, HAIR, (_, y) => y >= Math.round(b.hy) + 2);
  }),
  part(
    'headx',
    'tusks',
    'Hauer',
    (b, p) => {
      const { ey } = head(b);
      p.rect(b.hx - 3, ey + 2, b.hx - 3, ey + 3, FIX.WHITE, true).rect(b.hx + 2, ey + 2, b.hx + 2, ey + 3, FIX.WHITE, true);
    },
    { shade: false },
  ),
  part(
    'headx',
    'patch',
    'Augenklappe',
    (b, p) => {
      const { xl, xr, ey } = head(b);
      p.line(xl, ey - 3, xr, ey - 1, FIX.EYE, true);
      p.rect(b.hx - 5, ey - 1, b.hx - 2, ey + 1, FIX.EYE, true);
    },
    { outline: false, shade: false },
  ),
];

// ---------------------------------------------------------------- clothes

const TOPS: DemoPart[] = [
  part('top', 'tunic', 'Tunika', (b, p) => {
    const [x0, y0, x1, y1] = b.t;
    p.rect(x0, y0, x1, y1 + 1, P1);
    p.rect(b.aL[0], b.ay[0], b.aL[1], b.ay[0] + 3, P1).rect(b.aR[0], b.ay[0], b.aR[1], b.ay[0] + 3, P1);
    p.rect(x0, y1 - 1, x1, y1 - 1, C('wood', 2), true);
    p.px(Math.floor((x0 + x1) / 2), y1 - 1, FIX.GOLD, true);
  }),
  part('top', 'armor', 'Rüstung', (b, p) => {
    const [x0, y0, x1, y1] = b.t;
    p.rect(x0, y0, x1, y1, MET);
    p.ell((b.aL[0] + b.aL[1] + 1) / 2, b.ay[0] + 1, 2.3, 2, MET).ell((b.aR[0] + b.aR[1] + 1) / 2, b.ay[0] + 1, 2.3, 2, MET);
    const cx = Math.floor((x0 + x1) / 2);
    p.rect(cx, y0 + 2, cx + 1, y1 - 2, C('metal', 0), true);
    p.rect(x0, y1, x1, y1, C('wood', 2), true);
  }),
  part('top', 'robe', 'Robe', (b, p) => {
    const [x0, y0, x1, y1] = b.t;
    p.rect(x0, y0, x1, y1, P1).rect(x0 - 1, y1, x1 + 1, b.ly[1] - 1, P1);
    p.rect(b.aL[0], b.ay[0], b.aL[1], b.ay[1] - 2, P1).rect(b.aR[0], b.ay[0], b.aR[1], b.ay[1] - 2, P1);
    p.rect(x0 - 1, b.ly[1] - 1, x1 + 1, b.ly[1] - 1, C('secondary', 1), true);
    p.rect(x0, y1 - 1, x1, y1 - 1, FIX.GOLD, true);
  }),
  part('top', 'vest', 'Weste', (b, p) => {
    const [x0, y0, x1, y1] = b.t;
    p.rect(x0, y0, x1, y1, C('primary', 0));
    p.rect(x0, y0, x0 + 2, y1, P2).rect(x1 - 2, y0, x1, y1, P2);
  }),
  part('top', 'shirt', 'Hemd', (b, p) => {
    const [x0, y0, x1, y1] = b.t;
    p.rect(x0, y0, x1, y1, P1);
    p.rect(b.aL[0], b.ay[0], b.aL[1], b.ay[0] + 1, P1).rect(b.aR[0], b.ay[0], b.aR[1], b.ay[0] + 1, P1);
    const cx = Math.floor((x0 + x1) / 2);
    p.px(cx, y0, FIX.WHITE, true).px(cx + 1, y0, FIX.WHITE, true);
  }),
];

const LEGS: DemoPart[] = [
  part('legs', 'pants', 'Hose', (b, p) => {
    const [x0, , x1, y1] = b.t;
    p.rect(x0, y1, x1, b.ly[0], P2);
    p.rect(b.lL[0], b.ly[0], b.lL[1], b.ly[1] - 1, P2).rect(b.lR[0], b.ly[0], b.lR[1], b.ly[1] - 1, P2);
  }),
  part('legs', 'shorts', 'Kurze Hose', (b, p) => {
    const [x0, , x1, y1] = b.t;
    p.rect(x0, y1, x1, b.ly[0], P2);
    p.rect(b.lL[0], b.ly[0], b.lL[1], b.ly[0] + 1, P2).rect(b.lR[0], b.ly[0], b.lR[1], b.ly[0] + 1, P2);
  }),
  part('legs', 'skirt', 'Rock', (b, p) => {
    const [x0, , x1, y1] = b.t;
    for (let y = y1; y <= b.ly[0] + 2; y++) {
      const g = Math.floor((y - y1) / 2);
      p.rect(x0 - g, y, x1 + g, y, P2);
    }
  }),
];

const FEET: DemoPart[] = [
  part('feet', 'boots', 'Stiefel', (b, p) => {
    const y = b.ly[1];
    p.rect(b.lL[0], y - 2, b.lL[1], y, WOOD).rect(b.lL[0] - 1, y, b.lL[1], y, WOOD);
    p.rect(b.lR[0], y - 2, b.lR[1], y, WOOD).rect(b.lR[0], y, b.lR[1] + 1, y, WOOD);
  }),
  part('feet', 'iron', 'Eisenstiefel', (b, p) => {
    const y = b.ly[1];
    p.rect(b.lL[0], y - 3, b.lL[1], y, MET).rect(b.lL[0] - 1, y, b.lL[1], y, MET);
    p.rect(b.lR[0], y - 3, b.lR[1], y, MET).rect(b.lR[0], y, b.lR[1] + 1, y, MET);
  }),
  part('feet', 'shoes', 'Schuhe', (b, p) => {
    const y = b.ly[1];
    p.rect(b.lL[0] - 1, y, b.lL[1], y, WOOD).rect(b.lR[0], y, b.lR[1] + 1, y, WOOD);
  }),
];

const HANDS: DemoPart[] = [
  part('hands', 'gloves', 'Handschuhe', (b, p) => {
    p.rect(b.aL[0], b.ay[1] - 1, b.aL[1], b.ay[1], WOOD).rect(b.aR[0], b.ay[1] - 1, b.aR[1], b.ay[1], WOOD);
  }),
  part('hands', 'gauntlets', 'Panzerhandschuhe', (b, p) => {
    p.rect(b.aL[0], b.ay[1] - 3, b.aL[1], b.ay[1], MET).rect(b.aR[0], b.ay[1] - 3, b.aR[1], b.ay[1], MET);
  }),
  part('hands', 'bracers', 'Armschienen', (b, p) => {
    p.rect(b.aL[0], b.ay[1] - 4, b.aL[1], b.ay[1] - 2, WOOD).rect(b.aR[0], b.ay[1] - 4, b.aR[1], b.ay[1] - 2, WOOD);
  }),
];

const HATS: DemoPart[] = [
  part('hat', 'helmet', 'Helm', (b, p) => {
    const { xl, xr } = head(b);
    p.ell(b.hx, b.hy - 0.3, b.hrx + 1, b.hry + 0.8, MET, (_, y) => y <= b.hy - 2);
    p.rect(xl - 1, b.hy - 2, xr + 1, b.hy - 2, MET);
    p.rect(b.hx - 1, b.hy - 1, b.hx, b.hy + 1, MET);
  }),
  part('hat', 'wizard', 'Zauberhut', (b, p) => {
    const t = b.hy - b.hry;
    p.tri(b.hx - 6, t + 3, b.hx + 6, t + 3, b.hx + 3, t - 9, P1);
    p.ell(b.hx, t + 3.5, b.hrx + 3, 1.7, P1);
    p.rect(b.hx - 5, t + 1, b.hx + 4, t + 1, C('secondary', 1), true);
  }),
  part('hat', 'hood', 'Kapuze', (b, p) => {
    const rx = b.hrx - 1.4;
    const ry = b.hry - 1.3;
    p.ell(b.hx, b.hy, b.hrx + 1.6, b.hry + 1.5, P2, (x, y) => ((x + 0.5 - b.hx) / rx) ** 2 + ((y + 0.5 - (b.hy + 1)) / ry) ** 2 > 1);
  }),
  part(
    'hat',
    'crown',
    'Krone',
    (b, p) => {
      const t = Math.floor(b.hy - b.hry);
      p.rect(b.hx - 4, t - 1, b.hx + 3, t, FIX.GOLD, true);
      for (const x of [b.hx - 4, b.hx - 1, b.hx + 2]) p.rect(x, t - 3, x + 1, t - 2, FIX.GOLD, true);
      p.px(b.hx - 1, t, FIX.RED, true).px(b.hx, t, FIX.RED, true);
      p.px(b.hx - 4, t - 1, FIX.GOLD_L, true);
    },
    { shade: false },
  ),
  part('hat', 'band', 'Stirnband', (b, p) => {
    const { xl, xr } = head(b);
    p.rect(xl, b.hy - 3, xr, b.hy - 3, P1);
    p.line(xr + 1, b.hy - 3, xr + 3, b.hy, P1);
  }),
];

// ---------------------------------------------------------------- held items

const hand = (b: Body) => ({ gx: b.aR[1] + 1, hy: b.ay[1], ox: b.aL[0] - 1 });

const WEAPONS: DemoPart[] = [
  part('weapon', 'sword', 'Schwert', (b, p) => {
    const { gx, hy } = hand(b);
    p.rect(gx, hy - 13, gx + 1, hy - 3, MET).px(gx, hy - 14, MET);
    p.rect(gx - 1, hy - 2, gx + 2, hy - 2, C('metal', 2), true);
    p.rect(gx, hy - 1, gx + 1, hy + 1, WOOD);
    p.px(gx, hy + 2, FIX.GOLD, true);
  }),
  part('weapon', 'axe', 'Axt', (b, p) => {
    const { gx, hy } = hand(b);
    p.rect(gx, hy - 11, gx, hy + 2, WOOD);
    p.ell(gx + 2.5, hy - 8.5, 3, 3.6, MET, (x) => x > gx);
  }),
  part('weapon', 'staff', 'Zauberstab', (b, p) => {
    const { gx, hy } = hand(b);
    p.rect(gx, hy - 14, gx, hy + 4, WOOD);
    p.ell(gx + 0.5, hy - 16, 2.4, 2.4, FIX.GLOW_D, undefined, true);
    p.px(gx, hy - 17, FIX.GLOW, true).px(gx - 1, hy - 16, FIX.GLOW, true).px(gx, hy - 16, FIX.WHITE, true);
  }),
  part('weapon', 'spear', 'Speer', (b, p) => {
    const { gx, hy } = hand(b);
    p.rect(gx, hy - 13, gx, hy + 4, WOOD);
    p.tri(gx - 1.5, hy - 13, gx + 2.5, hy - 13, gx + 0.5, hy - 19, MET);
  }),
  part('weapon', 'bow', 'Bogen', (b, p) => {
    const { gx, hy } = hand(b);
    for (let y = hy - 10; y <= hy + 4; y++) p.px(gx + Math.round(3 * Math.sin((Math.PI * (y - (hy - 10))) / 14)), y, WOOD);
    p.line(gx, hy - 10, gx, hy + 4, FIX.WHITE, true);
  }),
  part('weapon', 'torch', 'Fackel', (b, p) => {
    const { gx, hy } = hand(b);
    p.rect(gx, hy - 5, gx + 1, hy + 1, WOOD);
    p.ell(gx + 1, hy - 8, 2.2, 3.2, FIX.FIRE_D, undefined, true).ell(gx + 1, hy - 7.5, 1.4, 2.2, FIX.FIRE, undefined, true).px(gx, hy - 7, FIX.FIRE_L, true);
  }),
  part('weapon', 'hammer', 'Hammer', (b, p) => {
    const { gx, hy } = hand(b);
    p.rect(gx, hy - 10, gx, hy + 2, WOOD);
    p.rect(gx - 2, hy - 13, gx + 3, hy - 10, MET);
  }),
];

const OFFHANDS: DemoPart[] = [
  part('offhand', 'round', 'Rundschild', (b, p) => {
    const { ox, hy } = hand(b);
    p.ell(ox, hy - 2, 4.4, 5, MET).ell(ox, hy - 2, 3.3, 3.9, WOOD);
    p.px(ox - 1, hy - 3, C('metal', 0), true);
  }),
  part('offhand', 'heater', 'Wappenschild', (b, p) => {
    const { ox, hy } = hand(b);
    p.rect(ox - 4, hy - 8, ox + 3, hy - 2, P1).tri(ox - 4, hy - 2, ox + 4, hy - 2, ox, hy + 3, P1);
    p.rect(ox - 1, hy - 7, ox, hy + 1, C('secondary', 0), true).rect(ox - 3, hy - 5, ox + 2, hy - 4, C('secondary', 0), true);
  }),
  part('offhand', 'book', 'Buch', (b, p) => {
    const { ox, hy } = hand(b);
    p.rect(ox - 3, hy - 3, ox + 1, hy + 1, P1);
    p.rect(ox + 1, hy - 2, ox + 1, hy, FIX.WHITE, true);
    p.px(ox - 1, hy - 1, FIX.GOLD, true);
  }),
  part('offhand', 'lantern', 'Laterne', (b, p) => {
    const { ox, hy } = hand(b);
    p.rect(ox - 2, hy - 3, ox + 1, hy + 2, MET);
    p.rect(ox - 1, hy - 2, ox, hy + 1, FIX.GLOW, true);
    p.px(ox - 1, hy - 5, MET).px(ox, hy - 5, MET).px(ox - 1, hy - 4, MET);
  }),
  part('offhand', 'potion', 'Trank', (b, p) => {
    const { ox, hy } = hand(b);
    p.ell(ox, hy, 2.6, 2.6, FIX.RED, undefined, true);
    p.rect(ox - 1, hy - 4, ox, hy - 2, C('stone', 0)).px(ox - 1, hy - 5, WOOD);
    p.px(ox - 1, hy - 1, FIX.WHITE, true);
  }),
];

const SHADOWS: DemoPart[] = [
  part(
    'shadow',
    'soft',
    'Schatten',
    (b, p) => {
      p.ell(16, b.ly[1] + 1.6, 8, 1.7, FIX.SHADOW, undefined, true);
    },
    { outline: false, shade: false },
  ),
];

export const CHARACTER_PARTS: DemoPart[] = [
  bodyPart('normal', 'Normal', BODIES.normal),
  bodyPart('strong', 'Kräftig', BODIES.strong),
  bodyPart('slim', 'Schlank', BODIES.slim),
  bodyPart('child', 'Klein', BODIES.child),
  ...FACES,
  ...HAIRS,
  ...HEADX,
  ...TOPS,
  ...LEGS,
  ...FEET,
  ...HANDS,
  ...HATS,
  ...WEAPONS,
  ...OFFHANDS,
  ...SHADOWS,
];

