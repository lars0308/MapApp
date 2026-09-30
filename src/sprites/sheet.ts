import { cutBackground, detectGrid, palette, type RGB } from './pixelate';

// "Animation mit KI zeichnen": the image model paints the frames of a move in one row on magenta.
// Here the row becomes animation frames: frames found by the gaps between them, all at the scale of
// the figure (so the animation matches the sprite), one palette for all frames, standing on the
// same ground line (a jump stays in the air, a slam stays on the ground).

export interface SheetTarget {
  /** frame canvas (frameSize of the figure) */
  frame: number;
  /** row of the feet in a frame */
  feet: number;
  /** height of the figure in sprite pixels (its drawing) – the frames get the same scale */
  height: number;
  colors?: number;
}

type Box = { x0: number; x1: number; y0: number; y1: number; mass: number };

/** the frames of the row: column runs with content, small bits (dust, sparks) joined to their neighbour */
function findFrames(mask: Uint8Array, w: number, h: number, count: number): Box[] {
  const col = new Array(w).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!mask[y * w + x]) col[x]++;
  let runs: Box[] = [];
  const gap = Math.max(2, Math.round(w * 0.006));
  let start = -1;
  let empty = 0;
  for (let x = 0; x <= w; x++) {
    const on = x < w && col[x] > 0;
    if (on) {
      if (start < 0) start = x;
      empty = 0;
    } else if (start >= 0 && ++empty > gap) {
      runs.push({ x0: start, x1: x - empty, y0: 0, y1: 0, mass: 0 });
      start = -1;
    }
  }
  if (start >= 0) runs.push({ x0: start, x1: w - 1, y0: 0, y1: 0, mass: 0 });
  for (const r of runs) for (let x = r.x0; x <= r.x1; x++) r.mass += col[x];
  const total = runs.reduce((a, r) => a + r.mass, 0);
  // bits: joined to the nearer neighbour
  const big = (r: Box) => r.mass > total * 0.03;
  runs = runs.reduce<Box[]>((acc, r) => {
    const prev = acc[acc.length - 1];
    if (!big(r) && prev) (prev.x1 = r.x1), (prev.mass += r.mass);
    else if (prev && !big(prev)) (prev.x1 = r.x1), (prev.mass += r.mass);
    else acc.push({ ...r });
    return acc;
  }, []);
  // too many: join the closest pair; too few: the occupied width in equal cells
  while (runs.length > count) {
    let k = 0;
    let best = Infinity;
    for (let i = 0; i < runs.length - 1; i++) {
      const g = runs[i + 1].x0 - runs[i].x1;
      if (g < best) (best = g), (k = i);
    }
    runs.splice(k, 2, { x0: runs[k].x0, x1: runs[k + 1].x1, y0: 0, y1: 0, mass: runs[k].mass + runs[k + 1].mass });
  }
  if (runs.length < count) {
    const x0 = runs[0]?.x0 ?? 0;
    const x1 = runs[runs.length - 1]?.x1 ?? w - 1;
    const cw = (x1 - x0 + 1) / count;
    runs = Array.from({ length: count }, (_, i) => ({ x0: Math.round(x0 + i * cw), x1: Math.round(x0 + (i + 1) * cw) - 1, y0: 0, y1: 0, mass: 0 }));
  }
  // vertical extent of every frame
  for (const r of runs) {
    r.y0 = h;
    r.y1 = -1;
    for (let y = 0; y < h; y++)
      for (let x = r.x0; x <= r.x1; x++)
        if (!mask[y * w + x]) {
          if (y < r.y0) r.y0 = y;
          if (y > r.y1) r.y1 = y;
        }
  }
  return runs.filter((r) => r.y1 >= 0);
}

