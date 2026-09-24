import type { Project, Tileset } from '../types';
import { FLIP_H, FLIP_V, TRANSPOSE, applyCanvasTransform } from '../tilesets/gid';
import { canvasToBlob, loadImage } from '../utils/image';
import { safeFileName } from '../utils/download';
import type { buildGodotData } from './godotJson';
import { GODOT_LOADER_FILENAME } from './godotScript';

// Godot export of the diamond view (perspective "isometric"): a TileSet with TILE_SHAPE_ISOMETRIC /
// TILE_LAYOUT_DIAMOND_DOWN, tile size 2T × T – the same grid as MapForge (cell (x, y) → pixel
// ((x − y)·T + T, (x + y)·T/2 + T/2), checked against Godot 4.3). Tiles are drawn like in the app:
// ground as diamonds, walls as blocks, objects standing upright. Only tiles the map uses end up in
// the iso sheets; turned / mirrored tiles are baked in (a mirrored diamond is not a mirrored square).

type GodotData = Awaited<ReturnType<typeof buildGodotData>>;
export type IsoKind = 'flat' | 'block' | 'stand';
const COLS = 16;

/** how a layer is drawn in the diamond view (null: not shown, like 3/4 wall fronts and shadows) */
export function isoKindOf(role: string): IsoKind | null {
  if (role === 'walls') return 'block';
  if (role === 'objects' || role === 'objectsFront' || role === 'overhead') return 'stand';
  if (role === 'wallsFront' || role === 'shadow') return null;
  return 'flat';
}

/** cell sizes of the three kinds: wall height 1.1 T (even), standing tiles 1.1 T */
export function isoDims(T: number) {
  const wall = 2 * Math.round(0.55 * T);
  const stand = Math.round(1.1 * T);
  return { wall, stand, size: { flat: [2 * T, T], block: [2 * T, T + wall], stand: [stand, stand] } as Record<IsoKind, [number, number]> };
}

const alternativeToTransform = (alt: number) => (alt & 4096 ? FLIP_H : 0) | (alt & 8192 ? FLIP_V : 0) | (alt & 16384 ? TRANSPOSE : 0);

/** the iso atlases: per (tileset, kind) the used (tile, transform) pairs, each with a slot */
export interface IsoPlan {
  T: number;
  sheets: { ts: Tileset; kind: IsoKind; sourceId: number; image: string; slots: { index: number; transform: number }[] }[];
  /** layer id → cells with source + atlas coordinates in the iso sheets */
  layers: Map<string, { x: number; y: number; sourceId: number; atlas: [number, number] }[]>;
  collisionKeys: Set<string>;
}

export function planIso(p: Project, data: GodotData): IsoPlan {
  const T = data.map.tileSize;
  const byKey = new Map<string, IsoPlan['sheets'][number] & { index: Map<string, number> }>();
  const layers = new Map<string, { x: number; y: number; sourceId: number; atlas: [number, number] }[]>();
  const collisionKeys = new Set<string>();
  let nextSource = 0;
  for (const l of data.layers) {
    const kind = isoKindOf(l.role);
    if (!kind) continue;
    const out: { x: number; y: number; sourceId: number; atlas: [number, number] }[] = [];
    for (const t of l.tiles) {
      const ts = p.tilesets.find((x) => x.id === t.tilesetId);
      if (!ts) continue;
      const key = `${ts.id}:${kind}`;
      let sheet = byKey.get(key);
      if (!sheet) {
        sheet = { ts, kind, sourceId: nextSource++, image: `tilesets/${safeFileName(ts.id)}_iso_${kind}.png`, slots: [], index: new Map() };
        byKey.set(key, sheet);
      }
      const transform = alternativeToTransform(t.alternative ?? 0);
      const slotKey = `${t.tileId}:${transform}`;
      let slot = sheet.index.get(slotKey);
      if (slot === undefined) {
        slot = sheet.slots.length;
        sheet.slots.push({ index: t.tileId, transform });
        sheet.index.set(slotKey, slot);
      }
      const atlas: [number, number] = [slot % COLS, Math.floor(slot / COLS)];
      if (l.role === 'collision') collisionKeys.add(`${sheet.sourceId}:${atlas[0]}:${atlas[1]}`);
      out.push({ x: t.x, y: t.y, sourceId: sheet.sourceId, atlas });
    }
    layers.set(l.id, out);
  }
  return { T, sheets: [...byKey.values()].map(({ index: _i, ...s }) => s), layers, collisionKeys };
}

