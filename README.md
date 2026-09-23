# MapForge

Prozeduraler 2D-Map-Generator und Tile-Editor für Pixelart-Spiele – direkt im Browser, auf dem Handy wie am Desktop, mit Export nach Godot 4.

- Setup-Assistent für neue Projekte (Perspektive → Map → Räume → Wege → Spezialräume → Ausstattung → Zusammenfassung)
- Drei Perspektiven: Top-Down, Low Top-Down (3/4 mit Wandfronten) und 45° / Isometric-like – alles weiterhin 2D-Tiles
- Dungeon-Generierung aus Räumen, Gängen, Wänden und Spezialräumen (Seed-basiert, reproduzierbar)
- Canvas-Editor mit Pinsel, Radierer, Füllen, Rechteck, Pipette, Auswahl, Hand, Undo/Redo
- Layer-System, eigene PNG-Tilesets, Tile-Kategorien, Tags und Gewichtungen
- Room Graph, Presets, Statistiken
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
| 1 Ansicht | Top-Down, Low Top-Down oder 45° (mit Vorschaubild), Schatten an/aus |
| 2 Map | Breite, Höhe, Tilegröße (16/32/48/64/frei) inkl. Pixelgröße, Seed |
| 3 Räume | Anzahl, Min/Max-Größen, Abstand, Raumformen, Regelmäßigkeit |
| 4 Wege | Gangbreite (Standard/Min/Max), Optionen, Verwinkelung, Direktheit, Vernetzung |
| 5 Spezialräume | Start, Ende, Boss, Schatz, Händler, Quest, Arena, Geheimraum, Rätsel |
| 6 Ausstattung | Boden-Varianten, Deko, Hindernisse, Lava, Wasser – oder **Später konfigurieren** |
| 7 Zusammenfassung | Projektname, alle Werte auf einen Blick, **MAP ERSTELLEN** |

Sind mehr Spezialräume aktiv, als Räume existieren, erscheint „Für diese Auswahl werden mindestens N Räume benötigt“ mit einem Button zum Erhöhen. Wird trotzdem erstellt, erhöht die App die Raumanzahl automatisch und meldet das. Alle Einstellungen des Assistenten werden im Projekt gespeichert und bleiben im Generator-Panel änderbar. Schließen des Assistenten ändert das aktuelle Projekt nicht (beim allerersten Start wird dann eine Demo-Map erzeugt).

## Perspektiven

Die Map bleibt immer ein orthogonales 2D-Raster. Die Perspektive bestimmt, **welche Tile-Rollen** der Generator an Wänden einsetzt:

| Perspektive | Wandlogik |
| --- | --- |
| `top_down` | Wände als flache Kanten (Wand oben/unten/links/rechts, Ecken) |
| `low_top_down` | Wand über einem Raum = **Wandfront** (1 Reihe, Tag `base`) + **Wand oben** als Oberkante darüber; Seitenwände flach |
| `isometric_45` | Wandfront 2 Reihen hoch (`base` + `upper`), Seitenwände mit sichtbarer Fläche (Tag `side`), Schatten auch seitlich |

Tile-Rollen für 3/4-Ansichten: Boden, Wand oben, **Wandfront**, Wand links, Wand rechts, Innenecke, Außenecke, Tür, **Schatten**. Das Demo-Tileset enthält passende Tiles für alle drei Perspektiven.

**Schatten:** Mit „Schatten“ (Assistent oder Generator → Map) schreibt der Generator subtile Schatten unter Wandfronten (bzw. seitlich bei 45°) in den eigenen Layer **Schatten**. Der Layer ist wie jeder andere ein-/ausblendbar und im JSON/Godot-Export optional („Schatten-Layer exportieren“).

**Tilesets & Perspektive:** Unter Tiles → Tilesets lässt sich pro Tileset festlegen, für welche Perspektiven es geeignet ist. Der Generator nutzt nur passende, aktive Tilesets; unpassende werden in der Liste markiert.

