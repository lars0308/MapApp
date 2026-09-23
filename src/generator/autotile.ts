import { CELL_VOID, CELL_WALL, TILE_ROLES, type Perspective, type TileRole } from '../types';
import { PERSPECTIVE_INFO } from './perspective';
import type { Grid } from './corridors';

// Rule-based auto-tiling for walls.
//
// Every wall cell is classified from its 8-neighbourhood:
//   - which orthogonal neighbours are wall cells (4-bit connection mask)
//   - on which sides the room / floor lies
// → wall_horizontal / wall_vertical / wall_top … / corners / inner corners /
//   end caps / T-junctions / cross.
// In 3/4 perspectives walls with floor directly below become visible fronts
// (1 or 2 rows); the cells above them become the wall's upper edge. Front cells
// are treated as "room side" for the classification of the surrounding walls,
// so side walls continue up to the cap row (raised side walls, closed corners).

export const N = 1,
  NE = 2,
  E = 4,
  SE = 8,
  S = 16,
  SW = 32,
  W = 64,
  NW = 128;

export const NO_ROLE = 255;
export const roleIndex = (r: TileRole) => TILE_ROLES.indexOf(r);
export const roleAt = (i: number): TileRole | null => (i === NO_ROLE ? null : TILE_ROLES[i]);

const C_N = 1,
  C_E = 2,
  C_S = 4,
  C_W = 8;

/** Wall role from connection mask + room sides. */
export function classifyWall(conn: number, room: { n: boolean; e: boolean; s: boolean; w: boolean }): TileRole {
  const count = +!!(conn & C_N) + +!!(conn & C_E) + +!!(conn & C_S) + +!!(conn & C_W);
  if (count === 4) return 'junction_cross';
  if (count === 3) {
    if (!(conn & C_W)) return 'junction_t_right';
    if (!(conn & C_E)) return 'junction_t_left';
    if (!(conn & C_N)) return 'junction_t_down';
    return 'junction_t_up';
  }
  if (count === 2) {
    if (conn === (C_E | C_W)) {
      if (room.s && !room.n) return 'wall_top';
      if (room.n && !room.s) return 'wall_bottom';
      return 'wall_horizontal';
    }
    if (conn === (C_N | C_S)) {
      if (room.e && !room.w) return 'wall_left';
      if (room.w && !room.e) return 'wall_right';
      return 'wall_vertical';
    }
    // L-shaped: inner corner when the floor lies on the two open sides
    if (conn === (C_E | C_S)) return room.n || room.w ? 'inner_corner_top_left' : 'corner_top_left';
    if (conn === (C_W | C_S)) return room.n || room.e ? 'inner_corner_top_right' : 'corner_top_right';
    if (conn === (C_E | C_N)) return room.s || room.w ? 'inner_corner_bottom_left' : 'corner_bottom_left';
    return room.s || room.e ? 'inner_corner_bottom_right' : 'corner_bottom_right';
  }
  if (count === 1) {
    if (conn & C_S) return 'end_cap_top';
    if (conn & C_N) return 'end_cap_bottom';
    if (conn & C_E) return 'end_cap_left';
    return 'end_cap_right';
  }
  // isolated wall piece
  return room.s ? 'end_cap_bottom' : 'end_cap_top';
}

export interface WallStructure {
  /** TILE_ROLES index per cell, NO_ROLE = none */
  roles: Uint8Array;
  /** 1 = wall front, 2 = upper wall front (y-sorted "WallsFront" layer) */
  front: Uint8Array;
  /** shadow tag per cell ('' = none) */
  shadows: ('' | 'top' | 'side' | 'corner')[];
  floorMask: Uint8Array;
}

/**
 * Resolve wall roles. In 3/4 views this may turn void cells above fronts into
 * wall cells (the wall's upper edge) – call it before doors/objects are placed.
 */
