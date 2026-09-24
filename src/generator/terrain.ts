import {
  CELL_CORRIDOR,
  CELL_HAZARD,
  CELL_ROOM,
  T_ABYSS,
  T_BRIDGE,
  T_CLIFF,
  T_LAVA,
  T_NONE,
  T_PLATEAU,
  T_STAIRS,
  T_TRANSITION,
  T_WATER,
  type Perspective,
  type TerrainSettings,
  type TileRole,
} from '../types';
import type { Rng } from './rng';
import type { Grid, CarvedCorridor } from './corridors';
import type { PlacedRoom } from './rooms';
import { PERSPECTIVE_INFO } from './perspective';
import { allReachable, isWalkable } from './nav';

// Terrain features (water, lava, abyss, plateaus with cliffs, bridges, transitions).
// Every feature is validated: all rooms must stay reachable from the start room.
// If a feature would cut a required path it gets a bridge (when allowed) or is reverted.

export interface BridgeCell {
  role: TileRole;
  /** 'h' = walked east-west, 'v' = walked north-south */
  orient: 'h' | 'v';
  /** liquid below the bridge */
  under: number;
}

export interface TerrainState {
  terrain: Uint8Array;
  heights: Uint8Array;
  bridges: Map<number, BridgeCell>;
  /** cells that must stay free (room anchors, spawn candidates) */
  reserved: Set<number>;
  /** connection index → crosses a bridge */
  bridgedConnections: Set<number>;
  warnings: string[];
}

export function createTerrainState(W: number, H: number): TerrainState {
  return {
    terrain: new Uint8Array(W * H),
    heights: new Uint8Array(W * H),
    bridges: new Map(),
    reserved: new Set(),
    bridgedConnections: new Set(),
    warnings: [],
  };
}

interface Ctx {
  g: Grid;
  t: TerrainState;
  rooms: PlacedRoom[];
  startRoom: number;
  rng: Rng;
}

function targets(ctx: Ctx, extra: number[] = []): number[] {
  return [...ctx.rooms.map((r) => r.cy * ctx.g.W + r.cx), ...extra];
}

function valid(ctx: Ctx, extra: number[] = []): boolean {
  const { g, t } = ctx;
  const start = ctx.rooms[ctx.startRoom];
  if (!start) return true;
  return allReachable(g.W, g.H, (i) => isWalkable(g.cells, t.terrain, i), start.cy * g.W + start.cx, targets(ctx, extra));
}

/** Room cell with all 8 neighbours plain room floor (no terrain, not reserved). */
function freeInterior(ctx: Ctx, i: number, r = 1): boolean {
  const { g, t } = ctx;
  const x = i % g.W;
  const y = (i / g.W) | 0;
  for (let oy = -r; oy <= r; oy++)
    for (let ox = -r; ox <= r; ox++) {
      const xx = x + ox;
      const yy = y + oy;
      if (xx < 0 || yy < 0 || xx >= g.W || yy >= g.H) return false;
      const j = yy * g.W + xx;
      if (g.cells[j] !== CELL_ROOM || t.terrain[j] !== T_NONE || t.reserved.has(j)) return false;
    }
  return true;
}

function setBridgeLine(ctx: Ctx, line: number[], orient: 'h' | 'v', widthRows: number[][] | null = null) {
  const { t } = ctx;
  const rows = widthRows ?? [line];
  rows.forEach((row, ri) => {
    row.forEach((i, k) => {
      let role: TileRole = k === 0 ? 'bridge_start' : k === row.length - 1 ? 'bridge_end' : 'bridge_middle';
      if (rows.length > 1 && role === 'bridge_middle') {
        if (ri === 0) role = 'bridge_left';
        else if (ri === rows.length - 1) role = 'bridge_right';
      }
      const under = t.terrain[i] === T_BRIDGE ? (t.bridges.get(i)?.under ?? T_ABYSS) : t.terrain[i];
      t.bridges.set(i, { role, orient, under: under === T_NONE ? T_ABYSS : under });
      t.terrain[i] = T_BRIDGE;
    });
  });
}

