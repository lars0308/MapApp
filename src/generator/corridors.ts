import { CELL_CORRIDOR, CELL_ROOM, CELL_VOID, type GeneratorSettings } from '../types';
import type { Rng } from './rng';
import type { PlacedRoom } from './rooms';
import type { GraphEdge } from './graph';
import { clamp } from '../utils/math';

export interface Grid {
  W: number;
  H: number;
  cells: Uint8Array;
  roomId: Int16Array;
  /** id of a room whose floor is within 1 cell (-1 = none) */
  nearRoom: Int16Array;
}

export interface CarvedCorridor {
  a: number;
  b: number;
  kind: GraphEdge['kind'];
  width: number;
  length: number;
}

const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];

/* ---------- small binary heap on typed arrays ---------- */
class Heap {
  private keys: Float64Array;
  private vals: Int32Array;
  size = 0;
  constructor(cap: number) {
    this.keys = new Float64Array(cap);
    this.vals = new Int32Array(cap);
  }
  push(k: number, v: number) {
    if (this.size >= this.keys.length) {
      const nk = new Float64Array(this.keys.length * 2);
      nk.set(this.keys);
      const nv = new Int32Array(this.vals.length * 2);
      nv.set(this.vals);
      this.keys = nk;
      this.vals = nv;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= k) break;
      this.keys[i] = this.keys[p];
      this.vals[i] = this.vals[p];
      i = p;
    }
    this.keys[i] = k;
    this.vals[i] = v;
  }
  pop(): number {
    const top = this.vals[0];
    const k = this.keys[--this.size];
    const v = this.vals[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++;
      if (this.keys[c] >= k) break;
      this.keys[i] = this.keys[c];
      this.vals[i] = this.vals[c];
      i = c;
    }
    this.keys[i] = k;
    this.vals[i] = v;
    return top;
  }
}

/** Smooth value noise in [0,1] used to make A* corridors meander. */
export function makeNoise(W: number, H: number, rng: Rng, scale = 6): Float32Array {
  const gw = Math.ceil(W / scale) + 2;
  const gh = Math.ceil(H / scale) + 2;
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const fx = x / scale;
      const fy = y / scale;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a = g[y0 * gw + x0];
      const b = g[y0 * gw + x0 + 1];
      const c = g[(y0 + 1) * gw + x0];
      const d = g[(y0 + 1) * gw + x0 + 1];
      out[y * W + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    }
  return out;
}

interface RouteParams {
  turnPenalty: number;
  noiseAmp: number;
  noise: Float32Array;
  allowed: [number, number];
}

function astar(g: Grid, sx: number, sy: number, tx: number, ty: number, p: RouteParams): [number, number][] | null {
  const { W, H } = g;
  const N = W * H * 4;
  const gScore = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = new Heap(1024);
  const s = sy * W + sx;
  const t = ty * W + tx;
  const h = (c: number) => (Math.abs((c % W) - tx) + Math.abs(((c / W) | 0) - ty)) * 0.7;
  for (let d = 0; d < 4; d++) {
    gScore[s * 4 + d] = 0;
    heap.push(h(s), s * 4 + d);
  }
  let found = -1;
  let iterations = 0;
  while (heap.size) {
    const st = heap.pop();
    if (closed[st]) continue;
    closed[st] = 1;
    const c = st >> 2;
    const dir = st & 3;
    if (c === t) {
      found = st;
      break;
    }
    if (++iterations > 400000) break;
    const cx = c % W;
    const cy = (c / W) | 0;
    for (let nd = 0; nd < 4; nd++) {
      const nx = cx + DX[nd];
      const ny = cy + DY[nd];
      if (nx < 2 || ny < 2 || nx >= W - 2 || ny >= H - 2) continue;
      const n = ny * W + nx;
      let cost: number;
      const cell = g.cells[n];
      if (cell === CELL_ROOM) {
        const rid = g.roomId[n];
        cost = rid === p.allowed[0] || rid === p.allowed[1] ? 1 : 24;
      } else if (cell === CELL_CORRIDOR) {
        cost = 0.7;
      } else {
        cost = 1 + p.noise[n] * p.noiseAmp;
        const near = g.nearRoom[n];
        if (near >= 0 && near !== p.allowed[0] && near !== p.allowed[1]) cost += 6;
      }
      if (nd !== dir) cost += p.turnPenalty;
      const ns = n * 4 + nd;
      const ng = gScore[st] + cost;
      if (ng < gScore[ns]) {
        gScore[ns] = ng;
        from[ns] = st;
        heap.push(ng + h(n), ns);
      }
    }
  }
  if (found < 0) return null;
  const path: [number, number][] = [];
  let cur = found;
  while (cur >= 0) {
    const c = cur >> 2;
    path.push([c % W, (c / W) | 0]);
    cur = from[cur];
  }
  path.reverse();
  // remove consecutive duplicates (start states)
  return path.filter((pt, i) => i === 0 || pt[0] !== path[i - 1][0] || pt[1] !== path[i - 1][1]);
}

