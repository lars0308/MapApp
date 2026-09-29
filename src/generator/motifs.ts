import type { GeneratorSettings } from '../types';
import { defaultGenerator, defaultTerrain } from './presets';

// "Kleines Motiv": the generator for one small thing instead of a whole map – a house, a clearing,
// a beach … Each motif is a small map size plus generator settings; everything stays editable.

export interface Motif {
  id: string;
  label: string;
  text: string;
  /** one symbol for the card */
  icon: string;
  width: number;
  height: number;
  settings: (seed: string) => GeneratorSettings;
}

const none = { start: true, end: false, boss: false, treasure: false, secret: false, merchant: false, quest: false, arena: false, puzzle: false };

/** one open place outdoors (a clearing in the woods), the base for several motifs */
function outdoor(seed: string, patch: Partial<GeneratorSettings>): GeneratorSettings {
  const g = defaultGenerator(seed);
  return {
    ...g,
    layout: 'outdoor',
    roomCount: 1,
    roomMinW: 12,
    roomMaxW: 16,
    roomMinH: 9,
    roomMaxH: 12,
    specials: none,
    population: { enemies: 0, loot: 0 },
    objects: { ...g.objects, trees: 10, arches: 0, pillars: false },
    decoDensity: 45,
    ...patch,
  };
}

function indoor(seed: string, patch: Partial<GeneratorSettings>): GeneratorSettings {
  const g = defaultGenerator(seed);
  return {
    ...g,
    layout: 'rooms',
    roomCount: 1,
    specials: none,
    shapes: { rect: true, l: false, t: false, cross: false, irregular: false, hall: false },
    population: { enemies: 0, loot: 20 },
    objects: { ...g.objects, arches: 0 },
    // one room, no corridors running off into nowhere
    corridor: { ...g.corridor, branches: false, deadEnds: false, loops: false },
    ...patch,
  };
}

export const MOTIFS: Motif[] = [
  {
    id: 'house',
    label: 'Haus mit Garten',
    text: 'Ein Haus auf einer Wiese, mit Feld und Weg zur Tür',
    icon: '🏠',
    width: 24,
    height: 18,
    settings: (seed) => outdoor(seed, { houses: true, roomMinW: 14, roomMaxW: 16, roomMinH: 10, roomMaxH: 12 }),
  },
  {
    id: 'interior',
    label: 'Haus von innen',
    text: 'Ein einzelner Raum mit Möbeln, Fässern und Kisten',
    icon: '🪑',
    width: 16,
    height: 14,
    settings: (seed) => indoor(seed, { roomMinW: 9, roomMaxW: 11, roomMinH: 7, roomMaxH: 9, decoDensity: 70, obstacleDensity: 30, terrain: { ...defaultTerrain(), transitions: { enabled: false, amount: 0 } } }),
  },
  {
    id: 'clearing',
    label: 'Waldlichtung',
    text: 'Eine offene Lichtung mitten im Wald',
    icon: '🌳',
    width: 24,
    height: 20,
    settings: (seed) => outdoor(seed, {}),
  },
  {
    id: 'beach',
    label: 'Strand',
    text: 'Eine kleine Insel mit Sandstrand und Meer drumherum',
    icon: '🏖️',
    width: 26,
    height: 20,
    settings: (seed) => outdoor(seed, { layout: 'island', roomMinW: 8, roomMaxW: 10, roomMinH: 6, roomMaxH: 8 }),
  },
  {
    id: 'pond',
    label: 'Teich',
    text: 'Eine Lichtung mit einem Teich in der Mitte',
    icon: '💧',
    width: 24,
    height: 20,
    settings: (seed) => outdoor(seed, { terrain: { ...defaultTerrain(), water: { enabled: true, amount: 55 } } }),
  },
  {
    id: 'river',
    label: 'Fluss mit Brücke',
    text: 'Zwei Lichtungen, dazwischen ein Fluss mit Brücke',
    icon: '🌉',
    width: 30,
    height: 22,
    settings: (seed) => outdoor(seed, { roomCount: 2, roomMinW: 8, roomMaxW: 10, roomMinH: 7, roomMaxH: 9, rivers: 1 }),
  },
  {
    id: 'village',
    label: 'Dorfplatz',
    text: 'Ein paar Häuser um einen Platz mit Brunnen',
    icon: '🏘️',
    width: 36,
    height: 26,
    settings: (seed) => outdoor(seed, { layout: 'village', roomCount: 2, roomMinW: 10, roomMaxW: 12, roomMinH: 8, roomMaxH: 9, roomSpacing: 2 }),
  },
  {
    id: 'room',
    label: 'Dungeon-Raum',
    text: 'Ein einzelner Raum mit Schatztruhe',
    icon: '🧱',
    width: 18,
    height: 14,
    settings: (seed) => indoor(seed, { roomMinW: 10, roomMaxW: 12, roomMinH: 7, roomMaxH: 9, population: { enemies: 20, loot: 60 } }),
  },
  {
    id: 'boss',
    label: 'Bossraum',
    text: 'Eine große Halle mit Säulen für den Endkampf',
    icon: '👑',
    width: 24,
    height: 20,
    settings: (seed) => indoor(seed, { roomMinW: 16, roomMaxW: 18, roomMinH: 12, roomMaxH: 14, shapes: { rect: false, l: false, t: false, cross: false, irregular: false, hall: true }, specials: { ...none, start: false, boss: true }, population: { enemies: 30, loot: 30 } }),
  },
  {
    id: 'cave',
    label: 'Höhlenkammer',
    text: 'Eine natürliche Höhle mit unregelmäßigen Wänden',
    icon: '🪨',
    width: 22,
    height: 18,
    settings: (seed) => indoor(seed, { layout: 'cave', roomMinW: 12, roomMaxW: 14, roomMinH: 9, roomMaxH: 11 }),
  },
];
