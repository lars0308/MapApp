import type { Body, Bounds, SpriteDoc, SpriteKind, SpriteLayer } from './types';
import { compose, fitContext } from './store';
import { shiftColor } from './palette';
import { S } from './painter';

// Animations are built from the layers of a character / object: every pixel belongs to a
// body region (head, torso, left/right arm incl. held items, left/right leg) and each frame
// moves the regions a little (breathing, walking, jumping …). Works for drawn layers too,
// because regions come from the body measurements, not from the parts.

export type Region = 'head' | 'torso' | 'armL' | 'armR' | 'legL' | 'legR' | 'ground' | 'effect';
type Off = { x: number; y: number };

export interface Pose {
  /** offset per region */
  off?: Partial<Record<Region, Off>>;
  /** added to every region except the ground shadow */
  all?: Off;
  /** lean: horizontal shift per pixel above the feet */
  lean?: number;
  /** tint all pixels (hit flash) */
  flash?: 'white' | 'red';
  /** brighten / darken (−1..1) */
  bright?: number;
  /** rotate the whole figure 90° (lying) */
  lie?: boolean;
  alpha?: number;
  /** effect layers hidden in this frame (flicker) */
  hideEffects?: boolean;
  /** dust puffs behind the feet */
  dust?: number;
}

export interface AnimDef {
  id: string;
  label: string;
  kind: SpriteKind;
  fps: number;
  loop: boolean;
  poses: Pose[];
  hint: string;
}

const o = (x: number, y: number): Off => ({ x, y });

