import { CELL_CORRIDOR, CELL_HAZARD, CELL_ROOM, CELL_VOID, CELL_WALL, type TileRole } from '../types';
import { tileOf } from '../tilesets/gid';
import { useProject } from '../store/projectStore';
import { TilePools } from '../tilesets/tilePools';
import { frontTilePrefs, resolveWalls, roleAt } from '../generator/autotile';
import { Rng, hashSeed } from '../generator/rng';
import { groundRole } from '../generator/side';
import { hexNeighbor } from '../generator/hex';
import { metaTable } from './collision';

// Keeps walls consistent while editing by hand ("Auto-Wände"):
//  - painting ground on void/wall turns the cell walkable (room / corridor extended)
//  - erasing ground turns the cell into void
//  - placing a door tile on a wall opens it
// Afterwards all walls are re-classified and the wall / front / collision / shadow
// layers are rewritten around the edited area – inside the running stroke, so a
// single undo reverts paint + wall update together.

export function applyAutoWalls(changed: number[], paintedLayerId: string) {
  const store = useProject.getState();
  const p = store.project;
  if (p.map.perspective === 'side_view') {
    applyAutoGround(changed, paintedLayerId);
    return;
  }
  if (p.map.perspective === 'hex') {
    applyAutoHex(changed, paintedLayerId);
    return;
  }
  const r = p.result;
  if (!r || !changed.length || r.width !== p.map.width || r.height !== p.map.height) return;
  const W = p.map.width;
  const H = p.map.height;
  const metas = metaTable(p);
  const layerByRole = (role: string) => p.layers.find((l) => l.role === role);
  const floorL = layerByRole('floor');
  const objL = layerByRole('objects');
  const painted = p.layers.find((l) => l.id === paintedLayerId);
  if (!painted) return;
  const isDoor = (g: number) => {
    const m = metas[tileOf(g)];
    return !!m && (m.role === 'door' || m.category === 'door');
  };

  // structure before this edit (strokeStruct changes r.cells in place)
  const before = r.cells.slice();
  // 1. structural changes
  //  - a walkable tile (floor, path, bridge, stairs) painted on any ground / wall layer opens the cell
  //  - erasing on the floor or path layer closes it again once no walkable tile is left
  const pathL = layerByRole('paths');
  const WALKABLE = new Set(['floor', 'floorVariant', 'path', 'bridge', 'stairs', 'transition']);
  const isWalkable = (g: number) => {
    const m = metas[tileOf(g)];
    if (!m) return false;
    if (m.role) return m.role.startsWith('floor') || m.role.startsWith('bridge') || m.role === 'raised_floor' || m.role === 'transition' || m.role === 'stairs';
    return !!m.category && WALKABLE.has(m.category);
  };
  const onWallLayer = painted.role === 'walls' || painted.role === 'wallsFront';
  let touched = false;
  for (const i of changed) {
    const g = painted.data[i];
    const opens = g && (painted.role === 'floor' || painted.role === 'paths' || painted.role === 'groundDetails' || (onWallLayer && isWalkable(g)));
    if (opens && (r.cells[i] === CELL_VOID || r.cells[i] === CELL_WALL)) {
      store.strokeStruct(i, CELL_CORRIDOR);
      touched = true;
      // floor painted onto a wall layer moves to the floor layer (the wall there is removed below)
      if (onWallLayer && floorL) store.strokeSetLayer(floorL.id, [i], g);
      // a path needs ground below it
      if (painted.role === 'paths' && floorL && !floorL.data[i]) {
        const pools = new TilePools(p.tilesets, p.map.perspective);
        store.strokeSetLayer(floorL.id, [i], pools.pickPref(new Rng(hashSeed(`${r.seed}:${i}`)), ['floor']));
      }
    } else if (!g && (painted.role === 'floor' || painted.role === 'paths') && (r.cells[i] === CELL_ROOM || r.cells[i] === CELL_CORRIDOR || r.cells[i] === CELL_HAZARD)) {
      const rest = painted.role === 'floor' ? pathL?.data[i] : floorL?.data[i];
      if (!rest) (store.strokeStruct(i, CELL_VOID), (touched = true));
    } else if (g && isDoor(g) && r.cells[i] === CELL_WALL) {
      store.strokeStruct(i, CELL_CORRIDOR);
      touched = true;
      if (floorL && !floorL.data[i]) {
        const pools = new TilePools(p.tilesets, p.map.perspective);
        store.strokeSetLayer(floorL.id, [i], pools.pickPref(new Rng(hashSeed(`${r.seed}:${i}`)), ['floor']));
      }
    }
  }
  if (!touched) return;

  // 2. rebuild the wall ring on a copy and resolve roles
  const cells = r.cells.slice();
  for (let i = 0; i < cells.length; i++) if (cells[i] === CELL_WALL) cells[i] = CELL_VOID;
  const walk = (c: number) => c !== CELL_VOID && c !== CELL_WALL;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (cells[i] !== CELL_VOID) continue;
      outer: for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const xx = x + ox;
          const yy = y + oy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && walk(cells[yy * W + xx])) {
            cells[i] = CELL_WALL;
            break outer;
          }
        }
    }
  const grid = { W, H, cells, roomId: new Int16Array(W * H), nearRoom: new Int16Array(W * H) };
  const walls = resolveWalls(grid, p.map.perspective, p.map.shadows);

  // 3. rewrite the affected region (edited cells ± 4)
  let x0 = W,
    y0 = H,
    x1 = 0,
    y1 = 0;
  for (const i of changed) {
    x0 = Math.min(x0, i % W);
    x1 = Math.max(x1, i % W);
    y0 = Math.min(y0, (i / W) | 0);
    y1 = Math.max(y1, (i / W) | 0);
  }
  x0 = Math.max(0, x0 - 4);
  y0 = Math.max(0, y0 - 4);
  x1 = Math.min(W - 1, x1 + 4);
  y1 = Math.min(H - 1, y1 + 4);

  const pools = new TilePools(p.tilesets, p.map.perspective);
  const wallL = layerByRole('walls');
  const frontL = layerByRole('wallsFront') ?? wallL;
  const colL = layerByRole('collision');
  const shadowL = layerByRole('shadow');
  const collisionGid = pools.pickTagged(new Rng(1), 'special', 'collision');
  const doorAt = (i: number) => !!objL && isDoor(objL.data[i]);

  const wallCells: number[] = [];
  const wallGids: number[] = [];
  const frontGids: number[] = [];
  const colGids: number[] = [];
  const shadowCells: number[] = [];
  const shadowGids: number[] = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      const rng = new Rng(hashSeed(`${r.seed}:${i}`));
      const wasWall = before[i] === CELL_WALL;
      if (cells[i] !== r.cells[i] && (cells[i] === CELL_WALL || r.cells[i] === CELL_WALL || cells[i] === CELL_VOID)) store.strokeStruct(i, cells[i]);
      let back = 0;
      let front = 0;
      if (cells[i] === CELL_WALL) {
        let role: TileRole | null = roleAt(walls.roles[i]);
        // door frames next to doors in horizontal walls
        if (doorAt(i + 1) && cells[i - 1] === CELL_WALL) role = 'door_frame_left';
        else if (doorAt(i - 1) && cells[i + 1] === CELL_WALL) role = 'door_frame_right';
        const isFront = walls.front[i] > 0;
        const fp = isFront && !role?.startsWith('door_frame') ? frontTilePrefs(cells, W, i) : {};
        let gid = role ? pools.pickRole(rng, role, role.startsWith('door_frame') ? [isFront ? 'front' : 'top'] : fp.prefer, fp.avoid) : 0;
        if (role?.startsWith('door_frame') && !pools.hasRole(role)) gid = pools.pickRole(rng, roleAt(walls.roles[i])!);
        if (isFront) front = gid;
        else back = gid;
      }
      wallCells.push(i);
      wallGids.push(back);
      frontGids.push(front);
      colGids.push(cells[i] === CELL_WALL ? collisionGid : colL && wasWall ? 0 : (colL?.data[i] ?? 0));
      if (shadowL) {
        shadowCells.push(i);
        const sh = walk(cells[i]) ? walls.shadows[i] : '';
        shadowGids.push(sh ? pools.pickRole(rng, 'shadow', [sh]) : 0);
      }
    }
  if (wallL && frontL && frontL !== wallL) {
    store.strokeSetLayer(wallL.id, wallCells, wallGids);
    store.strokeSetLayer(frontL.id, wallCells, frontGids);
  } else if (wallL) store.strokeSetLayer(wallL.id, wallCells, wallGids.map((g, k) => g || frontGids[k]));
  if (colL && collisionGid) store.strokeSetLayer(colL.id, wallCells, colGids);
  if (shadowL) store.strokeSetLayer(shadowL.id, shadowCells, shadowGids);
}