**Auto-Tile-Logik:** `generator/autotile.ts` bestimmt für jede Zelle eine Rolle aus ihrer Nachbarschaft (8-Bit-Wandmaske, 4-Bit-Bodenmaske): Wandrichtung, Ecken, Wandfront/Oberkante, Schatten, Boden-Mitte vs. Rand (Boden-Tiles mit Tag `edge` werden automatisch an Rändern verwendet). Masken und Rollen werden exportiert; ein echtes Terrain-System kann später `wallRequest()` ersetzen.

## Bedienung

| Aktion | Handy / Tablet | Desktop |
| --- | --- | --- |
| Malen / Werkzeug anwenden | 1 Finger | Linke Maustaste |
| Map verschieben | 2 Finger oder Hand-Werkzeug | Mittlere/rechte Maustaste, Leertaste + Ziehen, Hand (H) |
| Zoomen | Pinch | Mausrad |
| Rückgängig / Wiederholen | Buttons oben | Strg+Z / Strg+Umschalt+Z (Strg+Y) |
| Werkzeuge | Leiste unten | B, E, F, R, I, M, H |
| Raster / Einpassen | Buttons rechts oben | G / 0 |
| Speichern | Export → Speichern | Strg+S (zusätzlich Auto-Speichern) |
| Generieren | GENERIEREN | Umschalt+Enter |

Handy-Navigation: **Map · Generator · Tiles · Layer · Export**. Panels öffnen sich als Bottom Sheet mit drei Zuständen:

- **eingeklappt** – nur Kopfzeile, Map fast vollständig sichtbar
- **halb geöffnet** – Map verkleinert sich darüber und bleibt sichtbar
- **vollständig geöffnet** – Panel reicht fast bis oben; die Map dahinter ist abgedunkelt und gesperrt

Griff oder Kopfzeile nach oben/unten wischen (ganz nach unten = schließen), Kopfzeile antippen oder ⌃-Button = vollständig öffnen, ✕ = schließen. Der Inhalt scrollt, der Kopfbereich bleibt fixiert. Im Querformat werden Navigation und Panels seitlich angeordnet. Alle Slider haben ein editierbares Zahlenfeld.

**Seeds:** `GENERIEREN` nutzt den aktuellen Seed – gleicher Seed + gleiche Einstellungen = exakt dieselbe Map. `Neuer Seed` würfelt und generiert sofort. Seeds dürfen Zahlen oder beliebiger Text sein.

