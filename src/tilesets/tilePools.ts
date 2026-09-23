import type { Perspective, TileCategory, TileRole, Tileset } from '../types';
import { Rng, weightedIndex } from '../generator/rng';

export interface PoolTile {
  gid: number;
  weight: number;
  tags: string[];
}

export function tilesetSupports(ts: Tileset, perspective: Perspective): boolean {
  return !ts.perspectives?.length || ts.perspectives.includes(perspective);
}

export interface RoleFallback {
  roles?: TileRole[];
  cats?: TileCategory[];
}

/** Fallback chain per role: other roles first, then plain categories. */
export const ROLE_FALLBACK: Partial<Record<TileRole, RoleFallback>> = {
  floor_center: { cats: ['floor'] },
  floor_edge_top: { roles: ['floor_center'], cats: ['floor'] },
  floor_edge_bottom: { roles: ['floor_center'], cats: ['floor'] },
  floor_edge_left: { roles: ['floor_center'], cats: ['floor'] },
  floor_edge_right: { roles: ['floor_center'], cats: ['floor'] },
  floor_corner: { roles: ['floor_center'], cats: ['floor'] },
  raised_floor: { roles: ['floor_center'], cats: ['floor'] },
  transition: { roles: ['floor_center'], cats: ['floor'] },
  wall_top: { cats: ['wallTop', 'wallBottom'] },
  wall_bottom: { roles: ['wall_top'], cats: ['wallBottom', 'wallTop'] },
  wall_left: { cats: ['wallLeft', 'wallTop'] },
  wall_right: { roles: ['wall_left'], cats: ['wallRight', 'wallLeft', 'wallTop'] },
  wall_horizontal: { roles: ['wall_top', 'wall_bottom'], cats: ['wallTop', 'wallBottom'] },
  wall_vertical: { roles: ['wall_left', 'wall_right'], cats: ['wallLeft', 'wallRight', 'wallTop'] },
  corner_top_left: { cats: ['outerCorner', 'wallTop'] },
  corner_top_right: { roles: ['corner_top_left'], cats: ['outerCorner', 'wallTop'] },
  corner_bottom_left: { roles: ['corner_top_left'], cats: ['outerCorner', 'wallTop'] },
  corner_bottom_right: { roles: ['corner_top_left'], cats: ['outerCorner', 'wallTop'] },
  inner_corner_top_left: { cats: ['innerCorner', 'outerCorner', 'wallTop'] },
  inner_corner_top_right: { roles: ['inner_corner_top_left'], cats: ['innerCorner', 'outerCorner', 'wallTop'] },
  inner_corner_bottom_left: { roles: ['inner_corner_top_left'], cats: ['innerCorner', 'outerCorner', 'wallTop'] },
  inner_corner_bottom_right: { roles: ['inner_corner_top_left'], cats: ['innerCorner', 'outerCorner', 'wallTop'] },
  end_cap_top: { roles: ['wall_vertical', 'wall_left'], cats: ['wallLeft', 'wallTop'] },
  end_cap_bottom: { roles: ['wall_vertical', 'wall_left'], cats: ['wallLeft', 'wallTop'] },
  end_cap_left: { roles: ['wall_horizontal', 'wall_top'], cats: ['wallTop'] },
  end_cap_right: { roles: ['wall_horizontal', 'wall_top'], cats: ['wallTop'] },
  junction_t_up: { roles: ['wall_horizontal', 'wall_bottom'], cats: ['wallBottom', 'wallTop'] },
  junction_t_down: { roles: ['wall_horizontal', 'wall_top'], cats: ['wallTop'] },
  junction_t_left: { roles: ['wall_vertical', 'wall_right'], cats: ['wallRight', 'wallTop'] },
  junction_t_right: { roles: ['wall_vertical', 'wall_left'], cats: ['wallLeft', 'wallTop'] },
  junction_cross: { roles: ['wall_horizontal'], cats: ['innerCorner', 'wallTop'] },
  wall_front: { cats: ['wallFront', 'wallTop'] },
  wall_front_upper: { roles: ['wall_front'], cats: ['wallFront', 'wallTop'] },
  door: { cats: ['door'] },
  bridge_start: { roles: ['bridge_middle'], cats: ['bridge', 'path'] },
  bridge_middle: { cats: ['bridge', 'path'] },
  bridge_end: { roles: ['bridge_middle'], cats: ['bridge', 'path'] },
  bridge_left: { roles: ['bridge_middle'], cats: ['bridge', 'path'] },
  bridge_right: { roles: ['bridge_middle'], cats: ['bridge', 'path'] },
  cliff_top: { roles: ['wall_bottom'], cats: ['wallBottom'] },
  cliff_left: { roles: ['wall_right'], cats: ['wallRight'] },
  cliff_right: { roles: ['wall_left'], cats: ['wallLeft'] },
  cliff_outer_corner: { roles: ['cliff_top'], cats: ['outerCorner'] },
  cliff_inner_corner: { roles: ['cliff_outer_corner'], cats: ['innerCorner'] },
  cliff_front: { roles: ['wall_front'], cats: ['wallFront', 'wallTop'] },
  cliff_bottom: { roles: ['cliff_front'], cats: ['wallFront', 'wallTop'] },
  cliff_shadow: { roles: ['shadow'], cats: ['shadow'] },
  stairs: { cats: ['stairs'] },
  water: { cats: ['water'] },
  lava: { cats: ['lava'] },
  abyss: { cats: ['abyss'] },
  shadow: { cats: ['shadow'] },
  ground_top: { roles: ['ground_fill'], cats: ['wallTop'] },
  ground_top_left: { roles: ['ground_top'], cats: ['wallTop'] },
  ground_top_right: { roles: ['ground_top_left', 'ground_top'], cats: ['wallTop'] },
  ground_left: { roles: ['ground_fill'], cats: ['wallTop'] },
  ground_right: { roles: ['ground_left', 'ground_fill'], cats: ['wallTop'] },
  ground_bottom: { roles: ['ground_fill'], cats: ['wallTop'] },
  ground_inner_left: { roles: ['ground_fill'], cats: ['wallTop'] },
  ground_inner_right: { roles: ['ground_inner_left', 'ground_fill'], cats: ['wallTop'] },
  ground_fill: { roles: ['wall_top'], cats: ['wallTop'] },
  platform: { roles: ['bridge_middle'], cats: ['bridge', 'path'] },
  platform_left: { roles: ['platform'], cats: ['bridge', 'path'] },
  platform_right: { roles: ['platform_left', 'platform'], cats: ['bridge', 'path'] },
  ladder: { cats: ['stairs'] },
  spikes: { cats: ['obstacle'] },
  back_wall: { cats: [] },
};

