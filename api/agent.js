import { createRequire } from 'node:module';

// POST /api/agent {messages} → {ok, content, stop_reason}
// One step of the building AI: Claude (Vercel AI Gateway) gets MapForge's command set as tools.
// The browser runs the tools it asks for (runCommand, same as the MCP bridge), sends the results
// back as the next message and calls again until the model is done – so the AI builds the map
// itself: rooms, paths, tiles, objects, figures, obstacles.

const require = createRequire(import.meta.url);
const spec = require('../src/api/spec.json');

const GATEWAY = 'https://ai-gateway.vercel.sh/v1/messages';
const MODEL = process.env.MAPFORGE_AI_MODEL || 'anthropic/claude-sonnet-5';
const MAX_BODY = 4_000_000;
// stay inside the open project; saving / exporting is the user's call
const HIDDEN = new Set(['export_godot', 'export_json', 'list_projects', 'open_project', 'save', 'show', 'tileset_add', 'tileset_remove', 'figure_export_godot']);

const TOOLS = spec.commands
  .filter((c) => !HIDDEN.has(c.name))
  .map((c) => ({ name: c.name, description: c.description.slice(0, 1000), input_schema: c.input?.type === 'object' ? c.input : { type: 'object', properties: {} } }));

const SYSTEM = `Du bist der Bau-Assistent von MapForge (Pixel-Art-Karten und Figuren mit Godot-Export) und baust direkt in der App des Nutzers.
${spec.about}

So arbeitest du:
- Du hast Werkzeuge (die Befehle der App). Nutze sie, um das Gewünschte wirklich zu bauen – nicht nur zu beschreiben.
- Grobes zuerst: Einstellungen (set_generator) und generate. Danach Details: paint (Böden, Wege, Wasser, Wände), place_object (Bäume, Felsen, Truhen, Händler, Säulen, Bögen …), copy_paste, figure_* für Figuren und figure_to_map, um sie auf die Karte zu stellen.
- Schau dir dein Ergebnis mit render an (ganze Karte oder Ausschnitt) und bessere nach. Höchstens 4 render-Aufrufe.
- Eigenes Tileset des Nutzers: tileset_render abschnittsweise (row/rows, col/cols, höchstens etwa 12×12 Tiles pro Bild, damit die gids lesbar bleiben) → tileset_assign. Wichtig sind floor (role floor_center), Wände mit Rollen (wall_top, wall_bottom, wall_left, wall_right, corner_*, inner_corner_*), wall_front bei 3/4-Ansicht, door, water, path, deco, obstacle. Mehrere gids pro Aufruf. Danach generate.
- Mindestens 1 Raum ist erlaubt (roomCount 1).
- Arbeite zügig: meist 5–20 Werkzeugaufrufe. Stelle keine Rückfragen – triff sinnvolle Entscheidungen.
- Zum Schluss: 2–3 kurze deutsche Sätze (du-Form), was du gebaut hast. Kein Markdown.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST' });
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  const origin = req.headers.origin;
  if (origin && host && new URL(origin).host !== host) return res.status(403).json({ ok: false, error: 'Nicht erlaubt' });
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
  } catch {
    return res.status(400).json({ ok: false, error: 'Ungültige Anfrage' });
  }
  if (!Array.isArray(body.messages) || !body.messages.length) return res.status(400).json({ ok: false, error: 'messages fehlen' });
  if (JSON.stringify(body.messages).length > MAX_BODY) return res.status(413).json({ ok: false, error: 'Verlauf zu groß' });
  const token = process.env.AI_GATEWAY_API_KEY || req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN;
  if (!token) return res.status(500).json({ ok: false, error: 'KI ist auf dem Server nicht eingerichtet (AI Gateway)' });

  try {
    const r = await fetch(GATEWAY, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 4096, system: SYSTEM, tools: TOOLS, messages: body.messages }),
    });
    const out = await r.json().catch(() => null);
    if (!r.ok) {
      console.error('[mapforge-agent]', r.status, JSON.stringify(out)?.slice(0, 800));
      return res.status(200).json({ ok: false, error: `KI nicht erreichbar (${r.status})` });
    }
    return res.status(200).json({ ok: true, content: out?.content ?? [], stop_reason: out?.stop_reason ?? 'end_turn' });
  } catch (e) {
    console.error('[mapforge-agent]', e);
    return res.status(200).json({ ok: false, error: `KI-Schritt fehlgeschlagen: ${e?.message ?? e}` });
  }
}
