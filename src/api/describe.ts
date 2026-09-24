import { runCommand } from './commands';
import { defaultGenerator, defaultHex, defaultSide } from '../generator/presets';
import { GENRES, VIEWS, deriveConfig, type ViewKind } from '../profiles';
import { useProject } from '../store/projectStore';
import { saveNow } from '../persistence/autosave';
import { CATEGORIES } from '../tilesets/categories';
import { TILE_ROLES, type TileCategory, type TileRole, type Tileset } from '../types';

// "Beschreibe dein Spiel": description (+ reference picture, + own tileset) → build plan from Claude
// (server: api/describe.js via the Vercel AI Gateway) → project + map built by the app's generator.

export interface BuildPlan {
  name?: string;
  summary?: string;
  view?: string;
  genre?: string;
  perspective?: string;
  width?: number;
  height?: number;
  generator?: Record<string, unknown>;
  tips?: string[];
}

/** shrink a picture for the model (long side ≤ max px); pixel art stays sharp */
export async function shrinkImage(dataUrl: string, max = 1024, type: 'image/jpeg' | 'image/png' = 'image/jpeg'): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Bild konnte nicht gelesen werden'));
    i.src = dataUrl;
  });
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  if (k === 1 && dataUrl.length < 1_500_000) return dataUrl;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = type === 'image/jpeg';
  if (type === 'image/jpeg') {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
  }
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL(type, 0.85);
}

function context() {
  const gen: Record<string, unknown> = { ...defaultGenerator('x'), side: defaultSide(), hex: defaultHex() };
  delete gen.seed;
  return {
    views: VIEWS.filter((v) => v.available).map((v) => v.id),
    views_detail: VIEWS.filter((v) => v.available).map((v) => ({ id: v.id, label: v.label, perspectives: v.perspectives })),
    genres: GENRES.map((g) => ({ id: g.id, label: g.label, views: g.views })),
    generator: gen,
  };
}

export async function askPlan(input: { text: string; image?: string; tileset?: string }): Promise<BuildPlan> {
  let r: Response;
  try {
    r = await fetch('/api/describe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: input.text,
        image: input.image ? await shrinkImage(input.image, 1024, 'image/jpeg') : undefined,
        tileset: input.tileset ? await shrinkImage(input.tileset, 1024, 'image/png') : undefined,
        context: context(),
      }),
    });
  } catch {
    throw new Error('Keine Verbindung zum Server – bist du online?');
  }
  const out = (await r.json().catch(() => null)) as { ok: boolean; plan?: BuildPlan; error?: string } | null;
  if (!out) throw new Error(r.status === 404 ? 'Die KI gibt es nur in der veröffentlichten App (Vercel)' : `Serverfehler (${r.status})`);
  if (!out.ok || !out.plan) throw new Error(out.error ?? 'Die KI hat keinen Bauplan geliefert');
  return out.plan;
}

const clamp = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : undefined);

/** build project + map from the plan; returns what to tell the user */
export async function buildFromPlan(plan: BuildPlan, tileset?: { name: string; dataUrl: string }, onStep?: (s: string) => void): Promise<{ summary: string; tips: string[] }> {
  const view = VIEWS.some((v) => v.id === plan.view && v.available) ? (plan.view as ViewKind) : 'top_down';
  const allowed: string[] = deriveConfig({ view, genre: 'other', effort: 'medium' }).perspectives;
  const genre = GENRES.find((g) => g.id === plan.genre && g.views.includes(view))?.id;
  onStep?.('Projekt anlegen …');
  const made = await runCommand('new_map', {
    view,
    genre,
    perspective: plan.perspective && allowed.includes(plan.perspective) ? plan.perspective : undefined,
    name: (plan.name ?? 'Neue Karte').slice(0, 60),
    width: clamp(plan.width, 16, 160),
    height: clamp(plan.height, 16, 160),
  });
  if (!made.ok) throw new Error(made.error);
  if (tileset) {
    onStep?.('Tileset einlesen …');
    const added = await runCommand('tileset_add', { name: tileset.name, image_base64: tileset.dataUrl });
    if (!added.ok) throw new Error(added.error);
    // the AI looks at the tiles too (the local guess stays where it isn't sure)
    const id = (added.data as { id?: string } | undefined)?.id;
    if (id) {
      onStep?.('Die KI ordnet deine Tiles zu …');
      await aiAssignTiles(id).catch(() => undefined);
    }
    // own tiles first: the demo sets only fill in roles the new tileset lacks
    for (const t of useProject.getState().project.tilesets) if (t.source === 'demo' && t.active) await runCommand('tileset_update', { tileset: t.id, active: false });
  }
  onStep?.('Karte bauen …');
  const patch = { ...(plan.generator ?? {}) };
  delete patch.seed;
  const built = await runCommand('set_generator', { patch, regenerate: true });
  if (!built.ok) throw new Error(built.error);
  await saveNow();
  return { summary: plan.summary ?? '', tips: (plan.tips ?? []).slice(0, 3) };
}