function pickFrom(rng: Rng, list: PoolTile[], prefer?: string[], avoid?: string[]): number {
  if (avoid?.length) {
    const kept = list.filter((t) => !t.tags.some((g) => avoid.includes(g)));
    if (kept.length) list = kept;
  }
  for (const tag of prefer ?? []) {
    const tagged = list.filter((t) => t.tags.includes(tag));
    if (tagged.length) {
      list = tagged;
    }
  }
  const i = weightedIndex(
    rng,
    list.map((t) => t.weight),
  );
  return i < 0 ? 0 : list[i].gid;
}

/** Pools of one priority tier (a group of tilesets). */
class Tier {
  pools = new Map<TileCategory, PoolTile[]>();
  roles = new Map<TileRole, PoolTile[]>();

  constructor(tilesets: Tileset[]) {
    for (const ts of tilesets) {
      const count = ts.columns * ts.rows;
      // iterate indices in order → deterministic pool order
      for (let i = 0; i < count; i++) {
        const meta = ts.tiles[i];
        if (!meta) continue;
        const t = { gid: ts.firstGid + i, weight: meta.weight, tags: meta.tags };
        if (meta.category) {
          const list = this.pools.get(meta.category) ?? [];
          list.push(t);
          this.pools.set(meta.category, list);
        }
        if (meta.role) {
          const list = this.roles.get(meta.role) ?? [];
          list.push(t);
          this.roles.set(meta.role, list);
        }
      }
    }
  }

  get empty() {
    return this.pools.size === 0 && this.roles.size === 0;
  }

  has(cat: TileCategory) {
    return (this.pools.get(cat)?.length ?? 0) > 0;
  }

  resolve(cats: TileCategory[]): TileCategory | null {
    for (const c of cats) if (this.has(c)) return c;
    return null;
  }

