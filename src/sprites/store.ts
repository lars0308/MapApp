import { create } from 'zustand';
import type { Body, Bounds, Creature, CustomAnim, DemoPart, FitContext, SlotDef, SpriteDoc, SpriteKind, SpriteLayer, UserPart, View } from './types';
import { BODIES, CHARACTER_PARTS, CHARACTER_SLOTS, viewBody } from './parts/character';
import { CREATURE_PARTS, CREATURE_SLOTS, DEFAULT_CREATURE, viewCreature } from './parts/creature';
import { frameSize } from './frame';
import { OBJECT_PARTS, OBJECT_SLOTS } from './parts/object';
import { render, S } from './painter';
import { CHANNELS, PALETTE_PRESETS, RAMP_PRESETS, defaultRamps, hexToRgb, type Channel, type DrawPalette, type Ramp, type Ramps } from './palette';
import { uid } from '../utils/id';

export const SLOTS: Record<SpriteKind, SlotDef[]> = { character: CHARACTER_SLOTS, object: OBJECT_SLOTS, creature: CREATURE_SLOTS };
export const DEMO_PARTS: Record<SpriteKind, DemoPart[]> = { character: CHARACTER_PARTS, object: OBJECT_PARTS, creature: CREATURE_PARTS };
export const SIZES = [16, 32, 48, 64];

export type SpriteTool = 'pen' | 'eraser' | 'fill' | 'pipette' | 'line' | 'rect' | 'move' | 'dither' | 'replace' | 'lighten' | 'darken' | 'hand';

const DEFAULT_BOUNDS: Bounds = { x0: 8, y0: 9, x1: 23, y1: 26 };
const HISTORY = 60;

const KEY_DOC = (k: SpriteKind) => `mapforge.sprite.current.${k}`;
const KEY_PARTS = 'mapforge.sprite.parts.v1';
const KEY_GALLERY = 'mapforge.sprite.gallery.v1';
const KEY_PALETTES = 'mapforge.sprite.palettes.v1';
const KEY_ACTIVE_PALETTE = 'mapforge.sprite.palette';

// ---------------------------------------------------------------- pixel helpers

export const blank = (size: number) => new Uint8ClampedArray(size * size * 4);
const offset = (size: number) => Math.floor((size - S) / 2);

/** composite of all visible layers (bottom → top, alpha "over") */
export function compose(doc: SpriteDoc, only?: (l: SpriteLayer) => boolean): Uint8ClampedArray {
  const out = blank(doc.size);
  for (const l of doc.layers) {
    if (!l.visible || (only && !only(l))) continue;
    const d = l.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (!a) continue;
      if (a === 255 || !out[i + 3]) {
        out[i] = d[i];
        out[i + 1] = d[i + 1];
        out[i + 2] = d[i + 2];
        out[i + 3] = Math.max(a, out[i + 3]);
        continue;
      }
      const f = a / 255;
      out[i] = d[i] * f + out[i] * (1 - f);
      out[i + 1] = d[i + 1] * f + out[i + 1] * (1 - f);
      out[i + 2] = d[i + 2] * f + out[i + 2] * (1 - f);
      out[i + 3] = Math.min(255, out[i + 3] + a * (1 - out[i + 3] / 255));
    }
  }
  return out;
}

export function toPng(data: Uint8ClampedArray, size: number, scale = 1): string {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data), size, size), 0, 0);
  if (scale === 1) return c.toDataURL('image/png');
  const big = document.createElement('canvas');
  big.width = big.height = size * scale;
  const g = big.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(c, 0, 0, size * scale, size * scale);
  return big.toDataURL('image/png');
}

export function fromPng(png: string, size: number): Promise<Uint8ClampedArray> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      // smaller / larger parts are centred
      g.drawImage(img, Math.floor((size - img.naturalWidth) / 2), Math.floor((size - img.naturalHeight) / 2));
      resolve(g.getImageData(0, 0, size, size).data);
    };
    img.onerror = () => resolve(blank(size));
    img.src = png;
  });
}

/** paint a demo part into a size × size layer */
export function paintPart(part: DemoPart, ctx: FitContext, ramps: Ramps, size: number): Uint8ClampedArray {
  const px = render(part.paint(ctx), ramps);
  const out = blank(size);
  const o = offset(size);
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      const tx = px.x + x + o;
      const ty = px.y + y + o;
      if (tx < 0 || ty < 0 || tx >= size || ty >= size) continue;
      const s = (y * px.w + x) * 4;
      const t = (ty * size + tx) * 4;
      if (!px.data[s + 3]) continue;
      out[t] = px.data[s];
      out[t + 1] = px.data[s + 1];
      out[t + 2] = px.data[s + 2];
      out[t + 3] = px.data[s + 3];
    }
  return out;
}

export function partById(id: string | null): DemoPart | undefined {
  if (!id) return undefined;
  return (id.startsWith('c.') ? CHARACTER_PARTS : id.startsWith('k.') ? CREATURE_PARTS : OBJECT_PARTS).find((p) => p.id === id);
}

