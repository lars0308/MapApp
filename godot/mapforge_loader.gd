## MapForge → Godot 4 loader (Godot 4.3+, TileMapLayer)
##
## Usage:
##   1. Copy the exported folder to res://mapforge/
##   2. Add a Node2D to your scene and attach this script
##   3. Set "map_json_path" (default: res://mapforge/map.json) and run
##      (or call build_now() from a @tool script / the editor to keep the nodes)
##
## Scene that is created:
##   MapForgeLoader (this node)
##     <layers before the y-sorted group>   TileMapLayer (Ground, GroundDetails, Paths, Decoration, Shadows, WallsBack)
##     World  (Node2D, y_sort_enabled)       ← everything that must sort by Y
##       ObjectsBack, WallsFront             TileMapLayer with y_sort_enabled
##       Objects                             Node2D per object: Sprite2D + StaticBody2D (origin = base line)
##       Characters                          put your player / NPCs here → correct front/behind sorting
##     <layers after the y-sorted group>     TileMapLayer (ObjectsFront, Overhead, Collision, Gameplay, SpawnPoints)
##     Overhead                              object parts that are always above characters (arch beams)
##     SpawnPoints                           Marker2D
##
## Everything stays editable: tiles are tiles, layers are separate nodes, objects are nodes.
extends Node2D
class_name MapForgeLoader

@export_file("*.json") var map_json_path: String = "res://mapforge/map.json"
@export var build_on_ready: bool = true
## Collision layer keeps its physics but is not drawn
@export var hide_collision_layer: bool = true
## Additionally create merged CollisionShape2D rectangles (instead of relying on tile physics)
@export var use_collision_rects: bool = false

var map_data: Dictionary = {}
var tile_set: TileSet
var tile_size: int = 16
var perspective: String = "top_down"
## MapForge layer name -> TileMapLayer
var layer_nodes: Dictionary = {}
var world: Node2D
var characters: Node2D
var astar: AStarGrid2D
var _sources: Dictionary = {}
var _objects_texture: Texture2D


func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST  # crisp pixel art
	if build_on_ready:
		build_now()


func build_now() -> void:
	map_data = load_map_json(map_json_path)
	if map_data.is_empty():
		return
	var info: Dictionary = map_data.get("map", {})
	tile_size = int(info.get("tileSize", 16))
	perspective = str(info.get("perspective", "top_down"))
	print("MapForge: '%s' %dx%d tiles, %d px, perspective %s, seed %s" % [
		info.get("name", ""), int(info.get("width", 0)), int(info.get("height", 0)), tile_size, perspective, str(info.get("seed", ""))
	])
	var base_dir := map_json_path.get_base_dir()
	tile_set = build_tile_set(map_data, base_dir)
	_objects_texture = _load_image_texture(base_dir, str(map_data.get("objectsImage", "")), map_data.get("objectsImageBase64", ""))
	build_layers(map_data)
	build_objects(map_data)
	if use_collision_rects:
		build_collision_rects(map_data)
	build_spawn_markers(map_data)
	astar = build_astar(map_data)
	print("MapForge: %d layers, %d objects, %d rooms" % [layer_nodes.size(), map_data.get("objects", []).size(), get_rooms().size()])


static func load_map_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		push_error("MapForge: file not found: " + path)
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("MapForge: invalid JSON in " + path)
		return {}
	return parsed


# ------------------------------------------------------------------ tiles

func build_tile_set(data: Dictionary, base_dir: String) -> TileSet:
	var ts := TileSet.new()
	ts.tile_size = Vector2i(tile_size, tile_size)
	ts.add_custom_data_layer()
	ts.set_custom_data_layer_name(0, "category")
	ts.set_custom_data_layer_type(0, TYPE_STRING)
	ts.add_custom_data_layer()
	ts.set_custom_data_layer_name(1, "role")
	ts.set_custom_data_layer_type(1, TYPE_STRING)
	ts.add_physics_layer()

	for tileset in data.get("tilesets", []):
		var texture := _load_image_texture(base_dir, str(tileset.get("image", "")), tileset.get("imageBase64", ""))
		if texture == null:
			push_warning("MapForge: texture missing for tileset " + str(tileset.get("name", "")))
			continue
		var source := TileSetAtlasSource.new()
		source.texture = texture
		source.texture_region_size = Vector2i(tile_size, tile_size)
		var source_id := ts.add_source(source, int(tileset.get("sourceId", -1)))
		_sources[tileset["id"]] = source_id
		for tile in tileset.get("tiles", []):
			var coords := Vector2i(int(tile["atlas"][0]), int(tile["atlas"][1]))
			if not source.has_tile(coords):
				source.create_tile(coords)
			var td := source.get_tile_data(coords, 0)
			if tile.get("category") != null:
				td.set_custom_data("category", str(tile["category"]))
			if tile.get("role") != null:
				td.set_custom_data("role", str(tile["role"]))
			# MapForge sorts a tile by the bottom edge of its cell (Godot: cell centre → + half a tile);
			# tall tiles (e.g. upper wall fronts) sort by a point further down (ySortOrigin)
			td.y_sort_origin = int(tile.get("ySortOrigin", 0)) + int(tile_size / 2.0)
	return ts


