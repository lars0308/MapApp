import type { GeneratorSettings, SpecialRoomType } from '../types';
import type { Rng } from './rng';
import type { PlacedRoom } from './rooms';
import { hopDistances, type GraphEdge } from './graph';

/** Assign special room roles. Returns roomId → type. */
export function assignSpecialRooms(
  rooms: PlacedRoom[],
  edges: GraphEdge[],
  s: GeneratorSettings,
  rng: Rng,
): Map<number, SpecialRoomType> {
  const out = new Map<number, SpecialRoomType>();
  const n = rooms.length;
  if (!n) return out;
  const degree = new Array(n).fill(0);
  for (const e of edges) {
    degree[e.a]++;
    degree[e.b]++;
  }
  const free = () => rooms.filter((r) => !out.has(r.id));
  const euclid = (a: PlacedRoom, b: PlacedRoom) => Math.hypot(a.cx - b.cx, a.cy - b.cy);

  // start / end: graph-farthest pair (double sweep), euclidean distance as tie breaker
  let start = 0;
  let end = n > 1 ? 1 : 0;
  if (n > 1) {
    let best = -1;
    for (let i = 0; i < n; i++) {
      const d = hopDistances(n, edges, i);
      for (let j = 0; j < n; j++) {
        if (i === j || !Number.isFinite(d[j])) continue;
        const score = d[j] * 1000 + euclid(rooms[i], rooms[j]);
        if (score > best) {
          best = score;
          start = i;
          end = j;
        }
      }
    }
    // prefer a smaller room as start
    if (rooms[start].area > rooms[end].area && !s.specials.end) [start, end] = [end, start];
  }
  if (s.specials.start) out.set(start, 'start');
  if (s.specials.end && n > 1) out.set(end, 'end');

  const fromStart = hopDistances(n, edges, start);

  if (s.specials.boss && free().length) {
    // large room far away from start, preferably next to the end room
    const cands = free().sort((a, b) => {
      const sa = fromStart[a.id] * 10 + a.area / 20 + (edges.some((e) => (e.a === a.id && e.b === end) || (e.b === a.id && e.a === end)) ? 15 : 0);
      const sb = fromStart[b.id] * 10 + b.area / 20 + (edges.some((e) => (e.a === b.id && e.b === end) || (e.b === b.id && e.a === end)) ? 15 : 0);
      return sb - sa || a.id - b.id;
    });
    out.set(cands[0].id, 'boss');
  }

  const leaves = () => free().filter((r) => degree[r.id] === 1);
  if (s.specials.treasure && free().length) {
    const l = leaves();
    const pool = l.length ? l : free();
    pool.sort((a, b) => fromStart[b.id] - fromStart[a.id] || a.id - b.id);
    out.set(pool[0].id, 'treasure');
  }
  if (s.specials.secret && free().length) {
    const l = leaves();
    const pool = (l.length ? l : free()).sort((a, b) => a.area - b.area || a.id - b.id);
    out.set(pool[0].id, 'secret');
  }
  if (s.specials.merchant && free().length) {
    const maxD = Math.max(...fromStart.filter(Number.isFinite));
    const pool = free().sort((a, b) => Math.abs(fromStart[a.id] - maxD / 2) - Math.abs(fromStart[b.id] - maxD / 2) || a.id - b.id);
    out.set(pool[0].id, 'merchant');
  }
  if (s.specials.arena && free().length) {
    const pool = free().sort((a, b) => b.area - a.area || a.id - b.id);
    out.set(pool[0].id, 'arena');
  }
  if (s.specials.quest && free().length) out.set(rng.pick(free()).id, 'quest');
  if (s.specials.puzzle && free().length) out.set(rng.pick(free()).id, 'puzzle');
  return out;
}