const GROUND_ROLES = new Set<TileRole>(['ground_top', 'ground_top_left', 'ground_top_right', 'ground_left', 'ground_right', 'ground_bottom', 'ground_inner_left', 'ground_inner_right', 'ground_fill']);

/**
 * Side view ("Auto-Boden"): painting / erasing solid ground on the ground layer re-tiles the
 * edges around it (grass on top, sides, underside, inner corners) and keeps collision in sync.
 */
function applyAutoGround(changed: number[], paintedLayerId: string) {
  const store = useProject.getState();
  const p = store.project;
  const r = p.result;
  const W = p.map.width;
  const H = p.map.height;
  const groundL = p.layers.find((l) => l.role === 'walls');
  if (!groundL || groundL.id !== paintedLayerId || !changed.length) return;
  const metas = metaTable(p);
  const isGroundGid = (g: number) => {
    const m = metas[tileOf(g)];
    return !!m && (GROUND_ROLES.has(m.role as TileRole) || (!m.role && !!m.category && m.category.startsWith('wall')));
  };
  const data = groundL.data;
  const solid = (x: number, y: number) => (x < 0 || x >= W || y >= H ? true : y < 0 ? false : isGroundGid(data[y * W + x]));
  const pools = new TilePools(p.tilesets, 'side_view');
  const style = p.generator.side?.style === 'cave' ? 'cave' : 'grass';
  // the style of the painted tile wins (grass / cave)
  const paintedTag = metas[tileOf(changed.map((i) => data[i]).find((g) => g) ?? 0)]?.tags.find((t) => t === 'grass' || t === 'cave') ?? style;
  const ring = new Set<number>();
  for (const i of changed) {
    const x = i % W;
    const y = (i / W) | 0;
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const xx = x + ox;
        const yy = y + oy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) ring.add(yy * W + xx);
      }
  }
  const cells: number[] = [];
  const gids: number[] = [];
  const colL = p.layers.find((l) => l.role === 'collision');
  const collisionGid = pools.pickTagged(new Rng(1), 'special', 'collision');
  const colCells: number[] = [];
  const colGids: number[] = [];
  for (const i of ring) {
    const x = i % W;
    const y = (i / W) | 0;
    const g = data[i];
    const isGround = isGroundGid(g);
    if (isGround) {
      const own = metas[tileOf(g)]?.tags.find((t) => t === 'grass' || t === 'cave') ?? paintedTag;
      const gid = pools.pickRole(new Rng(hashSeed(`${r?.seed ?? ''}:${i}`)), groundRole(solid, x, y), ['side', own]);
      if (gid && gid !== g) (cells.push(i), gids.push(gid));
    }
    if (colL && collisionGid) (colCells.push(i), colGids.push(isGround ? collisionGid : 0));
    if (r && r.width === W && r.height === H) {
      const want = isGround ? CELL_WALL : CELL_ROOM;
      if (r.cells[i] !== want && r.cells[i] !== CELL_HAZARD) store.strokeStruct(i, want);
    }
  }
  if (cells.length) store.strokeSetLayer(groundL.id, cells, gids);
  if (colL && colCells.length) store.strokeSetLayer(colL.id, colCells, colGids);
}

