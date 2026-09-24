// POST /api/describe → {ok, plan}   (Claude on the Vercel AI Gateway)
//  mode "plan"   {text, image?, tileset?, context}        description (+ reference, + tileset) → build plan
//  mode "refine" {text, image?, map, current, context}    change wish for an existing map → settings patch
//  mode "tiles"  {sheets[], first[], context}             numbered contact sheets of a tileset → tile roles
// The app builds the map from the plan with its own generator (real tiles, collision, Godot
// export) – the model never draws the map.

const GATEWAY = 'https://ai-gateway.vercel.sh/v1/messages';
const MODEL = process.env.MAPFORGE_AI_MODEL || 'anthropic/claude-sonnet-5';
const MAX_TEXT = 3000;
const MAX_IMAGE = 2_500_000; // characters of the data URL

function system(context) {
  return `Du planst Spielkarten für MapForge, einen Pixel-Art-Kartengenerator mit Godot-Export.
Der Nutzer beschreibt sein Spiel oder seine Karte, manchmal mit Referenzbild und/oder eigenem Tileset.
Du antwortest NUR mit einem JSON-Objekt (kein Text davor oder danach) in dieser Form:
{
  "name": "kurzer deutscher Projektname",
  "summary": "1–2 deutsche Sätze: was du baust und warum (du-Form)",
  "view": ${context.views.map((v) => `"${v}"`).join(' | ')},
  "genre": eine passende Genre-ID zur Ansicht,
  "perspective": eine Perspektive, die zur Ansicht passt,
  "width": Zahl 24–160, "height": Zahl 24–160,
  "generator": { nur die Einstellungen, die du ändern willst – gleiche Schlüssel und Form wie die Standardwerte unten },
  "tips": ["höchstens 3 kurze deutsche Tipps für danach, optional"]
}

Ansichten, Perspektiven und Genres:
${JSON.stringify(context.views_detail)}
${JSON.stringify(context.genres)}

Standardwerte des Generators (Top-Down / Isometrisch; Seitenansicht nutzt "side", Hex nutzt "hex"):
${JSON.stringify(context.generator)}

Bedeutung wichtiger Werte:
- layout: "rooms" gebaute Räume und Gänge (Dungeon, Burg, Gebäude), "cave" natürliche Höhle, "outdoor" Waldlichtungen mit Erdwegen, "village" Dorf mit Häusern, "island" Insel im Meer mit Stränden.
- houses: true setzt bei "outdoor" oder "island" Häuser an die Lichtungen (z. B. Insel mit Dorf).
- roomCount = Anzahl Räume/Lichtungen; roomMin/Max W/H = Raumgröße in Kacheln; distribution: even | cluster | center | spread | random.
- terrain: water/lava/abyss/plateaus/bridges usw. mit enabled + amount (0–100). Draußen gibt es keine Abgründe.
- population.enemies / population.loot 0–100; decoDensity, floorVariation, obstacleDensity 0–100; objects.trees/rocks/arches 0–100.
- specials: Spezialräume (start, end, boss, treasure, secret, merchant, quest, arena, puzzle) an/aus – genug Räume dafür einplanen.
- look: softEdges (runde Wege/Ufer), floorPatches, smartDeco, smoothRooms – normalerweise alle true lassen.
- side (Seitenansicht): style, hills, gaps, platforms, ladders, lifts, hazards, enemies, loot.
- hex (Hex-Weltkarte): shape continent|islands, climate temperate|hot|cold, water, mountains, forests, rivers, towns, players, roads, resources.
- seed nicht setzen.

Regeln:
- Halte dich an die Beschreibung. Fehlt etwas, wähle passende, spielbare Werte.
- Referenzbild: Übernimm Stimmung und Aufbau (viel Wasser? Wald? Dorf? enge Gänge? Höhe/Klippen? Dichte der Deko?). Die Grafik selbst kannst du nicht kopieren – nenne im summary kurz, was du übernommen hast.
- Tileset-Bild: Erkenne, was es enthält (Gras, Wasser, Dungeon-Wände, Plattformen …) und wähle Ansicht und layout so, dass die Kacheln passen.
- Karten fürs Handy spielbar halten: meist 48–96 Kacheln pro Seite.`;
}

function refineSystem(context) {
  return `Du passt eine bestehende MapForge-Karte an (Pixel-Art-Kartengenerator mit Godot-Export).
Du bekommst die aktuellen Generator-Einstellungen, ein Bild der aktuellen Karte, oft ein Referenzbild und die Projektbeschreibung des Nutzers sowie seinen Änderungswunsch.
Antworte NUR mit JSON:
{
  "summary": "1–2 deutsche Sätze (du-Form): was du änderst",
  "generator": { nur geänderte Einstellungen, gleiche Schlüssel und Form wie die aktuellen },
  "width": optional neue Breite 16–160, "height": optional neue Höhe 16–160,
  "newSeed": true nur wenn der Nutzer eine ganz neue Variante will,
  "tips": ["höchstens 2 kurze deutsche Tipps, optional"]
}
Die Ansicht (Top-Down, Seitenansicht, Hex …) bleibt gleich. seed nicht setzen.
Bedeutung der Werte wie beim Planen: layout rooms|cave|outdoor|village|island; houses (true = Häuser auch bei outdoor/island); terrain.* enabled/amount; population.enemies/loot; decoDensity; objects.*; specials.*; look.*; side.* (Seitenansicht); hex.* (Hex).
Vergleiche das Bild der aktuellen Karte mit Referenzbild und Wunsch und ändere gezielt, was nicht passt.
Genres/Ansichten zur Orientierung: ${JSON.stringify(context.genres ?? [])}`;
}

