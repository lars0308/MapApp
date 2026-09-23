import type { SpriteKind, View } from './types';

// Ready-made animation sets: pick one and the right animations + directions are selected.

export interface AnimPreset {
  id: string;
  kind: SpriteKind;
  label: string;
  text: string;
  anims: string[];
  views: View[];
}

const ALL3: View[] = ['front', 'side', 'back'];

export const ANIM_PRESETS: AnimPreset[] = [
  { id: 'td_hero', kind: 'character', label: 'Top-Down-Held', text: 'Stehen, Laufen, Rennen, Angriff, Treffer, Umfallen – in 3 Richtungen', anims: ['idle', 'walk', 'run', 'attack', 'hurt', 'death'], views: ALL3 },
  { id: 'platformer', kind: 'character', label: 'Platformer-Held', text: 'Seitenansicht mit Schwerkraft-Steuerung: Laufen, Rennen, Springen, Fallen, Angriff, Rutschen, Ducken', anims: ['idle', 'walk', 'run', 'jump', 'fall', 'attack', 'slide', 'crouch', 'hurt', 'death'], views: ['side'] },
  { id: 'fighter', kind: 'character', label: 'Kämpfer', text: 'Mit Rennen, Angriff und Blocken', anims: ['idle', 'walk', 'run', 'attack', 'block', 'hurt', 'death'], views: ALL3 },
  { id: 'mage', kind: 'character', label: 'Magier', text: 'Laufen und Zaubern', anims: ['idle', 'walk', 'cast', 'hurt', 'death'], views: ALL3 },
  { id: 'npc', kind: 'character', label: 'NPC / Dorfbewohner', text: 'Stehen, Laufen, Winken', anims: ['idle', 'walk', 'wave'], views: ALL3 },
  { id: 'all_char', kind: 'character', label: 'Alles', text: 'Alle Animationen, alle Richtungen', anims: ['*'], views: ALL3 },
  { id: 'enemy_ground', kind: 'creature', label: 'Gegner am Boden', text: 'Schleim, Pilz, Golem: Wabern, Hüpfen, Angriff, Treffer, Zerfallen', anims: ['k_idle', 'k_hop', 'k_attack', 'k_hurt', 'k_death'], views: ['front', 'side'] },
  { id: 'enemy_fly', kind: 'creature', label: 'Fliegender Gegner', text: 'Fledermaus, Geist, Auge: Fliegen statt Hüpfen', anims: ['k_idle', 'k_fly', 'k_attack', 'k_hurt', 'k_death'], views: ['front', 'side'] },
  { id: 'crawler', kind: 'creature', label: 'Krabbler', text: 'Spinne, Käfer, Wolf: Krabbeln', anims: ['k_idle', 'k_crawl', 'k_attack', 'k_hurt', 'k_death'], views: ['front', 'side'] },
  { id: 'all_creature', kind: 'creature', label: 'Boss / Alles', text: 'Alle Kreatur-Animationen, alle Richtungen', anims: ['*'], views: ALL3 },
  { id: 'pickup', kind: 'object', label: 'Sammelobjekt', text: 'Münze, Trank, Kristall: Schweben + Pulsieren', anims: ['bob', 'pulse'], views: ['front'] },
  { id: 'chest', kind: 'object', label: 'Truhe / Tür', text: 'Wackeln und Öffnen', anims: ['shake', 'open'], views: ['front'] },
  { id: 'fire', kind: 'object', label: 'Feuer / Magie', text: 'Fackel, Feuerschale, Runen: Flackern + Pulsieren', anims: ['flicker', 'pulse'], views: ['front'] },
  { id: 'trap', kind: 'object', label: 'Falle', text: 'Wackeln und Pulsieren', anims: ['shake', 'pulse'], views: ['front'] },
];