export function fitContext(doc: Pick<SpriteDoc, 'layers'>, view: View = 'front'): FitContext {
  let body: Body = BODIES.normal;
  let bounds: Bounds = DEFAULT_BOUNDS;
  let creature: Creature = DEFAULT_CREATURE;
  for (const l of doc.layers) {
    const p = partById(l.partId);
    if (p?.body) body = p.body;
    if (p?.bounds) bounds = p.bounds;
    if (p?.creature) creature = p.creature;
  }
  return { body: viewBody(body, view), bounds, creature: viewCreature(creature, view) };
}

// ---------------------------------------------------------------- views (front / side / back)

const viewCache = new WeakMap<SpriteLayer, Map<string, Uint8ClampedArray>>();

/** pixels of a layer in a view: own side/back pixels, else re-painted from the part, else the front */
export function layerPixels(doc: SpriteDoc, layer: SpriteLayer, view: View): Uint8ClampedArray {
  if (view === 'front') return layer.data;
  const own = layer.views?.[view];
  if (own) return own;
  const p = partById(layer.partId);
  if (!p || layer.edited) return layer.data;
  const key = `${view}|${doc.size}|${JSON.stringify(doc.ramps)}|${JSON.stringify(fitContext(doc, view))}`;
  let m = viewCache.get(layer);
  if (!m) viewCache.set(layer, (m = new Map()));
  let d = m.get(key);
  if (!d) {
    d = paintPart(p, fitContext(doc, view), doc.ramps, doc.size);
    m.set(key, d);
  }
  return d;
}

/** layers as seen from a view (from behind, wings / capes are drawn over the body) */
export function viewLayers(doc: SpriteDoc, view: View): SpriteLayer[] {
  const layers = doc.layers.map((l) => ({ ...l, data: layerPixels(doc, l, view) }));
  if (view !== 'back') return layers;
  return [...layers.filter((l) => l.slot !== 'back'), ...layers.filter((l) => l.slot === 'back')];
}

export function composeView(doc: SpriteDoc, view: View): Uint8ClampedArray {
  return view === 'front' ? compose(doc) : compose({ ...doc, layers: viewLayers(doc, view) });
}

const cloneViews = (v: SpriteLayer['views']) => (v ? Object.fromEntries(Object.entries(v).map(([k, d]) => [k, new Uint8ClampedArray(d!)])) : undefined);
const cloneLayers = (layers: SpriteLayer[]) => layers.map((l) => ({ ...l, data: new Uint8ClampedArray(l.data), views: cloneViews(l.views) }));

function slotIndex(kind: SpriteKind, slot: string | null) {
  const i = SLOTS[kind].findIndex((s) => s.id === slot);
  return i < 0 ? SLOTS[kind].length : i;
}

/** index where a layer of this slot goes (after all layers of the same or a lower slot) */
function insertAt(kind: SpriteKind, layers: SpriteLayer[], slot: string | null) {
  const si = slotIndex(kind, slot);
  let at = 0;
  layers.forEach((l, i) => {
    if (slotIndex(kind, l.slot) <= si) at = i + 1;
  });
  return at;
}

function layerFromPart(part: DemoPart, doc: SpriteDoc, ctx: FitContext): SpriteLayer {
  return { id: uid(), name: part.label, slot: part.slot, partId: part.id, edited: false, visible: true, data: paintPart(part, ctx, doc.ramps, doc.size) };
}

/** Put a demo part into the doc: replaces the layer of the same slot (unless the slot allows several). */
function withPart(doc: SpriteDoc, part: DemoPart): { layers: SpriteLayer[]; id: string } {
  const multi = SLOTS[doc.kind].find((s) => s.id === part.slot)?.multi;
  let layers = doc.layers.slice();
  const existing = multi ? -1 : layers.findIndex((l) => l.slot === part.slot);
  // body / base first, so the other parts refit to it
  if (part.body || part.bounds) {
    const tmp = existing >= 0 ? layers.map((l, i) => (i === existing ? { ...l, partId: part.id } : l)) : [...layers, { id: 'tmp', partId: part.id } as SpriteLayer];
    const ctx = fitContext({ layers: tmp });
    layers = layers.map((l) => {
      const p = partById(l.partId);
      return p && !l.edited && !p.body && !p.bounds ? { ...l, data: paintPart(p, ctx, doc.ramps, doc.size) } : l;
    });
  }
  const ctx = fitContext({ layers: existing >= 0 ? layers.map((l, i) => (i === existing ? { ...l, partId: part.id } : l)) : [...layers, { partId: part.id } as SpriteLayer] });
  const layer = layerFromPart(part, doc, ctx);
  if (existing >= 0) {
    layer.id = layers[existing].id;
    layer.visible = layers[existing].visible;
    layers[existing] = layer;
  } else layers.splice(insertAt(doc.kind, layers, part.slot), 0, layer);
  return { layers, id: layer.id };
}

