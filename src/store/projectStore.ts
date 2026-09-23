import { create } from 'zustand';
import type { GeneratorSettings, Layer, LayerRole, MapObject, MapSettings, Project, ProjectMode, TerrainSet, TileMeta, Tileset } from '../types';
import { DEFAULT_MAP, PRESETS, defaultGenerator, defaultTerrainSets } from '../generator/presets';
import { randomSeed } from '../generator/rng';
import { emptyResult, generate } from '../generator';
import { createDemoTileset } from '../tilesets/demoTileset';
import { createDemoAutotileSets } from '../tilesets/demoAutotiles';
import { applyTileMeta, findEmptyTiles } from '../tilesets/slicing';
import { libraryToProjectTilesets, withTerrainsFor } from '../tilesets/library';
import type { LibraryTileset } from '../persistence/db';
import { LAYER_COLORS, createDefaultLayers, createLayer, resizeData } from '../layers/defaults';
import { uid } from '../utils/id';
import { clamp } from '../utils/math';
import { History, cloneLayers, type DocSnapshot, type HistoryEntry } from './history';
import { mapEvents } from './events';
import { useEditor } from './editorStore';

export function createProject(
  name = 'Neues Projekt',
  opts: {
    map?: Partial<MapSettings>;
    generator?: GeneratorSettings;
    terrains?: TerrainSet[];
    mode?: ProjectMode;
    /** tilesets from the library (added after the demo sets) */
    library?: LibraryTileset[];
    /** demo tilesets active (they always stay in the project as fallback) */
    demoActive?: boolean;
  } = {},
): Project {
  const map: MapSettings = { ...DEFAULT_MAP, ...opts.map };
  const demoActive = opts.demoActive ?? true;
  const demo = { ...createDemoTileset(1), active: demoActive };
  const auto = createDemoAutotileSets(1 + demo.columns * demo.rows).map((ts) => ({ ...ts, active: demoActive }));
  const last = auto[auto.length - 1];
  const own = libraryToProjectTilesets(opts.library ?? [], last.firstGid + last.columns * last.rows);
  const layers = createDefaultLayers(map.width * map.height);
  const now = Date.now();
  const mode = opts.mode ?? 'generate';
  const generator = opts.generator ? { ...opts.generator } : defaultGenerator();
  return {
    formatVersion: 1,
    mode,
    id: uid('prj'),
    name,
    createdAt: now,
    updatedAt: now,
    map,
    generator,
    tilesets: [demo, ...auto, ...own.tilesets],
    nextGid: own.nextGid,
    layers,
    activeLayerId: layers[0].id,
    // manual mode starts with an empty structure grid so auto-walls work from the first stroke
    result: mode === 'manual' ? emptyResult(map.width, map.height, generator.seed, map.perspective) : null,
    terrains: withTerrainsFor(opts.terrains ?? defaultTerrainSets(), own.tilesets),
    objects: [],
  };
}

function resizeResult(r: NonNullable<Project['result']>, width: number, height: number): NonNullable<Project['result']> {
  const rs = <T extends Uint8Array>(a: T) => resizeData(a, r.width, r.height, width, height);
  return { ...r, width, height, cells: rs(r.cells), wallMask: rs(r.wallMask), floorMask: rs(r.floorMask), terrain: rs(r.terrain), heights: rs(r.heights) };
}

interface Stroke {
  layerId: string;
  /** layerId → (cell → value before the stroke) */
  before: Map<string, Map<number, number>>;
  structBefore: Map<number, number>;
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
  setMode: (mode: ProjectMode) => void;
  updateGenerator: (patch: Partial<GeneratorSettings>) => void;
  applyPreset: (id: string) => void;
  runGenerate: (opts?: { newSeed?: boolean }) => Promise<void>;

  addTileset: (ts: Omit<Tileset, 'firstGid'>) => void;
  removeTileset: (id: string) => void;
  updateTileset: (id: string, patch: Partial<Pick<Tileset, 'name' | 'active' | 'perspectives'>>) => void;
  setTilesetTileSize: (id: string, size: number) => Promise<void>;
  setTileMeta: (gids: number[], patch: Partial<TileMeta>) => void;

