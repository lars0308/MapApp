import {
  CELL_CORRIDOR,
  CELL_ROOM,
  CELL_VOID,
  CELL_WALL,
  T_ABYSS,
  T_BRIDGE,
  T_CLIFF,
  T_LAVA,
  T_NONE,
  T_PLATEAU,
  T_STAIRS,
  T_TRANSITION,
  T_WATER,
  type Connection,
  type Door,
  type GenerationResult,
  type GeneratorSettings,
  type Layer,
  type LayerRole,
  type MapObject,
  type MapSettings,
  type Perspective,
  type Room,
  type SpawnPoint,
  type SpawnType,
  type SpecialRoomType,
  type TerrainSet,
  type TileRole,
  type Tileset,
} from '../types';
import { Rng, weightedIndex } from './rng';
import { placeRooms } from './rooms';
import { buildGraph } from './graph';
import { carveBranches, carveCorridors, computeNearRoom, type Grid } from './corridors';
import { assignSpecialRooms } from './specials';
import { TilePools } from '../tilesets/tilePools';
import { NO_ROLE, frontTilePrefs, resolveWalls, roleAt, wallNeighbourMask } from './autotile';
import { PERSPECTIVE_INFO, requiredRooms } from './perspective';
import { createTerrainState, placeTerrain, placeTransitions } from './terrain';
import { placeObjects, type ObjectContext } from './objectsGen';
import { OBJECT_DEFS } from '../objects/defs';
import { isWalkable } from './nav';

export interface GenerateInput {
  settings: GeneratorSettings;
  map: MapSettings;
  tilesets: Tileset[];
  layers: Pick<Layer, 'id' | 'role'>[];
  terrains?: TerrainSet[];
}

export interface GenerateOutput {
  result: GenerationResult;
  /** new data for generator-owned layers (by layer id) */
  layerData: Record<string, Uint32Array>;
  objects: MapObject[];
  /** set when tiles for the perspective were missing and fallbacks were used */
  tileNotice: string | null;
}

const LIQUID_ROLE: Record<number, TileRole> = { [T_WATER]: 'water', [T_LAVA]: 'lava', [T_ABYSS]: 'abyss' };

/** Empty structure for the manual build mode: everything void, no rooms yet. */
export function emptyResult(W: number, H: number, seed: string, perspective: Perspective): GenerationResult {
  const n = W * H;
  return {
    seed,
    width: W,
    height: H,
    rooms: [],
    connections: [],
    doors: [],
    deadEnds: 0,
    spawnPoints: [],
    cells: new Uint8Array(n),
    wallMask: new Uint8Array(n),
    floorMask: new Uint8Array(n),
    terrain: new Uint8Array(n),
    heights: new Uint8Array(n),
    perspective,
    warnings: [],
  };
}

