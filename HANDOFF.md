# Übergabe – MapForge (Stand 2026-09-24, Version 3.1)

Repo `lars0308/MapApp`, Branch `claude/pixelart-map-generator-tnosue` (Version 3.7 im README).
Vite + React + TypeScript + zustand. `npm run build` (tsc + vite). Antworten/UI auf Deutsch, UI selbsterklärend, mobil zuerst, keine Fake-Features.

## Stand (fertig, gepusht)
- Karten: Top-Down, Low Top-Down, „45°“ (orthogonal), Side-Scroller (Generator, Physik, Leitern, Aufzüge), Hexagonal (Welt-Generator, Flüsse/Straßen Auto-Anschluss).
- Editor: Pinsel, Radierer (auch Rechteck/alle Layer), Füllen, Rechteck, Pipette, Auswahl, Verschieben, Hand (Standard). Auto-Wände inkl. Kollision.
- Figuren/Kreaturen/Objekte-Baukasten, 5 Ansichten (vorne, schräg ↘, Seite, schräg ↗, hinten; links gespiegelt = 8 Richtungen), Waffe immer rechte Hand, zeigt in Blickrichtung.
- Kein Reiter „Animieren“ mehr (v3.2): Figuren-Baukasten → Tab Export (`src/sprites/ExportPanel.tsx`) mit automatischen Animationen aus `src/sprites/animation.ts`, Godot-Paket/Spritesheet (4/8/2 Richtungen), Spielfigur setzen.
- Godot-4.3-Export (Karte + Spieler/Gegner-Skripte), headless in Godot 4.3 geprüft.
- Wichtige Dateien: `src/editor/MapCanvas.tsx` (Eingabe/Werkzeuge), `src/editor/tools.ts`, `src/store/editorStore.ts`, `src/store/projectStore.ts` (beginStroke/strokeSet/strokeSetLayer/endStroke = Undo-Schritt), `src/renderer/MapRenderer.ts` (overlay.preview/selection), `src/editor/Toolbar.tsx`, `src/editor/useShortcuts.ts`, `src/layers/LayersPanel.tsx`, Sprites in `src/sprites/*`.

## Zuletzt fertig (Version 3.0)
- Kopieren/Ausschneiden/Stempel: `src/editor/clipboard.ts` (Clip, copyArea, pasteClip via `editDoc`, transformClip), Werkzeug `stamp`, Vorschau `overlay.stamp` im Renderer.
- Tile drehen/spiegeln: Bits in der Zellenzahl (`src/tilesets/gid.ts`: FLIP_H 0x10000000, FLIP_V 0x20000000, TRANSPOSE 0x40000000). Überall, wo ein gid inhaltlich gelesen wird, `tileOf(v)` benutzen! Editor-State `tileTurn`. Godot-Export: `alternative` im Tile-JSON.
- Minimap `src/editor/Minimap.tsx` (`renderer.cameraListeners`, `centerOn`), Layer-Deckkraft `layer.opacity` (nur Editor).

## KI-Schnittstelle (Version 3.1)
- Befehle: `src/api/spec.json` (Beschreibung + JSON-Schema, gilt für MCP und App), Umsetzung `src/api/commands.ts` (`runCommand`), WebSocket-Brücke `src/api/bridge.ts`, UI `src/api/AiSection.tsx` (Einstellungen, KI-Badge).
- MCP-Server `mcp/server.mjs` (stdio-MCP, HTTP `/command` `/spec`, WebSocket, liefert `dist/` aus, startet notfalls unsichtbaren Browser via playwright-core). Neuer Befehl = Eintrag in spec.json + Handler in commands.ts.

## Eigene Objekte (Version 3.3)
- `project.customObjects` (CustomObject: png w×h Tiles à 32 px), Registry + dynamischer Atlas in `src/objects/defs.ts` (`objectDef(type)` statt `OBJECT_DEFS[type]` benutzen!, `setCustomObjects` wird in main.tsx bei Projektänderung aufgerufen), Erzeugung `src/objects/fromFigure.ts`, UI: Figuren → Export, Tiles → Objekte.

## KI von überall (Version 3.4)
- Supabase-Projekt „MapForge“ (`uqimzsputtnajpsficao`, eu-central-1, Free) mit Edge Function `mapforge-mcp` (Code in `supabase/functions/mapforge-mcp`, verify_jwt aus, Kopplungscode im Pfad). App-Seite `src/api/relay.ts` (Realtime-Kanal `mapforge-<code>`, Ergebnisse in 150-KB-Stücken, ZIPs werden lokal heruntergeladen), UI `RelaySection` in `src/api/AiSection.tsx`.
- Die Edge Function (v2) fragt `tools/list` live bei der App ab (`__spec`), neue Befehle brauchen kein Redeploy; die mitgelieferte spec.json ist nur Rückfall (deployt ist eine gekürzte Fassung).
- Noch nicht Ende-zu-Ende getestet (Sandbox blockt supabase.co) – erster echter Test durch den Nutzer.

## Gegner & Beute (Version 3.5)
- Generator: `populate()` in `src/generator/index.ts` (Einstellung `generator.population {enemies, loot}`), Truhen als Objekte. Testspiel-Kampf: `src/playtest/combat.ts` (Gegner, Truhen, HUD-Store), eingebunden in `controller.ts` (`renderer.playItems`). Side-Scroller hat noch keinen Kampf im App-Testspiel.

## Danach offen
6. ~~Außenbereiche und Dörfer~~ erledigt: `generator.layout = 'outdoor' | 'village'`. Das nutzt `cavify` und eine Wald-Maske in `src/generator/index.ts`; Häuser setzt `placeHouses`. Höhlen: `src/generator/cave.ts`.
7. Echtes isometrisches Rautenraster + Höhenebenen.
8. Godot-Terrain-Set für Wände; direkter `.tscn`/`.tres`-Export.
9. ~~Tilesets mit Rand/Abstand, nicht-quadratische Tiles~~ erledigt: `repackGrid` in `src/tilesets/slicing.ts` und `recutTileset` im Store; das Original liegt in `Tileset.sourceDataUrl` und `Tileset.cut`. ~~Generator im Web Worker~~ erledigt: `src/generator/worker.ts` und `runner.ts` (`generateAsync`, fällt ohne Worker auf den Hauptthread zurück).

## Tests
Playwright-Skripte lagen nur im Scratchpad der Sitzung (nicht im Repo). Vorgehen: `npm run build`, `npx vite preview --port 4173`, mit Playwright (Chromium unter `/opt/pw-browsers`) prüfen, Handy 390 px ohne horizontales Scrollen. Beim Start erscheint zuerst eine Auswahlseite (Karte/Figuren fragen erst, was man machen will).
