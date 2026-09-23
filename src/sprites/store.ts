import { create } from 'zustand';
import type { Body, Bounds, DemoPart, FitContext, SlotDef, SpriteDoc, SpriteKind, SpriteLayer, UserPart } from './types';
import { BODIES, CHARACTER_PARTS, CHARACTER_SLOTS } from './parts/character';
import { OBJECT_PARTS, OBJECT_SLOTS } from './parts/object';
import { render, S } from './painter';
import { CHANNELS, RAMP_PRESETS, defaultRamps, hexToRgb, type Channel, type Ramp, type Ramps } from './palette';
import { uid } from '../utils/id';

export const SLOTS: Record<SpriteKind, SlotDef[]> = { character: CHARACTER_SLOTS, object: OBJECT_SLOTS };
export const DEMO_PARTS: Record<SpriteKind, DemoPart[]> = { character: CHARACTER_PARTS, object: OBJECT_PARTS };
export const SIZES = [16, 32, 48, 64];

export type SpriteTool = 'pen' | 'eraser' | 'fill' | 'pipette' | 'line' | 'rect' | 'move';

const DEFAULT_BOUNDS: Bounds = { x0: 8, y0: 9, x1: 23, y1: 26 };
const HISTORY = 60;

const KEY_DOC = (k: SpriteKind) => `mapforge.sprite.current.${k}`;
const KEY_PARTS = 'mapforge.sprite.parts.v1';
const KEY_GALLERY = 'mapforge.sprite.gallery.v1';

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
  return (id.startsWith('c.') ? CHARACTER_PARTS : OBJECT_PARTS).find((p) => p.id === id);
}

export function fitContext(doc: Pick<SpriteDoc, 'layers'>): FitContext {
  let body: Body = BODIES.normal;
  let bounds: Bounds = DEFAULT_BOUNDS;
  for (const l of doc.layers) {
    const p = partById(l.partId);
    if (p?.body) body = p.body;
    if (p?.bounds) bounds = p.bounds;
  }
  return { body, bounds };
}

const cloneLayers = (layers: SpriteLayer[]) => layers.map((l) => ({ ...l, data: new Uint8ClampedArray(l.data) }));

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
};

export function newDoc(kind: SpriteKind, size = 32, empty = false): SpriteDoc {
  let doc: SpriteDoc = { id: uid(), kind, name: kind === 'character' ? 'Neuer Charakter' : 'Neues Objekt', size, layers: [], ramps: defaultRamps(), updatedAt: Date.now() };
  if (!empty) for (const id of DEFAULT_SET[kind]) doc = { ...doc, layers: withPart(doc, partById(id)!).layers };
  return doc;
}

// ---------------------------------------------------------------- persistence (browser storage)

interface StoredDoc extends Omit<SpriteDoc, 'layers'> {
  layers: (Omit<SpriteLayer, 'data'> & { png: string })[];
}
export interface GalleryEntry {
  doc: StoredDoc;
  thumb: string;
}

function serialize(doc: SpriteDoc): StoredDoc {
  return { ...doc, layers: doc.layers.map(({ data, ...l }) => ({ ...l, png: toPng(data, doc.size) })) };
}
async function deserialize(s: StoredDoc): Promise<SpriteDoc> {
  const layers = await Promise.all(s.layers.map(async ({ png, ...l }) => ({ ...l, data: await fromPng(png, s.size) })));
  return { ...s, ramps: { ...defaultRamps(), ...s.ramps }, layers };
}

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
  loaded: Record<SpriteKind, boolean>;
  tool: SpriteTool;
  color: string;
  mirror: boolean;
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
    loaded: { character: false, object: false },
    tool: 'pen',
    color: '#e86f6f',
    mirror: false,
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
    setColor: (color) => set({ color, tool: get().tool === 'eraser' || get().tool === 'move' || get().tool === 'pipette' ? 'pen' : get().tool }),
    setMirror: (mirror) => set({ mirror }),
    setActive: (kind, id) => patch(kind, { active: id }),
    checkpoint: (kind) => patch(kind, snapshot(kind)),
    touch: (kind, layerId) => {
      const k = get()[kind];
      setDoc(kind, { layers: layerId ? k.doc.layers.map((l) => (l.id === layerId ? { ...l, edited: true } : l)) : k.doc.layers });
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
            return { ...l, data: d, edited: true };
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
      const layers = k.doc.layers.map((l) => {
        const d = new Uint8ClampedArray(l.data);
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
        return changed ? { ...l, data: d } : l;
      });
      setDoc(kind, { layers, ramps: { ...k.doc.ramps, [ch]: ramp } }, hist);
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
          ? { shadow: 1, body: 1, legs: 0.9, feet: 0.85, top: 0.95, hands: 0.4, face: 1, headx: 0.35, hair: 0.85, hat: 0.4, weapon: 0.75, offhand: 0.4 }
          : { shadow: 1, base: 1 };
      // body / base first (others fit to it)
      const order = [...SLOTS[kind]].sort((a, b) => Number(b.id === 'body' || b.id === 'base') - Number(a.id === 'body' || a.id === 'base'));
      for (const slot of order) {
        if (k.locks[slot.id] || slot.id === 'extra') continue;
        if (slot.multi) {
          const n = slot.id === 'detail' ? Math.floor(Math.random() * 3) : Math.random() < 0.35 ? 1 : 0;
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
