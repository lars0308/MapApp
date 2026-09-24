# MapForge

Prozeduraler 2D-Map-Builder und Tile-Editor für Pixelart-Spiele – direkt im Browser, auf dem Handy wie am Desktop, mit editierbarem Export nach Godot 4.

- Setup-Assistent: Modus (automatisch / manuell) → Perspektive → **Tiles** (Bibliothek, Upload oder Demo) → Map → Generator-Einstellungen → Zusammenfassung
- Tileset-Bibliothek: eigene Tilesets mit Rollen, Tags und Perspektiven einmal einrichten und in jedem neuen Projekt wiederverwenden
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

Beim ersten Start und bei **Neues Projekt** (Desktop: Kopfzeile oder Projekt & Export; Handy: **+** oben) öffnet sich ein Assistent. Erst der letzte Schritt erzeugt das Projekt.

| Schritt | Inhalt |
| --- | --- |
| 1 Modus | **Automatisch generieren** oder **Manuell bauen** (Baukasten) |
| 2 Perspektive | Top-Down, Low Top-Down oder 45° (mit Vorschaubild), Schatten an/aus |
| 3 Tiles | „Welche Tiles möchtest du verwenden?“ – Vorhandenes Tileset auswählen · Neues Tileset hochladen · Demo-Tiles verwenden |
| 4 Map | Breite, Höhe, Tilegröße (16/32/48/64/frei) inkl. Pixelgröße, Seed |
| 5 Räume | Anzahl, Min/Max-Größen, Abstand, Raumformen, Regelmäßigkeit *(nur automatisch)* |
| 6 Wege | Gangbreite (Standard/Min/Max), Optionen, Verwinkelung, Direktheit, Vernetzung *(nur automatisch)* |
| 7 Spezialräume | Start, Ende, Boss, Schatz, Händler, Quest, Arena, Geheimraum, Rätsel *(nur automatisch)* |
| 8 Gelände | Terrain-Sets, Wasser, Lava, Abgründe, Klippen, Brücken, Übergänge *(nur automatisch)* |
| 9 Ausstattung | Boden-Varianten, Deko, Hindernisse, Bäume, Felsen, Torbögen, Säulen – oder **Später konfigurieren** *(nur automatisch)* |
| 10 Zusammenfassung | Projektname, alle Werte, **MAP ERSTELLEN** bzw. **BAUKASTEN ÖFFNEN** |

Automatisch: Tilesets auswählen → Generator konfigurieren → Map erzeugen. Manuell: Tilesets auswählen → Setup abschließen → Baukasten öffnet sich (5 Schritte).

Sind mehr Spezialräume aktiv, als Räume existieren, erscheint „Für diese Auswahl werden mindestens N Räume benötigt“ mit einem Button zum Erhöhen. Schließen des Assistenten ändert das aktuelle Projekt nicht (beim allerersten Start wird dann eine Demo-Map erzeugt).

### Tiles-Schritt und Tileset-Bibliothek

- **Vorhandenes Tileset auswählen** – zeigt alle gespeicherten Tilesets der Bibliothek mit Vorschau, Tilegröße, Anzahl Tiles, unterstützten Perspektiven, zugewiesenen Rollen und Terrains (Material-Tags der Böden). Mehrfachauswahl möglich; nicht zur Perspektive passende Sets sind markiert. Einträge lassen sich hier auch löschen.
- **Neues Tileset hochladen** – PNG wählen, Tilegröße wird erkannt (16/32/48/64/frei änderbar), Tiles werden angezeigt. Tiles antippen/markieren und im Inspektor Kategorie, **Rolle**, Kollision, Sortier-Offset, Gewichtung und Tags setzen, Perspektive festlegen, **In Bibliothek speichern**. Das Set ist danach ausgewählt und steht in allen künftigen Projekten zur Verfügung.
- **Demo-Tiles verwenden** – wie bisher, sofort ohne eigene Dateien.

Die Bibliothek liegt in IndexedDB (Store `library`), unabhängig von den Projekten. Tilesets aus bestehenden Projekten kommen über Tiles → Tilesets → **In Bibliothek** hinein. Werden eigene Tilesets gewählt, bleiben die Demo-Tilesets inaktiv im Projekt und liefern nur fehlende Rollen. Material-Tags der Boden-Tiles (z. B. `#grass`) werden automatisch zu Terrain-Sets.

### Manueller Baukasten

„Manuell bauen“ erzeugt eine leere Map mit leerem Strukturraster (`project.mode = 'manual'`). Der Editor startet mit Boden-Layer und Boden-Pinsel: Boden malen (Pinsel, Rechteck, Füllen) legt Räume und Wege an, **Auto-Wände** baut Wände, Ecken, Fronten und Schatten automatisch, Türen auf Wände öffnen sie; Objekte, Wasser, Abgründe und Brücken werden über ihre Tiles/Objekte gesetzt. Der Generieren-Button ist in diesem Modus ausgeblendet; im Generator-Panel lässt sich die automatische Generierung jederzeit aktivieren.

Vorbereitung für eine Bauteil-Bibliothek (Räume, Wege, Abgründe, Klippen, Brücken): Bauteile müssen nur das Strukturraster (`result.cells` / `result.terrain`) setzen und `applyAutoWalls()` aufrufen – Wände, Türrahmen, Kollision und Export funktionieren dann wie beim Malen. Beim Ändern der Map-Größe bleibt das Raster im manuellen Modus erhalten.

## Perspektiven

Die Map bleibt ein orthogonales 2D-Raster. Die Perspektive bestimmt, **welche Tile-Rollen** der Generator einsetzt – sie ist keine Verzerrung derselben Map:

| Perspektive | Wandlogik |
| --- | --- |
| `top_down` | Wände als flache Kanten mit Rollen aus der Nachbarschaft (`wall_top`, `corner_*`, `inner_corner_*` …) |
| `low_top_down` | Wand über einem Raum = Oberkante (`wall_top`) + **Wandfront** (`wall_front`, 1 Reihe); Seitenwände sind erhöht (Oberkante + sichtbare Innenseite), Ecken gehen in die Fronten über; Schatten unter Fronten |
| `isometric_45` | Wandfront 2 Reihen hoch (`wall_front` + `wall_front_upper`), Seitenwände mit sichtbarer Fläche, Schatten auch seitlich |

Die Perspektive steht im Projekt, in der Projektdatei und im Export (`map.perspective`). Tilesets lassen sich Perspektiven zuordnen (Tiles → Tilesets); der Generator nutzt nur passende, aktive Tilesets. Mitgeliefert: „Demo Wände Top-Down“, „Demo Wände 3/4“ (Low Top-Down + 45°) und „Demo Gelände“.

### Fehlende Tiles / Fallback

Der Generator sucht Tiles in drei Stufen: 1. aktive Tilesets, die zur Perspektive passen · 2. aktive Tilesets anderer Perspektiven · 3. die mitgelieferten Demo-Tilesets (auch wenn deaktiviert). Fehlen Rollen, erscheint eine Meldung mit den betroffenen Rollen (z. B. „Für Low Top-Down fehlen Tile-Rollen (wall_front, door …) – ersatzweise …“), die Map bleibt vollständig sichtbar und bedienbar.

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

### Desktop-Arbeitsbereich

Auf dem PC sind die Seitenpanels frei anpassbar (wie in einem Level-Editor):

| Aktion | So geht's |
| --- | --- |
| Breite ändern | Innenkante des linken bzw. rechten Panels ziehen (auch per Tastatur: Fokus + Pfeiltasten) |
| Höhe Layer ↔ Tiles | Trennlinie zwischen Layer und Tiles ziehen |
| Standardgröße | Doppelklick auf den Griff |
| Einklappen | ⌄ im Panelkopf bzw. Klick auf den Titel – links wird eine Icon-Leiste daraus, rechts bleibt nur die Kopfzeile (beide eingeklappt → Icon-Leiste) |
| Schließen / Öffnen | ✕ im Panelkopf; wieder einblenden über die drei Panel-Symbole oben rechts (linkes Panel, Layer, Tiles) |
| Maximieren | ↗ – das Panel nutzt fast die ganze App-Fläche, Inhalt scrollt, die Map liegt abgedunkelt dahinter; erneuter Klick, Klick daneben oder Esc stellt die vorherige Größe wieder her |
| Zurücksetzen | Einstellungen → Arbeitsbereich → „Panel-Layout zurücksetzen“ |

