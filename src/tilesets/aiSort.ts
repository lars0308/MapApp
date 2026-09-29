import type { Perspective, TileCategory, TileMeta, TileRole, Tileset } from '../types';
import { loadImage } from '../utils/image';
import { aiMode } from '../api/agent';

// "Die KI sortiert dein Tileset vor": the sheet goes in sections (with a numbered grid) to the AI
// (api/tiles.js); every tile comes back as a kind, which becomes category + role. The room builder
// then opens already filled – the user only checks and adds what is missing.

type Kind =
  | 'floor' | 'floor_variant' | 'floor_edge_top' | 'floor_edge_bottom' | 'floor_edge_left' | 'floor_edge_right'
  | 'floor_corner_tl' | 'floor_corner_tr' | 'floor_corner_bl' | 'floor_corner_br'
  | 'wall_top' | 'wall_bottom' | 'wall_left' | 'wall_right' | 'corner_tl' | 'corner_tr' | 'corner_bl' | 'corner_br'
  | 'inner_tl' | 'inner_tr' | 'inner_bl' | 'inner_br' | 'wall_front' | 'wall_front_upper' | 'door'
  | 'water' | 'lava' | 'abyss' | 'path' | 'bridge' | 'stairs' | 'deco' | 'obstacle' | 'pillar' | 'shadow'
  // side view (side-scroller)
  | 'ground_top' | 'ground_top_left' | 'ground_top_right' | 'ground_left' | 'ground_right' | 'ground_bottom'
  | 'ground_inner_left' | 'ground_inner_right' | 'ground_fill' | 'platform' | 'platform_left' | 'platform_right'
  | 'ladder' | 'spikes' | 'back_wall';

const KIND_META: Record<Kind, { category?: TileCategory; role?: TileRole }> = {
  floor: { category: 'floor', role: 'floor_center' },
  floor_variant: { category: 'floorVariant' },
  floor_edge_top: { role: 'floor_edge_top' },
  floor_edge_bottom: { role: 'floor_edge_bottom' },
  floor_edge_left: { role: 'floor_edge_left' },
  floor_edge_right: { role: 'floor_edge_right' },
  floor_corner_tl: { role: 'floor_corner_top_left' },
  floor_corner_tr: { role: 'floor_corner_top_right' },
  floor_corner_bl: { role: 'floor_corner_bottom_left' },
  floor_corner_br: { role: 'floor_corner_bottom_right' },
  wall_top: { category: 'wallTop', role: 'wall_top' },
  wall_bottom: { category: 'wallBottom', role: 'wall_bottom' },
  wall_left: { category: 'wallLeft', role: 'wall_left' },
  wall_right: { category: 'wallRight', role: 'wall_right' },
  corner_tl: { category: 'outerCorner', role: 'corner_top_left' },
  corner_tr: { category: 'outerCorner', role: 'corner_top_right' },
  corner_bl: { category: 'outerCorner', role: 'corner_bottom_left' },
  corner_br: { category: 'outerCorner', role: 'corner_bottom_right' },
  inner_tl: { category: 'innerCorner', role: 'inner_corner_top_left' },
  inner_tr: { category: 'innerCorner', role: 'inner_corner_top_right' },
  inner_bl: { category: 'innerCorner', role: 'inner_corner_bottom_left' },
  inner_br: { category: 'innerCorner', role: 'inner_corner_bottom_right' },
  wall_front: { category: 'wallFront', role: 'wall_front' },
  wall_front_upper: { category: 'wallFront', role: 'wall_front_upper' },
  door: { category: 'door', role: 'door' },
  water: { category: 'water', role: 'water' },
  lava: { category: 'lava', role: 'lava' },
  abyss: { category: 'abyss', role: 'abyss' },
  path: { category: 'path' },
  bridge: { category: 'bridge', role: 'bridge_middle' },
  stairs: { category: 'stairs', role: 'stairs' },
  deco: { category: 'deco' },
  obstacle: { category: 'obstacle' },
  pillar: { category: 'pillar' },
  shadow: { category: 'shadow', role: 'shadow' },
  // side view: categories like the demo side set
  ground_top: { category: 'wallTop', role: 'ground_top' },
  ground_top_left: { category: 'wallTop', role: 'ground_top_left' },
  ground_top_right: { category: 'wallTop', role: 'ground_top_right' },
  ground_left: { category: 'wallTop', role: 'ground_left' },
  ground_right: { category: 'wallTop', role: 'ground_right' },
  ground_bottom: { category: 'wallTop', role: 'ground_bottom' },
  ground_inner_left: { category: 'wallTop', role: 'ground_inner_left' },
  ground_inner_right: { category: 'wallTop', role: 'ground_inner_right' },
  ground_fill: { category: 'wallTop', role: 'ground_fill' },
  platform: { category: 'bridge', role: 'platform' },
  platform_left: { category: 'bridge', role: 'platform_left' },
  platform_right: { category: 'bridge', role: 'platform_right' },
  ladder: { category: 'stairs', role: 'ladder' },
  spikes: { category: 'obstacle', role: 'spikes' },
  back_wall: { category: 'floor', role: 'back_wall' },
};