/**
 * Hex maps: rivers and roads connect themselves – after painting / erasing, every river or
 * road hex around the stroke gets the tile whose arms point to its river / road neighbours.
 */
function applyAutoHex(changed: number[], paintedLayerId: string) {
  const store = useProject.getState();
  const p = store.project;
  const W = p.map.width;
  const H = p.map.height;
  const layer = p.layers.find((l) => l.id === paintedLayerId);
  if (!layer || !changed.length) return;
  const metas = metaTable(p);
  const roleOf = (g: number) => {
    const r = metas[tileOf(g)]?.role;
    return r === 'hex_river' || r === 'hex_road' ? r : null;
  };
  const data = layer.data;
  const ring = new Set<number>();
  for (const i of changed) {
    ring.add(i);
    for (let d = 0; d < 6; d++) {
      const [nx, ny] = hexNeighbor(i % W, (i / W) | 0, d);
      if (nx >= 0 && ny >= 0 && nx < W && ny < H) ring.add(ny * W + nx);
    }
  }
  const pools = new TilePools(p.tilesets, 'hex');
  const cells: number[] = [];
  const gids: number[] = [];
  for (const i of ring) {
    const role = roleOf(data[i]);
    if (!role) continue;
    let mask = 0;
    for (let d = 0; d < 6; d++) {
      const [nx, ny] = hexNeighbor(i % W, (i / W) | 0, d);
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && roleOf(data[ny * W + nx]) === role) mask |= 1 << d;
    }
    if (metas[tileOf(data[i])]?.tags.includes(`m${mask}`)) continue;
    const gid = pools.pickRole(new Rng(hashSeed(`${i}`)), role, [`m${mask}`]);
    if (gid && gid !== data[i]) (cells.push(i), gids.push(gid));
  }
  if (cells.length) store.strokeSetLayer(layer.id, cells, gids);
}

