// Example GDScript (Godot 4.3+) that loads a MapForge export and builds an editable scene.
// Also shipped as a file in the Godot package export and in /godot of the repository.

export const GODOT_LOADER_FILENAME = 'mapforge_loader.gd';

export const GODOT_LOADER_SCRIPT = `## MapForge → Godot 4 loader (Godot 4.3+, TileMapLayer)
##
## Usage (easiest): copy the exported folder anywhere into your project and run Map.tscn.
## Manual: add a Node2D, attach this script – map.json next to this script is found automatically
## (or set "map_json_path"). Call build_now() from a @tool script / the editor to keep the nodes.
##
## Scene that is created:
##   MapForgeLoader (this node)
##     <layers before the y-sorted group>   TileMapLayer (Ground, GroundDetails, Paths, Decoration, Shadows, WallsBack)
##     World  (Node2D, y_sort_enabled)       ← everything that must sort by Y
##       ObjectsBack, WallsFront             TileMapLayer with y_sort_enabled
##       Objects                             Node2D per object: Sprite2D + StaticBody2D (origin = base line)
##       Characters                          put your player / NPCs here → correct front/behind sorting
##     <layers after the y-sorted group>     TileMapLayer (ObjectsFront, Overhead, Collision, Gameplay, SpawnPoints)
##     OverheadObjects                       object parts that are always above characters (arch beams, roofs)
##     SpawnMarkers                          Marker2D per spawn point (type, room_id, properties as meta)
##
## Everything stays editable: tiles are tiles, layers are separate nodes, objects are nodes.
extends Node2D
class_name MapForgeLoader

## empty = map.json next to this script
@export_file("*.json") var map_json_path: String = ""
## optional: your player scene (e.g. player/player.tscn from the export) – placed on the player spawn
@export var player_scene: PackedScene
@export var player_camera_zoom: float = 2.0
@export var build_on_ready: bool = true
## the scene already contains tiles and objects (Map.tscn from MapForge): only runtime parts are added
@export var baked: bool = false
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
var player: Node2D
var _sources: Dictionary = {}
var _objects_texture: Texture2D

## side-scroller: emitted when a body of group "player" reaches the goal
signal goal_reached(body: Node)
## hex maps: a hex was clicked (info: terrain, cost, river, road, settlement)
signal hex_clicked(cell: Vector2i, info: Dictionary)

var hex_camera: Camera2D
var hex_astar: AStar2D
var _hex_terrain := PackedByteArray()
var _hex_rivers := PackedByteArray()
var _hex_roads := PackedByteArray()


func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST  # crisp pixel art
	if build_on_ready:
		build_now()


func build_now() -> void:
	var path := map_json_path
	if path == "" or not FileAccess.file_exists(path):
		path = (get_script() as Script).resource_path.get_base_dir().path_join("map.json")
	map_json_path = path
	map_data = load_map_json(path)
	if map_data.is_empty():
		return
	var info: Dictionary = map_data.get("map", {})
	tile_size = int(info.get("tileSize", 16))
	perspective = str(info.get("perspective", "top_down"))
	print("MapForge: '%s' %dx%d tiles, %d px, perspective %s, seed %s" % [
		info.get("name", ""), int(info.get("width", 0)), int(info.get("height", 0)), tile_size, perspective, str(info.get("seed", ""))
	])
	var base_dir := map_json_path.get_base_dir()
	if perspective == "isometric" and not (baked and has_node("World")):
		push_warning("MapForge: the diamond view (isometric) is built into Map.tscn – open that scene; built from map.json the map would be square")
	if baked and has_node("World"):
		_adopt_baked(map_data)
	else:
		tile_set = build_tile_set(map_data, base_dir)
		_objects_texture = _load_image_texture(base_dir, str(map_data.get("objectsImage", "")), map_data.get("objectsImageBase64", ""))
		build_layers(map_data)
		build_objects(map_data)
	if use_collision_rects:
		build_collision_rects(map_data)
	build_spawn_markers(map_data)
	astar = build_astar(map_data)
	if perspective == "side_view":
		build_side(map_data)
	if perspective == "hex":
		build_hex(map_data)
	if player_scene:
		_spawn_player()
		if perspective == "side_view":
			_setup_side_player()
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
	if perspective == "hex":
		# odd rows shifted half a hex, rows 3/4 apart – same layout as in MapForge
		ts.tile_shape = TileSet.TILE_SHAPE_HEXAGON
		ts.tile_layout = TileSet.TILE_LAYOUT_STACKED
		ts.tile_offset_axis = TileSet.TILE_OFFSET_AXIS_HORIZONTAL
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


## Map.tscn from MapForge: layers, World, objects are already nodes of the scene
func _adopt_baked(data: Dictionary) -> void:
	world = get_node("World")
	characters = world.get_node("Characters")
	for node in find_children("*", "TileMapLayer", true, false):
		layer_nodes[node.name] = node
		if tile_set == null:
			tile_set = (node as TileMapLayer).tile_set
	for tileset in data.get("tilesets", []):
		_sources[tileset["id"]] = int(tileset.get("sourceId", -1))


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
			# turned / mirrored tiles: alternative = TRANSFORM_FLIP_H | FLIP_V | TRANSPOSE
			node.set_cell(Vector2i(int(t["x"]), int(t["y"])), source_id, coords, int(t.get("alternative", 0)))

	if not world_added:
		add_child(world)
	world.add_child(objects_root)
	world.add_child(characters)


# ------------------------------------------------------------------ objects

func build_objects(data: Dictionary) -> void:
	var objects_root := world.get_node("Objects")
	var overhead := Node2D.new()
	overhead.name = "OverheadObjects"
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
	if perspective == "isometric":
		return  # diamond view: the collision layer's tiles carry diamond polygons
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
	root.name = "SpawnMarkers"
	add_child(root)
	for sp in data.get("spawnPoints", []):
		var marker := Marker2D.new()
		marker.name = "%s_%s" % [sp.get("type", "spawn"), str(sp.get("id", ""))]
		marker.position = to_px(float(sp["x"]) + 0.5, float(sp["y"]) + 0.5)
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
	if perspective == "isometric":
		grid.cell_size = Vector2(tile_size * 2, tile_size)
		grid.cell_shape = AStarGrid2D.CELL_SHAPE_ISOMETRIC_DOWN
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
	return to_px(float(c[0]) + 0.5, float(c[1]) + 0.5)


## Map point in cells (fractions allowed) → pixels. The diamond view uses Godot's isometric
## DIAMOND_DOWN grid (tile 2T × T): the centre of cell (x, y) is to_px(x + 0.5, y + 0.5).
func to_px(x: float, y: float) -> Vector2:
	if perspective == "isometric":
		return Vector2((x - y) * tile_size + tile_size, (x + y) * tile_size / 2.0)
	return Vector2(x * tile_size, y * tile_size)


## Add your player / NPC here so it sorts correctly against walls, cliffs and objects
func add_character(node: Node2D) -> void:
	characters.add_child(node)


## Player on the "player" spawn point (else the first spawn / map centre), camera follows.
func _spawn_player() -> void:
	player = player_scene.instantiate() as Node2D
	if player == null:
		return
	var spawns: Array = map_data.get("spawnPoints", [])
	var pos := Vector2(float(map_data.get("map", {}).get("width", 0)) / 2.0, float(map_data.get("map", {}).get("height", 0)) / 2.0)
	var found := false
	for sp in spawns:
		if str(sp.get("type", "")) == "player":
			pos = Vector2(float(sp["x"]), float(sp["y"]))
			found = true
			break
	if not found and spawns.size() > 0:
		pos = Vector2(float(spawns[0]["x"]), float(spawns[0]["y"]))
	# feet on the bottom middle of the spawn tile
	player.position = to_px(pos.x + 0.5, pos.y + (0.5 if perspective == "isometric" else 0.9))
	add_character(player)
	var cam := Camera2D.new()
	cam.zoom = Vector2(player_camera_zoom, player_camera_zoom)
	cam.position_smoothing_enabled = true
	player.add_child(cam)


# ------------------------------------------------------------------ side-scroller

## One-way platforms, ladders (group "ladder"), hazards (group "hazard") and the goal.
func build_side(data: Dictionary) -> void:
	var side: Dictionary = data.get("side", {})
	var root := Node2D.new()
	root.name = "SideScroller"
	add_child(root)
	for pl in side.get("platforms", []):
		var body := StaticBody2D.new()
		body.name = "Platform"
		var shape := CollisionShape2D.new()
		var rect := RectangleShape2D.new()
		rect.size = Vector2(float(pl["w"]) * tile_size, 4.0)
		shape.shape = rect
		shape.one_way_collision = true
		shape.position = Vector2((float(pl["x"]) + float(pl["w"]) / 2.0) * tile_size, float(pl["y"]) * tile_size + 2.0)
		body.add_child(shape)
		root.add_child(body)
	for ld in side.get("ladders", []):
		var area := _area(root, "Ladder", float(ld["x"]) + 0.2, float(ld["y"]), 0.6, float(ld["h"]))
		area.add_to_group("ladder")
	for hz in side.get("hazards", []):
		var area := _area(root, "Hazard", float(hz["x"]) + 0.1, float(hz["y"]) + 0.3, float(hz["w"]) - 0.2, float(hz["h"]) - 0.3)
		area.add_to_group("hazard")
		area.body_entered.connect(_on_hazard)
	for lf in side.get("lifts", []):
		_build_lift(root, lf)
	var goal = side.get("goal", null)
	if goal != null:
		var area := _area(root, "Goal", float(goal[0]) - 0.5, float(goal[1]) - 1.0, 2.0, 2.0)
		area.add_to_group("goal")
		area.body_entered.connect(_on_goal)


## A lift: its tiles move from the map into an AnimatableBody2D that goes up and down (group "lift").
func _build_lift(parent: Node, lf: Dictionary) -> void:
	var x := int(lf["x"])
	var w := int(lf["w"])
	var top := int(lf["top"])
	var bottom := int(lf["bottom"])
	var body := AnimatableBody2D.new()
	body.name = "Lift"
	body.add_to_group("lift")
	parent.add_child(body)
	var tiles := TileMapLayer.new()
	tiles.name = "Tiles"
	tiles.tile_set = tile_set
	var src_layer: TileMapLayer = layer_nodes.get("ObjectsBack", null)
	if src_layer:
		for c in range(x, x + w):
			var cell := Vector2i(c, bottom)
			var sid := src_layer.get_cell_source_id(cell)
			if sid >= 0:
				tiles.set_cell(cell, sid, src_layer.get_cell_atlas_coords(cell), src_layer.get_cell_alternative_tile(cell))
				src_layer.erase_cell(cell)
	body.add_child(tiles)
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(w * tile_size, 6.0)
	shape.shape = rect
	shape.one_way_collision = true
	shape.position = Vector2((x + w / 2.0) * tile_size, bottom * tile_size + 3.0)
	body.add_child(shape)
	var dist := float(bottom - top) * tile_size
	var travel := float(bottom - top) / float(lf.get("speed", 3.0))
	var pause := float(lf.get("pause", 1.0))
	var tw := create_tween().set_loops()
	tw.set_process_mode(Tween.TWEEN_PROCESS_PHYSICS)
	tw.tween_interval(pause)
	tw.tween_property(body, "position:y", -dist, travel)
	tw.tween_interval(pause)
	tw.tween_property(body, "position:y", 0.0, travel)


func _area(parent: Node, area_name: String, x: float, y: float, w: float, h: float) -> Area2D:
	var area := Area2D.new()
	area.name = area_name
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(w * tile_size, h * tile_size)
	shape.shape = rect
	shape.position = Vector2((x + w / 2.0) * tile_size, (y + h / 2.0) * tile_size)
	area.add_child(shape)
	parent.add_child(area)
	return area


func _on_hazard(body: Node) -> void:
	if body.has_method("hazard_hit"):
		body.call("hazard_hit")
	elif body.has_method("hurt"):
		body.call("hurt", 1)


func _on_goal(body: Node) -> void:
	if body.is_in_group("player"):
		print("MapForge: goal reached")
		goal_reached.emit(body)


## same jump / speed as the MapForge playtest, camera kept inside the level
func _setup_side_player() -> void:
	var side: Dictionary = map_data.get("side", {})
	var phys: Dictionary = side.get("physics", {})
	for key in ["gravity", "jump_velocity", "run_speed", "speed", "fall_limit"]:
		var value = null
		match key:
			"gravity": value = phys.get("gravity", null)
			"jump_velocity": value = phys.get("jumpVelocity", null)
			"run_speed": value = phys.get("runSpeed", null)
			"speed": value = phys.get("walkSpeed", null)
			"fall_limit": value = side.get("fallLimit", null)
		if value != null and key in player:
			player.set(key, float(value))
	var info: Dictionary = map_data.get("map", {})
	for c in player.get_children():
		if c is Camera2D:
			c.limit_left = 0
			c.limit_top = 0
			c.limit_right = int(info.get("width", 0)) * tile_size
			c.limit_bottom = int(info.get("height", 0)) * tile_size


# ------------------------------------------------------------------ hex maps

## Camera (arrows / WASD, wheel = zoom, right or middle mouse = drag), click = hex_clicked, pathfinding.
func build_hex(data: Dictionary) -> void:
	var info: Dictionary = data.get("map", {})
	var w := int(info.get("width", 0))
	var h := int(info.get("height", 0))
	var hex: Dictionary = data.get("hex", {})
	_hex_terrain = rle_decode(hex.get("terrain", []), w * h)
	_hex_rivers = rle_decode(hex.get("rivers", []), w * h)
	_hex_roads = rle_decode(hex.get("roads", []), w * h)
	hex_astar = build_hex_astar()
	if player_scene == null:
		hex_camera = Camera2D.new()
		hex_camera.name = "HexCamera"
		hex_camera.position = Vector2((w + 0.5) * tile_size / 2.0, (h * 0.75 + 0.25) * tile_size / 2.0)
		hex_camera.zoom = Vector2(player_camera_zoom, player_camera_zoom) * 0.5
		add_child(hex_camera)
		hex_camera.make_current()


func _ground() -> TileMapLayer:
	return layer_nodes.get("Ground", null)


## terrain name of a hex ("grass", "forest", "mountain", "water" …)
func terrain_at(cell: Vector2i) -> String:
	var w := int(map_data.get("map", {}).get("width", 0))
	var i := cell.y * w + cell.x
	if cell.x < 0 or cell.y < 0 or i >= _hex_terrain.size():
		return ""
	return str(map_data.get("hex", {}).get("terrainLegend", {}).get(str(_hex_terrain[i]), ""))


## movement cost of a hex (-1 = not walkable); roads make it cheaper
func move_cost(cell: Vector2i) -> float:
	var c := float(map_data.get("hex", {}).get("costs", {}).get(terrain_at(cell), -1))
	var w := int(map_data.get("map", {}).get("width", 0))
	if c > 0 and _hex_roads.size() > cell.y * w + cell.x and _hex_roads[cell.y * w + cell.x] != 0:
		c = 0.5
	return c


func hex_info(cell: Vector2i) -> Dictionary:
	var w := int(map_data.get("map", {}).get("width", 0))
	var i := cell.y * w + cell.x
	var town := ""
	for s in map_data.get("hex", {}).get("settlements", []):
		if int(s["x"]) == cell.x and int(s["y"]) == cell.y:
			town = str(s.get("kind", ""))
	return {
		"cell": cell,
		"terrain": terrain_at(cell),
		"cost": move_cost(cell),
		"river": i >= 0 and i < _hex_rivers.size() and _hex_rivers[i] != 0,
		"road": i >= 0 and i < _hex_roads.size() and _hex_roads[i] != 0,
		"settlement": town,
	}


## AStar2D over all walkable hexes (weight = movement cost), neighbours from the hex TileMapLayer
func build_hex_astar() -> AStar2D:
	var astar := AStar2D.new()
	var ground := _ground()
	if ground == null:
		return astar
	var info: Dictionary = map_data.get("map", {})
	var w := int(info.get("width", 0))
	var h := int(info.get("height", 0))
	for y in range(h):
		for x in range(w):
			var cell := Vector2i(x, y)
			var cost := move_cost(cell)
			if cost > 0:
				astar.add_point(y * w + x, ground.map_to_local(cell), cost)
	for id in astar.get_point_ids():
		var cell := Vector2i(id % w, id / w)
		for n in ground.get_surrounding_cells(cell):
			var nid := n.y * w + n.x
			if n.x >= 0 and n.y >= 0 and n.x < w and n.y < h and astar.has_point(nid) and not astar.are_points_connected(id, nid):
				astar.connect_points(id, nid)
	return astar


## cheapest way from one hex to another (list of cells, empty = no way)
func hex_path(from: Vector2i, to: Vector2i) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	var w := int(map_data.get("map", {}).get("width", 0))
	if hex_astar == null or not hex_astar.has_point(from.y * w + from.x) or not hex_astar.has_point(to.y * w + to.x):
		return out
	for id in hex_astar.get_id_path(from.y * w + from.x, to.y * w + to.x):
		out.append(Vector2i(id % w, id / w))
	return out


func _process(delta: float) -> void:
	if hex_camera == null:
		return
	var v := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	hex_camera.position += v * 600.0 * delta / hex_camera.zoom.x


func _unhandled_input(event: InputEvent) -> void:
	if hex_camera == null:
		return
	if event is InputEventMouseButton and event.pressed:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP:
			hex_camera.zoom = (hex_camera.zoom * 1.1).clamp(Vector2(0.2, 0.2), Vector2(8, 8))
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			hex_camera.zoom = (hex_camera.zoom / 1.1).clamp(Vector2(0.2, 0.2), Vector2(8, 8))
		elif mb.button_index == MOUSE_BUTTON_LEFT and _ground():
			var cell := _ground().local_to_map(_ground().get_local_mouse_position())
			var info := hex_info(cell)
			print("MapForge hex ", cell, ": ", info)
			hex_clicked.emit(cell, info)
	elif event is InputEventMouseMotion:
		var mm := event as InputEventMouseMotion
		if mm.button_mask & (MOUSE_BUTTON_MASK_RIGHT | MOUSE_BUTTON_MASK_MIDDLE):
			hex_camera.position -= mm.relative / hex_camera.zoom.x


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
`;