Linkes Panel: Generator · Terrain · Export · Einstellungen (das Zahnrad an der Map öffnet den Einstellungen-Tab). Rechts: Layer und Tiles (inkl. Tile-Eigenschaften/Inspektor). Die Map nimmt automatisch den freien Platz ein und behält mindestens 320 px Breite. Breiten, Höhen, eingeklappt/geschlossen/maximiert und der aktive Tab werden im Browser gespeichert (`localStorage`) und beim nächsten Öffnen wiederhergestellt. Auf dem Handy bleibt es bei Bottom Sheets.

Handy-Navigation: **Map · Generator · Terrain · Tiles · Layer · Export**, Einstellungen über das Zahnrad rechts oben. Panels öffnen sich als Bottom Sheet mit drei Zuständen:

- **eingeklappt** – nur Kopfzeile, Map fast vollständig sichtbar
- **halb geöffnet** – Map verkleinert sich darüber und bleibt sichtbar
- **vollständig geöffnet** – Panel reicht fast bis oben; die Map dahinter ist abgedunkelt und gesperrt

Griff oder Kopfzeile nach oben/unten wischen (ganz nach unten = schließen), Kopfzeile antippen oder ⌃-Button = vollständig öffnen, ✕ = schließen. Der Inhalt scrollt, der Kopfbereich bleibt fixiert. Im Querformat werden Navigation und Panels seitlich angeordnet. Alle Slider haben ein editierbares Zahlenfeld.

**Seeds:** `GENERIEREN` nutzt den aktuellen Seed – gleicher Seed + gleiche Einstellungen = exakt dieselbe Map. `Neuer Seed` würfelt und generiert sofort. Seeds dürfen Zahlen oder beliebiger Text sein.

**Objekte & Verschieben:** Tiles → Objekte → Objekt antippen, dann auf die Map tippen. Der Radierer entfernt Objekte, das Werkzeug **Verschieben** zieht Objekte oder eine Auswahl an eine neue Position.

**Bereich löschen:** Radierer wählen → in der Größenleiste **▭** (Rechteck radieren) → Rechteck aufziehen: löscht den Bereich auf dem aktiven Layer. Mit **Alle Layer** werden alle nicht gesperrten Layer, Objekte und Strukturzellen im Rechteck geleert – ein Zug über die ganze Map leert sie komplett (Ziehen darf außerhalb der Map beginnen). Einstellungen → **Map leeren** → *Ganze Map leeren* macht dasselbe per Knopf. Alles ist mit einem Undo rückgängig zu machen.

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
- Das Godot-Script ist gegen die Godot-4.3-API geschrieben und wird bei Änderungen in einem echten Godot 4.3 (headless) geprüft, aber nicht per CI.
- Eigene Objekte sind unbewegte Sprites (Vorderansicht); Gegner-Verhalten gibt es nur im Figuren-Export, nicht für Objekte auf der Karte.
- Der Playtest ist bewusst einfach (keine Physik-Engine, keine Gegner, keine Höhenwechsel-Animation).
- Spezialräume sind im Datensatz und im Room Graph markiert, haben aber noch keine Spielmechanik.
- Tilesets müssen quadratische Tiles ohne Abstand/Rand haben.
- Große PNG-Exporte sind durch Canvas-Limits des Browsers begrenzt (die App warnt und bietet kleinere Maßstäbe an).
- Generierung läuft im Haupt-Thread (80×80 ca. 40 ms, 256×256 mit 60 Räumen ca. 0,5–1 s).
- Kein direkter `.tscn`-Export – der Loader baut die Szene zur Laufzeit (oder per `build_now()` aus einem `@tool`-Script).

## Sinnvolle nächste Erweiterungen

- Export der Wandrollen als Godot-Terrain-Set (Peering Bits)
- Echtes isometrisches Raster für 45°, mehrere Höhenebenen
- Direkter `.tscn`/`.tres`-Export (TileSet-Ressource + Szene)
- Generator im Web Worker, Fortschrittsanzeige für sehr große Maps
- Außenbereiche und Dörfer (brauchen Gras-/Haus-Tiles im Demo-Set)
- Tileset-Optionen für Rand/Abstand und nicht-quadratische Tiles

---

## Änderungen

**Version 3.14 – Raum im Tileset markieren**

- Tiles → *Tilesets* → Karte (und im Assistenten beim Hochladen) → **Raum im Tileset markieren**.
  - Einen gezeichneten Beispielraum im Tileset einrahmen: am PC ziehen, am Handy erst eine Ecke und dann die gegenüberliegende antippen.
  - Die Ecken des Rahmens werden Außenecken, die Ränder Wände (oben, unten, links, rechts), das Innere Boden.
  - Unter **Wand-Vorderseite** 1 oder 2 Reihen wählen: Dann werden die Reihen unter der oberen Wand zur Mauer-Front (3/4-Ansicht).
- Ein **Probe-Raum** zeigt sofort, wie der Generator mit diesen Tiles einen Raum baut. Fehlende Teile sind rot markiert.
- Standardmäßig werden die automatischen Vorschläge aller übrigen Tiles verworfen. So landen Banner, Gitter oder Feuerschalen nicht mehr als „Boden“ in der Karte. Türen, Deko usw. danach einzeln antippen.
- KI: `tileset_mark_room` mit `tileset`, `x0`, `y0`, `x1`, `y1` und `front_rows`.

**Version 3.13 – Fertige Godot-Szene**

- Das Godot-Paket enthält jetzt **`tileset.tres`**, einen fertigen TileSet. Er hat alle Kacheln, Y-Sort-Ursprünge, Custom Data „category“ und „role“, Kollisionspolygone und bei Hex-Karten die Hexagon-Form.
- Dazu kommt **`Map.tscn`**: jede Ebene als TileMapLayer mit ihren Kacheln, dazu die Y-sortierte „World“. Objekte sind Sprite2D mit Kollision, Dächer liegen in „OverheadObjects“, die Spielfigur ist eingebunden. Alles lässt sich sofort im Godot-Editor ansehen und weiterbearbeiten.
- Das angehängte Loader-Script (`baked = true`) ergänzt beim Start nur Spawn-Marker, AStar, Side-Scroller-Plattformen, Leitern und Aufzüge sowie die Hex-Helfer.
- Mit Godot 4.3 geprüft für Top-Down/Dorf, Low Top-Down, 45°, Side-Scroller und Hex:
  - Jede Kachel (Quelle, Atlas-Position, Drehung, Y-Sort, Kollision, Rolle) stimmt mit dem bisherigen Laufzeit-Aufbau überein.
  - Die Spielfigur erscheint.
- **Godot-Terrains** in `tileset.tres`. Damit malst du in Godot im Reiter *TileMap → Terrains* weiter:
  - **„Wände“** (Match Sides): MapForge-Wände sind Linien, jede Wandkachel verbindet sich mit ihren Wand-Nachbarn. Ein gemaltes Rechteck bekommt passende Ecken, Kanten, T-Stücke und Endkappen.
  - **„Boden (Seitenansicht)“** (Match Corners and Sides) für Side-Scroller-Boden: oben, Ecken, Seiten, Füllung und Unterkante.
  - Welche Seite „Raum“ ist, kann Godot nicht wissen. Es wählt deshalb zwischen gleich verbundenen Varianten, z. B. innerer oder äußerer Ecke, selbst.
- Die Spawn-Marker heißen jetzt `SpawnMarkers`, die Objekt-Dächer `OverheadObjects`. Vorher kollidierten diese Namen mit den gleichnamigen Kachel-Ebenen.

**Version 3.12 – KI arbeitet auch, wenn MapForge zu ist**

