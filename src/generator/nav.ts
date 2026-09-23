import { CELL_VOID, CELL_WALL, T_ABYSS, T_CLIFF, T_LAVA, T_WATER } from '../types';

/** Terrain codes that can never be walked on (bridges override liquids). */
export const BLOCKING_TERRAIN = new Set([T_WATER, T_LAVA, T_ABYSS, T_CLIFF]);

export function isWalkable(cells: Uint8Array, terrain: Uint8Array, i: number): boolean {
  const c = cells[i];
  return c !== CELL_VOID && c !== CELL_WALL && !BLOCKING_TERRAIN.has(terrain[i]);
}

/** 4-neighbour flood fill over walkable cells. */
export function reach(W: number, H: number, walk: (i: number) => boolean, from: number): Uint8Array {
  const seen = new Uint8Array(W * H);
  if (!walk(from)) return seen;
  const stack = [from];
  seen[from] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % W;
    const y = (i / W) | 0;
    if (x > 0 && !seen[i - 1] && walk(i - 1)) (seen[i - 1] = 1), stack.push(i - 1);
    if (x < W - 1 && !seen[i + 1] && walk(i + 1)) (seen[i + 1] = 1), stack.push(i + 1);
    if (y > 0 && !seen[i - W] && walk(i - W)) (seen[i - W] = 1), stack.push(i - W);
    if (y < H - 1 && !seen[i + W] && walk(i + W)) (seen[i + W] = 1), stack.push(i + W);
  }
  return seen;
}

/** True if every target is reachable from `from`. */
export function allReachable(W: number, H: number, walk: (i: number) => boolean, from: number, targets: number[]): boolean {
  const seen = reach(W, H, walk, from);
  return targets.every((t) => seen[t]);
}
