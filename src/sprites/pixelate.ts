// Image model picture → real pixel art for the figure builder.
// Image models paint "pixel art" as a big picture (≈1024 px) with a fake pixel grid, slightly soft
// edges and a flat background. Here it becomes a clean sprite: background out, the fake grid found
// (block size + offset), every block gets its most frequent colour (keeps outlines crisp instead of
// averaging them into mud), palette reduced, stray pixels removed.

export interface PixelateOptions {
  /** sprite canvas size (32, 48, 64) */
  size: number;
  /** max. colours (default 20) */
  colors?: number;
  /** share of the canvas height the figure may fill (default 0.94) */
  fill?: number;
  /** take a bigger canvas (up to 64) when the model's own pixels need it, instead of shrinking them */
  grow?: boolean;
}

export type RGB = [number, number, number];
const dist2 = (a: RGB, b: RGB) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** transparent where the background is: own alpha, else the border colour (flood from the edges + the magenta key everywhere) */
export function cutBackground(d: ImageData): Uint8Array {
  const { width: w, height: h, data } = d;
  const mask = new Uint8Array(w * h);
  let hasAlpha = false;
  for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] < 128) (hasAlpha = true), (mask[i] = 1);
  if (hasAlpha) return mask;
  // background colour = the most common border colour
  const counts = new Map<number, number>();
  const at = (i: number): RGB => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  for (const i of border) {
    const c = at(i);
    const k = ((c[0] >> 3) << 10) | ((c[1] >> 3) << 5) | (c[2] >> 3);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const bg: RGB = [((top >> 10) & 31) * 8 + 4, ((top >> 5) & 31) * 8 + 4, (top & 31) * 8 + 4];
  const tol = 70 * 70;
  // a strongly saturated key (magenta as asked) is removed everywhere – also between the legs
  const keyLike = Math.max(...bg) - Math.min(...bg) > 120;
  if (keyLike) {
    const magenta = bg[0] > 180 && bg[2] > 180 && bg[1] < 90;
    for (let i = 0; i < w * h; i++) {
      const c = at(i);
      // the key itself, and (magenta key) the pinkish fringe where the figure's edge blurs into it
      if (dist2(c, bg) < tol * 1.6 || (magenta && c[1] < 90 && c[0] > 140 && c[2] > 140 && Math.abs(c[0] - c[2]) < 60)) mask[i] = 1;
    }
    return mask;
  }
  const stack = border.slice();
  const seen = new Uint8Array(w * h);
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i]) continue;
    seen[i] = 1;
    if (dist2(at(i), bg) > tol) continue;
    mask[i] = 1;
    const x = i % w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * (h - 1)) stack.push(i + w);
  }
  return mask;
}

/**
 * size of the model's fake pixels: colour edges inside the figure lie on a regular grid. For every
 * candidate block size the best grid offset is searched; the share of edges on grid lines is
 * corrected for chance (small blocks hit everything). Returns null when there is no clear grid.
 */
export function detectGrid(d: ImageData, mask: Uint8Array, x0: number, y0: number, x1: number, y1: number): number | null {
  const { width: w, data } = d;
  const diff = (a: number, b: number) => Math.abs(data[a * 4] - data[b * 4]) + Math.abs(data[a * 4 + 1] - data[b * 4 + 1]) + Math.abs(data[a * 4 + 2] - data[b * 4 + 2]);
  // edge histograms: where along x (from rows) and along y (from columns) colours change
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const ex = new Float32Array(bw);
  const ey = new Float32Array(bh);
  const edges = (len: number, idx: (k: number) => number, hist: Float32Array) => {
    const dv = new Float32Array(len);
    for (let k = 1; k < len - 1; k++) {
      const a = idx(k - 1);
      const b = idx(k + 1);
      dv[k] = mask[a] || mask[b] ? 0 : diff(a, b);
    }
    // local maxima of a clear change = the middle of a (blurred) pixel edge
    for (let k = 2; k < len - 2; k++) if (dv[k] > 60 && dv[k] >= dv[k - 1] && dv[k] > dv[k + 1]) hist[k] += 1;
  };
  const stepY = Math.max(1, Math.floor(bh / 120));
  const stepX = Math.max(1, Math.floor(bw / 120));
  for (let y = y0; y <= y1; y += stepY) edges(bw, (k) => y * w + x0 + k, ex);
  for (let x = x0; x <= x1; x += stepX) edges(bh, (k) => (y0 + k) * w + x, ey);
  const total = ex.reduce((a, b) => a + b, 0) + ey.reduce((a, b) => a + b, 0);
  if (total < 40) return null;
  const hits = (hist: Float32Array, g: number) => {
    let best = 0;
    for (let ph = 0; ph < g; ph += 0.5) {
      let h = 0;
      for (let k = 0; k < hist.length; k++) {
        if (!hist[k]) continue;
        const r = (((k - ph) % g) + g) % g;
        if (Math.min(r, g - r) <= 1) h += hist[k];
      }
      if (h > best) best = h;
    }
    return best;
  };
  const max = Math.min(96, Math.max(bw, bh) / 8);
  let bestG = 0;
  let bestS = 0;
  // image models paint sprites with blocks of ≥ 6 px (a 64-px sprite on a 1024-px picture has 16)
  for (let g = 6; g <= max; g += 0.25) {
    const chance = Math.min(1, 3 / g);
    const share = (hits(ex, g) + hits(ey, g)) / total;
    const score = (share - chance) / (1 - chance);
    if (score > bestS) (bestS = score), (bestG = g);
  }
  if (bestS < 0.35) return null;
  // fine tuning: 21.33 px blocks (48-px sprite on 1024 px) must not drift over the figure
  let fine = bestG;
  let fineS = -1;
  for (let g = bestG - 0.25; g <= bestG + 0.25; g += 0.05) {
    const chance = Math.min(1, 3 / g);
    const sc = ((hits(ex, g) + hits(ey, g)) / total - chance) / (1 - chance);
    if (sc > fineS) (fineS = sc), (fine = g);
  }
  return fine;
}

