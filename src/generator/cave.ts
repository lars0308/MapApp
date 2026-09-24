import { CELL_CORRIDOR, CELL_ROOM, CELL_VOID } from '../types';
import type { Grid } from './corridors';
import type { PlacedRoom } from './rooms';
import type { Rng } from './rng';

// Cave look: rooms and corridors are laid out as usual (so start, goal, connections, special rooms
// and everything after keep working), then a cellular automaton turns them into natural caves –
// ragged walls, bulges, niches, the odd rock pillar. Room middles and corridor paths stay open, so
// every chamber stays reachable.

export function cavify(g: Grid, rooms: PlacedRoom[], corridorPaths: [number, number][][], roughness: number, rng: Rng): void {
  const { W, H } = g;
  const n = W * H;
  const r = Math.max(0, Math.min(100, roughness)) / 100;
  const open = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (g.cells[i] !== CELL_VOID) open[i] = 1;

  // cells that must stay open: corridor paths and room interiors (one cell from the edge)
  const core = new Uint8Array(n);
  for (const path of corridorPaths) for (const [x, y] of path) if (x > 1 && y > 1 && x < W - 2 && y < H - 2) core[y * W + x] = 1;
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (g.roomId[i] < 0) continue;
      const rid = g.roomId[i];
      if (g.roomId[i - 1] === rid && g.roomId[i + 1] === rid && g.roomId[i - W] === rid && g.roomId[i + W] === rid && rng.chance(0.85 - r * 0.35)) core[i] = 1;
    }
  for (const room of rooms) core[room.cy * W + room.cx] = 1;

  // distance to the open area (up to `reach`)
  const reach = 1 + Math.round(r * 3);
  const dist = new Uint8Array(n).fill(255);
  let front: number[] = [];
  for (let i = 0; i < n; i++) if (open[i]) (dist[i] = 0), front.push(i);
  for (let d = 1; d <= reach; d++) {
    const next: number[] = [];
    for (const i of front) {
      const x = i % W;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= n || Math.abs((j % W) - x) > 1 || dist[j] !== 255) continue;
        dist[j] = d;
        next.push(j);
      }
    }
    front = next;
  }

  // noise: grow into the rock around the open area, bite into the open area
  let state = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (open[i]) state[i] = core[i] || !rng.chance(0.1 + r * 0.25) ? 1 : 0;
    else if (dist[i] <= reach) state[i] = rng.chance(0.62 - (dist[i] / (reach + 1)) * 0.35) ? 1 : 0;
  }
  // cellular automaton (4-5 rule), keeps the core open and a rock frame around the map
  for (let it = 0; it < 5; it++) {
    const next = new Uint8Array(n);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) continue;
        if (core[i]) {
          next[i] = 1;
          continue;
        }
        if (dist[i] > reach) continue;
        let c = 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if ((ox || oy) && state[(y + oy) * W + x + ox]) c++;
        next[i] = c >= 5 || (state[i] && c >= 4) ? 1 : 0;
      }
    state = next;
  }

  // only what is connected to the start of the map (a room middle) stays open
  const reached = new Uint8Array(n);
  const start = rooms.length ? rooms[0].cy * W + rooms[0].cx : -1;
  if (start >= 0) {
    const stack = [start];
    reached[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % W;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= n || Math.abs((j % W) - x) > 1 || reached[j] || !state[j]) continue;
        reached[j] = 1;
        stack.push(j);
      }
    }
  }

  // write back: new open cells belong to the room next to them (or become corridor)
  for (let i = 0; i < n; i++) {
    if (reached[i]) {
      if (g.cells[i] === CELL_VOID) {
        const rid = g.nearRoom[i] >= 0 ? g.nearRoom[i] : neighbourRoom(g, i);
        if (rid >= 0) (g.cells[i] = CELL_ROOM), (g.roomId[i] = rid);
        else g.cells[i] = CELL_CORRIDOR;
      }
    } else if (g.cells[i] !== CELL_VOID) {
      g.cells[i] = CELL_VOID;
      g.roomId[i] = -1;
    }
  }
  // room sizes follow the new shapes
  const area = new Map<number, number>();
  for (let i = 0; i < n; i++) if (g.roomId[i] >= 0) area.set(g.roomId[i], (area.get(g.roomId[i]) ?? 0) + 1);
  for (const room of rooms) room.area = area.get(room.id) ?? room.area;
}

/** room id within two cells (new cave bulges join the chamber they grow from) */
function neighbourRoom(g: Grid, i: number): number {
  const x = i % g.W;
  const y = (i / g.W) | 0;
  for (let d = 1; d <= 2; d++)
    for (let oy = -d; oy <= d; oy++)
      for (let ox = -d; ox <= d; ox++) {
        const xx = x + ox;
        const yy = y + oy;
        if (xx < 0 || yy < 0 || xx >= g.W || yy >= g.H) continue;
        const rid = g.roomId[yy * g.W + xx];
        if (rid >= 0) return rid;
      }
  return -1;
}
