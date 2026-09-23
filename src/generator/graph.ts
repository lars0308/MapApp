import type { GeneratorSettings } from '../types';
import type { Rng } from './rng';
import type { PlacedRoom } from './rooms';

export interface GraphEdge {
  a: number;
  b: number;
  kind: 'main' | 'loop' | 'alternative';
}

const dist = (a: PlacedRoom, b: PlacedRoom) => Math.hypot(a.cx - b.cx, a.cy - b.cy);

function find(parent: number[], i: number): number {
  while (parent[i] !== i) {
    parent[i] = parent[parent[i]];
    i = parent[i];
  }
  return i;
}

/** Minimum spanning tree over all room pairs (Kruskal). */
function mst(rooms: PlacedRoom[]): [number, number][] {
  const pairs: [number, number, number][] = [];
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) pairs.push([i, j, dist(rooms[i], rooms[j])]);
  pairs.sort((p, q) => p[2] - q[2] || p[0] - q[0] || p[1] - q[1]);
  const parent = rooms.map((_, i) => i);
  const out: [number, number][] = [];
  for (const [i, j] of pairs) {
    const ri = find(parent, i);
    const rj = find(parent, j);
    if (ri !== rj) {
      parent[ri] = rj;
      out.push([i, j]);
    }
  }
  return out;
}

/** Linear chain: greedy nearest-neighbour walk starting at an outer room. */
function chain(rooms: PlacedRoom[]): [number, number][] {
  if (rooms.length < 2) return [];
  const mx = rooms.reduce((s, r) => s + r.cx, 0) / rooms.length;
  const my = rooms.reduce((s, r) => s + r.cy, 0) / rooms.length;
  let start = 0;
  let far = -1;
  rooms.forEach((r, i) => {
    const d = Math.hypot(r.cx - mx, r.cy - my);
    if (d > far) {
      far = d;
      start = i;
    }
  });
  const visited = new Set([start]);
  const out: [number, number][] = [];
  let cur = start;
  while (visited.size < rooms.length) {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < rooms.length; i++) {
      if (visited.has(i)) continue;
      const d = dist(rooms[cur], rooms[i]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    out.push([cur, best]);
    visited.add(best);
    cur = best;
  }
  return out;
}

function hopDistances(n: number, edges: GraphEdge[], from: number): number[] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const e of edges) {
    adj[e.a].push(e.b);
    adj[e.b].push(e.a);
  }
  const d = new Array(n).fill(Infinity);
  d[from] = 0;
  const q = [from];
  while (q.length) {
    const c = q.shift()!;
    for (const nb of adj[c])
      if (d[nb] === Infinity) {
        d[nb] = d[c] + 1;
        q.push(nb);
      }
  }
  return d;
}

export function buildGraph(rooms: PlacedRoom[], s: GeneratorSettings, rng: Rng, W: number, H: number): GraphEdge[] {
  if (rooms.length < 2) return [];
  const c = s.connectivity / 100;
  // linear end of the slider forms a sequence of rooms, otherwise a spanning tree
  const base = c < 0.25 ? chain(rooms) : mst(rooms);
  const edges: GraphEdge[] = base.map(([a, b]) => ({ a, b, kind: 'main' }));

  const allowLoops = s.corridor.loops;
  const allowAlt = s.corridor.alternatives;
  if (!allowLoops && !allowAlt) return edges;

  const extra = Math.round(Math.pow(c, 1.15) * rooms.length * 0.6);
  if (extra <= 0) return edges;

  const has = (a: number, b: number) => edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  const diag = Math.hypot(W, H);

  // candidate pairs sorted by length
  const pairs: [number, number, number][] = [];
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) pairs.push([i, j, dist(rooms[i], rooms[j])]);
  pairs.sort((p, q) => p[2] - q[2] || p[0] - q[0] || p[1] - q[1]);

  let loopsLeft = allowLoops && allowAlt ? Math.ceil(extra / 2) : allowLoops ? extra : 0;
  let altLeft = extra - loopsLeft;

  // loops: short edges between rooms that are ≥3 hops apart
  for (const [a, b, d] of pairs) {
    if (loopsLeft <= 0) break;
    if (has(a, b) || d > diag * 0.3) continue;
    const hops = hopDistances(rooms.length, edges, a)[b];
    if (hops >= 3 && rng.chance(0.85)) {
      edges.push({ a, b, kind: 'loop' });
      loopsLeft--;
    }
  }
  // alternative connections: longer shortcuts between far-apart parts of the graph
  if (altLeft > 0) {
    const cands = pairs.filter(([a, b, d]) => !has(a, b) && d < diag * 0.5);
    rng.shuffle(cands);
    for (const [a, b] of cands) {
      if (altLeft <= 0) break;
      const hops = hopDistances(rooms.length, edges, a)[b];
      if (hops >= 4) {
        edges.push({ a, b, kind: 'alternative' });
        altLeft--;
      }
    }
  }
  return edges;
}

export { hopDistances };
