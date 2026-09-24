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

// extra know-how when the AI builds figures (start page "Ritter mit rotem Umhang", a creature, a chest …)
const FIGURES = `

FIGUREN (Charakter, Kreatur, Objekt) – Ziel ist Pixel-Art in sehr hoher Qualität, wie von einem guten Pixel-Artist:
Ablauf:
1. figure_new (kind, name, meist size 32) → figure_parts und figure_status lesen (anatomy zeigt, wo Kopf, Rumpf, Arme, Beine bzw. Körper, Augen, Boden liegen).
2. Basis wählen. Charaktere: fast immer Teile (Körper, Beine, Füße, Oberteil, Gesicht, Haare, Kopfbedeckung, Waffe, Schild, Rücken) – sie passen in allen Ansichten und animieren sauber. Kreaturen/Objekte: passende Teile, sonst figure_new mit empty und alles selbst zeichnen (Körper in slot body bzw. base, Augen/Mund in eigenen Slots).
3. Farben mit figure_color: für jeden Kanal eigene 3 Töne [hell, mittel, dunkel] passend zur Beschreibung oder zum Referenzbild.
4. Mit figure_draw alles ergänzen, was die Teile nicht haben: Wappen, Gürtel, Umhang, Maske, Hörner, Rüstungsplatten, Muster, Glanzlichter, eigene Waffen, ganze Körper. Die richtige slot-Wahl (hat, headx, face, top, back, weapon, offhand, eyes, mouth, horns, body, base, detail …) sorgt dafür, dass Animationen es richtig bewegen.
5. Prüfen: figure_render (view all, scale 8) ansehen, Fehler gezielt verbessern (figure_grid liefert die exakten Pixel einer Ansicht oder eines Layers zum Ändern). Mindestens zwei Prüfrunden. Charakter und Kreatur: zum Schluss auch eine Animation rendern (Charakter walk, Kreatur k_hop, k_crawl oder k_fly – siehe figure_parts).
6. figure_save. Wenn der Nutzer es möchte: figure_use_as_player bzw. figure_to_map + place_object.

Pixel-Art-Regeln:
- Klare, sofort lesbare Silhouette; Merkmale eher übertreiben (großer Hut, breites Schwert, leuchtende Augen).
- 1 px Umriss außen in einem sehr dunklen, farbigen Ton (z. B. #1b1427 oder die dunkelste Stufe der Fläche), nicht reines Schwarz. Innen keine Linien, sondern Schattierung.
- Licht von oben links: pro Material 3–4 Stufen (Glanz, hell, mittel, Schatten); Schatten unten rechts. Kein „Pillow Shading“ (nicht von allen Rändern zur Mitte heller).
- Farbton verschieben: Schatten kühler und satter (Richtung Blau/Violett), Lichter wärmer (Richtung Gelb). Insgesamt eine kleine, stimmige Palette (etwa 12–20 Farben).
- Saubere Linien (gleichmäßige Stufen 1-1, 2-2, 1-2-1 …), keine Einzelpixel-Krümel, Anti-Aliasing nur sparsam an Rundungen. Metall mit hartem Glanzpixel, Stoff weicher.
- Gesicht und Augen mit wenigen, klaren Pixeln; ein heller Glanzpunkt macht Augen lebendig.
- Ansichten: front (zum Betrachter), side (Blick nach rechts), back; fside/bside schräg; links wird gespiegelt. Details, die nur vorne zu sehen sind, mit hide_in_other_views zeichnen und für side/back eigene Versionen zeichnen. Objekte haben nur front.
- Objekte in 3/4-Draufsicht wie die Karte: Oberseite sichtbar und heller, Vorderseite darunter dunkler, unten eine Standfläche mit weichem Schatten (#00000055).
- figure_draw: rows alle gleich lang, ein Zeichen pro Pixel, "." = unverändert. Zeichne pro Aufruf eine Ansicht eines Layers; symmetrische Vorderansichten mit mirror (nur die linke Hälfte zeichnen).
- Referenzbild: Form, Farben und Merkmale übernehmen und in sauberes Pixel-Art im Stil der Figur übersetzen.
- Für Figuren sind 10–30 Werkzeugaufrufe normal. Qualität geht vor Tempo.`;

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
  const figures = body.focus === 'figures';
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
        // drawing a figure view as text pixels needs room
        max_tokens: figures ? 8000 : 3000,
        system: [{ type: 'text', text: figures ? SYSTEM + FIGURES : SYSTEM, cache_control: { type: 'ephemeral' } }],
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
