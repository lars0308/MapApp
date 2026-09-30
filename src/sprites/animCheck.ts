import { animPoses, feetInFrame, frameKey, framesOf, isPixelAnim, renderFrame, animView, frameSize, type AnimDef } from './animation';
import type { CustomAnim, SpriteDoc, View } from './types';
import { viewLayers } from './store';

// "Passen alle Bilder zusammen?" – checks the frames of an animation against the figure and
// against each other: foreign colours, stray pixels, a figure that suddenly shrinks, feet that
// leave the ground, big jumps between two frames, a loop that does not close. Used by the
// Animieren tab ("Prüfen") and by the AI (figure_anim_check) after every change.

export interface AnimIssue {
  /** frame index (0-based); for a jump between frames: the first of the two */
  frame: number;
  level: 'error' | 'hint';
  text: string;
}

export interface AnimReport {
  frames: number;
  issues: AnimIssue[];
  /** 0..100 – 100 = nothing found */
  score: number;
}

/** animations that leave the ground on purpose */
const AIRBORNE = new Set(['run', 'jump', 'k_attack', 'fall', 'k_hop', 'k_fly', 'bob', 'death', 'k_death', 'slide', 'cast']);
const NOT_BODY_SLOTS = new Set(['shadow', 'effect', 'aura', 'weapon']);
const NOT_BODY_REGIONS = new Set(['ground', 'effect', 'weapon']);
/** loops that stay on the spot (the figure must not wander) */
const IN_PLACE = new Set(['idle', 'walk', 'run', 'k_idle', 'k_hop', 'k_crawl', 'k_fly', 'bob', 'flicker', 'pulse']);

type Box = { x0: number; y0: number; x1: number; y1: number; count: number };

