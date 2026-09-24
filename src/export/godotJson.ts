import { TERRAIN_NAMES, type Project, type Tileset } from '../types';
import { loadImage, canvasToBlob } from '../utils/image';
import { rleEncode } from '../utils/rle';
import { safeFileName } from '../utils/download';
import { GODOT_LAYER_NAME } from '../layers/defaults';
import { computeBlocked, metaTable, tileBlocks } from '../editor/collision';
import { GRAVITY, LIFT_PAUSE, LIFT_SPEED, buildSideMap, jumpSpeed } from '../playtest/sidePhysics';
import { HEX_COST, HEX_TERRAIN_TAG } from '../generator/hexgen';
import { OBJECT_ATLAS_TILE, OBJECT_DEFS, objectAtlas } from '../objects/defs';

// Map data for Godot 4 (TileMapLayer based, editable after import).
// - every tileset image is re-sampled to the map tile size → TileSet.tile_size == map.tileSize
// - layers stay separate, tiles stay tiles, objects stay objects, collision stays separate
// - y-sort information (layer flags, per-tile sort origin, object sort origin) is explicit
// The editor-only playtest character is never part of this data.

export const GODOT_FORMAT = 'mapforge-godot';
export const OBJECTS_IMAGE = 'objects.png';

export interface GodotTile {
  tilesetId: string;
  tileId: number;
  sourceId: number;
  atlasCoordinates: [number, number];
  x: number;
  y: number;
  layer: string;
  terrainType: string;
  collision: boolean;
  ySortEnabled: boolean;
  /** row (tiles) whose bottom edge is the y-sort origin */
  sortOriginY: number;
}

export function tilesetImageName(ts: Tileset): string {
  return `${safeFileName(ts.id)}.png`;
}

/** Scale a tileset PNG so each tile has `tileSize` pixels. */
export async function scaledTilesetPng(ts: Tileset, tileSize: number): Promise<Blob> {
  const img = await loadImage(ts.dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = ts.columns * tileSize;
  canvas.height = ts.rows * tileSize;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, ts.columns * ts.tileSize, ts.rows * ts.tileSize, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas);
}