**Eigene Tilesets:** Tiles → Tilesets → *PNG-Tileset hochladen*. Tilegröße (16/32/48/64 oder frei) wählen, dann in der Palette Tiles antippen und Kategorie, Gewichtung und Tags setzen. Mit *Mehrfachauswahl* lassen sich viele Tiles auf einmal kategorisieren. Filtert man die Palette nach einer Kategorie, erscheinen Gewichtungs-Slider samt Prozentanteil. Der Generator nutzt alle *aktiven* Tilesets.

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
  "version": 1,
  "format": "mapforge-godot",
  "map": { "name": "Dungeon", "width": 60, "height": 60, "tileSize": 48, "perspective": "low_top_down", "shadows": true, "seed": "12345" },
  "tilesets": [
    { "id": "demo_dungeon", "name": "Demo Dungeon", "image": "tilesets/demo_dungeon.png",
      "tileSize": 48, "sourceTileSize": 16, "columns": 8, "rows": 6,
      "perspectives": ["top_down", "low_top_down", "isometric_45"],
      "tiles": [{ "id": 0, "atlas": [0, 0], "category": "floor", "tags": ["stone"], "weight": 70 }] }
  ],
  "layers": [
    { "id": "layer_…", "name": "Boden", "role": "floor", "visible": true, "zIndex": 0,
      "tiles": [{ "x": 12, "y": 7, "tileset": "demo_dungeon", "tile": 0, "atlas": [0, 0], "category": "floor" }] }
  ],
  "rooms": [
    { "id": 0, "type": "start", "shape": "rect", "x": 10, "y": 5, "width": 12, "height": 9,
      "center": [16, 9], "connectedRooms": [3, 4], "start": true, "end": false, "boss": false, "special": null }
  ],
  "connections": [{ "id": 0, "from": 0, "to": 3, "kind": "main", "width": 2, "length": 23 }],
  "doors": [{ "x": 22, "y": 9, "roomId": 0 }],
  "spawnPoints": [{ "id": "player_0", "type": "player", "x": 15, "y": 9, "roomId": 0, "properties": {} }],
  "spawnTypes": ["player", "enemy", "loot", "npc", "quest"],
  "structure": { "encoding": "rle", "legend": { "0": "void", "1": "room", "2": "corridor", "3": "wall", "4": "hazard" }, "cells": [], "wallMask": [], "floorMask": [] }
}
```

- Tileset-Bilder werden beim Export (Nearest Neighbour) auf die Map-Tilegröße skaliert. In Godot gilt damit `TileSet.tile_size == texture_region_size == map.tileSize`.
- `atlas` sind genau die Koordinaten für `TileMapLayer.set_cell(coords, source_id, atlas_coords)`.
- `structure` (lauflängenkodiert) enthält das Raster aus Raum/Gang/Wand/Gefahr plus 8-Bit-Nachbarmaske der Wände – die Grundlage für späteres echtes Auto-Tiling (Terrain-Sets).

### In Godot 4 verwenden (4.3+)

1. Godot-Paket entpacken und nach `res://mapforge/` kopieren.
2. Szene mit einem `Node2D` anlegen, `mapforge_loader.gd` anhängen.
3. `map_json_path` auf `res://mapforge/map.json` lassen und starten.

Das Script liest die Metadaten, baut ein `TileSet` mit einer `TileSetAtlasSource` pro Tileset (inkl. Custom-Data-Layer `category`), erzeugt pro MapForge-Layer einen `TileMapLayer`-Node und füllt ihn per `set_cell()`. Tiles auf dem Kollision-Layer bekommen ein Kollisionspolygon, Spawnpunkte werden zu `Marker2D`-Nodes. Mit `get_room_by_type("start")` und `room_center_position()` lässt sich z. B. die Kamera am Startraum ausrichten.

---

## Architektur

```
src/
  types/        Datenmodell (Project, Layer, Tileset, Room, GenerationResult …)
  generator/    Prozedurale Generierung – reine Funktionen, keine DOM-Abhängigkeit
    perspective.ts Perspektiven (Wandreihen, Seitenflächen), benötigte Raumanzahl
    autotile.ts   Rollen je Zelle: Wandrichtung, Front/Oberkante, Schatten, Boden-Rand
    rng.ts        deterministischer Zufall (mulberry32), Seed-Hashing
    shapes.ts     Raumformen (Rechteck, L, T, Kreuz, unregelmäßig, Halle)
    rooms.ts      Platzierung + Verteilungsmodi, Überschneidungsschutz
    graph.ts      Raumgraph (Kette/MST + Schleifen + alternative Verbindungen)
    corridors.ts  A*-Gänge mit Rausch-/Kurvenkosten, L/Z-Gänge, Abzweigungen, Sackgassen
    specials.ts   Start/Ende (größte Graph-Distanz), Boss, Schatz …
    index.ts      Pipeline: Räume → Graph → Gänge → Wände → Türen → Spezialräume → Tiles
    presets.ts    Standardwerte und Presets
  renderer/     Canvas-Renderer (sichtbarer Ausschnitt, Chunk-Cache beim Herauszoomen), Room Graph
  editor/       Map-Canvas mit Pointer-/Touch-Gesten, Werkzeuge, Toolbar, Shortcuts
  tilesets/     Demo-Tileset (prozedural gezeichnet), Zuschnitt, Kategorien, Palette, Gewichtungen
  layers/       Standard-Layer, Layer-Panel
  export/       JSON/Godot, PNG, ZIP-Writer, GDScript
  persistence/  IndexedDB, Auto-Speichern, Projektdatei (RLE), Migration älterer Projekte
  store/        Zustand (zustand), Undo/Redo-History, Event-Kanäle Store → Renderer
  components/   Desktop-Layout, UI-Bausteine, Generator-Panel
    wizard/       Setup-Assistent + Perspektiv-Vorschauen
  mobile/       Mobile-Layout, Bottom Sheet
```