/** draw one sheet: every slot as diamond / block / upright tile */
export async function isoSheetPng(sheet: IsoPlan['sheets'][number], T: number): Promise<Blob> {
  const { size, wall, stand } = isoDims(T);
  const [cw, ch] = size[sheet.kind];
  const rows = Math.max(1, Math.ceil(sheet.slots.length / COLS));
  const canvas = document.createElement('canvas');
  canvas.width = COLS * cw;
  canvas.height = rows * ch;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const img = await loadImage(sheet.ts.dataUrl);
  const src = sheet.ts.tileSize;
  // the tile (turned / mirrored) as a square first
  const tmp = document.createElement('canvas');
  tmp.width = src;
  tmp.height = src;
  const tctx = tmp.getContext('2d')!;
  tctx.imageSmoothingEnabled = false;
  const k = 1 + 1.2 / Math.max(4, T); // a hair bigger, no seams (like the app)
  sheet.slots.forEach(({ index, transform }, n) => {
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.clearRect(0, 0, src, src);
    tctx.save();
    applyCanvasTransform(tctx, transform, 0, 0, src, src);
    tctx.drawImage(img, (index % sheet.ts.columns) * src, Math.floor(index / sheet.ts.columns) * src, src, src, -src / 2, -src / 2, src, src);
    tctx.restore();
    const ox = (n % COLS) * cw;
    const oy = Math.floor(n / COLS) * ch;
    const diamond = (y: number) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(ox, oy, cw, ch);
      ctx.clip();
      ctx.transform(T * k, (T / 2) * k, -T * k, (T / 2) * k, ox + T, oy + y - (T * (k - 1)) / 2);
      ctx.drawImage(tmp, 0, 0, 1, 1);
      ctx.restore();
    };
    if (sheet.kind === 'flat') diamond(0);
    else if (sheet.kind === 'block') {
      // faces below the top diamond: left lit, right shaded (same as the app)
      for (const [a, b, e, f, shade] of [
        [T, T / 2, ox, oy + T / 2, 'rgba(0,0,0,0.18)'],
        [T, -T / 2, ox + T, oy + T, 'rgba(0,0,0,0.42)'],
      ] as const) {
        ctx.save();
        ctx.transform(a, b, 0, wall, e, f);
        ctx.drawImage(tmp, 0, 0, 1, 1);
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, 1, 1);
        ctx.restore();
      }
      diamond(0);
    } else ctx.drawImage(tmp, ox, oy, stand, stand);
  });
  return canvasToBlob(canvas);
}

const str = (s: string) => JSON.stringify(s);

/** TileSet resource of the diamond view */
export function buildIsoTileSet(plan: IsoPlan, data: GodotData): string {
  const T = plan.T;
  const { size, wall, stand } = isoDims(T);
  const ext: string[] = [];
  const subs: string[] = [];
  const sources: string[] = [];
  plan.sheets.forEach((sheet, k) => {
    ext.push(`[ext_resource type="Texture2D" path=${str(sheet.image)} id="tex_${k}"]`);
    const [cw, ch] = size[sheet.kind];
    const lines = [`[sub_resource type="TileSetAtlasSource" id="src_${k}"]`, `texture = ExtResource("tex_${k}")`, `texture_region_size = Vector2i(${cw}, ${ch})`];
    const meta = data.tilesets.find((t) => t.id === sheet.ts.id)?.tiles ?? [];
    sheet.slots.forEach(({ index }, n) => {
      const key = `${n % COLS}:${Math.floor(n / COLS)}`;
      const p = `${key}/0`;
      lines.push(`${p} = 0`);
      // blocks and upright tiles stand on their diamond: texture moved up, base on the cell
      if (sheet.kind === 'block') lines.push(`${p}/texture_origin = Vector2i(0, ${wall / 2})`);
      if (sheet.kind === 'stand') lines.push(`${p}/texture_origin = Vector2i(0, ${Math.round(stand / 2 - 0.2 * T)})`);
      const m = meta.find((t) => t.id === index);
      if (m?.category) lines.push(`${p}/custom_data_0 = ${str(m.category)}`);
      if (m?.role) lines.push(`${p}/custom_data_1 = ${str(m.role)}`);
      if (plan.collisionKeys.has(`${sheet.sourceId}:${key}`)) lines.push(`${p}/physics_layer_0/polygon_0/points = PackedVector2Array(0, ${-T / 2}, ${T}, 0, 0, ${T / 2}, ${-T}, 0)`);
    });
    subs.push(lines.join('\n'));
    sources.push(`sources/${sheet.sourceId} = SubResource("src_${k}")`);
  });
  const res = [
    '[resource]',
    'tile_shape = 1',
    'tile_layout = 5',
    `tile_size = Vector2i(${2 * T}, ${T})`,
    'physics_layer_0/collision_layer = 1',
    'custom_data_layer_0/name = "category"',
    'custom_data_layer_0/type = 4',
    'custom_data_layer_1/name = "role"',
    'custom_data_layer_1/type = 4',
    ...sources,
  ];
  return [`[gd_resource type="TileSet" load_steps=${ext.length + subs.length + 1} format=3]`, ext.join('\n'), subs.join('\n\n'), res.join('\n')].filter(Boolean).join('\n\n') + '\n';
}

