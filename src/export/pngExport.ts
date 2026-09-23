import type { Project } from '../types';
import { GidTable, drawGid } from '../renderer/tileAtlas';
import { loadImage, canvasToBlob } from '../utils/image';

export interface PngOptions {
  /** 'visible' = all visible layers, otherwise a layer id */
  layers: 'visible' | string;
  grid: boolean;
  background: boolean;
  /** pixels per tile */
  tilePx: number;
}

export const MAX_CANVAS_SIDE = 16384;
export const MAX_CANVAS_AREA = 120_000_000;

export function pngSize(p: Project, tilePx: number) {
  return { w: p.map.width * tilePx, h: p.map.height * tilePx };
}

export function pngTooLarge(p: Project, tilePx: number): boolean {
  const { w, h } = pngSize(p, tilePx);
  return w > MAX_CANVAS_SIDE || h > MAX_CANVAS_SIDE || w * h > MAX_CANVAS_AREA;
}

export async function renderMapPng(p: Project, o: PngOptions): Promise<Blob> {
  // make sure all tileset images are decoded before drawing
  await Promise.all(p.tilesets.map((t) => loadImage(t.dataUrl)));
  const table = new GidTable(p.tilesets);
  for (let i = 0; i < 20 && !table.allReady; i++) {
    await new Promise((r) => setTimeout(r, 25));
    table.refresh();
  }
  const { width: W, height: H } = p.map;
  const s = o.tilePx;
  const canvas = document.createElement('canvas');
  canvas.width = W * s;
  canvas.height = H * s;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  if (o.background) {
    ctx.fillStyle = '#101014';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const layers = o.layers === 'visible' ? p.layers.filter((l) => l.visible) : p.layers.filter((l) => l.id === o.layers);
  for (const l of layers)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const g = l.data[y * W + x];
        if (g) drawGid(ctx, table, g, x * s, y * s, s, s);
      }
  if (o.grid) {
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x++) {
      ctx.moveTo(x * s + 0.5, 0);
      ctx.lineTo(x * s + 0.5, H * s);
    }
    for (let y = 0; y <= H; y++) {
      ctx.moveTo(0, y * s + 0.5);
      ctx.lineTo(W * s, y * s + 0.5);
    }
    ctx.stroke();
  }
  return canvasToBlob(canvas);
}
