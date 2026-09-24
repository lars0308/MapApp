import { useEffect, useMemo, useRef, useState } from 'react';
import type { TileCategory, TileMeta, TileRole, Tileset } from '../types';
import { Button, Segmented } from '../components/ui';
import { IconButton } from '../components/ui';
import { Icon } from '../components/icons';

// "Raum markieren": most tilesets contain a drawn sample room (corners, walls, floor). The user
// frames it once in the tileset picture and every tile gets its role from its place in the frame –
// instead of assigning dozens of tiles one by one. A small sample room shows the result right away.

type Rect = { x0: number; y0: number; x1: number; y1: number };

const CATEGORY_OF: Partial<Record<TileRole, TileCategory>> = {
  floor_center: 'floor',
  wall_top: 'wallTop',
  wall_bottom: 'wallBottom',
  wall_left: 'wallLeft',
  wall_right: 'wallRight',
  wall_front: 'wallFront',
  wall_front_upper: 'wallFront',
  corner_top_left: 'outerCorner',
  corner_top_right: 'outerCorner',
  corner_bottom_left: 'outerCorner',
  corner_bottom_right: 'outerCorner',
};

/** role of the cell (x, y) inside the framed room; `front` = rows of wall face below the top edge */
export function roomRole(r: Rect, x: number, y: number, front: number): TileRole {
  const left = x === r.x0;
  const right = x === r.x1;
  const top = y === r.y0;
  const bottom = y === r.y1;
  if (top && left) return 'corner_top_left';
  if (top && right) return 'corner_top_right';
  if (bottom && left) return 'corner_bottom_left';
  if (bottom && right) return 'corner_bottom_right';
  if (top) return 'wall_top';
  if (bottom) return 'wall_bottom';
  if (left) return 'wall_left';
  if (right) return 'wall_right';
  // 3/4 view: the rows under the top edge are the wall face (the lowest one touches the floor)
  const row = y - r.y0;
  if (row <= front) return row === front ? 'wall_front' : 'wall_front_upper';
  return 'floor_center';
}

/** metas for every tile in the frame */
export function roomMetas(ts: Pick<Tileset, 'columns'>, r: Rect, front: number): Record<number, TileMeta> {
  const out: Record<number, TileMeta> = {};
  for (let y = r.y0; y <= r.y1; y++)
    for (let x = r.x0; x <= r.x1; x++) {
      const role = roomRole(r, x, y, front);
      out[y * ts.columns + x] = { category: CATEGORY_OF[role], role, tags: [], weight: role === 'floor_center' ? 50 : 60 };
    }
  return out;
}

const norm = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) });

/** a 9×7 sample room drawn with the chosen tiles (first tile of each role) */
function SampleRoom({ ts, tiles, front }: { ts: Tileset; tiles: Record<number, TileMeta>; front: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const W = 9;
    const H = 7 + front;
    const T = 24;
    c.width = W * T;
    c.height = H * T;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0b0b10';
    g.fillRect(0, 0, c.width, c.height);
    const byRole = new Map<TileRole, number[]>();
    for (const [i, m] of Object.entries(tiles)) if (m.role) byRole.set(m.role, [...(byRole.get(m.role) ?? []), Number(i)]);
    const img = new Image();
    img.onload = () => {
      const r: Rect = { x0: 0, y0: 0, x1: W - 1, y1: H - 1 };
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const role = roomRole(r, x, y, front);
          const list = byRole.get(role) ?? (role === 'wall_front_upper' ? byRole.get('wall_front') : undefined);
          if (!list?.length) {
            g.fillStyle = 'rgba(232,111,111,0.35)';
            g.fillRect(x * T + 1, y * T + 1, T - 2, T - 2);
            continue;
          }
          // several tiles of a role: alternate, like the generator mixes them
          const i = list[(x * 7 + y * 3) % list.length];
          g.drawImage(img, (i % ts.columns) * ts.tileSize, Math.floor(i / ts.columns) * ts.tileSize, ts.tileSize, ts.tileSize, x * T, y * T, T, T);
        }
    };
    img.src = ts.dataUrl;
  }, [ts, tiles, front]);
  return <canvas ref={ref} className="room-sample" aria-label="Probe-Raum mit den gewählten Tiles" />;
}