/** Axis-aligned L / zig-zag path with `bends` corners. */
function manhattan(sx: number, sy: number, tx: number, ty: number, bends: number, rng: Rng): [number, number][] {
  const pts: [number, number][] = [[sx, sy]];
  const horizontalFirst = rng.chance(0.5);
  const steps = Math.max(1, bends);
  let x = sx;
  let y = sy;
  const dx = tx - sx;
  const dy = ty - sy;
  for (let i = 1; i <= steps; i++) {
    const nx = i === steps ? tx : sx + Math.round((dx * i) / steps);
    const ny = i === steps ? ty : sy + Math.round((dy * i) / steps);
    const order: ('h' | 'v')[] = horizontalFirst ? ['h', 'v'] : ['v', 'h'];
    for (const o of order) {
      if (o === 'h')
        while (x !== nx) {
          x += Math.sign(nx - x);
          pts.push([x, y]);
        }
      else
        while (y !== ny) {
          y += Math.sign(ny - y);
          pts.push([x, y]);
        }
    }
  }
  return pts;
}

function carve(g: Grid, path: [number, number][], width: number, mark?: Uint8Array): number {
  const lo = Math.floor((width - 1) / 2);
  const hi = width - 1 - lo;
  let carved = 0;
  for (const [px, py] of path) {
    for (let oy = -lo; oy <= hi; oy++)
      for (let ox = -lo; ox <= hi; ox++) {
        const x = clamp(px + ox, 2, g.W - 3);
        const y = clamp(py + oy, 2, g.H - 3);
        const i = y * g.W + x;
        if (g.cells[i] === CELL_VOID) {
          g.cells[i] = CELL_CORRIDOR;
          carved++;
          if (mark) mark[i] = 1;
        }
      }
  }
  return carved;
}

/** Floor cell of `room` on its outline that is closest to (tx, ty). */
function exitCell(g: Grid, room: PlacedRoom, tx: number, ty: number): [number, number] {
  let best: [number, number] = [room.cx, room.cy];
  let bd = Infinity;
  const { w, h, data } = room.mask;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!data[y * w + x]) continue;
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || !data[y * w + x - 1] || !data[y * w + x + 1] || !data[(y - 1) * w + x] || !data[(y + 1) * w + x];
      if (!edge) continue;
      // avoid exact corners of the mask – looks nicer and leaves space for door frames
      const gx = room.x + x;
      const gy = room.y + y;
      const d = Math.hypot(gx - tx, gy - ty);
      if (d < bd) {
        bd = d;
        best = [gx, gy];
      }
    }
  void g;
  return best;
}

export function computeNearRoom(g: Grid): void {
  const { W, H } = g;
  g.nearRoom.fill(-1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const rid = g.roomId[y * W + x];
      if (rid < 0) continue;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (g.roomId[j] < 0) g.nearRoom[j] = rid;
        }
    }
}

