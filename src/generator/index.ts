import {
  CELL_CORRIDOR,
  CELL_HAZARD,
  CELL_ROOM,
  CELL_VOID,
  CELL_WALL,
  type Connection,
  type Door,
  type GenerationResult,
  type GeneratorSettings,
  type Layer,
  type LayerRole,
  type MapSettings,
  type Room,
  type SpawnPoint,
  type SpawnType,
  type SpecialRoomType,
  type TileCategory,
  type Tileset,
} from '../types';
import { Rng } from './rng';
import { placeRooms, type PlacedRoom } from './rooms';
import { buildGraph } from './graph';
import { carveBranches, carveCorridors, computeNearRoom, type Grid } from './corridors';
import { assignSpecialRooms } from './specials';
import { TilePools } from '../tilesets/tilePools';
import { WallRole, resolveAutoTiles, wallRequest } from './autotile';
import { requiredRooms } from './perspective';

export interface GenerateInput {
  settings: GeneratorSettings;
  map: MapSettings;
  tilesets: Tileset[];
  layers: Pick<Layer, 'id' | 'role'>[];
}

export interface GenerateOutput {
  result: GenerationResult;
  /** new data for generator-owned layers (by layer id) */
  layerData: Record<string, Uint32Array>;
}

// wall neighbour bits (clockwise from north)
const N = 1,
  NE = 2,
  E = 4,
  SE = 8,
  S = 16,
  SW = 32,
  W_ = 64,
  NW = 128;

const HAZARD_CATS: TileCategory[] = ['lava', 'water', 'abyss'];