const DEFAULT_SET: Record<SpriteKind, string[]> = {
  character: ['c.shadow.soft', 'c.body.normal', 'c.legs.pants', 'c.feet.boots', 'c.top.tunic', 'c.face.normal', 'c.hair.short', 'c.weapon.sword'],
  object: ['o.shadow.soft', 'o.base.chest', 'o.detail.bands', 'o.detail.lock'],
  creature: ['k.shadow.soft', 'k.body.slime', 'k.eyes.two', 'k.mouth.smile'],
};

export const KIND_NAME: Record<SpriteKind, string> = { character: 'Neuer Charakter', object: 'Neues Objekt', creature: 'Neue Kreatur' };

export function newDoc(kind: SpriteKind, size = 32, empty = false): SpriteDoc {
  let doc: SpriteDoc = { id: uid(), kind, name: KIND_NAME[kind], size, layers: [], ramps: defaultRamps(), updatedAt: Date.now() };
  if (!empty) for (const id of DEFAULT_SET[kind]) doc = { ...doc, layers: withPart(doc, partById(id)!).layers };
  return doc;
}

// ---------------------------------------------------------------- persistence (browser storage)

interface StoredDoc extends Omit<SpriteDoc, 'layers' | 'frames' | 'customAnims'> {
  layers: (Omit<SpriteLayer, 'data' | 'views'> & { png: string; views?: Record<string, string> })[];
  frames?: Record<string, string>;
  customAnims?: (Omit<CustomAnim, 'frames'> & { frames: string[] })[];
}
export interface GalleryEntry {
  doc: StoredDoc;
  thumb: string;
}

export function serialize(doc: SpriteDoc): StoredDoc {
  const F = frameSize(doc.size);
  return {
    ...doc,
    layers: doc.layers.map(({ data, views, ...l }) => ({
      ...l,
      png: toPng(data, doc.size),
      views: views ? Object.fromEntries(Object.entries(views).map(([k, d]) => [k, toPng(d!, doc.size)])) : undefined,
    })),
    frames: doc.frames ? Object.fromEntries(Object.entries(doc.frames).map(([k, d]) => [k, toPng(d, F)])) : undefined,
    customAnims: doc.customAnims?.map((a) => ({ ...a, frames: a.frames.map((f) => toPng(f, F)) })),
  };
}
export async function deserialize(s: StoredDoc): Promise<SpriteDoc> {
  const F = frameSize(s.size);
  const layers = await Promise.all(
    s.layers.map(async ({ png, views, ...l }) => {
      const out: SpriteLayer = { ...l, data: await fromPng(png, s.size) };
      if (views) {
        out.views = {};
        for (const [k, v] of Object.entries(views)) out.views[k as 'side' | 'back'] = await fromPng(v, s.size);
      }
      return out;
    }),
  );
  const frames: Record<string, Uint8ClampedArray> = {};
  for (const [k, v] of Object.entries(s.frames ?? {})) frames[k] = await fromPng(v, F);
  const customAnims = await Promise.all((s.customAnims ?? []).map(async (a) => ({ ...a, frames: await Promise.all(a.frames.map((f) => fromPng(f, F))) })));
  return { ...s, ramps: { ...defaultRamps(), ...s.ramps }, layers, frames, customAnims };
}
export type { StoredDoc };

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------- store

interface KindState {
  doc: SpriteDoc;
  active: string | null;
  undo: SpriteLayer[][];
  redo: SpriteLayer[][];
  /** slots (and "colors") kept by "Zufall" */
  locks: Record<string, boolean>;
}