/**
 * Soft path / shore edges (corner-matched tiles, tag c<bits>): after painting or erasing, the tiles
 * around the stroke get the shape that matches their neighbours. Full path tiles (c15) are the
 * painted path, the others its rim; every shore tile is water.
 */
export function applyAutoEdges(changed: number[], paintedLayerId: string) {
  const store = useProject.getState();
  const p = store.project;
  const layer = p.layers.find((l) => l.id === paintedLayerId);
  if (!layer || !changed.length || p.map.perspective === 'hex' || p.map.perspective === 'side_view') return;
  const W = p.map.width;
  const H = p.map.height;
  const metas = metaTable(p);
  const data = layer.data;
  const meta = (i: number) => metas[tileOf(data[i])];
  const roleAtCell = (i: number) => {
    const r = meta(i)?.role;
    return r === 'path_edge' || r === 'shore' ? r : null;
  };
  // only strokes that involve soft tiles (painted now or around the edit)
  const ring = new Set<number>();
  let involved = false;
  for (const i of changed) {
    const x = i % W;
    const y = (i / W) | 0;
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const xx = x + ox;
        const yy = y + oy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        ring.add(j);
        if (roleAtCell(j)) involved = true;
      }
  }
  if (!involved) return;
  // full tiles (c15) are what was painted; the other shapes are its rounded rim on the cells around
  const source = (role: 'path_edge' | 'shore') => (i: number) => roleAtCell(i) === role && !!meta(i)?.tags.includes('c15');
  const mask = (x: number, y: number, on: (i: number) => boolean) => {
    const vert = (vx: number, vy: number) => {
      for (const [cx, cy] of [[vx - 1, vy - 1], [vx, vy - 1], [vx - 1, vy], [vx, vy]]) if (cx >= 0 && cy >= 0 && cx < W && cy < H && on(cy * W + cx)) return true;
      return false;
    };
    return (vert(x, y) ? 1 : 0) | (vert(x + 1, y) ? 2 : 0) | (vert(x + 1, y + 1) ? 4 : 0) | (vert(x, y + 1) ? 8 : 0);
  };
  const pools = new TilePools(p.tilesets, p.map.perspective);
  const cells: number[] = [];
  const gids: number[] = [];
  for (const i of ring) {
    const role = roleAtCell(i);
    if ((role && meta(i)?.tags.includes('c15')) || (!role && data[i] !== 0)) continue;
    const x = i % W;
    const y = (i / W) | 0;
    // water wins over path where both reach
    const water = mask(x, y, source('shore'));
    const path = water ? 0 : mask(x, y, source('path_edge'));
    const want: 'shore' | 'path_edge' | null = water ? 'shore' : path ? 'path_edge' : null;
    const m = water || path;
    let gid = 0;
    if (want) {
      if (role === want && meta(i)?.tags.includes(`c${m}`)) continue;
      gid = pools.pickRole(new Rng(hashSeed(`${want}${i}`)), want, [`c${m}`]);
    } else if (!role) continue;
    if (gid !== data[i]) (cells.push(i), gids.push(gid));
  }
  if (cells.length) store.strokeSetLayer(layer.id, cells, gids);
}
