import { loadImage } from '../utils/image';

// Tile sheets that are no clean grid (AI-generated sheets, sprite collections with gaps, pieces of
// different sizes on a gradient / white / transparent background): find every piece, measure it
// in "tiles" and pack all pieces into a clean tileset image with one size per tile.

export interface Piece {
  x: number;
  y: number;
  w: number;
  h: number;
  /** size in tiles after import */
  tw: number;
  th: number;
}

export interface PieceSheet {
  pieces: Piece[];
  /** source pixels per tile */
  unit: number;
  /** pixels per tile of the new tileset */
  tileSize: number;
  /** the packed tileset image */
  dataUrl: string;
  columns: number;
  rows: number;
  /** how the background was found */
  background: 'transparent' | 'color' | 'gradient';
}

/** background mask: 1 = background */
function backgroundMask(d: Uint8ClampedArray, w: number, h: number): { bg: Uint8Array; kind: PieceSheet['background'] } {
  const n = w * h;
  const bg = new Uint8Array(n);
  let clear = 0;
  for (let i = 0; i < n; i++) if (d[i * 4 + 3] < 110) clear++;
  if (clear > n * 0.05) {
    // soft shadows / haze around the pieces count as background (they would glue pieces together)
    for (let i = 0; i < n; i++) if (d[i * 4 + 3] < 200) bg[i] = 1;
    return { bg, kind: 'transparent' };
  }
  // border colour: uniform (white, black …) or a gradient
  const border: number[] = [];
  for (let x = 0; x < w; x += 3) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y += 3) border.push(y * w, y * w + w - 1);
  let r = 0, g = 0, b = 0;
  for (const i of border) (r += d[i * 4]), (g += d[i * 4 + 1]), (b += d[i * 4 + 2]);
  r /= border.length;
  g /= border.length;
  b /= border.length;
  let dev = 0;
  for (const i of border) dev += Math.abs(d[i * 4] - r) + Math.abs(d[i * 4 + 1] - g) + Math.abs(d[i * 4 + 2] - b);
  dev /= border.length;
  const dist = (i: number, cr: number, cg: number, cb: number) => Math.abs(d[i * 4] - cr) + Math.abs(d[i * 4 + 1] - cg) + Math.abs(d[i * 4 + 2] - cb);
  if (dev < 12) {
    // one colour: everything close to it is background, also inside pieces (between cracks)
    for (let i = 0; i < n; i++) if (dist(i, r, g, b) < 40) bg[i] = 1;
    return { bg, kind: 'color' };
  }
  // gradient: grow from the border while neighbouring pixels change only a little
  const stack: number[] = [];
  const push = (i: number) => {
    if (!bg[i]) (bg[i] = 1), stack.push(i);
  };
  for (let x = 0; x < w; x++) push(x), push((h - 1) * w + x);
  for (let y = 0; y < h; y++) push(y * w), push(y * w + w - 1);
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i / w) | 0;
    const cr = d[i * 4], cg = d[i * 4 + 1], cb = d[i * 4 + 2];
    const tryN = (j: number) => {
      if (!bg[j] && dist(j, cr, cg, cb) < 14) push(j);
    };
    if (x > 0) tryN(i - 1);
    if (x < w - 1) tryN(i + 1);
    if (y > 0) tryN(i - w);
    if (y < h - 1) tryN(i + w);
  }
  return { bg, kind: 'gradient' };
}

/** connected foreground regions (8-neighbourhood) as boxes; small gaps are bridged by `grow` px */
function regions(bg: Uint8Array, w: number, h: number, grow: number): { x0: number; y0: number; x1: number; y1: number; px: number }[] {
  const n = w * h;
  // coarse grid (cells of `grow` px) keeps it fast on big images and bridges thin gaps
  const s = Math.max(1, grow);
  const gw = Math.ceil(w / s);
  const gh = Math.ceil(h / s);
  const cnt = new Uint32Array(gw * gh);
  for (let i = 0; i < n; i++) if (!bg[i]) cnt[(((i / w) | 0) / s | 0) * gw + ((i % w) / s | 0)]++;
  const on = new Uint8Array(gw * gh);
  const minPx = Math.max(1, (s * s) / 8);
  for (let k = 0; k < gw * gh; k++) if (cnt[k] >= minPx) on[k] = 1;
  const label = new Int32Array(gw * gh).fill(-1);
  const out: { x0: number; y0: number; x1: number; y1: number; px: number }[] = [];
  for (let k = 0; k < gw * gh; k++) {
    if (!on[k] || label[k] >= 0) continue;
    const id = out.length;
    const box = { x0: gw, y0: gh, x1: -1, y1: -1, px: 0 };
    const stack = [k];
    label[k] = id;
    while (stack.length) {
      const c = stack.pop()!;
      const cx = c % gw;
      const cy = (c / gw) | 0;
      box.x0 = Math.min(box.x0, cx);
      box.y0 = Math.min(box.y0, cy);
      box.x1 = Math.max(box.x1, cx);
      box.y1 = Math.max(box.y1, cy);
      box.px += cnt[c];
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const nx = cx + ox;
          const ny = cy + oy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const j = ny * gw + nx;
          if (on[j] && label[j] < 0) (label[j] = id), stack.push(j);
        }
    }
    out.push({ x0: box.x0 * s, y0: box.y0 * s, x1: Math.min(w - 1, box.x1 * s + s - 1), y1: Math.min(h - 1, box.y1 * s + s - 1), px: box.px });
  }
  return out;
}

