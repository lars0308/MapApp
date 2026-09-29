import type { Tileset } from '../types';
import { mapEvents } from '../store/events';
import { TRANSPOSE, applyCanvasTransform, tileOf, transformOf } from '../tilesets/gid';

// Loads tileset images once and provides a flat gid → source-rect lookup.

const images = new Map<string, HTMLImageElement>();

function imageFor(ts: Tileset): HTMLImageElement | null {
  let img = images.get(ts.dataUrl);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.onload = () => mapEvents.emit({ type: 'all' });
    img.src = ts.dataUrl;
    images.set(ts.dataUrl, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

export class GidTable {
  /** index into `imgs` per gid, -1 = none */
  imgIndex: Int16Array;
  sx: Uint16Array;
  sy: Uint16Array;
  size: Uint16Array;
  /** y-sort offset in rows (tall tiles) */
  sortOff: Int8Array;
  imgs: (HTMLImageElement | null)[] = [];
  private sources: Tileset[];

  constructor(tilesets: Tileset[]) {
    this.sources = tilesets;
    let max = 1;
    for (const ts of tilesets) max = Math.max(max, ts.firstGid + ts.columns * ts.rows);
    this.imgIndex = new Int16Array(max).fill(-1);
    this.sx = new Uint16Array(max);
    this.sy = new Uint16Array(max);
    this.size = new Uint16Array(max);
    this.sortOff = new Int8Array(max);
    tilesets.forEach((ts, k) => {
      this.imgs.push(imageFor(ts));
      const n = ts.columns * ts.rows;
      for (let i = 0; i < n; i++) {
        const g = ts.firstGid + i;
        this.imgIndex[g] = k;
        this.sx[g] = (i % ts.columns) * ts.tileSize;
        this.sy[g] = Math.floor(i / ts.columns) * ts.tileSize;
        this.size[g] = ts.tileSize;
        this.sortOff[g] = ts.tiles[i]?.sortOffset ?? 0;
      }
    });
  }

  /** Re-check images that were still loading. Returns true when something became ready. */
  refresh(): boolean {
    let changed = false;
    this.sources.forEach((ts, k) => {
      if (!this.imgs[k]) {
        const img = imageFor(ts);
        if (img) {
          this.imgs[k] = img;
          changed = true;
        }
      }
    });
    return changed;
  }

  get allReady(): boolean {
    return this.imgs.every(Boolean);
  }
}

/** Draw a single gid into a context. */
export function drawGid(
  ctx: CanvasRenderingContext2D,
  table: GidTable,
  gid: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const t = transformOf(gid);
  gid = tileOf(gid);
  if (gid >= table.imgIndex.length) return;
  const k = table.imgIndex[gid];
  if (k < 0) return;
  const img = table.imgs[k];
  if (!img) return;
  const s = table.size[gid];
  // "Weich": smoothing would pull in the neighbouring tile of the sheet (seams) – draw from a copy
  // of the tile with a 1 px border of its own edge pixels instead
  let src: CanvasImageSource = img;
  let sx = table.sx[gid];
  let sy = table.sy[gid];
  if (ctx.imageSmoothingEnabled) {
    src = padded(img, sx, sy, s);
    sx = 1;
    sy = 1;
  }
  if (!t) {
    ctx.drawImage(src, sx, sy, s, s, dx, dy, dw, dh);
    return;
  }
  // turned / mirrored tile
  ctx.save();
  applyCanvasTransform(ctx, t, dx, dy, dw, dh);
  const w = t & TRANSPOSE ? dh : dw;
  const h = t & TRANSPOSE ? dw : dh;
  ctx.drawImage(src, sx, sy, s, s, -w / 2, -h / 2, w, h);
  ctx.restore();
}

const paddedCache = new WeakMap<object, Map<number, HTMLCanvasElement>>();

/** the tile at (sx, sy) with its edge pixels repeated one pixel outwards */
function padded(img: CanvasImageSource, sx: number, sy: number, s: number): HTMLCanvasElement {
  let m = paddedCache.get(img as object);
  if (!m) paddedCache.set(img as object, (m = new Map()));
  const key = sy * 65536 + sx;
  let c = m.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = s + 2;
  c.height = s + 2;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(img, sx, sy, s, s, 1, 1, s, s);
  // edges: rows / columns stretched outwards, then the corners
  g.drawImage(c, 1, 1, s, 1, 1, 0, s, 1);
  g.drawImage(c, 1, s, s, 1, 1, s + 1, s, 1);
  g.drawImage(c, 1, 0, 1, s + 2, 0, 0, 1, s + 2);
  g.drawImage(c, s, 0, 1, s + 2, s + 1, 0, 1, s + 2);
  m.set(key, c);
  return c;
}
