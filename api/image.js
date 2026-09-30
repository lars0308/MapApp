// POST /api/image {description, kind, view, size, palette?, reference?} → {ok, image (data URL), cost}
// "Mit KI zeichnen": an image model (Vercel AI Gateway) paints the figure as pixel art on a flat
// magenta background; the app turns it into real pixels (src/sprites/pixelate.ts) and animates it.

const CHAT = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const MODELS_URL = 'https://ai-gateway.vercel.sh/v1/models';
const MODEL = process.env.MAPFORGE_IMAGE_MODEL || 'google/gemini-3.1-flash-image-preview';
const MAX_REF = 3_000_000;

const KIND_WORD = { character: 'character', creature: 'creature / monster', object: 'object / item' };
const VIEW_TEXT = {
  side: 'seen exactly from the side, facing right (side-scroller sprite)',
  front: 'facing the viewer (front view, like a top-down RPG sprite)',
  back: 'seen from behind (back view)',
  fside: 'seen from the front-right at a 3/4 angle',
  bside: 'seen from the back-right at a 3/4 angle',
};

let pricing = null;
/** price per token of the image model (public model list, cached) – for an honest cost display */
async function priceOf(model) {
  if (!pricing) {
    try {
      const r = await fetch(MODELS_URL);
      const list = await r.json();
      pricing = Object.fromEntries((list?.data ?? []).map((m) => [m.id, m.pricing ?? {}]));
    } catch {
      pricing = {};
    }
  }
  return pricing[model] ?? {};
}

function prompt({ description, kind, view, size, palette, reference, refMode }) {
  const what = KIND_WORD[kind] ?? 'character';
  const angle = reference && refMode !== 'design';
  const lines = [
    reference && !angle ? `Pixel art game sprite of ${description || `the ${what} in the reference picture`}. Use the reference picture for the design, shapes and colours and turn it into clean pixel art.` : '',
    !reference ? `Pixel art game sprite of: "${description}".` : '',
    description ? 'Follow the description exactly – especially the number of heads, arms, legs, eyes, wings and weapons: draw every one of them clearly visible and separate.' : '',
    angle
      ? `This is the same ${what} as in the reference picture – keep its design, colours, proportions, clothes and details exactly, only the viewing angle changes.`
      : '',
    angle ? `Draw it ${VIEW_TEXT[view] ?? VIEW_TEXT.side}.` : `One single ${what}, full body, centered, ${kind === 'object' ? 'straight view' : VIEW_TEXT[view] ?? VIEW_TEXT.side}.`,
    `Style: clean retro 16-bit pixel art. The whole sprite is a real ${size}x${size} pixel game sprite shown enlarged: from head to feet it is only about ${Math.round(size * 0.9)} pixels tall, so every pixel is a big square block of about ${Math.round(1024 / size)} image pixels on one regular grid – low detail, chunky pixels, limited palette (about 16 colours), dark coloured 1-pixel outline, readable silhouette, light from the top left, no blur, no anti-aliasing, no gradients, no dithering noise.`,
    palette?.length ? `Use mainly these colours: ${palette.slice(0, 16).join(', ')}.` : '',
    'No text, no border, no frame, no ground, no cast shadow, no other objects.',
    `Background: flat solid pure magenta (#FF00FF) everywhere around the ${what}; never use magenta in the ${what} itself.`,
  ];
  return lines.filter(Boolean).join('\n');
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
  const description = String(body.description ?? '').trim().slice(0, 1200);
  const reference = typeof body.reference === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(body.reference) ? body.reference : null;
  if (!description && !reference) return res.status(400).json({ ok: false, error: 'Beschreibung fehlt' });
  if (reference && reference.length > MAX_REF) return res.status(413).json({ ok: false, error: 'Referenzbild zu groß' });
  const token = process.env.AI_GATEWAY_API_KEY || req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN;
  if (!token) return res.status(500).json({ ok: false, error: 'KI ist auf dem Server nicht eingerichtet (AI Gateway)' });
  const size = [16, 32, 48, 64].includes(Number(body.size)) ? Number(body.size) : 48;
  const text = prompt({ description, kind: body.kind, view: body.view, size, palette: Array.isArray(body.palette) ? body.palette.map(String) : null, reference, refMode: body.refMode });
  const content = [{ type: 'text', text }];
  if (reference) content.push({ type: 'image_url', image_url: { url: reference } });
  try {
    const r = await fetch(CHAT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content }], modalities: ['text', 'image'], stream: false }),
    });
    const out = await r.json().catch(() => null);
    if (!r.ok) {
      console.error('[mapforge-image]', r.status, JSON.stringify(out)?.slice(0, 600));
      return res.status(200).json({ ok: false, error: `Bildmodell nicht erreichbar (${r.status})` });
    }
    const msg = out?.choices?.[0]?.message;
    const image = (msg?.images ?? []).map((i) => i?.image_url?.url).find((u) => typeof u === 'string' && u.startsWith('data:image'));
    if (!image) {
      console.warn('[mapforge-image] kein Bild', String(msg?.content ?? '').slice(0, 300));
      return res.status(200).json({ ok: false, error: 'Das Bildmodell hat kein Bild geliefert – bitte die Beschreibung etwas ändern und nochmal versuchen' });
    }
    const u = out?.usage ?? {};
    const p = await priceOf(MODEL);
    // per picture (image models list a price per image or per image size), plus the prompt tokens
    const perImage = p.image ? Number(p.image) : (p.image_dimension_quality_pricing ?? []).find((x) => x.size === 'default' || x.size === '1K')?.cost;
    const cost = perImage !== undefined ? Number(perImage) + (u.prompt_tokens ?? 0) * Number(p.input ?? 0) : p.input && p.output ? (u.prompt_tokens ?? 0) * Number(p.input) + (u.completion_tokens ?? 0) * Number(p.output) : null;
    return res.status(200).json({ ok: true, image, model: MODEL, cost });
  } catch (e) {
    console.error('[mapforge-image]', e);
    return res.status(200).json({ ok: false, error: `Bild konnte nicht erzeugt werden: ${e?.message ?? e}` });
  }
}
