import type { Perspective, TileCategory, Tileset } from '../types';
import { Rng, weightedIndex } from '../generator/rng';

export interface PoolTile {
  gid: number;
  weight: number;
  tags: string[];
}

export function tilesetSupports(ts: Tileset, perspective: Perspective): boolean {
  return !ts.perspectives?.length || ts.perspectives.includes(perspective);
}

/** Weighted tile pools per category, built from all *active* tilesets (matching the perspective). */
export class TilePools {
  private pools = new Map<TileCategory, PoolTile[]>();

  constructor(tilesets: Tileset[], perspective?: Perspective) {
    for (const ts of tilesets) {
      if (!ts.active) continue;
      if (perspective && !tilesetSupports(ts, perspective)) continue;
      const count = ts.columns * ts.rows;
      // iterate indices in order → deterministic pool order
      for (let i = 0; i < count; i++) {
        const meta = ts.tiles[i];
        if (!meta?.category) continue;
        const list = this.pools.get(meta.category) ?? [];
        list.push({ gid: ts.firstGid + i, weight: meta.weight, tags: meta.tags });
        this.pools.set(meta.category, list);
      }
    }
  }

  has(cat: TileCategory): boolean {
    return (this.pools.get(cat)?.length ?? 0) > 0;
  }

  /** First category of the list that has tiles. */
  resolve(cats: TileCategory[]): TileCategory | null {
    for (const c of cats) if (this.has(c)) return c;
    return null;
  }

  pick(rng: Rng, cats: TileCategory[], tag?: string): number {
    const cat = this.resolve(cats);
    if (!cat) return 0;
    let list = this.pools.get(cat)!;
    if (tag) {
      const tagged = list.filter((t) => t.tags.includes(tag));
      if (tagged.length) list = tagged;
    }
    const i = weightedIndex(
      rng,
      list.map((t) => t.weight),
    );
    return i < 0 ? 0 : list[i].gid;
  }

  /** Only tiles carrying the tag (no fallback). */
  pickTagged(rng: Rng, cat: TileCategory, tag: string): number {
    const list = (this.pools.get(cat) ?? []).filter((t) => t.tags.includes(tag));
    if (!list.length) return 0;
    const i = weightedIndex(
      rng,
      list.map((t) => t.weight),
    );
    return list[i].gid;
  }

  pickExcludingTag(rng: Rng, cat: TileCategory, excluded: string[]): number {
    const list = (this.pools.get(cat) ?? []).filter((t) => !t.tags.some((g) => excluded.includes(g)));
    if (!list.length) return 0;
    const i = weightedIndex(
      rng,
      list.map((t) => t.weight),
    );
    return list[i].gid;
  }

  hasTag(cat: TileCategory, tag: string): boolean {
    return (this.pools.get(cat) ?? []).some((t) => t.tags.includes(tag));
  }

  /**
   * First category with tiles; inside it prefer tiles carrying `prefer`
   * and skip tiles carrying any `avoid` tag (each only if something remains).
   */
  pickPref(rng: Rng, cats: TileCategory[], prefer?: string, avoid?: string[]): number {
    const cat = this.resolve(cats);
    if (!cat) return 0;
    let list = this.pools.get(cat)!;
    if (avoid?.length) {
      const kept = list.filter((t) => !t.tags.some((g) => avoid.includes(g)));
      if (kept.length) list = kept;
    }
    if (prefer) {
      const tagged = list.filter((t) => t.tags.includes(prefer));
      if (tagged.length) list = tagged;
    }
    const i = weightedIndex(
      rng,
      list.map((t) => t.weight),
    );
    return i < 0 ? 0 : list[i].gid;
  }
}