/** Object sprite atlas scaled to the map tile size. */
export async function scaledObjectsPng(tileSize: number): Promise<Blob> {
  const atlas = objectAtlas().canvas;
  const s = tileSize / OBJECT_ATLAS_TILE;
  const canvas = document.createElement('canvas');
  canvas.width = atlas.width * s;
  canvas.height = atlas.height * s;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlas, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

type Rect = { x: number; y: number; w: number; h: number };

/** Merge blocked cells into rectangles (row runs, merged vertically). */
export function mergeRects(blocked: Uint8Array, W: number, H: number): Rect[] {
  const out: Rect[] = [];
  let open = new Map<string, Rect>();
  for (let y = 0; y < H; y++) {
    const next = new Map<string, Rect>();
    let x = 0;
    while (x < W) {
      if (!blocked[y * W + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < W && blocked[y * W + x]) x++;
      const key = `${start}:${x - start}`;
      const prev = open.get(key);
      if (prev) {
        prev.h++;
        next.set(key, prev);
        open.delete(key);
      } else next.set(key, { x: start, y, w: x - start, h: 1 });
    }
    for (const r of open.values()) out.push(r);
    open = next;
  }
  for (const r of open.values()) out.push(r);
  return out;
}

export async function buildGodotData(p: Project, opts: { embedImages: boolean; includeShadows?: boolean }) {
  const { width: W, height: H, tileSize } = p.map;
  const metas = metaTable(p);
  const r = p.result;
  const used = new Set<number>();
  for (const l of p.layers) for (let i = 0; i < l.data.length; i++) if (l.data[i]) used.add(l.data[i]);
  const exportedTilesets = p.tilesets.filter((ts) => {
    const n = ts.columns * ts.rows;
    for (let g = ts.firstGid; g < ts.firstGid + n; g++) if (used.has(g)) return true;
    return ts.source === 'upload';
  });
  const sourceIdOf = new Map(exportedTilesets.map((ts, k) => [ts.id, k]));
  const tsFor = (gid: number) => exportedTilesets.find((t) => gid >= t.firstGid && gid < t.firstGid + t.columns * t.rows);

  const tilesets = [];
  for (const ts of exportedTilesets) {
    const n = ts.columns * ts.rows;
    const tiles = [];
    for (let i = 0; i < n; i++) {
      const meta = ts.tiles[i];
      if (!meta?.category && !meta?.role && !used.has(ts.firstGid + i)) continue;
      tiles.push({
        id: i,
        atlas: [i % ts.columns, Math.floor(i / ts.columns)],
        category: meta?.category ?? null,
        role: meta?.role ?? null,
        tags: meta?.tags ?? [],
        weight: meta?.weight ?? 0,
        collision: tileBlocks(meta),
        /** TileData.y_sort_origin in px */
        ySortOrigin: (meta?.sortOffset ?? 0) * tileSize,
      });
    }
    tilesets.push({
      id: ts.id,
      sourceId: sourceIdOf.get(ts.id),
      name: ts.name,
      image: `tilesets/${tilesetImageName(ts)}`,
      ...(opts.embedImages ? { imageBase64: await blobToBase64(await scaledTilesetPng(ts, tileSize)) } : {}),
      tileSize,
      sourceTileSize: ts.tileSize,
      columns: ts.columns,
      rows: ts.rows,
      active: ts.active,
      perspectives: ts.perspectives?.length ? ts.perspectives : ['top_down', 'low_top_down', 'isometric_45'],
      tiles,
    });
  }

  const terrainType = (x: number, y: number) => {
    if (!r) return 'ground';
    const t = r.terrain?.[y * W + x] ?? 0;
    if (t) return TERRAIN_NAMES[t];
    const room = r.rooms.find((room) => x >= room.x && x < room.x + room.width && y >= room.y && y < room.y + room.height);
    return p.terrains.find((tt) => tt.id === room?.terrain)?.tag ?? 'ground';
  };

  const exported = opts.includeShadows === false ? p.layers.filter((l) => l.role !== 'shadow') : p.layers;
  const layers = exported.map((l, order) => {
    const godotName = l.role === 'custom' ? safeFileName(l.name) : GODOT_LAYER_NAME[l.role];
    const tiles: GodotTile[] = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const gid = l.data[y * W + x];
        if (!gid) continue;
        const ts = tsFor(gid);
        if (!ts) continue;
        const local = gid - ts.firstGid;
        const meta = metas[gid];
        tiles.push({
          tilesetId: ts.id,
          tileId: local,
          sourceId: sourceIdOf.get(ts.id)!,
          atlasCoordinates: [local % ts.columns, Math.floor(local / ts.columns)],
          x,
          y,
          layer: godotName,
          terrainType: terrainType(x, y),
          collision: l.role === 'collision' || tileBlocks(meta),
          ySortEnabled: l.ySort,
          sortOriginY: y + (meta?.sortOffset ?? 0),
        });
      }
    return { id: l.id, name: godotName, label: l.name, role: l.role, order, zIndex: order, visible: l.visible, locked: l.locked, ySort: l.ySort, color: l.color, tiles };
  });

  const objects = p.objects.map((o) => {
    const d = OBJECT_DEFS[o.type];
    return {
      id: o.id,
      type: d.godotType,
      x: o.x,
      y: o.y,
      width: d.w,
      height: d.h,
      sprite: { image: OBJECTS_IMAGE, region: [d.sx * tileSize, d.sy * tileSize, d.w * tileSize, d.h * tileSize], overheadRows: d.overheadRows },
      collision: d.collision.map(([dx, dy]) => ({ x: o.x + dx, y: o.y + dy })),
      sortOriginY: o.y,
      sortOriginPx: (o.y + 1) * tileSize,
      ySortEnabled: d.ySort,
      layer: 'ObjectsBack',
    };
  });

  const blocked = computeBlocked(p);
  const solidContent = computeBlocked(p, { voidBlocks: false });
  const walkable = blocked.map((b) => (b ? 0 : 1));

  return {
    version: 1,
    formatRevision: 2,
    format: GODOT_FORMAT,
    generator: 'MapForge',
    exportedAt: new Date().toISOString(),
    map: { name: p.name, width: W, height: H, tileSize, seed: r?.seed ?? p.generator.seed, perspective: p.map.perspective, shadows: p.map.shadows },
    tilesets,
    ...(opts.embedImages ? { objectsImageBase64: await blobToBase64(await scaledObjectsPng(tileSize)) } : {}),
    objectsImage: OBJECTS_IMAGE,
    terrains: p.terrains,
    layers,
    ySort: {
      concept:
        'Layers with ySort=true, all objects and the characters live in one Node2D with y_sort_enabled = true ("World"). Non-sorted layers with a lower order are drawn before it, the others after it.',
      container: 'World',
      sortedLayers: layers.filter((l) => l.ySort).map((l) => l.name),
      charactersNode: 'World/Characters',
    },
    rooms: (r?.rooms ?? []).map((room) => ({
      id: room.id,
      type: room.type,
      shape: room.shape,
      x: room.x,
      y: room.y,
      width: room.width,
      height: room.height,
      center: [room.centerX, room.centerY],
      terrain: p.terrains.find((t) => t.id === room.terrain)?.tag ?? room.terrain,
      connectedRooms: room.connections,
      doors: room.doors ?? [],
      start: room.isStart,
      end: room.isEnd,
      boss: room.isBoss,
      merchant: room.type === 'merchant',
      treasure: room.type === 'treasure',
      quest: room.type === 'quest',
      special: room.special,
    })),
    connections: (r?.connections ?? []).map((c) => ({ id: c.id, fromRoom: c.from, toRoom: c.to, type: c.kind, width: c.width, path: c.path ?? [], door: !!c.door, bridge: !!c.bridge })),
    objects,
    collisions: {
      note: 'Cells that block movement (walls, cliffs, liquids without bridge, obstacles, objects). "rects" are merged for CollisionShape2D.',
      encoding: 'rle',
      cells: rleEncode(solidContent),
      rects: mergeRects(solidContent, W, H),
    },
    ...(p.map.perspective === 'side_view' ? { side: sideData(p) } : {}),
    ...(p.map.perspective === 'hex' && r ? { hex: hexData(p) } : {}),
    spawnPoints: r?.spawnPoints ?? [],
    spawnTypes: ['player', 'enemy', 'loot', 'npc', 'quest'],
    navigation: {
      note: 'walkable: 1 = floor, path, bridge, door, stairs. Use with AStarGrid2D (region = map rect, cell_size = tileSize) or to bake a NavigationPolygon.',
      cellSize: tileSize,
      encoding: 'rle',
      walkable: rleEncode(walkable),
      heights: r?.heights ? rleEncode(r.heights) : [],
    },
    structure: r
      ? {
          encoding: 'rle',
          legend: { 0: 'void', 1: 'room', 2: 'corridor', 3: 'wall', 4: 'hazard' },
          cells: rleEncode(r.cells),
          terrainLegend: Object.fromEntries(TERRAIN_NAMES.map((n, i) => [i, n])),
          terrain: r.terrain ? rleEncode(r.terrain) : [],
          wallMaskBits: { N: 1, NE: 2, E: 4, SE: 8, S: 16, SW: 32, W: 64, NW: 128 },
          wallMask: rleEncode(r.wallMask),
          floorMaskBits: { N: 1, E: 2, S: 4, W: 8 },
          floorMask: rleEncode(r.floorMask),
        }
      : null,
  };
}

/**
 * Side-scroller data for the loader: one-way platforms (row runs), ladders (column runs),
 * hazard areas (spikes, water, lava), the goal and the jump physics in pixels –
 * the same numbers as the editor playtest, so the level plays the same in Godot.
 */
function sideData(p: Project) {
  const m = buildSideMap(p);
  const { W, H } = m;
  const ts = p.map.tileSize;
  const platforms: { x: number; y: number; w: number }[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!m.platform[y * W + x]) continue;
      let e = x;
      while (e + 1 < W && m.platform[y * W + e + 1]) e++;
      platforms.push({ x, y, w: e - x + 1 });
      x = e;
    }
  const ladders: { x: number; y: number; h: number }[] = [];
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) {
      if (!m.ladder[y * W + x]) continue;
      let e = y;
      while (e + 1 < H && m.ladder[(e + 1) * W + x]) e++;
      ladders.push({ x, y, h: e - y + 1 });
      y = e;
    }
  const tune = jumpSpeed(p);
  return {
    note: 'Built by the loader: platforms = one-way StaticBody2D, lifts = AnimatableBody2D (tiles of ObjectsBack at the bottom row move along, tween top ↔ bottom), ladders = Area2D group "ladder", hazards = Area2D group "hazard" (calls hazard_hit() / hurt() on the body), goal = Area2D, signal goal_reached.',
    platforms,
    ladders,
    hazards: mergeRects(m.hazard, W, H),
    lifts: m.lifts.map((l) => ({ x: l.x0, w: l.x1 - l.x0 + 1, top: l.top, bottom: l.bottom, speed: LIFT_SPEED, pause: LIFT_PAUSE })),
    goal: m.goal,
    physics: {
      gravity: Math.round(GRAVITY * ts),
      jumpVelocity: Math.round(-tune.jumpV * ts),
      runSpeed: Math.round(tune.speed * ts),
      walkSpeed: Math.round(tune.speed * ts * 0.6),
      jumpHeightTiles: p.generator.side?.jumpHeight ?? 3,
      jumpWidthTiles: p.generator.side?.jumpWidth ?? 4,
    },
    fallLimit: (H + 2) * ts,
  };
}

