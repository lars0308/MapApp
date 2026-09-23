import type { Tileset } from '../types';
import { mapEvents } from '../store/events';

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
    tilesets.forEach((ts, k) => {
      this.imgs.push(imageFor(ts));
      const n = ts.columns * ts.rows;
      for (let i = 0; i < n; i++) {
        const g = ts.firstGid + i;
        this.imgIndex[g] = k;
        this.sx[g] = (i % ts.columns) * ts.tileSize;
        this.sy[g] = Math.floor(i / ts.columns) * ts.tileSize;
        this.size[g] = ts.tileSize;
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
  if (gid >= table.imgIndex.length) return;
  const k = table.imgIndex[gid];
  if (k < 0) return;
  const img = table.imgs[k];
  if (!img) return;
  const s = table.size[gid];
  ctx.drawImage(img, table.sx[gid], table.sy[gid], s, s, dx, dy, dw, dh);
}
