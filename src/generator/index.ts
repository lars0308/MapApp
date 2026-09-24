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
import { carveBranches, carveCorridors, computeNearRoom, makeNoise, type Grid } from './corridors';
import { assignSpecialRooms } from './specials';
import { TilePools } from '../tilesets/tilePools';
import { NO_ROLE, frontTilePrefs, resolveWalls, roleAt, wallNeighbourMask } from './autotile';
import { PERSPECTIVE_INFO, requiredRooms } from './perspective';
import { createTerrainState, placeTerrain, placeTransitions } from './terrain';
import { canPlace, occupy, placeObjects, type ObjectContext } from './objectsGen';
import { objectDef } from '../objects/defs';
import { isWalkable } from './nav';
import { generateSide } from './side';
import { generateHex } from './hexgen';
import { cavify } from './cave';

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
  if (input.map.perspective === 'side_view') return generateSide(input);
  if (input.map.perspective === 'hex') return generateHex(input);
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
  // natural caves: the same layout, reshaped by a cellular automaton
  const cave = s.layout === 'cave';
  // outdoor / village: clearings and paths get natural edges too, the rest becomes forest
  const outdoor = s.layout === 'outdoor' || s.layout === 'village' || s.layout === 'island';
  if (cave || outdoor) {
    cavify(grid, placed, corridors.map((c) => c.path), s.caveRoughness ?? (outdoor ? 45 : 60), root.fork(127));
    computeNearRoom(grid);
  }

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
  // outdoors there are no bottomless pits – a black hole in a meadow looks broken
  const terrainSettings = outdoor ? { ...s.terrain, abyss: { ...s.terrain.abyss, enabled: false } } : s.terrain;
  const terrainResult = placeTerrain(grid, ts, placed, corridors, terrainSettings, perspective, startRoom, rTerrain);
  if (s.terrain.transitions.enabled) placeTransitions(grid, ts, roomTerrain, corridorTerrain, s.terrain.transitions.amount, rTerrain);
  warnings.push(...ts.warnings);

  // outdoor: no walls – everything outside the clearings and paths is forest (walkable ground,
  // blocked by the collision layer, covered with trees further down)
  const forest = new Uint8Array(outdoor ? W * H : 0);
  if (outdoor)
    for (let i = 0; i < W * H; i++)
      if (grid.cells[i] === CELL_VOID) {
        forest[i] = 1;
        grid.cells[i] = CELL_ROOM;
      }
  // island: the forest towards the map edge sinks into the sea (noisy coast), a strip of open
  // meadow stays between trees and beach; clearings and paths near the edge become islets / dams
  if (s.layout === 'island') {
    const land = makeNoise(W, H, root.fork(173), 9);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!forest[i]) continue;
        const d = Math.hypot(((x + 0.5) / W) * 2 - 1, ((y + 0.5) / H) * 2 - 1);
        if (1.15 - d + (land[i] - 0.5) * 0.7 < 0.5 || x < 2 || y < 2 || x >= W - 2 || y >= H - 2) {
          forest[i] = 0;
          ts.terrain[i] = T_WATER;
        }
      }
    const sea = (i: number) => ts.terrain[i] === T_WATER;
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (forest[i] && (sea(i - 1) || sea(i + 1) || sea(i - W) || sea(i + W) || sea(i - W - 1) || sea(i - W + 1) || sea(i + W - 1) || sea(i + W + 1))) forest[i] = 0;
      }
  }

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
  // caves have no doors (openings stay open)
  const doors = (cave || outdoor ? [] : findDoors(grid)).filter((d) => {
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
  // forest cells are no place for room objects
  if (outdoor) for (let i = 0; i < W * H; i++) if (forest[i]) octx.occupied[i] = 1;
  // village: houses at the clearings, a well in the start clearing
  const houses: MapObject[] = s.layout === 'village' ? placeHouses(octx, forest, placed, specials, W, root.fork(131)) : [];
  const objects = [...houses, ...placeObjects(octx, placed, (id) => specials.get(id) ?? 'normal', s, rObjects)];

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
    spawnPoints.push({ id: `${spawnType}_${room.id}`, type: spawnType, x: sx, y: sy, roomId: room.id, properties: roomType === 'boss' ? { boss: true, level: 5 } : {} });
  }
  // enemies and loot: more and stronger the further a room is from the start
  if (s.population && (s.population.enemies > 0 || s.population.loot > 0)) {
    const extra = populate(W, rooms, placed, grid, free, (i) => canPlace(octx, 'chest', i % W, (i / W) | 0), s.population, root.fork(113));
    for (const sp of extra.spawns) spawnPoints.push(sp);
    // loot stands in a chest (a real object with collision)
    for (const sp of extra.spawns)
      if (sp.type === 'loot' && canPlace(octx, 'chest', sp.x, sp.y)) {
        occupy(octx, 'chest', sp.x, sp.y);
        objects.push({ id: `chest_loot_${sp.id}`, type: 'chest', x: sp.x, y: sp.y });
      }
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
    if (outdoor) return 'grass';
    const rid = grid.roomId[i];
    return terrainTag(rid >= 0 ? roomTerrain[rid] : corridorTerrain);
  };
  const walk = (i: number) => grid.cells[i] !== CELL_VOID && grid.cells[i] !== CELL_WALL;
  const nearWall = (i: number) => !walk(i - W) || !walk(i + W) || !walk(i - 1) || !walk(i + 1);
  // wear and moss grow in patches (smooth noise), moss creeps out of the walls – no salt-and-pepper tiles
  const wear = makeNoise(W, H, root.fork(151), 5);
  const moss = makeNoise(W, H, root.fork(163), 4);
  const mossAt = (i: number) => moss[i] + (nearWall(i) ? 0.14 : 0) > 0.8 - variation * 0.35;
  const floorTile = (i: number) => {
    // outdoor: light meadow in the clearings, darker ground under the trees
    if (outdoor) return pools.pickRole(rTiles, 'floor_center', ['grass', 'summer', ...(forest[i] && rTiles.chance(0.5) ? ['dark'] : [])], forest[i] ? undefined : ['dark']);
    if (pools.has('floorVariant') && variation > 0 && mossAt(i)) return pools.pick(rTiles, ['floorVariant', 'floor']);
    // edge-aware floor when the tileset provides edge roles
    const edge: TileRole | null = !walk(i - W) ? 'floor_edge_top' : !walk(i + W) ? 'floor_edge_bottom' : !walk(i - 1) ? 'floor_edge_left' : !walk(i + 1) ? 'floor_edge_right' : null;
    if (edge && pools.hasRole(edge)) return pools.pickRole(rTiles, edge, [tagAt(i)]);
    // worn patches: cracked and dark slabs together; elsewhere clean floor with a rare crack
    if (wear[i] > 0.64 - variation * 0.1) return pools.pickPrefs(rTiles, ['floor'], [tagAt(i), rTiles.chance(0.6) ? 'broken' : 'dark']);
    return pools.pickPrefs(rTiles, ['floor'], [tagAt(i)], rTiles.chance(0.06) ? ['dark'] : ['dark', 'broken']);
  };
  // soft transitions (outdoor): corner-matched path / shore overlays when a tileset has them.
  // Path vertices touch at least two path cells (paths keep their width, ends and bends round off);
  // shore vertices lie between water cells only (the beach stays inside the blocked water cells).
  const waterCell = (i: number) => ts.terrain[i] === T_WATER || (ts.terrain[i] === T_BRIDGE && ts.bridges.get(i)?.under === T_WATER);
  const pathCell = (i: number) => grid.cells[i] === CELL_CORRIDOR && !waterCell(i) && ts.terrain[i] !== T_BRIDGE;
  const vertexMask = (x: number, y: number, on: (i: number) => boolean, all: boolean, min = 1) => {
    const vert = (vx: number, vy: number) => {
      let n = 0;
      let k = 0;
      for (const [cx, cy] of [[vx - 1, vy - 1], [vx, vy - 1], [vx - 1, vy], [vx, vy]]) {
        // outside the map counts like the cell itself (edges continue)
        const inside = cx >= 0 && cy >= 0 && cx < W && cy < H;
        if (!inside && !all) continue;
        k++;
        if (inside ? on(cy * W + cx) : on(y * W + x)) n++;
      }
      return all ? n === k : n >= min;
    };
    return (vert(x, y) ? 1 : 0) | (vert(x + 1, y) ? 2 : 0) | (vert(x + 1, y + 1) ? 4 : 0) | (vert(x, y + 1) ? 8 : 0);
  };
  const softPaths = outdoor && pools.hasRole('path_edge');
  const softShores = outdoor && pools.hasRole('shore');
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
    // tiny ponds (no vertex between water cells) get the full water tile
    const shore = softShores && waterCell(i) ? vertexMask(i % W, (i / W) | 0, waterCell, true) || 15 : 0;
    if (floorL && shore) {
      // meadow below, water with beach and foam on top
      floorL[i] = floorTile(i);
      const gid = pools.pickRole(rTiles, 'shore', [`c${shore}`]);
      if (detailL) detailL[i] = gid;
    } else if (floorL) {
      if (t === T_WATER || t === T_LAVA || t === T_ABYSS) floorL[i] = liquidTile(i, t);
      else if (t === T_BRIDGE) floorL[i] = liquidTile(i, ts.bridges.get(i)?.under ?? T_ABYSS);
      else if (ts.heights[i] > 0) floorL[i] = pools.pickRole(rTiles, 'raised_floor', [tagAt(i)]);
      else floorL[i] = floorTile(i);
    }
    if (t === T_WATER || t === T_LAVA || t === T_ABYSS) block(i);
    if (t === T_BRIDGE) {
      const b = ts.bridges.get(i)!;
      if (pathL) pathL[i] = pools.pickRole(rTiles, b.role, [b.orient]);
    } else if (c === CELL_CORRIDOR && pathL && !cave && !softPaths && t !== T_WATER && t !== T_LAVA && t !== T_ABYSS)
      // outdoor: dirt paths; dungeons: no dirt; caves: natural floor, no laid paths
      pathL[i] = outdoor ? pools.pickPref(rTiles, ['path'], 'dirt') : pools.pickPref(rTiles, ['path'], undefined, ['dirt']);
    if (t === T_TRANSITION && detailL && pools.hasRole('transition')) detailL[i] = pools.pickRole(rTiles, 'transition');
    if (softPaths && pathL && !waterCell(i) && t !== T_BRIDGE) {
      const m = vertexMask(i % W, (i / W) | 0, pathCell, false, 2);
      if (m) pathL[i] = pools.pickRole(rTiles, 'path_edge', [`c${m}`]);
    }
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
          if (role && detailL) detailL[i] = pools.pickRole(rTiles, role, outdoor ? [...(prefer ?? []), 'grass'] : prefer, outdoor ? ['face'] : ['face', 'grass']);
        } else {
          role = p.faceRows === 2 && y === faceBottom ? 'cliff_bottom' : 'cliff_front';
          if (frontL) frontL[i] = pools.pickRole(rTiles, role, outdoor ? ['grass', 'face'] : role === 'cliff_bottom' ? ['face'] : undefined, outdoor ? undefined : ['grass']);
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
  for (const o of objects) for (const [dx, dy] of objectDef(o.type)?.collision ?? []) block((o.y + dy) * W + o.x + dx);
  if (outdoor) {
    // forest: impassable, densely covered with trees (a little jitter so it looks grown)
    const rForest = root.fork(137);
    const taken = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) if (forest[i]) block(i);
    for (let y = 2; y < H + 1; y += 2)
      for (let x = -1; x < W; x += 2) {
        const tx = x + (rForest.chance(0.4) ? 1 : 0);
        const ty = Math.min(H - 1, y + (rForest.chance(0.3) ? 1 : 0));
        let fits = true;
        for (let yy = ty - 1; yy <= ty && fits; yy++)
          for (let xx = tx; xx < tx + 2 && fits; xx++) {
            if (xx < 0 || xx >= W) continue;
            const i = yy * W + xx;
            if (!forest[i] || taken[i]) fits = false;
          }
        if (!fits || tx < 0 || tx + 1 >= W || rForest.chance(0.04)) continue;
        for (let yy = ty - 1; yy <= ty; yy++) for (let xx = tx; xx < tx + 2; xx++) if (xx >= 0 && xx < W) taken[yy * W + xx] = 1;
        objects.push({ id: `forest_${objects.length}`, type: 'tree', x: tx, y: ty });
      }
  }

  if (decoL && s.decoDensity > 0 && pools.has('deco')) {
    const p = (s.decoDensity / 100) * 0.14;
    for (let i = 0; i < W * H; i++) {
      const c = grid.cells[i];
      if ((c !== CELL_ROOM && c !== CELL_CORRIDOR) || doorSet.has(i) || obstacles.has(i) || octx.occupied[i]) continue;
      if (ts.terrain[i] !== T_NONE && ts.terrain[i] !== T_PLATEAU) continue;
      // outdoor: only deco meant for outside (tag grass), no bones in the meadow
      if (outdoor) {
        // bushes gather where the forest begins, reeds at the water, stones and flowers on the meadow
        const x = i % W;
        const y = (i / W) | 0;
        let woods = false;
        let wet = false;
        for (const j of [i - 1, i + 1, i - W, i + W]) {
          if (j < 0 || j >= W * H || (j === i - 1 && x === 0) || (j === i + 1 && x === W - 1)) continue;
          if (forest[j]) woods = true;
          if (waterCell(j)) wet = true;
        }
        if (y === 0 || y === H - 1) woods = false;
        const chance = c === CELL_CORRIDOR ? p * 0.2 : woods ? p * 2.4 : wet ? p * 1.6 : p * 0.7;
        if (!rDeco.chance(chance)) continue;
        if (decoL[i - 1] || decoL[i - W]) continue;
        decoL[i] = pools.pickPrefs(rDeco, ['deco'], ['grass', woods ? 'bush' : wet ? 'reeds' : '']);
        continue;
      }
      // dungeons: deco gathers along the walls and in corners, room centres and corridors stay mostly free
      const near = nearWall(i);
      const corner = near && (!walk(i - W) || !walk(i + W)) && (!walk(i - 1) || !walk(i + 1));
      const chance = c === CELL_CORRIDOR ? p * 0.25 : corner ? p * 2.6 : near ? p * 1.6 : p * 0.35;
      if (!rDeco.chance(chance)) continue;
      // no clutter: never right next to other deco
      if (decoL[i - 1] || decoL[i - W] || decoL[i - W - 1] || decoL[i - W + 1]) continue;
      // candles / lights only against a wall, moss where the floor is mossy
      decoL[i] = pools.pickPref(rDeco, ['deco'], mossAt(i) ? 'moss' : undefined, near ? ['grass'] : ['light', 'grass']);
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


/** hops through the room graph from the start room (unreachable = the largest distance) */
function roomDistances(rooms: Room[]): Map<number, number> {
  const d = new Map<number, number>();
  const start = rooms.find((r) => r.isStart) ?? rooms[0];
  if (!start) return d;
  d.set(start.id, 0);
  const queue = [start.id];
  while (queue.length) {
    const id = queue.shift()!;
    const r = rooms.find((x) => x.id === id);
    for (const n of r?.connections ?? []) if (!d.has(n)) (d.set(n, d.get(id)! + 1), queue.push(n));
  }
  const max = Math.max(1, ...d.values());
  for (const r of rooms) if (!d.has(r.id)) d.set(r.id, max);
  return d;
}

/**
 * Enemy and loot spawn points. Rooms far from the start get more and stronger enemies and
 * better loot; the start room stays safe, the boss gets guards, treasure rooms and dead ends
 * (rooms with one door) hold the chests.
 */
function populate(
  W: number,
  rooms: Room[],
  placed: { id: number; x: number; y: number; w: number; h: number }[],
  grid: Grid,
  free: (i: number) => boolean,
  /** a chest fits here (free ring, no doorway) */
  chestOk: (i: number) => boolean,
  pop: { enemies: number; loot: number },
  rng: Rng,
): { spawns: SpawnPoint[] } {
  const spawns: SpawnPoint[] = [];
  const dist = roomDistances(rooms);
  const maxD = Math.max(1, ...dist.values());
  const taken = new Set<number>();
  const near = (i: number) => {
    for (const t of taken) if (Math.abs((t % W) - (i % W)) <= 1 && Math.abs(((t / W) | 0) - ((i / W) | 0)) <= 1) return true;
    return false;
  };
  const cellsOf = (id: number) => {
    const p = placed.find((q) => q.id === id);
    const out: number[] = [];
    if (!p) return out;
    // keep a ring of 1 to the walls: enemies do not start inside doorways
    for (let y = p.y + 1; y < p.y + p.h - 1; y++)
      for (let x = p.x + 1; x < p.x + p.w - 1; x++) {
        const i = y * W + x;
        if (grid.roomId[i] === id && free(i)) out.push(i);
      }
    return out;
  };
  const put = (room: Room, type: 'enemy' | 'loot', props: Record<string, string | number | boolean>) => {
    const cells = cellsOf(room.id).filter((i) => !taken.has(i) && !near(i) && (type !== 'loot' || chestOk(i)));
    if (!cells.length) return false;
    const i = cells[rng.int(0, cells.length - 1)];
    taken.add(i);
    spawns.push({ id: `${type}_${room.id}_${spawns.length}`, type, x: i % W, y: (i / W) | 0, roomId: room.id, properties: props });
    return true;
  };
  for (const r of rooms) {
    if (r.isStart || r.type === 'merchant') continue;
    const t = (dist.get(r.id) ?? 0) / maxD; // 0 near the start … 1 farthest away
    const level = 1 + Math.round(t * 4);
    // enemies: per ~40 floor cells at 100 %, twice as many far away
    if (pop.enemies > 0) {
      const want = (r.area / 40) * (pop.enemies / 100) * (0.5 + t);
      let n = Math.floor(want + rng.next());
      if (r.isBoss) n = Math.max(n, 2);
      for (let k = 0; k < Math.min(n, 8); k++) put(r, 'enemy', { level, kind: rng.chance(0.25) ? 'ranged' : 'melee', ...(r.isBoss ? { guard: true } : {}) });
    }
    // loot: treasure rooms and dead ends, sometimes elsewhere
    if (pop.loot > 0) {
      const tier = 1 + Math.round(t * 2);
      const dead = r.connections.length === 1 && !r.isEnd;
      const chests = r.type === 'treasure' ? 2 : dead ? (rng.chance(Math.min(1, (pop.loot / 100) * (0.6 + t))) ? 1 : 0) : rng.chance((pop.loot / 100) * 0.18 * (0.5 + t)) ? 1 : 0;
      for (let k = 0; k < chests; k++) put(r, 'loot', { tier });
    }
  }
  return { spawns };
}

/** village houses: along the upper part of each clearing, doors facing the open ground */
function placeHouses(c: ObjectContext, forest: Uint8Array, rooms: { id: number; x: number; y: number; w: number; h: number; cx: number; cy: number; area: number }[], specials: Map<number, string>, W: number, rng: Rng): MapObject[] {
  const out: MapObject[] = [];
  // like canPlace, but paths (reserved cells) may run right past a house – only the footprint
  // itself must be free, the ring around it only needs to stay open ground
  const { g } = c;
  const inside = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < g.W && yy < g.H;
  // forest may be cleared around a house (roof row and ring), the front row stays open ground
  const fits = (type: 'house' | 'well', x: number, y: number) => {
    const def = objectDef(type)!;
    for (let yy = y - def.h; yy <= y + 1; yy++)
      for (let xx = x - 1; xx <= x + def.w; xx++) {
        if (!inside(xx, yy)) return false;
        const i = yy * g.W + xx;
        const foot = yy > y - def.h && yy <= y && xx >= x && xx < x + def.w;
        const t = c.terrain[i];
        if (t !== T_NONE && t !== T_TRANSITION) return false;
        const clearable = forest[i] && yy <= y - def.h + 1 && xx > 0 && yy > 0 && xx < g.W - 1;
        if (clearable) continue;
        if (c.occupied[i]) return false;
        if (foot ? g.cells[i] !== CELL_ROOM || c.reserved.has(i) : g.cells[i] !== CELL_ROOM && g.cells[i] !== CELL_CORRIDOR) return false;
      }
    return true;
  };
  const bounds = new Map<number, [number, number, number, number]>();
  for (let i = 0; i < g.W * g.H; i++) {
    const id = g.roomId[i];
    if (id < 0) continue;
    const x = i % g.W;
    const y = (i / g.W) | 0;
    const b = bounds.get(id);
    if (!b) bounds.set(id, [x, y, x, y]);
    else (b[0] = Math.min(b[0], x)), (b[1] = Math.min(b[1], y)), (b[2] = Math.max(b[2], x)), (b[3] = Math.max(b[3], y));
  }
  const add = (type: 'house' | 'well', x: number, y: number) => {
    if (!fits(type, x, y)) return false;
    const def = objectDef(type)!;
    for (let yy = y - def.h; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + def.w; xx++) forest[yy * g.W + xx] = 0;
    occupy(c, type, x, y);
    out.push({ id: `${type}_${out.length}`, type, x, y });
    return true;
  };
  for (const r of rooms) {
    const type = specials.get(r.id) ?? 'normal';
    if (type === 'start') {
      for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [2, 2]]) if (add('well', r.cx + dx, r.cy + dy)) break;
      continue;
    }
    const want = Math.max(1, Math.min(4, Math.round(r.area / 70)));
    // every spot in the clearing that fits, the back half first (the square in front stays open)
    // (the clearing grew beyond its rectangle – search its real extent)
    const spots: [number, number, number][] = [];
    const [x0, y0, x1, y1] = bounds.get(r.id) ?? [r.x, r.y, r.x + r.w - 1, r.y + r.h - 1];
    for (let y = y0 + 2; y <= y1; y++)
      for (let x = x0; x <= x1 - 2; x++) if (fits('house', x, y)) spots.push([x, y, (y > r.cy ? 1 : 0) + rng.next()]);
    spots.sort((a, b) => a[2] - b[2]);
    let made = 0;
    for (const [x, y] of spots) {
      if (made >= want) break;
      if (add('house', x, y)) made++;
    }
  }
  void W;
  return out;
}