- „KI von überall“: Ist keine MapForge-App offen, führt der Vermittler den Befehl in **MapForge in der Cloud** aus. Das ist die eigene App in einem unsichtbaren Browser auf Vercel, `api/cloud.js`. Die KI arbeitet dort an denselben Karten. Jeder Befehl dauert in der Cloud ein paar Sekunden länger, weil der Browser erst starten muss.
- Beim nächsten Öffnen der App (mit eingeschaltetem „KI von überall“) werden die Karten der KI übernommen. Sie stehen unter *Karte → Gespeicherte Karten* mit dem Abzeichen „KI“. Die App lädt umgekehrt deine Karten und Figuren hoch, damit die KI sie auch bei geschlossener App kennt. Bei derselben Karte gewinnt die neuere Fassung.
- Exporte (ZIP) aus der Cloud kommen als Download-Link (7 Tage gültig).
- Schalter aus oder „Neue Adresse erzeugen“ stoppt auch die Cloud.
- Technik: Tabellen `cloud_projects`, `cloud_meta` und `cloud_tickets` sowie der Bucket `mapforge-exports` im Supabase-Projekt. Die Endpunkte `<Adresse>/store` gehören zur Edge Function. Ein Einmal-Ticket pro Befehl sorgt dafür, dass der Cloud-Browser nur für echte Aufrufe startet.

**Version 3.11 – KI legt Karten an, du siehst sie**

- Jede Karte, die die KI mit `new_map` anlegt, ist ein eigenes gespeichertes Projekt. Sie steht unter *Karte → Gespeicherte Karten* und auf der Startseite mit dem Abzeichen **KI**. Eine Meldung sagt, welche Karte angelegt wurde. Offene Listen aktualisieren sich sofort.
- Arbeitet die KI über den lokalen Server im unsichtbaren Browser, werden ihre Karten beim Öffnen von MapForge (`http://127.0.0.1:8765/?ai=1` oder mit eingeschalteter KI-Verbindung) automatisch in deinen Tab übernommen, auch Karten aus früheren Sitzungen. Danach arbeitet die KI direkt in deinem Tab weiter, und der unsichtbare Browser wird geschlossen.
- Über „KI von überall“ (Handy) entstehen die Karten direkt in der App auf deinem Gerät.
- `list_projects` markiert KI-Karten mit `ai: true`.

**Version 3.10 – Generator im Hintergrund**

- Der Generator läuft in einem Web Worker. Die App bleibt beim Generieren großer Karten bedienbar: Bei 256×256 blockiert der Hauptthread höchstens etwa 20 ms, vorher waren es am Handy 1–2 s. Kann der Browser keinen Worker starten, läuft der Generator wie bisher direkt.
- MCP-Server: Ein zweiter Start (z. B. ein zweiter KI-Client) stürzt nicht mehr ab, wenn der Port schon belegt ist. Er leitet dann an den laufenden Server weiter.

**Version 3.9 – Tilesets mit Rand, Abstand und nicht-quadratischen Tiles**

- Tiles → *Tilesets* → Karte → **Eigene Maße, Rand und Abstand**: Tile-Breite und -Höhe (auch nicht quadratisch), Rand um das ganze Bild und Abstand zwischen den Tiles, wie in Tiled. **Neu zuschneiden** schneidet immer aus dem Originalbild, die Einstellung lässt sich also jederzeit wieder ändern. Nicht-quadratische Tiles werden auf quadratische gebracht: waagerecht mittig, unten bündig. Palette, Generator und Godot-Export sehen danach ein normales Raster.
- KI: `tileset_add` mit `tile_width`, `tile_height`, `margin` und `spacing`. Neu ist `tileset_recut`: schneidet ein vorhandenes Tileset neu zu und setzt danach neue Vorschläge.

**Version 3.8 – Außenbereiche und Dörfer**

- Generator → *Räume* → **Aufbau: Außenbereich** oder **Dorf** (auch im Assistenten). Die Räume werden zu Lichtungen und die Gänge zu Erdwegen. Alles dazwischen ist dichter Wald aus Baum-Objekten; er ist nicht begehbar, die Kollision steht in der Kollisionsebene. Waldboden ist dunkleres Gras. Regler **Zerklüftung** für die Ränder der Lichtungen.
- **Dorf**: Zusätzlich stehen Häuser (3×3, das Dach wird über der Figur gezeichnet) in den Lichtungen, bevorzugt im hinteren Teil, und am Start steht ein Brunnen. Wo nötig, wird Wald für ein Haus gerodet. Der Eingang bleibt immer frei.
- Neue Demo-Tiles: vier Gras-Böden (Tag `grass`, mit Blumen oder dunkel) und zwei Erdwege (Tag `dirt`). Neue Objekte: *Haus* und *Brunnen*, auch im Godot-Export.
- Alle Lichtungen sind vom Start aus erreichbar (geprüft für Top-Down, Low Top-Down und 45°). KI: `set_generator` mit `{ "layout": "village" }`.

**Version 3.7 – Natürliche Höhlen**

- Generator → *Räume* → **Aufbau: Natürliche Höhle** (auch im Assistenten): Räume und Gänge werden per Zellautomat zu Höhlen mit unregelmäßigen Wänden, Ausbuchtungen, Nischen und Felssäulen, ohne Türen. Regler **Zerklüftung** (glatt … sehr zerklüftet). Raummitten und Gangverläufe bleiben offen, abgetrennte Stücke werden entfernt – alle Kammern bleiben erreichbar (geprüft für Top-Down, Low Top-Down und 45°). Spezialräume, Gelände, Gegner und Beute, Export funktionieren wie gewohnt. KI: `set_generator` mit `{ "layout": "cave", "caveRoughness": 60 }`.

**Version 3.6 – KI verwaltet eigene Tilesets**

- Neue KI-Befehle: `tileset_list`, `tileset_add` (PNG per Adresse oder base64, mit Teile-Erkennung und automatischen Vorschlägen), `tileset_render` (Bild mit gid und Zuordnung jedes Tiles), `tileset_assign` (Kategorie, Rolle, Tags, Kollision – die App lernt daraus), `tileset_auto_assign`, `tileset_update` (Name, an/aus, Kartenarten), `tileset_remove`.
- Der Vermittler für „KI von überall“ holt die Befehlsliste jetzt live aus der verbundenen App – neue Befehle brauchen kein neues Hochladen mehr.

**Version 3.5 – Gegner & Beute automatisch, Kampf im Testspiel**

- Generator (Top-Down / Isometrisch): neue Regler **Gegner** und **Beute (Truhen)** unter *Ausstattung* (auch im Assistenten). Verteilung nach Entfernung zum Start: der Startraum bleibt frei, weiter hinten mehr und stärkere Gegner (Stufe 1–5, 25 % Fernkämpfer), der Boss bekommt Wachen; Truhen in Schatzräumen, Sackgassen und selten sonst (Stufe 1–3), jede Truhe als echtes Objekt. Genres setzen passende Werte (Puzzle: keine Gegner). Alles als Spawnpunkte mit Eigenschaften im Godot-Export.
- **Testspiel**: Gegner (Schleime, Farbe nach Stufe, Boss lila und größer) wandern um ihren Platz und verfolgen die Figur, wenn sie näher als 6 Felder kommt; Berührung kostet ein Herz (Boss zwei), bei 0 zurück zum Start. **Angriff** mit Leertaste / J oder dem Knopf *Angriff* am Handy trifft, was vor der Figur steht (mit Rückstoß, Lebensbalken). Truhen öffnen sich beim Drüberlaufen. Anzeige oben: Herzen, besiegte Gegner, geöffnete Truhen.

**Version 3.4 – KI von überall (auch am Handy)**

- **Einstellungen → KI von überall**: Schalter an, Adresse kopieren, in Claude als Connector eintragen – die KI arbeitet dann in dieser App, egal ob sie am Handy, Tablet oder PC offen ist und wo die KI läuft (z. B. Claude-App am Handy). Kein PC und kein eigener Server nötig. Jede Adresse enthält einen eigenen Kopplungscode („Neue Adresse erzeugen“ sperrt die alte). Exporte landen auf dem Gerät mit MapForge.
- Die bisherige Verbindung über den MCP-Server auf dem Computer bleibt („KI auf diesem Computer“).

**Version 3.3.1 – Tileset-Upload: Einzelteile statt Tausender Krümel**

- Bilder, die kein sauberes Raster sind (KI-generierte Tile-Sheets, Teile mit Abständen, verschieden große Stücke, transparenter / einfarbiger / Verlaufs-Hintergrund), werden jetzt **in ihre Einzelteile zerlegt**: jedes Teil ausgeschnitten, in ganze Tiles gemessen (auch 2×1, 1×2 …), auf 16 / 32 / 48 / 64 px gebracht und in ein neues, sauberes Tileset gepackt. Kleine Splitter (Punkte, Steinchen neben Rissen) bleiben beim Teil daneben, weiche Schatten zählen als Hintergrund.
- Vorher wurde so ein Bild in bis zu 6000 16-px-Stücke geschnitten – das hat Handys lahmgelegt. Jetzt nie mehr als 1500 Tiles pro Bild; die Tile-Größen-Erkennung ist deutlich schneller.

