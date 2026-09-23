import { CELL_CORRIDOR, CELL_HAZARD, CELL_ROOM, CELL_VOID, CELL_WALL, type TileRole } from '../types';
import { useProject } from '../store/projectStore';
import { TilePools } from '../tilesets/tilePools';
import { resolveWalls, roleAt } from '../generator/autotile';
import { Rng, hashSeed } from '../generator/rng';
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
    const m = metas[g];
    return !!m && (m.role === 'door' || m.category === 'door');
  };

  // 1. structural changes
  let touched = false;
  for (const i of changed) {
    const g = painted.data[i];
    if (painted.role === 'floor') {
      if (g && (r.cells[i] === CELL_VOID || r.cells[i] === CELL_WALL)) (store.strokeStruct(i, CELL_CORRIDOR), (touched = true));
      else if (!g && (r.cells[i] === CELL_ROOM || r.cells[i] === CELL_CORRIDOR || r.cells[i] === CELL_HAZARD)) (store.strokeStruct(i, CELL_VOID), (touched = true));
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
      const wasWall = r.cells[i] === CELL_WALL;
      if (cells[i] !== r.cells[i] && (cells[i] === CELL_WALL || r.cells[i] === CELL_WALL || cells[i] === CELL_VOID)) store.strokeStruct(i, cells[i]);
      let back = 0;
      let front = 0;
      if (cells[i] === CELL_WALL) {
        let role: TileRole | null = roleAt(walls.roles[i]);
        // door frames next to doors in horizontal walls
        if (doorAt(i + 1) && cells[i - 1] === CELL_WALL) role = 'door_frame_left';
        else if (doorAt(i - 1) && cells[i + 1] === CELL_WALL) role = 'door_frame_right';
        const isFront = walls.front[i] > 0;
        let gid = role ? pools.pickRole(rng, role, role.startsWith('door_frame') ? [isFront ? 'front' : 'top'] : undefined) : 0;
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
