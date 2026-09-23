import { useEffect, useMemo, useRef, useState } from 'react';
import { useProject } from '../store/projectStore';
import { useEditor } from '../store/editorStore';
import { viewEvents } from '../store/events';
import { SPECIALS } from '../components/GeneratorPanel';
import { Button } from '../components/ui';
import { Icon } from '../components/icons';
import type { Room } from '../types';

const TYPE_COLOR: Record<string, string> = Object.fromEntries(SPECIALS.map((s) => [s.id, s.color]));
const TYPE_LABEL: Record<string, string> = { normal: 'Raum', ...Object.fromEntries(SPECIALS.map((s) => [s.id, s.label])) };

interface NodePos {
  room: Room;
  x: number;
  y: number;
  r: number;
}

export function RoomGraph() {
  const result = useProject((s) => s.project.result);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(wrapRef.current!);
    return () => ro.disconnect();
  }, []);

  const nodes = useMemo<NodePos[]>(() => {
    if (!result || !size.w) return [];
    const pad = 44;
    const sx = (size.w - pad * 2) / result.width;
    const sy = (size.h - pad * 2) / result.height;
    const s = Math.min(sx, sy);
    const ox = (size.w - result.width * s) / 2;
    const oy = (size.h - result.height * s) / 2;
    const maxArea = Math.max(...result.rooms.map((r) => r.area), 1);
    return result.rooms.map((room) => ({
      room,
      x: ox + (room.centerX + 0.5) * s,
      y: oy + (room.centerY + 0.5) * s,
      r: 9 + Math.sqrt(room.area / maxArea) * 12,
    }));
  }, [result, size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0b0e';
    ctx.fillRect(0, 0, size.w, size.h);
    if (!result) return;

    // edges
    for (const c of result.connections) {
      const a = nodes[c.from];
      const b = nodes[c.to];
      if (!a || !b) continue;
      const hot = selected === c.from || selected === c.to;
      ctx.beginPath();
      ctx.setLineDash(c.kind === 'main' ? [] : c.kind === 'loop' ? [6, 5] : [2, 5]);
      ctx.strokeStyle = hot ? '#e889b0' : c.kind === 'main' ? 'rgba(220,215,230,0.42)' : 'rgba(220,215,230,0.28)';
      ctx.lineWidth = hot ? 2.2 : 1.6;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // nodes
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of nodes) {
      const color = TYPE_COLOR[n.room.type] ?? '#3a3742';
      const isSel = selected === n.room.id;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = n.room.type === 'normal' ? '#24222b' : color;
      ctx.fill();
      ctx.lineWidth = isSel ? 3 : 1.5;
      ctx.strokeStyle = isSel ? '#e889b0' : n.room.type === 'normal' ? '#57535f' : 'rgba(0,0,0,0.35)';
      ctx.stroke();
      ctx.font = '600 11px Inter, system-ui, sans-serif';
      ctx.fillStyle = n.room.type === 'normal' ? '#d8d4de' : '#141217';
      ctx.fillText(String(n.room.id), n.x, n.y + 0.5);
      if (n.room.type !== 'normal') {
        ctx.font = '500 11px Inter, system-ui, sans-serif';
        ctx.fillStyle = color;
        ctx.fillText(TYPE_LABEL[n.room.type], n.x, n.y + n.r + 11);
      }
    }
  }, [nodes, result, selected, size]);

  const onPointerUp = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let hit: number | null = null;
    for (const n of nodes) if (Math.hypot(n.x - x, n.y - y) <= n.r + 10) hit = n.room.id;
    setSelected(hit);
  };

  const room = selected !== null ? result?.rooms[selected] : null;

  return (
    <div className="room-graph" ref={wrapRef}>
      <canvas ref={canvasRef} onPointerUp={onPointerUp} aria-label="Room Graph" />
      {!result && <div className="graph-empty">Zuerst eine Map generieren.</div>}
      <div className="graph-legend">
        <span>
          <i className="lg-line" /> Hauptweg
        </span>
        <span>
          <i className="lg-line is-dashed" /> Schleife
        </span>
        <span>
          <i className="lg-line is-dotted" /> Alternative
        </span>
      </div>
      {room && (
        <div className="graph-card">
          <div className="graph-card-head">
            <span className="chip-dot" style={{ background: TYPE_COLOR[room.type] ?? '#57535f' }} />
            <strong>
              Raum {room.id} · {TYPE_LABEL[room.type]}
            </strong>
          </div>
          <p className="muted">
            {room.width}×{room.height} · {room.area} Felder · verbunden mit {room.connections.join(', ') || '–'}
          </p>
          <Button
            variant="primary"
            icon={<Icon.Crosshair size={16} />}
            onClick={() => {
              useEditor.getState().setView('map');
              viewEvents.emit({ type: 'focus', x: room.x, y: room.y, w: room.width, h: room.height });
            }}
          >
            In Map zeigen
          </Button>
        </div>
      )}
    </div>
  );
}