function tilesSystem(context) {
  return `Du ordnest die Kacheln eines Pixel-Art-Tilesets für MapForge zu.
Du bekommst Kontaktbögen: jede Kachel vergrößert in einem Feld, darunter ihre Nummer.
Die Karte ist in der Ansicht "${context.perspective}".
Antworte NUR mit JSON: { "summary": "1 deutscher Satz, was im Tileset ist", "tiles": { "<Nummer>": { "category": "...", "role": "... (optional)", "tags": ["..."] } } }
Kategorien: ${JSON.stringify(context.categories)}
Rollen (optional, genauer als die Kategorie): ${JSON.stringify(context.roles)}
Nützliche Tags: Material (grass, stone, wood, sand, dirt, water, snow), Varianten (dark, broken, moss, flowers), bei Wänden base/upper/side, bei Deko was es ist (bones, light, bush, stone …).
Regeln: Nur Kacheln aufnehmen, bei denen du dir sicher bist; leere oder unklare weglassen. Böden: category floor (role floor_center), Wandkronen/Ränder mit passender wall-/corner-Rolle, Wandfronten wall_front, Wasser water, Türen door, Deko deco, Hindernisse obstacle.`;
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Die KI hat keinen Bauplan geliefert');
  return JSON.parse(text.slice(start, end + 1));
}

function imageBlock(dataUrl) {
  const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(dataUrl ?? '');
  if (!m) return null;
  return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST' });
  // only the app itself (same host) may spend model credits
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  const origin = req.headers.origin;
  if (origin && host && new URL(origin).host !== host) return res.status(403).json({ ok: false, error: 'Nicht erlaubt' });
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
  } catch {
    return res.status(400).json({ ok: false, error: 'Ungültige Anfrage' });
  }
  const mode = body.mode === 'refine' || body.mode === 'tiles' ? body.mode : 'plan';
  const text = String(body.text ?? '').trim().slice(0, MAX_TEXT);
  if (mode !== 'tiles' && !text && !body.image) return res.status(400).json({ ok: false, error: 'Beschreibung fehlt' });
  const images = [body.image, body.tileset, body.map, ...(Array.isArray(body.sheets) ? body.sheets.slice(0, 4) : [])];
  if (images.some((i) => (i?.length ?? 0) > MAX_IMAGE)) return res.status(413).json({ ok: false, error: 'Bild zu groß' });
  if (!body.context) return res.status(400).json({ ok: false, error: 'context fehlt' });

  const token = process.env.AI_GATEWAY_API_KEY || req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN;
  if (!token) return res.status(500).json({ ok: false, error: 'KI ist auf dem Server nicht eingerichtet (AI Gateway)' });

  const content = [];
  let sys;
  if (mode === 'tiles') {
    sys = tilesSystem(body.context);
    (Array.isArray(body.sheets) ? body.sheets.slice(0, 4) : []).forEach((sheet, k) => {
      const b = imageBlock(sheet);
      if (b) content.push({ type: 'text', text: `Kontaktbogen ${k + 1} (Kacheln ab Nummer ${body.first?.[k] ?? 0}):` }, b);
    });
    content.push({ type: 'text', text: 'Ordne die Kacheln zu.' });
  } else {
    sys = mode === 'refine' ? refineSystem(body.context) : system(body.context);
    const map = imageBlock(body.map);
    if (map) content.push({ type: 'text', text: 'Aktuelle Karte:' }, map);
    const ref = imageBlock(body.image);
    if (ref) content.push({ type: 'text', text: 'Referenzbild des Nutzers (so soll es aussehen):' }, ref);
    const ts = imageBlock(body.tileset);
    if (ts) content.push({ type: 'text', text: 'Eigenes Tileset des Nutzers (wird in das Projekt übernommen):' }, ts);
    if (mode === 'refine') {
      content.push({ type: 'text', text: `Aktuelle Karte: ${JSON.stringify(body.current ?? {})}` });
      if (body.description) content.push({ type: 'text', text: `Projektbeschreibung: ${String(body.description).slice(0, MAX_TEXT)}` });
      content.push({ type: 'text', text: `Änderungswunsch:\n${text || '(keiner – passe die Karte besser an das Referenzbild an)'}` });
    } else content.push({ type: 'text', text: `Beschreibung des Nutzers:\n${text || '(keine – richte dich nach dem Bild)'}` });
  }
  if (!content.some((c) => c.type === 'image') && mode === 'tiles') return res.status(400).json({ ok: false, error: 'Kontaktbogen fehlt' });

  try {
    const r = await fetch(GATEWAY, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: mode === 'tiles' ? 8000 : 2500, system: sys, messages: [{ role: 'user', content }] }),
    });
    const out = await r.json().catch(() => null);
    if (!r.ok) {
      console.error('[mapforge-describe]', r.status, JSON.stringify(out)?.slice(0, 500));
      return res.status(200).json({ ok: false, error: `KI nicht erreichbar (${r.status})` });
    }
    const reply = (out?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    const plan = extractJson(reply);
    return res.status(200).json({ ok: true, plan });
  } catch (e) {
    console.error('[mapforge-describe]', e);
    return res.status(200).json({ ok: false, error: `KI-Plan fehlgeschlagen: ${e?.message ?? e}` });
  }
}