/* ------------------------------------------------------------------ */
/* liquids / abyss inside rooms                                        */
/* ------------------------------------------------------------------ */

function growBlob(ctx: Ctx, seed: number, size: number, ok: (i: number) => boolean): number[] {
  const { g, rng } = ctx;
  const blob = [seed];
  const inBlob = new Set(blob);
  for (let k = 0; k < size * 6 && blob.length < size; k++) {
    const c = rng.pick(blob);
    const j = c + rng.pick([1, -1, g.W, -g.W]);
    if (!inBlob.has(j) && ok(j)) {
      blob.push(j);
      inBlob.add(j);
    }
  }
  return blob;
}

/** Try to connect both sides of a liquid blob with a straight bridge. */
function bridgeAcross(ctx: Ctx, blob: number[]): boolean {
  const { g, t, rng } = ctx;
  const set = new Set(blob);
  const walk = (i: number) => isWalkable(g.cells, t.terrain, i);
  const lines: { cells: number[]; orient: 'h' | 'v' }[] = [];
  for (const c of blob) {
    const x = c % g.W;
    const y = (c / g.W) | 0;
    // horizontal: start at the west edge of the blob
    if (!set.has(c - 1) && walk(c - 1)) {
      const cells: number[] = [];
      let xx = x;
      while (set.has(y * g.W + xx)) cells.push(y * g.W + xx++);
      if (walk(y * g.W + xx)) lines.push({ cells, orient: 'h' });
    }
    if (!set.has(c - g.W) && walk(c - g.W)) {
      const cells: number[] = [];
      let yy = y;
      while (set.has(yy * g.W + x)) cells.push(yy++ * g.W + x);
      if (walk(yy * g.W + x)) lines.push({ cells, orient: 'v' });
    }
  }
  rng.shuffle(lines);
  lines.sort((a, b) => a.cells.length - b.cells.length);
  for (const line of lines.slice(0, 6)) {
    const backup = line.cells.map((i) => t.terrain[i]);
    setBridgeLine(ctx, line.cells, line.orient);
    if (valid(ctx)) return true;
    line.cells.forEach((i, k) => {
      t.terrain[i] = backup[k];
      t.bridges.delete(i);
    });
  }
  return false;
}

function placePool(ctx: Ctx, room: PlacedRoom, type: number, size: number, allowBridges: boolean, island: boolean): 'ok' | 'nospace' | 'blocked' {
  const { g, t, rng } = ctx;
  const cands: number[] = [];
  for (let y = room.y; y < room.y + room.h; y++)
    for (let x = room.x; x < room.x + room.w; x++) {
      const i = y * g.W + x;
      if (freeInterior(ctx, i, island ? 3 : 1)) cands.push(i);
    }
  if (!cands.length) return 'nospace';
  const seed = rng.pick(cands);
  let blob: number[];
  if (island) {
    // ring of abyss around a small walkable island
    const R = rng.chance(0.5) ? 3 : 2;
    const cx = seed % g.W;
    const cy = (seed / g.W) | 0;
    blob = [];
    for (let oy = -R; oy <= R; oy++)
      for (let ox = -R; ox <= R; ox++) {
        const d = Math.max(Math.abs(ox), Math.abs(oy));
        if (d >= R - (R === 3 ? 1 : 0) && d <= R) blob.push((cy + oy) * g.W + cx + ox);
      }
  } else {
    blob = growBlob(ctx, seed, size, (j) => freeInterior(ctx, j, 1));
  }
  if (blob.length < 3) return 'nospace';
  const backup = blob.map((i) => [g.cells[i], t.terrain[i]]);
  for (const i of blob) {
    g.cells[i] = CELL_HAZARD;
    t.terrain[i] = type;
  }
  if (island) {
    // bridge from the island to the outside on a random side
    const cx = seed % g.W;
    const cy = (seed / g.W) | 0;
    const set = new Set(blob);
    const dirs = rng.shuffle([
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]);
    let bridged = !allowBridges;
    if (allowBridges)
      for (const [dx, dy] of dirs) {
        const line: number[] = [];
        let x = cx;
        let y = cy;
        for (let k = 0; k < 5; k++) {
          x += dx;
          y += dy;
          const i = y * g.W + x;
          if (set.has(i)) line.push(i);
          else if (line.length) break;
        }
        if (line.length) {
          if (dx < 0 || dy < 0) line.reverse();
          setBridgeLine(ctx, line, dx ? 'h' : 'v');
          bridged = true;
          break;
        }
      }
    if (bridged && valid(ctx)) return 'ok';
  } else if (valid(ctx) || (allowBridges && bridgeAcross(ctx, blob))) {
    return 'ok';
  }
  // revert
  blob.forEach((i, k) => {
    g.cells[i] = backup[k][0];
    t.terrain[i] = backup[k][1];
    t.bridges.delete(i);
  });
  return 'blocked';
}

