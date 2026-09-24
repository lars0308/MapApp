import spec from './spec.json';
import { useProject, createProject } from '../store/projectStore';
import { useEditor } from '../store/editorStore';
import { useApp, type Page } from '../store/appStore';
import { applyProfile, deriveConfig, genreInfo, type GameProfile, type ViewKind, type Genre, type Effort } from '../profiles';
import { DEFAULT_MAP, defaultGenerator } from '../generator/presets';
import { prepareBuildKit } from '../components/wizard/SetupWizard';
import { saveNow } from '../persistence/autosave';
import { listProjects, loadProject } from '../persistence/db';
import { applyAutoWalls } from '../editor/autoWalls';
import { computeBlocked, metaTable } from '../editor/collision';
import { copyArea, pasteClip, transformClip } from '../editor/clipboard';
import { floodCells } from '../editor/tools';
import { tilesetSupports } from '../tilesets/tilePools';
import { FLIP_H, rotateCW, withTransform } from '../tilesets/gid';
import { OBJECT_DEFS, OBJECT_TYPES, customObjectDefs, objectDef } from '../objects/defs';
import { buildGodotData } from '../export/godotJson';
import { buildGodotPackage } from '../export/actions';
import { MapRenderer } from '../renderer/MapRenderer';
import { loadImage } from '../utils/image';
import { useSprites, DEMO_PARTS, SLOTS, composeView, partById, toPng } from '../sprites/store';
import { RAMP_PRESETS, CHANNELS, type Channel, type Ramp } from '../sprites/palette';
import { animsFor, framesOf, frameSize } from '../sprites/animation';
import { buildSpriteGodot } from '../sprites/exportSprite';
import { setPlayerSprite } from '../playtest/playerSprite';
import { figureToObject } from '../objects/fromFigure';
import { VIEWS, VIEWS4, type SpriteKind, type View } from '../sprites/types';
import type { GeneratorSettings, Layer, ObjectType, Perspective, Project } from '../types';

// Commands an AI (or any program) can run against the app: the same actions as the
// buttons, as JSON in / JSON out. Used by the MCP bridge (src/api/bridge.ts) and available
// in the browser console as window.mapforge.run('status').

export type Args = Record<string, unknown>;
/** a picture or a file for the caller (base64) */
export interface Binary {
  kind: 'image' | 'file';
  mime: string;
  name: string;
  base64: string;
}
export type Result = { ok: true; data?: unknown; text?: string; binary?: Binary } | { ok: false; error: string };

class UserError extends Error {}
const fail = (msg: string): never => {
  throw new UserError(msg);
};

const P = () => useProject.getState().project;
const int = (v: unknown, name: string, def?: number): number => {
  if (v === undefined || v === null) {
    if (def === undefined) fail(`"${name}" fehlt`);
    return def!;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) fail(`"${name}" muss eine Zahl sein`);
  return Math.round(n);
};
const str = (v: unknown, name: string, def?: string): string => {
  if (v === undefined || v === null || v === '') {
    if (def === undefined) fail(`"${name}" fehlt`);
    return def!;
  }
  return String(v);
};

function findLayer(p: Project, ref: unknown): Layer {
  if (ref === undefined || ref === null || ref === '') return p.layers.find((l) => l.id === p.activeLayerId) ?? p.layers[0];
  const r = String(ref).toLowerCase();
  const l = p.layers.find((x) => x.id === ref) ?? p.layers.find((x) => x.name.toLowerCase() === r) ?? p.layers.find((x) => x.role.toLowerCase() === r);
  return l ?? fail(`Layer "${ref}" gibt es nicht – list_layers zeigt alle`);
}

const turnOf = (rotate: unknown, mirror: unknown): number => {
  let t = 0;
  if (mirror) t = FLIP_H;
  for (let i = 0; i < ((Number(rotate) || 0) / 90) % 4; i++) t = rotateCW(t);
  return t;
};