export function generate(input: GenerateInput): GenerateOutput {
  const { settings: s, map } = input;
  const W = Math.max(16, map.width);
  const H = Math.max(16, map.height);
  const root = Rng.fromString(s.seed);
  const rRooms = root.fork(11);
  const rGraph = root.fork(23);
  const rCorr = root.fork(37);
  const rBranch = root.fork(41);
  const rSpecial = root.fork(53);
  const rTiles = root.fork(67);
  const rDeco = root.fork(79);
  const rHazard = root.fork(83);
  const warnings: string[] = [];

  const grid: Grid = {
    W,
    H,
    cells: new Uint8Array(W * H),
    roomId: new Int16Array(W * H).fill(-1),
    nearRoom: new Int16Array(W * H).fill(-1),
  };

  // 1–4: rooms, placement, overlap prevention, shapes
  const placed = placeRooms(s, W, H, rRooms, warnings);
  for (const r of placed) {
    for (let y = 0; y < r.mask.h; y++)
      for (let x = 0; x < r.mask.w; x++) {
        if (!r.mask.data[y * r.mask.w + x]) continue;
        const i = (r.y + y) * W + r.x + x;
        grid.cells[i] = CELL_ROOM;
        grid.roomId[i] = r.id;
      }
  }
  computeNearRoom(grid);

  // 5–8: room graph, corridors, loops, branches
  const edges = buildGraph(placed, s, rGraph, W, H);
  const corridors = carveCorridors(grid, placed, edges, s, rCorr);
  const deadEnds = carveBranches(grid, s, rBranch, placed.length);

  // 11: automatic walls (+ neighbour mask for later auto-tiling)
  const wallMask = new Uint8Array(W * H);
  const walk = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < W && y < H && grid.cells[y * W + x] !== CELL_VOID && grid.cells[y * W + x] !== CELL_WALL;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (grid.cells[i] !== CELL_VOID) continue;
      let m = 0;
      if (walk(x, y - 1)) m |= N;
      if (walk(x + 1, y - 1)) m |= NE;
      if (walk(x + 1, y)) m |= E;
      if (walk(x + 1, y + 1)) m |= SE;
      if (walk(x, y + 1)) m |= S;
      if (walk(x - 1, y + 1)) m |= SW;
      if (walk(x - 1, y)) m |= W_;
      if (walk(x - 1, y - 1)) m |= NW;
      if (m) wallMask[i] = m;
    }
  for (let i = 0; i < W * H; i++) if (wallMask[i]) grid.cells[i] = CELL_WALL;

  // 11b: perspective-aware wall roles (fronts, caps), shadow + floor masks
  const perspective = map.perspective ?? 'top_down';
  const auto = resolveAutoTiles(grid, wallMask, perspective, map.shadows ?? false);

  // 12: doors where corridors meet rooms (narrow openings only)
  const doors = findDoors(grid);
  const doorSet = new Set(doors.map((d) => d.y * W + d.x));

  // 13: special rooms
  const specials = assignSpecialRooms(placed, edges, s, rSpecial);

  const pools = new TilePools(input.tilesets, perspective);
  const missingSpecials = requiredRooms(s.specials) - specials.size;
  if (missingSpecials > 0)
    warnings.push(`${missingSpecials} Spezialraum/-räume ohne freien Raum – Raumanzahl erhöhen.`);
  if (!pools.has('floor')) warnings.push('Keine aktive Kachel der Kategorie „Boden“ – Boden-Layer bleibt leer.');

  // hazards (lava / water / abyss pools inside larger rooms)
  const hazardCats = HAZARD_CATS.filter((c) => pools.has(c) && s[c as 'lava' | 'water' | 'abyss'] !== false);
  const hazardType = new Map<number, TileCategory>();
  if (s.hazards > 0 && hazardCats.length) {
    const count = Math.round((s.hazards / 100) * placed.length * 0.5);
    const cands = rHazard.shuffle(placed.filter((r) => specials.get(r.id) !== 'start'));
    let made = 0;
    for (const r of cands) {
      if (made >= count) break;
      if (makePool(grid, r, rHazard, s.hazards, hazardType, rHazard.pick(hazardCats))) made++;
    }
  }

  // objects: pillars in halls, obstacles in room interiors
  const objects = new Map<number, TileCategory>();
  const reserved = new Set<number>();
  for (const r of placed) reserved.add(r.cy * W + r.cx);
  for (const d of doors) {
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) reserved.add((d.y + oy) * W + d.x + ox);
  }
  for (const r of placed) {
    if (r.shape !== 'hall' || !pools.resolve(['pillar', 'obstacle'])) continue;
    const step = r.w > 18 ? 5 : 4;
    for (let y = r.y + 2; y < r.y + r.h - 2; y += step)
      for (let x = r.x + 2; x < r.x + r.w - 2; x += step) {
        const i = y * W + x;
        if (isInterior(grid, x, y, 2) && !reserved.has(i)) objects.set(i, 'pillar');
      }
  }
  if (s.obstacleDensity > 0 && pools.has('obstacle')) {
    const p = (s.obstacleDensity / 100) * 0.09;
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (grid.cells[i] !== CELL_ROOM || reserved.has(i) || !isInterior(grid, x, y, 1)) continue;
        let blocked = false;
        for (let oy = -1; oy <= 1 && !blocked; oy++)
          for (let ox = -1; ox <= 1; ox++) if (objects.has((y + oy) * W + x + ox)) blocked = true;
        if (!blocked && rDeco.chance(p)) objects.set(i, 'obstacle');
      }
  }

  // rooms & connections for the data model
  const rooms: Room[] = placed.map((r) => {
    const type = specials.get(r.id) ?? 'normal';
    return {
      id: r.id,
      type,
      shape: r.shape,
      x: r.x,
      y: r.y,
      width: r.w,
      height: r.h,
      centerX: r.cx,
      centerY: r.cy,
      area: r.area,
      connections: [],
      isStart: type === 'start',
      isEnd: type === 'end',
      isBoss: type === 'boss',
      special: type === 'normal' || type === 'start' || type === 'end' ? null : type,
    };
  });
  const connections: Connection[] = corridors.map((c, i) => ({
    id: i,
    from: c.a,
    to: c.b,
    kind: c.kind,
    width: c.width,
    length: c.length,
  }));
  for (const c of connections) {
    if (!rooms[c.from].connections.includes(c.to)) rooms[c.from].connections.push(c.to);
    if (!rooms[c.to].connections.includes(c.from)) rooms[c.to].connections.push(c.from);
  }

  // spawn points (data structure for player / enemy / loot / npc / quest)
  const spawnPoints: SpawnPoint[] = [];
  const spawnFor: [SpecialRoomType, SpawnType][] = [
    ['start', 'player'],
    ['boss', 'enemy'],
    ['treasure', 'loot'],
    ['merchant', 'npc'],
    ['quest', 'quest'],
  ];
  for (const [roomType, spawnType] of spawnFor) {
    const room = rooms.find((r) => r.type === roomType);
    if (!room) continue;
    const [sx, sy] = spawnCell(grid, room, objects);
    spawnPoints.push({
      id: `${spawnType}_${room.id}`,
      type: spawnType,
      x: sx,
      y: sy,
      roomId: room.id,
      properties: roomType === 'boss' ? { boss: true } : {},
    });
  }

  // 14: paint layers with weighted tile variants
  const byRole = new Map<LayerRole, Uint32Array>();
  const layerData: Record<string, Uint32Array> = {};
  for (const l of input.layers) {
    if (l.role === 'custom' || byRole.has(l.role)) continue;
    const arr = new Uint32Array(W * H);
    byRole.set(l.role, arr);
    layerData[l.id] = arr;
  }
  const floorL = byRole.get('floor');
  const pathL = byRole.get('paths');
  const shadowL = byRole.get('shadow');
  const wallL = byRole.get('walls');
  const objL = byRole.get('objects');
  const decoL = byRole.get('deco');
  const colL = byRole.get('collision');
  const gameL = byRole.get('gameplay');
  const spawnL = byRole.get('spawn');

  const variation = s.floorVariation / 100;
  const edgeFloor = pools.hasTag('floor', 'edge');
  const collisionGid = pools.pickTagged(rTiles, 'special', 'collision');

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const c = grid.cells[i];
      if (c === CELL_ROOM || c === CELL_CORRIDOR) {
        if (floorL) {
          const variant = pools.has('floorVariant') && rTiles.chance(variation);
          // edge-aware floor: tiles tagged "edge" go to cells at the border of a floor area
          const edge = auto.floorMask[i] !== 15;
          floorL[i] = variant
            ? pools.pick(rTiles, ['floorVariant', 'floor'])
            : edgeFloor
              ? pools.pickPref(rTiles, ['floor'], edge ? 'edge' : undefined, edge ? undefined : ['edge'])
              : pools.pick(rTiles, ['floor']);
        }
        const sh = auto.shadows[i];
        if (sh && shadowL) shadowL[i] = pools.pickPref(rTiles, ['shadow'], sh);
        if (c === CELL_CORRIDOR && pathL) pathL[i] = pools.pick(rTiles, ['path']);
      } else if (c === CELL_HAZARD) {
        if (floorL) floorL[i] = pools.pick(rTiles, [hazardType.get(i) ?? 'lava', ...HAZARD_CATS]);
        if (colL && collisionGid) colL[i] = collisionGid;
      } else if (c === CELL_WALL) {
        if (wallL) {
          const req = wallRequest(auto.wallRoles[i] as WallRole, perspective);
          wallL[i] = pools.pickPref(rTiles, req.cats, req.prefer, req.avoid);
        }
        if (colL && collisionGid) colL[i] = collisionGid;
      }
    }

  if (objL) {
    for (const i of doorSet) objL[i] = pools.pick(rTiles, ['door']);
    for (const [i, cat] of objects) {
      objL[i] = pools.pick(rTiles, cat === 'pillar' ? ['pillar', 'obstacle'] : ['obstacle']);
      if (colL && collisionGid) colL[i] = collisionGid;
    }
  }

  if (decoL && s.decoDensity > 0 && pools.has('deco')) {
    const p = (s.decoDensity / 100) * 0.14;
    for (let i = 0; i < W * H; i++) {
      const c = grid.cells[i];
      if ((c !== CELL_ROOM && c !== CELL_CORRIDOR) || doorSet.has(i) || objects.has(i)) continue;
      // corridors get fewer decorations than rooms
      if (rDeco.chance(c === CELL_ROOM ? p : p * 0.35)) decoL[i] = pools.pick(rDeco, ['deco']);
    }
  }

  // gameplay markers for special rooms
  const markerCells = new Set<number>();
  if (gameL) {
    for (const r of rooms) {
      if (r.type === 'normal' || r.type === 'start') continue;
      const i = r.centerY * W + r.centerX;
      let gid = 0;
      if (r.type === 'end') gid = pools.pick(rTiles, ['stairs', 'transition']);
      if (!gid) gid = pools.pickTagged(rTiles, 'special', r.type);
      if (!gid) gid = pools.pickTagged(rTiles, 'special', 'marker');
      if (gid) {
        gameL[i] = gid;
        markerCells.add(i);
        if (decoL) decoL[i] = 0;
      }
    }
  }
  if (spawnL) {
    for (const sp of spawnPoints) {
      const i = sp.y * W + sp.x;
      let gid = pools.pickTagged(rTiles, 'spawn', sp.type);
      if (!gid) gid = pools.pick(rTiles, ['spawn']);
      if (gid) spawnL[i] = gid;
      if (decoL) decoL[i] = 0;
    }
  }
  void markerCells;

  const result: GenerationResult = {
    seed: s.seed,
    width: W,
    height: H,
    rooms,
    connections,
    doors,
    deadEnds,
    spawnPoints,
    cells: grid.cells,
    wallMask,
    floorMask: auto.floorMask,
    perspective,
    warnings,
  };
  return { result, layerData };
}