/** median cut: at most n colours */
export function palette(colors: RGB[], n: number): RGB[] {
  if (!colors.length) return [];
  let boxes: RGB[][] = [colors];
  while (boxes.length < n) {
    let bi = -1;
    let best = -1;
    let axis = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let a = 0; a < 3; a++) {
        let lo = 255,
          hi = 0;
        for (const c of b) (lo = Math.min(lo, c[a])), (hi = Math.max(hi, c[a]));
        // weighted by size: big boxes with a wide range split first
        const score = (hi - lo) * Math.sqrt(b.length);
        if (score > best) (best = score), (bi = i), (axis = a);
      }
    });
    if (bi < 0 || best <= 0) break;
    const b = boxes[bi].slice().sort((p, q) => p[axis] - q[axis]);
    const mid = b.length >> 1;
    boxes = [...boxes.slice(0, bi), b.slice(0, mid), b.slice(mid), ...boxes.slice(bi + 1)];
  }
  return boxes.map((b) => {
    const s = b.reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]] as RGB, [0, 0, 0] as RGB);
    return [Math.round(s[0] / b.length), Math.round(s[1] / b.length), Math.round(s[2] / b.length)] as RGB;
  });
}

/**
 * Turn an image model picture into a sprite of `size` × `size` (figure centred, standing on the
 * bottom). Returns the sprite pixels.
 */
