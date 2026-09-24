import { useEffect, useMemo, useRef, useState } from 'react';
import type { TileCategory, TileMeta, TileRole, TileVariant, Tileset } from '../types';
import { Button, NumberField, Segmented } from '../components/ui';
import { COMMON_TILE_SIZES } from './slicing';
import { useProject } from '../store/projectStore';
import { WALL_ROW_VIEWS, faceRowsOf } from '../generator/perspective';
import { IconButton } from '../components/ui';
import { Icon } from '../components/icons';
import { imageUrl, tileStyle } from './TileThumb';
import { applyCanvasTransform, mirrorH, rotateCW } from './gid';
import { turnStyle } from '../editor/Toolbar';

// "Raum markieren" – two ways to tell MapForge which tiles build a room:
// - frame: the tileset contains a drawn sample room; frame it once and every tile gets its role from
//   its place in the frame.
// - pieces (room builder): the tileset has loose pieces; drag them onto a room plan, turn / mirror
//   them (one corner tile turned = all four corners). Turned uses become Tileset.variants.
// A small sample room shows the result right away.

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
  inner_corner_top_left: 'innerCorner',
  inner_corner_top_right: 'innerCorner',
  inner_corner_bottom_left: 'innerCorner',
  inner_corner_bottom_right: 'innerCorner',
  door: 'door',
  water: 'water',
};
/** floor edges and corners: role only (no category, so they never show up in the middle of a room) */
const FLOOR_RING: TileRole[] = [
  'floor_edge_top',
  'floor_edge_bottom',
  'floor_edge_left',
  'floor_edge_right',
  'floor_corner_top_left',
  'floor_corner_top_right',
  'floor_corner_bottom_left',
  'floor_corner_bottom_right',
];
/** roles the room builder manages */
const managed = (role: TileRole | undefined) => !!role && (!!CATEGORY_OF[role] || FLOOR_RING.includes(role));
/** empty floor edge / corner: the generator uses the plain floor there */
const ringFallback = (role: TileRole): TileRole | null => (FLOOR_RING.includes(role) ? 'floor_center' : null);

/** "Teile zuordnen": slots besides the room board */
const EXTRA_SLOTS: { role: TileRole; label: string }[] = [
  { role: 'inner_corner_top_left', label: 'Innen ┌' },
  { role: 'inner_corner_top_right', label: 'Innen ┐' },
  { role: 'inner_corner_bottom_left', label: 'Innen └' },
  { role: 'inner_corner_bottom_right', label: 'Innen ┘' },
  { role: 'door', label: 'Tür' },
  { role: 'water', label: 'Wasser' },
];
const SLOT_LABEL: Partial<Record<TileRole, string>> = {
  corner_top_left: 'Ecke ┌',
  corner_top_right: 'Ecke ┐',
  corner_bottom_left: 'Ecke └',
  corner_bottom_right: 'Ecke ┘',
  wall_top: 'Wand oben',
  wall_bottom: 'Wand unten',
  wall_left: 'Wand links',
  wall_right: 'Wand rechts',
  wall_front: 'Front',
  wall_front_upper: 'Front oben',
  floor_center: 'Boden Mitte',
  floor_edge_top: 'Boden oben',
  floor_edge_bottom: 'Boden unten',
  floor_edge_left: 'Boden links',
  floor_edge_right: 'Boden rechts',
  floor_corner_top_left: 'Boden ┌',
  floor_corner_top_right: 'Boden ┐',
  floor_corner_bottom_left: 'Boden └',
  floor_corner_bottom_right: 'Boden ┘',
};

/**
 * role of the cell (x, y) inside the framed room; `front` = rows of wall face below the top edge.
 * `edges`: the outer ring of the floor gets its own roles (floor edge top / left … and floor corners)
 */
