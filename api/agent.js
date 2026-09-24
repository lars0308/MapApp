import { createRequire } from 'node:module';

// POST /api/agent {messages} → {ok, content, stop_reason}
// One step of the building AI: Claude (Vercel AI Gateway) gets MapForge's command set as tools.
// The browser runs the tools it asks for (runCommand, same as the MCP bridge), sends the results
// back as the next message and calls again until the model is done – so the AI builds the map
// itself: rooms, paths, tiles, objects, figures, obstacles.

const require = createRequire(import.meta.url);
const spec = require('../src/api/spec.json');

const GATEWAY = 'https://ai-gateway.vercel.sh/v1/messages';
// "Gründlich" / "Sparsam" (Einstellungen → KI); US$ per million tokens (Vercel AI Gateway price list)
const MODELS = {
  standard: { id: process.env.MAPFORGE_AI_MODEL || 'anthropic/claude-sonnet-5', input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  sparsam: { id: 'anthropic/claude-haiku-4.5', input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

/** cost of one step in US$ from the usage the model reports */
function costOf(m, u = {}) {
  return ((u.input_tokens ?? 0) * m.input + (u.output_tokens ?? 0) * m.output + (u.cache_read_input_tokens ?? 0) * m.cacheRead + (u.cache_creation_input_tokens ?? 0) * m.cacheWrite) / 1e6;
}
const MAX_BODY = 4_000_000;
// stay inside the open project; saving / exporting is the user's call
const HIDDEN = new Set(['export_godot', 'export_json', 'list_projects', 'open_project', 'save', 'show', 'tileset_add', 'tileset_remove', 'figure_export_godot']);

const TOOLS = spec.commands
  .filter((c) => !HIDDEN.has(c.name))
  .map((c) => ({ name: c.name, description: c.description.slice(0, 1000), input_schema: c.input?.type === 'object' ? c.input : { type: 'object', properties: {} } }));
// tools + instructions are the same every step: cached, later steps read them for a tenth of the price
TOOLS[TOOLS.length - 1] = { ...TOOLS[TOOLS.length - 1], cache_control: { type: 'ephemeral' } };

const SYSTEM = `Du bist der Bau-Assistent von MapForge (Pixel-Art-Karten und Figuren mit Godot-Export) und baust direkt in der App des Nutzers.
${spec.about}

So arbeitest du:
- Du hast Werkzeuge (die Befehle der App). Nutze sie, um das Gewünschte wirklich zu bauen – nicht nur zu beschreiben.
- Grobes zuerst: Einstellungen (set_generator) und generate. Danach Details: paint (Böden, Wege, Wasser, Wände), place_object (Bäume, Felsen, Truhen, Händler, Säulen, Bögen …), copy_paste, figure_* für Figuren und figure_to_map, um sie auf die Karte zu stellen.
- Schau dir dein Ergebnis mit render an (ganze Karte oder Ausschnitt) und bessere nach. Höchstens 3 render-Aufrufe, tile_px klein halten (8–16).
- Fasse gleichartige Arbeit zusammen: paint mit rect oder vielen cells, tileset_assign mit vielen gids auf einmal, mehrere Werkzeuge pro Schritt.
- Eigenes Tileset des Nutzers: tileset_render abschnittsweise (row/rows, col/cols, höchstens etwa 12×12 Tiles pro Bild, damit die gids lesbar bleiben) → tileset_assign. Wichtig sind floor (role floor_center), Wände mit Rollen (wall_top, wall_bottom, wall_left, wall_right, corner_*, inner_corner_*), wall_front bei 3/4-Ansicht, door, water, path, deco, obstacle. Mehrere gids pro Aufruf. Danach generate.
- Mindestens 1 Raum ist erlaubt (roomCount 1).
- Baue nur, was gewünscht ist: Wasser, Lava, Abgründe, Plateaus, Flüsse, Brücken und Häuser nur, wenn der Nutzer sie beschreibt oder das Referenzbild sie zeigt.
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

  const model = MODELS[body.mode === 'sparsam' ? 'sparsam' : 'standard'];
  // cache everything up to the newest message: the next step only pays full price for what is new
  const messages = body.messages.map((m, k) => {
    if (k !== body.messages.length - 1 || !Array.isArray(m.content) || !m.content.length) return m;
    const content = m.content.slice();
    content[content.length - 1] = { ...content[content.length - 1], cache_control: { type: 'ephemeral' } };
    return { ...m, content };
  });
  try {
    const r = await fetch(GATEWAY, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: model.id,
        max_tokens: 3000,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        messages,
      }),
    });
    const out = await r.json().catch(() => null);
    if (!r.ok) {
      console.error('[mapforge-agent]', r.status, JSON.stringify(out)?.slice(0, 800));
      return res.status(200).json({ ok: false, error: `KI nicht erreichbar (${r.status})` });
    }
    return res.status(200).json({ ok: true, content: out?.content ?? [], stop_reason: out?.stop_reason ?? 'end_turn', cost: costOf(model, out?.usage) });
  } catch (e) {
    console.error('[mapforge-agent]', e);
    return res.status(200).json({ ok: false, error: `KI-Schritt fehlgeschlagen: ${e?.message ?? e}` });
  }
}
