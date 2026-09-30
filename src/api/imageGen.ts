import type { SpriteDoc, SpriteKind, View } from '../sprites/types';
import { composeView, useSprites } from '../sprites/store';
import { feetInFrame, frameSize } from '../sprites/animation';
import { sliceSheet } from '../sprites/sheet';
import { uid } from '../utils/id';
import { imageDataFromUrl, pixelate } from '../sprites/pixelate';
import { useProject } from '../store/projectStore';
import { runCommand } from './commands';
import { sideGame } from './gameView';

// "Mit KI zeichnen": the image model (api/image.js) paints the figure, pixelate() turns it into a
// clean sprite. The figure builder, the start page and the building AI use it.

export interface GeneratedFigure {
  /** the sprite (size × size) */
  image: ImageData;
  size: number;
  /** what the model painted (for a look at the original) */
  raw: string;
  /** USD, null when the gateway gives no price */
  cost: number | null;
}

export interface GenerateOptions {
  description: string;
  kind: SpriteKind;
  view?: View;
  size?: number;
  /** a picture: the same figure from another angle (angle) or the look to follow (design) */
  reference?: string;
  refMode?: 'angle' | 'design';
  /** look: retro, modern, cozy, dark */
  style?: ImageStyle;
}

export type ImageStyle = 'retro' | 'modern' | 'cozy' | 'dark';
export const IMAGE_STYLES: { id: ImageStyle; label: string }[] = [
  { id: 'retro', label: 'Retro 16-Bit' },
  { id: 'modern', label: 'Modern & detailreich' },
  { id: 'cozy', label: 'Niedlich' },
  { id: 'dark', label: 'Dark Fantasy' },
];

interface ImageAnswer {
  ok: boolean;
  image?: string;
  cost?: number | null;
  error?: string;
  prompt?: string;
  check?: { ok: boolean; problems: string } | null;
}

async function callImage(body: Record<string, unknown>): Promise<ImageAnswer & { image: string }> {
  const r = await fetch('/api/image', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const out = (await r.json().catch(() => null)) as ImageAnswer | null;
  if (!out?.ok || !out.image) throw new Error(out?.error ?? (r.status === 404 ? 'Das Bildmodell gibt es nur in der veröffentlichten App (Vercel)' : `Serverfehler (${r.status})`));
  return out as ImageAnswer & { image: string };
}

/** colours of the project's own tiles, so the figure matches the map */
async function mapPalette(): Promise<string[] | undefined> {
  const own = useProject.getState().project.tilesets.some((t) => t.active && t.source !== 'demo');
  if (!own) return undefined;
  const r = await runCommand('style_colors', {}).catch(() => null);
  const colors = (r?.ok ? (r.data as { colors?: { hex: string }[] })?.colors : undefined) ?? [];
  return colors.length ? colors.slice(0, 14).map((c) => c.hex) : undefined;
}

export async function generateFigure(o: GenerateOptions): Promise<GeneratedFigure> {
  const size = [16, 32, 48, 64].includes(Number(o.size)) ? Number(o.size) : 48;
  const view = o.view ?? (o.kind !== 'object' && sideGame() ? 'side' : 'front');
  const out = await callImage({ description: o.description, kind: o.kind, view, size, style: o.style, palette: await mapPalette(), reference: o.reference, refMode: o.refMode });
  const image = pixelate(await imageDataFromUrl(out.image), { size, colors: 24 });
  return { image, size: image.width, raw: out.image, cost: out.cost ?? null };
}

/** the task for the building AI after a painted figure was loaded: cut it into parts and animate it */
export function rigTask(kind: SpriteKind, wish: string): string {
  return [
    `Die Figur im Baukasten (kind "${kind}") wurde gerade vom Bildmodell gezeichnet und ist schon geladen – zeichne sie NICHT neu, kein figure_new, keine neuen Farben.`,
    wish.trim() ? `Wunsch des Nutzers: ${wish.trim()}` : '',
    kind === 'object'
      ? 'Mach sie animierbar: bewegliche Teile (Deckel, Flamme, Glitzern) mit figure_layer_split abtrennen (region head bzw. effect), dann passende Animationen prüfen (figure_anim_check, figure_render).'
      : 'Mach sie animierbar: Beine und Arme wurden beim Laden schon automatisch abgetrennt (figure_status zeigt die Ebenen; falls nicht: figure_auto_rig). Prüfe das, sieh dir figure_grid an und trenne mit figure_layer_split ab, was noch fehlt: Kopf, Waffe (Waffe immer einzeln, region weapon). Mehr Köpfe/Arme als üblich: jedes Glied einzeln, mit swing abwechselnd. Dann die wichtigsten Animationen mit figure_anim_check und figure_render (animation) prüfen und mit figure_anim_pose / figure_anim_smooth verbessern, bis alle Bilder zusammenpassen.',
    'Zum Schluss figure_save.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** the figure as a picture for the image model: its drawing, enlarged with hard pixels */
function figurePicture(doc: SpriteDoc, view: View): string {
  const img = composeView(doc, view);
  const n = doc.size;
  const k = Math.max(4, Math.floor(512 / n));
  const c = document.createElement('canvas');
  c.width = c.height = n * k;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ff00ff';
  g.fillRect(0, 0, c.width, c.height);
  const t = document.createElement('canvas');
  t.width = t.height = n;
  t.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img), n, n), 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(t, 0, 0, n * k, n * k);
  return c.toDataURL('image/png');
}

/** height of what is drawn (sprite pixels) */
function drawnHeight(img: Uint8ClampedArray, n: number): number {
  let y0 = n,
    y1 = -1;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (img[(y * n + x) * 4 + 3] > 40) (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y));
  return y1 < 0 ? n : y1 - y0 + 1;
}

/** at most 40 characters, cut at a word */
export function shortName(s: string): string {
  const t = s.trim();
  if (t.length <= 40) return t;
  const cut = t.slice(0, 40);
  return (cut.lastIndexOf(' ') > 15 ? cut.slice(0, cut.lastIndexOf(' ')) : cut).trim();
}

/** loops: walking, running, idle, flying …; one-shots: attacks, jumps, death */
const ONE_SHOT = /angriff|schlag|schlägt|attack|hieb|stoß|wurf|wirf|zauber|cast|sprung|spring|jump|tod|stirb|stirbt|death|die|fällt|treffer|hurt|hit|aufheb|pick/i;

export interface GeneratedAnimation {
  id: string;
  frames: number;
  cost: number | null;
  problems: string;
}

/**
 * "Neue Animation" on the character page: the image model paints the move of the open figure as a
 * row of frames, the frames are cut out and stored as an own animation.
 */
export async function generateAnimation(kind: SpriteKind, action: string, frames: number, style?: ImageStyle, name?: string): Promise<GeneratedAnimation> {
  const st = useSprites.getState();
  const doc = st[kind].doc;
  const view: View = kind !== 'object' && sideGame() ? 'side' : 'front';
  const out = await callImage({ mode: 'animation', action, frames, kind, view, size: doc.size, style, reference: figurePicture(doc, view) });
  const still = composeView(doc, view);
  const cut = sliceSheet(await imageDataFromUrl(out.image), frames, { frame: frameSize(doc.size), feet: feetInFrame(doc, view), height: drawnHeight(still, doc.size) });
  const id = uid('anim');
  st.addCustomAnim(kind, { id, name: shortName(name || action), fps: 10, loop: !ONE_SHOT.test(action), view, frames: cut });
  return { id, frames: cut.length, cost: out.cost ?? null, problems: out.check && !out.check.ok ? out.check.problems : '' };
}
