import { useEffect, useRef } from 'react';
import { compose, useSprites } from './store';
import { hexToRgb, shiftColor } from './palette';
import type { SpriteKind } from './types';
import { useEditor } from '../store/editorStore';
import { Icon } from '../components/icons';
import { IconButton } from '../components/ui';

type Pt = { x: number; y: number };
type RGBA = [number, number, number, number];

/** cells of a line (Bresenham) */
function lineCells(a: Pt, b: Pt): Pt[] {
  const out: Pt[] = [];
  let { x, y } = a;
  const dx = Math.abs(b.x - x);
  const dy = -Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1;
  const sy = y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push({ x, y });
    if (x === b.x && y === b.y) break;
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

function rectCells(a: Pt, b: Pt): Pt[] {
  const out: Pt[] = [];
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  for (let x = x0; x <= x1; x++) out.push({ x, y: y0 }, { x, y: y1 });
  for (let y = y0 + 1; y < y1; y++) out.push({ x: x0, y }, { x: x1, y });
  return out;
}

const BRUSH_TOOLS = ['pen', 'eraser', 'dither', 'lighten', 'darken'];

/**
 * Zoomed pixel canvas: draws the composite of all visible layers and lets the user
 * paint on the active layer. Zoom with wheel / pinch / buttons, pan with the hand tool,
 * space + drag or the middle mouse button. Also the drop target for dragged parts.
 */
export function SpriteCanvas({ kind }: { kind: SpriteKind }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef({ zoom: 8, ox: 0, oy: 0 });
  const hover = useRef<Pt | null>(null);
  const preview = useRef<{ cells: Pt[]; move?: Pt } | null>(null);
  const space = useRef(false);
  useSprites((s) => s.rev);
  useSprites((s) => s[kind].doc);
  useSprites((s) => s[kind].active);
  const zoomLevel = useSprites((s) => s.zoom);
  const grid = useSprites((s) => s.grid);
  useSprites((s) => s.pan);
  useSprites((s) => s.brush);
  useSprites((s) => s.mirror);

  const draw = () => {
    const c = canvasRef.current;
    const wrap = wrapRef.current;
    if (!c || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      c.style.width = `${W}px`;
      c.style.height = `${H}px`;
    }
    const st = useSprites.getState();
    const d = st[kind].doc;
    const n = d.size;
    const fit = Math.max(2, Math.floor((Math.min(W, H) - 16) / n));
    const zoom = Math.max(1, Math.round(fit * st.zoom));
    const ox = Math.floor((W - n * zoom) / 2 + st.pan.x);
    const oy = Math.floor((H - n * zoom) / 2 + st.pan.y);
    view.current = { zoom, ox, oy };
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    // checkerboard
    const cell = Math.max(zoom, 8);
    for (let y = 0; y < n * zoom; y += cell)
      for (let x = 0; x < n * zoom; x += cell) {
        g.fillStyle = ((x + y) / cell) % 2 ? '#1d1c23' : '#24232b';
        g.fillRect(ox + x, oy + y, Math.min(cell, n * zoom - x), Math.min(cell, n * zoom - y));
      }
    // composite (active layer shifted while moving)
    const mv = preview.current?.move;
    const act = st[kind].active;
    const img = mv && act ? compose({ ...d, layers: d.layers.map((l) => (l.id === act ? { ...l, data: shifted(l.data, n, mv.x, mv.y) } : l)) }) : compose(d);
    const off = document.createElement('canvas');
    off.width = off.height = n;
    off.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img), n, n), 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(off, ox, oy, n * zoom, n * zoom);
    if (st.grid && zoom >= 6) {
      g.strokeStyle = 'rgba(255,255,255,0.06)';
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        g.moveTo(ox + i * zoom + 0.5, oy);
        g.lineTo(ox + i * zoom + 0.5, oy + n * zoom);
        g.moveTo(ox, oy + i * zoom + 0.5);
        g.lineTo(ox + n * zoom, oy + i * zoom + 0.5);
      }
      g.stroke();
      // 8-px guides + centre line (symmetric drawing)
      g.strokeStyle = 'rgba(255,255,255,0.1)';
      g.beginPath();
      for (let i = 8; i < n; i += 8) {
        g.moveTo(ox + i * zoom + 0.5, oy);
        g.lineTo(ox + i * zoom + 0.5, oy + n * zoom);
        g.moveTo(ox, oy + i * zoom + 0.5);
        g.lineTo(ox + n * zoom, oy + i * zoom + 0.5);
      }
      g.stroke();
    }
    if (st.mirror) {
      g.strokeStyle = 'rgba(232,137,176,0.6)';
      g.beginPath();
      g.moveTo(ox + (n / 2) * zoom + 0.5, oy);
      g.lineTo(ox + (n / 2) * zoom + 0.5, oy + n * zoom);
      g.stroke();
    }
    g.strokeStyle = '#3a3945';
    g.strokeRect(ox - 0.5, oy - 0.5, n * zoom + 1, n * zoom + 1);
    if (preview.current?.cells.length) {
      g.fillStyle = st.color;
      for (const p of preview.current.cells) if (p.x >= 0 && p.y >= 0 && p.x < n && p.y < n) g.fillRect(ox + p.x * zoom, oy + p.y * zoom, zoom, zoom);
    }
    // hover: brush footprint
    const h = hover.current;
    if (h && st.tool !== 'move' && st.tool !== 'hand') {
      const b = BRUSH_TOOLS.includes(st.tool) ? st.brush : 1;
      const o = Math.floor((b - 1) / 2);
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      const box = (x: number) => g.strokeRect(ox + (x - o) * zoom + 0.5, oy + (h.y - o) * zoom + 0.5, b * zoom - 1, b * zoom - 1);
      box(h.x);
      if (st.mirror) box(n - 1 - h.x - (b - 1) + 2 * o);
    }
  };

  useEffect(() => {
    draw();
  });
  useEffect(() => {
    const ro = new ResizeObserver(() => draw());
    if (wrapRef.current) ro.observe(wrapRef.current);
    const kd = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (e.target as HTMLElement)?.tagName !== 'INPUT') {
        space.current = true;
      }
    };
    const ku = (e: KeyboardEvent) => e.code === 'Space' && (space.current = false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    // wheel zoom (non-passive so the page does not scroll)
    const c = canvasRef.current;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const st = useSprites.getState();
      st.setView({ zoom: Math.max(0.5, Math.min(8, st.zoom * (e.deltaY < 0 ? 1.25 : 0.8))) });
    };
    c?.addEventListener('wheel', wheel, { passive: false });
    return () => {
      ro.disconnect();
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      c?.removeEventListener('wheel', wheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cellAt = (e: { clientX: number; clientY: number }): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    const { zoom, ox, oy } = view.current;
    return { x: Math.floor((e.clientX - r.left - ox) / zoom), y: Math.floor((e.clientY - r.top - oy) / zoom) };
  };

  /** active layer to paint on – creates a drawing layer when there is none */
  const target = () => {
    const st = useSprites.getState();
    const k = st[kind];
    let id = k.active;
    const l = k.doc.layers.find((x) => x.id === id);
    if (!l) id = st.addLayer(kind);
    else if (!l.visible) {
      useEditor.getState().toast('Aktive Ebene ist ausgeblendet');
      return null;
    }
    return useSprites.getState()[kind].doc.layers.find((x) => x.id === id) ?? null;
  };

  /** paint one brush dab (size, mirror, dither, lighten / darken) */
  const touched = useRef<Set<number>>(new Set());
  const dab = (data: Uint8ClampedArray, n: number, p: Pt, tool: string) => {
    const st = useSprites.getState();
    const b = BRUSH_TOOLS.includes(tool) ? st.brush : 1;
    const o = Math.floor((b - 1) / 2);
    const rgb = hexToRgb(st.color);
    for (let dy = 0; dy < b; dy++)
      for (let dx = 0; dx < b; dx++) {
        const q = { x: p.x - o + dx, y: p.y - o + dy };
        const pts = st.mirror ? [q, { x: n - 1 - q.x, y: q.y }] : [q];
        for (const r of pts) {
          if (r.x < 0 || r.y < 0 || r.x >= n || r.y >= n) continue;
          const i = (r.y * n + r.x) * 4;
          if (tool === 'eraser') data.set([0, 0, 0, 0], i);
          else if (tool === 'dither') {
            if ((r.x + r.y) % 2 === 0) data.set([...rgb, 255] as RGBA, i);
          } else if (tool === 'lighten' || tool === 'darken') {
            // once per stroke and pixel, only where something is drawn
            if (!data[i + 3] || touched.current.has(i)) continue;
            touched.current.add(i);
            data.set(shiftColor(data[i], data[i + 1], data[i + 2], tool === 'lighten' ? 0.18 : -0.18), i);
          } else data.set([...rgb, 255] as RGBA, i);
        }
      }
  };

  // pointers (two fingers = pinch zoom / pan)
  const pointers = useRef(new Map<number, Pt>());
  const pinch = useRef<{ dist: number; mid: Pt; zoom: number; pan: Pt } | null>(null);
  const drag = useRef<{ start: Pt; last: Pt; layer: string; tool: string; screen: Pt; pan: Pt } | null>(null);

  const onDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const st = useSprites.getState();
    if (pointers.current.size === 2) {
      // second finger: stop drawing, start pinch (undo the few pixels the first finger drew)
      if (drag.current && BRUSH_TOOLS.includes(drag.current.tool)) st.undo(kind);
      drag.current = null;
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, zoom: st.zoom, pan: st.pan };
      return;
    }
    if (e.button !== 0 && e.button !== 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const n = st[kind].doc.size;
    const p = cellAt(e);
    const tool = e.button === 1 || space.current ? 'hand' : st.tool;
    if (tool === 'hand') {
      drag.current = { start: p, last: p, layer: '', tool, screen: { x: e.clientX, y: e.clientY }, pan: st.pan };
      return;
    }
    if (tool === 'pipette') {
      if (p.x < 0 || p.y < 0 || p.x >= n || p.y >= n) return;
      const img = compose(st[kind].doc);
      const i = (p.y * n + p.x) * 4;
      if (img[i + 3]) st.setColor('#' + [img[i], img[i + 1], img[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join(''));
      return;
    }
    const layer = target();
    if (!layer) return;
    st.checkpoint(kind);
    const inside = p.x >= 0 && p.y >= 0 && p.x < n && p.y < n;
    if (tool === 'fill') {
      if (inside) {
        const rgba: RGBA = [...hexToRgb(st.color), 255];
        flood(layer.data, n, p, rgba);
        if (st.mirror) flood(layer.data, n, { x: n - 1 - p.x, y: p.y }, rgba);
        st.touch(kind, layer.id);
      }
      return;
    }
    if (tool === 'replace') {
      if (inside && replaceColor(layer.data, (p.y * n + p.x) * 4, [...hexToRgb(st.color), 255])) st.touch(kind, layer.id);
      return;
    }
    touched.current = new Set();
    drag.current = { start: p, last: p, layer: layer.id, tool, screen: { x: e.clientX, y: e.clientY }, pan: st.pan };
    if (BRUSH_TOOLS.includes(tool)) {
      dab(layer.data, n, p, tool);
      st.touch(kind, layer.id);
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const st = useSprites.getState();
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const pc = pinch.current;
      st.setView({ zoom: Math.max(0.5, Math.min(8, pc.zoom * (dist / Math.max(10, pc.dist)))), pan: { x: pc.pan.x + mid.x - pc.mid.x, y: pc.pan.y + mid.y - pc.mid.y } });
      return;
    }
    const p = cellAt(e);
    const h = hover.current;
    if (!h || h.x !== p.x || h.y !== p.y) {
      hover.current = p;
      if (!drag.current) draw();
    }
    const dr = drag.current;
    if (!dr) return;
    if (dr.tool === 'hand') {
      st.setView({ pan: { x: dr.pan.x + e.clientX - dr.screen.x, y: dr.pan.y + e.clientY - dr.screen.y } });
      return;
    }
    if (dr.last.x === p.x && dr.last.y === p.y) return;
    const n = st[kind].doc.size;
    const layer = st[kind].doc.layers.find((l) => l.id === dr.layer);
    if (!layer) return;
    if (BRUSH_TOOLS.includes(dr.tool)) {
      for (const q of lineCells(dr.last, p)) dab(layer.data, n, q, dr.tool);
      st.touch(kind, layer.id);
    } else if (dr.tool === 'line' || dr.tool === 'rect') {
      const cells = dr.tool === 'line' ? lineCells(dr.start, p) : rectCells(dr.start, p);
      preview.current = { cells: st.mirror ? [...cells, ...cells.map((q) => ({ x: n - 1 - q.x, y: q.y }))] : cells };
      draw();
    } else if (dr.tool === 'move') {
      preview.current = { cells: [], move: { x: p.x - dr.start.x, y: p.y - dr.start.y } };
      draw();
    }
    dr.last = p;
  };

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    const dr = drag.current;
    drag.current = null;
    if (!dr) return;
    const st = useSprites.getState();
    const n = st[kind].doc.size;
    const layer = st[kind].doc.layers.find((l) => l.id === dr.layer);
    if (layer && (dr.tool === 'line' || dr.tool === 'rect')) {
      for (const q of dr.tool === 'line' ? lineCells(dr.start, dr.last) : rectCells(dr.start, dr.last)) dab(layer.data, n, q, 'pen-1');
      st.touch(kind, layer.id);
    } else if (layer && dr.tool === 'move') {
      const m = preview.current?.move;
      if (m && (m.x || m.y)) {
        layer.data.set(shifted(layer.data, n, m.x, m.y));
        st.touch(kind, layer.id);
      }
    }
    preview.current = null;
    draw();
  };

  const tool = useSprites.getState().tool;
  return (
    <div className={`sprite-canvas tool-${tool}`} ref={wrapRef} data-sprite-drop={kind}>
      <canvas
        ref={canvasRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={() => {
          hover.current = null;
          if (!drag.current) draw();
        }}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Zeichenfläche"
      />
      <div className="sprite-view-controls">
        <IconButton label="Raster" active={grid} onClick={() => useSprites.getState().setView({ grid: !grid })}>
          <Icon.Grid size={16} />
        </IconButton>
        <IconButton label="Verkleinern" onClick={() => useSprites.getState().setView({ zoom: Math.max(0.5, zoomLevel * 0.8) })}>
          <Icon.Minus size={16} />
        </IconButton>
        <button type="button" className="zoom-label" title="Einpassen" onClick={() => useSprites.getState().setView({ zoom: 1, pan: { x: 0, y: 0 } })}>
          {Math.round(zoomLevel * 100)} %
        </button>
        <IconButton label="Vergrößern" onClick={() => useSprites.getState().setView({ zoom: Math.min(8, zoomLevel * 1.25) })}>
          <Icon.Plus size={16} />
        </IconButton>
        <IconButton label="Einpassen" onClick={() => useSprites.getState().setView({ zoom: 1, pan: { x: 0, y: 0 } })}>
          <Icon.Fit size={16} />
        </IconButton>
      </div>
    </div>
  );
}

function shifted(data: Uint8ClampedArray, n: number, dx: number, dy: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
      const s = (y * n + x) * 4;
      out.set(data.subarray(s, s + 4), (ty * n + tx) * 4);
    }
  return out;
}

