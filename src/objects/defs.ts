import type { BuiltinObjectType, CustomObject, ObjectType } from '../types';
import { mapEvents } from '../store/events';
import { Rng } from '../generator/rng';

// Built-in sprite objects. Sprites are drawn procedurally at 16 px per tile.
// Each object stands on its base row: it is y-sorted by the bottom edge of that row
// (sortOriginY) and may extend upwards (tree crown, pillar head, arch beam).

export interface ObjectDef {
  type: ObjectType;
  label: string;
  /** size in tiles */
  w: number;
  h: number;
  /** atlas position in tiles */
  sx: number;
  sy: number;
  /** collision cells relative to (x, baseY): dx 0..w-1, dy <= 0 */
  collision: [number, number][];
  /** number of sprite rows (from the top) drawn above characters (roof, arch beam) */
  overheadRows: number;
  ySort: boolean;
  /** larger objects need more free space around them */
  godotType: string;
}

export const OBJECT_DEFS: Record<BuiltinObjectType, ObjectDef> = {
  tree: { type: 'tree', label: 'Baum', w: 2, h: 3, sx: 0, sy: 0, collision: [[0, 0], [1, 0]], overheadRows: 0, ySort: true, godotType: 'tree' },
  pillar: { type: 'pillar', label: 'Säule', w: 1, h: 2, sx: 2, sy: 0, collision: [[0, 0]], overheadRows: 0, ySort: true, godotType: 'pillar' },
  rock: { type: 'rock', label: 'Großer Fels', w: 2, h: 2, sx: 3, sy: 0, collision: [[0, 0], [1, 0]], overheadRows: 0, ySort: true, godotType: 'rock' },
  arch: { type: 'arch', label: 'Torbogen', w: 3, h: 3, sx: 5, sy: 0, collision: [[0, 0], [2, 0]], overheadRows: 2, ySort: true, godotType: 'arch' },
  chest: { type: 'chest', label: 'Truhe', w: 1, h: 1, sx: 3, sy: 2, collision: [[0, 0]], overheadRows: 0, ySort: true, godotType: 'chest' },
  merchant: { type: 'merchant', label: 'Händler', w: 1, h: 2, sx: 8, sy: 0, collision: [[0, 0]], overheadRows: 0, ySort: true, godotType: 'npc' },
};

export const OBJECT_TYPES = Object.keys(OBJECT_DEFS) as BuiltinObjectType[];

// ---------------------------------------------------------------- own objects (figure builder)

/** atlas pixels per tile (built-in sprites are drawn at 16 px and doubled) */
const A = 32;
const custom = new Map<string, { def: ObjectDef; obj: CustomObject; img: HTMLImageElement | null }>();
let customKey = '';
const listeners = new Set<() => void>();
let version = 0;

/** definition of any object type (built-in or own) */
export function objectDef(type: ObjectType): ObjectDef | undefined {
  return (OBJECT_DEFS as Record<string, ObjectDef>)[type] ?? custom.get(type)?.def;
}

/** own objects of the current project (for palettes / the AI) */
export function customObjectDefs(): { def: ObjectDef; obj: CustomObject }[] {
  return [...custom.values()];
}

/** atlas changed (own objects loaded) – thumbnails redraw */
export function onAtlasChange(f: () => void) {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}
export const atlasVersion = () => version;

const changed = () => {
  cached = null;
  version++;
  listeners.forEach((f) => f());
  mapEvents.emit({ type: 'all' });
};

/** the project's own objects: packed below the built-in sprites of the atlas */
export function setCustomObjects(list: CustomObject[] | undefined) {
  const key = (list ?? []).map((o) => `${o.id}:${o.w}x${o.h}:${o.collision}:${o.png.length}`).join('|');
  if (key === customKey) return;
  customKey = key;
  const old = custom;
  const next = new Map<string, { def: ObjectDef; obj: CustomObject; img: HTMLImageElement | null }>();
  // shelf packing: rows of COLS tiles below the built-in rows
  let cx = 0;
  let cy = ROWS;
  let rowH = 0;
  for (const o of list ?? []) {
    if (cx + o.w > COLS && cx > 0) {
      cx = 0;
      cy += rowH;
      rowH = 0;
    }
    const def: ObjectDef = {
      type: o.id,
      label: o.label,
      w: o.w,
      h: o.h,
      sx: cx,
      sy: cy,
      collision: o.collision ? Array.from({ length: o.w }, (_, i) => [i, 0] as [number, number]) : [],
      overheadRows: 0,
      ySort: true,
      godotType: o.kind === 'character' ? 'npc' : o.kind === 'creature' ? 'enemy' : 'prop',
    };
    const prev = old.get(o.id);
    let img = prev && prev.obj.png === o.png ? prev.img : null;
    if (!img) {
      const im = new Image();
      im.onload = () => {
        const e = custom.get(o.id);
        if (e && e.obj.png === o.png) (e.img = im), changed();
      };
      im.src = o.png;
      if (im.complete && im.naturalWidth) img = im;
    }
    next.set(o.id, { def, obj: o, img });
    cx += o.w;
    rowH = Math.max(rowH, o.h);
  }
  custom.clear();
  for (const [k, v] of next) custom.set(k, v);
  changed();
}

/** atlas size in tiles (grows with own objects) */
function atlasTiles(): { cols: number; rows: number } {
  let cols = COLS;
  let rows = ROWS;
  for (const { def } of custom.values()) {
    cols = Math.max(cols, def.sx + def.w);
    rows = Math.max(rows, def.sy + def.h);
  }
  return { cols, rows };
}

