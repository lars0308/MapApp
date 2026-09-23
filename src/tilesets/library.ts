import type { Perspective, TerrainSet, TileRole, Tileset } from '../types';
import { PERSPECTIVES } from '../types';
import type { LibraryTileset } from '../persistence/db';
import { uid } from '../utils/id';

// Helpers around the tileset library (IndexedDB store "library"):
// summaries for the setup wizard and turning library entries into project tilesets.

/** Tags on floor tiles that describe an arrangement / variant rather than a material. */
const NON_MATERIAL_TAGS = new Set(['edge', 'base', 'upper', 'side', 'front', 'top', 'h', 'v', 'left', 'right', 'broken', 'rare', 'clean', 'moss', 'dark', 'dungeon', 'variant', 'collision', 'cracked']);

export interface TilesetSummary {
  tiles: number;
  roles: TileRole[];
  /** material tags of floor tiles (→ terrain sets) */
  terrains: string[];
  perspectives: Perspective[];
}

export function summarizeTileset(ts: Pick<Tileset, 'tiles' | 'columns' | 'rows' | 'emptyTiles' | 'perspectives'>): TilesetSummary {
  const roles = new Set<TileRole>();
  const terrains = new Set<string>();
  for (const meta of Object.values(ts.tiles)) {
    if (meta.role) roles.add(meta.role);
    const isFloor = meta.category === 'floor' || meta.category === 'floorVariant' || meta.role?.startsWith('floor_') || meta.role === 'raised_floor';
    if (isFloor) for (const t of meta.tags) if (!NON_MATERIAL_TAGS.has(t)) terrains.add(t);
  }
  return {
    tiles: ts.columns * ts.rows - ts.emptyTiles.length,
    roles: [...roles].sort(),
    terrains: [...terrains].sort(),
    perspectives: ts.perspectives.length ? ts.perspectives : [...PERSPECTIVES],
  };
}

/** Library entries → project tilesets with fresh gid ranges starting at `firstGid`. */
export function libraryToProjectTilesets(entries: LibraryTileset[], firstGid: number): { tilesets: Tileset[]; nextGid: number } {
  let gid = firstGid;
  const tilesets = entries.map((e) => {
    const { savedAt: _s, ...rest } = structuredClone(e);
    void _s;
    const ts: Tileset = { ...rest, firstGid: gid, active: true };
    gid += ts.columns * ts.rows;
    return ts;
  });
  return { tilesets, nextGid: gid };
}

const TERRAIN_COLORS = ['#7aa2c8', '#8fb07a', '#c7a0d8', '#d49a6a', '#9ab0b0', '#c9c27a'];

/** Adds a terrain set for every material tag of the given tilesets that has none yet. */
export function withTerrainsFor(terrains: TerrainSet[], tilesets: Pick<Tileset, 'tiles' | 'columns' | 'rows' | 'emptyTiles' | 'perspectives'>[]): TerrainSet[] {
  const out = [...terrains];
  for (const ts of tilesets)
    for (const tag of summarizeTileset(ts).terrains) {
      if (out.some((t) => t.tag === tag)) continue;
      out.push({ id: uid('terrain'), name: tag.charAt(0).toUpperCase() + tag.slice(1), tag, color: TERRAIN_COLORS[out.length % TERRAIN_COLORS.length], weight: 50, active: true });
    }
  return out;
}