export function sliceSheet(src: ImageData, count: number, t: SheetTarget): Uint8ClampedArray[] {
  const { width: w, height: h, data } = src;
  const mask = cutBackground(src);
  const frames = findFrames(mask, w, h, count);
  if (!frames.length) throw new Error('Auf dem Bild sind keine Einzelbilder zu finden');
  // scale: the typical frame is as tall as the figure; the model's own grid when it fits
  const heights = frames.map((f) => f.y1 - f.y0 + 1).sort((a, b) => a - b);
  let block = heights[Math.floor(heights.length / 2)] / Math.max(4, t.height);
  let gx0 = w,
    gy0 = h,
    gx1 = -1,
    gy1 = -1;
  for (const f of frames) (gx0 = Math.min(gx0, f.x0)), (gx1 = Math.max(gx1, f.x1)), (gy0 = Math.min(gy0, f.y0)), (gy1 = Math.max(gy1, f.y1));
  const grid = detectGrid(src, mask, gx0, gy0, gx1, gy1);
  if (grid && Math.abs(grid - block) / block < 0.25) block = grid;
  const ground = Math.max(...frames.map((f) => f.y1));
  const q = (i: number) => ((data[i * 4] >> 3) << 10) | ((data[i * 4 + 1] >> 3) << 5) | (data[i * 4 + 2] >> 3);
  const toRGB = (k: number): RGB => [((k >> 10) & 31) * 8 + 4, ((k >> 5) & 31) * 8 + 4, (k & 31) * 8 + 4];
  // sample every frame: the most frequent colour of the inner part of each block
  const sampled = frames.map((f) => {
    const tw = Math.max(1, Math.round((f.x1 - f.x0 + 1) / block));
    const th = Math.max(1, Math.round((f.y1 - f.y0 + 1) / block));
    const cells: (number | null)[] = new Array(tw * th).fill(null);
    const m = Math.floor(block * 0.2);
    for (let ty = 0; ty < th; ty++)
      for (let tx = 0; tx < tw; tx++) {
        const sx0 = Math.floor(f.x0 + tx * block);
        const sy0 = Math.floor(f.y0 + ty * block);
        const sx1 = Math.min(f.x1 + 1, Math.floor(f.x0 + (tx + 1) * block));
        const sy1 = Math.min(f.y1 + 1, Math.floor(f.y0 + (ty + 1) * block));
        const counts = new Map<number, number>();
        let opaque = 0;
        let total = 0;
        for (let y = sy0 + m; y < sy1 - m; y++)
          for (let x = sx0 + m; x < sx1 - m; x++) {
            total++;
            const i = y * w + x;
            if (mask[i]) continue;
            opaque++;
            const k = q(i);
            counts.set(k, (counts.get(k) ?? 0) + 1);
          }
        if (!total || opaque * 2 < total) continue;
        let best = 0;
        let top = -1;
        for (const [k, c] of counts) if (c > top) (top = c), (best = k);
        cells[ty * tw + tx] = best;
      }
    return { f, tw, th, cells, lift: Math.round((ground - f.y1) / block) };
  });
  // one palette for all frames – colours stay the same from frame to frame
  const all = sampled.flatMap((s) => s.cells.filter((c): c is number => c !== null).map(toRGB));
  const pal = palette(all, t.colors ?? 24);
  const near = (c: RGB) => pal.reduce((b, p) => ((p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2 < (b[0] - c[0]) ** 2 + (b[1] - c[1]) ** 2 + (b[2] - c[2]) ** 2 ? p : b), pal[0]);
  const F = t.frame;
  return sampled.map(({ tw, th, cells, lift }) => {
    const out = new Uint8ClampedArray(F * F * 4);
    // horizontal anchor: the feet (lowest quarter) stay in the middle – the body may lean and swing
    const xs: number[] = [];
    for (let ty = Math.floor(th * 0.75); ty < th; ty++) for (let tx = 0; tx < tw; tx++) if (cells[ty * tw + tx] !== null) xs.push(tx);
    xs.sort((a, b) => a - b);
    const footX = xs.length ? xs[Math.floor(xs.length / 2)] : tw / 2;
    const ox = Math.round(F / 2 - footX);
    const oy = t.feet - (th - 1) - lift;
    cells.forEach((k, i) => {
      if (k === null) return;
      const x = (i % tw) + ox;
      const y = Math.floor(i / tw) + oy;
      if (x < 0 || y < 0 || x >= F || y >= F) return;
      const c = near(toRGB(k));
      out.set([c[0], c[1], c[2], 255], (y * F + x) * 4);
    });
    return out;
  });
}
