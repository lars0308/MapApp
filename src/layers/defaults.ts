import type { Layer, LayerRole } from '../types';
import { uid } from '../utils/id';

export const LAYER_COLORS = ['#8fa8c8', '#c8a878', '#9d93b5', '#c89078', '#8fbf9f', '#d07a86', '#d9b45b', '#7fc59a', '#6fa6d6', '#b48ad6'];

export interface LayerDef {
  name: string;
  role: LayerRole;
  color: string;
  godot: string;
  visible?: boolean;
  ySort?: boolean;
}

/** Default stack (bottom → top). Names follow the Godot export layer names. */
export const DEFAULT_LAYERS: LayerDef[] = [
  { name: 'Boden', role: 'floor', color: '#8fa8c8', godot: 'Ground' },
  { name: 'Bodendetails', role: 'groundDetails', color: '#a3b58c', godot: 'GroundDetails' },
  { name: 'Wege', role: 'paths', color: '#c8a878', godot: 'Paths' },
  { name: 'Deko', role: 'deco', color: '#8fbf9f', godot: 'Decoration' },
  { name: 'Schatten', role: 'shadow', color: '#6b6f86', godot: 'Shadows' },
  { name: 'Wände hinten', role: 'walls', color: '#9d93b5', godot: 'WallsBack' },
  { name: 'Objekte hinten', role: 'objects', color: '#c89078', godot: 'ObjectsBack', ySort: true },
  { name: 'Wände vorne', role: 'wallsFront', color: '#b3a6d6', godot: 'WallsFront', ySort: true },
  { name: 'Objekte vorne', role: 'objectsFront', color: '#d6a07e', godot: 'ObjectsFront' },
  { name: 'Overhead', role: 'overhead', color: '#7fb5b0', godot: 'Overhead' },
  { name: 'Kollision', role: 'collision', color: '#d07a86', godot: 'Collision', visible: false },
  { name: 'Gameplay', role: 'gameplay', color: '#d9b45b', godot: 'Gameplay' },
  { name: 'Spawnpunkte', role: 'spawn', color: '#7fc59a', godot: 'SpawnPoints' },
];

export const GODOT_LAYER_NAME: Record<LayerRole, string> = {
  floor: 'Ground',
  groundDetails: 'GroundDetails',
  paths: 'Paths',
  deco: 'Decoration',
  shadow: 'Shadows',
  walls: 'WallsBack',
  objects: 'ObjectsBack',
  wallsFront: 'WallsFront',
  objectsFront: 'ObjectsFront',
  overhead: 'Overhead',
  collision: 'Collision',
  gameplay: 'Gameplay',
  spawn: 'SpawnPoints',
  custom: 'Custom',
};

export const ROLE_LABEL: Record<LayerRole, string> = {
  floor: 'Boden',
  groundDetails: 'Bodendetails',
  paths: 'Wege',
  shadow: 'Schatten',
  walls: 'Wände hinten',
  wallsFront: 'Wände vorne',
  objects: 'Objekte hinten',
  objectsFront: 'Objekte vorne',
  overhead: 'Overhead',
  deco: 'Deko',
  collision: 'Kollision',
  gameplay: 'Gameplay',
  spawn: 'Spawn',
  custom: 'Eigener Layer',
};

/** layer names in side-scroller projects (same roles, clearer names) */
export const SIDE_LAYER_NAME: Partial<Record<LayerRole, string>> = {
  floor: 'Hintergrund',
  walls: 'Boden (fest)',
  objects: 'Plattformen & Leitern',
  overhead: 'Wasser & Lava',
  deco: 'Deko',
};

/** layer names in hex projects */
export const HEX_LAYER_NAME: Partial<Record<LayerRole, string>> = {
  floor: 'Gelände',
  groundDetails: 'Flüsse',
  paths: 'Straßen',
  objects: 'Städte & Orte',
};

/** rename default-named layers for a perspective (own names stay) */
export function namesFor(layers: Layer[], perspective: string): Layer[] {
  const table = perspective === 'side_view' ? SIDE_LAYER_NAME : perspective === 'hex' ? HEX_LAYER_NAME : {};
  const special = [SIDE_LAYER_NAME, HEX_LAYER_NAME];
  return layers.map((l) => {
    const def = DEFAULT_LAYERS.find((d) => d.role === l.role)?.name;
    if (!def) return l;
    // only layers that still carry a default name (of any perspective) are renamed
    const isDefault = l.name === def || special.some((t) => t[l.role] === l.name);
    if (!isDefault) return l;
    return { ...l, name: table[l.role] ?? def };
  });
}

export function createLayer(name: string, role: LayerRole, color: string, size: number, visible = true, ySort = false): Layer {
  return { id: uid('layer'), name, role, color, visible, locked: false, ySort, data: new Uint32Array(size) };
}

export function layerFromDef(d: LayerDef, size: number): Layer {
  return createLayer(d.name, d.role, d.color, size, d.visible ?? true, d.ySort ?? false);
}

export function createDefaultLayers(size: number): Layer[] {
  return DEFAULT_LAYERS.map((l) => layerFromDef(l, size));
}

/** Resize layer data, keeping content anchored top-left. */
export function resizeData<T extends Uint32Array | Uint8Array>(data: T, oldW: number, oldH: number, w: number, h: number): T {
  const out = new (data.constructor as new (n: number) => T)(w * h);
  const cw = Math.min(oldW, w);
  const ch = Math.min(oldH, h);
  for (let y = 0; y < ch; y++) out.set(data.subarray(y * oldW, y * oldW + cw), y * w);
  return out;
}