**Version 3.3 – Eigene Figuren und Objekte auf der Karte**

- Figuren-Baukasten → **Export → Als Objekt auf die Karte**: Charakter, Kreatur oder Objekt wird ein eigenes Karten-Objekt (Vorderansicht, 1 Figur-Pixel = 1 Pixel bei 32 px pro Tile, steht auf seiner Fußzeile). Die App springt zur Karte, das Objekt ist schon als Pinsel gewählt.
- Unter **Tiles → Objekte → Eigene Objekte** wie Baum oder Truhe setzen, verschieben, radieren; Y-Sortierung und Kollision (untere Reihe) wie bei den eingebauten Objekten. Nochmal exportieren aktualisiert das Objekt, der Papierkorb entfernt es samt allen gesetzten.
- Godot: die eigenen Objekte stehen in `objects.png` (jetzt 32 px pro Tile) und werden als Sprite + Kollision gebaut (Typ `npc`, `enemy` oder `prop`) – in Godot 4.3 geprüft. KI-Befehl `figure_to_map`.

**Version 3.2 – Reiter „Animieren“ entfernt, Export im Figuren-Baukasten**

- Der Reiter *Animieren* (Bild-für-Bild-Bearbeitung, eigene Animationen, Spritesheet-Import, Standards) ist weg – die App konzentriert sich auf Karten.
- Im Figuren-Baukasten gibt es dafür den Tab **Export**: kleine Vorschau der automatischen Animationen (Stehen, Laufen, Angriff, Treffer, Umfallen …), Richtungen 4 / 8 / 2 (Platformer), **Godot-Paket** und **Spritesheet PNG**, **Als Spielfigur verwenden** (Testspiel und Karten-Export).

**Version 3.1 – KI-Schnittstelle (MCP)**

- Eine KI (Claude, Cursor, eigene Programme) kann MapForge bedienen: Karten erzeugen, generieren, malen, füllen, kopieren, Objekte setzen, Layer ändern, rückgängig machen, **Bilder der Karte ansehen**, Godot-Paket / JSON exportieren, Figuren aus Teilen bauen, färben, ansehen (alle Ansichten, Animationen) und als Godot-Paket exportieren – 36 Befehle.
- **MCP-Server** in `mcp/` (`node mcp/server.mjs`): die KI arbeitet in deinem offenen MapForge-Tab (**Einstellungen → KI-Verbindung**), du siehst live zu; ohne Tab startet der Server MapForge unsichtbar selbst. Auch per HTTP (`POST /command`) und in der Browser-Konsole (`mapforge.run(…)`). Anleitung: `mcp/README.md`.

**Version 3.0 – Kopieren & Stempel, Drehen & Spiegeln, Übersichtskarte**

- **Kopieren / Ausschneiden / Stempel:** Mit *Auswahl* einen Bereich markieren → in der Leiste *Kopieren*, *Ausschneiden* oder gleich **Stempel**. Der Stempel nimmt alle Layer, Objekte und die Struktur darunter mit (Auto-Wände arbeiten danach weiter). Die Kopie hängt halb durchsichtig unter Finger / Maus, loslassen setzt sie ein; leere Felder der Kopie lassen stehen, was darunter ist. Ein Stempel = ein Rückgängig-Schritt. Tastatur: Strg+C, Strg+X, Strg+V (Stempel), Entf löscht die Auswahl auf allen Layern, S = Stempel.
- **Tiles drehen und spiegeln:** Neben der Pinselgröße ↻ (90° drehen) und ⇋ (spiegeln) – für Pinsel, Rechteck, Füllen und den ganzen Stempel. Die Pipette übernimmt die Drehung. Kollision, Auto-Wände und Export erkennen das Tile weiterhin. Godot: als *alternative tile* mit `TRANSFORM_FLIP_H / FLIP_V / TRANSPOSE` (in Godot 4.3 geprüft).
- **Übersichtskarte:** kleine Karte in der Ecke mit Rahmen für den sichtbaren Ausschnitt; antippen oder ziehen springt dorthin. Ein/aus über das Kartensymbol (am Handy standardmäßig aus).
- **Layer-Deckkraft:** im Layer-Menü (⋯) ein Regler – Layer halb durchsichtig anzeigen, um darunter zu arbeiten. Nur im Editor, der Export bleibt unverändert.

**Version 2.9 – 8 Richtungen (Schrägansichten)**

- Neue Ansichten **Schräg ↘** (schräg von vorne) und **Schräg ↗** (schräg von hinten) im Figuren-Baukasten und beim Animieren – links (↙ ↖) gespiegelt, zusammen 8 Richtungen. Alle Teile passen sich an: schmalerer Oberkörper, Arme dicht am Körper, Gesicht nach rechts gedreht, mehr Haar am Hinterkopf, schräg von hinten etwas Wange sichtbar. Kreaturen: Augen rücken zusammen und nach rechts.
- Waffe bleibt in der rechten Hand und zeigt in Blickrichtung (schräg nach vorne-unten bzw. nach hinten-oben), Schild / zweite Hand liegt auf der abgewandten Seite hinter dem Körper.
- Laufen und Rennen schräg: der Schritt der Seitenansicht, etwas kleiner; die übrigen Animationen wie vorne bzw. hinten.
- „Auch andere Ansichten“: was vorne gemalt wird, landet auch in beiden Schrägansichten (schräg hinten gespiegelt).
- Export: neue Wahl **8 Richtungen (+ schräg)** – Reihen `walk_down_side`, `walk_up_side` usw. Das Godot-Skript (Spieler und Gegner) wählt dann aus 8 Richtungen (in Godot 4.3 geprüft), sonst wie bisher 4. Die Figur im Karten-Export und beim Testspielen dreht sich schräg, wenn diagonal gelaufen wird.

**Version 2.8.1 – Waffe immer in der rechten Hand, zeigt nach vorne**

- Die Figur hält Schwert, Axt, Hammer & Co. immer in **ihrer rechten Hand**: von vorne sieht man die Waffe links im Bild, von der Seite in der vorderen Hand, von hinten rechts – nicht mehr gespiegelt.
- **Klingen zeigen in Blickrichtung**: von der Seite waagerecht nach vorne, von vorne verkürzt auf den Betrachter zu, von hinten nach Norden – die Waffe ist dann weitgehend vom Körper verdeckt, die flache Seite der Klinge sieht man nicht. Stab, Fackel und Bogen bleiben aufrecht.
- Angriffe und alle anderen Animationen folgen dem: der Schlag von hinten geht über den Kopf nach vorne (Norden), von vorne zum Betrachter hin.

**Version 2.8 – Modus „Hexagonal“ (Strategie-Weltkarten)**

- Im Setup und unter *Karte → Neue Karte* jetzt verfügbar: **Hexagonal** (Genre *Strategie / 4X*, auch Taktik). Eigener Ablauf mit Schritt **Welt**.
- **Welt-Generator**: Höhe + Feuchtigkeit + Klima (Breitengrad) → Tiefsee, Küste, Strand, Wiese, Wald, Hügel, Gebirge, Schnee, Wüste, Sumpf. Flüsse fließen bergab ins Meer (ohne Zickzack), **Siedlungen** mit Abstand auf gutem Land (Fluss / Küste bevorzugt), **Hauptstädte** der Spieler (Burg + Fahne in Spielerfarbe) möglichst weit auseinander, **Straßen** verbinden alle Siedlungen über das günstigste Gelände (A*), Rohstoffe (Minen, Felder, Ruinen). Regler: Landform (Kontinent / Inseln), Klima, Wasser, Gebirge, Wälder, Flüsse, Spieler, Siedlungen, Straßen, Rohstoffe.
- **Hex-Editor**: jede zweite Reihe versetzt, Hex-Gitter, Hex-Markierung unter dem Finger/Mauszeiger, Malen/Radieren/Füllen auf Hexen. **Flüsse und Straßen verbinden sich selbst** (Auto-Anschluss) – in der Palette gibt es je ein Tile. Layer heißen *Gelände, Flüsse, Straßen, Städte & Orte*.
- **Demo-Tiles Hex** (32 px): 17 Gelände-Hexe, Flüsse/Straßen für alle 64 Nachbar-Kombinationen, Stadt, Dorf, Burg, Feld, Mine, Ruine, 6 Spielerfahnen.
- **Godot-Paket**: TileSet im Hexagon-Modus (gleiches Raster wie in MapForge, in Godot 4.3 geprüft: gleiche Mittelpunkte, gleiche Nachbarn). Kamera (Pfeiltasten, Mausrad, Ziehen), Klick → Signal *hex_clicked* mit Gelände/Kosten/Fluss/Straße/Siedlung, `terrain_at`, `move_cost`, `hex_path` (AStar2D über Bewegungskosten, Straßen günstig, Wasser gesperrt).
- Side-Scroller und Hex: kein „Room Graph“ und kein eigenes Terrain-Panel mehr (alles im Generator-Panel); das gewählte Tile passt automatisch zur Kartenart.