/* ------------------------------------------------------------------ */
/* shared request                                                      */
/* ------------------------------------------------------------------ */

async function post<T>(body: Record<string, unknown>): Promise<T> {
  let r: Response;
  try {
    r = await fetch('/api/describe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('Keine Verbindung zum Server – bist du online?');
  }
  const out = (await r.json().catch(() => null)) as { ok: boolean; plan?: T; error?: string } | null;
  if (!out) throw new Error(r.status === 404 ? 'Die KI gibt es nur in der veröffentlichten App (Vercel)' : `Serverfehler (${r.status})`);
  if (!out.ok || !out.plan) throw new Error(out.error ?? 'Die KI hat nicht geantwortet');
  return out.plan;
}

/** remember description + reference picture in the project – the AI sees them on every later request */
export async function setReference(ref: { text?: string; image?: string | null }) {
  const image = ref.image ? await shrinkImage(ref.image, 768, 'image/jpeg') : ref.image === null ? undefined : useProject.getState().project.reference?.image;
  const text = ref.text ?? useProject.getState().project.reference?.text;
  useProject.setState((st) => ({ project: { ...st.project, reference: image || text ? { text, image } : undefined } }));
  await saveNow();
}

/* ------------------------------------------------------------------ */
/* refine the open map                                                 */
/* ------------------------------------------------------------------ */

export interface RefinePlan {
  summary?: string;
  generator?: Record<string, unknown>;
  width?: number;
  height?: number;
  newSeed?: boolean;
  tips?: string[];
}

export async function refineMap(wish: string, onStep?: (s: string) => void): Promise<{ summary: string; tips: string[] }> {
  const p = useProject.getState().project;
  onStep?.('Die KI schaut sich deine Karte an …');
  const shot = await runCommand('render', {});
  const map = shot.ok && shot.binary ? await shrinkImage(`data:image/png;base64,${shot.binary.base64}`, 1024, 'image/jpeg') : undefined;
  const plan = await post<RefinePlan>({
    mode: 'refine',
    text: wish,
    image: p.reference?.image,
    description: p.reference?.text,
    map,
    current: { name: p.name, view: p.profile?.view, genre: p.profile?.genre, perspective: p.map.perspective, width: p.map.width, height: p.map.height, generator: { ...p.generator, seed: undefined } },
    context: { genres: GENRES.map((g) => ({ id: g.id, views: g.views })) },
  });
  onStep?.('Karte neu bauen …');
  const w = clamp(plan.width, 16, 160);
  const h = clamp(plan.height, 16, 160);
  if ((w && w !== p.map.width) || (h && h !== p.map.height)) useProject.getState().setMapSize(w ?? p.map.width, h ?? p.map.height);
  const patch = { ...(plan.generator ?? {}) };
  delete patch.seed;
  const res = await runCommand('set_generator', { patch });
  if (!res.ok) throw new Error(res.error);
  await useProject.getState().runGenerate({ newSeed: !!plan.newSeed });
  await saveNow();
  return { summary: plan.summary ?? 'Karte angepasst', tips: (plan.tips ?? []).slice(0, 2) };
}

/* ------------------------------------------------------------------ */
/* tile roles from the AI                                              */
/* ------------------------------------------------------------------ */

const CELL = 64;
const LABEL = 16;
const PER_ROW = 8;
const PER_SHEET = 64;

/** numbered contact sheets of the tileset (64 tiles each, at most 4 sheets) */
async function contactSheets(ts: Tileset): Promise<{ sheets: string[]; first: number[]; order: number[][] }> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Tileset-Bild nicht lesbar'));
    i.src = ts.dataUrl;
  });
  const empty = new Set(ts.emptyTiles);
  const all = Array.from({ length: ts.columns * ts.rows }, (_, i) => i).filter((i) => !empty.has(i)).slice(0, PER_SHEET * 4);
  const sheets: string[] = [];
  const first: number[] = [];
  const order: number[][] = [];
  for (let k = 0; k < all.length; k += PER_SHEET) {
    const part = all.slice(k, k + PER_SHEET);
    const rows = Math.ceil(part.length / PER_ROW);
    const c = document.createElement('canvas');
    c.width = PER_ROW * CELL;
    c.height = rows * (CELL + LABEL);
    const g = c.getContext('2d')!;
    g.fillStyle = '#20202a';
    g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = false;
    g.font = 'bold 12px sans-serif';
    g.textAlign = 'center';
    part.forEach((idx, n) => {
      const x = (n % PER_ROW) * CELL;
      const y = Math.floor(n / PER_ROW) * (CELL + LABEL);
      // checkerboard behind transparent pixels
      for (let yy = 0; yy < CELL; yy += 8) for (let xx = 0; xx < CELL; xx += 8) (g.fillStyle = (xx + yy) % 16 ? '#3a3a44' : '#30303a'), g.fillRect(x + xx, y + yy, 8, 8);
      const sx = (idx % ts.columns) * ts.tileSize;
      const sy = Math.floor(idx / ts.columns) * ts.tileSize;
      g.drawImage(img, sx, sy, ts.tileSize, ts.tileSize, x + 2, y + 2, CELL - 4, CELL - 4);
      g.fillStyle = '#ffe36e';
      g.fillText(String(idx), x + CELL / 2, y + CELL + 12);
    });
    sheets.push(c.toDataURL('image/png'));
    first.push(part[0]);
    order.push(part);
  }
  return { sheets, first, order };
}

