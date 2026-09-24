# MapForge → Godot 4

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
