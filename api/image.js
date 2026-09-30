// POST /api/image → {ok, image (data URL), prompt, check, cost}
//   figure:    {description, kind, view, size, style?, palette?, reference?, refMode?}
//   animation: {mode: 'animation', action, frames, kind, view, size, style?, reference (the figure)}
// "Mit KI zeichnen": an art director (language model) turns the user's words into a precise brief
// with the rules of game pixel art, the image model paints it on flat magenta, a critic (vision
// model) checks it and a second attempt fixes what failed. The app turns it into real pixels
// (src/sprites/pixelate.ts, sheet.ts).

const CHAT = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const MESSAGES = 'https://ai-gateway.vercel.sh/v1/messages';
const MODELS_URL = 'https://ai-gateway.vercel.sh/v1/models';
const MODEL = process.env.MAPFORGE_IMAGE_MODEL || 'google/gemini-3.1-flash-image-preview';
const DIRECTOR = process.env.MAPFORGE_AI_MODEL || 'anthropic/claude-sonnet-5';
const DIRECTOR_PRICE = { input: 2, output: 10 };
const MAX_REF = 3_000_000;

const KIND_WORD = { character: 'character', creature: 'creature', object: 'object / item' };
const VIEW_TEXT = {
  side: 'side view in profile, facing right (side-scroller sprite)',
  front: 'front view, facing the viewer (top-down RPG sprite)',
  back: 'back view, seen from behind',
};

/** looks the user can pick – written as art direction, not as names of games */
const STYLES = {
  retro: '16-bit console era pixel art: bold readable shapes, 3–4 tone shading per material, hue-shifted shadows (cooler, more saturated) and warm highlights, dark coloured selective outline',
  modern: 'modern high-detail indie pixel art: dramatic lighting with a rim light, rich but controlled palette, fine clusters of pixels, strong contrast between light and shadow, dark coloured outline',
  cozy: 'cozy, cute pixel art: rounded friendly shapes, soft pastel palette with warm light, big expressive eyes, clean dark brown outline',
  dark: 'gothic dark fantasy pixel art: desaturated cold palette with one glowing accent colour (eyes, runes, magic), heavy shadows, sharp angular silhouette, near-black coloured outline',
};

let pricing = null;
/** prices from the public model list (cached) – for an honest cost display */
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
async function imageCost(usage) {
  const p = await priceOf(MODEL);
  // image models list a price per picture (or per picture size) plus the prompt tokens
  const perImage = p.image ? Number(p.image) : (p.image_dimension_quality_pricing ?? []).find((x) => x.size === 'default' || x.size === '1K')?.cost;
  if (perImage !== undefined) return Number(perImage) + (usage.prompt_tokens ?? 0) * Number(p.input ?? 0);
  return p.input && p.output ? (usage.prompt_tokens ?? 0) * Number(p.input) + (usage.completion_tokens ?? 0) * Number(p.output) : null;
}

/** one call to the language model (text, optional picture); returns text + cost */
async function ask(token, content, maxTokens) {
  const r = await fetch(MESSAGES, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: DIRECTOR, max_tokens: maxTokens, messages: [{ role: 'user', content }] }),
  });
  const out = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Sprachmodell ${r.status}`);
  const text = (out?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
  const u = out?.usage ?? {};
  return { text, cost: ((u.input_tokens ?? 0) * DIRECTOR_PRICE.input + (u.output_tokens ?? 0) * DIRECTOR_PRICE.output) / 1e6 };
}

const imageBlock = (dataUrl) => {
  const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(dataUrl);
  return m ? { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } } : null;
};

/**
 * The art director: the user's idea (any language, style words, "white background" …) → a precise
 * English brief for one sprite or for the key poses of an animation.
 */
async function direct(token, b) {
  const view = VIEW_TEXT[b.view] ?? VIEW_TEXT.side;
  const task =
    b.mode === 'animation'
      ? `Write the brief for a ${b.frames}-frame game animation of the character in the attached picture doing: "${b.action}".
Describe the SAME character (its look from the picture in one sentence), then one line per frame "Frame 1: …" with a clear key pose following animation principles: anticipation, key pose, contact/impact, follow-through, recovery. Keep the character the same size in every frame, feet on the same ground line (unless it jumps), ${view}. Effects (dust, shockwave, sparks, motion arcs) small and close to the body. Max. 170 words.`
      : `Write the brief for ONE game sprite of this ${KIND_WORD[b.kind] ?? 'character'} idea: "${b.description}".