export const GODOT_README = `# MapForge → Godot 4

Contents
- map.json              map data: layers (tiles), objects, collisions, navigation, rooms, connections, spawn points
- tilesets/*.png        tileset images, re-sampled to the map tile size
- objects.png           object sprites (trees, pillars, rocks, arches …), same scale
- mapforge_loader.gd    loader script (Godot 4.3+, TileMapLayer)
- tileset.tres          ready TileSet: all tiles, y-sort origins, custom data "category" / "role", collision,
                        terrains „Wände“ (walls) and „Boden (Seitenansicht)“ for painting on in TileMap → Terrains
- Map.tscn              ready scene: every layer is a TileMapLayer with its tiles, objects are Sprite2D
                        nodes with collision – visible and editable in the editor, just run it
- player/               your own character from MapForge (only if set as player)

Schritte / Steps
1. Diesen Ordner irgendwo in dein Godot-Projekt ziehen (Drag & Drop in den FileSystem-Dock).
   Copy this folder anywhere into your project.
2. Map.tscn öffnen und starten (F6). Open Map.tscn and run it (F6).
3. Fertig. Ist in MapForge eine eigene Spielfigur gesetzt, liegt sie in player/ und steht am
   Startpunkt, die Kamera folgt ihr (Pfeiltasten). Done – with your own player if one was set.

Map.tscn ist fertig gebaut: Kacheln und Objekte kannst du direkt im Godot-Editor ansehen und ändern
(TileMapLayer auswählen → unten „TileMap“ zum Malen). Das angehängte Script (baked = true) ergänzt beim
Start nur Spielfigur, Spawn-Marker, AStar, Side-Scroller-Plattformen/Leitern/Aufzüge und Hex-Helfer aus map.json.
Map.tscn is fully built: tiles and objects are editable in the editor; the loader (baked = true) only adds
the runtime parts from map.json.

Eigene Szene ohne fertige Kacheln: Node2D + mapforge_loader.gd – baut alles beim Start aus map.json.
Own scene: Node2D + mapforge_loader.gd – builds everything from map.json at runtime.

Y-sort
- Layers with "ySort": true (ObjectsBack, WallsFront), all objects and the node
  "World/Characters" live in one Node2D with y_sort_enabled.
- Add your player with add_character(player): it is then drawn behind trees,
  pillars, wall fronts and cliffs when it stands above their base line and in
  front of them when it stands below.
- Tall tiles carry TileData.y_sort_origin, objects are positioned at their base line.

Isometrisch (Rautenansicht)
- Map.tscn und tileset.tres nutzen Godots Rautenraster (TILE_SHAPE_ISOMETRIC, DIAMOND_DOWN,
  Tile 2T × T) – genau wie in MapForge: Böden als Rauten, Wände als Blöcke, Objekte aufrecht,
  alles im y-sortierten Node "World". Kollision: Rauten auf dem Kollisions-Layer und an Objekten.
- Positionen: to_px(x, y) rechnet Feld → Pixel (Feldmitte = to_px(x + 0.5, y + 0.5)),
  AStarGrid2D läuft im Rautenraster (CELL_SHAPE_ISOMETRIC_DOWN).
- Die Rautenbilder liegen unter tilesets/*_iso_*.png. Bitte Map.tscn öffnen – aus map.json allein
  baut der Loader die Karte quadratisch.

Hex-Karten (Hexagonal)
- TileSet im Hexagon-Modus (jede zweite Reihe versetzt). Kamera: Pfeiltasten/WASD, Mausrad = Zoom,
  rechte/mittlere Maustaste = ziehen. Klick auf ein Feld → Signal hex_clicked(cell, info).
- terrain_at(cell), move_cost(cell), hex_info(cell), hex_path(von, nach) (AStar2D über die
  Bewegungskosten, Straßen sind günstig, Wasser nicht begehbar).

Side-Scroller (Seitenansicht)
- Aufzüge fahren als AnimatableBody2D (Gruppe "lift") zwischen unten und oben, Tempo und Pause wie in MapForge.
- Plattformen sind Einweg-Plattformen (von unten durchspringen), Leitern sind Area2D in der
  Gruppe "ladder", Stacheln/Wasser/Lava sind Area2D "hazard" (ruft hazard_hit() / hurt() auf).
- Die Spielfigur bekommt die Platformer-Steuerung mit denselben Sprungwerten wie in MapForge:
  ← → laufen, Shift rennt, ↑/Leertaste springt (lang drücken = höher), ↑/↓ an Leitern klettern,
  ↓ + Springen fällt durch Plattformen, J/X greift an.
- Signal goal_reached(body) am Loader, wenn die Figur das Ziel erreicht.

Collision & navigation
- The Collision layer gets full-tile collision polygons (hidden by default).
- Objects get StaticBody2D shapes on their base cells.
- use_collision_rects = true additionally builds merged rectangles.
- build_astar() returns an AStarGrid2D from the navigation grid.
`;
