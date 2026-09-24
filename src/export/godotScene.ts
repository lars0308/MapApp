import type { buildGodotData } from './godotJson';
import { GODOT_LOADER_FILENAME } from './godotScript';

// The map as ready Godot resources: tileset.tres (TileSet with all tiles, y-sort origins, category /
// role custom data, collision polygons, hex shape) and Map.tscn with one TileMapLayer per MapForge
// layer (tiles baked into tile_map_data), the y-sorted World, objects as sprites with collision and
// the player. Everything is visible and editable in the Godot editor right away; the attached loader
// (baked = true) only adds the runtime parts from map.json (spawn markers, AStar, side-scroller
// platforms / ladders / lifts, hex helpers, player).

type GodotData = Awaited<ReturnType<typeof buildGodotData>>;

export const TILESET_RESOURCE = 'tileset.tres';

/** Godot string literal */
const str = (s: string) => JSON.stringify(s);

/** node names: no . : @ / % " and unique among siblings */
function nameMaker() {
  const used = new Map<string, Set<string>>();
  return (parent: string, wanted: string) => {
    const set = used.get(parent) ?? new Set<string>();
    used.set(parent, set);
    const base = wanted.replace(/[.:@/%"]/g, '_') || 'Node';
    let name = base;
    for (let k = 2; set.has(name); k++) name = `${base}_${k}`;
    set.add(name);
    return name;
  };
}

function base64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** TileMapLayer.tile_map_data (format 0): uint16 version, then per cell int16 x, y, uint16 source, atlas x, atlas y, alternative */
export function tileMapData(tiles: { x: number; y: number; sourceId: number; atlasCoordinates: [number, number]; alternative?: number }[]): string {
  const buf = new Uint8Array(2 + tiles.length * 12);
  const v = new DataView(buf.buffer);
  v.setUint16(0, 0, true);
  tiles.forEach((t, i) => {
    const o = 2 + i * 12;
    v.setInt16(o, t.x, true);
    v.setInt16(o + 2, t.y, true);
    v.setUint16(o + 4, t.sourceId, true);
    v.setUint16(o + 6, t.atlasCoordinates[0], true);
    v.setUint16(o + 8, t.atlasCoordinates[1], true);
    v.setUint16(o + 10, t.alternative ?? 0, true);
  });
  return base64(buf);
}

export function buildTileSetResource(data: GodotData): string {
  const T = data.map.tileSize;
  const half = T / 2;
  // tiles used in the collision layer get a full-cell collision polygon (like the loader)
  const solid = new Set<string>();
  for (const l of data.layers) if (l.role === 'collision') for (const t of l.tiles) solid.add(`${t.tilesetId}:${t.atlasCoordinates[0]}:${t.atlasCoordinates[1]}`);
  const ext: string[] = [];
  const subs: string[] = [];
  const sources: string[] = [];
  data.tilesets.forEach((ts, k) => {
    ext.push(`[ext_resource type="Texture2D" path=${str(ts.image)} id="tex_${k}"]`);
    const lines = [`[sub_resource type="TileSetAtlasSource" id="src_${k}"]`, `texture = ExtResource("tex_${k}")`, `texture_region_size = Vector2i(${T}, ${T})`];
    // every tile the map uses (and every assigned one)
    const tiles = new Map<string, { ySortOrigin: number; category: string | null; role: string | null }>();
    for (const t of ts.tiles) tiles.set(`${t.atlas[0]}:${t.atlas[1]}`, { ySortOrigin: t.ySortOrigin, category: t.category, role: t.role });
    for (const l of data.layers) for (const t of l.tiles) if (t.tilesetId === ts.id && !tiles.has(`${t.atlasCoordinates[0]}:${t.atlasCoordinates[1]}`)) tiles.set(`${t.atlasCoordinates[0]}:${t.atlasCoordinates[1]}`, { ySortOrigin: 0, category: null, role: null });
    for (const [key, t] of tiles) {
      const p = `${key}/0`;
      lines.push(`${p} = 0`);
      // MapForge sorts by the bottom edge of the cell (Godot: centre + half a tile)
      lines.push(`${p}/y_sort_origin = ${Math.round(t.ySortOrigin + T / 2)}`);
      if (t.category) lines.push(`${p}/custom_data_0 = ${str(t.category)}`);
      if (t.role) lines.push(`${p}/custom_data_1 = ${str(t.role)}`);
      if (solid.has(`${ts.id}:${key}`)) lines.push(`${p}/physics_layer_0/polygon_0/points = PackedVector2Array(${-half}, ${-half}, ${half}, ${-half}, ${half}, ${half}, ${-half}, ${half})`);
    }
    subs.push(lines.join('\n'));
    sources.push(`sources/${ts.sourceId} = SubResource("src_${k}")`);
  });
  const res = [
    '[resource]',
    // hex maps: odd rows shifted half a hex (TILE_LAYOUT_STACKED, TILE_OFFSET_AXIS_HORIZONTAL are the defaults)
    ...(data.map.perspective === 'hex' ? ['tile_shape = 3'] : []),
    `tile_size = Vector2i(${T}, ${T})`,
    'physics_layer_0/collision_layer = 1',
    'custom_data_layer_0/name = "category"',
    'custom_data_layer_0/type = 4',
    'custom_data_layer_1/name = "role"',
    'custom_data_layer_1/type = 4',
    ...sources,
  ];
  return [`[gd_resource type="TileSet" load_steps=${ext.length + subs.length + 1} format=3]`, ext.join('\n'), subs.join('\n\n'), res.join('\n')].filter(Boolean).join('\n\n') + '\n';
}

export function buildMapScene(data: GodotData, opts: { player: boolean }): string {
  const T = data.map.tileSize;
  const name = nameMaker();
  const ext = [
    `[ext_resource type="Script" path=${str(GODOT_LOADER_FILENAME)} id="1_loader"]`,
    `[ext_resource type="TileSet" path=${str(TILESET_RESOURCE)} id="2_tiles"]`,
    `[ext_resource type="Texture2D" path=${str(data.objectsImage)} id="3_objects"]`,
    ...(opts.player ? ['[ext_resource type="PackedScene" path="player/player.tscn" id="4_player"]'] : []),
  ];
  const withBodies = data.objects.some((o) => o.collision.length);
  const subs = withBodies ? [`[sub_resource type="RectangleShape2D" id="cell"]\nsize = Vector2(${T}, ${T})`] : [];
  const nodes: string[] = [];
  const node = (n: string, type: string, parent: string | null, props: string[] = []) => nodes.push([`[node name=${str(n)} type="${type}"${parent === null ? '' : ` parent=${str(parent)}`}]`, ...props].join('\n'));

  node('Map', 'Node2D', null, ['texture_filter = 1', 'script = ExtResource("1_loader")', 'baked = true', ...(opts.player ? ['player_scene = ExtResource("4_player")'] : [])]);

  // layers: the first y-sorted layer opens the World (y-sorted with objects and characters),
  // non-sorted layers after it are drawn above it
  let world = '';
  for (const l of data.layers) {
    const props = [`tile_map_data = PackedByteArray(${str(tileMapData(l.tiles))})`, 'tile_set = ExtResource("2_tiles")'];
    if (!l.visible) props.push('visible = false');
    if (l.role === 'collision') props.push('self_modulate = Color(1, 1, 1, 0)');
    if (l.ySort) {
      if (!world) node((world = name('.', 'World')), 'Node2D', '.', ['y_sort_enabled = true']);
      props.push('y_sort_enabled = true');
      node(name(world, l.name), 'TileMapLayer', world, props);
    } else {
      if (world) props.push('z_index = 1');
      node(name('.', l.name), 'TileMapLayer', '.', props);
    }
  }
  if (!world) node((world = name('.', 'World')), 'Node2D', '.', ['y_sort_enabled = true']);
  const objects = `${world}/${name(world, 'Objects')}`;
  node(objects.split('/')[1], 'Node2D', world, ['y_sort_enabled = true']);
  node(name(world, 'Characters'), 'Node2D', world, ['y_sort_enabled = true']);
  // roof rows of objects (the layer „Overhead“ has its own node)
  const overhead = name('.', 'OverheadObjects');
  node(overhead, 'Node2D', '.', ['z_index = 2']);

  // objects: node at the sort origin (bottom-left of the base row), body sprite above it, roof rows
  // (overheadRows) in Overhead so characters walk behind them
  for (const o of data.objects) {
    const [rx, ry, w, h] = o.sprite.region;
    const over = o.sprite.overheadRows * T;
    const px = o.x * T;
    const py = o.sortOriginPx;
    const holder = name(objects, `${o.type}_${o.id}`);
    const path = `${objects}/${holder}`;
    node(holder, 'Node2D', objects, [`position = Vector2(${px}, ${py})`, `metadata/type = ${str(o.type)}`]);
    node('Sprite', 'Sprite2D', path, ['texture = ExtResource("3_objects")', 'centered = false', 'region_enabled = true', `region_rect = Rect2(${rx}, ${ry + over}, ${w}, ${h - over})`, `position = Vector2(0, ${-(h - over)})`]);
    if (over > 0) node(name(overhead, `${holder}_top`), 'Sprite2D', overhead, ['texture = ExtResource("3_objects")', 'centered = false', 'region_enabled = true', `region_rect = Rect2(${rx}, ${ry}, ${w}, ${over})`, `position = Vector2(${px}, ${py - h})`]);
    if (o.collision.length) {
      node('Body', 'StaticBody2D', path);
      o.collision.forEach((c, k) => node(`Shape${k}`, 'CollisionShape2D', `${path}/Body`, [`position = Vector2(${(c.x - o.x + 0.5) * T}, ${(c.y - o.y - 0.5) * T})`, 'shape = SubResource("cell")']));
    }
  }
  return [`[gd_scene load_steps=${ext.length + subs.length + 1} format=3]`, ext.join('\n'), ...subs, nodes.join('\n\n')].join('\n\n') + '\n';
}
