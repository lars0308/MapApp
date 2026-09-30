import { animPoses, framesOf, isPixelAnim, renderFrame, animView, frameSize, type AnimDef } from './animation';
import type { CustomAnim, SpriteDoc, View } from './types';

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
const AIRBORNE = new Set(['run', 'jump', 'fall', 'k_hop', 'k_fly', 'bob', 'death', 'k_death', 'slide', 'cast']);
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
    if (oa !== ob || (oa && Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30)) d++;
  }
  return d / Math.max(1, size);
}

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
  for (let i = 0; i < still.length; i += 4) {
    if (still[i + 3] < 40) continue;
    const key = (still[i] << 16) | (still[i + 1] << 8) | still[i + 2];
    if (seen.has(key)) continue;
    seen.add(key);
    palette.push([still[i], still[i + 1], still[i + 2]]);
  }
  const known = (r: number, g: number, b: number) => seen.has((r << 16) | (g << 8) | b) || palette.some((c) => Math.abs(c[0] - r) + Math.abs(c[1] - g) + Math.abs(c[2] - b) < 18);

  const boxes = frames.map((f) => box(f, n));
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
    // lonely pixels (crumbs) – not part of any shape
    let stray = 0;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        if (f[(y * n + x) * 4 + 3] <= 40) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < n && yy < n && f[(yy * n + xx) * 4 + 3] > 40) {
              near = true;
              break;
            }
          }
        if (!near) stray++;
      }
    if (stray && !effects) issues.push({ frame: i, level: stray > 3 ? 'error' : 'hint', text: `${stray} lose Einzelpixel` });
    // suddenly bigger / smaller (parts missing or doubled)
    const lying = !!p && (!!p.lie || (p.squash !== undefined && Math.abs(p.squash - 1) > 0.15) || p.alpha !== undefined);
    const bb = body?.[i] ?? b;
    const ratio = bb.count / Math.max(1, size0);
    if (!lying && !anim.id.includes('death') && (ratio < 0.78 || ratio > 1.3))
      issues.push({ frame: i, level: 'error', text: `Figur ist hier ${ratio < 1 ? 'kleiner' : 'größer'} (${Math.round(ratio * 100)} %) – fehlt etwas oder ist etwas doppelt?` });
    // feet leave the ground line
    if (!lying && bb.y1 - feet0 > 1) issues.push({ frame: i, level: 'error', text: `Figur sinkt ${bb.y1 - feet0} px in den Boden` });
    else if (!air && !ownAnim && !lying && feet0 - bb.y1 > 1) issues.push({ frame: i, level: 'error', text: `Füße schweben ${feet0 - bb.y1} px über dem Boden` });
  });

  // motion between frames: one step much bigger than the others = a jerk
  if (frames.length > 1) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < frames.length - 1; i++) pairs.push([i, i + 1]);
    if (anim.loop && frames.length > 2) pairs.push([frames.length - 1, 0]);
    const d = pairs.map(([a, b]) => diff(frames[a], frames[b], size0));
    const m = median(d);
    pairs.forEach(([a, b], k) => {
      const seam = b === 0;
      // a strike frame with a motion trail is fast on purpose (smear frame)
      const smear = !!poses[b]?.trail || !!poses[a]?.trail;
      if (!smear && d[k] > 0.32 && d[k] > m * 2.2)
        issues.push({ frame: a, level: 'error', text: seam ? `Der Übergang vom letzten zum ersten Bild ruckelt (Schleife schließt nicht sauber)` : `Großer Sprung von Bild ${a + 1} zu ${b + 1} – Bewegung kleiner machen oder Zwischenbild einfügen` });
      else if (d[k] === 0 && anim.loop && frames.length > 2 && !seam) issues.push({ frame: a, level: 'hint', text: `Bild ${a + 1} und ${b + 1} sind gleich (Standbild)` });
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
