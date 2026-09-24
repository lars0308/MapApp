import type { Layer, MapObject, Selection, Tileset } from '../types';
import { OBJECT_ATLAS_TILE, objectAtlas, objectDef } from '../objects/defs';
import { drawCharacter, type CharacterState } from './character';
import { GidTable, drawGid } from './tileAtlas';
import { tileOf } from '../tilesets/gid';
import { clamp } from '../utils/math';
import { HEX_CORNERS, ROW_STEP, hexAt, hexOrigin, hexWorldSize } from '../generator/hex';

// Canvas 2D map renderer.
// - zoomed in: draws only the visible tiles directly
// - zoomed out: composites cached 16×16-tile chunks (one canvas per chunk)
// Rendering happens on demand (dirty flag + requestAnimationFrame).

const CHUNK = 16;
/** iso: free world rows above the map for tall walls and objects */
const ISO_TOP = 2;
/** iso: wall block height in world units (a diamond is 2 × 1) */
const ISO_WALL = 1.1;
/** iso: height of one step of raised floor */
const ISO_STEP = 0.5;

export interface Camera {
  /** world tile coordinate at the left/top screen edge */
  x: number;
  y: number;
  /** screen pixels per tile */
  zoom: number;
}

export interface Overlay {
  hover: { x: number; y: number } | null;
  brushSize: number;
  preview: Selection | null;
  selection: Selection | null;
  highlight: Selection | null;
  showGrid: boolean;
  showCoords: boolean;
  activeTool: string;
  /** blocked cells (collision debug overlay) */
  collision: Uint8Array | null;
  showSortPoints: boolean;
  /** object under the pointer (move tool) */
  objectHighlight: string | null;
  /** stamp preview: the copied tiles at their target (top-left x, y) */
  stamp: { clip: { w: number; h: number; layers: { data: Uint32Array }[] }; x: number; y: number } | null;
}

interface Chunk {
  canvas: HTMLCanvasElement | null;
  dirty: boolean;
}

const COLORS = {
  outside: '#0b0b0e',
  mapBg: '#101014',
  grid: 'rgba(255,255,255,0.055)',
  gridMajor: 'rgba(255,255,255,0.12)',
  border: 'rgba(255,255,255,0.14)',
  accent: '#e889b0',
  accentFill: 'rgba(232,137,176,0.18)',
  text: 'rgba(235,230,240,0.55)',
};