  addObject: (o: Omit<MapObject, 'id'>) => void;
  removeObject: (id: string) => void;
  moveObject: (id: string, x: number, y: number) => void;
  setTerrains: (t: TerrainSet[]) => void;
  setLayerYSort: (id: string, v: boolean) => void;

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
  /** write into any layer as part of the running stroke (auto walls) */
  strokeSetLayer: (layerId: string, cells: number[], gids: number[] | number) => void;
  /** change the structural grid as part of the running stroke */
  strokeStruct: (cell: number, value: number) => void;
  strokeCells: () => number[];
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
    objects: p.objects,
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
      objects: s.objects ?? p.objects,
      ...(s.tilesets ? { tilesets: s.tilesets, nextGid: s.nextGid ?? p.nextGid } : {}),
    });
    mapEvents.emit({ type: 'all' });
  };

  const applyCells = (e: Extract<HistoryEntry, { kind: 'cells' }>, which: 'before' | 'after') => {
    const p = get().project;
    const cells: number[] = [];
    for (const c of e.changes) {
      const layer = p.layers.find((l) => l.id === c.layerId);
      if (!layer) continue;
      c.idx.forEach((i, k) => (layer.data[i] = c[which][k]));
      cells.push(...c.idx);
    }
    if (e.struct && p.result) e.struct.idx.forEach((i, k) => (p.result!.cells[i] = e.struct![which][k]));
    mapEvents.emit({ type: 'cells', cells });
    touch(p);
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
        // manual mode: keep the hand-built structure (auto-walls need it); generated maps are regenerated anyway
        result: p.mode === 'manual' && p.result ? resizeResult(p.result, width, height) : null,
      }));
    },
    setTileSize: (size) => {
      const p = get().project;
      touch({ ...p, map: { ...p.map, tileSize: clamp(Math.round(size), 4, 256) } });
      mapEvents.emit({ type: 'all' });
    },
    setMode: (mode) => {
      const p = get().project;
      if (p.mode === mode) return;
      // manual building needs a structure grid; a generated one is kept as starting point
      const result = mode === 'manual' && !p.result ? emptyResult(p.map.width, p.map.height, p.generator.seed, p.map.perspective) : p.result;
      touch({ ...p, mode, result });
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
        const out = generate({ settings: p.generator, map: p.map, tilesets: p.tilesets, layers: p.layers, terrains: p.terrains });
        docChange('Generieren', (p) => ({
          ...p,
          layers: p.layers.map((l) => (out.layerData[l.id] ? { ...l, data: out.layerData[l.id] } : l)),
          result: out.result,
          objects: out.objects,
        }));
        // missing tiles for the perspective: say so instead of silently drawing nothing
        if (out.tileNotice) useEditor.getState().toast(out.tileNotice, 'error');
      } catch (e) {
        console.error(e);
        useEditor.getState().toast(`Generieren fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`, 'error');
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
      touch({ ...p, tilesets: applyTileMeta(p.tilesets, gids, patch) });
    },

    addObject: (o) =>
      docChange('Objekt setzen', (p) => ({ ...p, objects: [...p.objects, { ...o, id: uid('obj') }] })),
    removeObject: (id) => docChange('Objekt löschen', (p) => ({ ...p, objects: p.objects.filter((o) => o.id !== id) })),
    moveObject: (id, x, y) =>
      docChange('Objekt verschieben', (p) => ({ ...p, objects: p.objects.map((o) => (o.id === id ? { ...o, x, y } : o)) })),
    setTerrains: (terrains) => touch({ ...get().project, terrains }),
    setLayerYSort: (id, v) => {
      mapLayers((l) => (l.id === id ? { ...l, ySort: v } : l));
      mapEvents.emit({ type: 'all' });
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
      stroke = { layerId, before: new Map(), structBefore: new Map() };
      return true;
    },
    strokeSet: (cells, gid) => {
      if (stroke) get().strokeSetLayer(stroke.layerId, cells, gid);
    },
    strokeSetLayer: (layerId, cells, gids) => {
      if (!stroke) return;
      const layer = get().project.layers.find((l) => l.id === layerId);
      if (!layer) return;
      let before = stroke.before.get(layerId);
      if (!before) stroke.before.set(layerId, (before = new Map()));
      const changed: number[] = [];
      cells.forEach((i, k) => {
        const gid = typeof gids === 'number' ? gids : gids[k];
        if (i < 0 || i >= layer.data.length || layer.data[i] === gid) return;
        if (!before!.has(i)) before!.set(i, layer.data[i]);
        layer.data[i] = gid;
        changed.push(i);
      });
      if (changed.length) mapEvents.emit({ type: 'cells', cells: changed });
    },
    strokeStruct: (cell, value) => {
      const r = get().project.result;
      if (!stroke || !r || cell < 0 || cell >= r.cells.length || r.cells[cell] === value) return;
      if (!stroke.structBefore.has(cell)) stroke.structBefore.set(cell, r.cells[cell]);
      r.cells[cell] = value;
    },
    strokeCells: () => (stroke ? [...(stroke.before.get(stroke.layerId)?.keys() ?? [])] : []),
    endStroke: (label) => {
      const s = stroke;
      stroke = null;
      if (!s) return;
      const p = get().project;
      const changes = [];
      for (const [layerId, before] of s.before) {
        const layer = p.layers.find((l) => l.id === layerId);
        if (!layer || !before.size) continue;
        const idx = Uint32Array.from(before.keys());
        changes.push({ layerId, idx, before: Uint32Array.from(before.values()), after: idx.map((i) => layer.data[i]) });
      }
      if (!changes.length && !s.structBefore.size) return;
      let struct;
      if (s.structBefore.size && p.result) {
        const idx = Uint32Array.from(s.structBefore.keys());
        struct = { idx, before: Uint8Array.from(s.structBefore.values()), after: Uint8Array.from(idx, (i) => p.result!.cells[i]) };
      }
      history.push({ kind: 'cells', label, changes, struct });
      touch(p);
    },
    cancelStroke: () => {
      const s = stroke;
      stroke = null;
      if (!s) return;
      const p = get().project;
      const cells: number[] = [];
      for (const [layerId, before] of s.before) {
        const layer = p.layers.find((l) => l.id === layerId);
        if (!layer) continue;
        for (const [i, v] of before) {
          layer.data[i] = v;
          cells.push(i);
        }
      }
      if (p.result) for (const [i, v] of s.structBefore) p.result.cells[i] = v;
      if (cells.length) mapEvents.emit({ type: 'cells', cells });
    },

    undo: () => {
      const e = history.undoStack.pop();
      if (!e) return;
      history.redoStack.push(e);
      if (e.kind === 'doc') restore(e.before);
      else applyCells(e, 'before');
    },
    redo: () => {
      const e = history.redoStack.pop();
      if (!e) return;
      history.undoStack.push(e);
      if (e.kind === 'doc') restore(e.after);
      else applyCells(e, 'after');
    },
  };
});

export function getActiveLayer(p: Project): Layer | undefined {
  return p.layers.find((l) => l.id === p.activeLayerId);
}