**Version 2.7 – Aufzüge im Side-Scroller**

- Neuer Abschnitt **Aufzug**: eine Plattform fährt in einem flachen Schacht zwischen Boden und einer hohen Kante auf und ab (bündig oben und unten, einfach drauflaufen), wartet an beiden Enden 1 s. Schiene im Hintergrund zeigt den Weg. Schalter *Aufzüge* in den Level-Einstellungen.
- **Eigene Tiles**: Rollen *Aufzug* (`lift`) und *Schiene* (`lift_track`) – wie Leiter, Plattform, Stacheln – lassen sich eigenen Tiles zuweisen. Ein Aufzug fährt entlang der Schienen-Tiles über/unter ihm; ohne Schiene ist er eine normale Plattform.
- Testspielen: Aufzüge fahren sichtbar, die Figur fährt mit. Godot-Export: AnimatableBody2D mit Tween (gleiches Tempo, gleiche Pausen) – in Godot 4.3 getestet: Figur fährt 10 Tiles mit nach oben.
- Generator-Fehler behoben: war eine Leiter-/Aufzug-Stufe zu niedrig, entstand ein unerreichbarer Absatz. Alle Test-Levels (mit und ohne Aufzüge) sind per Suche über die echte Physik vom Start bis zum Ziel schaffbar.

**Version 2.6 – erst fragen, dann bauen**

- **Karte**, **Figuren** und **Animieren** fragen zuerst, was gemacht werden soll: Karte → aktuelle weiterbearbeiten, gespeicherte öffnen oder *neue Karte* nach Art (Top-Down, Isometrisch, 2D Side-Scroller – der Assistent startet mit dieser Art). Figuren / Animieren → erst *Charakter, Kreatur oder Objekt*, dann welche(s): zuletzt bearbeitet, gespeichert oder neu (mit Baukasten-Teilen / leer). Den Reiter nochmal antippen oder „Auswahl“ führt zurück zur Frage.
- **Hand als Standardwerkzeug** in Karte und Figuren – kein versehentliches Malen mehr beim Verschieben. Tile oder Farbe wählen schaltet auf den Stift.
- **Wege malen öffnet Wände richtig:** Wege (Layer „Wege“) oder Boden-Tiles auf einem Wand-Layer machen die Zelle begehbar; Wände, Ecken und die **Kollision** werden drumherum neu berechnet (vorher blieb die Kollisionsbox stehen).
- **Vorne malen → auch Seite & Hinten** (Schalter in der Leiste, Standard an): was in der Vorderansicht gemalt wird, landet auch in der Rückansicht (gespiegelt) und der Seitenansicht (zur Mitte gestaucht) – auf der jeweils eigenen Ansicht des Teils. Gesichter bleiben vorne. Rückgängig macht alles zusammen rückgängig.
- **Zoom beim Animieren:** Vorschau mit + / − / Einpassen, Mausrad und zwei Fingern, verschieben durch Ziehen; im Bild-Editor ebenso plus Hand-Werkzeug.

**Version 2.5 – Modus „2D Side-Scroller“**

- Im Setup unter *Ansicht* jetzt verfügbar: **2D Side-Scroller** (Genre Platformer). Eigener Ablauf: Spiel → Modus → Tiles → Map → **Level** → Zusammenfassung.
- **Level-Generator** (von links = Start nach rechts = Ziel), aus Abschnitten: Ebene, Stufen, Gruben (Abgrund, Wasser, Lava, Stacheln), lange Gruben mit schwebenden **Einweg-Plattformen**, Aufstiege mit Belohnung oben, hohe Stufen mit **Leiter**, optional **Boss-Arena** vor der **Zielfahne**. Umgebung *Draußen* (Gras, Himmel mit Hügeln) oder *Höhle* (Decke, Rückwand, Kristalle). Gegner stehen auf ebenen Strecken, Truhen auf Plattformen.
- **Immer schaffbar:** Jeder Abschnitt wird nur innerhalb der eingestellten **Sprunghöhe/-weite** gebaut. Geprüft mit einer Suche über die echte Spielphysik (Start → Ziel) für viele Seeds und Einstellungen.
- Regler im Panel *Generator*: Schwierigkeit (Leicht/Normal/Schwer/Höhle), Umgebung, Sprung, Hügel, Gruben, Plattformen, Leitern, Gefahren, Gegner, Belohnungen, Boss-Arena, Deko.
- **Testspielen mit Schwerkraft**: A/D laufen, W/Leertaste springen (lang drücken = höher), kurze Gnadenzeit an Kanten, ↓ fällt durch Plattformen, Leitern hoch/runter, Gefahren und Abstürze setzen an die letzte sichere Stelle zurück, „Ziel erreicht!“. Am Handy Joystick + großer **Springen**-Knopf.
- **Auto-Boden** beim Selbstbauen: festen Boden malen/löschen → Gras oben, Kanten, Unterseite, Innenecken und Kollision passen sich an. Layer heißen im Side-Scroller verständlich: *Hintergrund, Boden (fest), Plattformen & Leitern, Wasser & Lava*.
- **Demo-Tiles Seitenansicht** (Gras- und Höhlenboden mit allen Kanten, Holzplattformen, Leiter, Stacheln, Wasser/Lava mit Oberfläche, Höhlenwand, Deko, Zielfahne, Truhe). Die Palette zeigt die passenden Tiles zuerst.
- **Godot-Paket**: Der Loader baut Einweg-Plattformen (StaticBody2D, one_way_collision), Leitern (Area2D „ladder“), Gefahren (Area2D „hazard“ → hazard_hit()), Ziel (Signal goal_reached). Die Spielfigur bekommt automatisch die **Platformer-Steuerung** mit denselben Sprungwerten wie in MapForge, Kamera auf das Level begrenzt. Getestet in Godot 4.3 (headless): Figur steht, läuft, springt, landet, Gefahr → zurück zur sicheren Stelle.
- Jedes Karten-Paket enthält jetzt eine Spielfigur: die eigene aus „Animieren“ oder sonst die aktuelle Figur aus dem Baukasten – mit idle, walk, run, jump, fall, attack, hurt, death, climb in allen Richtungen.

**Version 2.4.1 – Waffe in der Hand, Angriff nach Norden, immer 4 Richtungen**

- Waffen sitzen jetzt **in der Faust**: der Griff läuft durch die Hand, die Hand liegt darüber, die Klinge steht schräg nach außen (Schwert 30°, von der Seite 40° nach vorn; Stab/Speer steiler, Bogen senkrecht). Beim Laufen schwingt die Waffe mit, die Hand hält sie aber ruhig.
- **Angriff nach Norden** (Ansicht hinten) schlägt jetzt nach oben über den Kopf statt nach unten.
- Export immer mit **4 Richtungen** (↓ ↑ →, ← gespiegelt) – oder 2 Richtungen für Platformer. Die Godot-Skripte bewegen die Figur in 8 Richtungen und wählen die passende Blickrichtung.

**Version 2.4 – spieltaugliche Animationen**

