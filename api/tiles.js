// POST /api/tiles {image, col0, row0, cols, rows, tileSize, view, mode} → {ok, tiles:[{c,r,kind}], cost}
// "Die KI sortiert dein Tileset vor": one section of a tileset (with numbered grid) → what every tile
// is. The app turns the kinds into roles, so the room builder opens already filled.

const GATEWAY = 'https://ai-gateway.vercel.sh/v1/messages';
const MODELS = {
  standard: { id: process.env.MAPFORGE_AI_MODEL || 'anthropic/claude-sonnet-5', input: 2, output: 10 },
  sparsam: { id: 'anthropic/claude-haiku-4.5', input: 1, output: 5 },
};
const MAX_IMAGE = 3_000_000;

const KINDS = [
  'floor', 'floor_variant', 'floor_edge_top', 'floor_edge_bottom', 'floor_edge_left', 'floor_edge_right',
  'floor_corner_tl', 'floor_corner_tr', 'floor_corner_bl', 'floor_corner_br',
  'wall_top', 'wall_bottom', 'wall_left', 'wall_right',
  'corner_tl', 'corner_tr', 'corner_bl', 'corner_br',
  'inner_tl', 'inner_tr', 'inner_bl', 'inner_br',
  'wall_front', 'wall_front_upper', 'door',
  'water', 'lava', 'abyss', 'path', 'bridge', 'stairs', 'deco', 'obstacle', 'pillar', 'shadow',
];

const TOOL = {
  name: 'submit_tiles',
  description: 'Was jede nicht-leere Kachel dieses Ausschnitts ist.',
  input_schema: {
    type: 'object',
    properties: {
      tiles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            c: { type: 'integer', description: 'Spaltennummer (Zahl oben)' },
            r: { type: 'integer', description: 'Zeilennummer (Zahl links)' },
            kind: { type: 'string', enum: KINDS },
          },
          required: ['c', 'r', 'kind'],
        },
      },
    },
    required: ['tiles'],
  },
};

function system(view) {
  return `Du ordnest Kacheln (Tiles) eines Pixel-Art-Tilesets für MapForge zu, einen Kartengenerator (Ansicht: ${view}).
Du siehst einen Ausschnitt des Tilesets mit Raster: Zahlen oben = Spalte (c), Zahlen links = Zeile (r). Gib für JEDE nicht-leere Kachel genau eine Art (kind) ab – immer mit genau einem Aufruf von submit_tiles, ohne Text dazu. Leere / einfarbig-transparente Kacheln und Dinge, die in keine Art passen, weglassen.

So denkt MapForge über einen Raum (von oben gesehen, Boden in der Mitte):
- corner_tl / corner_tr / corner_bl / corner_br: die äußeren Ecken des Raums (oben links / oben rechts / unten links / unten rechts).
- wall_top: Wandstück am oberen Rand des Raums (der Boden liegt darunter); wall_bottom: am unteren Rand (Boden darüber); wall_left: linker Rand (Boden rechts davon); wall_right: rechter Rand (Boden links davon).
- inner_tl / inner_tr / inner_bl / inner_br: Innenecken – wo eine Wand nach innen knickt (L-förmige Räume); die Richtung ist die Ecke, in der die Wand-Masse liegt.
- wall_front: Wand von vorne gesehen (Mauerfläche mit Ziegeln unter einer Wandkante, 3/4-Ansicht); wall_front_upper: die obere Reihe einer zweireihigen Wandfront.
- floor: normaler Boden; floor_variant: Boden mit Rissen, Moos, Flecken; floor_edge_top/…: Boden mit Schatten- oder Randkante zur Wand oben/unten/links/rechts; floor_corner_tl/…: Boden-Ecken mit Randkante an zwei Seiten.
- door: Tür / Durchgang; stairs: Treppe / Leiter; path: Weg (Erde, Pflaster); bridge: Brückenstück; water / lava / abyss: Flüssigkeit / Loch.
- deco: kleine Dinge ohne Kollision (Gras, Blumen, Knochen, Pfützen, Kerzen); obstacle: blockierende kleine Dinge (Kisten, Fässer, Steine, Zaun); pillar: Säule; shadow: halbtransparenter Schatten.
Achte auf die Richtung von Kanten und Schatten: sie verrät, an welcher Seite die Kachel liegt. Sei gründlich – lieber eine plausible Art als gar keine.`;
}

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
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(body.image ?? '');
  if (!m) return res.status(400).json({ ok: false, error: 'Bild fehlt' });
  if (body.image.length > MAX_IMAGE) return res.status(413).json({ ok: false, error: 'Bild zu groß' });
  const token = process.env.AI_GATEWAY_API_KEY || req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN;
  if (!token) return res.status(500).json({ ok: false, error: 'KI ist auf dem Server nicht eingerichtet (AI Gateway)' });
  const model = MODELS[body.mode === 'sparsam' ? 'sparsam' : 'standard'];
  const content = [
    { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
    { type: 'text', text: `Ausschnitt: Spalten ${body.col0}–${body.col0 + body.cols - 1}, Zeilen ${body.row0}–${body.row0 + body.rows - 1}, Kacheln à ${body.tileSize} px. Ordne jede nicht-leere Kachel zu.` },
  ];
  try {
    const r = await fetch(GATEWAY, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: model.id, max_tokens: 8000, system: system(body.view ?? 'top_down'), tools: [TOOL], messages: [{ role: 'user', content }] }),
    });
    const out = await r.json().catch(() => null);
    if (!r.ok) {
      console.error('[mapforge-tiles]', r.status, JSON.stringify(out)?.slice(0, 500));
      return res.status(200).json({ ok: false, error: `KI nicht erreichbar (${r.status})` });
    }
    const call = (out?.content ?? []).find((c) => c.type === 'tool_use');
    const tiles = (call?.input?.tiles ?? []).filter((t) => KINDS.includes(t.kind) && Number.isInteger(t.c) && Number.isInteger(t.r));
    const u = out?.usage ?? {};
    const cost = ((u.input_tokens ?? 0) * model.input + (u.output_tokens ?? 0) * model.output) / 1e6;
    return res.status(200).json({ ok: true, tiles, cost });
  } catch (e) {
    console.error('[mapforge-tiles]', e);
    return res.status(200).json({ ok: false, error: `KI-Zuordnung fehlgeschlagen: ${e?.message ?? e}` });
  }
}
