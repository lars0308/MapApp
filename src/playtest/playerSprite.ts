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
  /** "idle_front", "walk_side", "jump_side" … → row + frames (+ speed / loop since v2.5) */
  rows?: Record<string, { row: number; frames: number; fps?: number; loop?: boolean }>;
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

/** animations a player figure brings into games (whatever the figure kind has) */
const PLAYER_ANIMS: Record<'character' | 'creature', string[][]> = {
  character: [['idle'], ['walk'], ['run'], ['jump'], ['fall'], ['attack'], ['hurt'], ['death'], ['climb']],
  creature: [['k_idle'], ['k_fly', 'k_hop', 'k_crawl'], ['k_attack'], ['k_hurt'], ['k_death']],
};
/** export names: creature animations become idle / walk / attack … */
const BASE_NAME: Record<string, string> = { k_idle: 'idle', k_fly: 'walk', k_hop: 'walk', k_crawl: 'walk', k_attack: 'attack', k_hurt: 'hurt', k_death: 'death' };

/** spritesheet of a figure as player: all directions, rows "idle_front", "walk_side", "jump_side" … */
export function playerSheet(doc: SpriteDoc): Stored {
  const kind = doc.kind === 'creature' ? 'creature' : 'character';
  const anims = PLAYER_ANIMS[kind].map((ids) => ids.map((id) => ANIMATIONS.find((a) => a.id === id)).find(Boolean)).filter(Boolean) as AnimDef[];
  const views: View[] = ['front', 'side', 'back'];
  const { canvas, rows } = buildSheet(doc, anims, views);
  const map: NonNullable<Stored['rows']> = {};
  for (const r of rows) {
    const a = anims.find((x) => x.id === r.animId)!;
    map[`${BASE_NAME[a.id] ?? a.id}_${r.view}`] = { row: r.row, frames: r.frames, fps: a.fps, loop: a.loop };
  }
  const idle = anims[0];
  const walk = anims[1] ?? anims[0];
  return { name: doc.name, size: frameSize(doc.size), png: canvas.toDataURL('image/png'), idle: idle.poses.length, walk: walk.poses.length, feet: feetInFrame(doc), rows: map };
}

export function setPlayerSprite(doc: SpriteDoc): boolean {
  const s = playerSheet(doc);
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