Say in plain English: what it is, body proportions that read well at ${b.size}×${b.size} pixels (big head/hands/weapon, simple shapes), a pose (idle / ready stance, ${view}), clothes/materials, and a small named palette (6–9 colours incl. a dark outline colour and one accent). Spell out every count as a number word and where it is ("six arms, three on each side of the body"). Max. 110 words.`;
  const content = [];
  if (b.mode === 'animation' && b.reference) content.push(imageBlock(b.reference));
  content.push({
    type: 'text',
    text: `You are the art director of a professional 2D pixel art game. ${task}
Leave out: background, frames, text, camera words like "illustration", art style names – the technical style is added later. Answer with the brief only.`,
  });
  const r = await ask(token, content.filter(Boolean), 500);
  return { text: r.text.slice(0, 1400), cost: r.cost };
}

function paintPrompt(b, brief, fix) {
  const what = KIND_WORD[b.kind] ?? 'character';
  const style = STYLES[b.style] ?? STYLES.retro;
  const px = b.size;
  const common = [
    `Style: ${style}. Crisp square pixels on one regular grid, the sprite is a real ${px}×${px}-pixel game sprite shown enlarged (from head to feet about ${Math.round(px * 0.85)} pixels tall, so every pixel is a big block), limited palette of about 16 colours, no blur, no anti-aliasing, no gradients, no noise, no painterly texture. Readable silhouette at small size, light from the top left.`,
    b.palette?.length ? `Match the game's colours: ${b.palette.slice(0, 14).join(', ')}.` : '',
    'No text, no letters, no numbers, no grid lines, no frame, no border, no ground, no cast shadow, no UI.',
    `Background: flat solid pure magenta (#FF00FF) everywhere; never use magenta or pink in the ${what}.`,
    fix ? `IMPORTANT – the last attempt had these problems, fix them: ${fix}` : '',
  ];
  if (b.mode === 'animation')
    return [
      `Pixel art sprite sheet: ${b.frames} animation frames of the SAME character as in the reference picture, in ONE single horizontal row, left to right in time order. Keep its design, colours, proportions and size exactly the same in every frame.`,
      brief,
      `Every frame in its own equal-width cell with a clear magenta gap between frames; the character never touches or overlaps the next frame; all feet on one common ground line; ${VIEW_TEXT[b.view] ?? VIEW_TEXT.side}.`,
      ...common,
    ]
      .filter(Boolean)
      .join('\n');
  const angle = b.reference && b.refMode !== 'design';
  return [
    angle
      ? `The SAME ${what} as in the reference picture – keep its design, colours, proportions and details exactly – now seen from another angle: ${VIEW_TEXT[b.view] ?? VIEW_TEXT.side}.`
      : b.reference
        ? `Pixel art game sprite based on the reference picture (use it for design, shapes and colours): ${brief}`
        : `Pixel art game sprite: ${brief}`,
    `Exactly ONE ${what}, full body, centred, nothing else in the picture – no second copy, no comparison, no sprite sheet.`,
    ...common,
  ]
    .filter(Boolean)
    .join('\n');
}

async function paint(token, text, reference) {
  const content = [{ type: 'text', text }];
  if (reference) content.push({ type: 'image_url', image_url: { url: reference } });
  const r = await fetch(CHAT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content }], modalities: ['text', 'image'], stream: false }),
  });
  const out = await r.json().catch(() => null);
  if (!r.ok) {
    console.error('[mapforge-image]', r.status, JSON.stringify(out)?.slice(0, 600));
    throw new Error(`Bildmodell nicht erreichbar (${r.status})`);
  }
  const msg = out?.choices?.[0]?.message;
  const image = (msg?.images ?? []).map((i) => i?.image_url?.url).find((u) => typeof u === 'string' && u.startsWith('data:image'));
  return { image, cost: await imageCost(out?.usage ?? {}) };
}