/** tiles per section edge: small enough that every tile is clearly visible */
const SECTION = 10;
const LABEL = 22;

async function sectionImage(img: HTMLImageElement, ts: Tileset, c0: number, r0: number, cols: number, rows: number): Promise<string> {
  const T = ts.tileSize;
  const scale = Math.max(1, Math.round(44 / T));
  const cell = T * scale;
  const c = document.createElement('canvas');
  c.width = LABEL + cols * cell;
  c.height = LABEL + rows * cell;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  // checker behind transparent pixels
  for (let y = 0; y < rows * 2; y++)
    for (let x = 0; x < cols * 2; x++) {
      g.fillStyle = (x + y) % 2 ? '#e4e4e4' : '#f4f4f4';
      g.fillRect(LABEL + (x * cell) / 2, LABEL + (y * cell) / 2, cell / 2, cell / 2);
    }
  g.imageSmoothingEnabled = false;
  g.drawImage(img, c0 * T, r0 * T, cols * T, rows * T, LABEL, LABEL, cols * cell, rows * cell);
  g.strokeStyle = 'rgba(255,0,90,0.8)';
  g.lineWidth = 1;
  g.fillStyle = '#111';
  g.font = 'bold 12px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let x = 0; x <= cols; x++) {
    g.beginPath();
    g.moveTo(LABEL + x * cell + 0.5, LABEL);
    g.lineTo(LABEL + x * cell + 0.5, c.height);
    g.stroke();
    if (x < cols) g.fillText(String(c0 + x), LABEL + x * cell + cell / 2, LABEL / 2);
  }
  for (let y = 0; y <= rows; y++) {
    g.beginPath();
    g.moveTo(LABEL, LABEL + y * cell + 0.5);
    g.lineTo(c.width, LABEL + y * cell + 0.5);
    g.stroke();
    if (y < rows) g.fillText(String(r0 + y), LABEL / 2, LABEL + y * cell + cell / 2);
  }
  return c.toDataURL('image/png');
}

/**
 * Let the AI sort the tileset. Returns metas (auto = suggestions) for the tiles it recognised and
 * what it cost; `onProgress` gets "section k of n".
 */
export async function aiSortTileset(ts: Tileset, view: Perspective, onProgress?: (done: number, total: number) => void): Promise<{ tiles: Record<number, TileMeta>; cost: number; recognised: number }> {
  const img = await loadImage(ts.dataUrl);
  const empty = new Set(ts.emptyTiles);
  const sections: [number, number, number, number][] = [];
  for (let r0 = 0; r0 < ts.rows; r0 += SECTION)
    for (let c0 = 0; c0 < ts.columns; c0 += SECTION) {
      const cols = Math.min(SECTION, ts.columns - c0);
      const rows = Math.min(SECTION, ts.rows - r0);
      let any = false;
      for (let y = r0; y < r0 + rows && !any; y++) for (let x = c0; x < c0 + cols; x++) if (!empty.has(y * ts.columns + x)) any = true;
      if (any) sections.push([c0, r0, cols, rows]);
    }
  if (sections.length > 40) throw new Error(`Das Tileset ist sehr groß (${sections.length} Abschnitte) – bitte in kleineren Teilen hochladen`);
  const tiles: Record<number, TileMeta> = {};
  let cost = 0;
  let done = 0;
  let failed = 0;
  let lastError = '';
  onProgress?.(0, sections.length);
  // three sections at a time
  const queue = sections.slice();
  const worker = async () => {
    for (;;) {
      const s = queue.shift();
      if (!s) return;
      const [c0, r0, cols, rows] = s;
      try {
        const image = await sectionImage(img, ts, c0, r0, cols, rows);
        const r = await fetch('/api/tiles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image, col0: c0, row0: r0, cols, rows, tileSize: ts.tileSize, view, mode: aiMode() }) });
        const out = (await r.json().catch(() => null)) as { ok: boolean; tiles?: { c: number; r: number; kind: Kind }[]; cost?: number; error?: string } | null;
        if (!out?.ok) throw new Error(out?.error ?? (r.status === 404 ? 'Die KI gibt es nur in der veröffentlichten App (Vercel)' : `Serverfehler (${r.status})`));
        cost += out.cost ?? 0;
        for (const t of out.tiles ?? []) {
          if (t.c < c0 || t.c >= c0 + cols || t.r < r0 || t.r >= r0 + rows) continue;
          const i = t.r * ts.columns + t.c;
          if (empty.has(i)) continue;
          const m = KIND_META[t.kind];
          if (!m) continue;
          // side view: tagged "side" so the side-scroller generator prefers them
          tiles[i] = { ...m, tags: view === 'side_view' ? ['ai', 'side'] : ['ai'], weight: m.role === 'floor_center' ? 50 : 60, auto: true };
        }
      } catch (e) {
        failed++;
        lastError = e instanceof Error ? e.message : String(e);
      }
      onProgress?.(++done, sections.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (failed === sections.length) throw new Error(lastError || 'Die KI konnte das Tileset nicht lesen');
  return { tiles, cost, recognised: Object.keys(tiles).length };
}
