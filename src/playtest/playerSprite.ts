import type { SpriteDoc } from '../sprites/types';
import { ANIMATIONS, buildSheet, feetInFrame, frameSize, type AnimDef } from '../sprites/animation';
import type { View } from '../sprites/types';

// Own character from "Charakter bauen" as the playtest figure (idle + walk rows).
// Kept in browser storage so it survives reloads; editor-only, never part of the map.

const KEY = 'mapforge.player.v1';

export interface Stored {
  name: string;
  size: number;
  png: string;
  /** frames of row 0 (idle) / row 1 (walk), front view – older entries */
  idle: number;
  walk: number;
  feet: number;
  /** "idle_down", "walk_side" … → row + frames */
  rows?: Record<string, { row: number; frames: number }>;
}

let stored: Stored | null = null;
let img: HTMLImageElement | null = null;
const listeners = new Set<() => void>();

function load() {
  try {
    stored = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    stored = null;
  }
  img = null;
  if (stored) {
    const i = new Image();
    i.onload = () => {
      img = i;
      listeners.forEach((f) => f());
    };
    i.src = stored.png;
  }
}
load();

export function setPlayerSprite(doc: SpriteDoc): boolean {
  const pick = (ids: string[]) => ids.map((id) => ANIMATIONS.find((a) => a.id === id)).find(Boolean) as AnimDef;
  const idle = doc.kind === 'creature' ? pick(['k_idle']) : pick(['idle']);
  const walk = doc.kind === 'creature' ? pick(['k_fly', 'k_hop']) : pick(['walk']);
  const views: View[] = ['front', 'side', 'back'];
  const { canvas, rows } = buildSheet(doc, [idle, walk], views);
  const map: Stored['rows'] = {};
  for (const r of rows) map[`${r.animId === idle.id ? 'idle' : 'walk'}_${r.view}`] = { row: r.row, frames: r.frames };
  const s: Stored = { name: doc.name, size: frameSize(doc.size), png: canvas.toDataURL('image/png'), idle: idle.poses.length, walk: walk.poses.length, feet: feetInFrame(doc), rows: map };
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    return false;
  }
  load();
  listeners.forEach((f) => f());
  return true;
}

export function clearPlayerSprite() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  stored = null;
  img = null;
  listeners.forEach((f) => f());
}

/** stored sheet (row 0 idle, row 1 walk) for the map export */
export function playerSpriteData(): Stored | null {
  return stored;
}

export function playerSpriteName(): string | null {
  return stored?.name ?? null;
}

export function onPlayerSprite(f: () => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

export function getPlayerSprite() {
  return stored && img ? { ...stored, img } : null;
}
