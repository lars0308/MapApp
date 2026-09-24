import { SIDE_THEMES,
  CELL_HAZARD,
  CELL_ROOM,
  CELL_WALL,
  T_LADDER,
  T_LIFT,
  T_LAVA,
  T_PLATFORM,
  T_SPIKES,
  T_WATER,
  type Connection,
  type GenerationResult,
  type LayerRole,
  type Room,
  type SideSettings,
  type SpawnPoint,
  type SpecialRoomType,
  type TileRole,
} from '../types';
import { Rng } from './rng';
import { TilePools } from '../tilesets/tilePools';
import { defaultSide } from './presets';
import type { GenerateInput, GenerateOutput } from './index';

// Side-scroller level generator (perspective side_view).
//
// The level is built left → right from sections: flat ground, steps, pits (abyss, water,
// lava, spikes), long pits with floating platforms, upper routes with a reward, and towers
// with a ladder. Every section is only built within the jump the player has (jumpHeight up,
// jumpWidth across), so the level is always playable from the start to the goal.
//
// Rows grow downwards: "top[x]" is the first solid row of column x (H = no ground / abyss).
// A figure stands in the row above a solid cell or a platform.

type Hazard = 'abyss' | 'water' | 'lava' | 'spikes';

interface Plat {
  x0: number;
  x1: number;
  y: number;
}

interface Feature {
  type: SpecialRoomType | 'normal';
  x0: number;
  x1: number;
  /** stand row */
  y: number;
}