const blobToBase64 = async (b: Blob): Promise<string> => {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const dataUrlBase64 = (u: string) => u.slice(u.indexOf(',') + 1);

function summary(p: Project) {
  const r = p.result;
  return {
    id: p.id,
    name: p.name,
    width: p.map.width,
    height: p.map.height,
    tileSize: p.map.tileSize,
    perspective: p.map.perspective,
    mode: p.mode,
    seed: p.generator.seed,
    activeLayer: p.layers.find((l) => l.id === p.activeLayerId)?.name,
    layers: p.layers.map((l) => ({ name: l.name, role: l.role, tiles: countTiles(l) })),
    objects: p.objects.length,
    rooms: r?.rooms.length ?? 0,
    spawn: r?.spawnPoints.slice(0, 4) ?? [],
  };
}
const countTiles = (l: Layer) => {
  let n = 0;
  for (let i = 0; i < l.data.length; i++) if (l.data[i]) n++;
  return n;
};

const deepMerge = (a: unknown, b: unknown): unknown => {
  if (!b || typeof b !== 'object' || Array.isArray(b) || !a || typeof a !== 'object' || Array.isArray(a)) return b;
  const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
  for (const [k, v] of Object.entries(b as Record<string, unknown>)) out[k] = deepMerge(out[k], v);
  return out;
};

const VIEW_OF: Record<string, ViewKind> = { top_down: 'top_down', isometric: 'isometric', side_scroller: 'side_scroller', hexagonal: 'hexagonal' };
const DEFAULT_GENRE: Record<ViewKind, Genre> = { top_down: 'action_roguelite', isometric: 'action_roguelite', side_scroller: 'platformer', hexagonal: 'strategy' };

/** render a map area like the editor (tiles, objects, backdrop) → PNG data URL */
async function renderArea(p: Project, x: number, y: number, w: number, h: number, px: number, grid: boolean, collision: boolean): Promise<string> {
  await Promise.all(p.tilesets.map((t) => loadImage(t.dataUrl).catch(() => null)));
  const canvas = document.createElement('canvas');
  const r = new MapRenderer(canvas);
  r.hex = p.map.perspective === 'hex';
  r.backdrop = p.map.perspective === 'side_view' ? (p.generator.side?.style === 'cave' ? 'cave' : 'sky') : 'plain';
  r.setDocument(p.map.width, p.map.height, p.layers, p.tilesets);
  r.objects = p.objects;
  r.overlay.showGrid = grid;
  r.overlay.activeTool = 'hand';
  if (collision) r.overlay.collision = computeBlocked(p);
  r.resize(w * px, h * px);
  // tileset images decode asynchronously – draw once they are there
  for (let i = 0; i < 40; i++) {
    r.cam = { x, y, zoom: px };
    r.render();
    if ((r as unknown as { table: { allReady: boolean } }).table.allReady) break;
    await new Promise((res) => setTimeout(res, 25));
  }
  r.cam = { x, y, zoom: px };
  r.render();
  r.destroy();
  return canvas.toDataURL('image/png');
}

/** figure frames side by side → PNG data URL */
function strip(frames: Uint8ClampedArray[], n: number, scale: number): string {
  const c = document.createElement('canvas');
  c.width = frames.length * n * scale;
  c.height = n * scale;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const t = document.createElement('canvas');
  t.width = n;
  t.height = n;
  frames.forEach((f, i) => {
    t.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(f), n, n), 0, 0);
    g.drawImage(t, i * n * scale, 0, n * scale, n * scale);
  });
  return c.toDataURL('image/png');
}

const KINDS: SpriteKind[] = ['character', 'creature', 'object'];
const kindOf = (v: unknown): SpriteKind => {
  const k = str(v, 'kind') as SpriteKind;
  if (!KINDS.includes(k)) fail(`kind muss character, creature oder object sein`);
  return k;
};
async function figureReady(kind: SpriteKind) {
  await useSprites.getState().load(kind);
  return useSprites.getState()[kind].doc;
}

type Handler = (a: Args) => Promise<Omit<Extract<Result, { ok: true }>, 'ok'>> | Omit<Extract<Result, { ok: true }>, 'ok'>;