const T = 16;
const COLS = 9;
const ROWS = 3;

let cached: { canvas: HTMLCanvasElement; dataUrl: string } | null = null;
let builtin: HTMLCanvasElement | null = null;

/** Sprite atlas of all objects: built-in sprites (doubled) + own objects, 32 px per tile. */
export function objectAtlas(): { canvas: HTMLCanvasElement; dataUrl: string } {
  if (cached) return cached;
  builtin ??= drawBuiltin();
  const { cols, rows } = atlasTiles();
  const canvas = document.createElement('canvas');
  canvas.width = cols * A;
  canvas.height = rows * A;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(builtin, 0, 0, COLS * T, ROWS * T, 0, 0, COLS * A, ROWS * A);
  for (const { def, img } of custom.values()) if (img) g.drawImage(img, def.sx * A, def.sy * A, def.w * A, def.h * A);
  cached = { canvas, dataUrl: canvas.toDataURL('image/png') };
  return cached;
}

/** the built-in sprites, drawn procedurally at 16 px per tile */
function drawBuiltin(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * T;
  canvas.height = ROWS * T;
  const ctx = canvas.getContext('2d')!;
  const rng = new Rng(4242);
  const px = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 1);
  };
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  const disc = (cx: number, cy: number, r: number, c: string) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) px(x, y, c);
  };

  // tree (2×3 tiles at 0,0): crown 2×2, trunk + roots in the base row
  {
    const ox = 0;
    rect(ox + 10, 36, 12, 4, 'rgba(0,0,0,0.35)'); // ground shadow
    rect(ox + 13, 24, 6, 14, '#5a3d27');
    rect(ox + 13, 24, 2, 14, '#6e4c31');
    rect(ox + 11, 37, 10, 2, '#4a3220');
    disc(ox + 16, 15, 13, '#2f4a2c');
    disc(ox + 14, 13, 11, '#3b5e36');
    disc(ox + 12, 10, 7, '#4c7442');
    for (let i = 0; i < 40; i++) px(ox + 4 + rng.int(0, 24), 3 + rng.int(0, 22), rng.pick(['#5b8a4e', '#2a4227', '#44683c']));
  }
  // pillar (1×2 at 2,0)
  {
    const ox = 2 * T;
    rect(ox + 3, 28, 11, 3, 'rgba(0,0,0,0.35)');
    rect(ox + 4, 4, 8, 26, '#5d5566');
    rect(ox + 4, 4, 2, 26, '#756c80');
    rect(ox + 10, 4, 2, 26, '#463f4e');
    rect(ox + 2, 1, 12, 4, '#6f6679');
    rect(ox + 2, 1, 12, 1, '#8a8195');
    rect(ox + 2, 27, 12, 4, '#4f4858');
    for (let y = 8; y < 26; y += 5) rect(ox + 4, y, 8, 1, '#4a4352');
  }
  // big rock (2×2 at 3,0)
  {
    const ox = 3 * T;
    rect(ox + 3, 26, 26, 5, 'rgba(0,0,0,0.35)');
    disc(ox + 16, 18, 12, '#575060');
    disc(ox + 13, 15, 9, '#686071');
    disc(ox + 11, 12, 5, '#7d7486');
    for (let i = 0; i < 25; i++) px(ox + 6 + rng.int(0, 20), 8 + rng.int(0, 18), rng.pick(['#4a4452', '#736a7c']));
  }
  // arch (3×3 at 5,0): two pillars + beam; top two rows are drawn over characters
  {
    const ox = 5 * T;
    const pil = (x: number) => {
      rect(ox + x, 8, 10, 40, '#5d5566');
      rect(ox + x, 8, 2, 40, '#756c80');
      rect(ox + x + 8, 8, 2, 40, '#463f4e');
      rect(ox + x - 1, 44, 12, 4, '#4f4858');
    };
    pil(3);
    pil(35);
    rect(ox + 1, 2, 46, 10, '#6f6679');
    rect(ox + 1, 2, 46, 2, '#8a8195');
    rect(ox + 13, 12, 22, 4, '#5d5566');
    rect(ox + 16, 16, 16, 2, '#4a4352');
    for (let x = 4; x < 46; x += 7) rect(ox + x, 4, 1, 8, '#574f60');
  }
  // chest (1×1 at 3,2)
  {
    const ox = 3 * T;
    const oy = 2 * T;
    rect(ox + 2, oy + 12, 13, 3, 'rgba(0,0,0,0.35)');
    rect(ox + 2, oy + 4, 12, 10, '#7a4e2a');
    rect(ox + 2, oy + 4, 12, 4, '#945f33');
    rect(ox + 2, oy + 8, 12, 1, '#c79a3d');
    rect(ox + 7, oy + 8, 2, 3, '#f2d27a');
  }
  // merchant NPC (1×2 at 8,0)
  {
    const ox = 8 * T;
    const oy = 0;
    rect(ox + 3, oy + 28, 10, 3, 'rgba(0,0,0,0.35)');
    rect(ox + 4, oy + 14, 8, 14, '#6a4b86');
    rect(ox + 4, oy + 14, 8, 2, '#80609c');
    rect(ox + 5, oy + 7, 6, 7, '#d8b894');
    rect(ox + 4, oy + 5, 8, 3, '#3c2c55');
    rect(ox + 6, oy + 10, 1, 1, '#2a1f2e');
    rect(ox + 9, oy + 10, 1, 1, '#2a1f2e');
    rect(ox + 11, oy + 18, 3, 6, '#b0874a');
  }
  return canvas;
}

export const OBJECT_ATLAS_TILE = A;
