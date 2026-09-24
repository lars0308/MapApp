# MapForge-KI-Server (MCP)

Damit kann eine KI MapForge bedienen: Karten erzeugen und bearbeiten, Objekte setzen, Figuren bauen, Bilder ansehen und alles als Godot-Paket exportieren. Die Befehle laufen in der echten App: Du siehst im Browser live zu und kannst alles rückgängig machen.

```
KI  ⇄ MCP (stdio) ⇄ mcp/server.mjs ⇄ WebSocket ⇄ MapForge im Browser
```

## Einrichten

1. Im MapForge-Ordner: `npm install && npm run build` (die gebaute App liegt dann in `dist/`), danach `cd mcp && npm install`.
2. Den Server in der KI eintragen (Claude Desktop, Claude Code, Cursor …):

```json
{
  "mcpServers": {
    "mapforge": { "command": "node", "args": ["/PFAD/ZU/MapApp/mcp/server.mjs"] }
  }
}
```

   Claude Code: `claude mcp add mapforge -- node /PFAD/ZU/MapApp/mcp/server.mjs`

3. MapForge öffnen (z. B. http://127.0.0.1:8765/ – der Server liefert die App mit aus – oder deine Vercel-Adresse) und **Einstellungen → KI-Verbindung** einschalten. Der Tab verbindet sich und die KI arbeitet darin.

Ist kein Tab verbunden, startet der Server MapForge selbst in einem unsichtbaren Browser (installiertes Chrome/Edge oder `MAPFORGE_CHROME=/pfad/zu/chrome`). Die Projekte dieses Browsers liegen in `~/.mapforge-mcp/`.

## Ohne MCP (jedes Programm)

`node server.mjs --no-stdio` startet nur den HTTP-Teil:

```
POST http://127.0.0.1:8765/command   {"command": "new_map", "args": {"view": "top_down"}}
GET  http://127.0.0.1:8765/spec      alle Befehle mit Parametern (JSON-Schema)
GET  http://127.0.0.1:8765/health    läuft / verbunden?
```

Antwort: `{"ok": true, "data": …, "text": …, "binary": {"kind": "image"|"file", "mime", "name", "base64"}}` oder `{"ok": false, "error": "…"}`.

Im Browser selbst (Konsole): `await mapforge.run('status')`.

## Befehle

Liste mit Parametern: `src/api/spec.json`. Kurz:

- **Karte:** `status`, `new_map`, `generate`, `get_generator`, `set_generator`, `list_tiles`, `list_layers`, `get_map`, `paint`, `fill`, `clear_area`, `copy_paste`, `list_objects`, `place_object`, `remove_object`, `set_layer`, `undo`, `redo`
- **Ansehen & Export:** `render` (PNG wie im Editor), `export_godot` (ZIP → Datei), `export_json`
- **Projekte:** `save`, `list_projects`, `open_project`, `show`
- **Figuren:** `figure_status`, `figure_parts`, `figure_set_part`, `figure_remove_slot`, `figure_color`, `figure_new`, `figure_random`, `figure_render`, `figure_save`, `figure_export_godot`, `figure_use_as_player`

Exportierte Dateien landen in `~/MapForge-Exporte/` (oder `MAPFORGE_EXPORTS`, oder `path` im Aufruf).

## Einstellungen (Umgebung)

| Variable | Standard | |
|---|---|---|
| `MAPFORGE_PORT` | 8765 | Port für App, HTTP und WebSocket (nur 127.0.0.1) |
| `MAPFORGE_URL` | die mitgelieferte App | App-Adresse für den unsichtbaren Browser |
| `MAPFORGE_CHROME` | – | Pfad zu Chrome/Chromium |
| `MAPFORGE_HEADLESS` | 1 | `0` = nie selbst einen Browser starten |
| `MAPFORGE_EXPORTS` | `~/MapForge-Exporte` | Ordner für ZIP-Dateien |

Sicherheit: Der Server hört nur auf 127.0.0.1. Die App verbindet sich nur, wenn du den Schalter einschaltest (oder sie mit `?ai=…` öffnest).