/** the AI looks at the tiles and says what each one is (marked as suggestion, "auto") */
export async function aiAssignTiles(tilesetId: string): Promise<{ count: number; summary: string }> {
  const p = useProject.getState().project;
  const ts = p.tilesets.find((t) => t.id === tilesetId);
  if (!ts) throw new Error('Tileset nicht gefunden');
  const { sheets, first, order } = await contactSheets(ts);
  if (!sheets.length) throw new Error('Das Tileset hat keine Kacheln');
  const plan = await post<{ summary?: string; tiles?: Record<string, { category?: string; role?: string; tags?: string[] }> }>({
    mode: 'tiles',
    sheets,
    first,
    context: { perspective: p.map.perspective, categories: CATEGORIES.map((c) => c.id), roles: TILE_ROLES },
  });
  const known = new Set(order.flat());
  const cats = new Set<string>(CATEGORIES.map((c) => c.id));
  const roles = new Set<string>(TILE_ROLES);
  const tiles = { ...ts.tiles };
  let count = 0;
  for (const [k, v] of Object.entries(plan.tiles ?? {})) {
    const i = Number(k);
    if (!known.has(i) || !v || (!v.category && !v.role)) continue;
    const category = v.category && cats.has(v.category) ? (v.category as TileCategory) : undefined;
    const role = v.role && roles.has(v.role) ? (v.role as TileRole) : undefined;
    if (!category && !role) continue;
    const tags = Array.isArray(v.tags) ? v.tags.filter((t) => typeof t === 'string').slice(0, 6).map((t) => t.toLowerCase()) : [];
    tiles[i] = { ...(tiles[i] ?? { weight: 50 }), category: category ?? tiles[i]?.category, role, tags, weight: tiles[i]?.weight ?? 50, auto: true };
    count++;
  }
  useProject.getState().editDoc('KI: Tiles zugeordnet', (pr) => ({ ...pr, tilesets: pr.tilesets.map((t) => (t.id === ts.id ? { ...t, tiles } : t)) }));
  return { count, summary: plan.summary ?? '' };
}