/* ------------------------------------------------------------------ */
/* chasms / rivers crossing corridors (between rooms)                   */
/* ------------------------------------------------------------------ */

function placeCrossing(ctx: Ctx, corr: CarvedCorridor, index: number, type: number): boolean {
  const { g, t, rng } = ctx;
  const p = corr.path;
  // straight runs of at least 7 cells
  const runs: [number, number, 'h' | 'v'][] = [];
  let runStart = 0;
  let runDir: 'h' | 'v' | null = null;
  for (let k = 1; k < p.length; k++) {
    const dir: 'h' | 'v' = p[k][1] === p[k - 1][1] ? 'h' : 'v';
    if (dir !== runDir) {
      if (runDir && k - 1 - runStart >= 6) runs.push([runStart, k - 1, runDir]);
      runStart = k - 1;
      runDir = dir;
    }
  }
  if (runDir && p.length - 1 - runStart >= 6) runs.push([runStart, p.length - 1, runDir]);
  if (!runs.length) return false;
  const [a, b, orient] = rng.pick(runs);
  const mid = Math.floor((a + b) / 2);
  const depth = rng.chance(0.5) ? 2 : 3;
  const half = Math.floor(corr.width / 2) + 2;
  const band: number[] = [];
  for (let k = mid - Math.floor(depth / 2); k < mid - Math.floor(depth / 2) + depth; k++) {
    const [px, py] = p[k];
    for (let o = -half; o <= half; o++) {
      const x = orient === 'h' ? px : px + o;
      const y = orient === 'h' ? py + o : py;
      if (x < 2 || y < 2 || x >= g.W - 2 || y >= g.H - 2) return false;
      const i = y * g.W + x;
      if (g.cells[i] === CELL_ROOM || t.terrain[i] !== T_NONE || t.reserved.has(i)) return false;
      band.push(i);
    }
  }
  const backup = band.map((i) => g.cells[i]);
  // corridor cells become the bridge, the rest turns into the chasm / river
  const bridgeCells: number[] = [];
  for (const i of band) {
    if (g.cells[i] === CELL_CORRIDOR) bridgeCells.push(i);
    else {
      g.cells[i] = CELL_HAZARD;
      t.terrain[i] = type;
    }
  }
  if (!bridgeCells.length) {
    band.forEach((i, k) => ((g.cells[i] = backup[k]), (t.terrain[i] = T_NONE)));
    return false;
  }
  for (const i of bridgeCells) t.terrain[i] = type;
  // group bridge cells into lines along the walking direction (one per corridor lane)
  const lanes = new Map<number, number[]>();
  for (const i of bridgeCells) {
    const key = orient === 'h' ? (i / g.W) | 0 : i % g.W;
    const list = lanes.get(key) ?? [];
    list.push(i);
    lanes.set(key, list);
  }
  const rows = [...lanes.entries()].sort((x, y) => x[0] - y[0]).map(([, cells]) => cells.sort((x, y) => x - y));
  setBridgeLine(ctx, rows[0], orient, rows);
  if (!valid(ctx)) {
    band.forEach((i, k) => {
      g.cells[i] = backup[k];
      t.terrain[i] = T_NONE;
      t.bridges.delete(i);
    });
    return false;
  }
  t.bridgedConnections.add(index);
  return true;
}

