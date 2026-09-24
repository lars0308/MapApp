import {
  CELL_HAZARD,
  CELL_ROOM,
  T_DEEP,
  T_DESERT,
  T_FOREST,
  T_GRASS,
  T_HILLS,
  T_MOUNTAIN,
  T_SAND,
  T_SNOW,
  T_SWAMP,
  T_WATER,
  type GenerationResult,
  type HexSettings,
  type LayerRole,
  type Room,
  type SpawnPoint,
} from '../types';
import { Rng } from './rng';
import { TilePools } from '../tilesets/tilePools';
import { defaultHex } from './presets';
import { hexDistance, hexNeighbor, opposite } from './hex';
import type { GenerateInput, GenerateOutput } from './index';

// Hex world generator (perspective hex): elevation + moisture noise → sea, coast, beaches,
// grass, forest, hills, mountains, snow, desert, swamp (climate by latitude); rivers run
// downhill from the mountains to the sea; settlements on good land with some distance,
// capitals of the players far apart; roads between settlements (A* over terrain costs).

/** movement cost per terrain (also exported for Godot) – Infinity = not walkable */
export const HEX_COST: Record<number, number> = {
  [T_DEEP]: Infinity,
  [T_WATER]: Infinity,
  [T_SAND]: 1.5,
  [T_GRASS]: 1,
  [T_FOREST]: 2,
  [T_HILLS]: 2.5,
  [T_MOUNTAIN]: 6,
  [T_SNOW]: 3,
  [T_DESERT]: 2,
  [T_SWAMP]: 3.5,
};

export const HEX_TERRAIN_TAG: Record<number, string> = {
  [T_DEEP]: 'deep_water',
  [T_WATER]: 'water',
  [T_SAND]: 'sand',
  [T_GRASS]: 'grass',
  [T_FOREST]: 'forest',
  [T_HILLS]: 'hills',
  [T_MOUNTAIN]: 'mountain',
  [T_SNOW]: 'snow',
  [T_DESERT]: 'desert',
  [T_SWAMP]: 'swamp',
};

