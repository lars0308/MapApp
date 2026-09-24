import { profileFromPerspective } from '../profiles';
import type { GeneratorSettings, Layer, Project } from '../types';
import { DEFAULT_MAP, defaultGenerator, defaultTerrain, defaultTerrainSets } from '../generator/presets';
import { DEFAULT_LAYERS, layerFromDef } from '../layers/defaults';
import { DEMO_AUTOTILE_IDS, createDemoAutotileSets } from '../tilesets/demoAutotiles';
import { DEMO_SIDE_ID, createDemoSideTileset } from '../tilesets/demoSide';
import { DEMO_HEX_ID, createDemoHexTileset } from '../tilesets/demoHex';

type LegacyGenerator = GeneratorSettings & { hazards?: number; lava?: boolean; water?: boolean; abyss?: boolean };

/**
 * Bring projects saved by older app versions up to date:
 * perspective, terrain settings, terrain sets, objects, new layers (with y-sort)
 * and the auto-tile demo tilesets.
 */
export function migrateProject(p: Project): Project {
  const map = { ...DEFAULT_MAP, ...p.map, perspective: p.map.perspective ?? 'top_down', shadows: p.map.shadows ?? false };

  const old = p.generator as LegacyGenerator;
  const base = defaultGenerator(old.seed);
  const terrain = old.terrain ?? {
    ...defaultTerrain(),
    water: { enabled: old.water ?? true, amount: old.hazards ?? 20 },
    lava: { enabled: old.lava ?? true, amount: old.hazards ?? 20 },
    abyss: { ...defaultTerrain().abyss, enabled: old.abyss ?? false },
    cliffs: { enabled: false, amount: 25 },
  };
  const generator: GeneratorSettings = { ...base, ...old, terrain, objects: old.objects ?? base.objects };
  delete (generator as LegacyGenerator).hazards;
  delete (generator as LegacyGenerator).lava;
  delete (generator as LegacyGenerator).water;
  delete (generator as LegacyGenerator).abyss;

  let tilesets = p.tilesets.map((t) =>
    t.perspectives ? t : { ...t, perspectives: t.source === 'demo' ? ['top_down', 'low_top_down', 'isometric_45'] : [] },
  ) as Project['tilesets'];
  let nextGid = p.nextGid;
  if (!tilesets.some((t) => DEMO_AUTOTILE_IDS.includes(t.id))) {
    const sets = createDemoAutotileSets(nextGid);
    tilesets = [...tilesets, ...sets];
    const last = sets[sets.length - 1];
    nextGid = last.firstGid + last.columns * last.rows;
  }
  // side-scroller demo tiles (v2.5); v2.7 added the lift tiles at the end (same size, same ids)
  const oldSide = tilesets.find((t) => t.id === DEMO_SIDE_ID);
  if (oldSide && !Object.values(oldSide.tiles).some((m) => m.role === 'lift')) {
    const fresh = createDemoSideTileset(oldSide.firstGid);
    if (fresh.columns * fresh.rows <= oldSide.columns * oldSide.rows) tilesets = tilesets.map((t) => (t.id === DEMO_SIDE_ID ? { ...fresh, active: t.active } : t));
  }
  if (!tilesets.some((t) => t.id === DEMO_SIDE_ID)) {
    const side = createDemoSideTileset(nextGid);
    tilesets = [...tilesets, side];
    nextGid = side.firstGid + side.columns * side.rows;
  }
  // hex demo tiles (v2.8)
  if (!tilesets.some((t) => t.id === DEMO_HEX_ID)) {
    const hex = createDemoHexTileset(nextGid);
    tilesets = [...tilesets, hex];
    nextGid = hex.firstGid + hex.columns * hex.rows;
  }

  // layers: y-sort flag + missing default roles at their default position
  const size = map.width * map.height;
  let layers: Layer[] = p.layers.map((l) => ({ ...l, ySort: l.ySort ?? DEFAULT_LAYERS.find((d) => d.role === l.role)?.ySort ?? false }));
  DEFAULT_LAYERS.forEach((def, di) => {
    if (layers.some((l) => l.role === def.role)) return;
    // insert after the closest existing predecessor in the default order
    let at = 0;
    for (let k = di - 1; k >= 0; k--) {
      const idx = layers.findIndex((l) => l.role === DEFAULT_LAYERS[k].role);
      if (idx >= 0) {
        at = idx + 1;
        break;
      }
    }
    layers = [...layers.slice(0, at), layerFromDef(def, size), ...layers.slice(at)];
  });

  const result = p.result
    ? {
        ...p.result,
        perspective: p.result.perspective ?? map.perspective,
        floorMask: p.result.floorMask ?? new Uint8Array(p.result.width * p.result.height),
        terrain: p.result.terrain ?? new Uint8Array(p.result.width * p.result.height),
        heights: p.result.heights ?? new Uint8Array(p.result.width * p.result.height),
        rooms: p.result.rooms.map((r) => ({ ...r, terrain: r.terrain ?? 'terrain_stone', doors: r.doors ?? [] })),
        connections: p.result.connections.map((c) => ({ ...c, path: c.path ?? [], door: c.door ?? false, bridge: c.bridge ?? false })),
      }
    : null;
  return {
    ...p,
    map,
    generator,
    tilesets,
    nextGid,
    layers,
    result,
    terrains: p.terrains ?? defaultTerrainSets(),
    objects: p.objects ?? [],
    mode: p.mode ?? 'generate',
    profile: p.profile ?? profileFromPerspective(map.perspective),
  };
}
