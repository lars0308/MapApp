import { C, FIX, Painter } from '../painter';
import { isBackView, type Body, type DemoPart, type FitContext, type SlotDef, type View } from '../types';

// Chibi characters, front view, 32 × 32. Every part is painted from the body measurements,
// so clothes, hair and weapons fit all body types (plug and play).

export const CHARACTER_SLOTS: SlotDef[] = [
  { id: 'shadow', label: 'Schatten' },
  { id: 'back', label: 'Rücken' },
  { id: 'body', label: 'Körper' },
  { id: 'legs', label: 'Hose' },
  { id: 'feet', label: 'Schuhe' },
  { id: 'top', label: 'Oberteil' },
  { id: 'hands', label: 'Hände' },
  { id: 'face', label: 'Gesicht' },
  { id: 'headx', label: 'Kopf-Extra', multi: true },
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
  round: { hx: 16, hy: 10, hrx: 7, hry: 6.2, t: [10, 16, 21, 24], aL: [7, 8], aR: [23, 24], ay: [17, 24], lL: [11, 14], lR: [17, 20], ly: [25, 29] },
  tall: { hx: 16, hy: 8, hrx: 6, hry: 5.4, t: [12, 14, 19, 21], aL: [9, 10], aR: [21, 22], ay: [15, 22], lL: [13, 14], lR: [17, 18], ly: [22, 29] },
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
/** Body for another view: side = narrow torso, one arm, legs side by side, facing right. */
export function viewBody(b: Body, view: View): Body {
  if (view === 'fside' || view === 'bside') {
    // three-quarter view: narrower torso, arms right next to it, legs closer together
    const tw = Math.max(5, Math.round((b.t[2] - b.t[0] + 1) * 0.8));
    const t0 = Math.round(b.hx - tw / 2);
    const t1 = t0 + tw - 1;
    const aw = b.aR[1] - b.aR[0] + 1;
    const lw = b.lR[1] - b.lR[0] + 1;
    return {
      ...b,
      view,
      hrx: b.hrx - 0.2,
      t: [t0, b.t[1], t1, b.t[3]],
      aL: [t0 - aw, t0 - 1],
      aR: [t1 + 1, t1 + aw],
      lL: [b.hx - 1 - lw, b.hx - 2],
      lR: [b.hx, b.hx + lw - 1],
    };
  }
  if (view !== 'side') return { ...b, view };
  const hx = b.hx;
  const tw = Math.max(5, Math.round((b.t[2] - b.t[0] + 1) * 0.6));
  const t0 = Math.round(hx - tw / 2);
  const armW = b.aR[1] - b.aR[0] + 1;
  const lw = b.lR[1] - b.lR[0] + 1;
  const arm: [number, number] = [hx - 1, hx - 2 + armW];
  return { ...b, view, hrx: b.hrx - 0.5, t: [t0, b.t[1], t0 + tw - 1, b.t[3]], aL: arm, aR: arm, lL: [hx - lw, hx - 1], lR: [hx, hx + lw - 1] };
}

/** which parts exist in which view (face from behind, shield behind the body from the side …) */
function visibleIn(slot: string, id: string, view: View | undefined): boolean {
  if (isBackView(view)) return slot !== 'face' && (slot !== 'headx' || ['elf', 'horns', 'catears'].includes(id));
  if (view === 'side') return slot !== 'offhand' && !(slot === 'headx' && id === 'patch');
  return true;
}

const part = (slot: string, id: string, label: string, paint: Paint, opts: { outline?: boolean; shade?: boolean } = {}): DemoPart => ({
  id: `c.${slot}.${id}`,
  kind: 'character',
  slot,
  label,
  paint: (ctx: FitContext) => {
    const p = new Painter();
    const b = ctx.body;
    if (!visibleIn(slot, id, b.view)) return p;
    const side = b.view === 'side';
    if (side && slot === 'face') sideFace(id, b, p);
    else if (side && slot === 'headx' && SIDE_HEADX[id]) SIDE_HEADX[id](b, p);
    else paint(b, p);
    // turned a little to the right: eyes, mouth and what sits on the face move to the right
    if (b.view === 'fside' && (slot === 'face' || (slot === 'headx' && FACE_HEADX.has(id)))) p.squeezeX(b.hx, 0.7, 2);
    // things on the back peek out behind the body (on the far side)
    if (slot === 'back' && (b.view === 'fside' || b.view === 'bside') && id !== 'tail') p.shiftX(-1);
    if (side) {
      // face side (right) stays free of hair below the hairline
      if (slot === 'hair') p.clearWhere((x, y) => x >= b.hx && y >= b.hy - 2 && y <= b.hy + 4 && x <= b.hx + b.hrx + 1);
      // things on the back peek out behind the body; a tail points backwards
      if (slot === 'back') {
        if (id === 'tail') p.mirrorX(b.hx);
        else p.shiftX(-3);
      }
    }
    if (slot === 'weapon') {
      // held in the fist: lean out of the hand, then leave the fist free so the hand
      // (body / gloves) lies over the grip
      const h = weaponHand(b);
      const pose = weaponPose(`c.weapon.${id}`, b.view);
      if (pose.sx !== 1 || pose.sy !== 1) p.scale(h.cx, h.hy, pose.sx, pose.sy);
      if (pose.rest) p.rotate(h.cx, h.hy, pose.rest);
      p.finish(opts);
      return p.clearWhere((x, y) => x >= h.x0 && x <= h.x1 && y >= h.hy - 1 && y <= h.hy);
    }
    return p.finish(opts);
  },
});

/** head extras that sit on the face (turn with it) */
const FACE_HEADX = new Set(['glasses', 'patch', 'beard', 'tusks', 'mustache', 'freckles', 'scar', 'paint', 'mask']);

/** side view faces (looking right): one eye, mouth at the front */
function sideFace(id: string, b: Body, p: Painter) {
  const { ey } = head(b);
  const ex = b.hx + 2;
  const mouth = () => p.px(b.hx + 4, ey + 3, C('skin', 2), true);
  switch (id) {
    case 'happy':
      p.px(ex - 1, ey + 1, FIX.EYE, true).px(ex, ey, FIX.EYE, true).px(ex + 1, ey + 1, FIX.EYE, true);
      p.px(b.hx + 4, ey + 3, FIX.EYE, true).px(b.hx + 1, ey + 2, FIX.RED, true);
      break;
    case 'grim':
    case 'angry':
      p.rect(ex, ey + 1, ex + 1, ey + 1, FIX.EYE, true).line(ex - 1, ey - 1, ex + 1, ey, FIX.EYE, true);
      p.rect(b.hx + 3, ey + 3, b.hx + 4, ey + 3, FIX.EYE, true);
      break;
    case 'sleepy':
      p.rect(ex, ey + 1, ex + 1, ey + 1, FIX.EYE, true);
      mouth();
      break;
    case 'cat':
      p.rect(ex, ey, ex + 1, ey + 1, FIX.GOLD, true).px(ex + 1, ey, FIX.EYE, true).px(ex + 1, ey + 1, FIX.EYE, true);
      mouth();
      break;
    case 'surprised':
      p.rect(ex, ey, ex, ey + 1, FIX.EYE, true).px(ex + 1, ey, FIX.WHITE, true);
      p.rect(b.hx + 4, ey + 3, b.hx + 4, ey + 4, FIX.EYE, true);
      break;
    case 'wink':
      p.rect(ex, ey + 1, ex + 1, ey + 1, FIX.EYE, true);
      p.px(b.hx + 4, ey + 3, FIX.EYE, true);
      break;
    default:
      p.rect(ex, ey, ex, ey + (id === 'big' ? 2 : 1), FIX.EYE, true).px(ex + 1, ey, FIX.WHITE, true);
      mouth();
  }
}

/** side view variants of head extras that are not symmetric */
const SIDE_HEADX: Record<string, Paint> = {
  elf: (b, p) => p.tri(b.hx - 1, b.hy - 1, b.hx - 1, b.hy + 2, b.hx - 5, b.hy - 4, SKIN),
  glasses: (b, p) => {
    const { ey } = head(b);
    const ex = b.hx + 2;
    p.line(ex - 1, ey - 1, ex + 2, ey - 1, FIX.EYE, true).line(ex - 1, ey + 2, ex + 2, ey + 2, FIX.EYE, true).line(ex - 1, ey, ex - 1, ey + 1, FIX.EYE, true);
    p.line(b.hx - 2, ey, ex - 2, ey, FIX.EYE, true);
  },
  mustache: (b, p) => {
    const { ey } = head(b);
    p.rect(b.hx + 2, ey + 2, b.hx + 4, ey + 2, C('hair', 1), true).px(b.hx + 2, ey + 3, C('hair', 1), true);
  },
  freckles: (b, p) => {
    const { ey } = head(b);
    p.px(b.hx + 1, ey + 2, C('skin', 2), true).px(b.hx + 2, ey + 3, C('skin', 2), true).px(b.hx + 3, ey + 2, C('skin', 2), true);
  },
  scar: (b, p) => {
    const { ey } = head(b);
    p.line(b.hx + 1, ey - 2, b.hx + 3, ey + 2, FIX.RED, true);
  },
  paint: (b, p) => {
    const { ey } = head(b);
    p.line(b.hx + 1, ey + 2, b.hx + 2, ey + 3, FIX.RED, true).line(b.hx + 2, ey + 2, b.hx + 3, ey + 3, FIX.RED, true);
  },
  tusks: (b, p) => {
    const { ey } = head(b);
    p.rect(b.hx + 3, ey + 2, b.hx + 3, ey + 3, FIX.WHITE, true);
  },
  beard: (b, p) => p.ell(b.hx + 1.5, b.hy + 3.5, b.hrx - 1.5, 4, HAIR, (_, y) => y >= Math.round(b.hy) + 2),
};

const bodyPart = (id: string, label: string, body: Body): DemoPart => ({
  ...part('body', id, label, (b, p) => {
    p.ell(b.hx, b.hy, b.hrx, b.hry, SKIN);
    // nose in profile
    if (b.view === 'side') p.px(Math.round(b.hx + b.hrx), Math.round(b.hy) + 1, SKIN);
    const [x0, y0, x1, y1] = b.t;
    p.rect(x0, y0, x1, y1, SKIN);
    p.rect(b.aL[0], b.ay[0], b.aL[1], b.ay[1], SKIN);
    p.rect(b.aR[0], b.ay[0], b.aR[1], b.ay[1], SKIN);
    p.rect(b.lL[0], b.ly[0], b.lL[1], b.ly[1], SKIN);
    p.rect(b.lR[0], b.ly[0], b.lR[1], b.ly[1], SKIN);
  }),
  body,
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
  // from behind the hair covers the whole head; from the side the back half
  if (isBackView(b.view)) {
    // three-quarter from behind: a bit of cheek and ear shows on the right
    const cheek = b.view === 'bside' ? b.hx + b.hrx - 2 : Infinity;
    p.ell(b.hx, b.hy - 0.6, b.hrx + 0.7, b.hry + 0.4, HAIR, (x, y) => y <= b.hy + 2 && !(x >= cheek && y >= b.hy - 2));
    return;
  }
  if (b.view === 'fside') {
    // three-quarter from the front: more hair at the back of the head (left)
    p.ell(b.hx, b.hy - 0.6, b.hrx + 0.7, b.hry + 0.4, HAIR, (x, y) => y <= b.hy - 3 || (x <= b.hx - 4 && y <= b.hy + 1));
    return;
  }
  if (b.view === 'side') {
    p.ell(b.hx, b.hy - 0.6, b.hrx + 0.7, b.hry + 0.4, HAIR, (x, y) => y <= b.hy - 3 || (x <= b.hx - 1 && y <= b.hy + 2));
    return;
  }
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
    // face opening: centre from the front, shifted forward from the side, none from behind
    const fx = b.view === 'side' ? b.hx + 2.5 : b.view === 'fside' ? b.hx + 1.5 : b.hx;
    const k = b.view === 'side' ? 0.7 : b.view === 'fside' ? 0.85 : 1;
    p.ell(b.hx, b.hy, b.hrx + 1.6, b.hry + 1.5, P2, (x, y) => isBackView(b.view) || ((x + 0.5 - fx) / (rx * k)) ** 2 + ((y + 0.5 - (b.hy + 1)) / ry) ** 2 > 1);
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

/**
 * Fist of the weapon arm (left in the picture when seen from behind): the 2 × 2 hand at the end of
 * the arm. cx / hy = its centre in pixel-corner coordinates – the grip of a weapon runs through it.
 */
export function weaponHand(b: Body) {
  // the weapon is in the figure's right hand: seen from the front that is the left of the
  // picture, seen from behind the right, from the side the near hand
  const a = frontish(b.view) ? b.aL : b.aR;
  return { cx: a[0] + 1, hy: b.ay[1], x0: a[0], x1: a[1] };
}

/** seen from the front or three-quarter front: the figure's right hand is left in the picture */
export const frontish = (v: View | undefined) => !v || v === 'front' || v === 'fside';

/** weapons that point where the figure looks (blades); the others are held upright */
const FORWARD = new Set(['sword', 'axe', 'hammer', 'spear']);
/** upright weapons: slight lean out of the hand (degrees, clockwise; 0 = straight up) */
const UPRIGHT_LEAN: Record<string, number> = { staff: 12, torch: 15, bow: 0 };

export interface WeaponPose {
  /** blade direction, degrees clockwise (0 = up) */
  rest: number;
  /** foreshortening across / along the blade */
  sx: number;
  sy: number;
}

/**
 * How a weapon is held in a view. Blades point forward – towards the viewer from the front
 * (down, shortened), forward from the side, away from the viewer from behind (up, seen
 * edge-on and shortened, behind the body).
 */
export function weaponPose(partId: string | null | undefined, view: View = 'front'): WeaponPose {
  const id = partId?.startsWith('c.weapon.') ? partId.slice(9) : '';
  if (FORWARD.has(id)) {
    if (view === 'side') return { rest: 75, sx: 1, sy: 1 };
    if (view === 'back') return { rest: 0, sx: 0.5, sy: 0.55 };
    // diagonals: down-right towards the viewer / up-right away from him
    if (view === 'fside') return { rest: 140, sx: 1, sy: 0.8 };
    if (view === 'bside') return { rest: 40, sx: 0.8, sy: 0.75 };
    return { rest: 195, sx: 1, sy: 0.6 };
  }
  // upright weapons lean outwards: to the left in the front picture, to the right from behind
  const lean = UPRIGHT_LEAN[id] ?? 0;
  return { rest: isBackView(view) ? lean : view === 'side' ? (lean ? lean + 10 : 0) : -lean, sx: 1, sy: 1 };
}

/** blade direction of a weapon part at rest (animation poses count from upright) */
export function weaponRest(partId: string | null | undefined, view: View = 'front'): number {
  return weaponPose(partId, view).rest;
}

/** weapon hand / other hand (shield) */
const hand = (b: Body) => {
  const gx = weaponHand(b).cx - 1;
  return frontish(b.view) ? { gx, hy: b.ay[1], ox: b.aR[1] + 2 } : { gx, hy: b.ay[1], ox: b.aL[0] - 1 };
};

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


// ---------------------------------------------------------------- more parts (v2)

const BACKS: DemoPart[] = [
  part('back', 'cape', 'Umhang', (b, p) => {
    p.rect(b.aL[0] - 1, b.ay[0], b.aR[1] + 1, b.ly[1] - 1, P2);
    for (let x = b.aL[0] - 1; x <= b.aR[1] + 1; x += 3) p.px(x, b.ly[1], P2);
  }),
  part(
    'back',
    'angel',
    'Engelsflügel',
    (b, p) => {
      for (const [cx, dir] of [
        [b.aL[0] - 2.5, -1],
        [b.aR[1] + 3.5, 1],
      ] as const) {
        p.ell(cx, b.ay[0] + 1, 3.8, 5.6, FIX.WHITE, undefined, true);
        for (let i = 0; i < 3; i++) p.line(cx - dir * 0.5, b.ay[0] + 2 + i * 2, cx + dir * 2.5, b.ay[0] + 3 + i * 2, C('stone', 0), true);
      }
    },
    { shade: false },
  ),
  part('back', 'bat', 'Fledermausflügel', (b, p) => {
    const y = b.ay[0];
    p.tri(b.aL[0] + 1, y - 1, b.aL[0] - 7, y - 4, b.aL[0] - 6, y + 7, P2).tri(b.aR[1] - 1, y - 1, b.aR[1] + 7, y - 4, b.aR[1] + 6, y + 7, P2);
    p.clear(b.aL[0] - 5, y + 5, b.aL[0] - 4, y + 7).clear(b.aR[1] + 4, y + 5, b.aR[1] + 5, y + 7);
  }),
  part('back', 'backpack', 'Rucksack', (b, p) => {
    p.rect(b.aL[0] - 1, b.ay[0] + 1, b.aR[1] + 1, b.ay[0] + 6, WOOD);
    p.rect(b.aL[0] - 1, b.ay[0] + 3, b.aL[0] - 1, b.ay[0] + 3, FIX.GOLD, true);
  }),
  part('back', 'quiver', 'Köcher', (b, p) => {
    const x = b.aR[1];
    p.line(x - 1, b.ay[0] + 7, x + 2, b.ay[0] - 5, WOOD).line(x, b.ay[0] + 7, x + 3, b.ay[0] - 5, WOOD);
    p.px(x + 2, b.ay[0] - 7, FIX.RED, true).px(x + 3, b.ay[0] - 7, FIX.RED, true).px(x + 4, b.ay[0] - 6, FIX.RED, true);
  }),
  part('back', 'tail', 'Schwanz', (b, p) => {
    const x = b.t[2] + 1;
    const y = b.t[3];
    for (let i = 0; i < 7; i++) p.ell(x + i * 0.9, y - Math.sin((i / 6) * Math.PI) * 3 - i * 0.6, 1.4, 1.4, HAIR);
  }),
];

const HAIRS2: DemoPart[] = [
  part('hair', 'side', 'Seitenscheitel', (b, p) => {
    cap(b, p);
    const { xl } = head(b);
    p.rect(b.hx - 6, b.hy - 3, b.hx + 1, b.hy - 2, HAIR).rect(xl - 1, b.hy - 3, xl, b.hy + 2, HAIR);
  }),
  part('hair', 'bangs', 'Pony', (b, p) => {
    cap(b, p);
    const { xl, xr } = head(b);
    p.rect(xl + 1, b.hy - 3, xr - 1, b.hy - 2, HAIR);
  }),
  part('hair', 'afro', 'Afro', (b, p) => {
    const { xl, xr } = head(b);
    p.ell(b.hx, b.hy - 2, b.hrx + 2.8, b.hry + 1.4, HAIR, (x, y) => y <= b.hy - 3 || x < xl + 1 || x > xr - 1);
  }),
  part('hair', 'pigtails', 'Zwei Zöpfe', (b, p) => {
    cap(b, p);
    const { xl, xr } = head(b);
    p.ell(xl - 1.5, b.hy + 1.5, 1.8, 3.6, HAIR).ell(xr + 2.5, b.hy + 1.5, 1.8, 3.6, HAIR);
    p.px(xl - 2, b.hy - 2, C('primary', 1), true).px(xr + 2, b.hy - 2, C('primary', 1), true);
  }),
  part('hair', 'undercut', 'Undercut', (b, p) => {
    p.ell(b.hx, b.hy - 0.6, b.hrx + 0.7, b.hry + 0.4, HAIR, (x, y) => y <= b.hy - 4 && x >= b.hx - 6 && x <= b.hx + 4);
    p.rect(b.hx - 6, b.hy - 3, b.hx - 1, b.hy - 3, HAIR);
  }),
  part('hair', 'waves', 'Lange Wellen', (b, p) => {
    cap(b, p);
    const { xl, xr } = head(b);
    for (let y = b.hy - 3; y <= b.hy + 9; y++) {
      const o = Math.round(Math.sin(y * 0.9));
      p.rect(xl - 1 + o, y, xl + o, y, HAIR).rect(xr - o, y, xr + 1 - o, y, HAIR);
    }
  }),
];

const HEADX2: DemoPart[] = [
  part('headx', 'catears', 'Katzenohren', (b, p) => {
    const t = b.hy - b.hry;
    p.tri(b.hx - 7, t + 3, b.hx - 3, t + 1, b.hx - 7, t - 3, HAIR).tri(b.hx + 6, t + 3, b.hx + 2, t + 1, b.hx + 6, t - 3, HAIR);
    p.px(b.hx - 6, t, FIX.RED, true).px(b.hx + 5, t, FIX.RED, true);
  }),
  part(
    'headx',
    'glasses',
    'Brille',
    (b, p) => {
      const { ey } = head(b);
      for (const ex of [b.hx - 4, b.hx + 2]) {
        p.line(ex - 1, ey - 1, ex + 2, ey - 1, FIX.EYE, true).line(ex - 1, ey + 2, ex + 2, ey + 2, FIX.EYE, true);
        p.line(ex - 1, ey, ex - 1, ey + 1, FIX.EYE, true).line(ex + 2, ey, ex + 2, ey + 1, FIX.EYE, true);
      }
      p.px(b.hx, ey, FIX.EYE, true).px(b.hx - 1, ey, FIX.EYE, true);
    },
    { outline: false, shade: false },
  ),
  part(
    'headx',
    'mustache',
    'Schnurrbart',
    (b, p) => {
      const { ey } = head(b);
      p.rect(b.hx - 3, ey + 2, b.hx + 2, ey + 2, C('hair', 1), true).px(b.hx - 4, ey + 3, C('hair', 1), true).px(b.hx + 3, ey + 3, C('hair', 1), true);
    },
    { outline: false, shade: false },
  ),
  part(
    'headx',
    'freckles',
    'Sommersprossen',
    (b, p) => {
      const { ey } = head(b);
      for (const [x, y] of [
        [-5, 2],
        [-4, 3],
        [-3, 2],
        [3, 2],
        [4, 3],
        [5, 2],
      ])
        p.px(b.hx + x, ey + y, C('skin', 2), true);
    },
    { outline: false, shade: false },
  ),
  part(
    'headx',
    'scar',
    'Narbe',
    (b, p) => {
      const { ey } = head(b);
      p.line(b.hx + 1, ey - 2, b.hx + 4, ey + 2, FIX.RED, true);
    },
    { outline: false, shade: false },
  ),
  part('headx', 'mask', 'Tuchmaske', (b, p) => {
    const { ey } = head(b);
    p.ell(b.hx, b.hy, b.hrx, b.hry, P2, (_, y) => y >= ey + 2);
  }),
  part(
    'headx',
    'paint',
    'Kriegsbemalung',
    (b, p) => {
      const { ey } = head(b);
      for (const x of [b.hx - 4, b.hx + 2]) p.line(x, ey + 2, x + 1, ey + 3, FIX.RED, true).line(x + 1, ey + 2, x + 2, ey + 3, FIX.RED, true);
    },
    { outline: false, shade: false },
  ),
];

const FACES2: DemoPart[] = [
  part(
    'face',
    'angry',
    'Wütend',
    (b, p) => {
      const { ey } = head(b);
      p.rect(b.hx - 4, ey + 1, b.hx - 3, ey + 1, FIX.EYE, true).rect(b.hx + 2, ey + 1, b.hx + 3, ey + 1, FIX.EYE, true);
      p.line(b.hx - 5, ey - 1, b.hx - 2, ey, FIX.EYE, true).line(b.hx + 4, ey - 1, b.hx + 1, ey, FIX.EYE, true);
      p.px(b.hx - 2, ey + 4, FIX.EYE, true).rect(b.hx - 1, ey + 3, b.hx, ey + 3, FIX.EYE, true).px(b.hx + 1, ey + 4, FIX.EYE, true);
    },
    { outline: false, shade: false },
  ),
  part(
    'face',
    'surprised',
    'Überrascht',
    (b, p) => {
      eyes2(b, p);
      const { ey } = head(b);
      p.rect(b.hx - 1, ey + 3, b.hx, ey + 4, FIX.EYE, true);
    },
    { outline: false, shade: false },
  ),
  part(
    'face',
    'wink',
    'Zwinkern',
    (b, p) => {
      const { ey } = head(b);
      p.rect(b.hx - 4, ey + 1, b.hx - 3, ey + 1, FIX.EYE, true);
      p.rect(b.hx + 2, ey, b.hx + 3, ey + 1, FIX.EYE, true).px(b.hx + 3, ey, FIX.WHITE, true);
      p.px(b.hx - 2, ey + 3, FIX.EYE, true).rect(b.hx - 1, ey + 4, b.hx, ey + 4, FIX.EYE, true).px(b.hx + 1, ey + 3, FIX.EYE, true);
    },
    { outline: false, shade: false },
  ),
  part(
    'face',
    'cat',
    'Katzenaugen',
    (b, p) => {
      const { ey } = head(b);
      for (const ex of [b.hx - 4, b.hx + 2]) p.rect(ex, ey, ex + 1, ey + 1, FIX.GOLD, true).px(ex + (ex < b.hx ? 1 : 0), ey, FIX.EYE, true).px(ex + (ex < b.hx ? 1 : 0), ey + 1, FIX.EYE, true);
      mouth(b, p);
    },
    { outline: false, shade: false },
  ),
];

const TOPS2: DemoPart[] = [
  part('top', 'leather', 'Lederrüstung', (b, p) => {
    const [x0, y0, x1, y1] = b.t;
    p.rect(x0, y0, x1, y1, WOOD);
    p.rect(b.aL[0], b.ay[0], b.aL[1], b.ay[0] + 2, WOOD).rect(b.aR[0], b.ay[0], b.aR[1], b.ay[0] + 2, WOOD);
    p.line(x0 + 1, y0, x1 - 1, y1 - 1, C('wood', 2), true);
    p.px(Math.floor((x0 + x1) / 2), Math.floor((y0 + y1) / 2), FIX.GOLD, true);
  }),
  part('top', 'chain', 'Kettenhemd', (b, p) => {
    const [x0, y0, x1, y1] = b.t;
    p.rect(x0, y0, x1, y1 + 1, MET);
    p.rect(b.aL[0], b.ay[0], b.aL[1], b.ay[0] + 4, MET).rect(b.aR[0], b.ay[0], b.aR[1], b.ay[0] + 4, MET);
    for (let y = y0 + 1; y <= y1; y++) for (let x = x0 + 1; x < x1; x++) if ((x + y) % 2 === 0) p.px(x, y, C('metal', 2), true);
  }),
  part('top', 'coat', 'Mantel', (b, p) => {
    const [x0, y0, x1, y1] = b.t;
    p.rect(x0, y0, x1, y1, P2);
    p.rect(x0 - 1, y1, x0 + 2, b.ly[1] - 1, P2).rect(x1 - 2, y1, x1 + 1, b.ly[1] - 1, P2);
    p.rect(b.aL[0], b.ay[0], b.aL[1], b.ay[1] - 2, P2).rect(b.aR[0], b.ay[0], b.aR[1], b.ay[1] - 2, P2);
    const cx = Math.floor((x0 + x1) / 2);
    p.rect(cx - 1, y0, cx + 1, y1, C('primary', 0), true);
  }),
  part('top', 'dress', 'Kleid', (b, p) => {
    const [x0, y0, x1, y1] = b.t;
    p.rect(x0, y0, x1, y1, P1);
    for (let y = y1; y <= b.ly[1] - 2; y++) {
      const g = Math.floor((y - y1) / 2);
      p.rect(x0 - g, y, x1 + g, y, P1);
    }
    p.rect(b.aL[0], b.ay[0], b.aL[1], b.ay[0] + 1, P1).rect(b.aR[0], b.ay[0], b.aR[1], b.ay[0] + 1, P1);
    p.rect(x0, y1 - 1, x1, y1 - 1, C('secondary', 0), true);
  }),
  part('top', 'hoodie', 'Kapuzenpulli', (b, p) => {
    const [x0, y0, x1, y1] = b.t;
    p.rect(x0, y0, x1, y1 + 1, P1);
    p.rect(b.aL[0], b.ay[0], b.aL[1], b.ay[1] - 2, P1).rect(b.aR[0], b.ay[0], b.aR[1], b.ay[1] - 2, P1);
    p.rect(x0 + 1, y0 - 1, x1 - 1, y0, P1);
    const cx = Math.floor((x0 + x1) / 2);
    p.rect(cx - 2, y1 - 2, cx + 2, y1, C('primary', 2), true);
    p.px(cx - 1, y0 + 1, FIX.WHITE, true).px(cx + 1, y0 + 1, FIX.WHITE, true);
  }),
  part('top', 'ninja', 'Kampfanzug', (b, p) => {
    const [x0, y0, x1, y1] = b.t;
    p.rect(x0, y0, x1, y1 + 1, P2);
    p.rect(b.aL[0], b.ay[0], b.aL[1], b.ay[1] - 2, P2).rect(b.aR[0], b.ay[0], b.aR[1], b.ay[1] - 2, P2);
    p.rect(x0, y1 - 1, x1, y1, C('primary', 1), true);
  }),
];

const LEGS2: DemoPart[] = [
  part('legs', 'greaves', 'Beinschienen', (b, p) => {
    const [x0, , x1, y1] = b.t;
    p.rect(x0, y1, x1, b.ly[0], P2);
    p.rect(b.lL[0], b.ly[0], b.lL[1], b.ly[1] - 1, MET).rect(b.lR[0], b.ly[0], b.lR[1], b.ly[1] - 1, MET);
  }),
  part('legs', 'leggings', 'Leggings', (b, p) => {
    const [x0, , x1, y1] = b.t;
    p.rect(x0, y1, x1, b.ly[0], P1);
    p.rect(b.lL[0], b.ly[0], b.lL[1], b.ly[1] - 1, P1).rect(b.lR[0], b.ly[0], b.lR[1], b.ly[1] - 1, P1);
  }),
];

const HATS2: DemoPart[] = [
  part('hat', 'beret', 'Barett', (b, p) => {
    const t = b.hy - b.hry;
    p.ell(b.hx - 1, t + 1.5, b.hrx - 0.3, 2.6, P1).px(b.hx - 1, t - 1.5, P1);
  }),
  part('hat', 'feather', 'Federhut', (b, p) => {
    const t = Math.floor(b.hy - b.hry);
    p.ell(b.hx, t + 3, b.hrx + 2.5, 1.6, P2).rect(b.hx - 4, t - 1, b.hx + 3, t + 2, P2);
    p.line(b.hx + 3, t + 1, b.hx + 7, t - 4, FIX.RED, true).line(b.hx + 4, t + 1, b.hx + 8, t - 4, FIX.RED, true);
  }),
  part('hat', 'bandana', 'Kopftuch', (b, p) => {
    p.ell(b.hx, b.hy - 0.6, b.hrx + 0.8, b.hry + 0.5, P1, (_, y) => y <= b.hy - 3);
    const { xl } = head(b);
    p.tri(xl, b.hy - 3, xl - 3, b.hy - 1, xl - 1, b.hy + 1, P1);
  }),
  part(
    'hat',
    'halo',
    'Heiligenschein',
    (b, p) => {
      const t = b.hy - b.hry - 2.5;
      p.ell(b.hx, t, 4.6, 1.5, FIX.GOLD_L, (x, y) => ((x + 0.5 - b.hx) / 3.2) ** 2 + ((y + 0.5 - t) / 0.6) ** 2 > 1, true);
    },
    { outline: false, shade: false },
  ),
  part('hat', 'viking', 'Hörnerhelm', (b, p) => {
    const { xl, xr } = head(b);
    const t = b.hy - b.hry;
    p.ell(b.hx, b.hy - 0.3, b.hrx + 1, b.hry + 0.8, MET, (_, y) => y <= b.hy - 3);
    p.rect(xl - 1, b.hy - 3, xr + 1, b.hy - 3, C('metal', 2), true);
    p.tri(xl, t + 3, xl + 2, t + 1.5, xl - 3, t - 3, C('stone', 0)).tri(xr + 1, t + 3, xr - 1, t + 1.5, xr + 4, t - 3, C('stone', 0));
  }),
  part('hat', 'witch', 'Hexenhut', (b, p) => {
    const t = b.hy - b.hry;
    p.ell(b.hx, t + 3.5, b.hrx + 4, 1.8, P2);
    p.tri(b.hx - 5, t + 3, b.hx + 5, t + 3, b.hx - 4, t - 10, P2);
    p.rect(b.hx - 4, t + 1, b.hx + 3, t + 1, FIX.GOLD, true);
  }),
];

const WEAPONS2: DemoPart[] = [
  part('weapon', 'dagger', 'Dolch', (b, p) => {
    const { gx, hy } = hand(b);
    p.rect(gx, hy - 7, gx, hy - 3, MET).rect(gx - 1, hy - 2, gx + 1, hy - 2, FIX.GOLD, true).rect(gx, hy - 1, gx, hy + 1, WOOD);
  }),
  part('weapon', 'mace', 'Streitkolben', (b, p) => {
    const { gx, hy } = hand(b);
    p.rect(gx, hy - 8, gx, hy + 2, WOOD);
    p.ell(gx + 0.5, hy - 10, 2.4, 2.4, MET);
    p.px(gx - 2, hy - 10, MET).px(gx + 3, hy - 10, MET).px(gx, hy - 13, MET);
  }),
  part('weapon', 'katana', 'Katana', (b, p) => {
    const { gx, hy } = hand(b);
    p.line(gx, hy - 3, gx + 1, hy - 10, MET).line(gx + 1, hy - 10, gx + 3, hy - 16, MET);
    p.rect(gx - 1, hy - 2, gx + 1, hy - 2, FIX.GOLD, true).rect(gx, hy - 1, gx, hy + 2, C('primary', 2));
  }),
  part('weapon', 'trident', 'Dreizack', (b, p) => {
    const { gx, hy } = hand(b);
    p.rect(gx, hy - 12, gx, hy + 4, WOOD);
    p.rect(gx - 2, hy - 13, gx + 2, hy - 13, MET);
    for (const x of [gx - 2, gx, gx + 2]) p.rect(x, hy - 17, x, hy - 14, MET);
  }),
  part('weapon', 'scythe', 'Sense', (b, p) => {
    const { gx, hy } = hand(b);
    p.rect(gx, hy - 15, gx, hy + 4, WOOD);
    for (let i = 0; i < 7; i++) p.px(gx - 1 - i, hy - 15 + Math.round((i * i) / 9), MET).px(gx - 1 - i, hy - 14 + Math.round((i * i) / 9), MET);
  }),
  part('weapon', 'wand', 'Zauberstab (Stern)', (b, p) => {
    const { gx, hy } = hand(b);
    p.rect(gx, hy - 6, gx, hy + 1, WOOD);
    p.px(gx, hy - 9, FIX.GOLD, true).rect(gx - 1, hy - 8, gx + 1, hy - 8, FIX.GOLD, true).px(gx, hy - 7, FIX.GOLD, true).px(gx, hy - 8, FIX.GOLD_L, true);
  }),
];

const OFFHANDS2: DemoPart[] = [
  part('offhand', 'sword', 'Zweites Schwert', (b, p) => {
    const { ox, hy } = hand(b);
    p.rect(ox - 1, hy - 13, ox, hy - 3, MET).px(ox, hy - 14, MET);
    p.rect(ox - 2, hy - 2, ox + 1, hy - 2, C('metal', 2), true).rect(ox - 1, hy - 1, ox, hy + 1, WOOD);
  }),
  part(
    'offhand',
    'orb',
    'Zauberkugel',
    (b, p) => {
      const { ox, hy } = hand(b);
      p.ell(ox - 0.5, hy - 2, 2.6, 2.6, FIX.GLOW_D, undefined, true).px(ox - 1, hy - 3, FIX.GLOW, true).px(ox - 2, hy - 3, FIX.WHITE, true);
    },
    { shade: false },
  ),
  part('offhand', 'flower', 'Blume', (b, p) => {
    const { ox, hy } = hand(b);
    p.line(ox, hy + 1, ox, hy - 5, C('leaf', 1));
    p.px(ox - 1, hy - 3, C('leaf', 0));
    for (const [x, y] of [
      [-1, -7],
      [1, -7],
      [0, -8],
      [0, -6],
    ])
      p.px(ox + x, hy + y, FIX.RED, true);
    p.px(ox, hy - 7, FIX.GOLD, true);
  }),
  part(
    'offhand',
    'key',
    'Schlüssel',
    (b, p) => {
      const { ox, hy } = hand(b);
      p.ell(ox, hy - 5, 1.6, 1.6, FIX.GOLD, undefined, true).clear(ox - 1, hy - 6, ox - 1, hy - 6);
      p.rect(ox - 1, hy - 3, ox - 1, hy + 1, FIX.GOLD, true).px(ox, hy, FIX.GOLD, true);
    },
    { shade: false },
  ),
];

export const CHARACTER_PARTS: DemoPart[] = [
  bodyPart('normal', 'Normal', BODIES.normal),
  bodyPart('strong', 'Kräftig', BODIES.strong),
  bodyPart('slim', 'Schlank', BODIES.slim),
  bodyPart('round', 'Rundlich', BODIES.round),
  bodyPart('tall', 'Groß', BODIES.tall),
  bodyPart('child', 'Klein', BODIES.child),
  ...FACES,
  ...FACES2,
  ...HAIRS,
  ...HAIRS2,
  ...HEADX,
  ...HEADX2,
  ...TOPS,
  ...TOPS2,
  ...LEGS,
  ...LEGS2,
  ...FEET,
  ...HANDS,
  ...HATS,
  ...HATS2,
  ...WEAPONS,
  ...WEAPONS2,
  ...OFFHANDS,
  ...OFFHANDS2,
  ...BACKS,
  ...SHADOWS,
];