  pickRole(rng: Rng, role: TileRole, prefer?: string[], avoid?: string[], seen = new Set<TileRole>()): number {
    seen.add(role);
    const own = this.roles.get(role);
    if (own?.length) return pickFrom(rng, own, prefer, avoid);
    const fb = ROLE_FALLBACK[role];
    for (const r of fb?.roles ?? []) {
      if (seen.has(r)) continue;
      const g = this.pickRole(rng, r, prefer, avoid, seen);
      if (g) return g;
    }
    const cat = this.resolve(fb?.cats ?? []);
    return cat ? pickFrom(rng, this.pools.get(cat)!, prefer, avoid) : 0;
  }
}

/**
 * Weighted tile pools per category and role.
 *
 * Tiles are looked up in priority tiers, so a missing role never leaves the map empty:
 *   1. active tilesets that support the map perspective
 *   2. active tilesets drawn for another perspective
 *   3. the built-in demo tilesets (even when switched off)
 * Every lookup that had to use tier 2/3 – or found nothing at all – is recorded
 * in `fallbacks` / `missing`, so the UI can tell the user which roles are missing.
 */
export class TilePools {
  private tiers: Tier[];
  /** role / category names served by a fallback tier */
  readonly fallbacks = new Set<string>();
  /** role / category names without any tile */
  readonly missing = new Set<string>();
  /** no active tileset supports the perspective */
  readonly noCompatible: boolean;

  constructor(tilesets: Tileset[], perspective?: Perspective) {
    const active = tilesets.filter((ts) => ts.active);
    if (!perspective) {
      this.tiers = [new Tier(active)];
      this.noCompatible = false;
      return;
    }
    const fits = active.filter((ts) => tilesetSupports(ts, perspective));
    const other = active.filter((ts) => !tilesetSupports(ts, perspective));
    const demo = tilesets.filter((ts) => !ts.active && ts.source === 'demo');
    // demo sets matching the perspective first
    demo.sort((a, b) => Number(tilesetSupports(b, perspective)) - Number(tilesetSupports(a, perspective)));
    this.tiers = [new Tier(fits), new Tier(other), new Tier(demo)];
    this.noCompatible = this.tiers[0].empty;
  }

  /** First tier with a result; records fallback / missing lookups. */
  private lookup(key: string, fn: (t: Tier) => number): number {
    for (let k = 0; k < this.tiers.length; k++) {
      const g = fn(this.tiers[k]);
      if (g) {
        if (k > 0) this.fallbacks.add(key);
        return g;
      }
    }
    this.missing.add(key);
    return 0;
  }

  has(cat: TileCategory): boolean {
    return this.tiers.some((t) => t.has(cat));
  }

  hasRole(role: TileRole): boolean {
    return this.tiers.some((t) => (t.roles.get(role)?.length ?? 0) > 0);
  }

  /** First category of the list that has tiles. */
  resolve(cats: TileCategory[]): TileCategory | null {
    for (const t of this.tiers) {
      const c = t.resolve(cats);
      if (c) return c;
    }
    return null;
  }

  pick(rng: Rng, cats: TileCategory[], tag?: string): number {
    return this.lookup(cats[0], (t) => {
      const cat = t.resolve(cats);
      return cat ? pickFrom(rng, t.pools.get(cat)!, tag ? [tag] : undefined) : 0;
    });
  }

  /** Only tiles carrying the tag (no fallback to untagged tiles). */
  pickTagged(rng: Rng, cat: TileCategory, tag: string): number {
    for (const t of this.tiers) {
      const list = (t.pools.get(cat) ?? []).filter((x) => x.tags.includes(tag));
      if (list.length) return pickFrom(rng, list);
    }
    return 0;
  }

  hasTag(cat: TileCategory, tag: string): boolean {
    return this.tiers.some((t) => (t.pools.get(cat) ?? []).some((x) => x.tags.includes(tag)));
  }

  /**
   * First category with tiles; inside it prefer tiles carrying `prefer`
   * and skip tiles carrying any `avoid` tag (each only if something remains).
   */
  pickPref(rng: Rng, cats: TileCategory[], prefer?: string, avoid?: string[]): number {
    return this.lookup(cats[0], (t) => {
      const cat = t.resolve(cats);
      return cat ? pickFrom(rng, t.pools.get(cat)!, prefer ? [prefer] : undefined, avoid) : 0;
    });
  }

  /**
   * Pick a tile for an auto-tile role. Role tiles win; otherwise the fallback
   * roles and categories of ROLE_FALLBACK are tried (so plain category tilesets work).
   */
  pickRole(rng: Rng, role: TileRole, prefer?: string[], avoid?: string[]): number {
    return this.lookup(role, (t) => t.pickRole(rng, role, prefer, avoid));
  }
}
