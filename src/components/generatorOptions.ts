import type { Distribution, GeneratorSettings, RoomShape, SpecialRoomType } from '../types';

export const SHAPES: { id: RoomShape; label: string }[] = [
  { id: 'rect', label: 'Rechteck' },
  { id: 'l', label: 'L-Form' },
  { id: 't', label: 'T-Form' },
  { id: 'cross', label: 'Kreuz' },
  { id: 'irregular', label: 'Unregelmäßig' },
  { id: 'hall', label: 'Große Halle' },
];

export const DISTRIBUTIONS: { value: Distribution; label: string }[] = [
  { value: 'even', label: 'Gleichmäßig' },
  { value: 'random', label: 'Zufällig' },
  { value: 'cluster', label: 'Cluster' },
  { value: 'center', label: 'Zentrum' },
  { value: 'spread', label: 'Weit verteilt' },
];

export const CORRIDOR_OPTS: { id: keyof GeneratorSettings['corridor']; label: string }[] = [
  { id: 'straight', label: 'Gerade Wege' },
  { id: 'curves', label: 'Kurven' },
  { id: 'branches', label: 'Abzweigungen' },
  { id: 'deadEnds', label: 'Sackgassen' },
  { id: 'loops', label: 'Schleifen' },
  { id: 'alternatives', label: 'Alternative Verbindungen' },
];

export const SPECIALS: { id: SpecialRoomType; label: string; color: string }[] = [
  { id: 'start', label: 'Start', color: '#7fc59a' },
  { id: 'end', label: 'Ende', color: '#6fa6d6' },
  { id: 'boss', label: 'Boss', color: '#d0616b' },
  { id: 'treasure', label: 'Schatz', color: '#d9b45b' },
  { id: 'secret', label: 'Geheimraum', color: '#8a8595' },
  { id: 'merchant', label: 'Händler', color: '#c89078' },
  { id: 'quest', label: 'Quest', color: '#b48ad6' },
  { id: 'arena', label: 'Arena', color: '#e0875a' },
  { id: 'puzzle', label: 'Rätsel', color: '#5fb8b0' },
];
