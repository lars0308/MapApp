import type { GeneratorSettings, MapSettings, TerrainSet, TerrainSettings, SideSettings } from '../types';
import { randomSeed } from './rng';

export const DEFAULT_MAP: MapSettings = { width: 80, height: 80, tileSize: 32, perspective: 'top_down', shadows: true };

/** side-scroller defaults: jump 3 up / 4 across fits the platformer figure script */
export function defaultSide(): SideSettings {
  return { style: 'outdoor', jumpHeight: 3, jumpWidth: 4, hills: 50, gaps: 40, platforms: 50, ladders: true, lifts: true, hazards: { water: true, lava: false, spikes: true, abyss: true }, enemies: 40, loot: 40 };
}

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
    terrain: defaultTerrain(),
    objects: { trees: 15, rocks: 20, arches: 30, pillars: true },
  };
}

export function defaultTerrain(): TerrainSettings {
  return {
    water: { enabled: true, amount: 20 },
    lava: { enabled: false, amount: 10 },
    abyss: { enabled: true, amount: 15, minSize: 4, maxSize: 14, islands: true, bridges: true, inRooms: true, betweenRooms: true },
    cliffs: { enabled: true, amount: 25 },
    bridges: true,
    transitions: { enabled: true, amount: 50 },
  };
}

export function defaultTerrainSets(): TerrainSet[] {
  return [
    { id: 'terrain_stone', name: 'Stein', tag: 'stone', color: '#8a8595', weight: 70, active: true },
    { id: 'terrain_wood', name: 'Holz', tag: 'wood', color: '#b08354', weight: 20, active: true },
    { id: 'terrain_sand', name: 'Sand', tag: 'sand', color: '#d2b77a', weight: 10, active: false },
  ];
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
