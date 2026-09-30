import { SIDE_WORDS, setGameView, sideGame } from './gameView';
import { generateFigure, rigTask } from './imageGen';
import { withBusy } from '../store/busy';
import { runCommand } from './commands';
import { aiMode, runAgent } from './agent';
import { defaultGenerator, defaultHex, defaultSide } from '../generator/presets';
import { GENRES, VIEWS, deriveConfig, type ViewKind } from '../profiles';
import { useProject } from '../store/projectStore';
import { saveNow } from '../persistence/autosave';
import { useApp } from '../store/appStore';
import { isUntouched, useSprites } from '../sprites/store';
import type { SpriteKind } from '../sprites/types';

// "Beschreibe dein Spiel": description (+ reference picture, + own tileset) → build plan from Claude
// (server: api/describe.js via the Vercel AI Gateway) → project + map built by the app's generator.

export interface FigurePlan {
  kind?: string;
  name?: string;
  /** detailed description for the drawing AI */
  brief?: string;
  size?: number;
  /** in a map plan: "player" = the playable figure, "map" = placed on the map */
  use?: string;
}

export interface BuildPlan {
  /** what the user wants: a map (project) or only figures */
  create?: 'map' | 'figure';
  figures?: FigurePlan[];
  name?: string;
  summary?: string;
  view?: string;
  genre?: string;
  perspective?: string;
  width?: number;
  height?: number;
  generator?: Record<string, unknown>;
  tips?: string[];
  /** "pixel" (crisp) or "smooth" (less pixelated) */
  pixelLook?: string;
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
        mode: aiMode(),
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
export async function buildFromPlan(plan: BuildPlan, tileset?: { name: string; dataUrl: string }, onStep?: (s: string) => void): Promise<{ summary: string; tips: string[]; tilesetId?: string }> {
  const view = VIEWS.some((v) => v.id === plan.view && v.available) ? (plan.view as ViewKind) : 'top_down';
  const allowed: string[] = deriveConfig({ view, genre: 'other', effort: 'medium' }).perspectives;
  const genre = GENRES.find((g) => g.id === plan.genre && g.views.includes(view))?.id;
  let tilesetId: string | undefined;
  onStep?.('Projekt wird angelegt …');
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
    onStep?.('Dein Tileset wird eingelesen …');
    const added = await runCommand('tileset_add', { name: tileset.name, image_base64: tileset.dataUrl });
    if (!added.ok) throw new Error(added.error);
    tilesetId = (added.data as { id?: string } | undefined)?.id;
    // own tiles first: the demo sets only fill in roles the new tileset lacks
    for (const t of useProject.getState().project.tilesets) if (t.source === 'demo' && t.active) await runCommand('tileset_update', { tileset: t.id, active: false });
  }
  if (plan.pixelLook === 'smooth' || plan.pixelLook === 'pixel') useProject.getState().setMapOptions({ pixelLook: plan.pixelLook });
  onStep?.('Die Karte wird gebaut …');
  const patch = { ...(plan.generator ?? {}) };
  delete patch.seed;
  const built = await runCommand('set_generator', { patch, regenerate: true });
  if (!built.ok) throw new Error(built.error);
  await saveNow();
  return { summary: plan.summary ?? '', tips: (plan.tips ?? []).slice(0, 3), tilesetId };
}

/** remember description + reference picture in the project – the AI sees them on every later request */
export async function setReference(ref: { text?: string; image?: string | null }) {
  const image = ref.image ? await shrinkImage(ref.image, 768, 'image/jpeg') : ref.image === null ? undefined : useProject.getState().project.reference?.image;
  const text = ref.text ?? useProject.getState().project.reference?.text;
  useProject.setState((st) => ({ project: { ...st.project, reference: image || text ? { text, image } : undefined } }));
  await saveNow();
}

const KIND_LABEL: Record<SpriteKind, string> = { character: 'Charakter', creature: 'Kreatur', object: 'Objekt' };
const figureKind = (k: unknown): SpriteKind => (k === 'creature' || k === 'object' ? k : 'character');

/** the figures of a plan the app can build (kind checked, at most 3) */
export function planFigures(plan: BuildPlan): (FigurePlan & { kind: SpriteKind })[] {
  return (Array.isArray(plan.figures) ? plan.figures : []).slice(0, 3).map((f) => ({ ...f, kind: figureKind(f.kind) }));
}

/**
 * The AI draws one figure in the builder (character / creature / object page, live).
 * The figure open there before goes to the gallery first, so nothing is lost.
 */