export function roomRole(r: Rect, x: number, y: number, front: number, edges = false): TileRole {
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
  if (!edges) return 'floor_center';
  const fl = x === r.x0 + 1;
  const fr = x === r.x1 - 1;
  const ft = y === r.y0 + front + 1;
  const fb = y === r.y1 - 1;
  if (ft && fl) return 'floor_corner_top_left';
  if (ft && fr) return 'floor_corner_top_right';
  if (fb && fl) return 'floor_corner_bottom_left';
  if (fb && fr) return 'floor_corner_bottom_right';
  if (ft) return 'floor_edge_top';
  if (fb) return 'floor_edge_bottom';
  if (fl) return 'floor_edge_left';
  if (fr) return 'floor_edge_right';
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

/** a tile, possibly turned */
type Piece = { i: number; t: number };
type Pieces = Partial<Record<TileRole, Piece[]>>;

/** turning a corner / wall clockwise moves it to the next role of its cycle */
const CYCLES: TileRole[][] = [
  ['corner_top_left', 'corner_top_right', 'corner_bottom_right', 'corner_bottom_left'],
  ['wall_top', 'wall_right', 'wall_bottom', 'wall_left'],
  ['inner_corner_top_left', 'inner_corner_top_right', 'inner_corner_bottom_right', 'inner_corner_bottom_left'],
  ['floor_edge_top', 'floor_edge_right', 'floor_edge_bottom', 'floor_edge_left'],
  ['floor_corner_top_left', 'floor_corner_top_right', 'floor_corner_bottom_right', 'floor_corner_bottom_left'],
];

/** empty slots of a cycle filled with turned copies of a filled one */
export function completeByTurning(pieces: Pieces): Pieces {
  const out: Pieces = { ...pieces };
  for (const cyc of CYCLES) {
    const k = cyc.findIndex((r) => (out[r] ?? []).length);
    if (k < 0) continue;
    const src = out[cyc[k]]![0];
    let t = src.t;
    for (let step = 1; step < 4; step++) {
      t = rotateCW(t);
      const role = cyc[(k + step) % 4];
      if (!(out[role] ?? []).length) out[role] = [{ i: src.i, t }];
    }
  }
  return out;
}

/** a 9×7 sample room drawn with the chosen tiles (first tiles of each role, turned) */
function SampleRoom({ ts, pieces, front }: { ts: Tileset; pieces: Pieces; front: number }) {
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
    const img = new Image();
    img.onload = () => {
      const r: Rect = { x0: 0, y0: 0, x1: W - 1, y1: H - 1 };
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const role = roomRole(r, x, y, front, true);
          const fb = ringFallback(role);
          const own = pieces[role];
          const list = own?.length ? own : role === 'wall_front_upper' ? pieces.wall_front : fb ? pieces[fb] : undefined;
          if (!list?.length) {
            g.fillStyle = 'rgba(232,111,111,0.35)';
            g.fillRect(x * T + 1, y * T + 1, T - 2, T - 2);
            continue;
          }
          // several tiles of a role: alternate, like the generator mixes them
          const p = list[(x * 7 + y * 3) % list.length];
          g.save();
          applyCanvasTransform(g, p.t, x * T, y * T, T, T);
          g.drawImage(img, (p.i % ts.columns) * ts.tileSize, Math.floor(p.i / ts.columns) * ts.tileSize, ts.tileSize, ts.tileSize, -T / 2, -T / 2, T, T);
          g.restore();
        }
    };
    img.src = ts.dataUrl;
  }, [ts, pieces, front]);
  return <canvas ref={ref} className="room-sample" aria-label="Probe-Raum mit den gewählten Tiles" />;
}

/** pieces → metas (unturned uses) and variants (turned uses) */
function piecesResult(pieces: Pieces): { tiles: Record<number, TileMeta>; variants: TileVariant[] } {
  const tiles: Record<number, TileMeta> = {};
  const variants: TileVariant[] = [];
  for (const [role, list] of Object.entries(pieces) as [TileRole, Piece[]][])
    for (const p of list ?? []) {
      if (!p.t && !tiles[p.i]) tiles[p.i] = { category: CATEGORY_OF[role], role, tags: [], weight: role === 'floor_center' ? 50 : 60 };
      else variants.push({ index: p.i, transform: p.t, role, category: CATEGORY_OF[role] });
    }
  return { tiles, variants };
}

function framePieces(ts: Tileset, r: Rect, front: number): Pieces {
  const out: Pieces = {};
  for (const [k, m] of Object.entries(roomMetas(ts, r, front))) (out[m.role!] ??= []).push({ i: Number(k), t: 0 });
  return out;
}

/** wall face rows the tileset already has tiles for (front / upper front) */
function initialFront(ts: Tileset): number {
  const roles = new Set([...Object.values(ts.tiles).filter((m) => !m.auto).map((m) => m.role), ...(ts.variants ?? []).map((v) => v.role)]);
  return roles.has('wall_front_upper') ? 2 : roles.has('wall_front') ? 1 : 0;
}