export class MapRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  cam: Camera = { x: 0, y: 0, zoom: 8 };
  viewW = 0;
  viewH = 0;
  private dpr = 1;
  private W = 1;
  private H = 1;
  private layers: Layer[] = [];
  private table: GidTable = new GidTable([]);
  private chunks: Chunk[] = [];
  private chunkCols = 0;
  private chunkRows = 0;
  private cachePpt = 16;
  private raf = 0;
  overlay: Overlay = {
    hover: null,
    brushSize: 1,
    preview: null,
    selection: null,
    highlight: null,
    showGrid: true,
    showCoords: false,
    activeTool: 'brush',
    collision: null,
    showSortPoints: false,
    objectHighlight: null,
    stamp: null,
  };
  objects: MapObject[] = [];
  character: CharacterState | null = null;
  /** playtest extras (enemies, chests, attack arc): y-sorted items to draw */
  playItems:
    | ((
        ctx: CanvasRenderingContext2D,
        sx: (x: number) => number,
        sy: (y: number) => number,
        zoom: number,
        /** iso: screen mappers for a figure standing at (x, y) */
        at?: (x: number, y: number) => [(x: number) => number, (y: number) => number],
      ) => { key: number; draw: () => void; x?: number; y?: number }[])
    | null = null;
  /** tiles not drawn in place (lifts during the playtest – drawn as movers instead) */
  hiddenGids = new Set<number>();
  movers: { gid: number; x: number; y: number }[] = [];
  /** background behind the tiles: plain, sky with hills (side view outside), dark cave */
  backdrop: 'plain' | 'sky' | 'cave' = 'plain';
  onCameraChange?: (cam: Camera) => void;
  /** more listeners for camera moves (minimap) */
  readonly cameraListeners = new Set<() => void>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.chunks = [];
  }

  setDocument(width: number, height: number, layers: Layer[], tilesets: Tileset[] | null) {
    const resized = width !== this.W || height !== this.H;
    this.W = width;
    this.H = height;
    this.layers = layers;
    if (tilesets) this.table = new GidTable(tilesets);
    if (resized || this.chunks.length === 0) {
      this.cachePpt = Math.max(width, height) > 128 ? 8 : 16;
      this.chunkCols = Math.ceil(width / CHUNK);
      this.chunkRows = Math.ceil(height / CHUNK);
      this.chunks = Array.from({ length: this.chunkCols * this.chunkRows }, () => ({ canvas: null, dirty: true }));
    }
    this.invalidateAll();
  }

  invalidateAll() {
    for (const c of this.chunks) c.dirty = true;
    if (this.isoCache) this.isoCache.dirty = true;
    this.requestRender();
  }

  invalidateCells(cells: number[]) {
    for (const i of cells) {
      const x = i % this.W;
      const y = (i / this.W) | 0;
      const c = this.chunks[((y / CHUNK) | 0) * this.chunkCols + ((x / CHUNK) | 0)];
      if (c) c.dirty = true;
    }
    if (this.isoCache) this.isoCache.dirty = true;
    this.requestRender();
  }

  resize(cssW: number, cssH: number) {
    // keep the world point in the view centre stable (e.g. when a bottom sheet opens)
    if (this.viewW > 0 && this.viewH > 0 && cssW > 0 && cssH > 0) {
      this.cam.x += (this.viewW - cssW) / 2 / this.cam.zoom;
      this.cam.y += (this.viewH - cssH) / 2 / this.cam.zoom;
    }
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.viewW = cssW;
    this.viewH = cssH;
    this.canvas.width = Math.max(1, Math.round(cssW * this.dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * this.dpr));
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.cameraListeners.forEach((f) => f());
    this.requestRender();
  }

  /** hex map (odd rows shifted, rows 3/4 apart) – see generator/hex.ts */
  hex = false;
  /**
   * isometric diamond map: cell (x, y) is a diamond 2 world units wide and 1 high, its top corner at
   * world (x − y + H, (x + y) / 2 + ISO_TOP); walls stand as blocks, raised floor (heights) as
   * lower blocks, objects and figures upright. Tiles are ordinary square tiles drawn transformed.
   */
  iso = false;
  /** raised floor per cell (plateaus, see generator terrain) – iso only */
  heights: Uint8Array | null = null;
  /** tile for the side faces of wall blocks / raised floor (role wall_front / cliff_front) – iso only */
  isoWallSide = 0;
  isoCliffSide = 0;
  /** map size in world units (a hex map is half a cell wider and ¾ as high) */
  get worldW() {
    if (this.iso) return this.W + this.H;
    return this.hex ? hexWorldSize(this.W, this.H)[0] : this.W;
  }
  get worldH() {
    if (this.iso) return (this.W + this.H) / 2 + ISO_TOP;
    return this.hex ? hexWorldSize(this.W, this.H)[1] : this.H;
  }
  /** world point of a map point (cell coordinates, fractional) */
  toWorld(u: number, v: number): [number, number] {
    return this.iso ? [u - v + this.H, (u + v) / 2 + ISO_TOP] : [u, v];
  }

  /* ---------- camera ---------- */
  get minZoom() {
    return Math.max(0.5, Math.min(this.viewW / this.worldW, this.viewH / this.worldH) * 0.4);
  }
  readonly maxZoom = 96;

  fit(padding = 0.92) {
    if (!this.viewW || !this.viewH) return;
    const zoom = Math.min(this.viewW / this.worldW, this.viewH / this.worldH) * padding;
    this.cam.zoom = zoom;
    this.cam.x = this.worldW / 2 - this.viewW / zoom / 2;
    this.cam.y = this.worldH / 2 - this.viewH / zoom / 2;
    this.cameraChanged();
  }

  focus(x: number, y: number, w = 1, h = 1) {
    const span = this.iso ? (w + h) * 1.2 : 0;
    const zoom = clamp(Math.min(this.viewW / (Math.max(w, span) + 8), this.viewH / (Math.max(h, span / 2) + 8)), this.minZoom, 48);
    const [cx, cy] = this.toWorld(x + w / 2, y + h / 2);
    this.cam.zoom = zoom;
    this.cam.x = cx - this.viewW / zoom / 2;
    this.cam.y = cy - this.viewH / zoom / 2;
    this.cameraChanged();
  }

  /** keep a world point in the view centre (playtest camera) */
  follow(x: number, y: number, snap = false) {
    [x, y] = this.toWorld(x, y);
    const tx = x - this.viewW / this.cam.zoom / 2;
    const ty = y - this.viewH / this.cam.zoom / 2;
    const k = snap ? 1 : 0.18;
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.onCameraChange?.(this.cam);
    this.cameraListeners.forEach((f) => f());
    this.requestRender();
  }

  /** put a world point in the middle of the view (minimap) */
  centerOn(wx: number, wy: number) {
    this.cam.x = wx - this.viewW / this.cam.zoom / 2;
    this.cam.y = wy - this.viewH / this.cam.zoom / 2;
    this.cameraChanged();
  }

  zoomAt(sx: number, sy: number, factor: number) {
    const z = clamp(this.cam.zoom * factor, this.minZoom, this.maxZoom);
    const wx = this.cam.x + sx / this.cam.zoom;
    const wy = this.cam.y + sy / this.cam.zoom;
    this.cam.zoom = z;
    this.cam.x = wx - sx / z;
    this.cam.y = wy - sy / z;
    this.cameraChanged();
  }

  panBy(dx: number, dy: number) {
    this.cam.x -= dx / this.cam.zoom;
    this.cam.y -= dy / this.cam.zoom;
    this.cameraChanged();
  }

  private cameraChanged() {
    // keep at least part of the map on screen
    const vw = this.viewW / this.cam.zoom;
    const vh = this.viewH / this.cam.zoom;
    this.cam.x = clamp(this.cam.x, -vw + 2, this.worldW - 2);
    this.cam.y = clamp(this.cam.y, -vh + 2, this.worldH - 2);
    this.onCameraChange?.(this.cam);
    this.cameraListeners.forEach((f) => f());
    this.requestRender();
  }

  screenToCell(sx: number, sy: number): { x: number; y: number } {
    if (this.iso) {
      const wx = this.cam.x + sx / this.cam.zoom - this.H;
      const wy = (this.cam.y + sy / this.cam.zoom - ISO_TOP) * 2;
      return { x: Math.floor((wx + wy) / 2), y: Math.floor((wy - wx) / 2) };
    }
    if (this.hex) return hexAt(this.cam.x + sx / this.cam.zoom, this.cam.y + sy / this.cam.zoom);
    return {
      x: Math.floor(this.cam.x + sx / this.cam.zoom),
      y: Math.floor(this.cam.y + sy / this.cam.zoom),
    };
  }

  inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.W && y < this.H;
  }

  /* ---------- rendering ---------- */
  requestRender() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  }

  private rebuildChunk(ci: number): HTMLCanvasElement {
    const chunk = this.chunks[ci];
    const ppt = this.cachePpt;
    if (!chunk.canvas) {
      chunk.canvas = document.createElement('canvas');
      chunk.canvas.width = CHUNK * ppt;
      chunk.canvas.height = CHUNK * ppt;
    }
    const c = chunk.canvas.getContext('2d')!;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, chunk.canvas.width, chunk.canvas.height);
    const cx0 = (ci % this.chunkCols) * CHUNK;
    const cy0 = Math.floor(ci / this.chunkCols) * CHUNK;
    const x1 = Math.min(this.W, cx0 + CHUNK);
    const y1 = Math.min(this.H, cy0 + CHUNK);
    const firstYs = this.layers.findIndex((l) => l.visible && l.ySort);
    for (let li = 0; li < this.layers.length; li++) {
      const layer = this.layers[li];
      if (!layer.visible) continue;
      // non-sorted layers above the y-sorted group are drawn after objects (not cached)
      if (firstYs >= 0 && li > firstYs && !layer.ySort) continue;
      c.globalAlpha = layer.opacity ?? 1;
      const d = layer.data;
      for (let y = cy0; y < y1; y++)
        for (let x = cx0; x < x1; x++) {
          const g = d[y * this.W + x];
          if (g && !this.hiddenGids.has(tileOf(g))) drawGid(c, this.table, g, (x - cx0) * ppt, (y - cy0) * ppt, ppt, ppt);
        }
    }
    c.globalAlpha = 1;
    chunk.dirty = false;
    return chunk.canvas;
  }

  /** side view: sky gradient with two rows of soft hills (slower parallax), or a dark cave */
  private drawBackdrop(x: number, y: number, w: number, h: number) {
    const { ctx } = this;
    if (this.backdrop === 'cave') {
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#1b1924');
      g.addColorStop(1, '#0f0e14');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      return;
    }
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#5fb4ec');
    g.addColorStop(0.7, '#b9e2f7');
    g.addColorStop(1, '#dff3fb');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const z = this.cam.zoom;
    const hills = (color: string, level: number, amp: number, freq: number, parallax: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      const base = y + h * level;
      const off = this.cam.x * z * parallax;
      ctx.moveTo(x, y + h);
      for (let px = 0; px <= w; px += 6) {
        const t = (px + off) / (z * freq);
        ctx.lineTo(x + px, base - amp * h * (0.5 + 0.35 * Math.sin(t) + 0.15 * Math.sin(t * 2.3 + 1)));
      }
      ctx.lineTo(x + w, y + h);
      ctx.closePath();
      ctx.fill();
    };
    hills('#a9d8c4', 0.62, 0.22, 9, 0.2);
    hills('#8cc7a6', 0.72, 0.16, 5, 0.45);
    ctx.restore();
  }

  render() {
    if (this.table.refresh()) {
      for (const c of this.chunks) c.dirty = true;
      if (this.isoCache) this.isoCache.dirty = true;
    }
    if (this.hex) {
      this.renderHex();
      return;
    }
    if (this.iso) {
      this.renderIso();
      return;
    }
    const { ctx, cam } = this;
    const z = cam.zoom;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = COLORS.outside;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    const sx = (wx: number) => Math.round((wx - cam.x) * z);
    const sy = (wy: number) => Math.round((wy - cam.y) * z);

    // map background
    ctx.fillStyle = COLORS.mapBg;
    ctx.fillRect(sx(0), sy(0), sx(this.W) - sx(0), sy(this.H) - sy(0));
    if (this.backdrop !== 'plain') this.drawBackdrop(sx(0), sy(0), sx(this.W) - sx(0), sy(this.H) - sy(0));

    const x0 = Math.max(0, Math.floor(cam.x));
    const y0 = Math.max(0, Math.floor(cam.y));
    const x1 = Math.min(this.W, Math.ceil(cam.x + this.viewW / z));
    const y1 = Math.min(this.H, Math.ceil(cam.y + this.viewH / z));

    // layer groups: before the y-sorted pass, y-sorted, after it
    const firstYs = this.layers.findIndex((l) => l.visible && l.ySort);
    const pre: Layer[] = [];
    const ys: Layer[] = [];
    const post: Layer[] = [];
    this.layers.forEach((l, i) => {
      if (!l.visible) return;
      if (l.ySort) ys.push(l);
      else if (firstYs < 0 || i < firstYs) pre.push(l);
      else post.push(l);
    });

    const drawLayerDirect = (layer: Layer) => {
      ctx.globalAlpha = layer.opacity ?? 1;
      const d = layer.data;
      for (let y = y0; y < y1; y++) {
        const dy = sy(y);
        const dh = sy(y + 1) - dy;
        for (let x = x0; x < x1; x++) {
          const g = d[y * this.W + x];
          if (!g || this.hiddenGids.has(tileOf(g))) continue;
          const dx = sx(x);
          drawGid(ctx, this.table, g, dx, dy, sx(x + 1) - dx, dh);
        }
      }
      ctx.globalAlpha = 1;
    };

    // sortable items: y-sorted tiles, objects, test character
    type Item = { key: number; draw: () => void };
    const items: Item[] = [];
    const overhead: (() => void)[] = [];
    const atlas = this.objects.length ? objectAtlas().canvas : null;
    const A = OBJECT_ATLAS_TILE;
    for (const o of this.objects) {
      const def = objectDef(o.type);
      if (!def) continue;
      const top = o.y - def.h + 1;
      if (o.x + def.w < x0 || o.x > x1 || o.y + 1 < y0 || top > y1) continue;
      const drawRows = (r0: number, r1: number) => {
        if (!atlas || r1 <= r0) return;
        const dx = sx(o.x);
        const dy = sy(top + r0);
        ctx.drawImage(atlas, def.sx * A, (def.sy + r0) * A, def.w * A, (r1 - r0) * A, dx, dy, sx(o.x + def.w) - dx, sy(top + r1) - dy);
      };
      items.push({ key: o.y + 1, draw: () => drawRows(def.overheadRows, def.h) });
      if (def.overheadRows) overhead.push(() => drawRows(0, def.overheadRows));
      if (this.overlay.objectHighlight === o.id)
        overhead.push(() => {
          ctx.strokeStyle = COLORS.accent;
          ctx.lineWidth = 2;
          ctx.strokeRect(sx(o.x) + 1, sy(top) + 1, sx(o.x + def.w) - sx(o.x) - 2, sy(o.y + 1) - sy(top) - 2);
        });
    }
    const ch = this.character;
    if (ch) items.push({ key: ch.y, draw: () => drawCharacter(ctx, ch, sx, sy, z) });
    if (this.playItems) for (const it of this.playItems(ctx, sx, sy, z)) items.push(it);
    // moving tiles (lifts in the side-scroller playtest)
    for (const mv of this.movers)
      items.push({
        key: mv.y + 0.5,
        draw: () => {
          const dx = sx(mv.x);
          const dy = sy(mv.y);
          drawGid(ctx, this.table, mv.gid, dx, dy, sx(mv.x + 1) - dx, sy(mv.y + 1) - dy);
        },
      });

    if (z < this.cachePpt) {
      const cx0 = Math.floor(x0 / CHUNK);
      const cy0 = Math.floor(y0 / CHUNK);
      const cx1 = Math.ceil(x1 / CHUNK);
      const cy1 = Math.ceil(y1 / CHUNK);
      ctx.imageSmoothingEnabled = z < this.cachePpt * 0.5;
      ctx.imageSmoothingQuality = 'medium';
      for (let cy = cy0; cy < cy1; cy++)
        for (let cx = cx0; cx < cx1; cx++) {
          const ci = cy * this.chunkCols + cx;
          const chunk = this.chunks[ci];
          if (!chunk) continue;
          const canvas = chunk.dirty || !chunk.canvas ? this.rebuildChunk(ci) : chunk.canvas;
          const dx = sx(cx * CHUNK);
          const dy = sy(cy * CHUNK);
          ctx.drawImage(canvas, dx, dy, sx(cx * CHUNK + CHUNK) - dx, sy(cy * CHUNK + CHUNK) - dy);
        }
      ctx.imageSmoothingEnabled = false;
      // zoomed out: the cache already holds all y-sorted tiles; objects go on top
      items.sort((a, b) => a.key - b.key);
      for (const it of items) it.draw();
      for (const f of overhead) f();
    } else {
      for (const layer of pre) drawLayerDirect(layer);
      // y-sorted pass: tiles are keyed by the bottom edge of their row (+ sort offset)
      const yEnd = Math.min(this.H, y1 + 3);
      for (const layer of ys) {
        const d = layer.data;
        const alpha = layer.opacity ?? 1;
        for (let y = y0; y < yEnd; y++)
          for (let x = x0; x < x1; x++) {
            const g = d[y * this.W + x];
            if (!g) continue;
            const off = tileOf(g) < this.table.sortOff.length ? this.table.sortOff[tileOf(g)] : 0;
            items.push({
              key: y + 1 + off - 0.001,
              draw: () => {
                const dx = sx(x);
                const dy = sy(y);
                ctx.globalAlpha = alpha;
                drawGid(ctx, this.table, g, dx, dy, sx(x + 1) - dx, sy(y + 1) - dy);
                ctx.globalAlpha = 1;
              },
            });
          }
      }
      items.sort((a, b) => a.key - b.key);
      for (const it of items) it.draw();
      for (const f of overhead) f();
    }
    // layers above the y-sorted pass (overhead, markers, collision) – never cached
    for (const layer of post) drawLayerDirect(layer);

    if (this.overlay.collision) {
      const c = this.overlay.collision;
      ctx.fillStyle = 'rgba(230, 80, 100, 0.32)';
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) if (c[y * this.W + x]) ctx.fillRect(sx(x), sy(y), sx(x + 1) - sx(x), sy(y + 1) - sy(y));
    }
    if (this.overlay.showSortPoints) {
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const o of this.objects) {
        const def = objectDef(o.type);
        if (!def) continue;
        const py = sy(o.y + 1) - 1;
        ctx.moveTo(sx(o.x) + 2, py);
        ctx.lineTo(sx(o.x + def.w) - 2, py);
      }
      if (ch) {
        ctx.moveTo(sx(ch.x - 0.4), sy(ch.y));
        ctx.lineTo(sx(ch.x + 0.4), sy(ch.y));
      }
      ctx.stroke();
    }

    // grid
    if (this.overlay.showGrid && z >= 5) {
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = x0; x <= x1; x++) {
        if (x % 10 === 0) continue;
        const px = sx(x) + 0.5;
        ctx.moveTo(px, sy(y0));
        ctx.lineTo(px, sy(y1));
      }
      for (let y = y0; y <= y1; y++) {
        if (y % 10 === 0) continue;
        const py = sy(y) + 0.5;
        ctx.moveTo(sx(x0), py);
        ctx.lineTo(sx(x1), py);
      }
      ctx.strokeStyle = COLORS.grid;
      ctx.stroke();
    }
    if (this.overlay.showGrid && z >= 2) {
      ctx.beginPath();
      for (let x = Math.ceil(x0 / 10) * 10; x <= x1; x += 10) {
        const px = sx(x) + 0.5;
        ctx.moveTo(px, sy(y0));
        ctx.lineTo(px, sy(y1));
      }
      for (let y = Math.ceil(y0 / 10) * 10; y <= y1; y += 10) {
        const py = sy(y) + 0.5;
        ctx.moveTo(sx(x0), py);
        ctx.lineTo(sx(x1), py);
      }
      ctx.strokeStyle = COLORS.gridMajor;
      ctx.stroke();
    }

    // map border
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx(0) - 0.5, sy(0) - 0.5, sx(this.W) - sx(0) + 1, sy(this.H) - sy(0) + 1);

    this.drawOverlay(sx, sy);
    if (this.overlay.showCoords) this.drawRulers(sx, sy, x0, y0, x1, y1);
  }

  /** hex maps: no y-sort, every hex drawn at its offset position, hex grid and hex highlights */
  private renderHex() {
    const { ctx, cam } = this;
    const z = cam.zoom;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    // zoomed out: smooth down-scaling, otherwise single outline pixels of the hexes form stripes
    const smooth = z * this.dpr < 24;
    ctx.fillStyle = COLORS.outside;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    const sx = (wx: number) => Math.round((wx - cam.x) * z);
    const sy = (wy: number) => Math.round((wy - cam.y) * z);
    ctx.fillStyle = COLORS.mapBg;
    ctx.fillRect(sx(0), sy(0), sx(this.worldW) - sx(0), sy(this.worldH) - sy(0));

    const y0 = Math.max(0, Math.floor(cam.y / ROW_STEP) - 1);
    const y1 = Math.min(this.H, Math.ceil((cam.y + this.viewH / z) / ROW_STEP) + 1);
    const x0 = Math.max(0, Math.floor(cam.x) - 1);
    const x1 = Math.min(this.W, Math.ceil(cam.x + this.viewW / z) + 1);
    const box = (x: number, y: number) => {
      const [ox, oy] = hexOrigin(x, y);
      const dx = sx(ox);
      const dy = sy(oy);
      return [dx, dy, sx(ox + 1) - dx, sy(oy + 1) - dy] as const;
    };
    ctx.imageSmoothingEnabled = smooth;
    for (const layer of this.layers) {
      if (!layer.visible) continue;
      ctx.globalAlpha = layer.opacity ?? 1;
      const d = layer.data;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const g = d[y * this.W + x];
          if (!g || this.hiddenGids.has(tileOf(g))) continue;
          const [dx, dy, w, h] = box(x, y);
          // zoomed out: 1 px overlap closes the rounding gaps between the interlocking rows
          drawGid(ctx, this.table, g, dx, dy, w + (smooth ? 1 : 0), h + (smooth ? 1 : 0));
        }
    }
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    const hexPath = (x: number, y: number, inset = 0) => {
      const [ox, oy] = hexOrigin(x, y);
      HEX_CORNERS.forEach(([cx, cy], k) => {
        const px = sx(ox + inset + cx * (1 - 2 * inset));
        const py = sy(oy + inset + cy * (1 - 2 * inset));
        if (k) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.closePath();
    };
    if (this.overlay.collision) {
      const c = this.overlay.collision;
      ctx.fillStyle = 'rgba(230, 80, 100, 0.32)';
      ctx.beginPath();
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (c[y * this.W + x]) hexPath(x, y);
      ctx.fill();
    }
    if (this.overlay.showGrid && z >= 6) {
      ctx.beginPath();
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) hexPath(x, y);
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx(0) - 0.5, sy(0) - 0.5, sx(this.worldW) - sx(0) + 1, sy(this.worldH) - sy(0) + 1);

    // highlights: every hex of the rectangle (in cell coordinates)
    const o = this.overlay;
    const cells = (r: Selection, fill: string | null, stroke: string, dash: number[] = []) => {
      ctx.beginPath();
      for (let y = Math.max(0, r.y); y < Math.min(this.H, r.y + r.h); y++) for (let x = Math.max(0, r.x); x < Math.min(this.W, r.x + r.w); x++) hexPath(x, y, 0.04);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.setLineDash(dash);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    };
    if (o.highlight) cells(o.highlight, 'rgba(232,137,176,0.10)', COLORS.accent, [6, 4]);
    if (o.selection) cells(o.selection, 'rgba(232,137,176,0.08)', COLORS.accent, [5, 4]);
    if (o.preview) cells(o.preview, COLORS.accentFill, COLORS.accent);
    if (o.stamp) cells({ x: o.stamp.x, y: o.stamp.y, w: o.stamp.clip.w, h: o.stamp.clip.h }, COLORS.accentFill, COLORS.accent, [5, 4]);
    else if (o.hover && this.inBounds(o.hover.x, o.hover.y) && o.activeTool !== 'hand') {
      const n = o.activeTool === 'brush' || o.activeTool === 'eraser' ? o.brushSize : 1;
      const off = Math.floor((n - 1) / 2);
      cells({ x: o.hover.x - off, y: o.hover.y - off, w: n, h: n }, 'rgba(255,255,255,0.08)', COLORS.accent);
    }
  }


  /* ---------- isometric diamond map ---------- */

  private isoCache: { canvas: HTMLCanvasElement; ppt: number; dirty: boolean } | null = null;

  /** draw the flat layers of one cell as a diamond (world top corner wx, wy; lift in world units) */
  private isoFlat(ctx: CanvasRenderingContext2D, layers: Layer[], i: number, px: number, py: number, u: number) {
    // unit square → diamond: +x = (u, u/2), +y = (−u, u/2); a hair bigger so no seams show
    const k = 1 + 1.2 / Math.max(4, u);
    for (const layer of layers) {
      const g = layer.data[i];
      if (!g) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity ?? 1;
      ctx.transform(u * k, (u / 2) * k, -u * k, (u / 2) * k, px, py - (u * (k - 1)) / 2);
      drawGid(ctx, this.table, g, 0, 0, 1, 1);
      ctx.restore();
    }
  }

  /** a block: side faces (texture side, else top) + top face at `lift` world units */
  private isoBlock(ctx: CanvasRenderingContext2D, top: (() => void) | null, side: number, px: number, py: number, u: number, lift: number) {
    const h = lift * u;
    const faces: [number, number, number, number, string][] = [
      // left face: from the left corner to the bottom corner, lit
      [u, u / 2, px - u, py + u / 2 - h, 'rgba(0,0,0,0.18)'],
      // right face: from the bottom corner to the right corner, shaded
      [u, -u / 2, px, py + u - h, 'rgba(0,0,0,0.42)'],
    ];
    for (const [a, b, e, f, shade] of faces) {
      ctx.save();
      ctx.transform(a, b, 0, h, e, f);
      if (side) drawGid(ctx, this.table, side, 0, 0, 1, 1);
      ctx.fillStyle = side ? shade : 'rgba(40,36,50,0.95)';
      ctx.fillRect(0, 0, 1, 1);
      ctx.restore();
    }
    if (top) {
      ctx.save();
      ctx.translate(0, -h);
      top();
      ctx.restore();
    }
  }

  private renderIso() {
    const { ctx, cam } = this;
    const z = cam.zoom;
    const W = this.W;
    const H = this.H;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = COLORS.outside;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    const sx = (wx: number) => (wx - cam.x) * z;
    const sy = (wy: number) => (wy - cam.y) * z;
    // screen position of the top corner of cell (x, y) / of a map point
    const P = (u: number, v: number): [number, number] => {
      const [wx, wy] = this.toWorld(u, v);
      return [sx(wx), sy(wy)];
    };

    // map floor outline
    ctx.fillStyle = COLORS.mapBg;
    ctx.beginPath();
    ctx.moveTo(...P(0, 0));
    ctx.lineTo(...P(W, 0));
    ctx.lineTo(...P(W, H));
    ctx.lineTo(...P(0, H));
    ctx.closePath();
    ctx.fill();

    const visible = this.layers.filter((l) => l.visible);
    // flat: everything painted on the ground; walls become blocks, standing things stand up;
    // 3/4 wall fronts and top-down shadows make no sense in the diamond view
    const flat = visible.filter((l) => ['floor', 'groundDetails', 'paths', 'deco', 'gameplay', 'spawn', 'custom'].includes(l.role));
    const walls = visible.filter((l) => l.role === 'walls');
    const standing = visible.filter((l) => l.role === 'objects' || l.role === 'objectsFront' || l.role === 'overhead');
    const heights = this.heights && this.heights.length === W * H ? this.heights : null;

    // visible cells: the view rectangle in cell space (a rotated square) plus a margin for tall things
    const wx0 = cam.x - 2;
    const wx1 = cam.x + this.viewW / z + 2;
    const wy0 = cam.y - 1;
    const wy1 = cam.y + this.viewH / z + ISO_TOP + 2;
    const inView = (x: number, y: number) => {
      const wx = x - y + H;
      const wy = (x + y) / 2 + ISO_TOP;
      return wx + 1 >= wx0 && wx - 1 <= wx1 && wy + 1 >= wy0 && wy - 2.5 <= wy1;
    };
    const dMin = Math.max(0, Math.floor((wy0 - ISO_TOP) * 2) - 2);
    const dMax = Math.min(W + H - 2, Math.ceil((wy1 - ISO_TOP) * 2) + 2);
    const cells: number[] = [];
    for (let d = dMin; d <= dMax; d++) {
      const xa = Math.max(0, d - (H - 1));
      const xb = Math.min(W - 1, d);
      for (let x = xa; x <= xb; x++) {
        const y = d - x;
        if (inView(x, y)) cells.push(y * W + x);
      }
    }

    // flat pass (cached as one picture when zoomed out)
    const lifted = (i: number) => !!heights && heights[i] > 0;
    if (z < 10) {
      const cache = this.isoFlatCache(flat, heights);
      const [ox, oy] = [sx(0), sy(0)];
      ctx.imageSmoothingEnabled = z < cache.ppt * 0.6;
      ctx.drawImage(cache.canvas, ox, oy, this.worldW * z, this.worldH * z);
      ctx.imageSmoothingEnabled = false;
    } else {
      for (const i of cells) {
        if (lifted(i)) continue;
        const [px, py] = P(i % W, (i / W) | 0);
        this.isoFlat(ctx, flat, i, px, py, z);
      }
    }

    // depth pass: blocks, raised floor, standing tiles, objects, figures – sorted by x + y
    type Item = { key: number; draw: () => void };
    const items: Item[] = [];
    for (const i of cells) {
      const x = i % W;
      const y = (i / W) | 0;
      const [px, py] = P(x, y);
      const wallG = walls.map((l) => l.data[i]).find(Boolean);
      const lift = heights ? heights[i] * ISO_STEP : 0;
      if (wallG) {
        items.push({ key: x + y + 1, draw: () => this.isoBlock(ctx, () => this.isoFlat(ctx, walls, i, px, py, z), this.isoWallSide || wallG, px, py, z, ISO_WALL + lift) });
      } else if (lift) {
        const floorG = flat[0]?.data[i] ?? 0;
        items.push({ key: x + y + 1 - 0.01, draw: () => this.isoBlock(ctx, () => this.isoFlat(ctx, flat, i, px, py, z), this.isoCliffSide || floorG, px, py, z, lift) });
      }
      for (const l of standing) {
        const g = l.data[i];
        if (!g) continue;
        // a tile standing upright on the middle of its diamond
        items.push({
          key: x + y + 1.02,
          draw: () => {
            const [cx, cy] = P(x + 0.5, y + 0.5);
            const w = z * 1.1;
            ctx.globalAlpha = l.opacity ?? 1;
            drawGid(ctx, this.table, g, cx - w / 2, cy - w + z * 0.2 - lift * z, w, w);
            ctx.globalAlpha = 1;
          },
        });
      }
    }
    // objects (trees, houses …): the sprite stands on the middle of its base row
    const atlas = this.objects.length ? objectAtlas().canvas : null;
    const A = OBJECT_ATLAS_TILE;
    for (const o of this.objects) {
      const def = objectDef(o.type);
      if (!def || !atlas || !inView(o.x, o.y)) continue;
      const u = o.x + def.w / 2;
      const v = o.y + 0.5;
      items.push({
        key: u + v + 0.03,
        draw: () => {
          const [cx, cy] = P(u, v);
          const s = z * 1.25;
          const w = def.w * s;
          const h = def.h * s;
          const bottom = cy + z * 0.25;
          ctx.drawImage(atlas, def.sx * A, def.sy * A, def.w * A, def.h * A, cx - w / 2, bottom - h, w, h);
          if (this.overlay.objectHighlight === o.id) {
            ctx.strokeStyle = COLORS.accent;
            ctx.lineWidth = 2;
            ctx.strokeRect(cx - w / 2, bottom - h, w, h);
          }
        },
      });
    }
    // figures: drawn with screen mappers local to their standing point
    const at = (fx: number, fy: number): [(x: number) => number, (y: number) => number] => {
      const [cx, cy] = P(fx, fy);
      return [(x: number) => cx + (x - fx) * z, (y: number) => cy + (y - fy) * z];
    };
    const ch = this.character;
    if (ch) {
      const [lx, ly] = at(ch.x, ch.y);
      items.push({ key: ch.x + ch.y, draw: () => drawCharacter(ctx, ch, lx, ly, z) });
    }
    if (this.playItems) for (const it of this.playItems(ctx, sx, sy, z, at)) items.push({ key: it.x !== undefined && it.y !== undefined ? it.x + it.y : it.key, draw: it.draw });
    items.sort((a, b) => a.key - b.key);
    for (const it of items) it.draw();

    // overlays: collision, grid, highlights – as diamonds on the ground
    const diamond = (x: number, y: number, w = 1, h = 1) => {
      ctx.moveTo(...P(x, y));
      ctx.lineTo(...P(x + w, y));
      ctx.lineTo(...P(x + w, y + h));
      ctx.lineTo(...P(x, y + h));
      ctx.closePath();
    };
    if (this.overlay.collision) {
      const c = this.overlay.collision;
      ctx.fillStyle = 'rgba(230, 80, 100, 0.32)';
      ctx.beginPath();
      for (const i of cells) if (c[i]) diamond(i % W, (i / W) | 0);
      ctx.fill();
    }
    if (this.overlay.showGrid && z >= 6) {
      ctx.beginPath();
      for (let x = 0; x <= W; x++) {
        ctx.moveTo(...P(x, 0));
        ctx.lineTo(...P(x, H));
      }
      for (let y = 0; y <= H; y++) {
        ctx.moveTo(...P(0, y));
        ctx.lineTo(...P(W, y));
      }
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.beginPath();
    diamond(0, 0, W, H);
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    const o = this.overlay;
    const area = (r: Selection, fill: string | null, stroke: string, dash: number[] = []) => {
      ctx.beginPath();
      diamond(r.x, r.y, r.w, r.h);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.setLineDash(dash);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    };
    if (o.highlight) area(o.highlight, 'rgba(232,137,176,0.10)', COLORS.accent, [6, 4]);
    if (o.selection) area(o.selection, 'rgba(232,137,176,0.08)', COLORS.accent, [5, 4]);
    if (o.preview) area(o.preview, COLORS.accentFill, COLORS.accent);
    if (o.stamp) area({ x: o.stamp.x, y: o.stamp.y, w: o.stamp.clip.w, h: o.stamp.clip.h }, COLORS.accentFill, COLORS.accent, [5, 4]);
    else if (o.hover && this.inBounds(o.hover.x, o.hover.y) && o.activeTool !== 'hand') {
      const n = o.activeTool === 'brush' || o.activeTool === 'eraser' ? o.brushSize : 1;
      const off = Math.floor((n - 1) / 2);
      area({ x: o.hover.x - off, y: o.hover.y - off, w: n, h: n }, 'rgba(255,255,255,0.08)', COLORS.accent);
    }
  }

  /** zoomed out: all flat cells as one picture (rebuilt when the map changes) */
  private isoFlatCache(flat: Layer[], heights: Uint8Array | null) {
    const ppt = clamp(Math.floor(4096 / this.worldW), 2, 10);
    let c = this.isoCache;
    if (!c || c.ppt !== ppt || c.canvas.width !== Math.ceil(this.worldW * ppt) || c.canvas.height !== Math.ceil(this.worldH * ppt)) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(this.worldW * ppt);
      canvas.height = Math.ceil(this.worldH * ppt);
      c = this.isoCache = { canvas, ppt, dirty: true };
    }
    if (c.dirty) {
      const g = c.canvas.getContext('2d')!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, c.canvas.width, c.canvas.height);
      g.imageSmoothingEnabled = false;
      for (let i = 0; i < this.W * this.H; i++) {
        if (heights && heights[i] > 0) continue;
        const [wx, wy] = this.toWorld(i % this.W, (i / this.W) | 0);
        this.isoFlat(g, flat, i, wx * ppt, wy * ppt, ppt);
      }
      c.dirty = false;
    }
    return c;
  }

  private drawOverlay(sx: (x: number) => number, sy: (y: number) => number) {
    const { ctx } = this;
    const o = this.overlay;
    const rect = (r: Selection, fill: string | null, stroke: string, dash: number[] = []) => {
      const x = sx(r.x);
      const y = sy(r.y);
      const w = sx(r.x + r.w) - x;
      const h = sy(r.y + r.h) - y;
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, w, h);
      }
      ctx.setLineDash(dash);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
      ctx.setLineDash([]);
    };
    if (o.highlight) rect(o.highlight, 'rgba(232,137,176,0.10)', COLORS.accent, [6, 4]);
    if (o.selection) {
      ctx.lineWidth = 1.5;
      rect(o.selection, 'rgba(232,137,176,0.08)', '#000', []);
      rect(o.selection, null, COLORS.accent, [5, 4]);
    }
    if (o.preview) rect(o.preview, COLORS.accentFill, COLORS.accent);
    if (o.stamp) {
      // copied tiles, a little transparent, where they would land
      const { clip, x: X, y: Y } = o.stamp;
      ctx.globalAlpha = 0.7;
      for (const l of clip.layers)
        for (let y = 0; y < clip.h; y++)
          for (let x = 0; x < clip.w; x++) {
            const g = l.data[y * clip.w + x];
            if (!g || !this.inBounds(X + x, Y + y)) continue;
            const dx = sx(X + x);
            const dy = sy(Y + y);
            drawGid(ctx, this.table, g, dx, dy, sx(X + x + 1) - dx, sy(Y + y + 1) - dy);
          }
      ctx.globalAlpha = 1;
      rect({ x: X, y: Y, w: clip.w, h: clip.h }, null, COLORS.accent, [5, 4]);
    } else if (o.hover && this.inBounds(o.hover.x, o.hover.y) && o.activeTool !== 'hand') {
      const n = o.activeTool === 'brush' || o.activeTool === 'eraser' ? o.brushSize : 1;
      const off = Math.floor((n - 1) / 2);
      rect({ x: o.hover.x - off, y: o.hover.y - off, w: n, h: n }, 'rgba(255,255,255,0.06)', COLORS.accent);
    }
  }

  private drawRulers(sx: (x: number) => number, sy: (y: number) => number, x0: number, y0: number, x1: number, y1: number) {
    const { ctx } = this;
    const step = this.cam.zoom >= 14 ? 5 : this.cam.zoom >= 5 ? 10 : 20;
    ctx.fillStyle = 'rgba(11,11,14,0.82)';
    ctx.fillRect(0, 0, this.viewW, 16);
    ctx.fillRect(0, 0, 26, this.viewH);
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = COLORS.text;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
      const px = sx(x);
      if (px > 26) ctx.fillText(String(x), px + 2, 8);
    }
    ctx.textAlign = 'right';
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
      const py = sy(y);
      if (py > 16) ctx.fillText(String(y), 23, py + 7);
    }
  }
}