/** smooth value noise with octaves (0..1) */
function noise2(rng: Rng, W: number, H: number, scale: number, octaves = 4): Float32Array {
  const out = new Float32Array(W * H);
  let amp = 1;
  let total = 0;
  let freq = 1 / scale;
  for (let o = 0; o < octaves; o++) {
    const gw = Math.ceil(W * freq) + 3;
    const gh = Math.ceil(H * freq) + 3;
    const grid = new Float32Array(gw * gh);
    for (let i = 0; i < grid.length; i++) grid[i] = rng.next();
    const ox = rng.next();
    const oy = rng.next();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const fx = (x + (y & 1 ? 0.5 : 0)) * freq + ox;
        const fy = y * 0.866 * freq + oy;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const g = (a: number, b: number) => grid[Math.min(gh - 1, b) * gw + Math.min(gw - 1, a)];
        const v = (g(ix, iy) * (1 - sx) + g(ix + 1, iy) * sx) * (1 - sy) + (g(ix, iy + 1) * (1 - sx) + g(ix + 1, iy + 1) * sx) * sy;
        out[y * W + x] += v * amp;
      }
    total += amp;
    amp *= 0.5;
    freq *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

const quantile = (vals: Float32Array | number[], q: number) => {
  const a = Array.from(vals).sort((x, y) => x - y);
  return a[Math.max(0, Math.min(a.length - 1, Math.floor(q * a.length)))];
};

export function generateHex(input: GenerateInput): GenerateOutput {
  const { settings: gs, map } = input;
  const s: HexSettings = { ...defaultHex(), ...gs.hex };
  const W = Math.max(12, map.width);
  const H = Math.max(10, map.height);
  const n = W * H;
  const root = Rng.fromString(gs.seed);
  const rElev = root.fork(301);
  const rMoist = root.fork(307);
  const rRiver = root.fork(311);
  const rTown = root.fork(313);
  const rTiles = root.fork(317);
  const rRes = root.fork(331);
  const warnings: string[] = [];
  const idx = (x: number, y: number) => y * W + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

  // ---------------------------------------------------------------- elevation
  const islands = s.shape === 'islands';
  const elev = noise2(rElev, W, H, islands ? 4.5 : 14, islands ? 4 : 5);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // continent: fall off towards the border, islands: only a thin sea border
      const dx = (x + 0.5) / W - 0.5;
      const dy = (y + 0.5) / H - 0.5;
      const d = Math.sqrt(dx * dx + dy * dy) * 2;
      const fall = islands ? Math.max(0, d - 0.75) * 1.6 : d * d * 0.55;
      elev[idx(x, y)] -= fall;
    }
  // islands need more sea, otherwise the land grows together (the slider still scales it)
  const waterShare = islands ? 0.5 + 0.35 * (s.water / 100) : s.water / 100;
  const sea = quantile(elev, Math.max(0.05, Math.min(0.9, waterShare)));
  const landVals = Array.from(elev).filter((e) => e > sea);
  const mountainQ = quantile(landVals, 1 - 0.11 * (s.mountains / 50));
  const hillQ = quantile(landVals, 1 - 0.27 * (s.mountains / 50));
  const moist = noise2(rMoist, W, H, 9, 4);
  const forestQ = quantile(moist, 1 - 0.45 * (s.forests / 50));

  const ter = new Uint8Array(n);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      const e = elev[i];
      if (e <= sea) {
        ter[i] = T_DEEP;
        continue;
      }
      // latitude: poles at the top and bottom
      const lat = Math.abs((y + 0.5) / H - 0.5) * 2;
      const temp = (s.climate === 'hot' ? 0.35 : s.climate === 'cold' ? -0.35 : 0) + (1 - lat) - (e - sea) * 0.6;
      const m = moist[i];
      if (e >= mountainQ) ter[i] = temp < 0.3 ? T_SNOW : T_MOUNTAIN;
      else if (e >= hillQ) ter[i] = temp < 0.15 ? T_SNOW : T_HILLS;
      else if (temp < 0.12) ter[i] = T_SNOW;
      else if (temp > 0.95 && m < 0.5) ter[i] = T_DESERT;
      else if (m > 0.62 && e - sea < 0.05) ter[i] = T_SWAMP;
      else if (m >= forestQ) ter[i] = T_FOREST;
      else ter[i] = T_GRASS;
    }
  // coast: shallow water next to land, beaches on low land next to the sea
  const near = (x: number, y: number, test: (t: number) => boolean) => {
    for (let d = 0; d < 6; d++) {
      const [nx, ny] = hexNeighbor(x, y, d);
      if (inside(nx, ny) && test(ter[idx(nx, ny)])) return true;
    }
    return false;
  };
  const isWater = (t: number) => t === T_DEEP || t === T_WATER;
  const shallow: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ter[idx(x, y)] === T_DEEP && near(x, y, (t) => !isWater(t))) shallow.push(idx(x, y));
  for (const i of shallow) ter[i] = T_WATER;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if ((ter[i] === T_GRASS || ter[i] === T_DESERT) && elev[i] - sea < 0.035 && near(x, y, isWater)) ter[i] = T_SAND;
    }

  // ---------------------------------------------------------------- rivers
  const riverMask = new Uint8Array(n);
  const riverCount = Math.round((s.rivers / 100) * Math.max(2, (W * H) / 160));
  const sources = [];
  for (let i = 0; i < n; i++) if (ter[i] === T_MOUNTAIN || ter[i] === T_HILLS || ter[i] === T_SNOW) sources.push(i);
  for (let r = 0; r < riverCount && sources.length; r++) {
    let cur = sources.splice(rRiver.int(0, sources.length - 1), 1)[0];
    const seen = new Set<number>([cur]);
    let prevDir = -1;
    for (let step = 0; step < W + H; step++) {
      const x = cur % W;
      const y = (cur / W) | 0;
      if (isWater(ter[cur])) break;
      // flow to the lowest neighbour (a little randomness), prefer joining other rivers
      let best = -1;
      let bestD = -1;
      let be = Infinity;
      for (let d = 0; d < 6; d++) {
        const [nx, ny] = hexNeighbor(x, y, d);
        if (!inside(nx, ny)) continue;
        const j = idx(nx, ny);
        if (seen.has(j)) continue;
        // downhill, joining rivers, and rather straight on (no zig-zag)
        const turn = prevDir < 0 ? 0 : Math.min((d - prevDir + 6) % 6, (prevDir - d + 6) % 6);
        const e = elev[j] - (riverMask[j] ? 0.02 : 0) + rRiver.next() * 0.006 + turn * 0.012;
        if (e < be) (be = e), (best = j), (bestD = d);
      }
      if (best < 0) break;
      prevDir = bestD;
      riverMask[cur] |= 1 << bestD;
      riverMask[best] |= 1 << opposite(bestD);
      if (riverMask[best] & ~(1 << opposite(bestD))) break; // joined another river
      seen.add(best);
      cur = best;
    }
  }
  // rivers do not run on the water hexes themselves (only up to the coast)
  for (let i = 0; i < n; i++) if (isWater(ter[i])) riverMask[i] = 0;

  // ---------------------------------------------------------------- settlements
  const good = (i: number) => ter[i] === T_GRASS || ter[i] === T_SAND || ter[i] === T_FOREST || ter[i] === T_HILLS || ter[i] === T_DESERT;
  const score = (x: number, y: number) => {
    const i = idx(x, y);
    let sc = ter[i] === T_GRASS ? 3 : ter[i] === T_HILLS ? 2 : 1;
    if (riverMask[i]) sc += 3;
    if (near(x, y, isWater)) sc += 2;
    for (let d = 0; d < 6; d++) {
      const [nx, ny] = hexNeighbor(x, y, d);
      if (inside(nx, ny) && ter[idx(nx, ny)] === T_GRASS) sc += 0.4;
    }
    return sc + rTown.next() * 2;
  };
  const cands: { x: number; y: number; sc: number }[] = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (good(idx(x, y))) cands.push({ x, y, sc: score(x, y) });
  cands.sort((a, b) => b.sc - a.sc);
  const want = Math.max(s.players, s.towns);
  const minDist = Math.max(3, Math.round(Math.sqrt((W * H) / Math.max(1, want)) * 0.55));
  const towns: { x: number; y: number }[] = [];
  for (const c of cands) {
    if (towns.length >= want) break;
    if (towns.every((t) => hexDistance(t.x, t.y, c.x, c.y) >= minDist)) towns.push(c);
  }
  if (towns.length < want) warnings.push(`Nur ${towns.length} von ${want} Siedlungen passen auf das Land – mehr Land oder größere Karte.`);
  // capitals: players far apart (max-min distance)
  const capitals: number[] = [];
  if (towns.length && s.players > 0) {
    capitals.push(0);
    while (capitals.length < Math.min(s.players, towns.length)) {
      let best = -1;
      let bd = -1;
      towns.forEach((t, k) => {
        if (capitals.includes(k)) return;
        const d = Math.min(...capitals.map((c) => hexDistance(t.x, t.y, towns[c].x, towns[c].y)));
        if (d > bd) (bd = d), (best = k);
      });
      capitals.push(best);
    }
  }

  // ---------------------------------------------------------------- roads (A*, terrain cost)
  const roadMask = new Uint8Array(n);
  const path = (a: { x: number; y: number }, b: { x: number; y: number }): number[] | null => {
    const start = idx(a.x, a.y);
    const goal = idx(b.x, b.y);
    const g = new Float64Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    g[start] = 0;
    const open: [number, number][] = [[hexDistance(a.x, a.y, b.x, b.y), start]];
    while (open.length) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, cur] = open.splice(bi, 1)[0];
      if (cur === goal) break;
      const x = cur % W;
      const y = (cur / W) | 0;
      for (let d = 0; d < 6; d++) {
        const [nx, ny] = hexNeighbor(x, y, d);
        if (!inside(nx, ny)) continue;
        const j = idx(nx, ny);
        const c = HEX_COST[ter[j]] ?? 1;
        if (!isFinite(c)) continue;
        // existing roads are cheap, crossing rivers costs a bridge
        const cost = (roadMask[j] ? 0.5 : c) + (riverMask[j] && !roadMask[j] ? 1 : 0);
        const ng = g[cur] + cost;
        if (ng < g[j]) {
          g[j] = ng;
          from[j] = cur;
          open.push([ng + hexDistance(nx, ny, b.x, b.y), j]);
        }
      }
    }
    if (from[goal] < 0) return null;
    const out = [goal];
    while (out[out.length - 1] !== start) out.push(from[out[out.length - 1]]);
    return out.reverse();
  };
  if (s.roads && towns.length > 1) {
    // minimum spanning tree over the settlements (hex distance), then the roads along it
    const inTree = [0];
    const edges: [number, number][] = [];
    while (inTree.length < towns.length) {
      let best: [number, number] | null = null;
      let bd = Infinity;
      for (const a of inTree)
        towns.forEach((t, b) => {
          if (inTree.includes(b)) return;
          const d = hexDistance(towns[a].x, towns[a].y, t.x, t.y);
          if (d < bd) (bd = d), (best = [a, b]);
        });
      if (!best) break;
      edges.push(best);
      inTree.push(best[1]);
    }
    for (const [a, b] of edges) {
      const p = path(towns[a], towns[b]);
      if (!p) continue;
      for (let k = 0; k + 1 < p.length; k++) {
        const ax = p[k] % W;
        const ay = (p[k] / W) | 0;
        for (let d = 0; d < 6; d++) {
          const [nx, ny] = hexNeighbor(ax, ay, d);
          if (inside(nx, ny) && idx(nx, ny) === p[k + 1]) {
            roadMask[p[k]] |= 1 << d;
            roadMask[p[k + 1]] |= 1 << opposite(d);
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- resources
  const resources: { i: number; kind: string }[] = [];
  const taken = new Set(towns.map((t) => idx(t.x, t.y)));
  const resCount = Math.round((s.resources / 100) * towns.length * 1.5 + (s.resources / 100) * (n / 250));
  for (let k = 0, tries = 0; k < resCount && tries < resCount * 30; tries++) {
    const i = rRes.int(0, n - 1);
    if (taken.has(i) || isWater(ter[i]) || roadMask[i]) continue;
    const t = ter[i];
    const kind = t === T_MOUNTAIN || t === T_HILLS ? 'mine' : t === T_GRASS && towns.some((c) => hexDistance(c.x, c.y, i % W, (i / W) | 0) <= 2) ? 'farm' : t === T_DESERT || t === T_FOREST || t === T_SWAMP ? 'ruins' : null;
    if (!kind) continue;
    resources.push({ i, kind });
    taken.add(i);
    k++;
  }

  // ---------------------------------------------------------------- tiles
  const pools = new TilePools(input.tilesets, 'hex');
  const byRole = new Map<LayerRole, Uint32Array>();
  const layerData: Record<string, Uint32Array> = {};
  for (const l of input.layers) {
    if (l.role === 'custom' || byRole.has(l.role)) continue;
    const arr = new Uint32Array(n);
    byRole.set(l.role, arr);
    layerData[l.id] = arr;
  }
  const L = (r: LayerRole) => byRole.get(r);
  const groundL = L('floor');
  const riverL = L('groundDetails') ?? L('paths');
  const roadL = L('paths') ?? riverL;
  const objL = L('objects');
  const spawnL = L('spawn');
  const terrainTile = (t: number) => {
    const tag = HEX_TERRAIN_TAG[t];
    return pools.pickTagged(rTiles, t === T_DEEP || t === T_WATER ? 'water' : 'floor', tag) || pools.pickTagged(rTiles, 'floor', tag);
  };
  for (let i = 0; i < n; i++) if (groundL) groundL[i] = terrainTile(ter[i]);
  for (let i = 0; i < n; i++) {
    if (riverMask[i] && riverL) riverL[i] = pools.pickRole(rTiles, 'hex_river', [`m${riverMask[i]}`]);
    if (roadMask[i] && roadL) roadL[i] = pools.pickRole(rTiles, 'hex_road', [`m${roadMask[i]}`]);
  }

  const rooms: Room[] = [];
  const spawnPoints: SpawnPoint[] = [];
  towns.forEach((t, k) => {
    const cap = capitals.indexOf(k);
    const kind = cap >= 0 ? 'castle' : k % 3 === 2 ? 'village' : 'town';
    const i = idx(t.x, t.y);
    if (objL) objL[i] = pools.pickTagged(rTiles, 'special', kind);
    rooms.push({
      id: k,
      type: cap === 0 ? 'start' : 'normal',
      shape: 'rect',
      x: t.x,
      y: t.y,
      width: 1,
      height: 1,
      centerX: t.x,
      centerY: t.y,
      area: 1,
      connections: [],
      isStart: cap === 0,
      isEnd: false,
      isBoss: false,
      special: null,
      terrain: kind,
      doors: [],
    });
    if (cap >= 0) {
      spawnPoints.push({ id: `player_${cap + 1}`, type: 'player', x: t.x, y: t.y, roomId: k, properties: { player: cap + 1, capital: true } });
      if (spawnL) spawnL[i] = pools.pickTagged(rTiles, 'special', `p${cap + 1}`);
    }
  });
  for (const r of resources) {
    if (objL) objL[r.i] = pools.pickTagged(rTiles, 'special', r.kind);
    spawnPoints.push({ id: `${r.kind}_${r.i}`, type: 'loot', x: r.i % W, y: (r.i / W) | 0, roomId: null, properties: { resource: r.kind } });
  }

  const cells = new Uint8Array(n);
  for (let i = 0; i < n; i++) cells[i] = isWater(ter[i]) ? CELL_HAZARD : CELL_ROOM;
  const result: GenerationResult = {
    seed: gs.seed,
    width: W,
    height: H,
    rooms,
    connections: [],
    doors: [],
    deadEnds: 0,
    spawnPoints,
    cells,
    wallMask: riverMask,
    floorMask: roadMask,
    terrain: ter,
    heights: new Uint8Array(n),
    perspective: 'hex',
    warnings,
  };
  return { result, layerData, objects: [], tileNotice: null };
}