- **Echte Drehungen statt nur Verschieben:** Arme drehen sich um die Schulter, Beine um die Hüfte, der Kopf um den Hals, die Waffe um den Griff (und dazu mit dem Arm), die ganze Figur um die Füße. Gedrehte Pixel werden mehrfach abgetastet (keine Löcher); von der Seite wird die Lücke im Oberkörper hinter dem schwingenden Arm mit der Oberkörperfarbe gefüllt.
- **Angriff** (6 Bilder): Ausholen über den Kopf, Schlag mit heller **Wischspur**, Nachschwung, zurück – vorne und von der Seite eigens gestaltet.
- **Laufen von der Seite mit 8 Bildern** (Kontakt – tief – Mitte – hoch, echte Schrittstellung, Arm schwingt gegengleich), **Rennen von der Seite mit 6 Bildern** (Vorlage, Flugphase, Staub).
- **Springen** mit Stauchen beim Absprung/Landen und Strecken im Flug, Arme gehen hoch. **Umfallen** kippt wirklich um (vorne zur Seite, von der Seite nach hinten), der Schatten bleibt am Boden. **Treffer** mit Kopf-Zucken und Rückstoß. Zaubern, Winken, Klettern, Fallen, Blocken mit Armdrehung; Kreaturen: Flügelschlag, Krabbeln und Angriff mit gedrehten Gliedmaßen; Objekt-Wackeln kippelt.
- **Hinten** = gespiegelte Vorderansicht (die Waffe ist dort links, der Schlag läuft andersherum).
- **Godot-Skripte zum Losspielen:**
  - *Top-Down-Spieler:* Pfeiltasten laufen, Shift rennt, Leertaste/Enter oder J greift an (trifft Gegner der Gruppe `enemy` vor der Figur), `hurt(schaden)` → „hurt“, bei 0 Leben „death“; Signale `hp_changed`, `died`; einmalige Animationen spielen einmal, danach geht die Steuerung weiter.
  - *Platformer-Spieler* (automatisch, wenn nur die Seitenansicht exportiert wird): Schwerkraft, ← → laufen, ↑/Leertaste springt (Sprung-/Fallbilder passend zum Steigen und Fallen), J/X greift an.
  - *Gegner:* verfolgt, greift in Reichweite an (mit Pause), nimmt Schaden, spielt „hurt“, verschwindet nach „death“. Leben, Tempo, Schaden, Reichweite im Inspector.
- Standards: *Top-Down-Held* jetzt mit Rennen, *Platformer-Held* mit Laufen und Angriff.

**Version 2.3 – einfachere Bedienung am Handy**

- Reiter zusammengefasst: **Projekt · Karte · Figuren · Animieren · Einstellungen** (passt auf jedes Handy). Unter *Figuren* oben wählen: Charakter, Kreatur oder Objekt.
- **Animieren** fragt zuerst, *welche* Figur animiert werden soll: gespeicherte Figuren aus der Galerie, die zuletzt bearbeitete oder „Neue Figur bauen“. In der Leiste: *Auswahl* (zurück), *Speichern* (Galerie, mit Animationen), *Bearbeiten*.
- Handy: Beim Scrollen im Baukasten wird der obere Bereich kompakt (kleinere Zeichenfläche, Vorschau/Farbwahl ausgeblendet), die Teile-/Farben-Tabs bleiben oben sichtbar. Alle Werkzeuge und Aktionen haben eine Beschriftung (Stift, Radierer, Füllen …, Neu, Import, Als Teil, PNG).
- Kurze **„So geht's“-Hinweise** im Baukasten und beim Animieren (einmal „Verstanden“ tippen, dann weg).

**Version 2.2 – Sicherung**

- **Alles sichern / Sicherung laden** (Seite „Projekt“ und „Einstellungen“): eine Datei `mapforge-sicherung-JJJJ-MM-TT.json` mit allen Karten-Projekten, der Tileset-Bibliothek und allem aus den Baukästen (aktuelle Figuren, Galerie, eigene Teile, Paletten, Spielfigur, Animations- und Lern-Einstellungen). Beim Laden werden gleiche Projekte ersetzt, andere bleiben; danach lädt die App neu. Anzeige „Letzte Sicherung vor … Tagen“ (gelb nach 7 Tagen / nie).

**Version 2.1 – Ansichten, Bild für Bild, Kreaturen, Import/Export**

- **Ansichten vorne / Seite / hinten**: im Baukasten umschaltbar. Seite und Rücken werden aus den Teilen erzeugt (Profil mit Nase und einem Auge, schmaler Körper; von hinten Haare statt Gesicht, Umhang/Flügel liegen oben). Was man in Seite/Hinten malt, gilt nur für diese Ansicht („Ansicht zurücksetzen“). Animationen gibt es in allen drei Richtungen – von der Seite schwingen die Beine vor und zurück.
- **Kreatur bauen** (neuer Reiter): 12 Körper (Schleim, Fledermaus, Spinne, Geist, Schwebendes Auge, Pilz, Käfer, Wolf, Golem, Drachenbaby, Kobold, Skelett) + Augen, Maul, Hörner & Ohren, Flügel & Schwanz, Arme & Klauen (auch Keule, Schwert, Stab), Muster, Aura – alles passt sich dem Körper an. Kreatur-Animationen: Wabern, Hüpfen, Krabbeln, Fliegen, Angriff, Treffer, Zerfallen (mit Stauchen/Strecken).
- **Standards** zum Anklicken im Reiter Animieren: Top-Down-Held, Platformer-Held, Kämpfer, Magier, NPC, Alles; Gegner am Boden, Fliegender Gegner, Krabbler, Boss; Sammelobjekt, Truhe/Tür, Feuer/Magie, Falle. Neue Animationen: Zaubern, Blocken, Ducken, Winken, Klettern, Fallen.
- **Bild für Bild**: jedes Bild einer Animation lässt sich bearbeiten (Stift, Radierer, Füllen, Pipette, Verschieben, Zwiebelschicht, Undo) – bearbeitete Bilder sind markiert und zurücksetzbar. **Eigene Animationen**: Kopie einer Animation oder leer beginnen, Bilder duplizieren/einfügen/verschieben/löschen, Name, fps, Richtung, Schleife.
- **Import**: eigenes Bild als Ebene oder als neue Figur / neues Objekt (Ränder werden abgeschnitten, bis 64 px), **Spritesheet** als eigene Animationen (Frame-Größe einstellbar, jede Zeile eine Animation, leere Zellen übersprungen). **Figur-Datei** (`.mapforge-sprite.json`) speichern und öffnen – mit Ebenen, Ansichten, bearbeiteten Bildern und eigenen Animationen.
- **Export** mit Richtungen (`walk_down`, `walk_side`, `walk_up` …) und eigenen Animationen; das Godot-Skript der Spielfigur wählt die Richtung selbst, Kreaturen bekommen ein **Gegner-Skript** (wartet, verfolgt die Spielfigur, spielt fly/hop/crawl). Die Spielfigur im Test läuft in allen vier Richtungen.
- Neu: `sprites/parts/creature.ts`, `sprites/FrameEditor.tsx`, `sprites/animPresets.ts`, `sprites/frame.ts`.

**Version 2.0 – Animieren, eigene Spielfigur, Figuren-Export**

- Neuer Reiter **Animieren**: die Figur aus „Charakter bauen“ / „Objekt bauen“ bekommt Animationen – Charakter: *Atmen, Laufen, Rennen, Springen, Rutschen, Angriff, Treffer, Umfallen*; Objekt: *Schweben, Wackeln, Pulsieren, Flackern, Öffnen*. Die Bewegung entsteht aus den Körperzonen (Kopf, Oberkörper, Arme mit Waffe/Schild, Beine), funktioniert also auch mit selbst gezeichneten Ebenen und mit jeder Teile-Kombination. Vorschau mit Abspielen/Pause, Einzelbild-Leiste, Zwiebelschicht, Geschwindigkeit (fps) pro Animation, Hintergrund; Frames haben Rand (32-px-Figur → 48-px-Frames), damit Sprünge und Schläge nicht abgeschnitten werden.
- **Als Spielfigur verwenden**: die eigene Figur läuft im Test (▶) über die Karte – mit Atmen im Stand und Laufanimation, nach links gespiegelt. Bleibt im Browser gespeichert, „Standard“ stellt die alte Figur wieder her.
- **Export für Figuren**: *Godot-Paket (ZIP)* – Ordner ins Godot-Projekt ziehen, `.tscn` in die Szene ziehen, fertig: Spritesheet, `SpriteFrames` (.tres) mit allen Animationen, Szene (`CharacterBody2D` bzw. `StaticBody2D` + `AnimatedSprite2D` mit Nearest-Filter, Füße am Ursprung für Y-Sort, Kollisionsbox an den Füßen), Bewegungs-Skript mit Pfeiltasten (walk/idle, Spiegeln), README. Außerdem Spritesheet PNG (1× / 4×), Einzelbilder als ZIP und JSON (Zeilen, Frames, fps) für Unity, GDevelop, Phaser.
- **Karten-Export nach Godot vereinfacht**: das Godot-Paket steht jetzt oben (empfohlen) und enthält eine fertige **`Map.tscn`** – Ordner irgendwo ins Godot-Projekt ziehen, `Map.tscn` starten (F6). Der Loader findet `map.json` neben sich selbst (kein fester Pfad `res://mapforge/` mehr nötig). Ist eine eigene Spielfigur gesetzt, liegt sie als `player/` bei und steht am Startpunkt, mit Kamera und Pfeiltasten-Steuerung.
- Neu: `sprites/animation.ts`, `sprites/AnimStudio.tsx`, `sprites/exportSprite.ts`, `playtest/playerSprite.ts`.