export function pixelate(src: ImageData, opts: PixelateOptions): ImageData {
  const { width: w, height: h, data } = src;
  let n = opts.size;
  const mask = cutBackground(src);
  // outline of the figure
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (!mask[y * w + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) throw new Error('Auf dem Bild ist keine Figur zu finden');
  // only the biggest figure (a model sometimes paints a second copy next to it): coarse blobs,
  // the largest one plus what is close to it
  {
    const step = 4;
    const cw = Math.ceil(w / step);
    const ch = Math.ceil(h / step);
    const cell = new Uint8Array(cw * ch);
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (!mask[y * w + x]) cell[(y / step) * cw + x / step] = 1;
    const label = new Int32Array(cw * ch).fill(-1);
    const blobs: { n: number; x0: number; y0: number; x1: number; y1: number }[] = [];
    for (let i = 0; i < cell.length; i++) {
      if (!cell[i] || label[i] >= 0) continue;
      const b = { n: 0, x0: cw, y0: ch, x1: -1, y1: -1 };
      const stack = [i];
      label[i] = blobs.length;
      while (stack.length) {
        const j = stack.pop()!;
        const x = j % cw;
        const y = (j - x) / cw;
        b.n++;
        b.x0 = Math.min(b.x0, x);
        b.x1 = Math.max(b.x1, x);
        b.y0 = Math.min(b.y0, y);
        b.y1 = Math.max(b.y1, y);
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= cw || yy >= ch) continue;
            const k = yy * cw + xx;
            if (cell[k] && label[k] < 0) (label[k] = blobs.length), stack.push(k);
          }
      }
      blobs.push(b);
    }
    const big = blobs.reduce((a, b) => (b.n > a.n ? b : a), blobs[0]);
    if (big && blobs.length > 1) {
      // parts that overlap the big blob's box (a sword held a bit away) stay, others go
      const keep = blobs.filter((b) => b === big || (b.x1 >= big.x0 - 4 && b.x0 <= big.x1 + 4 && b.y1 >= big.y0 - 4 && b.y0 <= big.y1 + 4));
      x0 = Math.max(0, Math.min(...keep.map((b) => b.x0)) * step - step);
      y0 = Math.max(0, Math.min(...keep.map((b) => b.y0)) * step - step);
      x1 = Math.min(w - 1, (Math.max(...keep.map((b) => b.x1)) + 1) * step + step);
      y1 = Math.min(h - 1, (Math.max(...keep.map((b) => b.y1)) + 1) * step + step);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < x0 || x > x1 || y < y0 || y > y1) mask[y * w + x] = 1;
    }
  }
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  // block size: the model's own pixel grid if it can be found, but never bigger than the canvas allows
  const fill = opts.fill ?? 0.94;
  const grid = detectGrid(src, mask, x0, y0, x1, y1);
  if (grid && opts.grow !== false) {
    // the model's pixels as they are: the smallest canvas they fit on (not smaller than asked)
    const need = Math.round(Math.max(bw, bh) / grid) / fill;
    n = [16, 32, 48, 64].find((c) => c >= Math.max(n, need)) ?? 64;
  }
  const room = Math.max(4, Math.round(n * fill));
  const fit = Math.max(bw, bh) / room;
  const block = grid && grid >= fit ? grid : fit;
  const tw = Math.max(1, Math.round(bw / block));
  const th = Math.max(1, Math.round(bh / block));
  // the fake pixel grid: try a few offsets, keep the one where blocks are most uniform
  const q = (i: number) => ((data[i * 4] >> 3) << 10) | ((data[i * 4 + 1] >> 3) << 5) | (data[i * 4 + 2] >> 3);
  const sample = (ox: number, oy: number, full: boolean) => {
    const out: (number | null)[] = new Array(tw * th).fill(null);
    let mixed = 0;
    for (let ty = 0; ty < th; ty++)
      for (let tx = 0; tx < tw; tx++) {
        const sx0 = Math.floor(x0 + ox + tx * block);
        const sy0 = Math.floor(y0 + oy + ty * block);
        const sx1 = Math.min(w, Math.floor(x0 + ox + (tx + 1) * block));
        const sy1 = Math.min(h, Math.floor(y0 + oy + (ty + 1) * block));
        const counts = new Map<number, number>();
        let opaque = 0;
        let total = 0;
        // inner part of the block only: its edges are where the model's pixels blur into each other
        const m = full ? 0 : Math.floor(block * 0.2);
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
        let best = -1;
        let top = 0;
        for (const [k, c] of counts) if (c > top) (top = c), (best = k);
        mixed += opaque - top;
        out[ty * tw + tx] = best;
      }
    return { out, mixed };
  };
  let bestPhase = { ox: 0, oy: 0, mixed: Infinity };
  const steps = Math.max(1, Math.min(6, Math.floor(block)));
  for (let sy = 0; sy < steps; sy++)
    for (let sx = 0; sx < steps; sx++) {
      const ox = (sx / steps) * block - block / 2;
      const oy = (sy / steps) * block - block / 2;
      const { mixed } = sample(ox, oy, false);
      if (mixed < bestPhase.mixed) bestPhase = { ox, oy, mixed };
    }
  const cells = sample(bestPhase.ox, bestPhase.oy, false).out;
  // colours: the block colours, reduced to a small palette
  const cols = cells.filter((c): c is number => c !== null).map((k) => [((k >> 10) & 31) * 8 + 4, ((k >> 5) & 31) * 8 + 4, (k & 31) * 8 + 4] as RGB);
  const pal = palette(cols, opts.colors ?? 20);
  const near = (c: RGB) => pal.reduce((b, p) => (dist2(p, c) < dist2(b, c) ? p : b), pal[0]);
  const sprite = new Uint8ClampedArray(tw * th * 4);
  cells.forEach((k, i) => {
    if (k === null) return;
    const c = near([((k >> 10) & 31) * 8 + 4, ((k >> 5) & 31) * 8 + 4, (k & 31) * 8 + 4]);
    sprite.set([c[0], c[1], c[2], 255], i * 4);
  });
  // stray pixels (no solid neighbour) out, single holes inside the figure filled
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < tw && y < th && sprite[(y * tw + x) * 4 + 3] > 0;
  const clean = new Uint8ClampedArray(sprite);
  for (let y = 0; y < th; y++)
    for (let x = 0; x < tw; x++) {
      const i = (y * tw + x) * 4;
      let nb = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && on(x + dx, y + dy)) nb++;
      if (sprite[i + 3] && nb === 0) clean.fill(0, i, i + 4);
      if (!sprite[i + 3] && on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1)) clean.set(sprite.subarray(((y - 1) * tw + x) * 4, ((y - 1) * tw + x) * 4 + 4), i);
    }
  // onto the canvas: centred, standing near the bottom
  const out = new Uint8ClampedArray(n * n * 4);
  const ox = Math.floor((n - tw) / 2);
  const oy = Math.max(0, n - th - Math.max(1, Math.round(n * 0.03)));
  for (let y = 0; y < th; y++)
    for (let x = 0; x < tw; x++) {
      const tx = x + ox;
      const ty = y + oy;
      if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
      const s = (y * tw + x) * 4;
      if (clean[s + 3]) out.set(clean.subarray(s, s + 4), (ty * n + tx) * 4);
    }
  return new ImageData(out, n, n);
}

/** a data URL → ImageData (full size) */
export async function imageDataFromUrl(url: string): Promise<ImageData> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Bild konnte nicht gelesen werden'));
    i.src = url;
  });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}
