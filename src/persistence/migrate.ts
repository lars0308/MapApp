import type { Project } from '../types';
import { DEFAULT_MAP, defaultGenerator } from '../generator/presets';
import { DEFAULT_LAYERS, createLayer } from '../layers/defaults';

/**
 * Bring projects saved by older app versions up to date:
 * perspective + shadows, hazard toggles, tileset perspectives and the shadow layer.
 */
export function migrateProject(p: Project): Project {
  const map = { ...DEFAULT_MAP, ...p.map, perspective: p.map.perspective ?? 'top_down', shadows: p.map.shadows ?? false };
  const generator = { ...defaultGenerator(p.generator.seed), ...p.generator };
  const tilesets = p.tilesets.map((t) =>
    t.perspectives ? t : { ...t, perspectives: t.source === 'demo' ? ['top_down', 'low_top_down', 'isometric_45'] : [] },
  ) as Project['tilesets'];
  let layers = p.layers;
  if (!layers.some((l) => l.role === 'shadow')) {
    const def = DEFAULT_LAYERS.find((l) => l.role === 'shadow')!;
    const shadow = createLayer(def.name, 'shadow', def.color, map.width * map.height);
    const after = layers.findIndex((l) => l.role === 'paths');
    layers = [...layers];
    layers.splice(after >= 0 ? after + 1 : Math.min(1, layers.length), 0, shadow);
  }
  const result = p.result
    ? {
        ...p.result,
        perspective: p.result.perspective ?? map.perspective,
        floorMask: p.result.floorMask ?? new Uint8Array(p.result.width * p.result.height),
      }
    : null;
  return { ...p, map, generator, tilesets, layers, result };
}
