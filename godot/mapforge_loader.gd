## MapForge → Godot 4 loader (Godot 4.3+, uses TileMapLayer)
##
## Usage:
##   1. Copy the exported folder to res://mapforge/
##   2. Add a Node2D to your scene and attach this script
##   3. Set "map_json_path" (default: res://mapforge/map.json) and run
##
## The script
##   - reads the JSON (map metadata, tilesets, layers, rooms, spawn points)
##   - builds a TileSet with one TileSetAtlasSource per exported tileset
##   - creates one TileMapLayer node per MapForge layer and fills it with set_cell()
##   - adds a full-tile collision polygon to every tile placed on the "collision" layer
##   - creates Marker2D nodes for spawn points
extends Node2D
class_name MapForgeLoader

@export_file("*.json") var map_json_path: String = "res://mapforge/map.json"
@export var build_on_ready: bool = true
## Collision layer keeps its physics but is not drawn
@export var hide_collision_layer: bool = true

var map_data: Dictionary = {}
var tile_set: TileSet
var tile_size: int = 16
## MapForge layer id -> TileMapLayer
var layer_nodes: Dictionary = {}
## MapForge tileset id -> TileSet source id
var _sources: Dictionary = {}


func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST  # crisp pixel art
	if build_on_ready:
		load_and_build(map_json_path)


func load_and_build(path: String) -> void:
	map_data = load_map_json(path)
	if map_data.is_empty():
		return
	var info: Dictionary = map_data.get("map", {})
	tile_size = int(info.get("tileSize", 16))
	print("MapForge: '%s' %dx%d tiles, tile size %d px, seed %s" % [
		info.get("name", ""), int(info.get("width", 0)), int(info.get("height", 0)), tile_size, str(info.get("seed", ""))
	])
	tile_set = build_tile_set(map_data, path.get_base_dir())
	build_layers(map_data)
	build_spawn_markers(map_data)
	print("MapForge: %d layers, %d rooms, %d spawn points" % [
		layer_nodes.size(), get_rooms().size(), map_data.get("spawnPoints", []).size()
	])


static func load_map_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		push_error("MapForge: file not found: " + path)
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("MapForge: invalid JSON in " + path)
		return {}
	return parsed


func build_tile_set(data: Dictionary, base_dir: String) -> TileSet:
	var ts := TileSet.new()
	ts.tile_size = Vector2i(tile_size, tile_size)
	# custom data: MapForge tile category (floor, wallTop, door, ...)
	ts.add_custom_data_layer()
	ts.set_custom_data_layer_name(0, "category")
	ts.set_custom_data_layer_type(0, TYPE_STRING)
	ts.add_physics_layer()

	for tileset in data.get("tilesets", []):
		var texture := _load_texture(tileset, base_dir)
		if texture == null:
			push_warning("MapForge: texture missing for tileset " + str(tileset.get("name", "")))
			continue
		var source := TileSetAtlasSource.new()
		source.texture = texture
		source.texture_region_size = Vector2i(tile_size, tile_size)
		var source_id := ts.add_source(source)
		_sources[tileset["id"]] = source_id
		for tile in tileset.get("tiles", []):
			var coords := Vector2i(int(tile["atlas"][0]), int(tile["atlas"][1]))
			if not source.has_tile(coords):
				source.create_tile(coords)
			if tile.get("category") != null:
				source.get_tile_data(coords, 0).set_custom_data("category", str(tile["category"]))
	return ts


func build_layers(data: Dictionary) -> void:
	for layer in data.get("layers", []):
		var node := TileMapLayer.new()
		node.name = str(layer.get("name", "Layer"))
		node.tile_set = tile_set
		node.z_index = int(layer.get("zIndex", 0))
		node.visible = bool(layer.get("visible", true))
		var is_collision: bool = layer.get("role", "") == "collision"
		if is_collision:
			node.visible = true
			if hide_collision_layer:
				node.self_modulate = Color(1, 1, 1, 0)
		add_child(node)
		layer_nodes[layer["id"]] = node

		for t in layer.get("tiles", []):
			var source_id: int = _sources.get(t["tileset"], -1)
			if source_id == -1:
				continue
			var coords := Vector2i(int(t["atlas"][0]), int(t["atlas"][1]))
			var source := tile_set.get_source(source_id) as TileSetAtlasSource
			if not source.has_tile(coords):
				source.create_tile(coords)
			if is_collision:
				_ensure_collision(source, coords)
			node.set_cell(Vector2i(int(t["x"]), int(t["y"])), source_id, coords)


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


func _ensure_collision(source: TileSetAtlasSource, coords: Vector2i) -> void:
	var data := source.get_tile_data(coords, 0)
	if data.get_collision_polygons_count(0) > 0:
		return
	var h := tile_size / 2.0
	data.add_collision_polygon(0)
	data.set_collision_polygon_points(0, 0, PackedVector2Array([
		Vector2(-h, -h), Vector2(h, -h), Vector2(h, h), Vector2(-h, h)
	]))


func _load_texture(tileset: Dictionary, base_dir: String) -> Texture2D:
	var rel: String = tileset.get("image", "")
	if rel != "":
		var full := base_dir.path_join(rel)
		if ResourceLoader.exists(full):
			return load(full) as Texture2D
		if FileAccess.file_exists(full):
			var file_img := Image.load_from_file(full)
			if file_img:
				return ImageTexture.create_from_image(file_img)
	# JSON-only export: PNG embedded as base64
	if tileset.has("imageBase64"):
		var img := Image.new()
		if img.load_png_from_buffer(Marshalls.base64_to_raw(tileset["imageBase64"])) == OK:
			return ImageTexture.create_from_image(img)
	return null