/* ------------------------------------------------------------------ */
/* plateaus with cliffs and stairs                                      */
/* ------------------------------------------------------------------ */

export interface Plateau {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  stairsX: number;
  faceRows: number;
}

function placePlateau(ctx: Ctx, room: PlacedRoom, perspective: Perspective): Plateau | null {
  const { g, t, rng } = ctx;
  const faceRows = PERSPECTIVE_INFO[perspective].faceRows;
  // the wished size first, then smaller ones: natural clearings and odd room shapes leave little room
  const want: [number, number] = [rng.int(4, Math.max(4, Math.min(8, room.w - 4))), rng.int(3, Math.max(3, Math.min(5, Math.floor(room.h / 2))))];
  const sizes: [number, number][] = [want, [5, 4], [4, 3]].filter(([w, h], k, all) => w <= room.w - 2 && h + faceRows <= room.h - 2 && all.findIndex(([a, b]) => a === w && b === h) === k) as [number, number][];
  const inRoom = (i: number) => g.cells[i] === CELL_ROOM && t.terrain[i] === T_NONE && !t.reserved.has(i);
  // the ring around it only has to be walkable ground (room or path), so the cliff never touches a wall
  const around = (i: number) => (g.cells[i] === CELL_ROOM || g.cells[i] === CELL_CORRIDOR) && t.terrain[i] === T_NONE;
  for (const [pw, ph] of sizes) {
    // every position inside the room, in random order (natural clearings / caves have ragged edges,
    // a few random tries rarely hit a spot that fits)
    const spots: [number, number][] = [];
    for (let y = room.y; y <= room.y + room.h - ph - faceRows; y++) for (let x = room.x; x <= room.x + room.w - pw; x++) spots.push([x, y]);
    rng.shuffle(spots);
    for (const [x0, y0] of spots.slice(0, 300)) {
      const x1 = x0 + pw - 1;
      const y1 = y0 + ph - 1;
      const yBottom = y1 + faceRows;
      let ok = true;
      for (let y = y0 - 1; y <= yBottom + 1 && ok; y++)
        for (let x = x0 - 1; x <= x1 + 1; x++) {
          if (y < 0 || x < 0 || x >= g.W || y >= g.H) {
            ok = false;
            break;
          }
          const i = y * g.W + x;
          const ring = y === y0 - 1 || y === yBottom + 1 || x === x0 - 1 || x === x1 + 1;
          if (!(ring ? around(i) : inRoom(i))) {
            ok = false;
            break;
          }
        }
      if (!ok) continue;
      const stairsX = rng.int(x0 + 1, x1 - 1);
      const touched: number[] = [];
      const set = (i: number, code: number, h: number) => {
        touched.push(i);
        t.terrain[i] = code;
        t.heights[i] = h;
      };
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const rim = y === y0 || x === x0 || x === x1 || (faceRows === 0 && y === y1);
          const stairs = faceRows === 0 && y === y1 && x === stairsX;
          set(y * g.W + x, stairs ? T_STAIRS : rim ? T_CLIFF : T_PLATEAU, 1);
        }
      for (let y = y1 + 1; y <= yBottom; y++) for (let x = x0; x <= x1; x++) set(y * g.W + x, x === stairsX ? T_STAIRS : T_CLIFF, 0);
      const inner = (y0 + 1) * g.W + x0 + 1;
      if (valid(ctx, [inner])) return { x0, y0, x1, y1, stairsX, faceRows };
      for (const i of touched) {
        t.terrain[i] = T_NONE;
        t.heights[i] = 0;
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */

export interface TerrainResult {
  plateaus: Plateau[];
}

export function placeTerrain(
  g: Grid,
  t: TerrainState,
  rooms: PlacedRoom[],
  corridors: CarvedCorridor[],
  s: TerrainSettings,
  perspective: Perspective,
  startRoom: number,
  rng: Rng,
): TerrainResult {
  const ctx: Ctx = { g, t, rooms, startRoom, rng };
  for (const r of rooms)
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) t.reserved.add((r.cy + oy) * g.W + r.cx + ox);

  // 1. crossings between rooms (chasm / river with a bridge)
  const crossTypes: number[] = [];
  if (s.abyss.enabled && s.abyss.betweenRooms && s.abyss.bridges) crossTypes.push(T_ABYSS);
  if (s.bridges && s.water.enabled) crossTypes.push(T_WATER);
  if (s.bridges && s.lava.enabled) crossTypes.push(T_LAVA);
  if (crossTypes.length) {
    const wanted = Math.round(((s.abyss.enabled ? s.abyss.amount : 0) / 100) * corridors.length * 0.6 + (s.bridges ? 0.4 : 0));
    const order = rng.shuffle(corridors.map((_, i) => i));
    let made = 0;
    for (const ci of order) {
      if (made >= wanted) break;
      if (placeCrossing(ctx, corridors[ci], ci, rng.pick(crossTypes))) made++;
    }
  }

  // 2. plateaus with cliffs (need space, so before pools)
  const plateaus: Plateau[] = [];
  if (s.cliffs.enabled && s.cliffs.amount > 0) {
    const count = Math.round((s.cliffs.amount / 100) * rooms.length * 0.6);
    const big = rng.shuffle(rooms.filter((r) => r.w >= 7 && r.h >= 6 && r.id !== startRoom));
    for (const r of big) {
      if (plateaus.length >= count) break;
      const p = placePlateau(ctx, r, perspective);
      if (p) plateaus.push(p);
    }
  }

  // 3. pools inside rooms
  const pools: { type: number; amount: number; min: number; max: number; island: boolean }[] = [];
  if (s.abyss.enabled && s.abyss.inRooms) pools.push({ type: T_ABYSS, amount: s.abyss.amount, min: s.abyss.minSize, max: s.abyss.maxSize, island: s.abyss.islands });
  if (s.water.enabled) pools.push({ type: T_WATER, amount: s.water.amount, min: 4, max: 6 + Math.round(s.water.amount / 6), island: false });
  if (s.lava.enabled) pools.push({ type: T_LAVA, amount: s.lava.amount, min: 3, max: 5 + Math.round(s.lava.amount / 8), island: false });
  let failed = 0;
  for (const pool of pools) {
    const count = Math.round((pool.amount / 100) * rooms.length * 0.6);
    const cands = rng.shuffle(rooms.filter((r) => r.id !== startRoom));
    let made = 0;
    for (const r of cands) {
      if (made >= count) break;
      const island = pool.island && rng.chance(0.35);
      const bridges = pool.type === T_ABYSS ? s.abyss.bridges : s.bridges;
      const res = placePool(ctx, r, pool.type, rng.int(pool.min, Math.max(pool.min, pool.max)), bridges, island);
      if (res === 'ok') made++;
      else if (res === 'blocked') failed++;
    }
  }
  if (failed > 0) t.warnings.push(`${failed} Gelände-Fläche(n) ohne Brücke ausgelassen, damit alle Räume erreichbar bleiben.`);
  return { plateaus };
}

/** Transition floor where corridors enter rooms of a different terrain (or by chance). */
export function placeTransitions(g: Grid, t: TerrainState, roomTerrain: string[], corridorTerrain: string, amount: number, rng: Rng) {
  for (let i = 0; i < g.W * g.H; i++) {
    if (g.cells[i] !== CELL_CORRIDOR || t.terrain[i] !== T_NONE) continue;
    for (const j of [i - 1, i + 1, i - g.W, i + g.W]) {
      if (g.cells[j] !== CELL_ROOM) continue;
      const rid = g.roomId[j];
      const differs = rid >= 0 && roomTerrain[rid] !== corridorTerrain;
      if (differs || rng.chance(amount / 100)) t.terrain[i] = T_TRANSITION;
      break;
    }
  }
}