**Version 1.9 – mehr Teile, Paletten, Profi-Werkzeuge**

- Charakter-Baukasten deutlich erweitert: neue Gruppe **Rücken** (Umhang, Engels-/Fledermausflügel, Rucksack, Köcher, Schwanz), Körper *Rundlich* und *Groß*, Frisuren (Seitenscheitel, Pony, Afro, Zwei Zöpfe, Undercut, Lange Wellen), Gesichter (Wütend, Überrascht, Zwinkern, Katzenaugen), Kopf-Extras – jetzt kombinierbar – (Katzenohren, Brille, Schnurrbart, Sommersprossen, Narbe, Tuchmaske, Kriegsbemalung), Oberteile (Lederrüstung, Kettenhemd, Mantel, Kleid, Kapuzenpulli, Kampfanzug), Beinschienen, Leggings, Hüte (Barett, Federhut, Kopftuch, Heiligenschein, Hörnerhelm, Hexenhut), Waffen (Dolch, Streitkolben, Katana, Dreizack, Sense, Sternstab) und zweite Hand (zweites Schwert, Zauberkugel, Blume, Schlüssel).
- **Eigene Farbpaletten** (Tab „Palette“): Vorlagen MapForge, PICO-8, Sweetie 16, DawnBringer 16, Endesga 32, Game Boy; eigene Paletten anlegen, benennen, Farben hinzufügen/entfernen, *Aus Figur übernehmen*, Import/Export im Lospec-Format (.hex/.gpl), *Figur auf Palette* (alle Pixel auf die nächste Palettenfarbe). Die aktive Palette steht links bei den Werkzeugen, „+“ übernimmt die aktuelle Farbe.
- **Profi-Werkzeuge**: Pinselgröße 1–4 (`[` `]`), Dithering (D), Farbe ersetzen auf der ganzen Ebene (F), Aufhellen (U) / Abdunkeln (J), Hand (H, Leertaste oder mittlere Maustaste), Zoom per Mausrad, zwei Fingern oder Knöpfen (`0` = einpassen), Raster ein/aus mit 8-px-Hilfslinien. Ebenen-Menü: Duplizieren, Mit Ebene darunter zusammenführen, Umriss hinzufügen, Als Teil speichern, Löschen.

**Version 1.8 – Spiel-Profil im Setup**

- Neuer erster Schritt im Assistenten **„Spiel“**: Ansicht (Top-Down, Isometrisch; Side-Scroller und Hexagonal als „bald“ markiert), **Genre** (Action-Roguelite, Dungeon-Crawler, RPG/Abenteuer, Taktik, Puzzle, Anderes) und **Aufwand** (Klein & schnell, Mittel, Groß & detailliert). Daraus werden Map-Größe, Raumanzahl und -größen, Gänge, Spezialräume, Deko, Gelände und Boden-Varianten voreingestellt – alle Regler bleiben in den folgenden Schritten änderbar. Die Perspektiven-Auswahl zeigt nur, was zur Ansicht passt.
- Das Profil wird im Projekt gespeichert (`project.profile`), ältere Projekte bekommen es automatisch; angezeigt auf der Seite „Projekt“. Neu: `profiles/index.ts`.

**Version 1.7 – Reiter, Startseite**

- Neue Kopfzeile mit Reitern: **Projekt · Karte bauen · Charakter bauen · Objekt bauen · Einstellungen**, dazu der runde **▶ Testen**-Knopf (startet den Playtest, wechselt dafür bei Bedarf zur Karte). **Generieren** und der Würfel **Neue Variante** (neuer Seed = gleiche Einstellungen, andere Zufallsverteilung) erscheinen nur auf „Karte bauen“ im automatischen Modus.
- Die App öffnet mit der Seite **Projekt**: *Neues Projekt* (Setup-Assistent), *Projekt öffnen* (`.mapforge.json` hochladen oder hineinziehen), *Weiter bearbeiten* und die Liste *Zuletzt bearbeitet*. Darunter Name, Speichern und Export des offenen Projekts (vorher im linken Panel bzw. unter „Export“).
- Einstellungen sind eine eigene Seite (Zahnrad an der Karte führt dorthin). Kollisionen lassen sich direkt an der Karte ein-/ausblenden (Knopf mit Schraffur).
- Pinselgröße frei 1–32 („…“ neben 1/2/3/5).
- **Charakter bauen / Objekt bauen** (neue Seiten): Baukasten mit Teilen rechts – antippen oder auf die Figur ziehen (Handy: kurz halten, dann ziehen), jedes Teil rastet an seiner Stelle ein. Charaktere (32 × 32, Chibi von vorn): Körper (Normal, Kräftig, Schlank, Klein), Gesicht, Haare, Kopf-Extra (Elfenohren, Hörner, Bart …), Oberteil, Hose, Schuhe, Hände, Kopfbedeckung, Waffe, zweite Hand, Schatten. Kleidung, Haare und Waffen passen sich dem Körper an. Objekte: Grundform (Truhe, Fass, Kiste, Krug, Wegweiser, Säule, Baum, Fels, Feuerschale, Tisch, Bücherregal, Kristall, Blumentopf) + beliebig viele Details (Beschläge, Schloss, Moos, Risse, Gold, Runen, Spinnweben, Edelsteine) und Effekte (Feuer, Funkeln, Rauch, Leuchten).
- Selbst zeichnen: Stift, Radierer, Füllen, Pipette, Linie, Rechteck, Ebene verschieben, Spiegel-Zeichnen; Ebenen (Reihenfolge, Sichtbarkeit, spiegeln, löschen); Undo/Redo; Farben je Gruppe (Haut, Haare, Farbe 1/2, Metall, Holz, Stein, Pflanze) mit Vorlagen oder eigener Farbe; **Zufall** mit Schloss pro Gruppe; **Als Teil speichern** (Ebene oder ganze Figur → erscheint in der Auswahl); **Galerie** gespeicherter Figuren; **PNG-Export** 1×/2×/4×/8×. Gespeichert wird im Browser.

**Version 1.6.1 – Rechteck-Radierer**

- Radierer im Rechteck-Modus (▭): Bereich aufziehen und auf dem aktiven Layer löschen; „Alle Layer“ leert alle ungesperrten Layer, Objekte und Struktur im Rechteck. Einstellungen → „Map leeren“ leert die ganze Map. Jeweils ein Undo-Schritt.

**Version 1.6 – exakte Formen, saubere Ecken, lernende Tile-Erkennung**