/** the critic: does the picture fulfil the hard rules? → {ok, problems} */
async function critique(token, b, image) {
  const rules =
    b.mode === 'animation'
      ? `exactly ${b.frames} separate frames of ONE character in one horizontal row, the same character design and size in every frame, frames not overlapping, the action "${b.action}" readable from frame to frame, ${VIEW_TEXT[b.view] ?? VIEW_TEXT.side}`
      : `exactly one ${KIND_WORD[b.kind] ?? 'character'} and nothing else, matching "${b.description}" (count heads, arms, legs, weapons exactly), ${b.kind === 'object' ? '' : VIEW_TEXT[b.view] ?? VIEW_TEXT.side}, full body visible`;
  const r = await ask(
    token,
    [
      imageBlock(image),
      {
        type: 'text',
        text: `Check this generated game sprite picture strictly against: ${rules}; clean pixel art with visible square pixels (not blurry, not painterly); flat plain magenta background; no text, grid lines, frames or ground. Answer ONLY with JSON: {"ok": true|false, "problems": "short English list of what must be fixed, empty if ok"}. Say ok=false only for clear failures, not for taste.`,
      },
    ].filter(Boolean),
    200,
  );
  try {
    const j = JSON.parse(r.text.slice(r.text.indexOf('{'), r.text.lastIndexOf('}') + 1));
    return { ok: !!j.ok, problems: String(j.problems ?? ''), cost: r.cost };
  } catch {
    return { ok: true, problems: '', cost: r.cost };
  }
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
  const b = {
    mode: body.mode === 'animation' ? 'animation' : 'figure',
    description: String(body.description ?? '').trim().slice(0, 1200),
    action: String(body.action ?? '').trim().slice(0, 600),
    frames: Math.max(2, Math.min(8, Number(body.frames) || 6)),
    kind: ['character', 'creature', 'object'].includes(body.kind) ? body.kind : 'character',
    view: VIEW_TEXT[body.view] ? body.view : 'side',
    size: [16, 32, 48, 64].includes(Number(body.size)) ? Number(body.size) : 48,
    style: STYLES[body.style] ? body.style : 'retro',
    palette: Array.isArray(body.palette) ? body.palette.map(String) : null,
    reference: typeof body.reference === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(body.reference) ? body.reference : null,
    refMode: body.refMode,
  };
  if (b.mode === 'figure' && !b.description && !b.reference) return res.status(400).json({ ok: false, error: 'Beschreibung fehlt' });
  if (b.mode === 'animation' && (!b.action || !b.reference)) return res.status(400).json({ ok: false, error: 'Bewegung oder Figur fehlt' });
  if (b.reference && b.reference.length > MAX_REF) return res.status(413).json({ ok: false, error: 'Referenzbild zu groß' });
  const token = process.env.AI_GATEWAY_API_KEY || req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN;
  if (!token) return res.status(500).json({ ok: false, error: 'KI ist auf dem Server nicht eingerichtet (AI Gateway)' });
  let cost = 0;
  let priced = true;
  const add = (c) => (c === null || c === undefined ? (priced = false) : (cost += c));
  try {
    // 1. the brief (a new angle of the same figure needs none)
    let brief = b.description;
    if (!(b.mode === 'figure' && b.reference && b.refMode !== 'design')) {
      const d = await direct(token, b).catch((e) => (console.warn('[mapforge-image] director', e?.message), null));
      if (d?.text) (brief = d.text), add(d.cost);
    }
    // 2. paint, 3. check – and one more attempt with the critic's notes
    let image = null;
    let check = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const p = await paint(token, paintPrompt(b, brief, attempt ? check?.problems : ''), b.reference);
      add(p.cost);
      if (!p.image) continue;
      image = p.image;
      check = await critique(token, b, image).catch(() => null);
      if (check) add(check.cost);
      if (!check || check.ok) break;
    }
    if (!image) return res.status(200).json({ ok: false, error: 'Das Bildmodell hat kein Bild geliefert – bitte die Beschreibung etwas ändern und nochmal versuchen' });
    return res.status(200).json({ ok: true, image, model: MODEL, prompt: brief, check: check ? { ok: check.ok, problems: check.problems } : null, cost: priced ? cost : null });
  } catch (e) {
    console.error('[mapforge-image]', e);
    return res.status(200).json({ ok: false, error: `Bild konnte nicht erzeugt werden: ${e?.message ?? e}` });
  }
}
