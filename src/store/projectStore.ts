import { create } from 'zustand';
import type { GeneratorSettings, Layer, LayerRole, MapSettings, Project, TileMeta, Tileset } from '../types';
import { DEFAULT_MAP, PRESETS, defaultGenerator } from '../generator/presets';
import { randomSeed } from '../generator/rng';
import { generate } from '../generator';
import { createDemoTileset } from '../tilesets/demoTileset';
import { findEmptyTiles } from '../tilesets/slicing';
import { LAYER_COLORS, createDefaultLayers, createLayer, resizeData } from '../layers/defaults';
import { uid } from '../utils/id';
import { clamp } from '../utils/math';
import { History, cloneLayers, type DocSnapshot } from './history';
import { mapEvents } from './events';

export function createProject(
  name = 'Neues Projekt',
  opts: { map?: Partial<MapSettings>; generator?: GeneratorSettings } = {},
): Project {
  const map: MapSettings = { ...DEFAULT_MAP, ...opts.map };
  const demo = createDemoTileset(1);
  const layers = createDefaultLayers(map.width * map.height);
  const now = Date.now();
  return {
    formatVersion: 1,
    id: uid('prj'),
    name,
    createdAt: now,
    updatedAt: now,
    map,
    generator: opts.generator ? { ...opts.generator } : defaultGenerator(),
    tilesets: [demo],
    nextGid: 1 + demo.columns * demo.rows,
    layers,
    activeLayerId: layers[0].id,
    result: null,
  };
}

interface Stroke {
  layerId: string;
  before: Map<number, number>;
}

interface ProjectState {
  project: Project;
  /** bumps whenever persistent content changes (autosave trigger) */
  revision: number;
  savedRevision: number;
  canUndo: boolean;
  canRedo: boolean;
  generating: boolean;

  loadProject: (p: Project) => void;
  markSaved: (rev: number) => void;
  setName: (name: string) => void;

  setMapSize: (w: number, h: number) => void;
  setTileSize: (size: number) => void;
  setMapOptions: (patch: Partial<Pick<MapSettings, 'perspective' | 'shadows'>>) => void;
  updateGenerator: (patch: Partial<GeneratorSettings>) => void;
  applyPreset: (id: string) => void;
  runGenerate: (opts?: { newSeed?: boolean }) => Promise<void>;

  addTileset: (ts: Omit<Tileset, 'firstGid'>) => void;
  removeTileset: (id: string) => void;
  updateTileset: (id: string, patch: Partial<Pick<Tileset, 'name' | 'active' | 'perspectives'>>) => void;
  setTilesetTileSize: (id: string, size: number) => Promise<void>;
  setTileMeta: (gids: number[], patch: Partial<TileMeta>) => void;

  setActiveLayer: (id: string) => void;
  addLayer: () => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  renameLayer: (id: string, name: string) => void;
  moveLayer: (id: string, dir: 1 | -1) => void;
  toggleLayerVisible: (id: string) => void;
  toggleLayerLocked: (id: string) => void;
  setLayerRole: (id: string, role: LayerRole) => void;

  beginStroke: (layerId: string) => boolean;
  strokeSet: (cells: number[], gid: number) => void;
  endStroke: (label: string) => void;
  cancelStroke: () => void;

  undo: () => void;
  redo: () => void;
}

const history = new History();
let stroke: Stroke | null = null;

function snapshot(p: Project, withTilesets = false): DocSnapshot {
  return {
    map: { ...p.map },
    layers: cloneLayers(p.layers),
    activeLayerId: p.activeLayerId,
    result: p.result,
    ...(withTilesets ? { tilesets: p.tilesets, nextGid: p.nextGid } : {}),
  };
}