function isInterior(g: Grid, x: number, y: number, r: number): boolean {
  for (let oy = -r; oy <= r; oy++)
    for (let ox = -r; ox <= r; ox++) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= g.W || ny >= g.H) return false;
      if (g.cells[ny * g.W + nx] !== CELL_ROOM) return false;
    }
  return true;
}

function findDoors(g: Grid): Door[] {
  const { W, H } = g;
  const mouth = new Int16Array(W * H).fill(-1);
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (g.cells[i] !== CELL_CORRIDOR) continue;
      for (const j of [i - 1, i + 1, i - W, i + W])
        if (g.cells[j] === CELL_ROOM) {
          mouth[i] = g.roomId[j];
          break;
        }
    }
  const seen = new Uint8Array(W * H);
  const doors: Door[] = [];
  for (let i = 0; i < W * H; i++) {
    if (mouth[i] < 0 || seen[i]) continue;
    const rid = mouth[i];
    const comp: number[] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      comp.push(c);
      for (const j of [c - 1, c + 1, c - W, c + W])
        if (j >= 0 && j < W * H && !seen[j] && mouth[j] === rid) {
          seen[j] = 1;
          stack.push(j);
        }
    }
    if (comp.length > 3) continue;
    // a door needs solid (non-floor) cells on both sides of the opening
    const xs = comp.map((c) => c % W);
    const ys = comp.map((c) => (c / W) | 0);
    const horizontal = new Set(ys).size === 1;
    const vertical = new Set(xs).size === 1;
    if (!horizontal && !vertical) continue;
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const solid = (x: number, y: number) => g.cells[y * W + x] === CELL_VOID || g.cells[y * W + x] === CELL_WALL;
    const ok = horizontal
      ? solid(minX - 1, minY) && solid(maxX + 1, minY)
      : solid(minX, minY - 1) && solid(minX, maxY + 1);
    if (!ok) continue;
    for (const c of comp) doors.push({ x: c % W, y: (c / W) | 0, roomId: rid });
  }
  return doors;
}

