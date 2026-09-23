import type { Selection, ToolId } from '../types';

export interface ToolInfo {
  id: ToolId;
  label: string;
  key: string;
}

export const TOOLS: ToolInfo[] = [
  { id: 'brush', label: 'Pinsel', key: 'B' },
  { id: 'eraser', label: 'Radierer', key: 'E' },
  { id: 'fill', label: 'Füllen', key: 'F' },
  { id: 'rect', label: 'Rechteck', key: 'R' },
  { id: 'pipette', label: 'Pipette', key: 'I' },
  { id: 'select', label: 'Auswahl', key: 'M' },
  { id: 'hand', label: 'Hand', key: 'H' },
];

export function brushCells(x: number, y: number, size: number, W: number, H: number): number[] {
  const off = Math.floor((size - 1) / 2);
  const out: number[] = [];
  for (let yy = y - off; yy < y - off + size; yy++)
    for (let xx = x - off; xx < x - off + size; xx++)
      if (xx >= 0 && yy >= 0 && xx < W && yy < H) out.push(yy * W + xx);
  return out;
}

/** Bresenham line between two cells – avoids gaps while dragging fast. */
export function lineCells(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (let guard = 0; guard < 10000; guard++) {
    out.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

export function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }, W: number, H: number): Selection {
  const x0 = Math.max(0, Math.min(a.x, b.x));
  const y0 = Math.max(0, Math.min(a.y, b.y));
  const x1 = Math.min(W - 1, Math.max(a.x, b.x));
  const y1 = Math.min(H - 1, Math.max(a.y, b.y));
  return { x: x0, y: y0, w: Math.max(0, x1 - x0 + 1), h: Math.max(0, y1 - y0 + 1) };
}

export function rectCells(r: Selection, W: number): number[] {
  const out: number[] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push(y * W + x);
  return out;
}

/** 4-connected flood fill of equal tiles; optionally limited to a selection. */
export function floodCells(data: Uint32Array, W: number, H: number, x: number, y: number, limit?: Selection | null): number[] {
  const start = y * W + x;
  const target = data[start];
  const seen = new Uint8Array(W * H);
  const out: number[] = [];
  const stack = [start];
  seen[start] = 1;
  const inside = (cx: number, cy: number) =>
    cx >= 0 && cy >= 0 && cx < W && cy < H && (!limit || (cx >= limit.x && cy >= limit.y && cx < limit.x + limit.w && cy < limit.y + limit.h));
  while (stack.length) {
    const i = stack.pop()!;
    out.push(i);
    const cx = i % W;
    const cy = (i / W) | 0;
    const nb: [number, number][] = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];
    for (const [nx, ny] of nb) {
      if (!inside(nx, ny)) continue;
      const j = ny * W + nx;
      if (!seen[j] && data[j] === target) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return out;
}
