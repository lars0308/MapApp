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
    label: '45° / Isometric-like',
    short: 'Stärkere Schräge',
    points: ['Doppelt hohe Wandfronten', 'Sichtbare Wandseiten', 'Braucht passende Tilesets'],
    faceRows: 2,
    sideFaces: true,
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

/** Special rooms that each need a room of their own. */
export function requiredRooms(specials: Record<SpecialRoomType, boolean>): number {
  return Object.values(specials).filter(Boolean).length;
}