export const useProject = create<ProjectState>((set, get) => {
  const touch = (project: Project, extra: Partial<ProjectState> = {}) =>
    set({
      project: { ...project, updatedAt: Date.now() },
      revision: get().revision + 1,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      ...extra,
    });

  /** Run a document-level change with undo support. */
  const docChange = (label: string, fn: (p: Project) => Project, withTilesets = false) => {
    const before = snapshot(get().project, withTilesets);
    const next = fn(get().project);
    history.push({ kind: 'doc', label, before, after: snapshot(next, withTilesets) });
    touch(next);
    mapEvents.emit({ type: 'all' });
  };

  const restore = (s: DocSnapshot) => {
    const p = get().project;
    touch({
      ...p,
      map: { ...s.map },
      layers: cloneLayers(s.layers),
      activeLayerId: s.activeLayerId,
      result: s.result,
      ...(s.tilesets ? { tilesets: s.tilesets, nextGid: s.nextGid ?? p.nextGid } : {}),
    });
    mapEvents.emit({ type: 'all' });
  };

  const mapLayers = (fn: (l: Layer) => Layer) => {
    const p = get().project;
    touch({ ...p, layers: p.layers.map(fn) });
  };

  return {
    project: createProject(),
    revision: 0,
    savedRevision: 0,
    canUndo: false,
    canRedo: false,
    generating: false,

    loadProject: (project) => {
      history.clear();
      stroke = null;
      set({ project, revision: 0, savedRevision: 0, canUndo: false, canRedo: false });
      mapEvents.emit({ type: 'all' });
    },
    markSaved: (rev) => set({ savedRevision: rev }),
    setName: (name) => touch({ ...get().project, name }),

    setMapSize: (w, h) => {
      const width = clamp(Math.round(w), 16, 256);
      const height = clamp(Math.round(h), 16, 256);
      const p = get().project;
      if (width === p.map.width && height === p.map.height) return;
      docChange('Map-Größe', (p) => ({
        ...p,
        map: { ...p.map, width, height },
        layers: p.layers.map((l) => ({ ...l, data: resizeData(l.data, p.map.width, p.map.height, width, height) })),
        result: null,
      }));
    },
    setTileSize: (size) => {
      const p = get().project;
      touch({ ...p, map: { ...p.map, tileSize: clamp(Math.round(size), 4, 256) } });
      mapEvents.emit({ type: 'all' });
    },
    setMapOptions: (patch) => {
      const p = get().project;
      touch({ ...p, map: { ...p.map, ...patch } });
    },
    updateGenerator: (patch) => {
      const p = get().project;
      touch({ ...p, generator: { ...p.generator, ...patch } });
    },
    applyPreset: (id) => {
      const preset = PRESETS.find((x) => x.id === id);
      if (!preset) return;
      const p = get().project;
      get().updateGenerator(preset.apply(p.generator));
      if (preset.map) get().setMapSize(preset.map.width ?? p.map.width, preset.map.height ?? p.map.height);
    },
    runGenerate: async (opts = {}) => {
      if (get().generating) return;
      if (opts.newSeed) get().updateGenerator({ seed: randomSeed() });
      set({ generating: true });
      // let the UI paint the busy state first
      await new Promise((r) => setTimeout(r, 16));
      try {
        const p = get().project;
        const out = generate({ settings: p.generator, map: p.map, tilesets: p.tilesets, layers: p.layers });
        docChange('Generieren', (p) => ({
          ...p,
          layers: p.layers.map((l) => (out.layerData[l.id] ? { ...l, data: out.layerData[l.id] } : l)),
          result: out.result,
        }));
      } finally {
        set({ generating: false });
      }
    },

    addTileset: (ts) => {
      const p = get().project;
      const full: Tileset = { ...ts, firstGid: p.nextGid };
      touch({ ...p, tilesets: [...p.tilesets, full], nextGid: p.nextGid + ts.columns * ts.rows });
    },
    removeTileset: (id) => {
      const ts = get().project.tilesets.find((t) => t.id === id);
      if (!ts) return;
      const lo = ts.firstGid;
      const hi = ts.firstGid + ts.columns * ts.rows;
      docChange('Tileset entfernen', (p) => ({
        ...p,
        tilesets: p.tilesets.filter((t) => t.id !== id),
        layers: p.layers.map((l) => {
          const data = l.data.slice();
          for (let i = 0; i < data.length; i++) if (data[i] >= lo && data[i] < hi) data[i] = 0;
          return { ...l, data };
        }),
      }), true);
    },
    updateTileset: (id, patch) => {
      const p = get().project;
      touch({ ...p, tilesets: p.tilesets.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
    },
    setTilesetTileSize: async (id, size) => {
      const ts = get().project.tilesets.find((t) => t.id === id);
      if (!ts || size < 4 || size === ts.tileSize) return;
      const { columns, rows, empty } = await findEmptyTiles(ts.dataUrl, size);
      const lo = ts.firstGid;
      const hi = ts.firstGid + ts.columns * ts.rows;
      docChange('Tilegröße ändern', (p) => ({
        ...p,
        nextGid: p.nextGid + columns * rows,
        tilesets: p.tilesets.map((t) =>
          t.id === id ? { ...t, tileSize: size, columns, rows, emptyTiles: empty, tiles: {}, firstGid: p.nextGid } : t,
        ),
        layers: p.layers.map((l) => {
          const data = l.data.slice();
          for (let i = 0; i < data.length; i++) if (data[i] >= lo && data[i] < hi) data[i] = 0;
          return { ...l, data };
        }),
      }), true);
    },
    setTileMeta: (gids, patch) => {
      const p = get().project;
      const tilesets = p.tilesets.map((ts) => {
        const n = ts.columns * ts.rows;
        const mine = gids.filter((g) => g >= ts.firstGid && g < ts.firstGid + n);
        if (!mine.length) return ts;
        const tiles = { ...ts.tiles };
        for (const g of mine) {
          const idx = g - ts.firstGid;
          const cur = tiles[idx] ?? { tags: [], weight: 50 };
          tiles[idx] = { ...cur, ...patch };
          if (patch.category === undefined && 'category' in patch) delete tiles[idx].category;
        }
        return { ...ts, tiles };
      });
      touch({ ...p, tilesets });
    },

    setActiveLayer: (id) => {
      const p = get().project;
      if (p.activeLayerId !== id) set({ project: { ...p, activeLayerId: id } });
    },
    addLayer: () =>
      docChange('Layer hinzufügen', (p) => {
        const idx = p.layers.findIndex((l) => l.id === p.activeLayerId);
        const layer = createLayer(
          `Layer ${p.layers.length + 1}`,
          'custom',
          LAYER_COLORS[p.layers.length % LAYER_COLORS.length],
          p.map.width * p.map.height,
        );
        const layers = [...p.layers];
        layers.splice(idx + 1, 0, layer);
        return { ...p, layers, activeLayerId: layer.id };
      }),
    removeLayer: (id) => {
      if (get().project.layers.length <= 1) return;
      docChange('Layer löschen', (p) => {
        const idx = p.layers.findIndex((l) => l.id === id);
        const layers = p.layers.filter((l) => l.id !== id);
        const active = p.activeLayerId === id ? layers[Math.max(0, idx - 1)].id : p.activeLayerId;
        return { ...p, layers, activeLayerId: active };
      });
    },
    duplicateLayer: (id) =>
      docChange('Layer duplizieren', (p) => {
        const idx = p.layers.findIndex((l) => l.id === id);
        if (idx < 0) return p;
        const src = p.layers[idx];
        // copies are custom layers so the generator never overwrites them
        const copy: Layer = { ...src, id: uid('layer'), name: `${src.name} Kopie`, role: 'custom', data: src.data.slice() };
        const layers = [...p.layers];
        layers.splice(idx + 1, 0, copy);
        return { ...p, layers, activeLayerId: copy.id };
      }),
    renameLayer: (id, name) => mapLayers((l) => (l.id === id ? { ...l, name: name.trim() || l.name } : l)),
    moveLayer: (id, dir) =>
      docChange('Layer verschieben', (p) => {
        const idx = p.layers.findIndex((l) => l.id === id);
        const to = idx + dir;
        if (idx < 0 || to < 0 || to >= p.layers.length) return p;
        const layers = [...p.layers];
        [layers[idx], layers[to]] = [layers[to], layers[idx]];
        return { ...p, layers };
      }),
    toggleLayerVisible: (id) => {
      mapLayers((l) => (l.id === id ? { ...l, visible: !l.visible } : l));
      mapEvents.emit({ type: 'all' });
    },
    toggleLayerLocked: (id) => mapLayers((l) => (l.id === id ? { ...l, locked: !l.locked } : l)),
    setLayerRole: (id, role) => mapLayers((l) => (l.id === id ? { ...l, role } : l)),

    beginStroke: (layerId) => {
      const layer = get().project.layers.find((l) => l.id === layerId);
      if (!layer || layer.locked) return false;
      stroke = { layerId, before: new Map() };
      return true;
    },
    strokeSet: (cells, gid) => {
      if (!stroke) return;
      const layer = get().project.layers.find((l) => l.id === stroke!.layerId);
      if (!layer) return;
      const changed: number[] = [];
      for (const i of cells) {
        if (i < 0 || i >= layer.data.length || layer.data[i] === gid) continue;
        if (!stroke.before.has(i)) stroke.before.set(i, layer.data[i]);
        layer.data[i] = gid;
        changed.push(i);
      }
      if (changed.length) mapEvents.emit({ type: 'cells', cells: changed });
    },
    endStroke: (label) => {
      const s = stroke;
      stroke = null;
      if (!s || !s.before.size) return;
      const layer = get().project.layers.find((l) => l.id === s.layerId);
      if (!layer) return;
      const idx = Uint32Array.from(s.before.keys());
      const before = Uint32Array.from(s.before.values());
      const after = idx.map((i) => layer.data[i]);
      history.push({ kind: 'cells', label, layerId: s.layerId, idx, before, after });
      touch(get().project);
    },
    cancelStroke: () => {
      const s = stroke;
      stroke = null;
      if (!s) return;
      const layer = get().project.layers.find((l) => l.id === s.layerId);
      if (!layer) return;
      const cells: number[] = [];
      for (const [i, v] of s.before) {
        layer.data[i] = v;
        cells.push(i);
      }
      if (cells.length) mapEvents.emit({ type: 'cells', cells });
    },

    undo: () => {
      const e = history.undoStack.pop();
      if (!e) return;
      history.redoStack.push(e);
      if (e.kind === 'doc') restore(e.before);
      else {
        const layer = get().project.layers.find((l) => l.id === e.layerId);
        if (layer) {
          e.idx.forEach((i, k) => (layer.data[i] = e.before[k]));
          mapEvents.emit({ type: 'cells', cells: Array.from(e.idx) });
        }
        touch(get().project);
      }
    },
    redo: () => {
      const e = history.redoStack.pop();
      if (!e) return;
      history.undoStack.push(e);
      if (e.kind === 'doc') restore(e.after);
      else {
        const layer = get().project.layers.find((l) => l.id === e.layerId);
        if (layer) {
          e.idx.forEach((i, k) => (layer.data[i] = e.after[k]));
          mapEvents.emit({ type: 'cells', cells: Array.from(e.idx) });
        }
        touch(get().project);
      }
    },
  };
});

export function getActiveLayer(p: Project): Layer | undefined {
  return p.layers.find((l) => l.id === p.activeLayerId);
}
