import { profileFromPerspective } from '../profiles';
import type { GeneratorSettings, Layer, Project } from '../types';
import { DEFAULT_MAP, defaultGenerator, defaultTerrain, defaultTerrainSets } from '../generator/presets';
import { DEFAULT_LAYERS, layerFromDef } from '../layers/defaults';
import { DEMO_AUTOTILE_IDS, createDemoAutotileSets } from '../tilesets/demoAutotiles';
import { DEMO_SIDE_ID, createDemoSideTileset } from '../tilesets/demoSide';
import { DEMO_HEX_ID, createDemoHexTileset } from '../tilesets/demoHex';
import { DEMO_NATURE_CLIMATE_IDS, DEMO_NATURE_ID, createDemoNatureClimateTileset, createDemoNatureTileset } from '../tilesets/demoNature';
import { DEMO_SIDE_THEMES_ID, createDemoSideThemesTileset } from '../tilesets/demoSideThemes';
import { DEMO_PROPS_ID, createDemoPropsTileset } from '../tilesets/demoProps';

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
  // summer nature tiles with soft path / shore edges (v3.21); v3.22 appended stone pool shores –
  // the set grows in place when nothing comes after it (same gids for the old tiles)
  const oldNature = tilesets.find((t) => t.id === DEMO_NATURE_ID);
  // v3.27 appended grassy stairs – same in-place growth
  if (oldNature && (!Object.values(oldNature.tiles).some((m) => m.role === 'shore' && m.tags.includes('stone')) || !Object.values(oldNature.tiles).some((m) => m.role === 'stairs'))) {
    const fresh = createDemoNatureTileset(oldNature.firstGid);
    const oldEnd = oldNature.firstGid + oldNature.columns * oldNature.rows;
    const freshEnd = fresh.firstGid + fresh.columns * fresh.rows;
    const later = tilesets.some((t) => t.firstGid >= oldEnd);
    if (fresh.columns === oldNature.columns && (freshEnd <= oldEnd || !later)) {
      tilesets = tilesets.map((t) => (t.id === DEMO_NATURE_ID ? { ...fresh, active: t.active } : t));
      nextGid = Math.max(nextGid, freshEnd);
    }
  }
  if (!tilesets.some((t) => t.id === DEMO_NATURE_ID)) {
    const nature = createDemoNatureTileset(nextGid);
    tilesets = [...tilesets, nature];
    nextGid = nature.firstGid + nature.columns * nature.rows;
  }
  // side-scroller themes castle / snow / desert (v3.28)
  if (!tilesets.some((t) => t.id === DEMO_SIDE_THEMES_ID)) {
    const themes = createDemoSideThemesTileset(nextGid);
    tilesets = [...tilesets, themes];
    nextGid = themes.firstGid + themes.columns * themes.rows;
  }
  // props: barrels, crates, fields, fences (v3.29)
  if (!tilesets.some((t) => t.id === DEMO_PROPS_ID)) {
    const props = createDemoPropsTileset(nextGid);
    tilesets = [...tilesets, props];
    nextGid = props.firstGid + props.columns * props.rows;
  }
  // climates for outdoor maps: winter / desert nature sets (v3.30)
  for (const climate of ['winter', 'desert'] as const)
    if (!tilesets.some((t) => t.id === DEMO_NATURE_CLIMATE_IDS[climate])) {
      const set = createDemoNatureClimateTileset(climate, nextGid);
      tilesets = [...tilesets, set];
      nextGid = set.firstGid + set.columns * set.rows;
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
    // parked levels (Ebenen) get the same layer / structure updates as the open one
    levels: p.levels?.map((l) => {
      if (!l.data) return l;
      const m = migrateProject({ ...p, ...l.data, levels: undefined });
      return { ...l, data: { map: m.map, generator: m.generator, layers: m.layers, activeLayerId: m.activeLayerId, result: m.result, objects: m.objects } };
    }),
  };
}
