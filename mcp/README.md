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

Ist kein Tab verbunden, startet der Server MapForge selbst in einem unsichtbaren Browser (installiertes Chrome/Edge oder `MAPFORGE_CHROME=/pfad/zu/chrome`). Die Karten dieses Browsers liegen zunächst in `~/.mapforge-mcp/`. Sobald du MapForge unter `http://127.0.0.1:8765/?ai=1` öffnest, werden die Karten der KI in deinen Tab übernommen, auch aus früheren Sitzungen. Du findest sie unter *Karte → Gespeicherte Karten* (Abzeichen „KI“). Danach arbeitet die KI in deinem Tab weiter.

## KI von überall (Handy, claude.ai, ohne eigenen Server)

Die App kann auch über das Internet gesteuert werden – auch am Handy, ohne PC:

1. MapForge öffnen → **Einstellungen → KI von überall** einschalten.
2. Die angezeigte **Adresse** kopieren (`https://…supabase.co/functions/v1/mapforge-mcp/<Kopplungscode>`).
3. In Claude (App, claude.ai oder Desktop): **Einstellungen → Connectors → Eigenen Connector hinzufügen** → Adresse einfügen.
4. Die App offen lassen, während die KI arbeitet. Exportierte ZIPs werden auf dem Gerät gespeichert, auf dem MapForge läuft.

Technik: `supabase/functions/mapforge-mcp` (Supabase Edge Function, MCP über HTTP, ohne JWT – der Kopplungscode ist das Geheimnis) leitet jeden Tool-Aufruf über Supabase Realtime (Kanal `mapforge-<code>`) an den Tab weiter; die Antwort kommt in Stücken (≤ 150 KB) zurück. Eingerichtet im Supabase-Projekt „MapForge“ (`uqimzsputtnajpsficao`). Neu ausrollen nach Änderungen an `src/api/spec.json`: `npm run build` (kopiert die Befehlsliste) und `supabase functions deploy mapforge-mcp --no-verify-jwt`. Eigenes Projekt: in der App unter „Vermittler (Supabase)“ Adresse und öffentlichen Schlüssel eintragen oder `VITE_MAPFORGE_RELAY_URL` / `VITE_MAPFORGE_RELAY_KEY` setzen.

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
