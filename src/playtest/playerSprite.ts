import type { SpriteDoc } from '../sprites/types';
import { ANIMATIONS, buildSheet, framePad, frameSize } from '../sprites/animation';
import { feetRow } from '../sprites/exportSprite';

// Own character from "Charakter bauen" as the playtest figure (idle + walk rows).
// Kept in browser storage so it survives reloads; editor-only, never part of the map.

const KEY = 'mapforge.player.v1';

interface Stored {
  name: string;
  size: number;
  png: string;
  idle: number;
  walk: number;
  feet: number;
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
  const anims = ['idle', 'walk'].map((id) => ANIMATIONS.find((a) => a.id === id)!);
  const { canvas } = buildSheet(doc, anims);
  const s: Stored = { name: doc.name, size: frameSize(doc.size), png: canvas.toDataURL('image/png'), idle: anims[0].poses.length, walk: anims[1].poses.length, feet: feetRow(doc) + framePad(doc.size) };
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
