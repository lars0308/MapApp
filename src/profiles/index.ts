import type { GeneratorSettings, MapSettings, Perspective } from '../types';
import { PRESETS } from '../generator/presets';

// Game profile: the answers to "what kind of game is this?" from the setup wizard.
// Only the answers are stored in the project (`project.profile`); everything the editor
// derives from them comes from `deriveConfig()`, so better profiles also help old projects.

export type ViewKind = 'top_down' | 'isometric' | 'side_scroller' | 'hexagonal';
export type Genre = 'action_roguelite' | 'dungeon_crawler' | 'rpg' | 'tactics' | 'puzzle' | 'platformer' | 'other';

export type Effort = 'small' | 'medium' | 'large';

export interface GameProfile {
  view: ViewKind;
  genre: Genre;
  /** how big / detailed the maps should be */
  effort?: Effort;
}

export const EFFORTS: { id: Effort; label: string; text: string }[] = [
  { id: 'small', label: 'Klein & schnell', text: 'Kleine Maps, wenige Räume, wenig Deko – ideal für Prototypen und Game Jams.' },
  { id: 'medium', label: 'Mittel', text: 'Ausgewogene Größe und Ausstattung.' },
  { id: 'large', label: 'Groß & detailliert', text: 'Große Maps, viele Räume, mehr Formen, Deko, Gelände und Boden-Varianten.' },
];

export interface ViewInfo {
  id: ViewKind;
  label: string;
  text: string;
  /** false = shown as "bald verfügbar", cannot be chosen yet */
  available: boolean;
  /** map perspectives that belong to this view */
  perspectives: Perspective[];
}

export const VIEWS: ViewInfo[] = [
  { id: 'top_down', label: 'Top-Down', text: 'Von oben oder schräg von oben (3/4) – Zelda, Enter the Gungeon, Stardew Valley.', available: true, perspectives: ['top_down', 'low_top_down'] },
  { id: 'isometric', label: 'Isometrisch', text: 'Diagonale 45°-Ansicht mit hohen Wänden – Diablo, Hades.', available: true, perspectives: ['isometric_45'] },
  { id: 'side_scroller', label: '2D Side-Scroller', text: 'Seitenansicht mit Schwerkraft, Plattformen, Schrägen – Celeste, Hollow Knight.', available: false, perspectives: [] },
  { id: 'hexagonal', label: 'Hexagonal', text: 'Sechseck-Raster für Strategie und Taktik – Civilization, Into the Breach (Hex).', available: false, perspectives: [] },
];

export interface GenreInfo {
  id: Genre;
  label: string;
  text: string;
  views: ViewKind[];
  map?: Partial<Pick<MapSettings, 'width' | 'height'>>;
  apply?: (g: GeneratorSettings) => GeneratorSettings;
}

const preset = (id: string) => PRESETS.find((p) => p.id === id)!;
const specials = (g: GeneratorSettings, on: (keyof GeneratorSettings['specials'])[]) => ({
  ...g,
  specials: Object.fromEntries(Object.keys(g.specials).map((k) => [k, on.includes(k as keyof GeneratorSettings['specials'])])) as GeneratorSettings['specials'],
});

export const GENRES: GenreInfo[] = [
  {
    id: 'action_roguelite',
    label: 'Action-Roguelite',
    text: 'Kompakte Kampfräume, Schätze, Boss am Ende, Rundwege.',
    views: ['top_down', 'isometric'],
    map: { width: 64, height: 64 },
    apply: (g) => specials({ ...g, roomCount: 12, roomMinW: 7, roomMaxW: 14, roomMinH: 6, roomMaxH: 12, connectivity: 50, corridor: { ...g.corridor, loops: true } }, ['start', 'end', 'boss', 'treasure', 'arena']),
  },
  {
    id: 'dungeon_crawler',
    label: 'Dungeon-Crawler',
    text: 'Verzweigte, verwinkelte Gänge, Sackgassen und Geheimräume.',
    views: ['top_down', 'isometric'],
    map: preset('maze').map,
    apply: (g) => specials(preset('maze').apply(g), ['start', 'end', 'treasure', 'secret']),
  },
  {
    id: 'rpg',
    label: 'RPG / Abenteuer',
    text: 'Große, offene Bereiche, Händler, Aufgaben, viel zu entdecken.',
    views: ['top_down', 'isometric'],
    map: preset('exploration').map,
    apply: (g) => specials(preset('exploration').apply(g), ['start', 'end', 'merchant', 'quest', 'secret', 'treasure']),
  },
  {
    id: 'tactics',
    label: 'Taktik',
    text: 'Wenige, große Räume mit Platz für Formationen, breite Wege.',
    views: ['top_down', 'isometric', 'hexagonal'],
    map: { width: 56, height: 56 },
    apply: (g) =>
      specials({ ...g, roomCount: 6, roomMinW: 12, roomMaxW: 20, roomMinH: 10, roomMaxH: 16, corridorWidth: 3, corridorMinWidth: 2, corridorMaxWidth: 4, shapes: { ...g.shapes, hall: true } }, ['start', 'end', 'arena']),
  },
  {
    id: 'puzzle',
    label: 'Puzzle / Rätsel',
    text: 'Linearer Ablauf mit Rätselräumen – ein Raum nach dem anderen.',
    views: ['top_down', 'isometric'],
    map: preset('linear').map,
    apply: (g) => specials(preset('linear').apply(g), ['start', 'end', 'puzzle', 'secret']),
  },
  { id: 'platformer', label: 'Platformer', text: 'Springen, Plattformen, Schrägen.', views: ['side_scroller'] },
  { id: 'other', label: 'Anderes', text: 'Keine Vorgaben – alle Einstellungen selbst wählen.', views: ['top_down', 'isometric', 'side_scroller', 'hexagonal'] },
];

