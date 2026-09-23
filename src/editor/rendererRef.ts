import type { MapRenderer } from '../renderer/MapRenderer';

// The map canvas registers its renderer here so tools like the playtest can drive it.
let current: MapRenderer | null = null;

export function setRenderer(r: MapRenderer | null) {
  current = r;
}

export function getRenderer(): MapRenderer | null {
  return current;
}