function makePool(
  g: Grid,
  r: PlacedRoom,
  rng: Rng,
  intensity: number,
  out: Map<number, TileCategory>,
  cat: TileCategory,
): boolean {
  const cands: number[] = [];
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      if (Math.abs(x - r.cx) <= 1 && Math.abs(y - r.cy) <= 1) continue;
      if (isInterior(g, x, y, 2)) cands.push(y * g.W + x);
    }
  if (cands.length < 4) return false;
  const size = rng.int(3, 4 + Math.round(intensity / 12));
  const pool = [rng.pick(cands)];
  const candSet = new Set(cands);
  const inPool = new Set(pool);
  for (let k = 0; k < size * 4 && pool.length < size; k++) {
    const c = rng.pick(pool);
    const j = c + rng.pick([1, -1, g.W, -g.W]);
    if (candSet.has(j) && !inPool.has(j)) {
      pool.push(j);
      inPool.add(j);
    }
  }
  for (const c of pool) {
    g.cells[c] = CELL_HAZARD;
    out.set(c, cat);
  }
  return true;
}

function spawnCell(g: Grid, room: Room, objects: Map<number, TileCategory>): [number, number] {
  const { W } = g;
  // one cell left/right of the centre so it does not overlap gameplay markers
  for (const [ox, oy] of [
    [-1, 0],
    [1, 0],
    [0, 1],
    [0, -1],
    [0, 0],
  ]) {
    const x = room.centerX + ox;
    const y = room.centerY + oy;
    const i = y * W + x;
    if (g.cells[i] === CELL_ROOM && !objects.has(i)) return [x, y];
  }
  return [room.centerX, room.centerY];
}