func build_layers(data: Dictionary) -> void:
	world = Node2D.new()
	world.name = "World"
	world.y_sort_enabled = true
	var objects_root := Node2D.new()
	objects_root.name = "Objects"
	objects_root.y_sort_enabled = true
	characters = Node2D.new()
	characters.name = "Characters"
	characters.y_sort_enabled = true

	var world_added := false
	for layer in data.get("layers", []):
		var node := TileMapLayer.new()
		node.name = str(layer.get("name", "Layer"))
		node.tile_set = tile_set
		node.visible = bool(layer.get("visible", true))
		var role: String = layer.get("role", "")
		var sorted: bool = bool(layer.get("ySort", false))
		if role == "collision":
			node.visible = true
			if hide_collision_layer:
				node.self_modulate = Color(1, 1, 1, 0)
		if sorted:
			if not world_added:
				add_child(world)
				world_added = true
			node.y_sort_enabled = true
			world.add_child(node)
		else:
			if world_added:
				node.z_index = 1  # above the y-sorted world
			add_child(node)
		layer_nodes[node.name] = node

		for t in layer.get("tiles", []):
			var source_id: int = _sources.get(t["tilesetId"], -1)
			if source_id == -1:
				continue
			var coords := Vector2i(int(t["atlasCoordinates"][0]), int(t["atlasCoordinates"][1]))
			var source := tile_set.get_source(source_id) as TileSetAtlasSource
			if not source.has_tile(coords):
				source.create_tile(coords)
			if role == "collision":
				_ensure_collision(source, coords)
			node.set_cell(Vector2i(int(t["x"]), int(t["y"])), source_id, coords)

	if not world_added:
		add_child(world)
	world.add_child(objects_root)
	world.add_child(characters)


# ------------------------------------------------------------------ objects

func build_objects(data: Dictionary) -> void:
	var objects_root := world.get_node("Objects")
	var overhead := Node2D.new()
	overhead.name = "Overhead"
	overhead.z_index = 2
	add_child(overhead)
	for o in data.get("objects", []):
		var region: Array = o["sprite"]["region"]
		var w := float(region[2])
		var h := float(region[3])
		var overhead_rows := int(o["sprite"].get("overheadRows", 0))
		# node position = sort origin (bottom-left of the base row) → Y-sort works like in MapForge
		var holder := Node2D.new()
		holder.name = "%s_%s" % [o.get("type", "object"), str(o.get("id", ""))]
		holder.position = Vector2(float(o["x"]) * tile_size, float(o["sortOriginPx"]))
		holder.set_meta("type", o.get("type", ""))
		objects_root.add_child(holder)
		var body_rows_px := h - overhead_rows * tile_size
		if _objects_texture:
			var sprite := Sprite2D.new()
			sprite.texture = _objects_texture
			sprite.centered = false
			sprite.region_enabled = true
			sprite.region_rect = Rect2(float(region[0]), float(region[1]) + overhead_rows * tile_size, w, body_rows_px)
			sprite.position = Vector2(0, -body_rows_px)
			holder.add_child(sprite)
			if overhead_rows > 0:
				var top := Sprite2D.new()
				top.texture = _objects_texture
				top.centered = false
				top.region_enabled = true
				top.region_rect = Rect2(float(region[0]), float(region[1]), w, overhead_rows * tile_size)
				top.position = holder.position + Vector2(0, -h)
				overhead.add_child(top)
		var cells: Array = o.get("collision", [])
		if cells.size() > 0:
			var body := StaticBody2D.new()
			holder.add_child(body)
			for c in cells:
				var shape := CollisionShape2D.new()
				var rect := RectangleShape2D.new()
				rect.size = Vector2(tile_size, tile_size)
				shape.shape = rect
				shape.position = Vector2((float(c["x"]) - float(o["x"]) + 0.5) * tile_size, (float(c["y"]) - float(o["y"]) - 0.5) * tile_size)
				body.add_child(shape)


