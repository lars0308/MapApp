import { useEffect, useRef } from 'react';
import { compose, useSprites } from './store';
import { hexToRgb } from './palette';
import type { SpriteKind } from './types';
import { useEditor } from '../store/editorStore';

type Pt = { x: number; y: number };

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

/**
 * Zoomed pixel canvas: draws the composite of all visible layers and lets the user
 * paint on the active layer (pen, eraser, fill, pipette, line, rectangle, move).
 * It is also the drop target for parts dragged from the panel.
 */
export function SpriteCanvas({ kind }: { kind: SpriteKind }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef({ zoom: 8, ox: 0, oy: 0 });
  const hover = useRef<Pt | null>(null);
  const preview = useRef<{ cells: Pt[]; move?: Pt } | null>(null);
  const rev = useSprites((s) => s.rev);
  const doc = useSprites((s) => s[kind].doc);
  const active = useSprites((s) => s[kind].active);

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
    const zoom = Math.max(2, Math.floor((Math.min(W, H) - 16) / n));
    const ox = Math.floor((W - n * zoom) / 2);
    const oy = Math.floor((H - n * zoom) / 2);
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
    // grid
    if (zoom >= 6) {
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
      // centre line (helps symmetric drawing)
      g.strokeStyle = st.mirror ? 'rgba(232,137,176,0.55)' : 'rgba(255,255,255,0.1)';
      g.beginPath();
      g.moveTo(ox + (n / 2) * zoom + 0.5, oy);
      g.lineTo(ox + (n / 2) * zoom + 0.5, oy + n * zoom);
      g.stroke();
    }
    g.strokeStyle = '#3a3945';
    g.strokeRect(ox - 0.5, oy - 0.5, n * zoom + 1, n * zoom + 1);
    // line / rect preview
    if (preview.current?.cells.length) {
      g.fillStyle = st.tool === 'eraser' ? 'rgba(255,255,255,0.35)' : st.color;
      for (const p of preview.current.cells) if (p.x >= 0 && p.y >= 0 && p.x < n && p.y < n) g.fillRect(ox + p.x * zoom, oy + p.y * zoom, zoom, zoom);
    }
    // hover cell
    const h = hover.current;
    if (h && h.x >= 0 && h.y >= 0 && h.x < n && h.y < n && st.tool !== 'move') {
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.strokeRect(ox + h.x * zoom + 0.5, oy + h.y * zoom + 0.5, zoom - 1, zoom - 1);
      if (st.mirror) g.strokeRect(ox + (n - 1 - h.x) * zoom + 0.5, oy + h.y * zoom + 0.5, zoom - 1, zoom - 1);
    }
  };

  useEffect(() => {
    draw();
  });
  useEffect(() => {
    const ro = new ResizeObserver(() => draw());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  void rev;
  void doc;
  void active;

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

  const put = (data: Uint8ClampedArray, n: number, p: Pt, rgba: [number, number, number, number]) => {
    const st = useSprites.getState();
    const pts = st.mirror ? [p, { x: n - 1 - p.x, y: p.y }] : [p];
    for (const q of pts) {
      if (q.x < 0 || q.y < 0 || q.x >= n || q.y >= n) continue;
      data.set(rgba, (q.y * n + q.x) * 4);
    }
  };

  const drag = useRef<{ start: Pt; last: Pt; layer: string; tool: string } | null>(null);

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const st = useSprites.getState();
    const n = st[kind].doc.size;
    const p = cellAt(e);
    if (st.tool === 'pipette') {
      if (p.x < 0 || p.y < 0 || p.x >= n || p.y >= n) return;
      const img = compose(st[kind].doc);
      const i = (p.y * n + p.x) * 4;
      if (img[i + 3]) st.setColor('#' + [img[i], img[i + 1], img[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join(''));
      return;
    }
    const layer = target();
    if (!layer) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    st.checkpoint(kind);
    const rgba: [number, number, number, number] = st.tool === 'eraser' ? [0, 0, 0, 0] : [...hexToRgb(st.color), 255];
    if (st.tool === 'fill') {
      if (p.x >= 0 && p.y >= 0 && p.x < n && p.y < n) {
        flood(layer.data, n, p, rgba);
        if (st.mirror) flood(layer.data, n, { x: n - 1 - p.x, y: p.y }, rgba);
        st.touch(kind, layer.id);
      }
      return;
    }
    drag.current = { start: p, last: p, layer: layer.id, tool: st.tool };
    if (st.tool === 'pen' || st.tool === 'eraser') {
      put(layer.data, n, p, rgba);
      st.touch(kind, layer.id);
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const p = cellAt(e);
    const h = hover.current;
    if (!h || h.x !== p.x || h.y !== p.y) {
      hover.current = p;
      if (!drag.current) draw();
    }
    const dr = drag.current;
    if (!dr || (dr.last.x === p.x && dr.last.y === p.y)) return;
    const st = useSprites.getState();
    const n = st[kind].doc.size;
    const layer = st[kind].doc.layers.find((l) => l.id === dr.layer);
    if (!layer) return;
    if (dr.tool === 'pen' || dr.tool === 'eraser') {
      const rgba: [number, number, number, number] = dr.tool === 'eraser' ? [0, 0, 0, 0] : [...hexToRgb(st.color), 255];
      for (const q of lineCells(dr.last, p)) put(layer.data, n, q, rgba);
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

  const onUp = () => {
    const dr = drag.current;
    drag.current = null;
    if (!dr) return;
    const st = useSprites.getState();
    const n = st[kind].doc.size;
    const layer = st[kind].doc.layers.find((l) => l.id === dr.layer);
    if (layer && (dr.tool === 'line' || dr.tool === 'rect')) {
      const rgba: [number, number, number, number] = [...hexToRgb(st.color), 255];
      for (const q of dr.tool === 'line' ? lineCells(dr.start, dr.last) : rectCells(dr.start, dr.last)) put(layer.data, n, q, rgba);
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

  return (
    <div className={`sprite-canvas tool-${useSprites.getState().tool}`} ref={wrapRef} data-sprite-drop={kind}>
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
        aria-label="Zeichenfläche"
      />
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

function flood(data: Uint8ClampedArray, n: number, p: Pt, rgba: [number, number, number, number]) {
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
