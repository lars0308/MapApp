import type { Perspective, SpecialRoomType } from '../types';

export interface PerspectiveInfo {
  id: Perspective;
  label: string;
  short: string;
  points: string[];
  /** rows of visible wall front below a wall cap (0 = flat top-down walls) */
  faceRows: number;
  /** side walls show their face */
  sideFaces: boolean;
}

export const PERSPECTIVE_INFO: Record<Perspective, PerspectiveInfo> = {
  top_down: {
    id: 'top_down',
    label: 'Top-Down',
    short: 'Klassische Draufsicht',
    points: ['Kamera direkt von oben', 'Flache Wände als Kanten', 'Klassische 2D-Dungeons und RPGs'],
    faceRows: 0,
    sideFaces: false,
  },
  low_top_down: {
    id: 'low_top_down',
    label: 'Low Top-Down',
    short: '3/4-Ansicht mit Wandhöhe',
    points: ['Kamera leicht schräg von oben', 'Oben und seitlich sichtbare Wandhöhe', 'Vorne nur Wandkante – Raum ist offen zum Spieler'],
    faceRows: 1,
    sideFaces: false,
  },
  isometric_45: {
    id: 'isometric_45',
    label: 'Schräg 45° (Quadrate)',
    short: 'Quadratraster, stärkere Schräge',
    points: ['Doppelt hohe Wandfronten', 'Sichtbare Wandseiten', 'Braucht passende Tilesets'],
    faceRows: 2,
    sideFaces: true,
  },
  isometric: {
    id: 'isometric',
    label: 'Isometrisch (Raute)',
    short: 'Echtes Rautenraster',
    points: ['Felder als Rauten, Wände als Blöcke', 'Erhöhte Bereiche mit Höhe', 'Nutzt normale Top-Down-Tiles'],
    // generated like top-down; the renderer turns floors into diamonds and walls into blocks
    faceRows: 0,
    sideFaces: false,
  },
  hex: {
    id: 'hex',
    label: 'Hexagonal',
    short: 'Sechseck-Raster für Strategie',
    points: ['Sechseck-Felder, jede zweite Reihe versetzt', 'Gelände, Flüsse, Straßen, Städte', 'Godot-TileSet im Hexagon-Modus'],
    faceRows: 0,
    sideFaces: false,
  },
  side_view: {
    id: 'side_view',
    label: 'Seitenansicht',
    short: '2D Side-Scroller / Platformer',
    points: ['Kamera von der Seite, Schwerkraft', 'Boden, Plattformen, Leitern, Abgründe', 'Level läuft von links nach rechts'],
    faceRows: 0,
    sideFaces: false,
  },
};

/** views whose walls can show a face under the top edge (the others keep their fixed look) */
export const WALL_ROW_VIEWS: Perspective[] = ['top_down', 'low_top_down', 'isometric_45'];

/** rows of wall face under the top edge for this map (own choice or the view's default) */
export function faceRowsOf(map: { perspective: Perspective; wallRows?: number }): number {
  const base = PERSPECTIVE_INFO[map.perspective].faceRows;
  if (map.wallRows === undefined || !WALL_ROW_VIEWS.includes(map.perspective)) return base;
  return Math.max(0, Math.min(2, Math.round(map.wallRows)));
}

/** Special rooms that each need a room of their own. */
export function requiredRooms(specials: Record<SpecialRoomType, boolean>): number {
  return Object.values(specials).filter(Boolean).length;
}