function box(f: Uint8ClampedArray, n: number): Box {
  let x0 = n,
    y0 = n,
    x1 = -1,
    y1 = -1,
    count = 0;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (f[(y * n + x) * 4 + 3] > 40) {
        count++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return { x0, y0, x1, y1, count };
}

/** share of pixels that differ between two frames (relative to the figure's size) */
function diff(a: Uint8ClampedArray, b: Uint8ClampedArray, size: number): number {
  let d = 0;
  for (let i = 0; i < a.length; i += 4) {
    const oa = a[i + 3] > 40;
    const ob = b[i + 3] > 40;
    // shape changes and strong colour changes count; brightening / flashing the whole figure does not
    if (oa !== ob || (oa && Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 150)) d++;
  }
  return d / Math.max(1, size);
}

/** pixels without any neighbour */
function strays(f: Uint8ClampedArray, n: number): number {
  let c = 0;
  // solid pixels only: the soft edge of a shadow is not a crumb
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n && f[(y * n + x) * 4 + 3] > 200;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (on(x, y) && !on(x - 1, y - 1) && !on(x, y - 1) && !on(x + 1, y - 1) && !on(x - 1, y) && !on(x + 1, y) && !on(x - 1, y + 1) && !on(x, y + 1) && !on(x + 1, y + 1)) c++;
  return c;
}

const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

export function checkAnimation(doc: SpriteDoc, anim: AnimDef | CustomAnim, view: View): AnimReport {
  const v = animView(anim, view);
  const n = frameSize(doc.size);
  const frames = framesOf(doc, anim, v);
  const pixel = isPixelAnim(anim);
  const poses = pixel ? [] : animPoses(doc, anim, v).poses;
  const issues: AnimIssue[] = [];
  if (!frames.length) return { frames: 0, issues: [{ frame: 0, level: 'error', text: 'Die Animation hat keine Bilder' }], score: 0 };

  // the figure standing still: its colours and size are the reference
  const still = pixel ? frames[0] : renderFrame(doc, {}, v);
  const ref = box(still, n);
  const palette: [number, number, number][] = [];
  const seen = new Set<number>();
  // colours of every layer (a cape hidden behind the body shows when an arm swings) + the standing picture
  const sources = [still, ...(pixel ? [] : viewLayers(doc, v).filter((l) => l.visible).map((l) => l.data))];
  for (const src of sources)
    for (let i = 0; i < src.length; i += 4) {
      if (src[i + 3] < 40) continue;
      const key = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
      if (seen.has(key)) continue;
      seen.add(key);
      palette.push([src[i], src[i + 1], src[i + 2]]);
    }
  const known = (r: number, g: number, b: number) => seen.has((r << 16) | (g << 8) | b) || palette.some((c) => Math.abs(c[0] - r) + Math.abs(c[1] - g) + Math.abs(c[2] - b) < 18);

  const boxes = frames.map((f) => box(f, n));
  const stray0 = strays(still, n);
  // size and ground contact are measured on the body alone: shadow, weapon, effects and trails
  // would hide feet that float or sink
  const bodyDoc = { ...doc, layers: doc.layers.filter((l) => !NOT_BODY_SLOTS.has(l.slot ?? '') && !NOT_BODY_REGIONS.has(l.region ?? '')) };
  const body = pixel || !bodyDoc.layers.length ? null : poses.map((p) => box(renderFrame(bodyDoc, { ...p, trail: undefined, dust: undefined }, v), n));
  const bodyRef = body ? box(renderFrame(bodyDoc, {}, v), n) : ref;
  const air = AIRBORNE.has(anim.id);
  // own animations may leave the ground (wall jump, dash) – only sinking in is an error there
  const ownAnim = 'frames' in anim;
  const feet0 = pixel ? median(boxes.map((b) => b.y1)) : bodyRef.y1;
  const size0 = pixel ? median(boxes.map((b) => b.count)) : bodyRef.count;
  const ground = pixel ? feet0 : Math.max(feet0, feetInFrame(doc, v));

  frames.forEach((f, i) => {
    const p = poses[i];
    const b = boxes[i];
    const effects = !!p && (!!p.flash || !!p.bright || p.alpha !== undefined || !!p.trail || !!p.dust);
    if (b.count === 0) {
      issues.push({ frame: i, level: 'error', text: 'Bild ist leer' });
      return;
    }
    // colours that are not part of the figure (hand-drawn frames, imported sheets)
    if (!effects) {
      let foreign = 0;
      // half-transparent pixels are shadows / fading effects – blended colours are fine there
      for (let k = 0; k < f.length; k += 4) if (f[k + 3] > 200 && !known(f[k], f[k + 1], f[k + 2])) foreign++;
      if (foreign > 2) issues.push({ frame: i, level: foreign > 12 ? 'error' : 'hint', text: `${foreign} Pixel in Farben, die die Figur sonst nicht hat` });
    }
    // lonely pixels (crumbs) – more than the figure itself has (sparkles, eye glints are drawn that way)
    const stray = Math.max(0, strays(f, n) - stray0);
    if (stray && !effects) issues.push({ frame: i, level: stray > 3 ? 'error' : 'hint', text: `${stray} lose Einzelpixel` });
    // suddenly bigger / smaller (parts missing or doubled)
    const lying = !!p && (!!p.lie || (p.squash !== undefined && Math.abs(p.squash - 1) > 0.1) || p.alpha !== undefined);
    const bb = body?.[i] ?? b;
    const ratio = bb.count / Math.max(1, size0);
    if (!lying && !anim.id.includes('death') && (ratio < 0.78 || ratio > 1.3))
      issues.push({ frame: i, level: 'error', text: `Figur ist hier ${ratio < 1 ? 'kleiner' : 'größer'} (${Math.round(ratio * 100)} %) – fehlt etwas oder ist etwas doppelt?` });
    // feet leave the ground line
    // sinking = below the ground line (a flying creature may dip as long as it stays above it)
    if (!lying && bb.y1 - ground > 1) issues.push({ frame: i, level: 'error', text: `Figur sinkt ${bb.y1 - ground} px in den Boden` });
    else if (!air && !ownAnim && !lying && feet0 - bb.y1 > 1) issues.push({ frame: i, level: 'error', text: `Füße schweben ${feet0 - bb.y1} px über dem Boden` });
  });

  // parts that vanish: a sword turned behind the head, an arm of an own picture hidden by the body.
  // Measured with a marker colour on that one layer (hats briefly covered by a raised arm are normal,
  // so only weapons, the other hand and the parts of own pictures are checked)
  if (!pixel && !anim.id.includes('death')) {
    const parts = doc.layers.filter((l) => l.visible && (l.slot === 'weapon' || l.slot === 'offhand' || (l.region && !l.partId && l.region !== 'ground' && l.region !== 'torso'))).slice(0, 12);
    const MARK = [255, 0, 254];
    // a part lying under its own weapon is fine: weapons are left out when other parts are measured
    const isWeapon = (l: (typeof doc.layers)[number]) => l.slot === 'weapon' || l.region === 'weapon';
    const marked = (id: string) => ({ ...doc, layers: doc.layers.filter((l) => l.id === id || !isWeapon(l) || isWeapon(doc.layers.find((x) => x.id === id)!)).map((l) => (l.id !== id ? l : { ...l, data: l.data.map((v, i) => (i % 4 === 3 ? v : l.data[i - (i % 4) + 3] ? MARK[i % 4] : v)), views: undefined })) });
    const count = (f: Uint8ClampedArray) => {
      let c = 0;
      for (let k = 0; k < f.length; k += 4) if (f[k] === MARK[0] && f[k + 1] === MARK[1] && f[k + 2] === MARK[2] && f[k + 3] > 40) c++;
      return c;
    };
    for (const l of parts) {
      const d = marked(l.id);
      const base = count(renderFrame(d, {}, v));
      if (base < 6) continue;
      let worst = 1;
      let at = -1;
      poses.forEach((p, i) => {
        if (p.lie || p.alpha !== undefined || p.flash || p.bright) return;
        const r = count(renderFrame(d, p, v)) / base;
        if (r < worst) (worst = r), (at = i);
      });
      if (at >= 0 && worst < 0.35)
        issues.push({ frame: at, level: worst < 0.2 ? 'error' : 'hint', text: `„${l.name}“ ist hier fast ganz verdeckt (${Math.round(worst * 100)} % sichtbar) – dreht es sich hinter ein anderes Teil? Waffe als eigene Ebene (region weapon) abtrennen oder die Ebenen-Reihenfolge ändern` });
    }
  }

  // motion between frames: one step much bigger than the others = a jerk
  if (frames.length > 1) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < frames.length - 1; i++) pairs.push([i, i + 1]);
    if (anim.loop && frames.length > 2) pairs.push([frames.length - 1, 0]);
    const d = pairs.map(([a, b]) => diff(frames[a], frames[b], size0));
    const m = median(d);
    // how far the body itself moves per step (a figure jumping sideways by 8 px changes few pixels
    // of a thin sprite, but it is a jerk all the same)
    const bx = (i: number) => body?.[i] ?? boxes[i];
    const step = pairs.map(([a, b]) => Math.hypot((bx(a).x0 + bx(a).x1 - bx(b).x0 - bx(b).x1) / 2, bx(a).y1 - bx(b).y1));
    const ms = median(step);
    const far = Math.max(4, n * 0.1);
    pairs.forEach(([a, b], k) => {
      const seam = b === 0;
      // a strike frame with a motion trail is fast on purpose (smear frame)
      const smear = !!poses[b]?.trail || !!poses[a]?.trail;
      const jump = !anim.id.includes('death') && !poses[b]?.lie && step[k] > far && step[k] > Math.max(1, ms) * 2.5;
      // falling over / collapsing is quick on purpose
      if (!smear && !anim.id.includes('death') && ((d[k] > 0.32 && d[k] > m * 2.2) || jump))
        issues.push({ frame: a, level: 'error', text: seam ? `Der Übergang vom letzten zum ersten Bild ruckelt (Schleife schließt nicht sauber)` : `Großer Sprung von Bild ${a + 1} zu ${b + 1} – Bewegung kleiner machen oder Zwischenbild einfügen` });
      // identical frames: only drawn / hand-edited ones (computed poses of a tiny figure may round to the same picture)
      else if (anim.loop && frames.length > 2 && !seam && (pixel || !!doc.frames?.[frameKey(v, anim.id, a)] || !!doc.frames?.[frameKey(v, anim.id, b)]) && same(frames[a], frames[b])) issues.push({ frame: a, level: 'hint', text: `Bild ${a + 1} und ${b + 1} sind gleich (Standbild)` });
    });
    // a loop on the spot must end where it started
    if (anim.loop && IN_PLACE.has(anim.id)) {
      const cx = boxes.map((b) => (b.x0 + b.x1) / 2);
      const drift = Math.max(...cx) - Math.min(...cx);
      if (drift > Math.max(3, n * 0.12)) issues.push({ frame: cx.indexOf(Math.max(...cx)), level: 'hint', text: `Figur wandert ${Math.round(drift)} px zur Seite – bei einer Schleife auf der Stelle soll sie in der Mitte bleiben` });
    }
  }

  const errors = issues.filter((x) => x.level === 'error').length;
  const hints = issues.length - errors;
  return { frames: frames.length, issues, score: Math.max(0, 100 - errors * 12 - hints * 4) };
}