export function carveCorridors(
  g: Grid,
  rooms: PlacedRoom[],
  edges: GraphEdge[],
  s: GeneratorSettings,
  rng: Rng,
): CarvedCorridor[] {
  const t = s.twistiness / 100;
  const detour = 1 - s.directness / 100;
  const noise = makeNoise(g.W, g.H, rng, 4 + Math.round((1 - t) * 6));
  const minW = Math.max(1, Math.min(s.corridorMinWidth, s.corridorMaxWidth));
  const maxW = Math.max(minW, s.corridorMaxWidth);
  const baseW = clamp(s.corridorWidth, minW, maxW);
  const useStraight = s.corridor.straight || !s.corridor.curves;
  const useCurves = s.corridor.curves;

  const out: CarvedCorridor[] = [];
  for (const e of edges) {
    const A = rooms[e.a];
    const B = rooms[e.b];
    const [sx, sy] = exitCell(g, A, B.cx, B.cy);
    const [tx, ty] = exitCell(g, B, sx, sy);
    const width = rng.chance(0.65) || minW === maxW ? baseW : rng.int(minW, maxW);

    // waypoints create detours (inverse of directness)
    const pts: [number, number][] = [[sx, sy]];
    const len = Math.hypot(tx - sx, ty - sy);
    if (len > 8 && rng.chance(detour * 0.9)) {
      const n = detour > 0.6 && rng.chance(0.5) ? 2 : 1;
      for (let k = 1; k <= n; k++) {
        const f = k / (n + 1);
        const px = sx + (tx - sx) * f;
        const py = sy + (ty - sy) * f;
        const off = (rng.next() * 0.5 + 0.15) * len * detour * (rng.chance(0.5) ? 1 : -1);
        const nx = -(ty - sy) / len;
        const ny = (tx - sx) / len;
        const wx = clamp(Math.round(px + nx * off), 3, g.W - 4);
        const wy = clamp(Math.round(py + ny * off), 3, g.H - 4);
        pts.push([wx, wy]);
      }
    }
    pts.push([tx, ty]);

    const curved = useCurves && (!useStraight || rng.chance(0.5));
    let path: [number, number][] = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      let seg: [number, number][] | null = null;
      if (curved) {
        seg = astar(g, ax, ay, bx, by, {
          turnPenalty: (1 - t) * 5 + 0.15,
          noiseAmp: 0.5 + t * 7,
          noise,
          allowed: [A.id, B.id],
        });
      }
      if (!seg) {
        const segLen = Math.abs(bx - ax) + Math.abs(by - ay);
        const bends = 1 + Math.floor(t * t * Math.min(6, segLen / 6) * rng.range(0.6, 1.2));
        seg = manhattan(ax, ay, bx, by, bends, rng);
      }
      path = path.concat(i === 0 ? seg : seg.slice(1));
    }
    carve(g, path, width);
    out.push({ a: e.a, b: e.b, kind: e.kind, width, length: path.length });
  }
  return out;
}

/**
 * Side branches: random walks leaving existing corridors. They either end in the
 * void (dead end) or run into another floor area (extra junction / loop).
 */
export function carveBranches(g: Grid, s: GeneratorSettings, rng: Rng, roomCount: number): number {
  if (!s.corridor.branches) return 0;
  const t = s.twistiness / 100;
  const attempts = Math.round(roomCount * (0.35 + t * 0.9));
  const width = Math.max(1, Math.min(s.corridorMinWidth, s.corridorWidth));
  const corridorCells: number[] = [];
  for (let i = 0; i < g.cells.length; i++) if (g.cells[i] === CELL_CORRIDOR) corridorCells.push(i);
  if (!corridorCells.length) return 0;
  let deadEnds = 0;

  for (let a = 0; a < attempts; a++) {
    const start = rng.pick(corridorCells);
    let x = start % g.W;
    let y = (start / g.W) | 0;
    // direction into the void
    const dirs = rng.shuffle([0, 1, 2, 3]);
    let dir = -1;
    for (const d of dirs) {
      const nx = x + DX[d] * (width + 1);
      const ny = y + DY[d] * (width + 1);
      if (nx > 2 && ny > 2 && nx < g.W - 3 && ny < g.H - 3 && g.cells[ny * g.W + nx] === CELL_VOID) {
        dir = d;
        break;
      }
    }
    if (dir < 0) continue;
    const total = rng.int(5, 8 + Math.round(t * 16));
    const path: [number, number][] = [[x, y]];
    let segLeft = rng.int(2, 3 + Math.round((1 - t) * 5));
    let outcome: 'dead' | 'joined' | 'blocked' = 'dead';
    const own = new Set<number>([start]);
    for (let step = 0; step < total; step++) {
      if (segLeft <= 0) {
        const turn = rng.chance(0.5) ? 2 : 3;
        dir = dir < 2 ? turn : rng.chance(0.5) ? 0 : 1;
        segLeft = rng.int(2, 3 + Math.round((1 - t) * 5));
      }
      const nx = x + DX[dir];
      const ny = y + DY[dir];
      if (nx < 3 || ny < 3 || nx >= g.W - 3 || ny >= g.H - 3) {
        outcome = 'blocked';
        break;
      }
      const ni = ny * g.W + nx;
      // look ahead: touching other floor (not the cells we came from)?
      let touches = false;
      if (step >= 2) {
        for (let d = 0; d < 4; d++) {
          const j = (ny + DY[d]) * g.W + nx + DX[d];
          if (!own.has(j) && g.cells[j] !== CELL_VOID && d !== (dir ^ 1)) touches = true;
        }
        if (g.cells[ni] !== CELL_VOID) touches = true;
      }
      x = nx;
      y = ny;
      path.push([x, y]);
      own.add(ni);
      segLeft--;
      if (touches) {
        outcome = 'joined';
        break;
      }
    }
    if (outcome === 'joined') {
      if (!s.corridor.loops) continue;
      carve(g, path, width);
    } else if (outcome === 'dead') {
      if (!s.corridor.deadEnds) continue;
      if (carve(g, path, width) > 2) deadEnds++;
    }
  }
  return deadEnds;
}