interface SpriteState {
  character: KindState;
  object: KindState;
  creature: KindState;
  /** view shown / edited in the builder */
  view: View;
  setViewDir: (v: View) => void;
  /** pixels to paint on for a layer in the current view (own side/back copy is created on demand) */
  editPixels: (kind: SpriteKind, layerId: string) => Uint8ClampedArray | null;
  loaded: Record<SpriteKind, boolean>;
  tool: SpriteTool;
  color: string;
  mirror: boolean;
  /** brush size in pixels (pen, eraser, dither, lighten, darken) */
  brush: number;
  /** canvas zoom on top of "fit" (1 = fit) and pan in screen px */
  zoom: number;
  pan: { x: number; y: number };
  grid: boolean;
  /** own palettes (presets come from PALETTE_PRESETS) */
  palettes: DrawPalette[];
  activePalette: string;
  setBrush: (n: number) => void;
  setView: (v: Partial<{ zoom: number; pan: { x: number; y: number }; grid: boolean }>) => void;
  setActivePalette: (id: string) => void;
  /** change a palette – a preset is copied first ("Meine …"); returns the edited palette id */
  editPalette: (id: string, fn: (p: DrawPalette) => DrawPalette) => string;
  createPalette: (name: string, colors: string[]) => string;
  deletePalette: (id: string) => void;
  duplicateLayer: (kind: SpriteKind, id: string) => void;
  mergeDown: (kind: SpriteKind, id: string) => void;
  outlineLayer: (kind: SpriteKind, id: string, color: string) => void;
  /** hand-edited frame of a built-in animation (null = back to the generated one) */
  setFrame: (kind: SpriteKind, key: string, data: Uint8ClampedArray | null) => void;
  addCustomAnim: (kind: SpriteKind, anim: CustomAnim) => void;
  updateCustomAnim: (kind: SpriteKind, id: string, patch: Partial<CustomAnim>) => void;
  deleteCustomAnim: (kind: SpriteKind, id: string) => void;
  /** own image as a new layer (centred) */
  importImageLayer: (kind: SpriteKind, img: ImageData, name: string) => void;
  /** own image as a new figure / object (size fitted: 16, 32, 48 or 64) */
  newFromImage: (kind: SpriteKind, img: ImageData, name: string) => void;
  /** replace the current figure (sprite file import / gallery) */
  setDocument: (kind: SpriteKind, doc: SpriteDoc) => void;
  /** snap every pixel of every layer to the nearest palette colour */
  applyPalette: (kind: SpriteKind, colors: string[]) => void;
  userParts: UserPart[];
  gallery: GalleryEntry[];
  /** bumps on every pixel change (canvas redraw) */
  rev: number;
  load: (kind: SpriteKind) => Promise<void>;
  setTool: (t: SpriteTool) => void;
  setColor: (c: string) => void;
  setMirror: (v: boolean) => void;
  setActive: (kind: SpriteKind, id: string | null) => void;
  /** snapshot for undo – call before changing pixels */
  checkpoint: (kind: SpriteKind) => void;
  touch: (kind: SpriteKind, layerId?: string) => void;
  undo: (kind: SpriteKind) => void;
  redo: (kind: SpriteKind) => void;
  placePart: (kind: SpriteKind, part: DemoPart | UserPart) => Promise<void>;
  addLayer: (kind: SpriteKind) => string;
  removeLayer: (kind: SpriteKind, id: string) => void;
  moveLayer: (kind: SpriteKind, id: string, dir: -1 | 1) => void;
  toggleLayer: (kind: SpriteKind, id: string) => void;
  flipLayer: (kind: SpriteKind, id: string) => void;
  renameDoc: (kind: SpriteKind, name: string) => void;
  setRamp: (kind: SpriteKind, ch: Channel, ramp: Ramp) => void;
  toggleLock: (kind: SpriteKind, slot: string) => void;
  randomize: (kind: SpriteKind) => void;
  reset: (kind: SpriteKind, empty: boolean, size?: number) => void;
  setSize: (kind: SpriteKind, size: number) => void;
  saveAsPart: (kind: SpriteKind, slot: string, label: string, layerId: string | null) => void;
  deleteUserPart: (id: string) => void;
  saveToGallery: (kind: SpriteKind) => boolean;
  openFromGallery: (kind: SpriteKind, id: string) => Promise<void>;
  deleteFromGallery: (id: string) => void;
}