export function generate(input: GenerateInput): GenerateOutput {
  const { settings: s, map } = input;
  const W = Math.max(16, map.width);
  const H = Math.max(16, map.height);
  const perspective = map.perspective ?? 'top_down';
  const root = Rng.fromString(s.seed);
  const rRooms = root.fork(11);
  const rGraph = root.fork(23);
  const rCorr = root.fork(37);
  const rBranch = root.fork(41);
  const rSpecial = root.fork(53);
  const rTiles = root.fork(67);
  const rDeco = root.fork(79);
  const rTerrain = root.fork(83);
  const rObjects = root.fork(97);
  const rRoomTerrain = root.fork(101);
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

  // special rooms (start is needed to validate terrain reachability)
  const specials = assignSpecialRooms(placed, edges, s, rSpecial);
  const missingSpecials = requiredRooms(s.specials) - specials.size;
  if (missingSpecials > 0) warnings.push(`${missingSpecials} Spezialraum/-räume ohne freien Raum – Raumanzahl erhöhen.`);
  const startRoom = [...specials.entries()].find(([, t]) => t === 'start')?.[0] ?? 0;

  // room terrains (reusable terrain sets, weighted)
  const terrainSets = (input.terrains ?? []).filter((t) => t.active);
  const corridorTerrain = terrainSets[0]?.id ?? 'terrain_stone';
  const roomTerrain = placed.map(() => {
    if (!terrainSets.length) return corridorTerrain;
    return terrainSets[weightedIndex(rRoomTerrain, terrainSets.map((t) => t.weight))]?.id ?? corridorTerrain;
  });
  const terrainTag = (id: string) => input.terrains?.find((t) => t.id === id)?.tag ?? 'stone';

  // terrain: crossings with bridges, plateaus with cliffs, pools (validated)
  const ts = createTerrainState(W, H);
  const terrainResult = placeTerrain(grid, ts, placed, corridors, s.terrain, perspective, startRoom, rTerrain);
  if (s.terrain.transitions.enabled) placeTransitions(grid, ts, roomTerrain, corridorTerrain, s.terrain.transitions.amount, rTerrain);
  warnings.push(...ts.warnings);

  // 11: walls + auto-tile roles (fronts/caps in 3/4 views), shadow + floor masks
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (grid.cells[i] !== CELL_VOID) continue;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const xx = x + ox;
          const yy = y + oy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const c = grid.cells[yy * W + xx];
          if (c !== CELL_VOID && c !== CELL_WALL) grid.cells[i] = CELL_WALL;
        }
    }
  const walls = resolveWalls(grid, perspective, map.shadows ?? false);
  const wallMask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (grid.cells[i] === CELL_WALL) wallMask[i] = wallNeighbourMask(grid, i % W, (i / W) | 0);

  // 12: doors where corridors meet rooms (narrow openings only) + door frames
  const doors = findDoors(grid).filter((d) => {
    const t = ts.terrain[d.y * W + d.x];
    return t === T_NONE || t === T_TRANSITION;
  });
  const doorSet = new Set(doors.map((d) => d.y * W + d.x));

  const pools = new TilePools(input.tilesets, perspective);
  if (!pools.has('floor')) warnings.push('Keine aktive Kachel der Kategorie „Boden“ – Boden-Layer bleibt leer.');

  // objects (validated so that no path is blocked)
  const reserved = new Set<number>(ts.reserved);
  for (const d of doors) for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) reserved.add((d.y + oy) * W + d.x + ox);
  const octx: ObjectContext = { g: grid, terrain: ts.terrain, reserved, occupied: new Uint8Array(W * H) };
  const objects = placeObjects(octx, placed, (id) => specials.get(id) ?? 'normal', s, rObjects);

  // small obstacles (single tiles) in room interiors
  const obstacles = new Set<number>();
  if (s.obstacleDensity > 0 && pools.has('obstacle')) {
    const p = (s.obstacleDensity / 100) * 0.07;
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (grid.cells[i] !== CELL_ROOM || ts.terrain[i] !== T_NONE || reserved.has(i) || octx.occupied[i] || !isInterior(grid, ts.terrain, x, y, 1)) continue;
        let blocked = false;
        for (let oy = -1; oy <= 1 && !blocked; oy++) for (let ox = -1; ox <= 1; ox++) if (obstacles.has((y + oy) * W + x + ox)) blocked = true;
        if (!blocked && rDeco.chance(p)) obstacles.add(i);
      }
  }

  // rooms & connections for the data model
  const roomDoors = new Map<number, { x: number; y: number }[]>();
  for (const d of doors) {
    const list = roomDoors.get(d.roomId) ?? [];
    list.push({ x: d.x, y: d.y });
    roomDoors.set(d.roomId, list);
  }
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
      terrain: roomTerrain[r.id],
      doors: roomDoors.get(r.id) ?? [],
    };
  });
  const connections: Connection[] = corridors.map((c, i) => ({
    id: i,
    from: c.a,
    to: c.b,
    kind: c.kind,
    width: c.width,
    length: c.length,
    path: c.path,
    door: doors.some((d) => (d.roomId === c.a || d.roomId === c.b) && c.path.some(([x, y]) => Math.abs(x - d.x) + Math.abs(y - d.y) <= c.width)),
    bridge: ts.bridgedConnections.has(i) || c.path.some(([x, y]) => ts.terrain[y * W + x] === T_BRIDGE),
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
  const free = (i: number) => isWalkable(grid.cells, ts.terrain, i) && !octx.occupied[i] && !obstacles.has(i);
  for (const [roomType, spawnType] of spawnFor) {
    const room = rooms.find((r) => r.type === roomType);
    if (!room) continue;
    const [sx, sy] = spawnCell(W, room, free);
    spawnPoints.push({ id: `${spawnType}_${room.id}`, type: spawnType, x: sx, y: sy, roomId: room.id, properties: roomType === 'boss' ? { boss: true } : {} });
  }

  // 14: paint layers
  const byRole = new Map<LayerRole, Uint32Array>();
  const layerData: Record<string, Uint32Array> = {};
  for (const l of input.layers) {
    if (l.role === 'custom' || byRole.has(l.role)) continue;
    const arr = new Uint32Array(W * H);
    byRole.set(l.role, arr);
    layerData[l.id] = arr;
  }
  const L = (r: LayerRole) => byRole.get(r);
  const floorL = L('floor');
  const detailL = L('groundDetails') ?? L('floor');
  const pathL = L('paths');
  const shadowL = L('shadow');
  const wallL = L('walls');
  const frontL = L('wallsFront') ?? L('walls');
  const objL = L('objects');
  const decoL = L('deco');
  const colL = L('collision');
  const gameL = L('gameplay');
  const spawnL = L('spawn');

  const variation = s.floorVariation / 100;
  const collisionGid = pools.pickTagged(rTiles, 'special', 'collision');
  const block = (i: number) => {
    if (colL && collisionGid) colL[i] = collisionGid;
  };
  const tagAt = (i: number) => {
    const rid = grid.roomId[i];
    return terrainTag(rid >= 0 ? roomTerrain[rid] : corridorTerrain);
  };
  const walk = (i: number) => grid.cells[i] !== CELL_VOID && grid.cells[i] !== CELL_WALL;
  const floorTile = (i: number) => {
    if (pools.has('floorVariant') && rTiles.chance(variation)) return pools.pick(rTiles, ['floorVariant', 'floor']);
    // edge-aware floor when the tileset provides edge roles
    const edge: TileRole | null = !walk(i - W) ? 'floor_edge_top' : !walk(i + W) ? 'floor_edge_bottom' : !walk(i - 1) ? 'floor_edge_left' : !walk(i + 1) ? 'floor_edge_right' : null;
    if (edge && pools.hasRole(edge)) return pools.pickRole(rTiles, edge, [tagAt(i)]);
    return pools.pickPref(rTiles, ['floor'], tagAt(i));
  };
  const liquidTile = (i: number, type: number) => {
    if (type === T_ABYSS && pools.hasRole('abyss_edge')) {
      const above = i - W;
      const aboveT = ts.terrain[above] === T_BRIDGE ? ts.bridges.get(above)?.under : ts.terrain[above];
      if (aboveT !== T_ABYSS) return pools.pickRole(rTiles, 'abyss_edge');
    }
    return pools.pickRole(rTiles, LIQUID_ROLE[type] ?? 'abyss');
  };

  // ground, paths, bridges, liquids, shadows
  for (let i = 0; i < W * H; i++) {
    const c = grid.cells[i];
    if (c === CELL_VOID || c === CELL_WALL) continue;
    const t = ts.terrain[i];
    if (floorL) {
      if (t === T_WATER || t === T_LAVA || t === T_ABYSS) floorL[i] = liquidTile(i, t);
      else if (t === T_BRIDGE) floorL[i] = liquidTile(i, ts.bridges.get(i)?.under ?? T_ABYSS);
      else if (ts.heights[i] > 0) floorL[i] = pools.pickRole(rTiles, 'raised_floor', [tagAt(i)]);
      else floorL[i] = floorTile(i);
    }
    if (t === T_WATER || t === T_LAVA || t === T_ABYSS) block(i);
    if (t === T_BRIDGE) {
      const b = ts.bridges.get(i)!;
      if (pathL) pathL[i] = pools.pickRole(rTiles, b.role, [b.orient]);
    } else if (c === CELL_CORRIDOR && pathL && t !== T_WATER && t !== T_LAVA && t !== T_ABYSS) pathL[i] = pools.pick(rTiles, ['path']);
    if (t === T_TRANSITION && detailL && pools.hasRole('transition')) detailL[i] = pools.pickRole(rTiles, 'transition');
    const sh = walls.shadows[i];
    if (sh && shadowL && t !== T_ABYSS) shadowL[i] = pools.pickRole(rTiles, 'shadow', [sh]);
  }

  // plateaus: rims (overlay), faces (y-sorted), stairs, cliff shadows
  for (const p of terrainResult.plateaus) {
    const faceBottom = p.y1 + p.faceRows;
    for (let y = p.y0; y <= faceBottom; y++)
      for (let x = p.x0; x <= p.x1; x++) {
        const i = y * W + x;
        let role: TileRole | null = null;
        let prefer: string[] | undefined;
        const onTop = y <= p.y1;
        if (ts.terrain[i] === T_STAIRS) {
          if (detailL) detailL[i] = pools.pickRole(rTiles, 'stairs');
          continue;
        }
        if (onTop) {
          const n = y === p.y0;
          const s2 = p.faceRows === 0 && y === p.y1;
          const w = x === p.x0;
          const e = x === p.x1;
          if (n && w) (role = 'cliff_outer_corner'), (prefer = ['left']);
          else if (n && e) (role = 'cliff_outer_corner'), (prefer = ['right']);
          else if (s2 && w) (role = 'cliff_inner_corner'), (prefer = ['left']);
          else if (s2 && e) (role = 'cliff_inner_corner'), (prefer = ['right']);
          else if (n) role = 'cliff_top';
          else if (s2) role = 'cliff_bottom';
          else if (w) role = 'cliff_left';
          else if (e) role = 'cliff_right';
          if (role && detailL) detailL[i] = pools.pickRole(rTiles, role, prefer);
        } else {
          role = p.faceRows === 2 && y === faceBottom ? 'cliff_bottom' : 'cliff_front';
          if (frontL) frontL[i] = pools.pickRole(rTiles, role);
        }
        if (ts.terrain[i] === T_CLIFF) block(i);
      }
    // shadow cast below the cliff
    if (shadowL)
      for (let x = p.x0; x <= p.x1; x++) {
        const i = (faceBottom + 1) * W + x;
        if (i < W * H && walk(i) && ts.terrain[i] !== T_STAIRS) shadowL[i] = pools.pickRole(rTiles, 'cliff_shadow', ['top']);
      }
  }

  // walls (back / front) + door frames
  const roleOverride = new Map<number, TileRole>();
  const doorOrient = new Map<number, string>();
  for (const d of doors) {
    const i = d.y * W + d.x;
    const horizontalWall = grid.cells[i - 1] === CELL_WALL || grid.cells[i + 1] === CELL_WALL || doorSet.has(i - 1) || doorSet.has(i + 1);
    const roomBelow = grid.cells[i + W] === CELL_ROOM;
    if (horizontalWall) {
      doorOrient.set(i, roomBelow && walls.front[i - 1] + walls.front[i + 1] > 0 ? 'front' : 'h');
      if (!doorSet.has(i - 1) && grid.cells[i - 1] === CELL_WALL) roleOverride.set(i - 1, 'door_frame_left');
      if (!doorSet.has(i + 1) && grid.cells[i + 1] === CELL_WALL) roleOverride.set(i + 1, 'door_frame_right');
    } else doorOrient.set(i, 'v');
  }
  for (let i = 0; i < W * H; i++) {
    if (grid.cells[i] !== CELL_WALL) continue;
    block(i);
    const override = roleOverride.get(i);
    const role = override ?? roleAt(walls.roles[i]);
    if (!role) continue;
    const isFront = walls.front[i] > 0;
    const layer = isFront ? frontL : wallL;
    if (!layer) continue;
    const fp = isFront && !override ? frontTilePrefs(grid.cells, W, i) : {};
    let gid = pools.pickRole(rTiles, role, override ? [isFront ? 'front' : 'top'] : fp.prefer, fp.avoid);
    // frames without matching tiles fall back to the plain wall role
    if (override && !pools.hasRole(override) && walls.roles[i] !== NO_ROLE) gid = pools.pickRole(rTiles, roleAt(walls.roles[i])!);
    layer[i] = gid;
  }

  if (objL) {
    for (const i of doorSet) objL[i] = pools.pickRole(rTiles, 'door', [doorOrient.get(i) ?? 'h']);
    for (const i of obstacles) {
      objL[i] = pools.pick(rTiles, ['obstacle']);
      block(i);
    }
  }
  for (const o of objects) for (const [dx, dy] of OBJECT_DEFS[o.type].collision) block((o.y + dy) * W + o.x + dx);

  if (decoL && s.decoDensity > 0 && pools.has('deco')) {
    const p = (s.decoDensity / 100) * 0.14;
    for (let i = 0; i < W * H; i++) {
      const c = grid.cells[i];
      if ((c !== CELL_ROOM && c !== CELL_CORRIDOR) || doorSet.has(i) || obstacles.has(i) || octx.occupied[i]) continue;
      if (ts.terrain[i] !== T_NONE && ts.terrain[i] !== T_PLATEAU) continue;
      if (rDeco.chance(c === CELL_ROOM ? p : p * 0.35)) decoL[i] = pools.pick(rDeco, ['deco']);
    }
  }

  // gameplay markers for special rooms
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

  const tileNotice = describeTileFallback(pools, PERSPECTIVE_INFO[perspective].label);
  if (tileNotice) warnings.push(tileNotice);

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
    floorMask: walls.floorMask,
    terrain: ts.terrain,
    heights: ts.heights,
    perspective,
    warnings,
  };
  return { result, layerData, objects, tileNotice };
}

/** Human readable note when roles had to be served by fallback tiles (or are missing). */
function describeTileFallback(pools: TilePools, label: string): string | null {
  const list = (set: Set<string>) => {
    const all = [...set].sort();
    return all.slice(0, 6).join(', ') + (all.length > 6 ? ` … (+${all.length - 6})` : '');
  };
  const parts: string[] = [];
  if (pools.noCompatible) parts.push(`Kein aktives Tileset ist für „${label}“ markiert – es werden vorhandene Tiles anderer Perspektiven bzw. die Demo-Tiles verwendet.`);
  else if (pools.fallbacks.size) parts.push(`Für „${label}“ fehlen Tile-Rollen (${list(pools.fallbacks)}) – ersatzweise aus anderen Tilesets bzw. Demo-Tiles.`);
  if (pools.missing.size) parts.push(`Keine Tiles für: ${list(pools.missing)}.`);
  return parts.length ? parts.join(' ') : null;
}

function isInterior(g: Grid, terrain: Uint8Array, x: number, y: number, r: number): boolean {
  for (let oy = -r; oy <= r; oy++)
    for (let ox = -r; ox <= r; ox++) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= g.W || ny >= g.H) return false;
      const i = ny * g.W + nx;
      if (g.cells[i] !== CELL_ROOM || terrain[i] !== T_NONE) return false;
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
    // a door needs solid wall cells on both sides of the opening
    const xs = comp.map((c) => c % W);
    const ys = comp.map((c) => (c / W) | 0);
    const horizontal = new Set(ys).size === 1;
    const vertical = new Set(xs).size === 1;
    if (!horizontal && !vertical) continue;
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const solid = (x: number, y: number) => g.cells[y * W + x] === CELL_WALL;
    const ok = horizontal ? solid(minX - 1, minY) && solid(maxX + 1, minY) : solid(minX, minY - 1) && solid(minX, maxY + 1);
    if (!ok) continue;
    for (const c of comp) doors.push({ x: c % W, y: (c / W) | 0, roomId: rid });
  }
  return doors;
}

function spawnCell(W: number, room: Room, free: (i: number) => boolean): [number, number] {
  for (const [ox, oy] of [
    [-1, 0],
    [1, 0],
    [0, 1],
    [0, -1],
    [0, 0],
    [-2, 0],
    [2, 0],
  ]) {
    const x = room.centerX + ox;
    const y = room.centerY + oy;
    if (free(y * W + x)) return [x, y];
  }
  return [room.centerX, room.centerY];
}

