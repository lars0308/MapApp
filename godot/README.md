# MapForge → Godot 4

Contents
- map.json              map data: layers (tiles), objects, collisions, navigation, rooms, connections, spawn points
- tilesets/*.png        tileset images, re-sampled to the map tile size
- objects.png           object sprites (trees, pillars, rocks, arches …), same scale
- mapforge_loader.gd    loader script (Godot 4.3+, TileMapLayer)

Steps
1. Copy this folder into your project as res://mapforge/
2. Create a scene with a Node2D and attach mapforge_loader.gd
3. Keep map_json_path = res://mapforge/map.json and run the scene

Y-sort
- Layers with "ySort": true (ObjectsBack, WallsFront), all objects and the node
  "World/Characters" live in one Node2D with y_sort_enabled.
- Add your player with add_character(player): it is then drawn behind trees,
  pillars, wall fronts and cliffs when it stands above their base line and in
  front of them when it stands below.
- Tall tiles carry TileData.y_sort_origin, objects are positioned at their base line.

Collision & navigation
- The Collision layer gets full-tile collision polygons (hidden by default).
- Objects get StaticBody2D shapes on their base cells.
- use_collision_rects = true additionally builds merged rectangles.
- build_astar() returns an AStarGrid2D from the navigation grid.
