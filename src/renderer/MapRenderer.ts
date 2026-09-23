import type { Layer, Selection, Tileset } from '../types';
import { GidTable, drawGid } from './tileAtlas';
import { clamp } from '../utils/math';

// Canvas 2D map renderer.
// - zoomed in: draws only the visible tiles directly
// - zoomed out: composites cached 16×16-tile chunks (one canvas per chunk)
// Rendering happens on demand (dirty flag + requestAnimationFrame).

const CHUNK = 16;

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
  };
  onCameraChange?: (cam: Camera) => void;

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
    this.requestRender();
  }

  invalidateCells(cells: number[]) {
    for (const i of cells) {
      const x = i % this.W;
      const y = (i / this.W) | 0;
      const c = this.chunks[((y / CHUNK) | 0) * this.chunkCols + ((x / CHUNK) | 0)];
      if (c) c.dirty = true;
    }
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
    this.requestRender();
  }

  /* ---------- camera ---------- */
  get minZoom() {
    return Math.max(0.5, Math.min(this.viewW / this.W, this.viewH / this.H) * 0.4);
  }
  readonly maxZoom = 96;

  fit(padding = 0.92) {
    if (!this.viewW || !this.viewH) return;
    const zoom = Math.min(this.viewW / this.W, this.viewH / this.H) * padding;
    this.cam.zoom = zoom;
    this.cam.x = this.W / 2 - this.viewW / zoom / 2;
    this.cam.y = this.H / 2 - this.viewH / zoom / 2;
    this.cameraChanged();
  }

  focus(x: number, y: number, w = 1, h = 1) {
    const zoom = clamp(Math.min(this.viewW / (w + 8), this.viewH / (h + 8)), this.minZoom, 48);
    this.cam.zoom = zoom;
    this.cam.x = x + w / 2 - this.viewW / zoom / 2;
    this.cam.y = y + h / 2 - this.viewH / zoom / 2;
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
    this.cam.x = clamp(this.cam.x, -vw + 2, this.W - 2);
    this.cam.y = clamp(this.cam.y, -vh + 2, this.H - 2);
    this.onCameraChange?.(this.cam);
    this.requestRender();
  }

  screenToCell(sx: number, sy: number): { x: number; y: number } {
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
    for (const layer of this.layers) {
      if (!layer.visible) continue;
      const d = layer.data;
      for (let y = cy0; y < y1; y++)
        for (let x = cx0; x < x1; x++) {
          const g = d[y * this.W + x];
          if (g) drawGid(c, this.table, g, (x - cx0) * ppt, (y - cy0) * ppt, ppt, ppt);
        }
    }
    chunk.dirty = false;
    return chunk.canvas;
  }

  render() {
    if (this.table.refresh()) for (const c of this.chunks) c.dirty = true;
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

    const x0 = Math.max(0, Math.floor(cam.x));
    const y0 = Math.max(0, Math.floor(cam.y));
    const x1 = Math.min(this.W, Math.ceil(cam.x + this.viewW / z));
    const y1 = Math.min(this.H, Math.ceil(cam.y + this.viewH / z));

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
    } else {
      for (const layer of this.layers) {
        if (!layer.visible) continue;
        const d = layer.data;
        for (let y = y0; y < y1; y++) {
          const dy = sy(y);
          const dh = sy(y + 1) - dy;
          for (let x = x0; x < x1; x++) {
            const g = d[y * this.W + x];
            if (!g) continue;
            const dx = sx(x);
            drawGid(ctx, this.table, g, dx, dy, sx(x + 1) - dx, dh);
          }
        }
      }
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
    if (o.hover && this.inBounds(o.hover.x, o.hover.y) && o.activeTool !== 'hand') {
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
