# MapForge

Prozeduraler 2D-Map-Builder und Tile-Editor für Pixelart-Spiele – direkt im Browser, auf dem Handy wie am Desktop, mit editierbarem Export nach Godot 4.

- Setup-Assistent in 8 Schritten (Perspektive → Map → Räume → Wege → Spezialräume → Gelände → Ausstattung → Zusammenfassung)
- Drei Perspektiven mit eigenen Tile-Rollen: Top-Down, Low Top-Down (3/4 mit Wandfronten und erhöhten Seitenwänden), 45° / Isometric-like
- Dungeon-Generierung aus Räumen, Gängen, Wänden, Türen und Spezialräumen (Seed-basiert, reproduzierbar)
- Gelände: Wasser, Lava, Abgründe mit Inseln, Klippen/Plateaus mit Treppen, Brücken, Übergangsflächen – der Startraum und alle Pflichtwege bleiben immer erreichbar
- Wand-Autotiling aus der 8er-Nachbarschaft (23 Wandrollen inkl. Innenecken, Endstücke, T-Kreuzungen), Türrahmen, saubere Gangmündungen – auch beim manuellen Malen (Auto-Wände)
- Objekte (Baum, Säule, Fels, Torbogen, Truhe, Händler) mit Y-Sortierung und Overhead-Teilen
- **Playtest**: Testfigur mit WASD / Pfeiltasten oder Touch-Joystick, Kollision mit Wänden, Abgründen und Objekten, läuft über Brücken und durch Türen
- Canvas-Editor mit Pinsel, Radierer, Füllen, Rechteck, Pipette, Auswahl, Verschieben, Hand, Undo/Redo
- Layer-System (13 Standard-Layer), eigene PNG-Tilesets, Tile-Rollen, Kategorien, Tags, Gewichtungen, Kollision
- Terrain-Sets (Stein, Holz, Sand … frei definierbar), Room Graph mit Terrain, Brücken und blockierten Wegen
- Speichern in IndexedDB, Projektdatei (`.mapforge.json`), Export als JSON, PNG und Godot-Paket
- Touch-Bedienung (1 Finger malen, 2 Finger verschieben/zoomen), installierbar als PWA

Kein Backend, keine Anmeldung. Die App ist nach dem Build eine statische Seite.

---

## Schnellstart (lokal)

Voraussetzung: Node.js 20.19+ oder 22.12+

```bash
npm install
npm run dev        # Entwicklungsserver, auch im lokalen Netzwerk erreichbar (--host)
```

Die Konsole zeigt eine `Network`-Adresse (z. B. `http://192.168.0.23:5173`). Diese Adresse im selben WLAN auf dem Android-Handy öffnen.

```bash
npm run build      # Typecheck + Produktions-Build nach dist/
npm run preview    # Produktions-Build lokal testen
```

## Deployment auf Vercel

**Variante A – über GitHub (empfohlen)**