export function generateSide(input: GenerateInput): GenerateOutput {
  const { settings: gs, map } = input;
  const s: SideSettings = { ...defaultSide(), ...gs.side, hazards: { ...defaultSide().hazards, ...gs.side?.hazards } };
  const W = Math.max(40, map.width);
  const H = Math.max(16, map.height);
  const root = Rng.fromString(gs.seed);
  const rLevel = root.fork(211);
  const rTiles = root.fork(223);
  const rDeco = root.fork(227);
  const rSpawn = root.fork(229);
  const warnings: string[] = [];

  const JH = Math.max(1, Math.min(6, Math.round(s.jumpHeight)));
  const JW = Math.max(2, Math.min(8, Math.round(s.jumpWidth)));
  // cave and castle: ceiling above and a back wall (indoors)
  const theme = SIDE_THEMES[s.style] ?? SIDE_THEMES.outdoor;
  const cave = theme.indoor;
  const n = W * H;

  const solid = new Uint8Array(n);
  const terrain = new Uint8Array(n);
  const top = new Int32Array(W).fill(H);
  const plats: Plat[] = [];
  const ladders: { x: number; y0: number; y1: number }[] = [];
  /** lifts: platform row travels between top and bottom (rows) */
  const lifts: { x0: number; x1: number; top: number; bottom: number }[] = [];
  const features: Feature[] = [];
  const hazards: Hazard[] = (['abyss', 'water', 'lava', 'spikes'] as Hazard[]).filter((h) => s.hazards[h]);
  if (!hazards.length) hazards.push('abyss');

  const minTop = cave ? JH + 6 : JH + 4;
  const maxTop = H - 3;
  const base = Math.max(minTop, Math.min(maxTop, H - Math.max(5, Math.floor(H * 0.25))));
  let cur = base;
  let x = 0;

  const setTop = (x0: number, x1: number, t: number) => {
    for (let c = Math.max(0, x0); c <= Math.min(W - 1, x1); c++) top[c] = t;
  };
  /** pit from x0..x1 at ground level `lvl` with the given bottom */
  const pit = (x0: number, x1: number, lvl: number, h: Hazard) => {
    if (h === 'abyss') setTop(x0, x1, H);
    else if (h === 'spikes') {
      const floor = Math.min(H - 1, lvl + 2);
      setTop(x0, x1, floor);
      for (let c = x0; c <= x1; c++) terrain[(floor - 1) * W + c] = T_SPIKES;
    } else {
      const floor = Math.min(H - 1, lvl + 3);
      setTop(x0, x1, floor);
      for (let c = x0; c <= x1; c++) for (let y = lvl + 1; y < floor; y++) terrain[y * W + c] = h === 'water' ? T_WATER : T_LAVA;
    }
  };
  const addPlat = (x0: number, x1: number, y: number) => plats.push({ x0: Math.max(1, x0), x1: Math.min(W - 2, x1), y });

  // start area
  const START = 7;
  setTop(0, START - 1, cur);
  features.push({ type: 'start', x0: 1, x1: START - 2, y: cur - 1 });
  x = START;

  // end area (goal) + optional boss arena before it
  const END = 10;
  const boss = gs.specials.boss;
  const ARENA = boss ? 16 : 0;
  const stopAt = W - END - ARENA;

  const weights = () => {
    const w: [string, number][] = [
      ['flat', 30],
      ['step', 8 + s.hills * 0.5],
      ['gap', s.gaps * 0.55],
      ['sky', s.platforms * 0.3],
      ['ledge', s.platforms * 0.3],
      ['tower', s.ladders ? 4 + s.hills * 0.12 : 0],
      ['lift', s.lifts !== false ? 3 + s.hills * 0.1 : 0],
    ];
    return w.filter(([, v]) => v > 0);
  };
  const pick = () => {
    const w = weights();
    let r = rLevel.next() * w.reduce((a, [, v]) => a + v, 0);
    for (const [k, v] of w) if ((r -= v) < 0) return k;
    return 'flat';
  };

  let last = 'flat';
  while (x < stopAt - 2) {
    const room = stopAt - x;
    let kind = pick();
    // no two pits in a row without ground in between
    if ((kind === 'gap' || kind === 'sky') && (last === 'gap' || last === 'sky')) kind = 'flat';
    if (kind === 'sky' && room < JW * 3 + 6) kind = 'gap';
    if (kind === 'ledge' && room < 12) kind = 'flat';
    if (kind === 'tower' && room < 14) kind = 'step';
    if (kind === 'lift' && room < 16) kind = 'step';
    if (kind === 'gap' && room < JW + 4) kind = 'flat';
    last = kind;

    if (kind === 'flat') {
      const len = Math.min(room, rLevel.int(3, 8));
      setTop(x, x + len - 1, cur);
      if (len >= 5) features.push({ type: 'normal', x0: x, x1: x + len - 1, y: cur - 1 });
      x += len;
    } else if (kind === 'step') {
      const up = rLevel.chance(cur > base ? 0.65 : cur < base - JH ? 0.3 : 0.5);
      const dh = up ? rLevel.int(1, JH) : rLevel.int(1, Math.max(1, JH + 1));
      cur = Math.max(minTop, Math.min(maxTop, cur + (up ? -dh : dh)));
      const len = Math.min(room, rLevel.int(3, 7));
      setTop(x, x + len - 1, cur);
      x += len;
    } else if (kind === 'gap') {
      const g = rLevel.int(2, JW);
      pit(x, x + g - 1, cur, rLevel.pick(hazards));
      x += g;
      // landing: same height or a little lower / higher (within the jump)
      cur = Math.max(minTop, Math.min(maxTop, cur + rLevel.int(-1, 1)));
      const len = Math.min(stopAt - x, rLevel.int(3, 5));
      setTop(x, x + len - 1, cur);
      x += len;
    } else if (kind === 'sky') {
      // long pit, crossed on floating one-way platforms
      const width = Math.min(room - 4, rLevel.int(JW * 2 + 3, JW * 4));
      const x0 = x;
      const x1 = x + width - 1;
      pit(x0, x1, cur, rLevel.pick(hazards));
      let px = x0 - 1; // last standing column
      let py = cur; // last standing surface row (solid row)
      const midLoot = rLevel.chance(s.loot / 100);
      let placed = 0;
      while (true) {
        const gap = rLevel.int(2, JW - 1);
        const w = rLevel.int(2, 4);
        const nx0 = px + 1 + gap;
        if (nx0 + w - 1 > x1 - 2) break;
        const ny = Math.max(minTop - 1, Math.min(cur + 1, py - rLevel.int(-2, JH - 1)));
        addPlat(nx0, nx0 + w - 1, ny);
        placed++;
        if (midLoot && placed === 2) features.push({ type: 'treasure', x0: nx0, x1: nx0 + w - 1, y: ny - 1 });
        px = nx0 + w - 1;
        py = ny;
      }
      // the landing must be reachable from the last platform (or the start edge)
      const land = x1 + 1;
      if (land - px - 1 > JW - 1) {
        const w = 2;
        const nx0 = Math.max(px + 2, land - JW);
        addPlat(nx0, nx0 + w - 1, Math.min(cur, py));
        py = Math.min(cur, py);
      }
      cur = Math.max(minTop, Math.min(maxTop, Math.max(cur - 1, py + rLevel.int(0, 2))));
      if (py - cur > JH) cur = py - JH + 1;
      x = land;
      const len = Math.min(stopAt - x, rLevel.int(3, 5));
      setTop(x, x + len - 1, cur);
      x += len;
    } else if (kind === 'ledge') {
      // flat ground with an upper route of stacked one-way platforms and a reward on top
      const len = Math.min(room, rLevel.int(10, 15));
      setTop(x, x + len - 1, cur);
      let py = cur;
      let px = x + rLevel.int(1, 3);
      const steps = rLevel.int(1, 3);
      for (let k = 0; k < steps; k++) {
        const ny = py - rLevel.int(2, JH);
        if (ny < minTop - 1) break;
        const w = rLevel.int(3, 4);
        const nx = Math.min(x + len - w - 1, px);
        addPlat(nx, nx + w - 1, ny);
        py = ny;
        px = nx + rLevel.int(2, 4);
        if (k === steps - 1 && rLevel.chance(0.4 + s.loot / 200)) features.push({ type: 'treasure', x0: nx, x1: nx + w - 1, y: ny - 1 });
      }
      x += len;
    } else if (kind === 'tower') {
      // raised block too high to jump – a ladder leads up
      const rise = rLevel.int(JH + 2, JH + 4);
      const nt = Math.max(minTop, cur - rise);
      if (cur - nt <= JH + 1) {
        // not high enough for a ladder / lift (top of the map): a normal step within the jump
        cur = Math.max(nt, cur - JH);
        const len = Math.min(stopAt - x, rLevel.int(3, 6));
        setTop(x, x + len - 1, cur);
        x += len;
        continue;
      }
      setTop(x, x + 1, cur);
      ladders.push({ x: x + 1, y0: nt - 1, y1: cur - 1 });
      const len = Math.min(stopAt - x - 2, rLevel.int(5, 9));
      setTop(x + 2, x + 1 + len, nt);
      if (rLevel.chance(s.loot / 100)) features.push({ type: 'treasure', x0: x + 3, x1: x + len, y: nt - 1 });
      x += 2 + len;
      cur = nt;
    } else if (kind === 'lift') {
      // high ledge – a lift (3 wide) goes up and down next to it
      const rise = rLevel.int(JH + 3, JH + 7);
      const nt = Math.max(minTop, cur - rise);
      if (cur - nt <= JH + 1) {
        // not high enough for a ladder / lift (top of the map): a normal step within the jump
        cur = Math.max(nt, cur - JH);
        const len = Math.min(stopAt - x, rLevel.int(3, 6));
        setTop(x, x + len - 1, cur);
        x += len;
        continue;
      }
      // the lift sits in a 1 deep shaft: flush with the ground below and the ledge above
      const w = 3;
      setTop(x, x + 1, cur);
      setTop(x + 2, x + 1 + w, cur + 1);
      lifts.push({ x0: x + 2, x1: x + 1 + w, top: nt, bottom: cur });
      const len = Math.min(stopAt - x - 2 - w, rLevel.int(5, 9));
      setTop(x + 2 + w, x + 1 + w + len, nt);
      if (rLevel.chance(s.loot / 100)) features.push({ type: 'treasure', x0: x + 3 + w, x1: x + w + len, y: nt - 1 });
      x += 2 + w + len;
      cur = nt;
    }
  }
  // make sure the arena / goal is reachable: at most one jump up from here
  const endLevel = Math.max(minTop, Math.min(maxTop, cur));
  setTop(x, W - 1, endLevel);
  if (boss) features.push({ type: 'boss', x0: stopAt + 1, x1: stopAt + ARENA - 2, y: endLevel - 1 });
  features.push({ type: 'end', x0: W - END + 1, x1: W - 3, y: endLevel - 1 });

  // solid ground + side walls
  for (let c = 0; c < W; c++) for (let y = top[c]; y < H; y++) solid[y * W + c] = 1;
  for (let y = 0; y < H; y++) solid[y * W] = solid[y * W + W - 1] = 1;
  for (const p of plats) for (let c = p.x0; c <= p.x1; c++) if (!solid[p.y * W + c]) terrain[p.y * W + c] = T_PLATFORM;
  for (const l of ladders) for (let y = l.y0; y <= l.y1; y++) terrain[y * W + l.x] = T_LADDER;
  for (const l of lifts) for (let y = l.top; y <= l.bottom; y++) for (let c = l.x0; c <= l.x1; c++) terrain[y * W + c] = T_LIFT;

  // cave: ceiling that always leaves room to jump
  const ceil = new Int32Array(W).fill(-1);
  if (cave) {
    const need = new Int32Array(W).fill(H);
    for (let c = 0; c < W; c++) need[c] = Math.min(top[c] >= H ? H - 3 : top[c], ...plats.filter((p) => c >= p.x0 - 1 && c <= p.x1 + 1).map((p) => p.y), ...ladders.filter((l) => l.x === c).map((l) => l.y0), ...lifts.filter((l) => c >= l.x0 - 1 && c <= l.x1 + 1).map((l) => l.top));
    let wave = 0;
    for (let c = 0; c < W; c++) {
      let lo = H;
      for (let k = -2; k <= 2; k++) lo = Math.min(lo, need[Math.max(0, Math.min(W - 1, c + k))]);
      wave = Math.max(-1, Math.min(2, wave + rLevel.int(-1, 1)));
      ceil[c] = Math.max(1, lo - (JH + 3) - Math.max(0, wave));
      if (rLevel.chance(0.08)) ceil[c] = Math.min(lo - (JH + 2), ceil[c] + 1); // stalactite
    }
    for (let c = 0; c < W; c++) for (let y = 0; y <= ceil[c]; y++) solid[y * W + c] = 1;
  }

  // ------------------------------------------------------------------ tiles
  const pools = new TilePools(input.tilesets, 'side_view');
  const style = theme.tag;
  const prefer = ['side', style];
  const byRole = new Map<LayerRole, Uint32Array>();
  const layerData: Record<string, Uint32Array> = {};
  for (const l of input.layers) {
    if (l.role === 'custom' || byRole.has(l.role)) continue;
    const arr = new Uint32Array(n);
    byRole.set(l.role, arr);
    layerData[l.id] = arr;
  }
  const L = (r: LayerRole) => byRole.get(r);
  const groundL = L('walls') ?? L('floor');
  const backL = L('floor');
  const propL = L('objects') ?? groundL;
  const liquidL = L('overhead') ?? L('objectsFront') ?? propL;
  const decoL = L('deco');
  const colL = L('collision');
  const gameL = L('gameplay');
  const spawnL = L('spawn');
  const collisionGid = pools.pickTagged(rTiles, 'special', 'collision');

  const isSolid = (c: number, y: number) => (c < 0 || c >= W || y >= H ? true : y < 0 ? false : !!solid[y * W + c]);
  for (let y = 0; y < H; y++)
    for (let c = 0; c < W; c++) {
      const i = y * W + c;
      if (!solid[i]) continue;
      if (groundL) groundL[i] = pools.pickRole(rTiles, groundRole(isSolid, c, y), prefer);
      if (colL && collisionGid) colL[i] = collisionGid;
    }

  for (const p of plats)
    for (let c = p.x0; c <= p.x1; c++) {
      const i = p.y * W + c;
      if (solid[i] || !propL) continue;
      const role: TileRole = p.x0 === p.x1 ? 'platform' : c === p.x0 ? 'platform_left' : c === p.x1 ? 'platform_right' : 'platform';
      propL[i] = pools.pickRole(rTiles, role, ['side']);
    }
  for (let i = 0; i < n; i++) {
    const t = terrain[i];
    if (t === T_LADDER && propL) propL[i] = pools.pickRole(rTiles, 'ladder', ['side']);
    else if (t === T_SPIKES && propL) propL[i] = pools.pickRole(rTiles, 'spikes', ['side']);
    else if ((t === T_WATER || t === T_LAVA) && liquidL) {
      const surface = terrain[i - W] !== t;
      liquidL[i] = pools.pickRole(rTiles, t === T_WATER ? 'water' : 'lava', ['side', surface ? 'top' : 'deep']);
    }
  }

  // cave back wall behind the whole playable area
  if (cave && backL && backL !== groundL && pools.hasRole('back_wall'))
    for (let i = 0; i < n; i++) if (!solid[i]) backL[i] = pools.pickRole(rTiles, 'back_wall', ['side', style]);
  // lifts: the platform stands at the bottom, its rail shows the way up (the lift moves along it)
  for (const l of lifts)
    for (let c = l.x0; c <= l.x1; c++) {
      if (propL) propL[l.bottom * W + c] = pools.pickRole(rTiles, 'lift', ['side']);
      if (backL) for (let y = l.top; y < l.bottom; y++) backL[y * W + c] = pools.pickRole(rTiles, 'lift_track', ['side']);
    }

  // spawns: player, enemies on flat ground, loot, boss; goal marker
  const spawnPoints: SpawnPoint[] = [];
  const standY = (c: number) => top[c] - 1;
  const busy = new Set<number>();
  const addSpawn = (type: SpawnPoint['type'], c: number, y: number, roomId: number | null, props: SpawnPoint['properties'] = {}) => {
    spawnPoints.push({ id: `${type}_${spawnPoints.length}`, type, x: c, y, roomId, properties: props });
    busy.add(y * W + c);
  };
  addSpawn('player', 2, standY(2), 0);
  // enemies patrol flat stretches of ground (not at the start, not in the goal area)
  const enemyChance = s.enemies / 100;
  for (let c = START + 3; c < W - END; ) {
    let e = c;
    while (e + 1 < W - END && top[e + 1] === top[c]) e++;
    const len = e - c + 1;
    if (top[c] < H && len >= 4 && rSpawn.chance(enemyChance)) {
      const ec = Math.round((c + e) / 2);
      const i = standY(ec) * W + ec;
      if (!terrain[i] && !busy.has(i)) addSpawn('enemy', ec, standY(ec), null, { ground: true, patrol: len });
    }
    c = e + 1;
  }

  // rooms (sections) for the data model: start, treasures, boss, end
  const rooms: Room[] = [];
  for (const f of features) {
    if (f.type === 'normal') continue;
    const id = rooms.length;
    const cx = Math.round((f.x0 + f.x1) / 2);
    const h = Math.min(JH + 2, f.y + 1);
    rooms.push({
      id,
      type: f.type,
      shape: 'rect',
      x: f.x0,
      y: f.y - h + 1,
      width: f.x1 - f.x0 + 1,
      height: h,
      centerX: cx,
      centerY: f.y,
      area: (f.x1 - f.x0 + 1) * h,
      connections: [],
      isStart: f.type === 'start',
      isEnd: f.type === 'end',
      isBoss: f.type === 'boss',
      special: f.type === 'start' || f.type === 'end' ? null : f.type,
      terrain: cave ? 'cave' : 'outdoor',
      doors: [],
    });
    if (f.type === 'treasure') addSpawn('loot', cx, f.y, id);
    if (f.type === 'boss') addSpawn('enemy', cx, f.y, id, { boss: true });
  }
  rooms.sort((a, b) => a.x - b.x).forEach((r, i) => (r.id = i));
  for (const sp of spawnPoints) if (sp.roomId !== null) sp.roomId = rooms.find((r) => sp.x >= r.x && sp.x < r.x + r.width)?.id ?? null;
  const connections: Connection[] = [];
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1];
    const b = rooms[i];
    connections.push({ id: i - 1, from: a.id, to: b.id, kind: 'main', width: 1, length: b.centerX - a.centerX, path: [], door: false, bridge: false });
    a.connections.push(b.id);
    b.connections.push(a.id);
  }

  if (spawnL)
    for (const sp of spawnPoints) {
      let gid = pools.pickTagged(rTiles, 'spawn', sp.type);
      if (sp.type === 'loot') gid = pools.pickTagged(rTiles, 'spawn', 'treasure') || gid;
      if (!gid) gid = pools.pick(rTiles, ['spawn']);
      if (gid) spawnL[sp.y * W + sp.x] = gid;
    }
  const end = rooms.find((r) => r.isEnd);
  if (end && gameL) {
    const gid = pools.pickTagged(rTiles, 'special', 'goal') || pools.pickTagged(rTiles, 'special', 'end');
    if (gid) gameL[end.centerY * W + end.centerX] = gid;
  }

  // deco on top of the ground (grass, flowers, rocks / crystals in caves)
  if (decoL && gs.decoDensity > 0) {
    const p = (gs.decoDensity / 100) * 0.35;
    for (let y = 1; y < H; y++)
      for (let c = 1; c < W - 1; c++) {
        const i = y * W + c;
        if (solid[i] || terrain[i] || !solid[i + W] || busy.has(i)) continue;
        if (gameL?.[i]) continue;
        if (rDeco.chance(p)) decoL[i] = pickDeco(pools, rDeco, style);
      }
  }

  // structure grid for stats, navigation export and the collision overlay
  const cells = new Uint8Array(n);
  for (let i = 0; i < n; i++) cells[i] = solid[i] ? CELL_WALL : terrain[i] === T_WATER || terrain[i] === T_LAVA || terrain[i] === T_SPIKES ? CELL_HAZARD : CELL_ROOM;
  const heights = new Uint8Array(n);

  if (W < 60) warnings.push('Kurzes Level – für mehr Abschnitte die Karte breiter machen.');

  const result: GenerationResult = {
    seed: gs.seed,
    width: W,
    height: H,
    rooms,
    connections,
    doors: [],
    deadEnds: 0,
    spawnPoints,
    cells,
    wallMask: new Uint8Array(n),
    floorMask: new Uint8Array(n),
    terrain,
    heights,
    perspective: 'side_view',
    warnings,
  };
  return { result, layerData, objects: [], tileNotice: null };
}

/** deco of the side set in the theme (grass outside, crystals in caves, snow pines …) */
function pickDeco(pools: TilePools, rng: Rng, style: string): number {
  return pools.pickPrefs(rng, ['deco'], ['side', style], ['grass', 'cave', 'castle', 'snow', 'sand'].filter((t) => t !== style));
}
/** auto-tile role of a solid ground cell from its air neighbours (also used by Auto-Boden) */
export function groundRole(isSolid: (x: number, y: number) => boolean, c: number, y: number): TileRole {
  const nA = !isSolid(c, y - 1);
  const sA = !isSolid(c, y + 1);
  const wA = !isSolid(c - 1, y);
  const eA = !isSolid(c + 1, y);
  if (nA) return wA && !eA ? 'ground_top_left' : eA && !wA ? 'ground_top_right' : 'ground_top';
  if (wA && !eA) return 'ground_left';
  if (eA && !wA) return 'ground_right';
  if (sA) return 'ground_bottom';
  if (!isSolid(c - 1, y - 1)) return 'ground_inner_left';
  if (!isSolid(c + 1, y - 1)) return 'ground_inner_right';
  return 'ground_fill';
}