func build_collision_rects(data: Dictionary) -> void:
	var body := StaticBody2D.new()
	body.name = "CollisionRects"
	add_child(body)
	for r in data.get("collisions", {}).get("rects", []):
		var shape := CollisionShape2D.new()
		var rect := RectangleShape2D.new()
		rect.size = Vector2(float(r["w"]) * tile_size, float(r["h"]) * tile_size)
		shape.shape = rect
		shape.position = Vector2((float(r["x"]) + float(r["w"]) / 2.0) * tile_size, (float(r["y"]) + float(r["h"]) / 2.0) * tile_size)
		body.add_child(shape)


# ------------------------------------------------------------------ gameplay data

func build_spawn_markers(data: Dictionary) -> void:
	var root := Node2D.new()
	root.name = "SpawnPoints"
	add_child(root)
	for sp in data.get("spawnPoints", []):
		var marker := Marker2D.new()
		marker.name = "%s_%s" % [sp.get("type", "spawn"), str(sp.get("id", ""))]
		marker.position = Vector2((float(sp["x"]) + 0.5) * tile_size, (float(sp["y"]) + 0.5) * tile_size)
		marker.set_meta("type", sp.get("type", ""))
		marker.set_meta("room_id", sp.get("roomId", -1))
		marker.set_meta("properties", sp.get("properties", {}))
		root.add_child(marker)


## AStarGrid2D from the exported navigation grid (1 = walkable)
func build_astar(data: Dictionary) -> AStarGrid2D:
	var info: Dictionary = data.get("map", {})
	var w := int(info.get("width", 0))
	var h := int(info.get("height", 0))
	var grid := AStarGrid2D.new()
	grid.region = Rect2i(0, 0, w, h)
	grid.cell_size = Vector2(tile_size, tile_size)
	grid.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	grid.update()
	var walkable := rle_decode(data.get("navigation", {}).get("walkable", []), w * h)
	for i in range(walkable.size()):
		if walkable[i] == 0:
			grid.set_point_solid(Vector2i(i % w, i / w), true)
	return grid


func get_rooms() -> Array:
	return map_data.get("rooms", [])


func get_room_by_type(room_type: String) -> Dictionary:
	for room in get_rooms():
		if room.get("type", "") == room_type:
			return room
	return {}


## World position of a room centre (e.g. to place the camera or player)
func room_center_position(room: Dictionary) -> Vector2:
	var c: Array = room.get("center", [0, 0])
	return Vector2((float(c[0]) + 0.5) * tile_size, (float(c[1]) + 0.5) * tile_size)


## Add your player / NPC here so it sorts correctly against walls, cliffs and objects
func add_character(node: Node2D) -> void:
	characters.add_child(node)


static func rle_decode(rle: Array, size: int) -> PackedByteArray:
	var out := PackedByteArray()
	out.resize(size)
	var i := 0
	var r := 0
	while r + 1 < rle.size():
		var v := int(rle[r])
		var n := int(rle[r + 1])
		for k in range(n):
			if i < size:
				out[i] = v
			i += 1
		r += 2
	return out


func _ensure_collision(source: TileSetAtlasSource, coords: Vector2i) -> void:
	var td := source.get_tile_data(coords, 0)
	if td.get_collision_polygons_count(0) > 0:
		return
	var half := tile_size / 2.0
	td.add_collision_polygon(0)
	td.set_collision_polygon_points(0, 0, PackedVector2Array([
		Vector2(-half, -half), Vector2(half, -half), Vector2(half, half), Vector2(-half, half)
	]))


func _load_image_texture(base_dir: String, rel: String, base64) -> Texture2D:
	if rel != "":
		var full := base_dir.path_join(rel)
		if ResourceLoader.exists(full):
			return load(full) as Texture2D
		if FileAccess.file_exists(full):
			var file_img := Image.load_from_file(full)
			if file_img:
				return ImageTexture.create_from_image(file_img)
	# JSON-only export: PNG embedded as base64
	if typeof(base64) == TYPE_STRING and base64 != "":
		var img := Image.new()
		if img.load_png_from_buffer(Marshalls.base64_to_raw(base64)) == OK:
			return ImageTexture.create_from_image(img)
	return null