export function resolveWalls(g: Grid, perspective: Perspective, shadows: boolean): WallStructure {
  const { W, H, cells } = g;
  const info = PERSPECTIVE_INFO[perspective];
  const faces = info.faceRows > 0;
  const front = new Uint8Array(W * H);
  const idx = (x: number, y: number) => y * W + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const walkable = (x: number, y: number) => inside(x, y) && cells[idx(x, y)] !== CELL_VOID && cells[idx(x, y)] !== CELL_WALL;

  if (faces) {
    // fronts: wall cells with floor directly below, extended upwards; cap above
    for (let y = H - 1; y >= 0; y--)
      for (let x = 0; x < W; x++) {
        const i = idx(x, y);
        if (cells[i] !== CELL_WALL || front[i] || !walkable(x, y + 1)) continue;
        front[i] = 1;
        let yy = y - 1;
        for (let k = 1; k < info.faceRows && yy >= 0; k++, yy--) {
          const j = idx(x, yy);
          if (cells[j] === CELL_VOID || (cells[j] === CELL_WALL && !walkable(x, yy + 1) && !front[j])) {
            cells[j] = CELL_WALL;
            front[j] = 2;
          } else break;
        }
        if (yy >= 0 && cells[idx(x, yy)] === CELL_VOID) cells[idx(x, yy)] = CELL_WALL;
      }
    // close the outline beside raised caps (void cell between a cap and a side wall)
    for (let y = H - 2; y >= 0; y--)
      for (let x = 1; x < W - 1; x++) {
        const i = idx(x, y);
        if (cells[i] !== CELL_VOID || cells[i + W] !== CELL_WALL) continue;
        const capBeside = (cells[i - 1] === CELL_WALL && !front[i - 1]) || (cells[i + 1] === CELL_WALL && !front[i + 1]);
        const frontNear = front[i + W - 1] || front[i + W + 1] || front[i + W] || front[i - 1] || front[i + 1];
        if (capBeside && frontNear) cells[i] = CELL_WALL;
      }
  }

  const solid = (x: number, y: number) => inside(x, y) && cells[idx(x, y)] === CELL_WALL && !front[idx(x, y)];
  const roomSide = (x: number, y: number) => walkable(x, y) || (inside(x, y) && front[idx(x, y)] > 0);

  const roles = new Uint8Array(W * H).fill(NO_ROLE);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (cells[i] !== CELL_WALL) continue;
      if (front[i]) {
        roles[i] = roleIndex(front[i] === 2 ? 'wall_front_upper' : 'wall_front');
        continue;
      }
      const conn = (solid(x, y - 1) ? C_N : 0) | (solid(x + 1, y) ? C_E : 0) | (solid(x, y + 1) ? C_S : 0) | (solid(x - 1, y) ? C_W : 0);
      const role = classifyWall(conn, { n: roomSide(x, y - 1), e: roomSide(x + 1, y), s: roomSide(x, y + 1), w: roomSide(x - 1, y) });
      roles[i] = roleIndex(role);
    }

  const floorMask = new Uint8Array(W * H);
  const shadowTags: WallStructure['shadows'] = new Array(W * H).fill('');
  const wall = (x: number, y: number) => inside(x, y) && cells[idx(x, y)] === CELL_WALL;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!walkable(x, y)) continue;
      const i = idx(x, y);
      floorMask[i] = (walkable(x, y - 1) ? 1 : 0) | (walkable(x + 1, y) ? 2 : 0) | (walkable(x, y + 1) ? 4 : 0) | (walkable(x - 1, y) ? 8 : 0);
      if (!shadows) continue;
      const top = wall(x, y - 1);
      const left = faces && wall(x - 1, y);
      shadowTags[i] = top && left ? 'corner' : top ? 'top' : left ? 'side' : '';
    }
  return { roles, front, shadows: shadowTags, floorMask };
}

/** 8-neighbour walkable mask of a wall cell (exported for later terrain systems). */
export function wallNeighbourMask(g: Grid, x: number, y: number): number {
  const { W, H, cells } = g;
  const walk = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < W && yy < H && cells[yy * W + xx] !== CELL_VOID && cells[yy * W + xx] !== CELL_WALL;
  return (
    (walk(x, y - 1) ? N : 0) |
    (walk(x + 1, y - 1) ? NE : 0) |
    (walk(x + 1, y) ? E : 0) |
    (walk(x + 1, y + 1) ? SE : 0) |
    (walk(x, y + 1) ? S : 0) |
    (walk(x - 1, y + 1) ? SW : 0) |
    (walk(x - 1, y) ? W : 0) |
    (walk(x - 1, y - 1) ? NW : 0)
  );
}