1. Auf [vercel.com](https://vercel.com) einloggen → **Add New… → Project**.
2. Das GitHub-Repository `MapApp` importieren.
3. Vercel erkennt Vite automatisch (Einstellungen sind zusätzlich in `vercel.json` hinterlegt):
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. **Deploy** klicken. Nach ca. einer Minute gibt es einen Link wie `https://mapapp-xyz.vercel.app`.
5. Den Link auf dem Handy öffnen. Jeder Push auf den Branch erzeugt automatisch ein neues Deployment (Preview-Links für Branches, Production-Link für den Hauptbranch).

**Variante B – per CLI**

```bash
npm i -g vercel
vercel          # Preview-Deployment
vercel --prod   # Production-Deployment
```

**Als App installieren (Android):** Link in Chrome öffnen → Menü ⋮ → **App installieren** bzw. **Zum Startbildschirm hinzufügen**. Die App startet dann im Vollbild und funktioniert nach dem ersten Laden auch offline.

---

## Neues Projekt: Setup-Assistent

Beim ersten Start und bei **Neues Projekt** (Desktop: Kopfzeile oder Projekt & Export; Handy: **+** oben) öffnet sich ein Assistent. Erst **Map erstellen** im letzten Schritt generiert die Map und öffnet den Editor.

| Schritt | Inhalt |
| --- | --- |
| 1 Perspektive | Top-Down, Low Top-Down oder 45° (mit Vorschaubild), Schatten an/aus |
| 2 Map | Breite, Höhe, Tilegröße (16/32/48/64/frei) inkl. Pixelgröße, Seed |
| 3 Räume | Anzahl, Min/Max-Größen, Abstand, Raumformen, Regelmäßigkeit |
| 4 Wege | Gangbreite (Standard/Min/Max), Optionen, Verwinkelung, Direktheit, Vernetzung |
| 5 Spezialräume | Start, Ende, Boss, Schatz, Händler, Quest, Arena, Geheimraum, Rätsel |
| 6 Gelände | Terrain-Sets für Räume, Wasser, Lava, Abgründe (Anteil, Min/Max-Größe, Inseln, Brücken, in/zwischen Räumen), Klippen, Brücken, Übergänge |
| 7 Ausstattung | Boden-Varianten, Deko, Hindernisse, Bäume, Felsen, Torbögen, Säulen – oder **Später konfigurieren** |
| 8 Zusammenfassung | Projektname, alle Werte auf einen Blick, **MAP ERSTELLEN** |

Sind mehr Spezialräume aktiv, als Räume existieren, erscheint „Für diese Auswahl werden mindestens N Räume benötigt“ mit einem Button zum Erhöhen. Wird trotzdem erstellt, erhöht die App die Raumanzahl automatisch und meldet das. Alle Einstellungen des Assistenten werden im Projekt gespeichert und bleiben im Generator-Panel änderbar. Schließen des Assistenten ändert das aktuelle Projekt nicht (beim allerersten Start wird dann eine Demo-Map erzeugt).

## Perspektiven

Die Map bleibt ein orthogonales 2D-Raster. Die Perspektive bestimmt, **welche Tile-Rollen** der Generator einsetzt – sie ist keine Verzerrung derselben Map:

| Perspektive | Wandlogik |
| --- | --- |
| `top_down` | Wände als flache Kanten mit Rollen aus der Nachbarschaft (`wall_top`, `corner_*`, `inner_corner_*` …) |
| `low_top_down` | Wand über einem Raum = Oberkante (`wall_top`) + **Wandfront** (`wall_front`, 1 Reihe); Seitenwände sind erhöht (Oberkante + sichtbare Innenseite), Ecken gehen in die Fronten über; Schatten unter Fronten |
| `isometric_45` | Wandfront 2 Reihen hoch (`wall_front` + `wall_front_upper`), Seitenwände mit sichtbarer Fläche, Schatten auch seitlich |

Die Perspektive steht im Projekt, in der Projektdatei und im Export (`map.perspective`). Tilesets lassen sich Perspektiven zuordnen (Tiles → Tilesets); der Generator nutzt nur passende, aktive Tilesets. Mitgeliefert: „Demo Wände Top-Down“, „Demo Wände 3/4“ (Low Top-Down + 45°) und „Demo Gelände“.

### Wand-Autotiling

`generator/autotile.ts` klassifiziert jede Wandzelle aus ihrer 8er-Nachbarschaft:

| Rollen | Regel |
| --- | --- |
| `wall_horizontal`, `wall_vertical`, `wall_top`, `wall_bottom`, `wall_left`, `wall_right` | gerade Stücke, je nachdem auf welcher Seite Boden liegt |
| `corner_top_left/…` | Außenecken (Raumecke von außen) |
| `inner_corner_top_left/…` | Innenecken (Boden auf beiden offenen Seiten) |
| `end_cap_top/bottom/left/right` | freistehende Wandenden |
| `junction_t_up/down/left/right`, `junction_cross` | T- und Kreuzungsstücke |
| `door`, `door_frame_left/right` | Türen passen die Nachbarwände an (Rahmen statt Wand) |

Gangmündungen werden geschlossen gezogen (keine offenen Kanten, keine Löcher). Mit **Auto-Wände** (Einstellungen, standardmäßig an) wird das auch beim manuellen Bearbeiten ausgeführt: Boden in eine Wand malen erweitert den Raum und setzt die Wände neu, Boden radieren schließt die Lücke, eine Tür auf eine Wand öffnet sie. Alles in einem Undo-Schritt.

## Gelände

| Gelände | Verhalten | Rollen |
| --- | --- | --- |
| Normaler Boden | immer; Material aus den aktiven Terrain-Sets | `floor_center`, `floor_edge_*`, `floor_corner` |
| Wasser / Lava | nicht begehbar, Brücken möglich | `water`, `lava` |
| Abgrund | nicht begehbar; Größe min/max, Inseln, Brücken, in Räumen und/oder als Schlucht zwischen Räumen | `abyss`, `abyss_edge` |
| Klippe / erhöhte Fläche | Plateau mit Kante und Treppe | `cliff_top/front/left/right/inner_corner/outer_corner/bottom/shadow`, `raised_floor`, `stairs` |
| Brücke | begehbar über Wasser, Lava, Abgrund | `bridge_start/middle/end/left/right` |
| Übergang | Übergangsflächen an Raumeingängen und Terrain-Grenzen | `transition` |

Jeder Gelände-Schritt wird per Erreichbarkeitsprüfung (BFS) validiert: Würde ein Abgrund oder Plateau den Start oder einen Pflichtweg abschneiden, setzt der Generator eine Brücke bzw. Treppe oder verwirft die Platzierung. Klippen werden wie Wände Y-sortiert: Eine Figur oberhalb der Klippenfront steht dahinter, unterhalb davor.

**Terrain-Sets** (Terrain-Panel bzw. Assistent Schritt 6): Name, Tile-Tag, Farbe, Gewichtung, aktiv. Räume bekommen gewichtet ein Terrain (z. B. Stein 70 / Holz 20); der Generator nimmt Boden-Tiles mit diesem Tag. Terrain-Sets werden im Projekt gespeichert und exportiert.

## Y-Sort, Layer und Verdeckung

Standard-Layer (unten → oben): Boden · Bodendetails · Wege · Deko · Schatten · Wände hinten · **Objekte hinten (Y)** · **Wände vorne (Y)** · Objekte vorne · Overhead · Kollision · Gameplay · Spawnpunkte. Godot-Namen: `Ground, GroundDetails, Paths, Decoration, Shadows, WallsBack, ObjectsBack, WallsFront, ObjectsFront, Overhead, Collision, Gameplay, SpawnPoints`.

- Layer mit **Y** (im Layer-Panel umschaltbar) werden gemeinsam mit Objekten und Testfigur nach ihrem Fußpunkt sortiert (`sortOriginY` = Unterkante der Basiszeile, Tiles können einen Sortier-Offset haben).
- Baumkronen und Torbogen-Balken liegen als Overhead-Teil über Figuren; der Stamm bzw. die Säulen sortieren normal.
- Einstellungen → „Sortierpunkte anzeigen“ zeigt die Y-Sort-Ursprünge, „Kollisionen anzeigen“ markiert nicht begehbare Felder.

## Kollision

Automatisch blockierend: Wände, Wandfronten, Klippen, Wasser/Lava/Abgrund (außer unter Brücken), Hindernisse, Säulen, Baumstämme, Felsen. Nicht blockierend: Boden, Wege, Schatten, kleine Deko, Treppen, Türen, Brücken. Pro Tile lässt sich im Tile-Inspektor **Kollision** auf *auto / ja / nein* setzen; der Kollision-Layer kann zusätzlich Felder sperren. Dieselbe Kollisionsberechnung nutzt der Playtest, das Overlay und der Export.

## Playtest

**Testen** (Desktop in der Kopfzeile, Handy ▶ oben) setzt eine einfache Testfigur auf den Spieler-Spawn bzw. in den Startraum.

- Desktop: WASD oder Pfeiltasten, Esc oder **Playtest beenden** beendet.
- Handy: virtueller Joystick unten links, **Playtest beenden** oben; Werkzeuge, Panels und Navigation sind währenddessen ausgeblendet.
- Die Figur kollidiert mit Wänden, Klippen, Abgründen, Wasser/Lava und Objekten, läuft über Brücken und durch Türen und wird korrekt Y-sortiert (vor/hinter Bäumen, Säulen, Torbögen, Wandfronten). Die Kamera folgt.
- Änderungen an der Map während des Tests (z. B. neu generieren) werden sofort berücksichtigt.

Testfigur, Joystick, Test-UI und Debug-Overlays gehören nur zum Editor: Sie werden **nicht** im Projekt gespeichert und **nicht** exportiert.

## Bedienung

| Aktion | Handy / Tablet | Desktop |
| --- | --- | --- |
| Malen / Werkzeug anwenden | 1 Finger | Linke Maustaste |
| Map verschieben | 2 Finger oder Hand-Werkzeug | Mittlere/rechte Maustaste, Leertaste + Ziehen, Hand (H) |
| Zoomen | Pinch | Mausrad |
| Rückgängig / Wiederholen | Buttons oben | Strg+Z / Strg+Umschalt+Z (Strg+Y) |
| Werkzeuge | Leiste unten | B, E, F, R, I, M, V (Verschieben), H |
| Playtest | ▶ oben, Joystick | Testen, WASD / Pfeiltasten, Esc |
| Raster / Einpassen | Buttons rechts oben | G / 0 |
| Speichern | Export → Speichern | Strg+S (zusätzlich Auto-Speichern) |
| Generieren | GENERIEREN | Umschalt+Enter |

Handy-Navigation: **Map · Generator · Terrain · Tiles · Layer · Export**, Einstellungen über das Zahnrad rechts oben. Panels öffnen sich als Bottom Sheet mit drei Zuständen:

- **eingeklappt** – nur Kopfzeile, Map fast vollständig sichtbar
- **halb geöffnet** – Map verkleinert sich darüber und bleibt sichtbar
- **vollständig geöffnet** – Panel reicht fast bis oben; die Map dahinter ist abgedunkelt und gesperrt

Griff oder Kopfzeile nach oben/unten wischen (ganz nach unten = schließen), Kopfzeile antippen oder ⌃-Button = vollständig öffnen, ✕ = schließen. Der Inhalt scrollt, der Kopfbereich bleibt fixiert. Im Querformat werden Navigation und Panels seitlich angeordnet. Alle Slider haben ein editierbares Zahlenfeld.

**Seeds:** `GENERIEREN` nutzt den aktuellen Seed – gleicher Seed + gleiche Einstellungen = exakt dieselbe Map. `Neuer Seed` würfelt und generiert sofort. Seeds dürfen Zahlen oder beliebiger Text sein.

**Objekte & Verschieben:** Tiles → Objekte → Objekt antippen, dann auf die Map tippen. Der Radierer entfernt Objekte, das Werkzeug **Verschieben** zieht Objekte oder eine Auswahl an eine neue Position.

**Eigene Tilesets:** Tiles → Tilesets → *PNG-Tileset hochladen*. Tilegröße (16/32/48/64 oder frei) wählen, dann in der Palette Tiles antippen und Rolle (z. B. `wall_front`, `bridge_middle`), Kategorie, Gewichtung, Tags, Kollision und Sortier-Offset setzen. Mit *Mehrfachauswahl* lassen sich viele Tiles auf einmal kategorisieren. Filtert man die Palette nach einer Kategorie, erscheinen Gewichtungs-Slider samt Prozentanteil. Der Generator nutzt alle *aktiven* Tilesets.

---

## Export

| Format | Inhalt |
| --- | --- |
| **Projektdatei** `.mapforge.json` | Alles: Einstellungen, Seed, Tilesets (als PNG eingebettet), Kategorien, Layer, Map, Räume, Wege. Über *Import* wieder vollständig ladbar. |
| **JSON** `.map.json` | Godot-orientierte Map-Daten, Tileset-PNGs als Base64 eingebettet (eine Datei reicht). |
| **Godot-Paket** `.zip` | `map.json`, `tilesets/*.png`, `mapforge_loader.gd`, `README.md` |
| **GDScript** | Nur `mapforge_loader.gd` |
| **PNG** | Alle sichtbaren Layer oder ein einzelner Layer, mit/ohne Raster, mit/ohne Hintergrund, 100/50/25 % |

### JSON-Struktur (gekürzt)

```json
{
  "version": 1, "formatRevision": 2, "format": "mapforge-godot",
  "map": { "name": "Dungeon", "width": 80, "height": 80, "tileSize": 32, "seed": "play-7", "perspective": "low_top_down", "shadows": true },
  "tilesets": [{ "id": "demo_walls_34", "sourceId": 2, "image": "tilesets/demo_walls_34.png", "tileSize": 32, "columns": 8, "rows": 5,
                 "perspectives": ["low_top_down", "isometric_45"],
                 "tiles": [{ "id": 9, "atlas": [1, 1], "role": "wall_front", "category": "wallFront", "tags": ["base"], "weight": 50, "collision": true, "ySortOrigin": 0 }] }],
  "terrains": [{ "id": "stone", "name": "Stein", "tag": "stone", "weight": 70, "active": true }],
  "layers": [{ "name": "WallsFront", "label": "Wände vorne", "role": "wallsFront", "order": 7, "ySort": true,
               "tiles": [{ "tilesetId": "demo_walls_34", "tileId": 9, "sourceId": 2, "atlasCoordinates": [1, 1], "x": 12, "y": 7,
                           "layer": "WallsFront", "terrainType": "stone", "collision": true, "ySortEnabled": true, "sortOriginY": 7 }] }],
  "objects": [{ "id": "tree_1", "type": "tree", "x": 59, "y": 10, "width": 2, "height": 3,
                "sprite": { "image": "objects.png", "region": [0, 0, 64, 96], "overheadRows": 2 },
                "collision": [{ "x": 59, "y": 10 }], "sortOriginY": 10, "sortOriginPx": 352, "ySortEnabled": true }],
  "rooms": [{ "id": 0, "type": "start", "x": 10, "y": 5, "width": 12, "height": 9, "center": [16, 9], "terrain": "stone",
              "connectedRooms": [3], "doors": [{ "x": 22, "y": 9 }], "start": true, "boss": false }],
  "connections": [{ "id": 0, "fromRoom": 0, "toRoom": 3, "type": "main", "width": 2, "path": [[23, 9], [24, 9]], "door": true, "bridge": false }],
  "collisions": { "encoding": "rle", "cells": [], "rects": [{ "x": 0, "y": 0, "w": 4, "h": 1 }] },
  "navigation": { "cellSize": 32, "encoding": "rle", "walkable": [], "heights": [] },
  "ySort": { "container": "World", "sortedLayers": ["ObjectsBack", "WallsFront"], "charactersNode": "World/Characters" },
  "spawnPoints": [{ "id": "player_0", "type": "player", "x": 15, "y": 9, "roomId": 0, "properties": {} }],
  "structure": { "encoding": "rle", "cells": [], "terrain": [], "wallMask": [], "floorMask": [] }
}
```

- Tileset-Bilder werden auf die Map-Tilegröße skaliert: `TileSet.tile_size == texture_region_size == map.tileSize`. Nur Tilesets, die auf der Map benutzt werden (plus eigene Uploads), werden exportiert.
- `sourceId` + `atlasCoordinates` passen direkt zu `TileMapLayer.set_cell(Vector2i(x, y), sourceId, atlasCoordinates)`.
- `collisions.rects` sind zu Rechtecken zusammengefasste blockierte Felder (für `CollisionShape2D`), `navigation.walkable` (1 = begehbar) ist für `AStarGrid2D` oder eine `NavigationPolygon`.
- RLE-Arrays sind Paare `[wert, anzahl, wert, anzahl, …]`.

### In Godot 4 verwenden (4.3+)

1. Godot-Paket entpacken und nach `res://mapforge/` kopieren.
2. Szene mit einem `Node2D` anlegen, `mapforge_loader.gd` anhängen.
3. `map_json_path` auf `res://mapforge/map.json` lassen und starten.

Das Script baut:

- ein `TileSet` mit einer `TileSetAtlasSource` pro Tileset, Custom-Data-Layern `category` und `role` und `TileData.y_sort_origin`,
- pro MapForge-Layer einen `TileMapLayer` – nicht sortierte Layer direkt unter dem Loader, Y-sortierte Layer (`ObjectsBack`, `WallsFront`) in einem `World`-Node mit `y_sort_enabled`,
- Objekte als `Node2D` (Ursprung = Fußpunkt) mit `Sprite2D` und `StaticBody2D`, Overhead-Teile (Baumkronen, Bogen-Balken) in einem Node über der Welt,
- einen Node `World/Characters` für Spieler und NPCs (`add_character(node)`), damit die Sortierung wie in MapForge funktioniert,
- Kollision über Tile-Physik des Kollision-Layers oder optional zusammengefasste Rechtecke (`use_collision_rects`),
- ein `AStarGrid2D` (`astar`) aus `navigation.walkable`, `Marker2D` für Spawnpunkte, Helfer `get_room_by_type()` / `room_center_position()`.

Alles bleibt in Godot editierbar: Tiles sind Tiles, Layer sind eigene Nodes, Objekte sind Nodes. Das Script liegt auch im Repo unter `godot/mapforge_loader.gd`.

---

## Architektur

```
src/
  types/        Datenmodell (Project, Layer, Tileset, Room, GenerationResult …)
  generator/    Prozedurale Generierung – reine Funktionen, keine DOM-Abhängigkeit
    perspective.ts Perspektiven (Wandreihen, Seitenflächen), benötigte Raumanzahl
    autotile.ts   Wandrollen aus der 8er-Nachbarschaft, Fronten/Oberkanten, Schatten, Boden-Rand
    terrain.ts    Wasser, Lava, Abgründe, Inseln, Plateaus/Klippen, Brücken, Übergänge (mit Erreichbarkeitsprüfung)
    nav.ts        Begehbarkeit + BFS-Erreichbarkeit
    objectsGen.ts Platzierung von Bäumen, Felsen, Torbögen, Säulen, Truhe, Händler
    rng.ts        deterministischer Zufall (mulberry32), Seed-Hashing
    shapes.ts     Raumformen (Rechteck, L, T, Kreuz, unregelmäßig, Halle)
    rooms.ts      Platzierung + Verteilungsmodi, Überschneidungsschutz
    graph.ts      Raumgraph (Kette/MST + Schleifen + alternative Verbindungen)
    corridors.ts  A*-Gänge mit Rausch-/Kurvenkosten, L/Z-Gänge, Abzweigungen, Sackgassen
    specials.ts   Start/Ende (größte Graph-Distanz), Boss, Schatz …
    index.ts      Pipeline: Räume → Graph → Gänge → Spezialräume → Gelände → Wände → Türen → Objekte → Tiles
    presets.ts    Standardwerte und Presets
  renderer/     Canvas-Renderer (Chunk-Cache, Y-Sort-Pass, Overhead-Pass, Overlays), Testfigur, Room Graph
  editor/       Map-Canvas mit Pointer-/Touch-Gesten, Werkzeuge, Toolbar, Kollision, Auto-Wände
  objects/      Objekt-Definitionen (Größe, Kollision, Overhead-Zeilen) und Sprite-Atlas
  playtest/     Playtest-Controller (Eingabe, Kollision, Kamera) und Overlay mit Joystick – nur Editor
  tilesets/     Demo-Tilesets (prozedural gezeichnet), Rollen-Pools, Zuschnitt, Palette, Inspektor
  layers/       Standard-Layer, Layer-Panel
  export/       JSON/Godot, PNG, ZIP-Writer, GDScript
  persistence/  IndexedDB, Auto-Speichern, Projektdatei (RLE), Migration älterer Projekte
  store/        Zustand (zustand), Undo/Redo-History, Event-Kanäle Store → Renderer
  components/   Desktop-Layout, UI-Bausteine, Generator-, Terrain- und Einstellungs-Panel
    wizard/       Setup-Assistent + Perspektiv-Vorschauen
  mobile/       Mobile-Layout, Bottom Sheet
```

Wichtige Entscheidungen:

- **Layer-Daten** liegen als `Uint32Array` (eine globale Tile-ID pro Zelle, 0 = leer). Jedes Tileset besitzt einen eigenen ID-Bereich (`firstGid`, wie in Tiled). Malen verändert die Arrays direkt und meldet nur die geänderten Zellen an den Renderer.
- **Rendering** ausschließlich über Canvas 2D: beim Hineinzoomen werden nur sichtbare Tiles gezeichnet, beim Herauszoomen gecachte 16×16-Chunks – auch 256×256-Maps bleiben flüssig.
- **Undo/Redo**: Mal-Aktionen als Zell-Diffs über mehrere Layer (inkl. Auto-Wände und Strukturänderung), strukturelle Aktionen (Generieren, Layer, Resize, Objekte) als Snapshots, mit Speicherbudget.
- **Y-Sort-Rendering**: nicht sortierte Layer werden weiterhin gecacht; nur Y-Layer, Objekte und Figur werden pro Frame im sichtbaren Ausschnitt nach Fußpunkt sortiert.
- **Determinismus**: jeder Generator-Schritt hat einen eigenen, aus dem Seed abgeleiteten Zufallsstrom. Deko-Einstellungen ändern daher nicht das Layout.
- **Generator-Layer** besitzen eine Rolle (`floor`, `walls`, `objects` …). Beim Generieren werden nur diese Layer neu geschrieben; eigene/duplizierte Layer (`custom`) bleiben erhalten.

## Bekannte Einschränkungen

- 45° / Isometric-like ist kein echtes isometrisches Rautenraster, sondern ein orthogonales Raster mit doppelt hohen Wandfronten und sichtbaren Seitenwänden. Ein Rautenraster (Godot `TILE_SHAPE_ISOMETRIC`) wäre eine spätere Erweiterung.
- Klippen und Plateaus sind Bildschirm-Höhe (eine Stufe), keine echten Höhenebenen; die Höhe steht in `navigation.heights`.
- Die Wandrollen sind regelbasiert; eigene Tilesets brauchen Tiles mit passender Rolle (fehlende Rollen fallen auf verwandte Rollen bzw. Kategorien zurück). Kein Export als Godot-Terrain-Set.
- Das Godot-Script ist gegen die Godot-4.3-API geschrieben, aber nicht automatisiert in Godot getestet (kein Godot in der Build-Umgebung).
- Objekte haben feste Sprites aus dem mitgelieferten Objekt-Atlas; eigene Objekt-Sprites sind noch nicht möglich.
- Der Playtest ist bewusst einfach (keine Physik-Engine, keine Gegner, keine Höhenwechsel-Animation).
- Spezialräume sind im Datensatz und im Room Graph markiert, haben aber noch keine Spielmechanik.
- Tilesets müssen quadratische Tiles ohne Abstand/Rand haben.
- Große PNG-Exporte sind durch Canvas-Limits des Browsers begrenzt (die App warnt und bietet kleinere Maßstäbe an).
- Generierung läuft im Haupt-Thread (80×80 ca. 40 ms, 256×256 mit 60 Räumen ca. 0,5–1 s).
- Kein direkter `.tscn`-Export – der Loader baut die Szene zur Laufzeit (oder per `build_now()` aus einem `@tool`-Script).

## Sinnvolle nächste Erweiterungen

- Export der Wandrollen als Godot-Terrain-Set (Peering Bits)
- Echtes isometrisches Raster für 45°, mehrere Höhenebenen
- Eigene Objekt-Sprites aus Tilesets
- Direkter `.tscn`/`.tres`-Export (TileSet-Ressource + Szene)
- Generator im Web Worker, Fortschrittsanzeige für sehr große Maps
- Auswahl kopieren/einfügen, Stempel aus mehreren Tiles
- Weitere Biome (Höhlen per Cellular Automata, Außenbereiche, Dörfer)
- Automatische Platzierung von Gegnern/Loot nach Raumtyp und Distanz zum Start
- Minimap, Layer-Deckkraft, Tile-Rotation/Spiegelung
- Tileset-Optionen für Rand/Abstand und nicht-quadratische Tiles

---

## Änderungen

**Version 1.2 – Godot-4-Map-Builder**

- Assistent mit 8 Schritten (neu: **Gelände**), überarbeitete Perspektiv-Vorschauen (Low Top-Down mit Oberkante, Wandfront, erhöhten Seitenwänden, Ecken, Schatten; 45° als echte Schrägansicht).
- Gelände-System: Wasser, Lava, Abgründe (Größe, Inseln, Brücken, in/zwischen Räumen), Klippen/Plateaus mit Treppe, Brücken, Übergänge; Erreichbarkeitsprüfung für Start und Pflichtwege. Terrain-Sets pro Raum.
- Wand-Autotiling aus der 8er-Nachbarschaft mit 23 Wandrollen, Türrahmen, geschlossene Gangmündungen; Auto-Wände beim manuellen Malen.
- 55 Tile-Rollen (`TILE_ROLES`) mit Fallbacks; Tile-Inspektor mit Rolle, Kollision und Sortier-Offset.
- Objekte (Baum, Säule, Fels, Torbogen, Truhe, Händler) mit Kollision, Y-Sort und Overhead; Werkzeug **Verschieben** für Objekte und Auswahl.
- Y-Sort-Rendering, neue Layer (Bodendetails, Wände vorne, Objekte vorne, Overhead), Y-Schalter pro Layer.
- Playtest mit Testfigur, WASD/Pfeiltasten, Touch-Joystick, Kollision, Kamera-Follow – nicht exportiert.
- Neue Panels **Terrain** und **Einstellungen** (Kollisions-Overlay, Sortierpunkte, Auto-Wände); mobile Navigation mit 6 Einträgen.
- Room Graph: Terrain-Ringe, Brücken, blockierte Verbindungen (Chips zum Ein-/Ausblenden).
- Godot-Export v2: vollständige Tile-Felder, Terrains, Objekte, Kollisions-Rechtecke, Navigation, Y-Sort-Konzept, Verbindungen mit Pfad/Tür/Brücke; GDScript mit `World`-Y-Sort-Container, Objekt-Nodes, `AStarGrid2D`.
- Migration älterer Projekte (Gelände-Einstellungen, neue Layer, Demo-Wand-Tilesets).

**Geänderte / neue Dateien (1.2)**

- Neu: `generator/terrain.ts`, `generator/nav.ts`, `generator/objectsGen.ts`, `tilesets/demoAutotiles.ts`, `objects/defs.ts`, `objects/ObjectThumb.tsx`, `editor/collision.ts`, `editor/autoWalls.ts`, `editor/rendererRef.ts`, `playtest/controller.ts`, `playtest/PlaytestOverlay.tsx`, `renderer/character.ts`, `components/TerrainFields.tsx`, `components/TerrainPanel.tsx`, `components/SettingsPanel.tsx`
- Überarbeitet: `types/index.ts`, `generator/index.ts`, `generator/autotile.ts`, `generator/corridors.ts`, `generator/presets.ts`, `tilesets/tilePools.ts`, `tilesets/TilesPanel.tsx`, `layers/defaults.ts`, `layers/LayersPanel.tsx`, `renderer/MapRenderer.ts`, `renderer/RoomGraph.tsx`, `renderer/tileAtlas.ts`, `editor/MapCanvas.tsx`, `editor/Toolbar.tsx`, `editor/tools.ts`, `store/projectStore.ts`, `store/editorStore.ts`, `store/history.ts`, `persistence/migrate.ts`, `persistence/projectFile.ts`, `export/godotJson.ts`, `export/godotScript.ts`, `export/actions.ts`, `components/wizard/SetupWizard.tsx`, `components/wizard/PerspectivePreview.tsx`, `components/GeneratorPanel.tsx`, `components/DesktopLayout.tsx`, `components/icons.tsx`, `mobile/MobileLayout.tsx`, `styles/index.css`, `main.tsx`, `godot/mapforge_loader.gd`, `godot/README.md`

**Version 1.1**

- Neues Projekt öffnet einen 7-stufigen Setup-Assistenten (Desktop: Dialog, Handy: Vollbild); die Map wird erst mit „Map erstellen“ generiert. Beim ersten Start erscheint der Assistent automatisch.
- Perspektive (`top_down`, `low_top_down`, `isometric_45`) im Datenmodell, im Projekt, in der Projektdatei, im JSON- und im Godot-Export; im Editor unter Generator → Map umschaltbar.
- Neue Tile-Rollen **Wandfront** und **Schatten**, neuer Layer **Schatten**, perspektivabhängige Wandlogik (`generator/autotile.ts`), Boden-Randmaske.
- Demo-Tileset erweitert (Wandfronten, Seitenwände, Schatten); flache Wandkanten für Top-Down.
- Tilesets können Perspektiven zugeordnet werden.
- Prüfung „mehr Spezialräume als Räume“ mit Button zum Erhöhen (Assistent + Generator-Panel) und Warnung, falls der Generator nicht alle vergeben kann.
- Lava / Wasser / Abgrund einzeln schaltbar.
- Mobile Bottom Sheets: eingeklappt / halb / vollständig, Wischgesten, Maximieren, Map im Vollbild blockiert.
- Slider mit editierbarem Zahlenfeld; Direktheit wird als „Direkt ↔ Umwege“ angezeigt.
- Ältere Projekte werden beim Öffnen/Importieren automatisch migriert (Top-Down, Schatten-Layer ergänzt).
