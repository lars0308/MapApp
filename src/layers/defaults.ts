import type { Layer, LayerRole } from '../types';
import { uid } from '../utils/id';

export const LAYER_COLORS = ['#8fa8c8', '#c8a878', '#9d93b5', '#c89078', '#8fbf9f', '#d07a86', '#d9b45b', '#7fc59a', '#6fa6d6', '#b48ad6'];

export const DEFAULT_LAYERS: { name: string; role: LayerRole; color: string; visible?: boolean }[] = [
  { name: 'Boden', role: 'floor', color: '#8fa8c8' },
  { name: 'Wege', role: 'paths', color: '#c8a878' },
  { name: 'Schatten', role: 'shadow', color: '#6b6f86' },
  { name: 'Wände', role: 'walls', color: '#9d93b5' },
  { name: 'Objekte', role: 'objects', color: '#c89078' },
  { name: 'Deko', role: 'deco', color: '#8fbf9f' },
  { name: 'Kollision', role: 'collision', color: '#d07a86', visible: false },
  { name: 'Gameplay', role: 'gameplay', color: '#d9b45b' },
  { name: 'Spawnpunkte', role: 'spawn', color: '#7fc59a' },
];

export const ROLE_LABEL: Record<LayerRole, string> = {
  floor: 'Boden',
  paths: 'Wege',
  shadow: 'Schatten',
  walls: 'Wände',
  objects: 'Objekte',
  deco: 'Deko',
  collision: 'Kollision',
  gameplay: 'Gameplay',
  spawn: 'Spawn',
  custom: 'Eigener Layer',
};

export function createLayer(name: string, role: LayerRole, color: string, size: number, visible = true): Layer {
  return { id: uid('layer'), name, role, color, visible, locked: false, data: new Uint32Array(size) };
}

export function createDefaultLayers(size: number): Layer[] {
  return DEFAULT_LAYERS.map((l) => createLayer(l.name, l.role, l.color, size, l.visible ?? true));
}

/** Resize layer data, keeping content anchored top-left. */
export function resizeData(data: Uint32Array, oldW: number, oldH: number, w: number, h: number): Uint32Array {
  const out = new Uint32Array(w * h);
  const cw = Math.min(oldW, w);
  const ch = Math.min(oldH, h);
  for (let y = 0; y < ch; y++) out.set(data.subarray(y * oldW, y * oldW + cw), y * w);
  return out;
}