/**
 * Hex data for the loader: terrain per hex (+ movement costs), river / road neighbour masks,
 * settlements and the players' capitals. Layout: odd rows shifted (Godot TILE_LAYOUT_STACKED,
 * TILE_OFFSET_AXIS_HORIZONTAL); a TileMapLayer's get_surrounding_cells() gives the neighbours.
 */
function hexData(p: Project) {
  const r = p.result!;
  const costs: Record<string, number> = {};
  for (const [code, name] of Object.entries(HEX_TERRAIN_TAG)) {
    const c = HEX_COST[Number(code)];
    costs[name] = isFinite(c) ? c : -1;
  }
  return {
    note: 'terrain: RLE of terrain codes (terrainLegend), costs: movement cost per terrain (-1 = not walkable), masks: E=1 SE=2 SW=4 W=8 NW=16 NE=32',
    layout: { shape: 'hexagon', layout: 'stacked', offsetAxis: 'horizontal', rowStep: 0.75 },
    terrainLegend: Object.fromEntries(TERRAIN_NAMES.map((n, i) => [i, n])),
    terrain: rleEncode(r.terrain),
    costs,
    rivers: rleEncode(r.wallMask),
    roads: rleEncode(r.floorMask),
    settlements: r.rooms.map((room) => ({ x: room.x, y: room.y, kind: room.terrain })),
    players: r.spawnPoints.filter((sp) => sp.type === 'player').map((sp) => ({ player: sp.properties.player, x: sp.x, y: sp.y })),
    resources: r.spawnPoints.filter((sp) => sp.properties.resource).map((sp) => ({ kind: sp.properties.resource, x: sp.x, y: sp.y })),
  };
}
