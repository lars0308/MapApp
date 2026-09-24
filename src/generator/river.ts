import { CELL_CORRIDOR, CELL_ROOM, T_BRIDGE, T_NONE, T_WATER, type TileRole } from '../types';
import type { Rng } from './rng';
import type { TerrainState } from './terrain';
import { makeNoise } from './corridors';

// Rivers for outdoor maps (Außen, Dorf, Insel): a winding band of water from one map edge to the
// opposite one. It flows through the forest; where it has to cross walkable ground (paths, the
// edge of a clearing) that ground becomes a bridge – so every clearing stays reachable.

const FOREST_COST = 1;
const PATH_COST = 25;
const CLEARING_COST = 40;

/** cheapest path (Dijkstra) from the source edge to the target edge */
function route(W: number, H: number, cost: (i: number) => number, sources: number[], isTarget: (i: number) => boolean): number[] | null {
  // Float64: sums of fractional costs must compare exactly with the heap entries
  const dist = new Float64Array(W * H).fill(Infinity);
  const prev = new Int32Array(W * H).fill(-1);
  // binary heap of [dist, cell]
  const heap: [number, number][] = [];
  const push = (d: number, i: number) => {
    heap.push([d, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  for (const s of sources) {
    const c = cost(s);
    if (!isFinite(c)) continue;
    dist[s] = c;
    push(c, s);
  }
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    if (isTarget(i)) {
      const out: number[] = [];
      for (let k = i; k >= 0; k = prev[k]) out.push(k);
      return out.reverse();
    }
    const x = i % W;
    const y = (i / W) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      const c = cost(j);
      if (!isFinite(c) || d + c >= dist[j]) continue;
      dist[j] = d + c;
      prev[j] = i;
      push(d + c, j);
    }
  }
  return null;
}

/** carve `count` rivers; returns how many were placed */
export function carveRivers(W: number, H: number, cells: Uint8Array, forest: Uint8Array, ts: TerrainState, count: number, rng: Rng, anchors: number[], toSea = false): number {
  const clearing = (i: number) => cells[i] === CELL_ROOM && !forest[i];
  let placed = 0;
  for (let r = 0; r < count; r++) {
    // meanders: a fresh noise field per river, strong enough to bend it
    const noise = makeNoise(W, H, rng, 7);
    const vertical = (r + (rng.chance(0.5) ? 1 : 0)) % 2 === 0;
    const cost = (i: number) => {
      if (ts.reserved.has(i) || ts.terrain[i] === T_BRIDGE) return Infinity;
      if (ts.terrain[i] === T_WATER) return 0.4;
      if (ts.terrain[i] !== T_NONE) return Infinity;
      if (cells[i] === CELL_CORRIDOR) return PATH_COST;
      if (clearing(i)) return CLEARING_COST;
      // along the map edge a river would look cut off: keep it inside (except where it starts / ends)
      const x = i % W;
      const y = (i / W) | 0;
      const edge = toSea ? 99 : vertical ? Math.min(x, W - 1 - x) : Math.min(y, H - 1 - y);
      return FOREST_COST + noise[i] * 6 + (edge < 6 ? (6 - edge) * 3 : 0);
    };
    const sources: number[] = [];
    let isTarget: (i: number) => boolean;
    if (toSea) {
      // island: springs in the forest near the middle, flows down to the sea
      const cx = W / 2 + rng.range(-0.15, 0.15) * W;
      const cy = H / 2 + rng.range(-0.15, 0.15) * H;
      const spring = [...Array(W * H).keys()].filter((i) => forest[i] && ts.terrain[i] === T_NONE).sort((a, b) => Math.hypot((a % W) - cx, ((a / W) | 0) - cy) - Math.hypot((b % W) - cx, ((b / W) | 0) - cy))[0];
      if (spring === undefined) continue;
      sources.push(spring);
      const sea = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) if (ts.terrain[i] === T_WATER) sea[i] = 1;
      isTarget = (i) => sea[i] === 1;
    } else {
      const lo = vertical ? Math.floor(W * 0.15) : Math.floor(H * 0.15);
      const hi = vertical ? Math.ceil(W * 0.85) : Math.ceil(H * 0.85);
      const start = rng.int(lo, hi - 1);
      // start on a stretch of the edge around a random point, end anywhere on the opposite edge
      for (let k = Math.max(0, start - 4); k <= Math.min((vertical ? W : H) - 1, start + 4); k++) sources.push(vertical ? k : k * W);
      isTarget = (i) => (vertical ? (i / W) | 0 : i % W) === (vertical ? H - 1 : W - 1);
    }
    const path = route(W, H, cost, sources, isTarget);
    if (!path) continue;
    // three cells wide (the shore takes half a cell on each side): both neighbours across the flow
    const band = new Set<number>();
    path.forEach((i, k) => {
      band.add(i);
      const a = path[Math.max(0, k - 2)];
      const b = path[Math.min(path.length - 1, k + 2)];
      const flowsVertically = Math.abs(((b / W) | 0) - ((a / W) | 0)) >= Math.abs((b % W) - (a % W));
      const x = i % W;
      const y = (i / W) | 0;
      const sides = flowsVertically ? [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1] : [y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
      for (const side of sides) if (side >= 0 && isFinite(cost(side))) band.add(side);
    });
    // water in the forest and through clearings, bridges where a path crosses
    const before = new Map<number, number>();
    const inClearing: number[] = [];
    const crossing: number[] = [];
    for (const i of band) {
      before.set(i, ts.terrain[i]);
      if (cells[i] === CELL_CORRIDOR) crossing.push(i);
      else {
        if (clearing(i)) inClearing.push(i);
        ts.terrain[i] = T_WATER;
      }
    }
    bridge(W, crossing, ts);
    // a clearing cut in two: bridges there as well
    if (!reachable(W, H, cells, forest, ts, anchors)) {
      bridge(W, inClearing, ts);
      if (!reachable(W, H, cells, forest, ts, anchors)) {
        for (const [i, t] of before) (ts.terrain[i] = t), ts.bridges.delete(i);
        continue;
      }
    }
    for (const i of band) if (ts.terrain[i] === T_WATER) forest[i] = 0;
    placed++;
  }
  return placed;
}

/** all room anchors reachable from the first one (trees and water block, bridges don't) */
function reachable(W: number, H: number, cells: Uint8Array, forest: Uint8Array, ts: TerrainState, anchors: number[]): boolean {
  if (anchors.length < 2) return true;
  const free = (i: number) => !forest[i] && ts.terrain[i] !== T_WATER && (cells[i] === CELL_ROOM || cells[i] === CELL_CORRIDOR);
  const seen = new Uint8Array(W * H);
  const stack = [anchors[0]];
  seen[anchors[0]] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % W;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
      if (j < 0 || j >= W * H || seen[j] || !free(j)) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return anchors.every((a) => seen[a]);
}

/** crossing cells → bridge lines across the river (start / middle / end along the walk) */
function bridge(W: number, crossing: number[], ts: TerrainState) {
  const set = new Set(crossing);
  const seen = new Set<number>();
  for (const s of crossing) {
    if (seen.has(s)) continue;
    // connected group of crossing cells
    const group: number[] = [];
    const stack = [s];
    seen.add(s);
    while (stack.length) {
      const i = stack.pop()!;
      group.push(i);
      for (const j of [i + 1, i - 1, i + W, i - W]) if (set.has(j) && !seen.has(j)) (seen.add(j), stack.push(j));
    }
    const xs = group.map((i) => i % W);
    const ys = group.map((i) => (i / W) | 0);
    const wide = Math.max(...xs) - Math.min(...xs);
    const tall = Math.max(...ys) - Math.min(...ys);
    // walked across the longer side of the crossing
    const orient: 'h' | 'v' = wide >= tall ? 'h' : 'v';
    const lines = new Map<number, number[]>();
    for (const i of group) {
      const key = orient === 'h' ? (i / W) | 0 : i % W;
      (lines.get(key) ?? lines.set(key, []).get(key)!).push(i);
    }
    const rows = [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l.sort((a, b) => a - b));
    rows.forEach((row, ri) => {
      row.forEach((i, k) => {
        let role: TileRole = row.length === 1 ? 'bridge_middle' : k === 0 ? 'bridge_start' : k === row.length - 1 ? 'bridge_end' : 'bridge_middle';
        if (rows.length > 1 && role === 'bridge_middle') role = ri === 0 ? 'bridge_left' : ri === rows.length - 1 ? 'bridge_right' : 'bridge_middle';
        ts.bridges.set(i, { role, orient, under: T_WATER });
        ts.terrain[i] = T_BRIDGE;
      });
    });
  }
}
