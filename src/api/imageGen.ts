import type { SpriteKind, View } from '../sprites/types';
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
  const r = await fetch('/api/image', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ description: o.description, kind: o.kind, view, size, palette: await mapPalette(), reference: o.reference, refMode: o.refMode }),
  });
  const out = (await r.json().catch(() => null)) as { ok: boolean; image?: string; cost?: number | null; error?: string } | null;
  if (!out?.ok || !out.image) throw new Error(out?.error ?? (r.status === 404 ? 'Das Bildmodell gibt es nur in der veröffentlichten App (Vercel)' : `Serverfehler (${r.status})`));
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