export function RoomMarker({
  ts,
  onApply,
  onClose,
}: {
  ts: Tileset;
  /** new metas for the framed tiles; `clearOthers` = drop the automatic suggestions of all other tiles */
  onApply: (tiles: Record<number, TileMeta>, clearOthers: boolean) => void;
  onClose: () => void;
}) {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [front, setFront] = useState(0);
  const [clearOthers, setClearOthers] = useState(true);
  const dragging = useRef(false);
  const cell = Math.max(14, Math.min(40, Math.floor(Math.min(520, window.innerWidth - 56) / ts.columns)));
  const w = rect ? rect.x1 - rect.x0 + 1 : 0;
  const h = rect ? rect.y1 - rect.y0 + 1 : 0;
  const tooSmall = !!rect && (w < 3 || h < 3 + front);
  const metas = useMemo(() => (rect && !tooSmall ? roomMetas(ts, rect, front) : {}), [ts, rect, front, tooSmall]);

  const at = (e: React.PointerEvent) => {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: Math.max(0, Math.min(ts.columns - 1, Math.floor((e.clientX - box.left) / cell))), y: Math.max(0, Math.min(ts.rows - 1, Math.floor((e.clientY - box.top) / cell))) };
  };

  return (
    <div className="quick-pick-backdrop" role="presentation" onClick={onClose}>
      <div className="quick-pick room-marker" role="dialog" aria-label="Raum im Tileset markieren" onClick={(e) => e.stopPropagation()}>
        <header className="quick-pick-head">
          <div className="quick-pick-tile">
            <div>
              <strong>Raum im Tileset markieren</strong>
              <span className="quick-pick-current">Ziehe einen Rahmen über einen gezeichneten Raum: Ecken, Wände und Boden.</span>
            </div>
          </div>
          <IconButton label="Schließen" onClick={onClose}>
            <Icon.Close size={18} />
          </IconButton>
        </header>
        <div className="quick-pick-body">
          <p className="hint">
            Die äußeren Ecken des Rahmens werden zu Ecken, die Ränder zu Wänden (oben, unten, links, rechts), das Innere zu Boden. Du kannst auch nacheinander tippen: erst eine Ecke, dann die gegenüberliegende.
          </p>
          <div className="room-sheet-wrap">
            <div
              className="room-sheet"
              style={{ width: ts.columns * cell, height: ts.rows * cell, backgroundImage: `url(${ts.dataUrl})`, backgroundSize: `${ts.columns * cell}px ${ts.rows * cell}px`, ['--cell' as string]: `${cell}px` }}
              onPointerDown={(e) => {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                const p = at(e);
                dragging.current = true;
                // second tap without dragging: finish the frame from the first tap
                if (start && rect && rect.x0 === rect.x1 && rect.y0 === rect.y1) {
                  setRect(norm(start, p));
                  setStart(null);
                  dragging.current = false;
                  return;
                }
                setStart(p);
                setRect(norm(p, p));
              }}
              onPointerMove={(e) => {
                if (dragging.current && start) setRect(norm(start, at(e)));
              }}
              onPointerUp={(e) => {
                if (!dragging.current || !start) return;
                dragging.current = false;
                const r = norm(start, at(e));
                setRect(r);
                // a real drag finishes the frame; a tap waits for the second corner
                if (r.x0 !== r.x1 || r.y0 !== r.y1) setStart(null);
              }}
            >
              {rect && (
                <div className={`room-frame${tooSmall ? ' is-bad' : ''}`} style={{ left: rect.x0 * cell, top: rect.y0 * cell, width: w * cell, height: h * cell }}>
                  {!tooSmall &&
                    Array.from({ length: w * h }, (_, k) => {
                      const x = rect.x0 + (k % w);
                      const y = rect.y0 + Math.floor(k / w);
                      const role = roomRole(rect, x, y, front);
                      return <span key={k} className={`room-cell r-${role.startsWith('floor') ? 'floor' : role.startsWith('wall_front') ? 'front' : 'wall'}`} />;
                    })}
                </div>
              )}
            </div>
          </div>
          <Segmented
            label="Wand-Vorderseite"
            value={String(front)}
            onChange={(v) => setFront(Number(v))}
            options={[
              { value: '0', label: 'Keine' },
              { value: '1', label: '1 Reihe' },
              { value: '2', label: '2 Reihen' },
            ]}
          />
          <p className="hint">Wand-Vorderseite: Sind im Tileset unter der oberen Wand 1–2 Reihen Mauer von vorne gezeichnet (3/4-Ansicht, Low Top-Down)? Dann hier die Anzahl wählen – die blauen Felder im Rahmen zeigen sie.</p>
          {rect && tooSmall && <p className="hint is-warn">Der Rahmen muss mindestens 3 × {3 + front} Tiles groß sein.</p>}
          {rect && !tooSmall && (
            <>
              <h4>So baut der Generator damit einen Raum</h4>
              <SampleRoom ts={ts} tiles={metas} front={front} />
              <label className="quick-pick-next">
                <input type="checkbox" checked={clearOthers} onChange={(e) => setClearOthers(e.target.checked)} />
                Automatische Vorschläge der übrigen Tiles verwerfen (nur deine markierten Tiles bauen Räume; Deko, Türen usw. kannst du danach einzeln zuordnen)
              </label>
            </>
          )}
        </div>
        <footer className="quick-pick-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <Button variant="primary" disabled={!rect || tooSmall} onClick={() => onApply(metas, clearOthers)}>
            {rect && !tooSmall ? `${w * h} Tiles zuordnen` : 'Rahmen ziehen'}
          </Button>
        </footer>
      </div>
    </div>
  );
}

/** apply the room: framed tiles get their roles (confirmed), optionally the other suggestions go */
export function applyRoom(tiles: Record<number, TileMeta>, room: Record<number, TileMeta>, clearOthers: boolean): Record<number, TileMeta> {
  const out: Record<number, TileMeta> = {};
  for (const [k, m] of Object.entries(tiles)) {
    if (clearOthers && m.auto) continue;
    out[Number(k)] = m;
  }
  return { ...out, ...room };
}