Wichtige Entscheidungen:

- **Layer-Daten** liegen als `Uint32Array` (eine globale Tile-ID pro Zelle, 0 = leer). Jedes Tileset besitzt einen eigenen ID-Bereich (`firstGid`, wie in Tiled). Malen verändert die Arrays direkt und meldet nur die geänderten Zellen an den Renderer.
- **Rendering** ausschließlich über Canvas 2D: beim Hineinzoomen werden nur sichtbare Tiles gezeichnet, beim Herauszoomen gecachte 16×16-Chunks – auch 256×256-Maps bleiben flüssig.
- **Undo/Redo**: Mal-Aktionen als Zell-Diffs, strukturelle Aktionen (Generieren, Layer, Resize) als Snapshots, mit Speicherbudget.
- **Determinismus**: jeder Generator-Schritt hat einen eigenen, aus dem Seed abgeleiteten Zufallsstrom. Deko-Einstellungen ändern daher nicht das Layout.
- **Generator-Layer** besitzen eine Rolle (`floor`, `walls`, `objects` …). Beim Generieren werden nur diese Layer neu geschrieben; eigene/duplizierte Layer (`custom`) bleiben erhalten.

## Bekannte Einschränkungen

- Wände nutzen eine regelbasierte Zuordnung (Richtung, Ecken, Wandfront/Oberkante). Echtes 47-Tile-Auto-Tiling ist vorbereitet (`wallMask`, `floorMask`), aber noch nicht umgesetzt; Eckkacheln werden nicht gedreht.
- 45° / Isometric-like ist kein echtes isometrisches Rautenraster, sondern eine 2D-Darstellung mit doppelt hohen Wandfronten und sichtbaren Seitenwänden. Ein Rautenraster (Godot `TILE_SHAPE_ISOMETRIC`) wäre eine spätere Erweiterung.
- Schatten sind einfache Tiles (kein Licht), nur an Wänden.
- Spezialräume sind im Datensatz und im Room Graph markiert, haben aber noch keine Spielmechanik.
- Spawnpunkte werden nur für Start/Boss/Schatz/Händler/Quest automatisch gesetzt; weitere Spawns manuell über Tiles.
- Auswahl-Werkzeug kann füllen und leeren, aber (noch) nicht verschieben/kopieren.
- Tilesets müssen quadratische Tiles ohne Abstand/Rand haben.
- Große PNG-Exporte sind durch Canvas-Limits des Browsers begrenzt (die App warnt und bietet kleinere Maßstäbe an).
- Generierung läuft im Haupt-Thread (bei 256×256 mit 60 Räumen ca. 0,5 s).
- Kein direkter `.tscn`-Export – der Loader baut die Szene zur Laufzeit. Das Script liegt auch im Repo unter `godot/mapforge_loader.gd`.

## Sinnvolle nächste Erweiterungen

- Auto-Tiling mit Terrain-Regeln (Bitmask 16/47) und Export als Godot-Terrain-Set
- Direkter `.tscn`/`.tres`-Export (TileSet-Ressource + Szene)
- Generator im Web Worker, Fortschrittsanzeige für sehr große Maps
- Auswahl kopieren/einfügen/verschieben, Stempel aus mehreren Tiles
- Weitere Biome (Höhlen per Cellular Automata, Außenbereiche, Dörfer)
- Automatische Platzierung von Gegnern/Loot nach Raumtyp und Distanz zum Start
- Minimap, Layer-Deckkraft, Tile-Rotation/Spiegelung
- Tileset-Optionen für Rand/Abstand und nicht-quadratische Tiles

---

## Änderungen

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