const kindState = (kind: SpriteKind): KindState => {
  const doc = newDoc(kind);
  return { doc, active: doc.layers[doc.layers.length - 1]?.id ?? null, undo: [], redo: [], locks: {} };
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useSprites = create<SpriteState>((set, get) => {
  const patch = (kind: SpriteKind, p: Partial<KindState>) => {
    set({ [kind]: { ...get()[kind], ...p }, rev: get().rev + 1 } as Partial<SpriteState>);
    scheduleSave(kind);
  };
  const setDoc = (kind: SpriteKind, doc: Partial<SpriteDoc>, extra: Partial<KindState> = {}) =>
    patch(kind, { doc: { ...get()[kind].doc, ...doc, updatedAt: Date.now() }, ...extra });
  const scheduleSave = (kind: SpriteKind) => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => write(KEY_DOC(kind), serialize(get()[kind].doc)), 400);
  };
  const snapshot = (kind: SpriteKind) => {
    const k = get()[kind];
    return { undo: [...k.undo, cloneLayers(k.doc.layers)].slice(-HISTORY), redo: [] as SpriteLayer[][] };
  };

  return {
    character: kindState('character'),
    object: kindState('object'),
    creature: kindState('creature'),
    loaded: { character: false, object: false, creature: false },
    view: 'front',
    setViewDir: (view) => set({ view, rev: get().rev + 1 }),
    editPixels: (kind, layerId) => {
      const k = get()[kind];
      const layer = k.doc.layers.find((l) => l.id === layerId);
      if (!layer) return null;
      const view = get().view;
      if (view === 'front') return layer.data;
      if (layer.views?.[view]) return layer.views[view]!;
      const copy = new Uint8ClampedArray(layerPixels(k.doc, layer, view));
      const layers = k.doc.layers.map((l) => (l.id === layerId ? { ...l, views: { ...l.views, [view]: copy } } : l));
      set({ [kind]: { ...k, doc: { ...k.doc, layers } } } as Partial<SpriteState>);
      return copy;
    },
    tool: 'pen',
    color: '#e86f6f',
    mirror: false,
    brush: 1,
    zoom: 1,
    pan: { x: 0, y: 0 },
    grid: true,
    palettes: read<DrawPalette[]>(KEY_PALETTES, []),
    activePalette: read<string>(KEY_ACTIVE_PALETTE, 'mapforge'),
    setBrush: (brush) => set({ brush }),
    setView: (v) => set(v as Partial<SpriteState>),
    setActivePalette: (activePalette) => {
      set({ activePalette });
      write(KEY_ACTIVE_PALETTE, activePalette);
    },
    editPalette: (id, fn) => {
      let palettes = get().palettes;
      let target = palettes.find((p) => p.id === id);
      if (!target) {
        const preset = PALETTE_PRESETS.find((p) => p.id === id);
        if (!preset) return id;
        target = { id: uid(), name: `Meine ${preset.name}`, colors: [...preset.colors] };
        palettes = [...palettes, target];
      }
      const next = fn(target);
      palettes = palettes.map((p) => (p.id === target!.id ? { ...next, id: target!.id, preset: undefined } : p));
      set({ palettes, activePalette: target.id });
      write(KEY_PALETTES, palettes);
      write(KEY_ACTIVE_PALETTE, target.id);
      return target.id;
    },
    createPalette: (name, colors) => {
      const p: DrawPalette = { id: uid(), name, colors };
      const palettes = [...get().palettes, p];
      set({ palettes, activePalette: p.id });
      write(KEY_PALETTES, palettes);
      write(KEY_ACTIVE_PALETTE, p.id);
      return p.id;
    },
    deletePalette: (id) => {
      const palettes = get().palettes.filter((p) => p.id !== id);
      set({ palettes, activePalette: get().activePalette === id ? 'mapforge' : get().activePalette });
      write(KEY_PALETTES, palettes);
    },
    duplicateLayer: (kind, id) => {
      const k = get()[kind];
      const i = k.doc.layers.findIndex((l) => l.id === id);
      if (i < 0) return;
      const src = k.doc.layers[i];
      const copy: SpriteLayer = { ...src, id: uid(), name: `${src.name} Kopie`, slot: 'extra', partId: null, edited: true, data: new Uint8ClampedArray(src.data) };
      const layers = [...k.doc.layers.slice(0, i + 1), copy, ...k.doc.layers.slice(i + 1)];
      setDoc(kind, { layers }, { ...snapshot(kind), active: copy.id });
    },
    mergeDown: (kind, id) => {
      const k = get()[kind];
      const i = k.doc.layers.findIndex((l) => l.id === id);
      if (i <= 0) return;
      const below = k.doc.layers[i - 1];
      const merged = compose({ ...k.doc, layers: [{ ...below, visible: true }, { ...k.doc.layers[i], visible: true }] });
      const layers = k.doc.layers.filter((l) => l.id !== id).map((l) => (l.id === below.id ? { ...l, data: merged, edited: true } : l));
      setDoc(kind, { layers }, { ...snapshot(kind), active: below.id });
    },
    setFrame: (kind, key, data) => {
      const frames = { ...(get()[kind].doc.frames ?? {}) };
      if (data) frames[key] = data;
      else delete frames[key];
      setDoc(kind, { frames });
    },
    addCustomAnim: (kind, anim) => setDoc(kind, { customAnims: [...(get()[kind].doc.customAnims ?? []), anim] }),
    updateCustomAnim: (kind, id, p) => setDoc(kind, { customAnims: (get()[kind].doc.customAnims ?? []).map((a) => (a.id === id ? { ...a, ...p } : a)) }),
    deleteCustomAnim: (kind, id) => setDoc(kind, { customAnims: (get()[kind].doc.customAnims ?? []).filter((a) => a.id !== id) }),
    importImageLayer: (kind, img, name) => {
      const k = get()[kind];
      const n = k.doc.size;
      const data = blank(n);
      const ox = Math.floor((n - img.width) / 2);
      const oy = Math.max(Math.floor((n - img.height) / 2), n - img.height - Math.round(n * 0.06));
      for (let y = 0; y < img.height; y++)
        for (let x = 0; x < img.width; x++) {
          const tx = x + ox;
          const ty = y + oy;
          if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
          const s = (y * img.width + x) * 4;
          if (img.data[s + 3]) data.set(img.data.subarray(s, s + 4), (ty * n + tx) * 4);
        }
      const layer: SpriteLayer = { id: uid(), name, slot: 'extra', partId: null, edited: true, visible: true, data };
      setDoc(kind, { layers: [...k.doc.layers, layer] }, { ...snapshot(kind), active: layer.id });
    },
    newFromImage: (kind, img, name) => {
      const need = Math.max(img.width, img.height);
      const size = SIZES.find((s) => s >= need) ?? 64;
      let src = img;
      if (need > 64) {
        // larger images are scaled down (nearest neighbour) to 64 px
        const f = 64 / need;
        const w = Math.max(1, Math.round(img.width * f));
        const h = Math.max(1, Math.round(img.height * f));
        const d = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const s = (Math.floor(y / f) * img.width + Math.floor(x / f)) * 4;
            d.set(img.data.subarray(s, s + 4), (y * w + x) * 4);
          }
        src = new ImageData(d, w, h);
      }
      const doc = newDoc(kind, size, true);
      doc.name = name;
      patch(kind, { ...snapshot(kind), doc, active: null });
      get().importImageLayer(kind, src, name);
    },
    setDocument: (kind, doc) => patch(kind, { ...snapshot(kind), doc: { ...doc, kind }, active: doc.layers[doc.layers.length - 1]?.id ?? null }),
    applyPalette: (kind, colors) => {
      if (!colors.length) return;
      const k = get()[kind];
      const pal = colors.map(hexToRgb);
      const hist = snapshot(kind);
      const near = new Map<number, [number, number, number]>();
      const layers = k.doc.layers.map((l) => {
        const d = new Uint8ClampedArray(l.data);
        for (let i = 0; i < d.length; i += 4) {
          if (!d[i + 3]) continue;
          const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
          let best = near.get(key);
          if (!best) {
            let bd = Infinity;
            for (const c of pal) {
              // weighted RGB distance (closer to what the eye sees)
              const dr = c[0] - d[i];
              const dg = c[1] - d[i + 1];
              const db = c[2] - d[i + 2];
              const dist = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
              if (dist < bd) {
                bd = dist;
                best = c;
              }
            }
            near.set(key, best!);
          }
          d[i] = best![0];
          d[i + 1] = best![1];
          d[i + 2] = best![2];
        }
        return { ...l, data: d, edited: true };
      });
      setDoc(kind, { layers }, hist);
    },
    outlineLayer: (kind, id, color) => {
      const k = get()[kind];
      const n = k.doc.size;
      const [r, g, b] = hexToRgb(color);
      const hist = snapshot(kind);
      setDoc(
        kind,
        {
          layers: k.doc.layers.map((l) => {
            if (l.id !== id) return l;
            const d = new Uint8ClampedArray(l.data);
            const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n && l.data[(y * n + x) * 4 + 3] > 0;
            for (let y = 0; y < n; y++)
              for (let x = 0; x < n; x++) {
                if (solid(x, y)) continue;
                if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) d.set([r, g, b, 255], (y * n + x) * 4);
              }
            return { ...l, data: d, edited: true };
          }),
        },
        hist,
      );
    },
    userParts: read<UserPart[]>(KEY_PARTS, []),
    gallery: read<GalleryEntry[]>(KEY_GALLERY, []),
    rev: 0,

    load: async (kind) => {
      if (get().loaded[kind]) return;
      const stored = read<StoredDoc | null>(KEY_DOC(kind), null);
      if (stored?.layers) {
        try {
          const doc = await deserialize(stored);
          set({ [kind]: { ...get()[kind], doc, active: doc.layers[doc.layers.length - 1]?.id ?? null }, rev: get().rev + 1 } as Partial<SpriteState>);
        } catch {
          // broken entry: keep the default figure
        }
      }
      set({ loaded: { ...get().loaded, [kind]: true } });
    },
    setTool: (tool) => set({ tool }),
    setColor: (color) => set({ color, tool: ['eraser', 'move', 'pipette', 'hand', 'lighten', 'darken'].includes(get().tool) ? 'pen' : get().tool }),
    setMirror: (mirror) => set({ mirror }),
    setActive: (kind, id) => patch(kind, { active: id }),
    checkpoint: (kind) => patch(kind, snapshot(kind)),
    touch: (kind, layerId) => {
      const k = get()[kind];
      const front = get().view === 'front';
      setDoc(kind, { layers: layerId && front ? k.doc.layers.map((l) => (l.id === layerId ? { ...l, edited: true } : l)) : k.doc.layers });
    },
    undo: (kind) => {
      const k = get()[kind];
      const prev = k.undo[k.undo.length - 1];
      if (!prev) return;
      setDoc(kind, { layers: prev }, { undo: k.undo.slice(0, -1), redo: [...k.redo, cloneLayers(k.doc.layers)], active: prev.some((l) => l.id === k.active) ? k.active : (prev[prev.length - 1]?.id ?? null) });
    },
    redo: (kind) => {
      const k = get()[kind];
      const next = k.redo[k.redo.length - 1];
      if (!next) return;
      setDoc(kind, { layers: next }, { redo: k.redo.slice(0, -1), undo: [...k.undo, cloneLayers(k.doc.layers)], active: next.some((l) => l.id === k.active) ? k.active : (next[next.length - 1]?.id ?? null) });
    },

    placePart: async (kind, part) => {
      const k = get()[kind];
      const hist = snapshot(kind);
      if ('paint' in part) {
        const { layers, id } = withPart(k.doc, part);
        setDoc(kind, { layers }, { ...hist, active: id });
        return;
      }
      const data = await fromPng(part.png, k.doc.size);
      const doc = get()[kind].doc;
      const multi = SLOTS[kind].find((s) => s.id === part.slot)?.multi;
      const layers = doc.layers.slice();
      const at = multi ? -1 : layers.findIndex((l) => l.slot === part.slot);
      const layer: SpriteLayer = { id: at >= 0 ? layers[at].id : uid(), name: part.label, slot: part.slot, partId: null, edited: true, visible: true, data };
      if (at >= 0) layers[at] = layer;
      else layers.splice(insertAt(kind, layers, part.slot), 0, layer);
      setDoc(kind, { layers }, { ...hist, active: layer.id });
    },
    addLayer: (kind) => {
      const k = get()[kind];
      const layer: SpriteLayer = { id: uid(), name: `Zeichnung ${k.doc.layers.filter((l) => l.slot === 'extra').length + 1}`, slot: 'extra', partId: null, edited: true, visible: true, data: blank(k.doc.size) };
      setDoc(kind, { layers: [...k.doc.layers, layer] }, { ...snapshot(kind), active: layer.id });
      return layer.id;
    },
    removeLayer: (kind, id) => {
      const k = get()[kind];
      const layers = k.doc.layers.filter((l) => l.id !== id);
      setDoc(kind, { layers }, { ...snapshot(kind), active: k.active === id ? (layers[layers.length - 1]?.id ?? null) : k.active });
    },
    moveLayer: (kind, id, dir) => {
      const layers = get()[kind].doc.layers.slice();
      const i = layers.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= layers.length) return;
      [layers[i], layers[j]] = [layers[j], layers[i]];
      setDoc(kind, { layers }, snapshot(kind));
    },
    toggleLayer: (kind, id) => setDoc(kind, { layers: get()[kind].doc.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)) }),
    flipLayer: (kind, id) => {
      const k = get()[kind];
      const n = k.doc.size;
      const hist = snapshot(kind);
      setDoc(
        kind,
        {
          layers: k.doc.layers.map((l) => {
            if (l.id !== id) return l;
            const d = blank(n);
            for (let y = 0; y < n; y++)
              for (let x = 0; x < n; x++) {
                const s = (y * n + x) * 4;
                const t = (y * n + (n - 1 - x)) * 4;
                d[t] = l.data[s];
                d[t + 1] = l.data[s + 1];
                d[t + 2] = l.data[s + 2];
                d[t + 3] = l.data[s + 3];
              }
            const flipOne = (src: Uint8ClampedArray) => {
              const o = blank(n);
              for (let y = 0; y < n; y++)
                for (let x = 0; x < n; x++) o.set(src.subarray((y * n + x) * 4, (y * n + x) * 4 + 4), (y * n + (n - 1 - x)) * 4);
              return o;
            };
            return { ...l, data: d, edited: true, views: l.views ? Object.fromEntries(Object.entries(l.views).map(([v, dd]) => [v, flipOne(dd!)])) : undefined };
          }),
        },
        hist,
      );
    },
    renameDoc: (kind, name) => setDoc(kind, { name }),

    setRamp: (kind, ch, ramp) => {
      const k = get()[kind];
      const old = k.doc.ramps[ch].map(hexToRgb);
      const neu = ramp.map(hexToRgb);
      const hist = snapshot(kind);
      const recolor = (src: Uint8ClampedArray) => {
        const d = new Uint8ClampedArray(src);
        let changed = false;
        for (let i = 0; i < d.length; i += 4) {
          if (!d[i + 3]) continue;
          for (let s = 0; s < 3; s++)
            if (d[i] === old[s][0] && d[i + 1] === old[s][1] && d[i + 2] === old[s][2]) {
              d[i] = neu[s][0];
              d[i + 1] = neu[s][1];
              d[i + 2] = neu[s][2];
              changed = true;
              break;
            }
        }
        return changed ? d : src;
      };
      const layers = k.doc.layers.map((l) => {
        const data = recolor(l.data);
        const views = l.views ? Object.fromEntries(Object.entries(l.views).map(([v, d]) => [v, recolor(d!)])) : undefined;
        return data !== l.data || views ? { ...l, data, views } : l;
      });
      // hand-edited frames and own animations follow the colour change too
      const frames = k.doc.frames ? Object.fromEntries(Object.entries(k.doc.frames).map(([key, d]) => [key, recolor(d)])) : undefined;
      const customAnims = k.doc.customAnims?.map((a) => ({ ...a, frames: a.frames.map(recolor) }));
      setDoc(kind, { layers, ramps: { ...k.doc.ramps, [ch]: ramp }, frames, customAnims }, hist);
    },
    toggleLock: (kind, slot) => patch(kind, { locks: { ...get()[kind].locks, [slot]: !get()[kind].locks[slot] } }),

    randomize: (kind) => {
      const k = get()[kind];
      const hist = snapshot(kind);
      const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
      let doc: SpriteDoc = { ...k.doc };
      if (!k.locks.colors) doc.ramps = Object.fromEntries(CHANNELS.map((c) => [c, pick(RAMP_PRESETS[c])])) as Ramps;
      // unlocked demo layers are rebuilt, own drawings stay
      const keep = (l: SpriteLayer) => !l.partId || l.edited || k.locks[l.slot ?? ''];
      doc.layers = doc.layers.filter(keep);
      // colours of kept demo layers follow the new ramps only if they were not drawn on
      const parts = DEMO_PARTS[kind];
      const chance: Record<string, number> =
        kind === 'character'
          ? { shadow: 1, back: 0.3, body: 1, legs: 0.9, feet: 0.85, top: 0.95, hands: 0.4, face: 1, hair: 0.85, hat: 0.4, weapon: 0.75, offhand: 0.4 }
          : kind === 'creature'
            ? { shadow: 1, body: 1, eyes: 1, mouth: 0.9, horns: 0.45, limbs: 0.35 }
            : { shadow: 1, base: 1 };
      // body / base first (others fit to it)
      const order = [...SLOTS[kind]].sort((a, b) => Number(b.id === 'body' || b.id === 'base') - Number(a.id === 'body' || a.id === 'base'));
      for (const slot of order) {
        if (k.locks[slot.id] || slot.id === 'extra') continue;
        if (slot.multi) {
          const n = slot.id === 'detail' ? Math.floor(Math.random() * 3) : slot.id === 'pattern' ? (Math.random() < 0.5 ? 1 : 0) : slot.id === 'headx' ? (Math.random() < 0.45 ? 1 : 0) + (Math.random() < 0.15 ? 1 : 0) : Math.random() < 0.35 ? 1 : 0;
          const pool = parts.filter((p) => p.slot === slot.id);
          const chosen = new Set<string>();
          for (let i = 0; i < n; i++) chosen.add(pick(pool).id);
          for (const id of chosen) doc = { ...doc, layers: withPart(doc, partById(id)!).layers };
          continue;
        }
        if (Math.random() > (chance[slot.id] ?? 0.5)) continue;
        const pool = parts.filter((p) => p.slot === slot.id);
        if (pool.length) doc = { ...doc, layers: withPart(doc, pick(pool)).layers };
      }
      // re-render locked demo layers with the new colours / body
      const ctx = fitContext(doc);
      doc.layers = doc.layers.map((l) => {
        const p = partById(l.partId);
        return p && !l.edited ? { ...l, data: paintPart(p, ctx, doc.ramps, doc.size) } : l;
      });
      setDoc(kind, { layers: doc.layers, ramps: doc.ramps }, { ...hist, active: doc.layers[doc.layers.length - 1]?.id ?? null });
    },
    reset: (kind, empty, size) => {
      const doc = newDoc(kind, size ?? get()[kind].doc.size, empty);
      patch(kind, { ...snapshot(kind), doc, active: doc.layers[doc.layers.length - 1]?.id ?? null });
    },
    setSize: (kind, size) => {
      const k = get()[kind];
      const from = k.doc.size;
      if (from === size) return;
      const d = Math.floor((size - from) / 2);
      const layers = k.doc.layers.map((l) => {
        const p = partById(l.partId);
        if (p && !l.edited) return l; // re-painted below
        const out = blank(size);
        for (let y = 0; y < from; y++)
          for (let x = 0; x < from; x++) {
            const tx = x + d;
            const ty = y + d;
            if (tx < 0 || ty < 0 || tx >= size || ty >= size) continue;
            const s = (y * from + x) * 4;
            const t = (ty * size + tx) * 4;
            out.set(l.data.subarray(s, s + 4), t);
          }
        return { ...l, data: out };
      });
      const ctx = fitContext({ layers });
      const doc = { ...k.doc, size };
      setDoc(
        kind,
        {
          size,
          layers: layers.map((l) => {
            const p = partById(l.partId);
            return p && !l.edited ? { ...l, data: paintPart(p, ctx, doc.ramps, size) } : l;
          }),
        },
        { undo: [], redo: [] },
      );
      // own side / back pixels and hand-edited frames belong to the old size
      const d2 = get()[kind].doc;
      if (d2.layers.some((l) => l.views) || d2.frames || d2.customAnims?.length)
        setDoc(kind, { layers: d2.layers.map((l) => ({ ...l, views: undefined })), frames: undefined, customAnims: [] });
    },

    saveAsPart: (kind, slot, label, layerId) => {
      const k = get()[kind];
      const data = layerId ? k.doc.layers.find((l) => l.id === layerId)?.data : compose(k.doc);
      if (!data) return;
      const part: UserPart = { id: uid(), kind, slot, label: label.trim() || 'Eigenes Teil', size: k.doc.size, png: toPng(data, k.doc.size), createdAt: Date.now() };
      const userParts = [...get().userParts, part];
      set({ userParts });
      write(KEY_PARTS, userParts);
    },
    deleteUserPart: (id) => {
      const userParts = get().userParts.filter((p) => p.id !== id);
      set({ userParts });
      write(KEY_PARTS, userParts);
    },
    saveToGallery: (kind) => {
      const doc = get()[kind].doc;
      const entry: GalleryEntry = { doc: serialize(doc), thumb: toPng(compose(doc), doc.size) };
      const gallery = [entry, ...get().gallery.filter((g) => g.doc.id !== doc.id)];
      if (!write(KEY_GALLERY, gallery)) return false;
      set({ gallery });
      return true;
    },
    openFromGallery: async (kind, id) => {
      const e = get().gallery.find((g) => g.doc.id === id);
      if (!e) return;
      const doc = await deserialize(e.doc);
      patch(kind, { ...snapshot(kind), doc, active: doc.layers[doc.layers.length - 1]?.id ?? null });
    },
    deleteFromGallery: (id) => {
      const gallery = get().gallery.filter((g) => g.doc.id !== id);
      set({ gallery });
      write(KEY_GALLERY, gallery);
    },
  };
});