/** PackedByteArray of TileMapLayer.tile_map_data: uint16 version 0, then 12 bytes per cell */
function mapData(cells: { x: number; y: number; sourceId: number; atlas: [number, number] }[]): string {
  const bytes = new Uint8Array(2 + cells.length * 12);
  const dv = new DataView(bytes.buffer);
  cells.forEach((c, k) => {
    const o = 2 + k * 12;
    dv.setInt16(o, c.x, true);
    dv.setInt16(o + 2, c.y, true);
    dv.setUint16(o + 4, c.sourceId, true);
    dv.setUint16(o + 6, c.atlas[0], true);
    dv.setUint16(o + 8, c.atlas[1], true);
    dv.setUint16(o + 10, 0, true);
  });
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** map point (cells) → pixels, exactly Godot's DIAMOND_DOWN grid */
const px = (T: number, u: number, v: number): [number, number] => [(u - v) * T + T, ((u + v) * T) / 2];

/** ready scene of the diamond view: flat layers, y-sorted blocks and objects, diamond collisions */
export function buildIsoScene(plan: IsoPlan, data: GodotData, opts: { player: boolean; tileset: string }): string {
  const T = plan.T;
  const ext = [
    `[ext_resource type="Script" path=${str(GODOT_LOADER_FILENAME)} id="1_loader"]`,
    `[ext_resource type="TileSet" path=${str(opts.tileset)} id="2_tiles"]`,
    `[ext_resource type="Texture2D" path=${str(data.objectsImage)} id="3_objects"]`,
    ...(opts.player ? ['[ext_resource type="PackedScene" path="player/player.tscn" id="4_player"]'] : []),
  ];
  const nodes: string[] = [];
  const used = new Map<string, number>();
  const unique = (parent: string, base: string) => {
    const clean = base.replace(/[^A-Za-z0-9_]/g, '_') || 'Node';
    const n = (used.get(`${parent}/${clean}`) ?? 0) + 1;
    used.set(`${parent}/${clean}`, n);
    return n === 1 ? clean : `${clean}_${n}`;
  };
  const node = (n: string, type: string, parent: string | null, props: string[] = []) => nodes.push([`[node name=${str(n)} type="${type}"${parent === null ? '' : ` parent=${str(parent)}`}]`, ...props].join('\n'));
  node('Map', 'Node2D', null, ['texture_filter = 1', 'script = ExtResource("1_loader")', 'baked = true', ...(opts.player ? ['player_scene = ExtResource("4_player")'] : [])]);
  // ground first (flat, not sorted), then the World: blocks, upright tiles, objects and characters by depth
  const flat = data.layers.filter((l) => isoKindOf(l.role) === 'flat');
  const deep = data.layers.filter((l) => {
    const k = isoKindOf(l.role);
    return k === 'block' || k === 'stand';
  });
  for (const l of flat) {
    const props = [`tile_map_data = PackedByteArray(${str(mapData(plan.layers.get(l.id) ?? []))})`, 'tile_set = ExtResource("2_tiles")'];
    if (!l.visible) props.push('visible = false');
    if (l.role === 'collision') props.push('self_modulate = Color(1, 1, 1, 0)');
    node(unique('.', l.name), 'TileMapLayer', '.', props);
  }
  node('World', 'Node2D', '.', ['y_sort_enabled = true']);
  for (const l of deep) {
    const props = [`tile_map_data = PackedByteArray(${str(mapData(plan.layers.get(l.id) ?? []))})`, 'tile_set = ExtResource("2_tiles")', 'y_sort_enabled = true'];
    if (!l.visible) props.push('visible = false');
    node(unique('World', l.name), 'TileMapLayer', 'World', props);
  }
  node('Objects', 'Node2D', 'World', ['y_sort_enabled = true']);
  node('Characters', 'Node2D', 'World', ['y_sort_enabled = true']);
  // objects stand on the middle of their base row; collision cells become diamonds
  for (const o of data.objects) {
    const [rx, ry, w, h] = o.sprite.region;
    const [x, y] = px(T, o.x + o.width / 2, o.y + 0.5);
    const holder = unique('World/Objects', `${o.type}_${o.id}`);
    const path = `World/Objects/${holder}`;
    node(holder, 'Node2D', 'World/Objects', [`position = Vector2(${x}, ${y})`, `metadata/type = ${str(o.type)}`]);
    // like the app: 1.25 × tile size, bottom a quarter tile below the middle of the base row
    const s = 1.25;
    node('Sprite', 'Sprite2D', path, ['texture = ExtResource("3_objects")', 'centered = false', 'region_enabled = true', `region_rect = Rect2(${rx}, ${ry}, ${w}, ${h})`, `scale = Vector2(${s}, ${s})`, `position = Vector2(${(-w * s) / 2}, ${-h * s + T * 0.25})`]);
    if (o.collision.length) {
      node('Body', 'StaticBody2D', path);
      o.collision.forEach((c, k) => {
        const [cx, cy] = px(T, c.x + 0.5, c.y + 0.5);
        const dx = cx - x;
        const dy = cy - y;
        node(`Shape${k}`, 'CollisionPolygon2D', `${path}/Body`, [`polygon = PackedVector2Array(${dx}, ${dy - T / 2}, ${dx + T}, ${dy}, ${dx}, ${dy + T / 2}, ${dx - T}, ${dy})`]);
      });
    }
  }
  return [`[gd_scene load_steps=${ext.length + 1} format=3]`, ext.join('\n'), nodes.join('\n\n')].join('\n\n') + '\n';
}
