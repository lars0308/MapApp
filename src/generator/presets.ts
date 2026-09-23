import type { GeneratorSettings, MapSettings } from '../types';
import { randomSeed } from './rng';

export const DEFAULT_MAP: MapSettings = { width: 80, height: 80, tileSize: 32, perspective: 'top_down', shadows: true };

export function defaultGenerator(seed = randomSeed()): GeneratorSettings {
  return {
    seed,
    roomCount: 12,
    roomMinW: 6,
    roomMaxW: 16,
    roomMinH: 6,
    roomMaxH: 14,
    roomSpacing: 3,
    shapes: { rect: true, l: true, t: false, cross: false, irregular: true, hall: false },
    irregularity: 30,
    corridorWidth: 2,
    corridorMinWidth: 1,
    corridorMaxWidth: 3,
    twistiness: 45,
    directness: 60,
    corridor: { straight: true, curves: true, branches: true, deadEnds: true, loops: true, alternatives: false },
    connectivity: 40,
    distribution: 'even',
    specials: {
      start: true,
      end: true,
      boss: false,
      treasure: false,
      secret: false,
      merchant: false,
      quest: false,
      arena: false,
      puzzle: false,
    },
    floorVariation: 12,
    decoDensity: 30,
    obstacleDensity: 20,
    hazards: 20,
    lava: true,
    water: true,
    abyss: false,
  };
}

export interface Preset {
  id: string;
  label: string;
  map?: Partial<MapSettings>;
  apply: (s: GeneratorSettings) => GeneratorSettings;
}

export const PRESETS: Preset[] = [
  {
    id: 'compact',
    label: 'Compact',
    map: { width: 48, height: 48 },
    apply: (s) => ({
      ...s,
      roomCount: 7,
      roomMinW: 5,
      roomMaxW: 10,
      roomMinH: 5,
      roomMaxH: 9,
      roomSpacing: 2,
      twistiness: 15,
      directness: 90,
      connectivity: 30,
      distribution: 'center',
      corridor: { ...s.corridor, branches: false, deadEnds: false },
    }),
  },
  {
    id: 'maze',
    label: 'Maze',
    map: { width: 80, height: 80 },
    apply: (s) => ({
      ...s,
      roomCount: 14,
      roomMinW: 4,
      roomMaxW: 9,
      roomMinH: 4,
      roomMaxH: 8,
      corridorWidth: 1,
      corridorMinWidth: 1,
      corridorMaxWidth: 2,
      twistiness: 90,
      directness: 25,
      connectivity: 55,
      distribution: 'random',
      corridor: { straight: true, curves: true, branches: true, deadEnds: true, loops: true, alternatives: true },
    }),
  },
  {
    id: 'large',
    label: 'Large',
    map: { width: 140, height: 140 },
    apply: (s) => ({
      ...s,
      roomCount: 32,
      roomMinW: 6,
      roomMaxW: 18,
      roomMinH: 6,
      roomMaxH: 16,
      roomSpacing: 4,
      twistiness: 45,
      connectivity: 45,
      distribution: 'even',
      shapes: { ...s.shapes, hall: true },
    }),
  },
  {
    id: 'linear',
    label: 'Linear',
    apply: (s) => ({
      ...s,
      roomCount: 10,
      connectivity: 5,
      twistiness: 30,
      directness: 75,
      distribution: 'spread',
      corridor: { ...s.corridor, branches: false, deadEnds: false, loops: false, alternatives: false },
    }),
  },
  {
    id: 'exploration',
    label: 'Exploration',
    map: { width: 100, height: 100 },
    apply: (s) => ({
      ...s,
      roomCount: 16,
      roomMinW: 9,
      roomMaxW: 20,
      roomMinH: 8,
      roomMaxH: 18,
      roomSpacing: 4,
      twistiness: 55,
      directness: 45,
      connectivity: 80,
      distribution: 'random',
      shapes: { ...s.shapes, irregular: true, hall: true },
      corridor: { ...s.corridor, loops: true, alternatives: true, branches: true },
    }),
  },
];