const H: Record<string, Handler> = {
  help: () => ({ text: spec.about, data: spec.commands.map((c) => ({ name: c.name, description: c.description })) }),

  status: () => ({ data: { page: useApp.getState().page, canUndo: useProject.getState().canUndo, canRedo: useProject.getState().canRedo, project: summary(P()) } }),

  new_map: async (a) => {
    const view = VIEW_OF[str(a.view, 'view')] ?? fail('view: top_down, isometric, side_scroller oder hexagonal');
    const genre = (a.genre as Genre) ?? DEFAULT_GENRE[view];
    if (!genreInfo(genre).views.includes(view)) fail(`Genre ${genre} passt nicht zu ${view}`);
    const profile: GameProfile = { view, genre, effort: (a.effort as Effort) ?? 'medium' };
    const { gen, map } = applyProfile(profile, defaultGenerator(a.seed ? String(a.seed) : undefined), DEFAULT_MAP);
    const allowed = deriveConfig(profile).perspectives;
    const perspective = (a.perspective as Perspective) ?? allowed[0];
    if (!allowed.includes(perspective)) fail(`Perspektive ${perspective} passt nicht zu ${view} (${allowed.join(', ')})`);
    const mode = a.mode === 'manual' ? 'manual' : 'generate';
    await saveNow();
    useProject.getState().loadProject(
      createProject(str(a.name, 'name', 'KI-Karte'), {
        map: { ...map, perspective, width: a.width ? int(a.width, 'width') : map.width, height: a.height ? int(a.height, 'height') : map.height },
        generator: gen,
        mode,
        profile,
      }),
    );
    if (mode === 'generate') await useProject.getState().runGenerate();
    else prepareBuildKit();
    await saveNow();
    useApp.getState().goTo('map');
    return { data: summary(P()) };
  },

  generate: async (a) => {
    const s = useProject.getState();
    if (a.seed) s.updateGenerator({ seed: String(a.seed) });
    await s.runGenerate({ newSeed: !!a.new_seed && !a.seed });
    return { data: summary(P()) };
  },

  get_generator: () => ({ data: P().generator }),

  set_generator: async (a) => {
    if (!a.patch || typeof a.patch !== 'object') fail('patch fehlt');
    const next = deepMerge(P().generator, a.patch) as GeneratorSettings;
    useProject.getState().updateGenerator(next);
    if (a.regenerate) await useProject.getState().runGenerate();
    return { data: a.regenerate ? summary(P()) : P().generator };
  },

  list_tiles: (a) => {
    const p = P();
    const metas = metaTable(p);
    const has = (v: string | undefined, q: unknown) => q === undefined || (!!v && v.toLowerCase().includes(String(q).toLowerCase()));
    const out: unknown[] = [];
    for (const ts of p.tilesets) {
      if (!ts.active || !tilesetSupports(ts, p.map.perspective)) continue;
      const empty = new Set(ts.emptyTiles);
      for (let i = 0; i < ts.columns * ts.rows; i++) {
        if (empty.has(i)) continue;
        const gid = ts.firstGid + i;
        const m = metas[gid];
        if (!has(m?.role, a.role) || !has(m?.category, a.category) || (a.tag !== undefined && !m?.tags.some((t) => has(t, a.tag)))) continue;
        out.push({ gid, tileset: ts.name, role: m?.role, category: m?.category, tags: m?.tags ?? [] });
      }
    }
    const limit = int(a.limit, 'limit', 300);
    return { data: { count: out.length, tiles: out.slice(0, limit) } };
  },

  list_layers: () => ({
    data: P().layers.map((l) => ({ id: l.id, name: l.name, role: l.role, visible: l.visible, locked: l.locked, opacity: l.opacity ?? 1, ySort: l.ySort, tiles: countTiles(l), active: l.id === P().activeLayerId })),
  }),

  get_map: (a) => {
    const p = P();
    const W = p.map.width;
    const x = Math.max(0, int(a.x, 'x', 0));
    const y = Math.max(0, int(a.y, 'y', 0));
    const w = Math.min(64, int(a.w, 'w', Math.min(64, W)), W - x);
    const h = Math.min(64, int(a.h, 'h', Math.min(64, p.map.height)), p.map.height - y);
    if (w <= 0 || h <= 0) fail('Bereich liegt außerhalb der Karte');
    const wanted = Array.isArray(a.layers) && a.layers.length ? (a.layers as unknown[]).map((r) => findLayer(p, r)) : p.layers;
    const layers: Record<string, number[][]> = {};
    for (const l of wanted) {
      const rows: number[][] = [];
      let any = false;
      for (let yy = y; yy < y + h; yy++) {
        const row: number[] = [];
        for (let xx = x; xx < x + w; xx++) {
          const v = l.data[yy * W + xx];
          if (v) any = true;
          row.push(v);
        }
        rows.push(row);
      }
      if (any || wanted !== p.layers) layers[l.name] = rows;
    }
    const blocked = computeBlocked(p);
    const collision: string[] = [];
    for (let yy = y; yy < y + h; yy++) {
      let s = '';
      for (let xx = x; xx < x + w; xx++) s += blocked[yy * W + xx] ? '#' : '.';
      collision.push(s);
    }
    return { data: { x, y, w, h, layers, collision } };
  },

  paint: (a) => {
    const p = P();
    const W = p.map.width;
    const H = p.map.height;
    const layer = findLayer(p, a.layer);
    if (layer.locked) fail(`Layer "${layer.name}" ist gesperrt`);
    const gid = int(a.gid, 'gid');
    const cells: number[] = [];
    if (Array.isArray(a.cells))
      for (const c of a.cells as unknown[]) {
        const [cx, cy] = c as [number, number];
        if (cx >= 0 && cy >= 0 && cx < W && cy < H) cells.push(cy * W + cx);
      }
    if (a.rect && typeof a.rect === 'object') {
      const r = a.rect as Args;
      const rx = int(r.x, 'rect.x');
      const ry = int(r.y, 'rect.y');
      for (let yy = Math.max(0, ry); yy < Math.min(H, ry + int(r.h, 'rect.h')); yy++) for (let xx = Math.max(0, rx); xx < Math.min(W, rx + int(r.w, 'rect.w')); xx++) cells.push(yy * W + xx);
    }
    if (!cells.length) fail('Keine Zellen: cells oder rect angeben (innerhalb der Karte)');
    const s = useProject.getState();
    if (!s.beginStroke(layer.id)) fail('Malen nicht möglich');
    s.strokeSet(cells, withTransform(gid, turnOf(a.rotate, a.mirror)));
    const changed = s.strokeCells().length;
    if (a.auto_walls !== false && useEditor.getState().autoWalls) applyAutoWalls(s.strokeCells(), layer.id);
    s.endStroke(gid ? 'KI: Malen' : 'KI: Radieren');
    return { data: { layer: layer.name, changed } };
  },

  fill: (a) => {
    const p = P();
    const layer = findLayer(p, a.layer);
    if (layer.locked) fail(`Layer "${layer.name}" ist gesperrt`);
    const x = int(a.x, 'x');
    const y = int(a.y, 'y');
    if (x < 0 || y < 0 || x >= p.map.width || y >= p.map.height) fail('Punkt liegt außerhalb der Karte');
    const s = useProject.getState();
    s.beginStroke(layer.id);
    s.strokeSet(floodCells(layer.data, p.map.width, p.map.height, x, y), int(a.gid, 'gid'));
    const changed = s.strokeCells().length;
    if (useEditor.getState().autoWalls) applyAutoWalls(s.strokeCells(), layer.id);
    s.endStroke('KI: Füllen');
    return { data: { layer: layer.name, changed } };
  },

  clear_area: (a) => ({ data: { cleared: useProject.getState().clearArea({ x: int(a.x, 'x'), y: int(a.y, 'y'), w: int(a.w, 'w'), h: int(a.h, 'h') }) } }),

  copy_paste: (a) => {
    let clip = copyArea({ x: int(a.x, 'x'), y: int(a.y, 'y'), w: int(a.w, 'w'), h: int(a.h, 'h') }) ?? fail('Der Bereich ist leer');
    if (a.mirror) clip = transformClip(clip, 'mirror');
    for (let i = 0; i < ((Number(a.rotate) || 0) / 90) % 4; i++) clip = transformClip(clip, 'rotate');
    return { data: { changed: pasteClip(clip, int(a.to_x, 'to_x'), int(a.to_y, 'to_y')), w: clip.w, h: clip.h } };
  },

  list_objects: () => ({
    data: { objects: P().objects, types: [...OBJECT_TYPES.map((t) => ({ type: t, label: OBJECT_DEFS[t].label, w: OBJECT_DEFS[t].w, h: OBJECT_DEFS[t].h })), ...customObjectDefs().map(({ def }) => ({ type: def.type, label: def.label, w: def.w, h: def.h, own: true }))] },
  }),

  place_object: (a) => {
    const type = str(a.type, 'type') as ObjectType;
    const d = objectDef(type) ?? fail(`Objekt-Typ "${type}" gibt es nicht – list_objects zeigt alle`);
    const x = int(a.x, 'x');
    const y = int(a.y, 'y');
    const p = P();
    if (x < 0 || y < 0 || x + d.w > p.map.width || y >= p.map.height) fail('Objekt läge außerhalb der Karte');
    useProject.getState().addObject({ type, x, y });
    return { data: P().objects[P().objects.length - 1] };
  },

  remove_object: (a) => {
    const id = str(a.id, 'id');
    if (!P().objects.some((o) => o.id === id)) fail(`Objekt ${id} gibt es nicht`);
    useProject.getState().removeObject(id);
    return { data: { removed: id } };
  },

  set_layer: (a) => {
    const s = useProject.getState();
    const l = findLayer(s.project, a.layer);
    if (a.visible !== undefined && !!a.visible !== l.visible) s.toggleLayerVisible(l.id);
    if (a.locked !== undefined && !!a.locked !== l.locked) s.toggleLayerLocked(l.id);
    if (a.opacity !== undefined) s.setLayerOpacity(l.id, Number(a.opacity));
    if (a.name) s.renameLayer(l.id, String(a.name));
    if (a.active) s.setActiveLayer(l.id);
    return { data: findLayer(P(), l.id) && { name: findLayer(P(), l.id).name } };
  },

  undo: (a) => {
    for (let i = 0; i < int(a.steps, 'steps', 1); i++) if (useProject.getState().canUndo) useProject.getState().undo();
    return { data: { canUndo: useProject.getState().canUndo } };
  },
  redo: (a) => {
    for (let i = 0; i < int(a.steps, 'steps', 1); i++) if (useProject.getState().canRedo) useProject.getState().redo();
    return { data: { canRedo: useProject.getState().canRedo } };
  },

  render: async (a) => {
    const p = P();
    const hex = p.map.perspective === 'hex';
    const ww = hex ? p.map.width + 0.5 : p.map.width;
    const wh = hex ? (p.map.height - 1) * 0.75 + 1 : p.map.height;
    const x = int(a.x, 'x', 0);
    const y = int(a.y, 'y', 0);
    const w = Math.max(1, Math.min(int(a.w, 'w', Math.ceil(ww)), 512));
    const h = Math.max(1, Math.min(int(a.h, 'h', Math.ceil(wh)), 512));
    const px = int(a.tile_px, 'tile_px', Math.max(2, Math.min(32, Math.floor(1024 / Math.max(w, h)))));
    if (w * px > 4096 || h * px > 4096) fail('Bild wäre zu groß – kleineren Bereich oder tile_px wählen');
    const url = await renderArea(p, hex ? x : x, hex ? y * 0.75 : y, w, h, px, !!a.grid, !!a.collision);
    return { text: `Karte ${x},${y} ${w}×${h} Tiles, ${px} px pro Tile`, binary: { kind: 'image', mime: 'image/png', name: 'map.png', base64: dataUrlBase64(url) } };
  },

  export_godot: async (a) => {
    const { blob, name } = await buildGodotPackage(P(), a.shadows !== false);
    return { text: `Godot-Paket ${name} (${Math.round(blob.size / 1024)} KB)`, binary: { kind: 'file', mime: 'application/zip', name, base64: await blobToBase64(blob) } };
  },

  export_json: async () => ({ data: await buildGodotData(P(), { embedImages: false }) }),

  save: async () => ({ data: { saved: await saveNow() } }),

  list_projects: async () => ({ data: (await listProjects()).map((s) => ({ id: s.id, name: s.name, updatedAt: s.updatedAt })) }),

  open_project: async (a) => {
    await saveNow();
    const p = (await loadProject(str(a.id, 'id'))) ?? fail('Projekt nicht gefunden');
    useProject.getState().loadProject(p);
    useApp.getState().goTo('map');
    return { data: summary(P()) };
  },

  // ------------------------------------------------------------------ figures
  figure_status: async (a) => {
    const kind = kindOf(a.kind);
    const doc = await figureReady(kind);
    return { data: { name: doc.name, size: doc.size, layers: doc.layers.map((l) => ({ id: l.id, slot: l.slot, part: l.partId, name: l.name, drawn: l.edited, visible: l.visible })), colors: doc.ramps } };
  },

  figure_parts: (a) => {
    const kind = kindOf(a.kind);
    const slots = SLOTS[kind].filter((s) => !a.slot || s.id === a.slot);
    return {
      data: {
        slots: slots.map((s) => ({ slot: s.id, label: s.label, multi: !!s.multi, parts: DEMO_PARTS[kind].filter((p) => p.slot === s.id).map((p) => ({ id: p.id, label: p.label })) })),
        colors: Object.fromEntries(CHANNELS.map((c) => [c, RAMP_PRESETS[c].length])),
        animations: animsFor(kind).map((x) => ({ id: x.id, label: x.label, frames: x.poses.length })),
        views: VIEWS.map((v) => v.id),
      },
    };
  },

  figure_set_part: async (a) => {
    const kind = kindOf(a.kind);
    await figureReady(kind);
    const part = partById(str(a.part, 'part'));
    if (!part || part.kind !== kind) fail(`Teil "${a.part}" gibt es für ${kind} nicht – figure_parts zeigt alle`);
    await useSprites.getState().placePart(kind, part!);
    return { data: { placed: part!.id, slot: part!.slot } };
  },

  figure_remove_slot: async (a) => {
    const kind = kindOf(a.kind);
    const doc = await figureReady(kind);
    const ids = doc.layers.filter((l) => l.slot === a.slot).map((l) => l.id);
    if (!ids.length) fail(`Kein Layer im Slot "${a.slot}"`);
    for (const id of ids) useSprites.getState().removeLayer(kind, id);
    return { data: { removed: ids.length } };
  },

  figure_color: async (a) => {
    const kind = kindOf(a.kind);
    await figureReady(kind);
    const ch = str(a.channel, 'channel') as Channel;
    if (!CHANNELS.includes(ch)) fail(`channel: ${CHANNELS.join(', ')}`);
    let ramp: Ramp;
    if (Array.isArray(a.colors) && a.colors.length === 3) ramp = a.colors.map(String) as Ramp;
    else ramp = RAMP_PRESETS[ch][int(a.preset, 'preset', 0)] ?? fail(`preset 0–${RAMP_PRESETS[ch].length - 1}`);
    useSprites.getState().setRamp(kind, ch, ramp);
    return { data: { channel: ch, ramp } };
  },

  figure_new: async (a) => {
    const kind = kindOf(a.kind);
    await figureReady(kind);
    useSprites.getState().reset(kind, !!a.empty, a.size ? int(a.size, 'size') : undefined);
    if (!a.empty) useSprites.getState().randomize(kind);
    if (a.name) useSprites.getState().renameDoc(kind, String(a.name));
    return { data: { name: useSprites.getState()[kind].doc.name } };
  },

  figure_random: async (a) => {
    const kind = kindOf(a.kind);
    await figureReady(kind);
    useSprites.getState().randomize(kind);
    return { data: { layers: useSprites.getState()[kind].doc.layers.map((l) => l.partId ?? l.name) } };
  },

  figure_render: async (a) => {
    const kind = kindOf(a.kind);
    const doc = await figureReady(kind);
    const scale = int(a.scale, 'scale', 6);
    const view = (a.view as View | 'all') ?? (a.animation ? 'front' : 'all');
    if (a.animation) {
      const anim = animsFor(kind).find((x) => x.id === a.animation) ?? fail(`Animation "${a.animation}" gibt es nicht`);
      const v = view === 'all' ? 'front' : view;
      const frames = framesOf(doc, anim, v);
      return { text: `${anim.label} (${v}), ${frames.length} Bilder`, binary: { kind: 'image', mime: 'image/png', name: `${anim.id}.png`, base64: dataUrlBase64(strip(frames, frameSize(doc.size), Math.max(1, Math.round(scale / 2)))) } };
    }
    const views: View[] = view === 'all' ? (kind === 'object' ? ['front'] : VIEWS.map((v) => v.id)) : [view];
    const url = views.length === 1 ? toPng(composeView(doc, views[0]), doc.size, scale) : strip(views.map((v) => composeView(doc, v)), doc.size, scale);
    return { text: `${doc.name}: ${views.join(', ')}`, binary: { kind: 'image', mime: 'image/png', name: 'figure.png', base64: dataUrlBase64(url) } };
  },

  figure_save: async (a) => {
    const kind = kindOf(a.kind);
    await figureReady(kind);
    return { data: { saved: useSprites.getState().saveToGallery(kind) } };
  },

  figure_export_godot: async (a) => {
    const kind = kindOf(a.kind);
    const doc = await figureReady(kind);
    const all = animsFor(kind);
    const anims = Array.isArray(a.animations) && a.animations.length ? all.filter((x) => (a.animations as string[]).includes(x.id)) : all;
    const dirs = int(a.directions, 'directions', 4);
    const views: View[] = kind === 'object' ? ['front'] : dirs === 2 ? ['side'] : dirs === 8 ? VIEWS.map((v) => v.id) : VIEWS4;
    const { blob, name } = buildSpriteGodot(doc, { anims, fps: {}, views, custom: doc.customAnims ?? [] });
    return { text: `Godot-Paket ${name}: ${anims.length} Animationen, ${views.length} Ansichten`, binary: { kind: 'file', mime: 'application/zip', name, base64: await blobToBase64(blob) } };
  },

  figure_use_as_player: async (a) => {
    const kind = kindOf(a.kind);
    if (kind === 'object') fail('Nur Charakter oder Kreatur');
    const doc = await figureReady(kind);
    return { data: { ok: setPlayerSprite(doc) } };
  },

  figure_to_map: async (a) => {
    const kind = kindOf(a.kind);
    const doc = await figureReady(kind);
    const o = figureToObject(doc, a.collision !== false) ?? fail('Die Figur ist leer');
    useProject.getState().addCustomObject(o!);
    return { data: { type: o!.id, label: o!.label, w: o!.w, h: o!.h, hint: 'place_object mit diesem type setzen' } };
  },

  show: (a) => {
    const page = str(a.page, 'page') as Page;
    useApp.getState().goTo(page);
    return { data: { page } };
  },
};

export const COMMANDS = Object.keys(H);

/** run one command – never throws, errors come back as { ok: false, error } */
export async function runCommand(name: string, args: Args = {}): Promise<Result> {
  const h = H[name];
  if (!h) return { ok: false, error: `Unbekannter Befehl "${name}". Befehle: ${COMMANDS.join(', ')}` };
  try {
    const r = await h(args ?? {});
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: e instanceof UserError ? e.message : `Fehler: ${(e as Error)?.message ?? e}` };
  }
}

export { spec };
