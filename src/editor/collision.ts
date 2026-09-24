import type { LayerRole, Project, TileCategory, TileMeta, TileRole } from '../types';
import { tileOf } from '../tilesets/gid';
import { objectDef } from '../objects/defs';

// Walkability from the *current* map content (incl. manual edits).
// Used by the playtest, the collision overlay and the Godot navigation export.

const BLOCK_CATEGORIES = new Set<TileCategory>([
  'wallTop',
  'wallBottom',
  'wallLeft',
  'wallRight',
  'wallFront',
  'innerCorner',
  'outerCorner',
  'water',
  'lava',
  'abyss',
  'obstacle',
  'pillar',
]);

const NON_BLOCKING_ROLES = new Set<TileRole>([
  'floor_center',
  'floor_edge_top',
  'floor_edge_bottom',
  'floor_edge_left',
  'floor_edge_right',
  'floor_corner',
  'raised_floor',
  'transition',
  'shadow',
  'cliff_shadow',
  'stairs',
  'door',
  'bridge_start',
  'bridge_middle',
  'bridge_end',
  'bridge_left',
  'bridge_right',
  // side view: handled by the side-scroller physics (one-way, climbable, hazard, background)
  'platform',
  'platform_left',
  'platform_right',
  'ladder',
  'spikes',
  'back_wall',
  'lift',
  'lift_track',
  'hex_river',
  'hex_road',
  'path_edge',
]);

/** Does this tile block movement? Explicit `collision` wins, otherwise role / category decide. */
export function tileBlocks(meta: TileMeta | undefined): boolean {
  if (!meta) return false;
  if (meta.collision !== undefined) return meta.collision;
  if (meta.role) return !NON_BLOCKING_ROLES.has(meta.role);
  return !!meta.category && BLOCK_CATEGORIES.has(meta.category);
}

export function isBridgeTile(meta: TileMeta | undefined): boolean {
  return !!meta && (meta.category === 'bridge' || !!meta.role?.startsWith('bridge_'));
}

/** Layers that count as map content (markers and the collision layer itself do not). */
const CONTENT_ROLES = new Set<LayerRole>(['floor', 'groundDetails', 'paths', 'deco', 'shadow', 'walls', 'objects', 'wallsFront', 'objectsFront', 'overhead', 'custom']);

export function metaTable(p: Project): (TileMeta | undefined)[] {
  const table: (TileMeta | undefined)[] = [];
  for (const ts of p.tilesets) {
    for (let i = 0; i < ts.columns * ts.rows; i++) table[ts.firstGid + i] = ts.tiles[i];
    // a tile used only turned (room builder) blocks / walks like its turned role
    for (const v of ts.variants ?? []) table[ts.firstGid + v.index] ??= { category: v.category, role: v.role, tags: [], weight: 60 };
  }
  return table;
}

/**
 * 1 = blocked. A cell is blocked when the collision layer marks it, when a blocking
 * tile lies on it (unless a bridge crosses it), when an object stands on it,
 * or when it has no content at all (void).
 */
export function computeBlocked(p: Project, opts: { voidBlocks?: boolean } = {}): Uint8Array {
  const voidBlocks = opts.voidBlocks ?? true;
  const { width: W, height: H } = p.map;
  const metas = metaTable(p);
  const out = new Uint8Array(W * H);
  const content = p.layers.filter((l) => CONTENT_ROLES.has(l.role));
  const collision = p.layers.filter((l) => l.role === 'collision');
  for (let i = 0; i < W * H; i++) {
    let has = false;
    let bridge = false;
    let block = false;
    for (const l of content) {
      const g = l.data[i];
      if (!g) continue;
      has = true;
      const m = metas[tileOf(g)];
      if (isBridgeTile(m)) bridge = true;
      else if (tileBlocks(m)) block = true;
    }
    const marked = collision.some((l) => l.data[i]);
    out[i] = (!has && voidBlocks) || (has && (marked || (block && !bridge))) ? 1 : 0;
  }
  for (const o of p.objects) {
    const def = objectDef(o.type);
    if (!def) continue;
    for (const [dx, dy] of def.collision) {
      const x = o.x + dx;
      const y = o.y + dy;
      if (x >= 0 && y >= 0 && x < W && y < H) out[y * W + x] = 1;
    }
  }
  return out;
}