/** every pixel of the clicked colour on this layer gets the new colour */
function replaceColor(data: Uint8ClampedArray, at: number, rgba: RGBA): boolean {
  if (!data[at + 3]) return false;
  const ref = [data[at], data[at + 1], data[at + 2], data[at + 3]];
  let changed = false;
  for (let i = 0; i < data.length; i += 4)
    if (data[i] === ref[0] && data[i + 1] === ref[1] && data[i + 2] === ref[2] && data[i + 3] === ref[3]) {
      data.set(rgba, i);
      changed = true;
    }
  return changed;
}

function flood(data: Uint8ClampedArray, n: number, p: Pt, rgba: RGBA) {
  const i0 = (p.y * n + p.x) * 4;
  const ref = [data[i0], data[i0 + 1], data[i0 + 2], data[i0 + 3]];
  if (ref.every((v, k) => v === rgba[k])) return;
  const same = (i: number) => (ref[3] === 0 ? data[i + 3] === 0 : data[i] === ref[0] && data[i + 1] === ref[1] && data[i + 2] === ref[2] && data[i + 3] === ref[3]);
  const stack = [p.y * n + p.x];
  const seen = new Uint8Array(n * n);
  while (stack.length) {
    const c = stack.pop()!;
    if (seen[c]) continue;
    seen[c] = 1;
    if (!same(c * 4)) continue;
    data.set(rgba, c * 4);
    const x = c % n;
    const y = (c - x) / n;
    if (x > 0) stack.push(c - 1);
    if (x < n - 1) stack.push(c + 1);
    if (y > 0) stack.push(c - n);
    if (y < n - 1) stack.push(c + n);
  }
}