export async function buildFigure(fig: FigurePlan & { kind: SpriteKind }, wish: string, image: string | null, onMap: boolean): Promise<{ text: string; cost: number; stopped: boolean }> {
  const kind = fig.kind;
  await useSprites.getState().load(kind);
  if (!isUntouched(useSprites.getState()[kind].doc)) useSprites.getState().saveToGallery(kind);
  useApp.getState().goTo(kind);
  const size = [16, 32, 48, 64].includes(Number(fig.size)) ? Number(fig.size) : 32;
  // side-scroller: the map is one, the user said so (then remembered for later figures) or chose it in the builder
  if (SIDE_WORDS.test(`${wish} ${fig.brief ?? ''}`)) setGameView('side');
  const side = sideGame() && kind !== 'object';
  const place = [
    onMap && fig.use === 'player' && kind !== 'object' ? 'Mach sie danach mit figure_use_as_player zur Spielfigur.' : '',
    onMap && fig.use !== 'player' ? 'Stelle sie danach mit figure_to_map und place_object passend auf die Karte (1–3 Mal, an sinnvolle Stellen).' : '',
  ];
  // 1. the image model paints it (detailed pixel art), the building AI cuts it into parts and animates it
  try {
    const painted = await withBusy(
      'Das Bildmodell zeichnet deine Figur …',
      () => generateFigure({ description: [fig.name, fig.brief, wish.trim()].filter(Boolean).join('. '), kind, size: Math.max(48, size), reference: image ?? undefined, refMode: 'design' }),
      { ai: true, detail: 'Danach wird sie in echte Pixel umgewandelt, zerlegt und animiert' },
    );
    useSprites.getState().newFromImage(kind, painted.image, (fig.name ?? KIND_LABEL[kind]).slice(0, 40), painted.size);
    const r = await runAgent([rigTask(kind, wish), ...place].filter(Boolean).join('\n'), [], { focus: 'figures' });
    return { ...r, cost: r.cost + (painted.cost ?? 0) };
  } catch (e) {
    // no image model (local build, error): the building AI draws it itself
    console.warn('[mapforge] Bildmodell nicht verfügbar – die KI zeichnet selbst', e);
  }
  const task = [
    `Baue diese Figur (${KIND_LABEL[kind]}, kind "${kind}") in bestmöglicher Pixel-Art-Qualität: „${fig.name ?? KIND_LABEL[kind]}“.`,
    fig.brief ? `Beschreibung: ${fig.brief}` : '',
    wish.trim() ? `Wunsch des Nutzers im Original: ${wish.trim()}` : '',
    image ? 'Das Referenzbild oben zeigt, wie sie aussehen soll.' : '',
    onMap || useProject.getState().project.tilesets.some((t) => t.active && t.source !== 'demo')
      ? 'Die Figur gehört zu dieser Karte: lies zuerst style_colors und halte dich an Farben, Umriss und Pixelgröße der Tiles.'
      : '',
    styleHint(),
    side
      ? 'Das Spiel ist ein 2D-Side-Scroller: die Seitenansicht (side) ist die wichtigste – zeichne sie besonders sorgfältig. Danach die Plattformer-Animationen in view side (idle, run, jump, fall, attack; Kreatur: k_idle, Fortbewegung, k_attack) flüssig machen: figure_anim_check, Bewegungen mit figure_anim_pose nachjustieren, figure_anim_smooth für run/idle, prüfen bis alle Bilder zusammenpassen.'
      : kind !== 'object'
        ? 'Danach die wichtigsten Animationen (Charakter: idle, walk, attack; Kreatur: k_idle, Fortbewegung, k_attack) flüssig machen: figure_anim_check, Bewegungen mit figure_anim_pose nachjustieren, figure_anim_smooth für walk/idle, prüfen bis alle Bilder zusammenpassen.'
        : sideGame()
          ? 'Das Spiel ist ein 2D-Side-Scroller: zeichne das Objekt in reiner Seitenansicht (keine sichtbare Oberseite), Standfläche unten.'
          : '',
    `Beginne mit figure_new (kind "${kind}", name, size ${size}). Nutze Teile, eigene Farben und figure_draw für alle Details; prüfe mit figure_render und verbessere, bis sie wirklich gut aussieht.`,
    'Zum Schluss figure_save.',
    ...place,
  ].filter(Boolean).join('\n');
  return runAgent(task, image ? [{ label: 'Referenzbild des Nutzers', dataUrl: image }] : [], { focus: 'figures' });
}

/** the project's pixel look, as a hint for the drawing AI */
export function styleHint(): string {
  return useProject.getState().project.map.pixelLook === 'smooth'
    ? 'Stil „Weich“: eher size 48 oder 64, mehr Farbstufen, sanfte Übergänge mit leichtem Anti-Aliasing, Umriss in einem dunklen Farbton statt hartem Schwarz.'
    : 'Stil „Pixelig“: klare, gut sichtbare Pixel, kleine Palette, sauberer 1-px-Umriss, kein Anti-Aliasing.';
}