- Raumformen exakt: Rechteck, L, T, Kreuz und Halle werden nicht mehr „angefressen“ (vorher rauten die Kanten jeder Form mit dem Regelmäßigkeits-Regler auf). Der Regler heißt jetzt „Unregelmäßigkeit“, wirkt nur auf die Form „Unregelmäßig“ und erscheint nur, wenn sie gewählt ist. Gewählte Formen werden gleichmäßig verteilt (12 Räume, 3 Formen → je 4). Räume werden nie unter die Mindestgröße verkleinert.
- 3/4-Ansicht: Ecken sind echte Übergänge – die Seitenkante der linken/rechten Wand geht nahtlos in die Oberkante der Wandfront bzw. in die untere Abschlusskante über (kein überstehender „Pfosten“ mehr). Wo eine Wandfront neben Boden endet (Innenecke eines L, Gangmündung), setzt der Generator automatisch ein Endstück mit sichtbarer Seitenfläche (Tags `end_l` / `end_r`, auch beim manuellen Malen mit Auto-Wände). Die untere Wand zeigt weiterhin nur ihre Oberkante.
- Lernen: jede Zuordnung (Tile-Menü, Inspektor, „Vorschläge bestätigen“, „In Bibliothek“) wird als Beispiel gespeichert (visueller Fingerabdruck: 8×8-Helligkeit, Transparenz, Farbe, 1-px-Kanten), automatisch auch gespiegelt (eine korrigierte linke Wand/Ecke lernt die rechte mit). Neue Tiles übernehmen den Typ des ähnlichsten gelernten Beispiels vor der Regel-Erkennung; im Tile-Menü werden gleich aussehende Tiles desselben Tilesets sofort mit vorgeschlagen. Einstellungen → Tile-Erkennung zeigt die Anzahl und kann das Gelernte löschen. Gespeichert lokal im Browser.
- Tilegröße wird aus dem Bildinhalt erkannt (Kachelgrenzen = Farbsprünge, Kachelmitte nicht) – 32-px-Tiles werden nicht mehr in 16-px-Viertel zerlegt.
- Regel-Erkennung: 3/4-Wandfronten, die ins Dunkle abfallen (Grube/Schatten), werden als Wandfront erkannt.
- Neu: `tilesets/learning.ts`.

**Version 1.5 – automatische Tile-Zuordnung**

- Beim Hochladen (Setup-Assistent und Tiles → Tilesets) wird jedes Tile automatisch erkannt: Boden (mit Material-Tag stone/grass/sand/wood), Wände (helle Kante zeigt zum Boden → Wand ↑/↓/←/→, Durchgangswand, Innenecke, Endstück, Kreuzung), Außenecken (heller Eckpunkt), Wandfront, Bodenrand, Wasser, Lava, Abgrund, Brücke, Deko/Hindernis (Form auf Transparenz). Trefferquote auf den Demo-Tilesets 65–83 % (nach Gruppe).
- Jedes Tile zeigt seine Zuordnung als Label („Boden“, „Wand ↑“, „Ecke ┌“ …), farbig nach Gruppe (grün Boden, lila Wände/Ecken, blau Wasser/Lava/Abgrund, orange Türen/Brücken/Treppen, gelb Objekte, „?“ = ohne Zuordnung). Gestrichelt = automatischer Vorschlag, ausgefüllt = bestätigt; jede Änderung im Inspektor bestätigt das Tile.
- Übersicht pro Tileset („20 Boden · 8 Wände/Ecken · 3 ohne Zuordnung“) mit „Automatisch zuordnen“ (erkennt nur Unzugeordnetes und unbestätigte Vorschläge neu, eigene Zuordnungen bleiben) und „Vorschläge bestätigen“. In der Palette per Schalter „Zuordnung“ ein-/ausblendbar; Filter „Ohne Kategorie“ zeigt nicht zugeordnete Tiles.
- Tile-Auswahlmenü beim Hochladen (Setup → Tiles → Neues Tileset): Tile antippen → Menü mit allen Typen (Boden, Wände, Ecken außen/innen, Wandfront, Wasser, Lava, Abgrund, Brücke, Tür, Treppe, Deko …), jeweils mit kleiner Raumskizze (dunkel = Boden, hell = Wand, Rahmen = dieses Tile). Nach der Wahl springt das Menü zum nächsten Tile (abschaltbar), ◀ ▶ blättern, „Keine Zuordnung“, „Mehr Optionen“ öffnet den vollen Inspektor. Mit „Mehrfachauswahl“ mehrere Tiles markieren und einen Typ für alle wählen.
- Neu: `tilesets/autoAssign.ts`, `tilesets/TileLabel.tsx`, `tilesets/QuickPick.tsx`.

**Version 1.4.1 – Stabilität**

- **Fehler behoben: schwarzer Bildschirm nach „Weiter“ im Setup** (u. a. Chrome 153 auf Android, Fehler „l is not a function“). Ursache: `useEffect(() => bodyRef.current?.scrollTo(...))` gab den Rückgabewert von `scrollTo()` zurück; neue Chrome-Versionen liefern dort ein Promise, das React beim Schrittwechsel als Aufräumfunktion aufrief. Alle Effekte geben jetzt nichts mehr zurück. Das war auch die Ursache des früher gemeldeten „schwarzen Bildschirms nach Low Top-Down“.

- Fehleranzeige statt schwarzem Bildschirm: Abstürze in Editor oder Assistent zeigen die Fehlermeldung mit „Fehler kopieren“, „Erneut versuchen“, „Assistent schließen“, „Neu laden“. Der letzte Fehler bleibt gespeichert und erscheint nach dem Neuladen als Hinweis.
- Datenbank: Ist eine ältere MapForge-Version noch in einem anderen Tab / als App geöffnet, hängt die App nicht mehr (Timeout, Hinweis), „Map erstellen“ / „Baukasten öffnen“ laufen trotzdem durch; alte Verbindungen geben die Datenbank für neuere Versionen frei.
- Manueller Modus: leere Map zeigt eine Startkarte (Startraum anlegen · Raum aufziehen · Automatisch generieren) statt einer dunklen, leeren Fläche.

**Version 1.4 – flexible Desktop-Panels**

- Seitenpanels per Drag in der Breite, Layer/Tiles in der Höhe änderbar, einklappen (Icon-Leiste), schließen/öffnen über die Topbar, maximieren (Esc/Klick daneben stellt wieder her), Doppelklick = Standardgröße, Layout zurücksetzen.
- Einstellungen sind ein Tab im linken Panel (statt Popover).
- Panel-Zustand wird lokal gespeichert. Mobile unverändert (Bottom Sheets).
- Neu: `store/layoutStore.ts`, `components/desktop/Dock.tsx`; geändert: `components/DesktopLayout.tsx`, `components/SettingsPanel.tsx`, `components/icons.tsx`, `styles/index.css`.

**Version 1.3 – Tileset-Auswahl, Bibliothek, Baukasten-Vorbereitung**

- **Fehler behoben: schwarzer Bildschirm** bei Low Top-Down bzw. nach dem Deaktivieren von Tilesets. Ursache: Der Generator nutzte nur aktive Tilesets, die für die Perspektive markiert sind; gab es keine (z. B. alle Demo-Sets aus, eigenes Set nur „Top-Down“), blieben alle Layer leer – ohne Meldung. Jetzt: Fallback über andere aktive Tilesets und die Demo-Tiles, Meldung mit fehlenden Rollen, Fehler beim Generieren werden abgefangen und angezeigt.
- Setup: neue Schritte **Modus** und **Tiles** (Vorhandenes Tileset / Hochladen / Demo), Flow abhängig vom Modus.
- Tileset-Bibliothek in IndexedDB, „In Bibliothek“ im Tileset-Panel; Upload-Editor im Assistenten nutzt denselben Tile-Inspektor wie der Editor.
- Manueller Modus (`project.mode`) mit leerem Strukturraster, Baukasten-Hinweis im Generator-Panel, Umschalten auf automatisch.
- Perspektiv-Vorschau Low Top-Down: obere Wand mit Wandhöhe, linke/rechte Wand mit sichtbarer Seitenfläche, unten nur schmale Abschlusskante (Raum offen zum Spieler).

**Geänderte / neue Dateien (1.3)**

- Neu: `components/wizard/TilesStep.tsx`, `tilesets/library.ts`
- Geändert: `tilesets/tilePools.ts` (Stufen-Fallback), `generator/index.ts` (Hinweis, `emptyResult`), `store/projectStore.ts` (Modus, Bibliothek, Fehlerbehandlung), `persistence/db.ts` (Store `library`), `persistence/migrate.ts`, `types/index.ts` (`ProjectMode`), `tilesets/slicing.ts` (`applyTileMeta`), `tilesets/TilesPanel.tsx` (Inspektor wiederverwendbar, „In Bibliothek“), `components/wizard/SetupWizard.tsx`, `components/wizard/PerspectivePreview.tsx`, `generator/perspective.ts`, `components/GeneratorPanel.tsx`, `mobile/MobileLayout.tsx`, `editor/useShortcuts.ts`, `layers/defaults.ts`, `styles/index.css`

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
