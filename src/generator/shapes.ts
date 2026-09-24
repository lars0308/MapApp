import type { RoomShape } from '../types';
import type { Rng } from './rng';

/** Room mask: 1 = floor, 0 = outside, row-major w*h. */
export interface Mask {
  w: number;
  h: number;
  data: Uint8Array;
}

function fill(w: number, h: number, fn: (x: number, y: number) => boolean): Mask {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = fn(x, y) ? 1 : 0;
  return { w, h, data };
}

function rectMask(w: number, h: number): Mask {
  return fill(w, h, () => true);
}

function lMask(w: number, h: number, rng: Rng): Mask {
  // cut-out corner between 35 % and 60 % of each side → both arms clearly visible
  const f = () => rng.range(0.35, 0.6);
  const cw = Math.max(2, Math.round(w * f()));
  const ch = Math.max(2, Math.round(h * f()));
  const corner = rng.int(0, 3);
  return fill(w, h, (x, y) => {
    const inX = corner === 0 || corner === 3 ? x < cw : x >= w - cw;
    const inY = corner === 0 || corner === 1 ? y < ch : y >= h - ch;
    return !(inX && inY);
  });
}

function tMask(w: number, h: number, rng: Rng): Mask {
  const orientation = rng.int(0, 3);
  const horizontal = orientation < 2;
  const len = horizontal ? h : w;
  const across = horizontal ? w : h;
  const bar = Math.max(2, Math.round(len * rng.range(0.34, 0.48)));
  const stem = Math.max(2, Math.round(across * rng.range(0.3, 0.44)));
  const s0 = Math.floor((across - stem) / 2);
  return fill(w, h, (x, y) => {
    const a = horizontal ? x : y; // across axis
    const l = horizontal ? y : x; // length axis
    const inBar = orientation % 2 === 0 ? l < bar : l >= len - bar;
    const inStem = a >= s0 && a < s0 + stem;
    return inBar || inStem;
  });
}

function crossMask(w: number, h: number, rng: Rng): Mask {
  const hb = Math.max(2, Math.round(h * rng.range(0.34, 0.5)));
  const vb = Math.max(2, Math.round(w * rng.range(0.34, 0.5)));
  const hy = Math.floor((h - hb) / 2);
  const vx = Math.floor((w - vb) / 2);
  return fill(w, h, (x, y) => (y >= hy && y < hy + hb) || (x >= vx && x < vx + vb));
}

function irregularMask(w: number, h: number, rng: Rng, irr: number): Mask {
  const data = new Uint8Array(w * h);
  // union of overlapping rectangles around a common core
  const coreW = Math.max(3, Math.round(w * 0.45));
  const coreH = Math.max(3, Math.round(h * 0.45));
  const cx = Math.floor((w - coreW) / 2);
  const cy = Math.floor((h - coreH) / 2);
  const blobs: [number, number, number, number][] = [[cx, cy, coreW, coreH]];
  const n = 3 + rng.int(0, 2 + Math.round(irr * 2));
  for (let i = 0; i < n; i++) {
    const bw = Math.max(3, Math.round(w * rng.range(0.35, 0.8)));
    const bh = Math.max(3, Math.round(h * rng.range(0.35, 0.8)));
    blobs.push([rng.int(0, w - bw), rng.int(0, h - bh), bw, bh]);
  }
  for (const [bx, by, bw, bh] of blobs)
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) data[y * w + x] = 1;
  return { w, h, data };
}

/** Randomly erode boundary cells – stronger with higher irregularity. */
function erodeEdges(m: Mask, rng: Rng, irr: number): void {
  if (irr <= 0.02) return;
  const passes = 1 + Math.floor(irr * 2);
  const p = 0.12 + irr * 0.3;
  const { w, h, data } = m;
  const cx = w / 2;
  const cy = h / 2;
  for (let pass = 0; pass < passes; pass++) {
    const remove: number[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!data[i]) continue;
        const border =
          x === 0 || y === 0 || x === w - 1 || y === h - 1 || !data[i - 1] || !data[i + 1] || !data[i - w] || !data[i + w];
        if (!border) continue;
        // never erode the room core
        if (Math.abs(x + 0.5 - cx) < w * 0.25 && Math.abs(y + 0.5 - cy) < h * 0.25) continue;
        if (rng.chance(p)) remove.push(i);
      }
    for (const i of remove) data[i] = 0;
  }
}

/**
 * Close 1-cell notches and slots (empty cells with 3+ floor neighbours): the outline keeps its
 * organic shape but no longer needs a wall corner at every single tile.
 */
function fillNotches(m: Mask): void {
  const { w, h, data } = m;
  for (let pass = 0; pass < 3; pass++) {
    const add: number[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (data[i]) continue;
        const n = (x > 0 && data[i - 1] ? 1 : 0) + (x < w - 1 && data[i + 1] ? 1 : 0) + (y > 0 && data[i - w] ? 1 : 0) + (y < h - 1 && data[i + w] ? 1 : 0);
        // 1-wide gap between floor on both sides (horizontal or vertical) counts as a notch too
        const slot = (x > 0 && x < w - 1 && data[i - 1] && data[i + 1]) || (y > 0 && y < h - 1 && data[i - w] && data[i + w]);
        if (n >= 3 || slot) add.push(i);
      }
    if (!add.length) break;
    for (const i of add) data[i] = 1;
  }
}

/** Remove cells with fewer than 2 orthogonal neighbours (spikes) and keep the largest region. */
function cleanup(m: Mask): void {
  const { w, h, data } = m;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!data[i]) continue;
        let n = 0;
        if (x > 0 && data[i - 1]) n++;
        if (x < w - 1 && data[i + 1]) n++;
        if (y > 0 && data[i - w]) n++;
        if (y < h - 1 && data[i + w]) n++;
        if (n < 2) data[i] = 0;
      }
  }
  // largest 4-connected component
  const label = new Int32Array(w * h).fill(-1);
  let best = -1;
  let bestSize = 0;
  let current = 0;
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!data[s] || label[s] >= 0) continue;
    let size = 0;
    stack.push(s);
    label[s] = current;
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % w;
      const y = (i / w) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nb)
        if (j >= 0 && data[j] && label[j] < 0) {
          label[j] = current;
          stack.push(j);
        }
    }
    if (size > bestSize) {
      bestSize = size;
      best = current;
    }
    current++;
  }
  for (let i = 0; i < w * h; i++) if (data[i] && label[i] !== best) data[i] = 0;
}

export function createMask(shape: RoomShape, w: number, h: number, rng: Rng, irregularity: number): Mask {
  let m: Mask;
  const small = w < 5 || h < 5;
  switch (small ? 'rect' : shape) {
    case 'l':
      m = lMask(w, h, rng);
      break;
    case 't':
      m = tMask(w, h, rng);
      break;
    case 'cross':
      m = crossMask(w, h, rng);
      break;
    case 'irregular':
      m = irregularMask(w, h, rng, irregularity);
      erodeEdges(m, rng, Math.max(0.35, irregularity));
      fillNotches(m);
      break;
    default:
      m = rectMask(w, h);
  }
  // rectangle, L, T, cross and hall stay exact – only the "irregular" shape is roughened
  cleanup(m);
  return m;
}

export function maskArea(m: Mask): number {
  let n = 0;
  for (let i = 0; i < m.data.length; i++) n += m.data[i];
  return n;
}
