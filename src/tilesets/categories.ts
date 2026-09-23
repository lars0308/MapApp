import type { TileCategory } from '../types';

export interface CategoryInfo {
  id: TileCategory;
  label: string;
  group: 'Boden' | 'Wände' | 'Gelände' | 'Objekte' | 'Gameplay';
}

export const CATEGORIES: CategoryInfo[] = [
  { id: 'floor', label: 'Boden', group: 'Boden' },
  { id: 'floorVariant', label: 'Boden-Variante', group: 'Boden' },
  { id: 'path', label: 'Weg', group: 'Boden' },
  { id: 'wallTop', label: 'Wand oben', group: 'Wände' },
  { id: 'wallBottom', label: 'Wand unten', group: 'Wände' },
  { id: 'wallLeft', label: 'Wand links', group: 'Wände' },
  { id: 'wallRight', label: 'Wand rechts', group: 'Wände' },
  { id: 'wallFront', label: 'Wandfront', group: 'Wände' },
  { id: 'innerCorner', label: 'Innenecke', group: 'Wände' },
  { id: 'outerCorner', label: 'Außenecke', group: 'Wände' },
  { id: 'door', label: 'Tür', group: 'Wände' },
  { id: 'water', label: 'Wasser', group: 'Gelände' },
  { id: 'lava', label: 'Lava', group: 'Gelände' },
  { id: 'abyss', label: 'Abgrund', group: 'Gelände' },
  { id: 'bridge', label: 'Brücke', group: 'Gelände' },
  { id: 'deco', label: 'Deko', group: 'Objekte' },
  { id: 'obstacle', label: 'Hindernis', group: 'Objekte' },
  { id: 'pillar', label: 'Säule', group: 'Objekte' },
  { id: 'stairs', label: 'Treppe', group: 'Gameplay' },
  { id: 'transition', label: 'Übergang', group: 'Gameplay' },
  { id: 'spawn', label: 'Spawn', group: 'Gameplay' },
  { id: 'special', label: 'Spezialtile', group: 'Gameplay' },
  { id: 'shadow', label: 'Schatten', group: 'Gelände' },
];

export const CATEGORY_LABEL: Record<TileCategory, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label]),
) as Record<TileCategory, string>;

export const SUGGESTED_TAGS = [
  'stone',
  'lava',
  'dungeon',
  'dark',
  'broken',
  'rare',
  'clean',
  'moss',
  'wood',
  'collision',
  'player',
  'enemy',
  'loot',
  'npc',
  'quest',
  'side',
  'upper',
  'edge',
];