export const ANIMATIONS: AnimDef[] = [
  // ---------------------------------------------------------------- characters
  {
    id: 'idle',
    label: 'Atmen',
    kind: 'character',
    fps: 4,
    loop: true,
    hint: 'Ruhepose, Oberkörper hebt und senkt sich',
    poses: [{}, { off: { head: o(0, 1), torso: o(0, 0), armL: o(0, 1), armR: o(0, 1) } }, { off: { head: o(0, 1), torso: o(0, 1), armL: o(0, 1), armR: o(0, 1) } }, { off: { head: o(0, 1), armL: o(0, 1), armR: o(0, 1) } }],
  },
  {
    id: 'walk',
    label: 'Laufen',
    kind: 'character',
    fps: 8,
    loop: true,
    hint: 'Beine abwechselnd, Arme schwingen gegengleich',
    poses: [
      { off: { legL: o(0, -1), armL: o(0, 1), armR: o(0, -1) } },
      { off: { head: o(0, 1), torso: o(0, 1), armL: o(0, 1), armR: o(0, 1) } },
      { off: { legR: o(0, -1), armL: o(0, -1), armR: o(0, 1) } },
      { off: { head: o(0, 1), torso: o(0, 1), armL: o(0, 1), armR: o(0, 1) } },
    ],
  },
  {
    id: 'run',
    label: 'Rennen',
    kind: 'character',
    fps: 12,
    loop: true,
    hint: 'Schneller, höhere Knie, stärkerer Armschwung',
    poses: [
      { all: o(0, -1), off: { legL: o(0, -2), armL: o(0, 2), armR: o(0, -2) } },
      { off: { head: o(0, 1), torso: o(0, 1), armL: o(0, 1), armR: o(0, 1) } },
      { all: o(0, -1), off: { legR: o(0, -2), armL: o(0, -2), armR: o(0, 2) } },
      { off: { head: o(0, 1), torso: o(0, 1), armL: o(0, 1), armR: o(0, 1) } },
    ],
  },
  {
    id: 'jump',
    label: 'Springen',
    kind: 'character',
    fps: 10,
    loop: false,
    hint: 'Ducken, Absprung, Flug, Landung – der Schatten bleibt am Boden',
    poses: [
      { off: { head: o(0, 2), torso: o(0, 2), armL: o(0, 2), armR: o(0, 2), legL: o(0, 1), legR: o(0, 1) } },
      { all: o(0, -3), off: { armL: o(0, -1), armR: o(0, -1) } },
      { all: o(0, -6), off: { armL: o(0, -2), armR: o(0, -2), legL: o(0, -1), legR: o(0, -1) } },
      { all: o(0, -7), off: { armL: o(0, -2), armR: o(0, -2), legL: o(0, -1), legR: o(0, -1) } },
      { all: o(0, -4), off: { armL: o(0, -1), armR: o(0, -1) } },
      { off: { head: o(0, 1), torso: o(0, 1), armL: o(0, 1), armR: o(0, 1) } },
    ],
  },
  {
    id: 'slide',
    label: 'Rutschen',
    kind: 'character',
    fps: 10,
    loop: true,
    hint: 'Nach vorn gelehnt, Staub hinter den Füßen',
    poses: [
      { lean: 0.12, off: { head: o(0, 1), torso: o(0, 1) }, dust: 1 },
      { lean: 0.2, off: { head: o(0, 2), torso: o(0, 1), armL: o(0, 1), armR: o(0, 1) }, dust: 2 },
      { lean: 0.2, off: { head: o(0, 2), torso: o(0, 1), armL: o(0, 1), armR: o(0, 1) }, dust: 3 },
      { lean: 0.16, off: { head: o(0, 1), torso: o(0, 1) }, dust: 2 },
    ],
  },
  {
    id: 'attack',
    label: 'Angriff',
    kind: 'character',
    fps: 12,
    loop: false,
    hint: 'Waffe ausholen und zuschlagen',
    poses: [{ off: { armR: o(0, -2) } }, { off: { armR: o(1, -3), torso: o(0, 0) } }, { off: { armR: o(3, 1), torso: o(1, 0), head: o(1, 0) } }, { off: { armR: o(2, 1) } }, {}],
  },
  {
    id: 'hurt',
    label: 'Treffer',
    kind: 'character',
    fps: 10,
    loop: false,
    hint: 'Kurz rot aufblitzen und zurückzucken',
    poses: [{ all: o(-1, 0), flash: 'white' }, { all: o(-1, 0), flash: 'red' }, { all: o(0, 0) }],
  },
  {
    id: 'death',
    label: 'Umfallen',
    kind: 'character',
    fps: 8,
    loop: false,
    hint: 'Kippt zur Seite und bleibt liegen',
    poses: [{ lean: 0.12 }, { lean: 0.3, off: { head: o(1, 1) } }, { lie: true }, { lie: true, alpha: 0.75 }, { lie: true, alpha: 0.5 }],
  },
  // ---------------------------------------------------------------- objects
  {
    id: 'bob',
    label: 'Schweben',
    kind: 'object',
    fps: 6,
    loop: true,
    hint: 'Hebt und senkt sich, Schatten bleibt',
    poses: [{}, { all: o(0, -1) }, { all: o(0, -2) }, { all: o(0, -1) }],
  },
  {
    id: 'shake',
    label: 'Wackeln',
    kind: 'object',
    fps: 12,
    loop: true,
    hint: 'Zittert hin und her (Treffer, Falle)',
    poses: [{}, { all: o(1, 0) }, {}, { all: o(-1, 0) }],
  },
  {
    id: 'pulse',
    label: 'Pulsieren',
    kind: 'object',
    fps: 6,
    loop: true,
    hint: 'Wird heller und wieder dunkler (magisch, Sammelobjekt)',
    poses: [{}, { bright: 0.12 }, { bright: 0.24 }, { bright: 0.12 }],
  },
  {
    id: 'flicker',
    label: 'Flackern',
    kind: 'object',
    fps: 10,
    loop: true,
    hint: 'Effekte (Feuer, Funkeln) flackern, die Grundform bleibt',
    poses: [{ off: { effect: o(0, 0) } }, { off: { effect: o(0, -1) }, bright: 0.04 }, { off: { effect: o(1, 0) } }, { off: { effect: o(0, -1) }, hideEffects: false }],
  },
  {
    id: 'open',
    label: 'Öffnen',
    kind: 'object',
    fps: 8,
    loop: false,
    hint: 'Oberer Teil (Deckel) hebt sich – z. B. Truhe',
    poses: [{}, { off: { head: o(0, -1) } }, { off: { head: o(0, -2) } }, { off: { head: o(0, -3) }, bright: 0.08 }],
  },
];

export const animsFor = (kind: SpriteKind) => ANIMATIONS.filter((a) => a.kind === kind);

// ---------------------------------------------------------------- rendering

function regionOf(layer: SpriteLayer, x: number, y: number, kind: SpriteKind, b: Body, bounds: Bounds): Region {
  const slot = layer.slot;
  if (slot === 'shadow') return 'ground';
  if (kind === 'object') {
    if (slot === 'effect') return 'effect';
    // "head" of an object = upper third (lid)
    return y < bounds.y0 + (bounds.y1 - bounds.y0) * 0.38 ? 'head' : 'torso';
  }
  if (slot === 'weapon') return 'armR';
  if (slot === 'offhand') return 'armL';
  if (slot === 'hair' || slot === 'hat' || slot === 'face' || slot === 'headx') return 'head';
  if (slot === 'back') return 'torso';
  if (y < b.t[1]) return 'head';
  if (y >= b.ly[0]) return x < 16 ? 'legL' : 'legR';
  if (x <= b.aL[1] && y >= b.ay[0]) return 'armL';
  if (x >= b.aR[0] && y >= b.ay[0]) return 'armR';
  return 'torso';
}

/** frames get a margin so jumps, swings and falling fit: 32 px sprite → 48 px frames */
export const framePad = (size: number) => Math.round(size / 4);
export const frameSize = (size: number) => size + 2 * framePad(size);

