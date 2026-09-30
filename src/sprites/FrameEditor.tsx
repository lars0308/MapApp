import { useEffect, useRef, useState } from 'react';
import { flood, lineCells, shifted } from './SpriteCanvas';
import { useSprites } from './store';
import { PALETTE_PRESETS, hexToRgb } from './palette';
import { Icon } from '../components/icons';
import { Button, IconButton } from '../components/ui';

type Tool = 'pen' | 'eraser' | 'fill' | 'pipette' | 'move' | 'hand';
const TOOLS: { id: Tool; label: string; icon: (p: { size?: number }) => React.ReactElement }[] = [
  { id: 'hand', label: 'Ansicht verschieben', icon: Icon.Hand },
  { id: 'pen', label: 'Stift', icon: Icon.Pencil },
  { id: 'eraser', label: 'Radierer', icon: Icon.Eraser },
  { id: 'fill', label: 'Füllen', icon: Icon.Fill },
  { id: 'pipette', label: 'Pipette', icon: Icon.Pipette },
  { id: 'move', label: 'Bild verschieben', icon: Icon.Move },
];

/**
 * Edit one animation frame pixel by pixel. The previous frame shows through (onion skin).
 * Changes are kept only when saved.
 */
export function FrameEditor({ frame, size, prev, title, onSave, onCancel }: { frame: Uint8ClampedArray; size: number; prev?: Uint8ClampedArray; title: string; onSave: (d: Uint8ClampedArray) => void; onCancel: () => void }) {
  const [data] = useState(() => new Uint8ClampedArray(frame));
  const [tool, setTool] = useState<Tool>('pen');
  // magnification on top of "fit" + panning (two fingers / wheel / + −)
  const mag = useRef(1);
  const pan = useRef({ x: 0, y: 0 });
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mag: number; cx: number; cy: number; pan: { x: number; y: number } } | null>(null);
  const [rev, setRev] = useState(0);
  const [onion, setOnion] = useState(!!prev);
  const undo = useRef<Uint8ClampedArray[]>([]);
  const color = useSprites((s) => s.color);
  const palettes = useSprites((s) => s.palettes);
  const activePalette = useSprites((s) => s.activePalette);
  const pal = [...PALETTE_PRESETS, ...palettes].find((p) => p.id === activePalette) ?? PALETTE_PRESETS[0];
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef({ zoom: 8, ox: 0, oy: 0 });
  const drag = useRef<{ last: { x: number; y: number }; start: { x: number; y: number }; move?: boolean } | null>(null);
  const moveOff = useRef<{ x: number; y: number } | null>(null);

  const draw = () => {
    const c = canvas.current;
    const w = wrap.current;
    if (!c || !w) return;
    const W = w.clientWidth;
    const H = w.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr;
    c.height = H * dpr;
    c.style.width = `${W}px`;
    c.style.height = `${H}px`;
    const fit = Math.max(2, Math.floor((Math.min(W, H) - 12) / size));
    const zoom = Math.max(1, Math.round(fit * mag.current));
    const ox = Math.floor((W - zoom * size) / 2 + pan.current.x);
    const oy = Math.floor((H - zoom * size) / 2 + pan.current.y);
    view.current = { zoom, ox, oy };
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    for (let y = 0; y < size; y += 2) for (let x = 0; x < size; x += 2) {
      g.fillStyle = (x + y) % 4 ? '#1d1c23' : '#24232b';
      g.fillRect(ox + x * zoom, oy + y * zoom, zoom * 2, zoom * 2);
    }
    const off = document.createElement('canvas');
    off.width = off.height = size;
    const og = off.getContext('2d')!;
    if (onion && prev) {
      og.putImageData(new ImageData(new Uint8ClampedArray(prev), size, size), 0, 0);
      g.globalAlpha = 0.3;
      g.drawImage(off, ox, oy, size * zoom, size * zoom);
      g.globalAlpha = 1;
    }
    const m = moveOff.current;
    og.putImageData(new ImageData(new Uint8ClampedArray(m ? shifted(data, size, m.x, m.y) : data), size, size), 0, 0);
    g.drawImage(off, ox, oy, size * zoom, size * zoom);
    if (zoom >= 6) {
      g.strokeStyle = 'rgba(255,255,255,0.06)';
      g.beginPath();
      for (let i = 0; i <= size; i++) {
        g.moveTo(ox + i * zoom + 0.5, oy);
        g.lineTo(ox + i * zoom + 0.5, oy + size * zoom);
        g.moveTo(ox, oy + i * zoom + 0.5);
        g.lineTo(ox + size * zoom, oy + i * zoom + 0.5);
      }
      g.stroke();
    }
    g.strokeStyle = '#3a3945';
    g.strokeRect(ox - 0.5, oy - 0.5, size * zoom + 1, size * zoom + 1);
  };
  useEffect(() => {
    draw();
  });
  useEffect(() => {
    const ro = new ResizeObserver(() => draw());
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  });

  const cell = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    const { zoom, ox, oy } = view.current;
    return { x: Math.floor((e.clientX - r.left - ox) / zoom), y: Math.floor((e.clientY - r.top - oy) / zoom) };
  };
  const put = (p: { x: number; y: number }) => {
    if (p.x < 0 || p.y < 0 || p.x >= size || p.y >= size) return;
    data.set(tool === 'eraser' ? [0, 0, 0, 0] : [...hexToRgb(color), 255], (p.y * size + p.x) * 4);
  };
  const setMag = (m: number) => {
    mag.current = Math.max(1, Math.min(8, m));
    if (mag.current === 1) pan.current = { x: 0, y: 0 };
    draw();
  };
  const down = (e: React.PointerEvent) => {
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size === 2) {
      // second finger: pinch zoom instead of drawing (undo the started stroke)
      if (drag.current && !drag.current.move) {
        const u = undo.current.pop();
        if (u) data.set(u);
      }
      drag.current = null;
      const [a, b] = [...touches.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), mag: mag.current, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, pan: { ...pan.current } };
      return;
    }
    if (tool === 'hand') {
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { last: { x: e.clientX, y: e.clientY }, start: { x: e.clientX, y: e.clientY } };
      return;
    }
    const p = cell(e);
    if (tool === 'pipette') {
      const i = (p.y * size + p.x) * 4;
      if (p.x >= 0 && p.y >= 0 && p.x < size && p.y < size && data[i + 3]) useSprites.getState().setColor('#' + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join(''));
      return;
    }
    undo.current.push(new Uint8ClampedArray(data));
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === 'fill') {
      if (p.x >= 0 && p.y >= 0 && p.x < size && p.y < size) flood(data, size, p, [...hexToRgb(color), 255]);
      setRev(rev + 1);
      return;
    }
    drag.current = { last: p, start: p, move: tool === 'move' };
    if (tool !== 'move') put(p);
    setRev(rev + 1);
  };
  const move = (e: React.PointerEvent) => {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pz = pinch.current;
    if (pz && touches.current.size >= 2) {
      const [a, b] = [...touches.current.values()];
      mag.current = Math.max(1, Math.min(8, (pz.mag * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, pz.dist)));
      pan.current = { x: pz.pan.x + (a.x + b.x) / 2 - pz.cx, y: pz.pan.y + (a.y + b.y) / 2 - pz.cy };
      draw();
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (tool === 'hand') {
      pan.current = { x: pan.current.x + e.clientX - d.last.x, y: pan.current.y + e.clientY - d.last.y };
      d.last = { x: e.clientX, y: e.clientY };
      draw();
      return;
    }
    const p = cell(e);
    if (d.move) {
      moveOff.current = { x: p.x - d.start.x, y: p.y - d.start.y };
      draw();
      return;
    }
    if (p.x === d.last.x && p.y === d.last.y) return;
    for (const q of lineCells(d.last, p)) put(q);
    d.last = p;
    draw();
  };
  const up = (e?: React.PointerEvent) => {
    if (e) touches.current.delete(e.pointerId);
    if (pinch.current) {
      if (touches.current.size < 2) pinch.current = null;
      drag.current = null;
      return;
    }
    if (tool === 'hand') {
      drag.current = null;
      return;
    }
    if (drag.current?.move && moveOff.current) data.set(shifted(data, size, moveOff.current.x, moveOff.current.y));
    moveOff.current = null;
    drag.current = null;
    setRev(rev + 1);
  };

  return (
    <div className="frame-editor" role="dialog" aria-label={title}>
      <div className="frame-editor-bar">
        <strong>{title}</strong>
        <div className="frame-editor-tools" role="toolbar">
          {TOOLS.map((t) => (
            <IconButton key={t.id} label={t.label} active={tool === t.id} onClick={() => setTool(t.id)}>
              <t.icon size={17} />
            </IconButton>
          ))}
          <IconButton
            label="Rückgängig"
            disabled={!undo.current.length}
            onClick={() => {
              const u = undo.current.pop();
              if (u) data.set(u);
              setRev(rev + 1);
            }}
          >
            <Icon.Undo size={17} />
          </IconButton>
          {prev && (
            <IconButton label="Zwiebelschicht (vorheriges Bild)" active={onion} onClick={() => setOnion(!onion)}>
              <Icon.Layers size={17} />
            </IconButton>
          )}
          <IconButton label="Verkleinern" onClick={() => setMag(mag.current / 1.5)}>
            <Icon.Minus size={17} />
          </IconButton>
          <IconButton label="Vergrößern" onClick={() => setMag(mag.current * 1.5)}>
            <Icon.Plus size={17} />
          </IconButton>
          <IconButton label="Einpassen" onClick={() => setMag(1)}>
            <Icon.Fit size={17} />
          </IconButton>
        </div>
      </div>
      <div className="frame-editor-swatches">
        <label className="swatch-current" style={{ background: color }} title="Eigene Farbe">
          <input type="color" value={color} onChange={(e) => useSprites.getState().setColor(e.target.value)} aria-label="Farbe" />
        </label>
        {pal.colors.map((c, i) => (
          <button key={c + i} type="button" className={`swatch${c === color ? ' is-active' : ''}`} style={{ background: c }} aria-label={`Farbe ${c}`} onClick={() => useSprites.getState().setColor(c)} />
        ))}
      </div>
      <div className="frame-editor-stage" ref={wrap}>
        <canvas
          ref={canvas}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onWheel={(e) => setMag(mag.current * (e.deltaY < 0 ? 1.2 : 1 / 1.2))}
          style={{ touchAction: 'none', cursor: tool === 'hand' ? 'grab' : 'crosshair' }}
          aria-label="Bild bearbeiten"
        />
      </div>
      <div className="button-row frame-editor-foot">
        <Button variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button variant="primary" icon={<Icon.Check size={16} />} onClick={() => onSave(new Uint8ClampedArray(data))}>
          Bild übernehmen
        </Button>
      </div>
    </div>
  );
}