export const DEFAULT_PROFILE: GameProfile = { view: 'top_down', genre: 'other', effort: 'medium' };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, Math.round(v)));

/**
 * Generator settings + map size for a profile – what the wizard's sliders start with.
 * Genre first (room layout, special rooms), then the effort scales size and detail.
 */
export function applyProfile(p: GameProfile, base: GeneratorSettings, map: Pick<MapSettings, 'width' | 'height'>): { gen: GeneratorSettings; map: Pick<MapSettings, 'width' | 'height'> } {
  const g0 = genreInfo(p.genre);
  let gen = g0.apply ? g0.apply(base) : base;
  let size = { width: g0.map?.width ?? map.width, height: g0.map?.height ?? map.height };
  const effort = p.effort ?? 'medium';
  if (effort !== 'medium') {
    const big = effort === 'large';
    const f = big ? 1.4 : 0.7;
    size = { width: clamp(size.width * f, 24, 200), height: clamp(size.height * f, 24, 200) };
    const t = gen.terrain;
    const amt = (a: number) => clamp(a * (big ? 1.35 : 0.6), 0, 100);
    gen = {
      ...gen,
      roomCount: clamp(gen.roomCount * (big ? 1.7 : 0.6), 3, 60),
      decoDensity: big ? 50 : 15,
      obstacleDensity: big ? 32 : 10,
      floorVariation: big ? 24 : 6,
      objects: { ...gen.objects, trees: clamp(gen.objects.trees * (big ? 1.6 : 0.5), 0, 100), rocks: clamp(gen.objects.rocks * (big ? 1.5 : 0.5), 0, 100) },
      shapes: big ? { ...gen.shapes, t: true, cross: true } : gen.shapes,
      terrain: {
        ...t,
        water: { ...t.water, amount: amt(t.water.amount) },
        lava: { ...t.lava, amount: amt(t.lava.amount) },
        abyss: { ...t.abyss, amount: amt(t.abyss.amount) },
        cliffs: { ...t.cliffs, enabled: big || t.cliffs.enabled, amount: amt(t.cliffs.amount) },
      },
    };
  }
  return { gen, map: size };
}

export function viewInfo(v: ViewKind) {
  return VIEWS.find((x) => x.id === v) ?? VIEWS[0];
}
export function genreInfo(g: Genre) {
  return GENRES.find((x) => x.id === g) ?? GENRES[GENRES.length - 1];
}

/** "Top-Down · Action-Roguelite" */
export function profileLabel(p: GameProfile | undefined): string {
  const pr = p ?? DEFAULT_PROFILE;
  const parts = [viewInfo(pr.view).label];
  if (pr.genre !== 'other') parts.push(genreInfo(pr.genre).label);
  if (pr.effort && pr.effort !== 'medium') parts.push(EFFORTS.find((e) => e.id === pr.effort)!.label);
  return parts.join(' · ');
}

/** Profile of a project saved before profiles existed. */
export function profileFromPerspective(perspective: Perspective): GameProfile {
  return { view: perspective === 'isometric_45' ? 'isometric' : 'top_down', genre: 'other', effort: 'medium' };
}

/** Everything the app derives from a profile. */
export interface ProjectConfig {
  /** perspectives offered in the wizard / generator panel */
  perspectives: Perspective[];
}

export function deriveConfig(p: GameProfile | undefined): ProjectConfig {
  const v = viewInfo((p ?? DEFAULT_PROFILE).view);
  return { perspectives: v.perspectives.length ? v.perspectives : VIEWS[0].perspectives };
}