/** One frame as RGBA (frameSize × frameSize, sprite centred). */
export function renderFrame(doc: SpriteDoc, pose: Pose): Uint8ClampedArray {
  const n = doc.size;
  const p = framePad(n);
  const F = frameSize(n);
  const d = Math.floor((n - S) / 2); // design grid → canvas
  const { body, bounds } = fitContext(doc);
  const feet = (doc.kind === 'character' ? body.ly[1] : bounds.y1) + d + p;
  const layers: SpriteLayer[] = [];
  for (const l of doc.layers) {
    if (!l.visible) continue;
    if (pose.hideEffects && l.slot === 'effect') continue;
    const out = new Uint8ClampedArray(F * F * 4);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const s = (y * n + x) * 4;
        if (!l.data[s + 3]) continue;
        const r = regionOf(l, x - d, y - d, doc.kind, body, bounds);
        const ro = pose.off?.[r];
        let tx = x + p + (ro?.x ?? 0);
        let ty = y + p + (ro?.y ?? 0);
        if (r !== 'ground') {
          tx += pose.all?.x ?? 0;
          ty += pose.all?.y ?? 0;
          if (pose.lean) tx += Math.round((feet - y - p) * pose.lean);
        }
        if (tx < 0 || ty < 0 || tx >= F || ty >= F) continue;
        const t = (ty * F + tx) * 4;
        out[t] = l.data[s];
        out[t + 1] = l.data[s + 1];
        out[t + 2] = l.data[s + 2];
        out[t + 3] = l.data[s + 3];
      }
    layers.push({ ...l, data: out });
  }
  let img = compose({ ...doc, size: F, layers });
  if (pose.flash || pose.bright) {
    for (let i = 0; i < img.length; i += 4) {
      if (!img[i + 3] || img[i + 3] < 128) continue;
      if (pose.flash === 'white') img.set(shiftColor(img[i], img[i + 1], img[i + 2], 0.7), i);
      else if (pose.flash === 'red') img.set([Math.min(255, img[i] + 90), img[i + 1] * 0.55, img[i + 2] * 0.55], i);
      if (pose.bright) img.set(shiftColor(img[i], img[i + 1], img[i + 2], pose.bright), i);
    }
  }
  if (pose.dust) {
    const fx = F / 2 - 4;
    for (let k = 0; k < pose.dust; k++) {
      const cx = Math.round(fx - 3 - k * 3);
      const cy = feet - (k % 2);
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, -1],
        [1, -1],
      ]) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= F || y >= F) continue;
        const i = (y * F + x) * 4;
        if (!img[i + 3]) img.set([200, 190, 175, 200 - k * 40], i);
      }
    }
  }
  if (pose.lie) img = lieDown(img, F, feet);
  if (pose.alpha !== undefined) for (let i = 3; i < img.length; i += 4) img[i] = Math.round(img[i] * pose.alpha);
  return img;
}

/** rotate 90° clockwise so the figure lies on the ground (centred, resting on the feet line) */
function lieDown(img: Uint8ClampedArray, n: number, feet: number): Uint8ClampedArray {
  let x0 = n,
    x1 = -1,
    y0 = n,
    y1 = -1;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (img[(y * n + x) * 4 + 3] > 0) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  const out = new Uint8ClampedArray(img.length);
  if (x1 < 0) return out;
  const shiftX = Math.round(n / 2 - (y1 - y0) / 2);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const s = (y * n + x) * 4;
      if (!img[s + 3]) continue;
      // head to the right, lying on the ground
      const tx = y1 - y + shiftX;
      const ty = feet - (x1 - x);
      if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
      out.set(img.subarray(s, s + 4), (ty * n + tx) * 4);
    }
  return out;
}

export function renderAnimation(doc: SpriteDoc, anim: AnimDef): Uint8ClampedArray[] {
  return anim.poses.map((p) => renderFrame(doc, p));
}

/** Spritesheet: one row per animation, frames left to right. */
export function buildSheet(doc: SpriteDoc, anims: AnimDef[]): { canvas: HTMLCanvasElement; rows: { anim: AnimDef; row: number; frames: number }[]; cols: number } {
  const n = frameSize(doc.size);
  const cols = Math.max(1, ...anims.map((a) => a.poses.length));
  const c = document.createElement('canvas');
  c.width = cols * n;
  c.height = Math.max(1, anims.length) * n;
  const g = c.getContext('2d')!;
  const rows = anims.map((anim, row) => {
    renderAnimation(doc, anim).forEach((f, i) => g.putImageData(new ImageData(new Uint8ClampedArray(f), n, n), i * n, row * n));
    return { anim, row, frames: anim.poses.length };
  });
  return { canvas: c, rows, cols };
}
