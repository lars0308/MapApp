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
  // village: the roof row is drawn over characters walking behind the house
  house: { type: 'house', label: 'Haus', w: 3, h: 3, sx: 0, sy: 3, collision: [[0, 0], [1, 0], [2, 0], [0, -1], [1, -1], [2, -1]], overheadRows: 1, ySort: true, godotType: 'house' },
  well: { type: 'well', label: 'Brunnen', w: 1, h: 2, sx: 3, sy: 3, collision: [[0, 0]], overheadRows: 0, ySort: true, godotType: 'well' },
  pine: { type: 'pine', label: 'Schneetanne', w: 2, h: 3, sx: 4, sy: 3, collision: [[0, 0], [1, 0]], overheadRows: 0, ySort: true, godotType: 'tree' },
  palm: { type: 'palm', label: 'Palme', w: 2, h: 3, sx: 6, sy: 3, collision: [[0, 0], [1, 0]], overheadRows: 0, ySort: true, godotType: 'tree' },
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
const ROWS = 6;

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

  // soft oval ground shadow
  const oval = (cx: number, cy: number, rx: number, ry: number) => {
    for (let y = -ry; y <= ry; y++) {
      const w = Math.round(rx * Math.sqrt(1 - (y / (ry + 0.5)) ** 2));
      rect(cx - w, cy + y, w * 2, 1, 'rgba(10,30,10,0.32)');
    }
  };
  // tree (2×3 tiles at 0,0): round summer crown 2×2 with outline and light, trunk in the base row
  {
    const ox = 0;
    oval(ox + 16, 38, 11, 3); // ground shadow
    rect(ox + 13, 24, 6, 14, '#6b4527');
    rect(ox + 13, 24, 2, 14, '#8a5c34');
    rect(ox + 17, 24, 2, 14, '#553519');
    rect(ox + 11, 36, 10, 2, '#553519');
    disc(ox + 16, 15, 14, '#24481f'); // outline
    disc(ox + 16, 15, 13, '#3a7a32');
    disc(ox + 15, 13, 11, '#4a9640');
    disc(ox + 13, 10, 7, '#5fae4c');
    disc(ox + 11, 8, 3, '#7cc862');
    // leaf clusters: small bumps along the crown, darker below
    for (let i = 0; i < 26; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(4, 11);
      const x = ox + 16 + Math.cos(a) * r;
      const y = 15 + Math.sin(a) * r;
      px(Math.floor(x), Math.floor(y), Math.sin(a) > 0.2 ? '#2f6329' : '#6cbb55');
    }
    disc(ox + 16, 22, 5, '#336d2d');
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
    oval(ox + 16, 28, 13, 3);
    disc(ox + 16, 18, 12, '#4a5461'); // outline
    disc(ox + 16, 18, 11, '#6f7b88');
    disc(ox + 14, 15, 8, '#8e9aa6');
    disc(ox + 12, 12, 4, '#a9b4bf');
    for (let i = 0; i < 18; i++) px(ox + 7 + rng.int(0, 18), 10 + rng.int(0, 16), rng.pick(['#5c6773', '#7d8995']));
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
  // house (3×3 at 0,3): roof (2 rows, drawn from above), wall with door and windows
  {
    const ox = 0;
    const oy = 3 * T;
    rect(ox + 2, oy + 44, 44, 4, 'rgba(0,0,0,0.35)');
    // walls
    rect(ox + 3, oy + 26, 42, 20, '#c9b38a');
    rect(ox + 3, oy + 26, 42, 2, '#dcc9a2');
    for (let x = ox + 3; x < ox + 45; x += 7) rect(x, oy + 28, 1, 18, '#a8916a');
    rect(ox + 3, oy + 44, 42, 2, '#8f7a58');
    // door + windows
    rect(ox + 20, oy + 33, 8, 13, '#5a3d27');
    rect(ox + 21, oy + 34, 6, 12, '#6d4a2d');
    rect(ox + 26, oy + 40, 1, 1, '#f2d27a');
    for (const wx of [ox + 7, ox + 34]) {
      rect(wx, oy + 32, 7, 6, '#3a3048');
      rect(wx + 1, oy + 33, 5, 4, '#9ab8f0');
      rect(wx + 3, oy + 33, 1, 4, '#3a3048');
    }
    // roof
    for (let y = 0; y < 26; y++) {
      const inset = Math.max(0, 8 - Math.floor(y / 2));
      rect(ox + 1 + inset, oy + 2 + y, 46 - inset * 2, 1, y % 4 === 3 ? '#7a3a2e' : '#a44b3a');
    }
    rect(ox + 9, oy + 1, 30, 2, '#c05b47');
    rect(ox + 1, oy + 26, 46, 2, '#6a3026');
    rect(ox + 34, oy + 4, 5, 9, '#6f6679');
    rect(ox + 34, oy + 4, 5, 2, '#8a8195');
  }
  // well (1×2 at 3,3)
  {
    const ox = 3 * T;
    const oy = 3 * T;
    rect(ox + 1, oy + 28, 14, 3, 'rgba(0,0,0,0.35)');
    rect(ox + 2, oy + 18, 12, 11, '#6f6679');
    rect(ox + 2, oy + 18, 12, 2, '#8a8195');
    rect(ox + 4, oy + 19, 8, 3, '#2d4f7a');
    for (let x = ox + 2; x < ox + 14; x += 4) rect(x, oy + 22, 1, 7, '#57505f');
    rect(ox + 2, oy + 4, 2, 15, '#5a3d27');
    rect(ox + 12, oy + 4, 2, 15, '#5a3d27');
    rect(ox + 1, oy + 3, 14, 3, '#a44b3a');
    rect(ox + 7, oy + 6, 2, 8, '#b3a391');
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
  // snowy pine (2×3 at 4,3): winter forests
  {
    const ox = 4 * T;
    const oy = 3 * T;
    oval(ox + 16, oy + 44, 10, 3);
    rect(ox + 14, oy + 36, 4, 8, '#5c3c28');
    for (let k = 0; k < 5; k++) {
      const w = 8 + k * 5;
      const y = oy + 4 + k * 7;
      for (let r = 0; r < 8; r++) {
        const ww = Math.round((w * (r + 1)) / 8);
        rect(ox + 16 - Math.ceil(ww / 2), y + r, ww, 1, r < 2 ? '#f4f9fc' : r < 3 ? '#cfe0ec' : k % 2 ? '#2c6a4c' : '#2f7352');
      }
    }
    rect(ox + 15, oy + 2, 2, 3, '#ffffff');
  }
  // palm (2×3 at 6,3): desert oases and islands
  {
    const ox = 6 * T;
    const oy = 3 * T;
    oval(ox + 16, oy + 44, 9, 3);
    for (let k = 0; k < 30; k++) rect(ox + 14 + Math.round(Math.sin(k / 8) * 2), oy + 14 + k, 4, 1, k % 4 === 0 ? '#8a6238' : '#a8784a');
    const frond = (dx: number, dy: number) => {
      for (let t = 0; t <= 12; t++) {
        const x = ox + 16 + Math.round(dx * t);
        const y = oy + 12 + Math.round(dy * t + (t * t) / 14);
        rect(x - 1, y, 3, 2, t > 9 ? '#4f9a4c' : '#3f8a3e');
      }
    };
    for (const [dx, dy] of [[-1.1, -0.5], [1.1, -0.5], [-0.9, -0.1], [0.9, -0.1], [-0.3, -0.8], [0.3, -0.8]]) frond(dx, dy);
    rect(ox + 13, oy + 11, 6, 4, '#6a4a2a');
  }
  return canvas;
}

export const OBJECT_ATLAS_TILE = A;
