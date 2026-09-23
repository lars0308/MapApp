import type { GeneratorSettings, RoomShape } from '../types';
import type { Rng } from './rng';
import { createMask, maskArea, type Mask } from './shapes';

export interface PlacedRoom {
  id: number;
  shape: RoomShape;
  x: number;
  y: number;
  w: number;
  h: number;
  mask: Mask;
  /** a floor cell close to the centroid */
  cx: number;
  cy: number;
  area: number;
}

export const MAP_MARGIN = 2;

/**
 * Shapes for all rooms: the enabled shapes in equal shares (big halls count half), shuffled –
 * 12 rooms with rectangle + L + T give 4 of each. Independent of other sliders.
 */
function planShapes(s: GeneratorSettings, count: number, rng: Rng): RoomShape[] {
  const enabled = (Object.keys(s.shapes) as RoomShape[]).filter((k) => s.shapes[k]);
  if (!enabled.length) return Array(count).fill('rect');
  const weights = enabled.map((k) => (k === 'hall' ? 0.5 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const out: RoomShape[] = [];
  // largest remainder distribution
  const exact = weights.map((w) => (w / total) * count);
  const base = exact.map(Math.floor);
  let left = count - base.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - base[i], i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) if (left-- > 0) base[i]++;
  enabled.forEach((k, i) => {
    for (let n = 0; n < base[i]; n++) out.push(k);
  });
  rng.shuffle(out);
  return out;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Rect, b: Rect, pad: number): boolean {
  return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
}

export function placeRooms(s: GeneratorSettings, W: number, H: number, rng: Rng, warnings: string[]): PlacedRoom[] {
  const rooms: PlacedRoom[] = [];
  const rects: Rect[] = [];
  const minW = Math.max(3, Math.min(s.roomMinW, s.roomMaxW));
  const maxW = Math.max(minW, s.roomMaxW);
  const minH = Math.max(3, Math.min(s.roomMinH, s.roomMaxH));
  const maxH = Math.max(minH, s.roomMaxH);
  const usableW = W - MAP_MARGIN * 2;
  const usableH = H - MAP_MARGIN * 2;
  const pad = Math.max(1, s.roomSpacing) + 1; // +1 keeps room for walls
  const count = Math.max(1, s.roomCount);

  // cluster centres / grid slots
  const clusters: [number, number][] = [];
  if (s.distribution === 'cluster') {
    const n = Math.max(2, Math.round(count / 5));
    for (let i = 0; i < n; i++) clusters.push([rng.range(0.2, 0.8) * W, rng.range(0.2, 0.8) * H]);
  }
  const cols = Math.max(1, Math.round(Math.sqrt((count * W) / H)));
  const rowsN = Math.max(1, Math.ceil(count / cols));
  const slots: [number, number][] = [];
  for (let r = 0; r < rowsN; r++) for (let c = 0; c < cols; c++) slots.push([(c + 0.5) / cols, (r + 0.5) / rowsN]);
  rng.shuffle(slots);

  const sampleCenter = (i: number): [number, number] => {
    switch (s.distribution) {
      case 'even': {
        const [sx, sy] = slots[i % slots.length];
        return [
          MAP_MARGIN + (sx + rng.range(-0.28, 0.28) / cols) * usableW,
          MAP_MARGIN + (sy + rng.range(-0.28, 0.28) / rowsN) * usableH,
        ];
      }
      case 'cluster': {
        const [cx, cy] = clusters[i % clusters.length];
        return [rng.gauss(cx, W * 0.11), rng.gauss(cy, H * 0.11)];
      }
      case 'center':
        return [rng.gauss(W / 2, W * 0.16), rng.gauss(H / 2, H * 0.16)];
      default:
        return [MAP_MARGIN + rng.next() * usableW, MAP_MARGIN + rng.next() * usableH];
    }
  };

  const plannedShapes = planShapes(s, count, rng);
  for (let i = 0; i < count; i++) {
    const shape = plannedShapes[i];
    let w = rng.int(minW, maxW);
    let h = rng.int(minH, maxH);
    if (shape === 'hall') {
      w = Math.round(maxW * rng.range(1.2, 1.5));
      h = Math.round(maxH * rng.range(1.2, 1.5));
    }
    let placed: Rect | null = null;
    for (let shrink = 0; shrink < 4 && !placed; shrink++) {
      // never below the minimum size the user asked for
      const rw = Math.min(usableW - 2, Math.max(minW, Math.round(w * (1 - shrink * 0.15))));
      const rh = Math.min(usableH - 2, Math.max(minH, Math.round(h * (1 - shrink * 0.15))));
      const candidates = s.distribution === 'spread' ? 40 : s.distribution === 'even' ? 6 : 1;
      let best: Rect | null = null;
      let bestScore = -Infinity;
      for (let attempt = 0; attempt < 160 && (!best || attempt < candidates); attempt++) {
        const [cx, cy] =
          s.distribution === 'spread' || attempt > 60
            ? [MAP_MARGIN + rng.next() * usableW, MAP_MARGIN + rng.next() * usableH]
            : sampleCenter(i);
        const x = Math.round(cx - rw / 2);
        const y = Math.round(cy - rh / 2);
        if (x < MAP_MARGIN || y < MAP_MARGIN || x + rw > W - MAP_MARGIN || y + rh > H - MAP_MARGIN) continue;
        const r = { x, y, w: rw, h: rh };
        if (rects.some((o) => overlaps(r, o, pad))) continue;
        // score: distance to the closest room (spread / even want large gaps)
        let score = 0;
        if (s.distribution === 'spread' || s.distribution === 'even') {
          let minD = Infinity;
          for (const o of rects) {
            const d = Math.hypot(o.x + o.w / 2 - cx, o.y + o.h / 2 - cy);
            if (d < minD) minD = d;
          }
          score = rects.length ? minD : 0;
          if (s.distribution === 'spread') score += Math.hypot(cx - W / 2, cy - H / 2) * 0.35;
        }
        if (score > bestScore) {
          bestScore = score;
          best = r;
        }
      }
      placed = best;
    }
    if (!placed) continue;
    rects.push(placed);
    const mask = createMask(shape, placed.w, placed.h, rng, s.irregularity / 100);
    // anchor = floor cell closest to centroid
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let y = 0; y < mask.h; y++)
      for (let x = 0; x < mask.w; x++)
        if (mask.data[y * mask.w + x]) {
          sx += x;
          sy += y;
          n++;
        }
    const mx = sx / Math.max(1, n);
    const my = sy / Math.max(1, n);
    let ax = 0;
    let ay = 0;
    let bd = Infinity;
    for (let y = 0; y < mask.h; y++)
      for (let x = 0; x < mask.w; x++)
        if (mask.data[y * mask.w + x]) {
          const d = (x - mx) ** 2 + (y - my) ** 2;
          if (d < bd) {
            bd = d;
            ax = x;
            ay = y;
          }
        }
    rooms.push({
      id: rooms.length,
      shape,
      x: placed.x,
      y: placed.y,
      w: placed.w,
      h: placed.h,
      mask,
      cx: placed.x + ax,
      cy: placed.y + ay,
      area: maskArea(mask),
    });
  }
  if (rooms.length < count) {
    warnings.push(`Nur ${rooms.length} von ${count} Räumen passen auf die Map. Map vergrößern oder Räume verkleinern.`);
  }
  return rooms;
}
