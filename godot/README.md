# MapForge → Godot 4

Contents
- map.json              map data (layers, tiles, rooms, connections, spawn points)
- tilesets/*.png        tileset images, re-sampled to the map tile size
- mapforge_loader.gd    loader script (Godot 4.3+, TileMapLayer)

Steps
1. Copy this folder into your project as res://mapforge/
2. Create a scene with a Node2D and attach mapforge_loader.gd
3. Keep map_json_path = res://mapforge/map.json and run the scene

The loader creates one TileMapLayer per MapForge layer, a TileSet with one
TileSetAtlasSource per tileset, a "category" custom-data layer, full-tile
collision for everything on the "Kollision" layer and Marker2D nodes for
spawn points.

Tile reference per cell: tileset (id), tile (local index), atlas [x, y].
atlas coordinates are the ones passed to TileMapLayer.set_cell().
