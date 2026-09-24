# Übergabe – MapForge (Stand 2026-09-24)

Repo `lars0308/MapApp`, Branch `claude/pixelart-map-generator-tnosue` (letzter Commit: „8 Richtungen …“, Version 2.9 im README).
Vite + React + TypeScript + zustand. `npm run build` (tsc + vite). Antworten/UI auf Deutsch, UI selbsterklärend, mobil zuerst, keine Fake-Features.

## Stand (fertig, gepusht)
- Karten: Top-Down, Low Top-Down, „45°“ (orthogonal), Side-Scroller (Generator, Physik, Leitern, Aufzüge), Hexagonal (Welt-Generator, Flüsse/Straßen Auto-Anschluss).
- Editor: Pinsel, Radierer (auch Rechteck/alle Layer), Füllen, Rechteck, Pipette, Auswahl, Verschieben, Hand (Standard). Auto-Wände inkl. Kollision.
- Figuren/Kreaturen/Objekte-Baukasten, 5 Ansichten (vorne, schräg ↘, Seite, schräg ↗, hinten; links gespiegelt = 8 Richtungen), Waffe immer rechte Hand, zeigt in Blickrichtung.
- Animieren: eingebaute + eigene Animationen, Bild-für-Bild-Bearbeitung, Zoom, Export PNG/Godot-Paket (4 oder 8 Richtungen oder 2 für Platformer).
- Godot-4.3-Export (Karte + Spieler/Gegner-Skripte), headless in Godot 4.3 geprüft.
- Wichtige Dateien: `src/editor/MapCanvas.tsx` (Eingabe/Werkzeuge), `src/editor/tools.ts`, `src/store/editorStore.ts`, `src/store/projectStore.ts` (beginStroke/strokeSet/strokeSetLayer/endStroke = Undo-Schritt), `src/renderer/MapRenderer.ts` (overlay.preview/selection), `src/editor/Toolbar.tsx`, `src/editor/useShortcuts.ts`, `src/layers/LayersPanel.tsx`, Sprites in `src/sprites/*`.

## Gerade in Arbeit (noch nicht begonnen im Code)
1. **Kopieren/Einfügen + Stempel**: Auswahl (Werkzeug „Auswahl“) → Kopieren (Strg+C / Knopf) speichert alle Layer-Tiles des Bereichs (+ Objekte) im editorStore als `clipboard`; Werkzeug „Stempel“/Einfügen zeigt Vorschau unter dem Finger, Tippen setzt ein (ein Undo-Schritt, danach `applyAutoWalls`). Auch: Strg+X, Entf löscht Auswahl.
2. **Tiles drehen/spiegeln**: Tile-Flags in gid (z. B. hohe Bits wie Tiled: H/V/Diagonal) → Renderer, Pipette, Godot-Export (TileMapLayer alternative tiles bzw. `TileSetAtlasSource.TRANSFORM_FLIP_H/V/TRANSPOSE`) berücksichtigen. Knöpfe „↻ drehen“ / „⇋ spiegeln“ in der Toolbar für den aktuellen Pinsel/Stempel.
3. **Minimap + Layer-Deckkraft**: kleine Übersichtskarte (antippen = hinspringen, Rahmen = sichtbarer Bereich); Deckkraft-Regler pro Layer im LayersPanel (Renderer + im Projekt speichern, Export ignoriert sie).

## Danach offen
4. Eigene Figuren/Objekte aus dem Baukasten als Objekte auf die Karte (+ Godot-Export).
5. Gegner/Beute automatisch nach Raumtyp/Distanz platzieren; Gegner auch im App-Testspiel.
6. Weitere Biome (Höhlen per Cellular Automata, Außenbereiche, Dörfer).
7. Echtes isometrisches Rautenraster + Höhenebenen.
8. Godot-Terrain-Set für Wände; direkter `.tscn`/`.tres`-Export.
9. Tilesets mit Rand/Abstand, nicht-quadratische Tiles; Generator im Web Worker.
10. README „Bekannte Einschränkungen“: Satz „Godot-Script nicht in Godot getestet“ ist veraltet → entfernen.

## Tests
Playwright-Skripte lagen nur im Scratchpad der Sitzung (nicht im Repo). Vorgehen: `npm run build`, `npx vite preview --port 4173`, mit Playwright (Chromium unter `/opt/pw-browsers`) prüfen, Handy 390 px ohne horizontales Scrollen. Beim Start erscheint zuerst eine Auswahlseite (Karte/Figuren/Animieren fragen erst, was man machen will).
