import { useEffect, useRef } from 'react';
import { useProject } from '../store/projectStore';
import { useEditor } from '../store/editorStore';
import { mapEvents } from '../store/events';
import { getRenderer } from './rendererRef';
import { hexOrigin, hexWorldSize } from '../generator/hex';
import { tileOf } from '../tilesets/gid';
import type { Project, Tileset } from '../types';

// Overview of the whole map in a corner: one pixel (or a few) per cell in the average colour
// of its top tile, a frame for what the view shows. Tap / drag = jump there.

const MAX = 150;

/** average colour of every tile of a tileset (tileset image shrunk to one pixel per tile) */
const colorCache = new Map<string, Uint8ClampedArray | 'loading'>();
function tileColors(ts: Tileset, onReady: () => void): Uint8ClampedArray | null {
  const got = colorCache.get(ts.dataUrl);
  if (got && got !== 'loading') return got;
  if (got === 'loading') return null;
  colorCache.set(ts.dataUrl, 'loading');
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = ts.columns;
    c.height = ts.rows;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, ts.columns * ts.tileSize, ts.rows * ts.tileSize, 0, 0, ts.columns, ts.rows);
    colorCache.set(ts.dataUrl, g.getImageData(0, 0, ts.columns, ts.rows).data);
    onReady();
  };
  img.src = ts.dataUrl;
  return null;
}

function drawMap(canvas: HTMLCanvasElement, p: Project, redraw: () => void) {
  const { width: W, height: H } = p.map;
  const px = new Uint8ClampedArray(W * H * 4);
  // gid → colour lookup
  const colors: { lo: number; hi: number; cols: Uint8ClampedArray | null }[] = p.tilesets.map((ts) => ({ lo: ts.firstGid, hi: ts.firstGid + ts.columns * ts.rows, cols: tileColors(ts, redraw) }));
  const layers = p.layers.filter((l) => l.visible && l.role !== 'shadow' && l.role !== 'collision').reverse();
  for (let i = 0; i < W * H; i++) {
    for (const l of layers) {
      const g = tileOf(l.data[i]);
      if (!g) continue;
      const t = colors.find((c) => g >= c.lo && g < c.hi);
      if (!t?.cols) continue;
      const k = (g - t.lo) * 4;
      if (t.cols[k + 3] < 60) continue;
      px[i * 4] = t.cols[k];
      px[i * 4 + 1] = t.cols[k + 1];
      px[i * 4 + 2] = t.cols[k + 2];
      px[i * 4 + 3] = 255;
      break;
    }
  }
  const src = document.createElement('canvas');
  src.width = W;
  src.height = H;
  src.getContext('2d')!.putImageData(new ImageData(px, W, H), 0, 0);
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, canvas.width, canvas.height);
  if (p.map.perspective === 'hex') {
    // every odd row half a cell to the right, rows ¾ apart
    const s = canvas.width / hexWorldSize(W, H)[0];
    for (let y = 0; y < H; y++) {
      const [ox, oy] = hexOrigin(0, y);
      g.drawImage(src, 0, y, W, 1, ox * s, oy * s, W * s, Math.ceil(s));
    }
  } else if (p.map.perspective === 'isometric') {
    // diamond grid: cell (u, v) → world (u − v + H, (u + v) / 2 + 2), same as the map view
    const s = canvas.width / (W + H);
    g.setTransform(s, s / 2, -s, s / 2, H * s, 2 * s);
    g.drawImage(src, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
  } else g.drawImage(src, 0, 0, canvas.width, canvas.height);
}

export function Minimap({ compact = false }: { compact?: boolean }) {
  const show = useEditor((s) => s.showMinimap);
  const playtest = useEditor((s) => s.playtest);
  const W = useProject((s) => s.project.map.width);
  const H = useProject((s) => s.project.map.height);
  const persp = useProject((s) => s.project.map.perspective);
  const hex = persp === 'hex';
  const mapRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const max = compact ? 104 : MAX;
  const [ww, wh] = hex ? hexWorldSize(W, H) : persp === 'isometric' ? [W + H, (W + H) / 2 + 2] : [W, H];
  const scale = Math.min(max / ww, max / wh);
  const cw = Math.max(1, Math.round(ww * scale));
  const ch = Math.max(1, Math.round(wh * scale));

  // map picture: redrawn (throttled) when tiles change
  useEffect(() => {
    if (!show) return;
    let timer = 0;
    const redraw = () => {
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        if (mapRef.current) drawMap(mapRef.current, useProject.getState().project, redraw);
      }, 250);
    };
    if (mapRef.current) drawMap(mapRef.current, useProject.getState().project, redraw);
    const offMap = mapEvents.on(redraw);
    const offProject = useProject.subscribe((s, prev) => {
      if (s.project.layers !== prev.project.layers || s.project.tilesets !== prev.project.tilesets) redraw();
    });
    return () => {
      clearTimeout(timer);
      offMap();
      offProject();
    };
  }, [show, cw, ch]);

  // frame = visible part of the map
  useEffect(() => {
    if (!show) return;
    const r = getRenderer();
    if (!r) return;
    const update = () => {
      const f = frameRef.current;
      if (!f) return;
      const z = r.cam.zoom;
      const x0 = Math.max(0, r.cam.x);
      const y0 = Math.max(0, r.cam.y);
      const x1 = Math.min(ww, r.cam.x + r.viewW / z);
      const y1 = Math.min(wh, r.cam.y + r.viewH / z);
      const whole = r.cam.x <= 0 && r.cam.y <= 0 && x1 >= ww && y1 >= wh;
      f.style.display = whole || x1 <= x0 || y1 <= y0 ? 'none' : 'block';
      f.style.left = `${x0 * scale}px`;
      f.style.top = `${y0 * scale}px`;
      f.style.width = `${Math.max(4, (x1 - x0) * scale)}px`;
      f.style.height = `${Math.max(4, (y1 - y0) * scale)}px`;
    };
    update();
    r.cameraListeners.add(update);
    return () => {
      r.cameraListeners.delete(update);
    };
  }, [show, scale, ww, wh]);

  if (!show || playtest) return null;

  // tap / drag: centre the view there
  const jump = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = getRenderer();
    if (!r) return;
    const rect = e.currentTarget.getBoundingClientRect();
    r.centerOn((e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale);
  };
  return (
    <div
      className={`minimap${compact ? ' is-compact' : ''}`}
      style={{ width: cw, height: ch }}
      role="img"
      aria-label="Übersichtskarte – antippen oder ziehen, um dorthin zu springen"
      title="Übersicht: antippen oder ziehen, um dorthin zu springen"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        jump(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons) jump(e);
      }}
    >
      <canvas ref={mapRef} width={cw} height={ch} />
      <div ref={frameRef} className="minimap-frame" />
    </div>
  );
}