type Box = { x0: number; y0: number; x1: number; y1: number; px: number };
const areaOf = (b: Box) => (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
const gap = (a: Box, b: Box) => Math.max(0, a.x0 - b.x1, b.x0 - a.x1) + Math.max(0, a.y0 - b.y1, b.y0 - a.y1);

/** merge boxes that are much smaller than a close neighbour into it (tiles of equal size stay apart) */
function attachSmall(boxes: Box[]): Box[] {
  const list = boxes.map((b) => ({ ...b }));
  const alive = list.map(() => true);
  const order = list.map((_, i) => i).sort((a, b) => areaOf(list[a]) - areaOf(list[b]));
  // only bits much smaller than the bigger pieces are attached (neighbouring tiles stay apart)
  const areas = list.map(areaOf).sort((x, y) => x - y);
  const typical = areas[Math.floor(areas.length * 0.75)] ?? 0;
  for (const i of order) {
    const a = list[i];
    if (areaOf(a) >= typical / 6) continue;
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < list.length; j++) {
      if (j === i || !alive[j]) continue;
      const b = list[j];
      if (areaOf(a) >= areaOf(b) * 0.25) continue;
      const d = gap(a, b);
      if (d <= Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.45 && d < bestD) (bestD = d), (best = j);
    }
    if (best < 0) continue;
    const b = list[best];
    b.x0 = Math.min(a.x0, b.x0);
    b.y0 = Math.min(a.y0, b.y0);
    b.x1 = Math.max(a.x1, b.x1);
    b.y1 = Math.max(a.y1, b.y1);
    b.px += a.px;
    alive[i] = false;
  }
  return list.filter((_, i) => alive[i]);
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[s.length >> 1] : 0;
};

/**
 * Find the pieces of a sheet and pack them into a clean tileset. Returns null when the image
 * does not look like a sheet of separate pieces (then the normal grid is used).
 */
export async function slicePieces(dataUrl: string, preferredTile = 32): Promise<PieceSheet | null> {
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, w, h).data;
  const { bg, kind } = backgroundMask(d, w, h);
  // bridge gaps of ~0.6 % of the image (cracks, rubble next to a wall piece)
  const grow = Math.max(2, Math.round(Math.min(w, h) / 160));
  let boxes = regions(bg, w, h, grow);
  if (boxes.length < 2) return null;
  // small bits (dots, pebbles, loose crack ends) belong to the big piece next to them
  boxes = attachSmall(boxes);
  // drop what is left over as specks (much smaller than the bigger pieces)
  const areas = boxes.map((b) => (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1)).sort((x, y) => x - y);
  const big = areas[Math.floor(areas.length * 0.75)] ?? 0;
  boxes = boxes.filter((b) => (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) >= big / 12 && b.px > 8);
  if (boxes.length < 2 || boxes.length > 600) return null;
  // reading order: rows from top to bottom, left to right inside a row
  const rowH = median(boxes.map((b) => b.y1 - b.y0 + 1));
  boxes.sort((a, b) => Math.round(a.y0 / (rowH * 0.6)) - Math.round(b.y0 / (rowH * 0.6)) || a.x0 - b.x0);
  // one tile = the size of the (nearly) square pieces
  const squares = boxes.filter((b) => {
    const r = (b.x1 - b.x0 + 1) / (b.y1 - b.y0 + 1);
    return r > 0.8 && r < 1.25;
  });
  const unit = Math.max(4, median((squares.length >= 3 ? squares : boxes).map((b) => Math.min(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1))));
  // keep detail but stay small: 16 / 32 / 48 / 64 px per tile
  const tileSize = unit <= 20 ? 16 : unit <= 40 ? 32 : unit <= 56 ? 48 : Math.max(preferredTile, 64);
  const pieces: Piece[] = boxes.map((b) => {
    const bw = b.x1 - b.x0 + 1;
    const bh = b.y1 - b.y0 + 1;
    return { x: b.x0, y: b.y0, w: bw, h: bh, tw: Math.max(1, Math.min(8, Math.round(bw / unit))), th: Math.max(1, Math.min(8, Math.round(bh / unit))) };
  });
  // shelf packing, 8 tiles wide (wider pieces widen the sheet)
  const cols = Math.max(8, ...pieces.map((p) => p.tw));
  let cx = 0;
  let cy = 0;
  let shelf = 0;
  const at: [number, number][] = [];
  for (const p of pieces) {
    if (cx + p.tw > cols) (cx = 0), (cy += shelf), (shelf = 0);
    at.push([cx, cy]);
    cx += p.tw;
    shelf = Math.max(shelf, p.th);
  }
  const rows = cy + shelf;
  // cut the pieces out with a clean background (transparent where the sheet background was)
  const cut = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < w * h; i++) if (bg[i]) cut.data[i * 4 + 3] = 0;
  ctx.putImageData(cut, 0, 0);
  const out = document.createElement('canvas');
  out.width = cols * tileSize;
  out.height = rows * tileSize;
  const g = out.getContext('2d')!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  pieces.forEach((p, k) => {
    const [tx, ty] = at[k];
    g.drawImage(c, p.x, p.y, p.w, p.h, tx * tileSize, ty * tileSize, p.tw * tileSize, p.th * tileSize);
  });
  return { pieces, unit, tileSize, dataUrl: out.toDataURL('image/png'), columns: cols, rows, background: kind };
}