export interface RoomResult {
  tiles: Record<number, TileMeta>;
  variants: TileVariant[];
  /** builder: its variants replace the tileset's; frame: they are kept */
  replaceVariants: boolean;
  /** rows of wall face the user built the room with (0 = only the top edge) */
  front: number;
}

/** tile size of the sheet right in the room builder: the grid has to sit exactly on the tiles */
function TileSizeField({ ts, onTileSize }: { ts: Tileset; onTileSize: (size: number) => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  const [free, setFree] = useState(!COMMON_TILE_SIZES.includes(ts.tileSize));
  const [draft, setDraft] = useState(ts.tileSize);
  useEffect(() => setDraft(ts.tileSize), [ts.tileSize]);
  const apply = async (size: number) => {
    if (size === ts.tileSize || size < 4) return;
    setBusy(true);
    try {
      await onTileSize(size);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="room-size">
      <Segmented
        label="Tilegröße"
        value={free ? 'custom' : String(ts.tileSize)}
        options={[...COMMON_TILE_SIZES.map((n) => ({ value: String(n), label: `${n} px` })), { value: 'custom', label: 'Frei' }]}
        onChange={(v) => {
          if (v === 'custom') return setFree(true);
          setFree(false);
          void apply(Number(v));
        }}
      />
      {free && (
        <div className="room-size-free">
          <NumberField label="Eigene Tilegröße" value={draft} min={4} max={512} suffix="px" onChange={setDraft} />
          <button type="button" className="btn btn-secondary" disabled={busy || draft === ts.tileSize} onClick={() => void apply(draft)}>
            Übernehmen
          </button>
        </div>
      )}
      <p className="hint">
        {busy ? 'Schneide neu …' : `Tilegröße: ${ts.tileSize} px (${ts.columns} × ${ts.rows} Tiles).`} Passt das Raster nicht genau auf die Tiles, stell hier die Größe ein – danach neu zuordnen.
      </p>
    </div>
  );
}

export function RoomMarker({ ts, onApply, onClose, onTileSize }: { ts: Tileset; onApply: (r: RoomResult, clearOthers: boolean) => void; onClose: () => void; onTileSize?: (size: number) => Promise<void> | void }) {
  const [mode, setMode] = useState<'frame' | 'pieces'>('pieces');
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  // starts with what the map uses (a Low Top-Down map has 1 row of wall face, a room with more keeps it)
  const [front, setFront] = useState(() => initialFront(ts));
  const [clearOthers, setClearOthers] = useState(true);
  // builder: role → pieces (starts with the tileset's confirmed roles and its turned tiles)
  const [pieces, setPieces] = useState<Pieces>(() => {
    const out: Pieces = {};
    for (const [k, m] of Object.entries(ts.tiles)) if (!m.auto && managed(m.role)) (out[m.role!] ??= []).push({ i: Number(k), t: 0 });
    for (const v of ts.variants ?? []) (out[v.role] ??= []).push({ i: v.index, t: v.transform });
    return out;
  });
  const [slot, setSlot] = useState<TileRole>('corner_top_left');
  const [drag, setDrag] = useState<{ i: number; x: number; y: number; moved: boolean } | null>(null);
  /** builder: tile picked up with a tap – the next tap on a field of the room puts it there */
  const [hand, setHand] = useState<number | null>(null);
  const dragging = useRef(false);
  const wide = window.innerWidth >= 760;
  const sheetWidth = mode === 'pieces' && wide ? 380 : Math.min(560, window.innerWidth - 56);
  const cell = Math.max(14, Math.min(40, Math.floor(sheetWidth / ts.columns)));
  const w = rect ? rect.x1 - rect.x0 + 1 : 0;
  const h = rect ? rect.y1 - rect.y0 + 1 : 0;
  const tooSmall = !!rect && (w < 3 || h < 3 + front);
  const shown: Pieces = useMemo(() => (mode === 'frame' ? (rect && !tooSmall ? framePieces(ts, rect, front) : {}) : pieces), [mode, rect, tooSmall, ts, front, pieces]);
  const count = Object.values(shown).reduce((n, l) => n + (l?.length ?? 0), 0);
  const ready = count > 0;
  const board: Rect = { x0: 0, y0: 0, x1: 4, y1: 4 + front };
  const slotPx = wide ? 56 : Math.min(52, Math.floor((window.innerWidth - 80) / 5));

  const cellAt = (e: { clientX: number; clientY: number }, el: HTMLElement) => {
    const box = el.getBoundingClientRect();
    return { x: Math.max(0, Math.min(ts.columns - 1, Math.floor((e.clientX - box.left) / cell))), y: Math.max(0, Math.min(ts.rows - 1, Math.floor((e.clientY - box.top) / cell))) };
  };

  /** put tile i into a slot (a tile turned 0° belongs to one role only) */
  const place = (role: TileRole, i: number) => {
    const next: Pieces = {};
    for (const [r, list] of Object.entries(pieces) as [TileRole, Piece[]][]) next[r] = (list ?? []).filter((p) => !(p.i === i && p.t === 0 && r !== role));
    const cur = next[role] ?? [];
    next[role] = cur.some((p) => p.i === i && p.t === 0) ? cur.filter((p) => !(p.i === i && p.t === 0)) : [...cur, { i, t: 0 }];
    setPieces(next);
    setSlot(role);
  };
  /** tap on a field: the tile in hand goes there, otherwise the field is chosen (turn / mirror / remove) */
  const drop = (role: TileRole) => {
    if (hand === null) return setSlot(role);
    place(role, hand);
    setSlot(role);
    setHand(null);
  };
  /** turn / mirror / remove the first tile of the chosen slot */
  const edit = (fn: 'turn' | 'mirror' | 'remove') => {
    const list = pieces[slot] ?? [];
    if (!list.length) return;
    const [p, ...rest] = list;
    if (fn === 'remove') return setPieces({ ...pieces, [slot]: rest });
    setPieces({ ...pieces, [slot]: [{ i: p.i, t: fn === 'turn' ? rotateCW(p.t) : mirrorH(p.t) }, ...rest] });
  };

  const slotLabel = SLOT_LABEL[slot] ?? EXTRA_SLOTS.find((e) => e.role === slot)?.label;
  const cur = (pieces[slot] ?? [])[0];

  const sheet = (
    <div className="room-sheet-wrap">
      <div
        className="room-sheet"
        style={{ width: ts.columns * cell, height: ts.rows * cell, backgroundImage: `url(${imageUrl(ts.dataUrl)})`, backgroundSize: `${ts.columns * cell}px ${ts.rows * cell}px`, ['--cell' as string]: `${cell}px` }}
        onPointerDown={(e) => {
          const el = e.currentTarget as HTMLElement;
          const p = cellAt(e, el);
          el.setPointerCapture(e.pointerId);
          if (mode === 'pieces') {
            setDrag({ i: p.y * ts.columns + p.x, x: e.clientX, y: e.clientY, moved: false });
            return;
          }
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
          if (mode === 'pieces') {
            if (drag) setDrag({ ...drag, x: e.clientX, y: e.clientY, moved: drag.moved || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6 });
            return;
          }
          if (dragging.current && start) setRect(norm(start, cellAt(e, e.currentTarget as HTMLElement)));
        }}
        onPointerUp={(e) => {
          if (mode === 'pieces') {
            if (!drag) return;
            // dropped on a slot of the room plan → that slot; a plain tap → the chosen slot
            const target = drag.moved ? (document.elementsFromPoint(e.clientX, e.clientY).find((el) => (el as HTMLElement).dataset?.role) as HTMLElement | undefined) : undefined;
            if (target) place(target.dataset.role as TileRole, drag.i);
            // a plain tap picks the tile up (tap it again to put it down)
            else if (!drag.moved) setHand(hand === drag.i ? null : drag.i);
            setDrag(null);
            return;
          }
          if (!dragging.current || !start) return;
          dragging.current = false;
          const r = norm(start, cellAt(e, e.currentTarget as HTMLElement));
          setRect(r);
          // a real drag finishes the frame; a tap waits for the second corner
          if (r.x0 !== r.x1 || r.y0 !== r.y1) setStart(null);
        }}
        onPointerCancel={() => setDrag(null)}
      >
        {mode === 'pieces' && hand !== null && <span className="room-mark is-hand" style={{ left: (hand % ts.columns) * cell, top: Math.floor(hand / ts.columns) * cell, width: cell, height: cell }} />}
        {mode === 'pieces' &&
          Object.entries(pieces).flatMap(([role, list]) =>
            (list ?? []).map((p, k) => <span key={`${role}-${p.i}-${k}`} className={`room-mark${role === slot ? ' is-active' : ''}`} style={{ left: (p.i % ts.columns) * cell, top: Math.floor(p.i / ts.columns) * cell, width: cell, height: cell }} />),
          )}
        {mode === 'frame' && rect && (
          <div className={`room-frame${tooSmall ? ' is-bad' : ''}`} style={{ left: rect.x0 * cell, top: rect.y0 * cell, width: w * cell, height: h * cell }}>
            {!tooSmall &&
              Array.from({ length: w * h }, (_, k) => {
                const role = roomRole(rect, rect.x0 + (k % w), rect.y0 + Math.floor(k / w), front);
                return <span key={k} className={`room-cell r-${role.startsWith('floor') ? 'floor' : role.startsWith('wall_front') ? 'front' : 'wall'}`} />;
              })}
          </div>
        )}
      </div>
    </div>
  );

  const builder = (
    <div className="room-board-wrap">
      <div className="room-board" style={{ gridTemplateColumns: `repeat(5, ${slotPx}px)` }}>
        {Array.from({ length: 5 * (5 + front) }, (_, k) => {
          const x = k % 5;
          const y = Math.floor(k / 5);
          const role = roomRole(board, x, y, front, true);
          const list = pieces[role] ?? [];
          const p = list[(x + y) % Math.max(1, list.length)];
          // empty floor edge: shows the plain floor faintly (that is what the generator will use)
          const fb = ringFallback(role);
          const ghost = !p && fb ? (pieces[fb] ?? [])[0] : undefined;
          return (
            <button key={k} type="button" data-role={role} className={`room-slot${role === slot ? ' is-active' : ''}${list.length ? ' is-set' : ''}`} title={SLOT_LABEL[role]} onClick={() => drop(role)} style={{ width: slotPx, height: slotPx }}>
              {p ? (
                <span className="room-slot-tile" data-role={role} style={{ ...tileStyle(ts, p.i, slotPx), ...turnStyle(p.t) }} />
              ) : ghost ? (
                <>
                  <span className="room-slot-tile is-ghost" data-role={role} style={{ ...tileStyle(ts, ghost.i, slotPx), ...turnStyle(ghost.t) }} />
                  <span className="room-slot-label" data-role={role}>{SLOT_LABEL[role]}</span>
                </>
              ) : (
                <span data-role={role}>{SLOT_LABEL[role]}</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="room-extra">
        {EXTRA_SLOTS.map((e) => {
          const p = (pieces[e.role] ?? [])[0];
          return (
            <button key={e.role} type="button" data-role={e.role} className={`room-slot room-slot-wide${e.role === slot ? ' is-active' : ''}`} onClick={() => drop(e.role)}>
              {p ? <span className="tile-thumb" data-role={e.role} style={{ ...tileStyle(ts, p.i, 24), ...turnStyle(p.t) }} /> : null}
              <span data-role={e.role}>{e.label}</span>
            </button>
          );
        })}
      </div>
      <div className="room-tools">
        <span className="room-tools-label">
          <b>{slotLabel}</b>
          {(pieces[slot] ?? []).length > 1 ? ` · ${(pieces[slot] ?? []).length} Varianten` : ''}
        </span>
        <button type="button" className="btn btn-secondary" disabled={!cur} onClick={() => edit('turn')} title="90° im Uhrzeigersinn drehen">
          ↻ Drehen
        </button>
        <button type="button" className="btn btn-secondary" disabled={!cur} onClick={() => edit('mirror')} title="Links ↔ rechts spiegeln">
          ⇋ Spiegeln
        </button>
        <button type="button" className="btn btn-ghost" disabled={!cur} onClick={() => edit('remove')}>
          Entfernen
        </button>
      </div>
      <button type="button" className="btn btn-secondary room-complete" onClick={() => setPieces(completeByTurning(pieces))}>
        Fehlende Ecken, Wände und Ränder durch Drehen ergänzen
      </button>
    </div>
  );

  return (
    <div className="quick-pick-backdrop" role="presentation" onClick={onClose}>
      <div className={`quick-pick room-marker${mode === 'pieces' ? ' is-builder' : ''}`} role="dialog" aria-label="Raum im Tileset markieren" onClick={(e) => e.stopPropagation()}>
        <header className="quick-pick-head">
          <div className="quick-pick-tile">
            <div>
              <strong>Raum aus dem Tileset bauen</strong>
              <span className="quick-pick-current">{mode === 'frame' ? 'Rahmen über einen gezeichneten Raum ziehen.' : hand !== null ? 'Jetzt ins passende Feld des Raums tippen.' : 'Tile im Tileset antippen, dann ins passende Feld des Raums tippen.'}</span>
            </div>
          </div>
          <IconButton label="Schließen" onClick={onClose}>
            <Icon.Close size={18} />
          </IconButton>
        </header>
        <div className="quick-pick-body">
          {onTileSize && <TileSizeField ts={ts} onTileSize={onTileSize} />}
          <Segmented
            label="Art"
            value={mode}
            onChange={(v) => setMode(v)}
            options={[
              { value: 'pieces', label: 'Raum füllen' },
              { value: 'frame', label: 'Raum einrahmen' },
            ]}
          />
          <p className="hint">
            {mode === 'frame'
              ? 'Ist im Tileset ein Raum gezeichnet? Rahmen darüberziehen: die äußeren Ecken werden Ecken, die Ränder Wände, das Innere Boden. Am Handy: erst eine Ecke antippen, dann die gegenüberliegende.'
              : '1. Tile im Tileset antippen. 2. Ins Feld des Raums tippen, wo es hingehört (Ecke, Wand, Tür, Wasser …). Der Boden hat eigene Felder für Mitte, Rand oben, unten, links, rechts und die vier Boden-Ecken – leer bleibende Ränder nehmen den Boden der Mitte. Ziehen geht auch. Mit Drehen / Spiegeln passt du das gewählte Feld an – eine Ecke oder ein Rand reicht, „durch Drehen ergänzen“ setzt die anderen drei. Mehrere Tiles pro Feld = Varianten.'}
          </p>
          <div className={mode === 'pieces' && wide ? 'room-split' : undefined}>
            {sheet}
            {mode === 'pieces' && builder}
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
          <p className="hint">Wand-Vorderseite: Hat das Tileset Mauer von vorne (3/4-Ansicht, Low Top-Down), die unter der oberen Wand steht? Dann 1 oder 2 Reihen wählen.</p>
          {mode === 'frame' && rect && tooSmall && <p className="hint is-warn">Der Rahmen muss mindestens 3 × {3 + front} Tiles groß sein.</p>}
          {ready && (
            <>
              <h4>So baut der Generator damit einen Raum</h4>
              <SampleRoom ts={ts} pieces={shown} front={front} />
              <label className="quick-pick-next">
                <input type="checkbox" checked={clearOthers} onChange={(e) => setClearOthers(e.target.checked)} />
                Automatische Vorschläge der übrigen Tiles verwerfen (nur deine Tiles bauen Räume; Deko, Türen usw. kannst du danach einzeln zuordnen)
              </label>
            </>
          )}
        </div>
        <footer className="quick-pick-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <Button variant="primary" disabled={!ready} onClick={() => onApply({ ...piecesResult(shown), replaceVariants: mode === 'pieces', front }, clearOthers)}>
            {ready ? `${count} Tiles übernehmen` : mode === 'frame' ? 'Rahmen ziehen' : 'Raum füllen'}
          </Button>
        </footer>
        {drag?.moved && <span className="room-drag" style={{ ...tileStyle(ts, drag.i, 44), left: drag.x - 22, top: drag.y - 22 }} />}
      </div>
    </div>
  );
}

/**
 * the room was built with wall face rows: the map shows them too (Top-Down with one row of wall
 * under the edge …). Returns a note for the user, or null when nothing changed.
 */
export function matchWallRows(front: number): string | null {
  const st = useProject.getState();
  const map = st.project.map;
  // only more rows: a room built without face rows must not flatten a Low Top-Down map
  if (!WALL_ROW_VIEWS.includes(map.perspective) || faceRowsOf(map) >= front) return null;
  st.setMapOptions({ wallRows: front });
  return `Wände der Karte: Kante + ${front} ${front === 1 ? 'Reihe' : 'Reihen'} (wirkt beim nächsten Generieren)`;
}

/** apply a room to a tileset: its tiles get their roles (confirmed), optionally the other suggestions go */
export function applyRoom(ts: Pick<Tileset, 'tiles' | 'variants'>, r: RoomResult, clearOthers: boolean): Pick<Tileset, 'tiles' | 'variants'> {
  const tiles: Record<number, TileMeta> = {};
  for (const [k, m] of Object.entries(ts.tiles)) {
    if (clearOthers && m.auto) continue;
    // builder: roles it manages are replaced as a whole
    if (r.replaceVariants && managed(m.role) && !m.auto) continue;
    tiles[Number(k)] = m;
  }
  const variants = r.replaceVariants ? r.variants : [...(clearOthers ? [] : ts.variants ?? []), ...r.variants];
  return { tiles: { ...tiles, ...r.tiles }, variants };
}
