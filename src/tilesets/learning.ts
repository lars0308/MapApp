import type { TileCategory, TileMeta, TileRole, Tileset } from '../types';
import { loadImage } from '../utils/image';

// The app learns from the user's tile assignments.
// Every confirmed assignment (quick menu, inspector, "Vorschläge bestätigen", library save)
// is stored as an example: a small visual fingerprint of the tile + its category / role.
// Examples are also stored mirrored (left wall ↔ right wall, corners …), so one corrected
// corner teaches all four. New tiles take the type of the most similar example when it is
// close enough; otherwise the rule-based detection (autoAssign) decides.

const G = 8; // fingerprint grid (G×G luminance cells)
const A = 4; // alpha grid
const KEY = 'mapforge.learned.v1';
const MAX_EXAMPLES = 3000;
/** RMS distance below which a learned example is trusted */
export const MATCH_THRESHOLD = 0.045;
/** RMS distance for "similar tile in the same tileset" */
export const SIMILAR_THRESHOLD = 0.03;

export interface Example {
  fp: number[];
  category?: TileCategory;
  role?: TileRole;
}

type FP = number[];

export async function fingerprints(ts: Pick<Tileset, 'dataUrl' | 'tileSize' | 'columns' | 'rows' | 'emptyTiles'>): Promise<Map<number, FP>> {
  const img = await loadImage(ts.dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const empty = new Set(ts.emptyTiles);
  const out = new Map<number, FP>();
  const s = ts.tileSize;
  for (let i = 0; i < ts.columns * ts.rows; i++) {
    if (empty.has(i)) continue;
    const x0 = (i % ts.columns) * s;
    const y0 = Math.floor(i / ts.columns) * s;
    const lum = new Float64Array(G * G);
    const lumN = new Float64Array(G * G);
    const alpha = new Float64Array(A * A);
    let r = 0,
      g = 0,
      b = 0,
      n = 0;
    // edge profile: outermost row/column per side, the one inside it, and the 4 corner pixels
    const edge = new Float64Array(12);
    const edgeN = new Float64Array(12);
    const addEdge = (k: number, L: number) => ((edge[k] += L), edgeN[k]++);
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        const k = ((y0 + y) * canvas.width + x0 + x) * 4;
        const gy = Math.min(G - 1, Math.floor((y * G) / s));
        const gx = Math.min(G - 1, Math.floor((x * G) / s));
        const ay = Math.min(A - 1, Math.floor((y * A) / s));
        const ax = Math.min(A - 1, Math.floor((x * A) / s));
        if (data[k + 3] < 128) continue;
        alpha[ay * A + ax]++;
        const L = (0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2]) / 255;
        lum[gy * G + gx] += L;
        lumN[gy * G + gx]++;
        // order: t b l r (outer), t b l r (second), tl tr bl br
        if (y === 0) addEdge(0, L);
        if (y === s - 1) addEdge(1, L);
        if (x === 0) addEdge(2, L);
        if (x === s - 1) addEdge(3, L);
        if (y === 1) addEdge(4, L);
        if (y === s - 2) addEdge(5, L);
        if (x === 1) addEdge(6, L);
        if (x === s - 2) addEdge(7, L);
        const c = Math.max(1, Math.round(s / 8));
        if (y < c && x < c) addEdge(8, L);
        if (y < c && x >= s - c) addEdge(9, L);
        if (y >= s - c && x < c) addEdge(10, L);
        if (y >= s - c && x >= s - c) addEdge(11, L);
        r += data[k];
        g += data[k + 1];
        b += data[k + 2];
        n++;
      }
    const cellA = (s / A) * (s / A);
    const fp: FP = [];
    for (let c = 0; c < G * G; c++) fp.push(lumN[c] ? lum[c] / lumN[c] : 0);
    for (let c = 0; c < A * A; c++) fp.push(alpha[c] / cellA);
    fp.push(n ? r / n / 255 : 0, n ? g / n / 255 : 0, n ? b / n / 255 : 0);
    for (let k = 0; k < 12; k++) fp.push(edgeN[k] ? edge[k] / edgeN[k] : 0);
    out.set(i, fp);
  }
  return out;
}

export function distance(a: FP, b: FP): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    // alpha shape, colour and especially the thin edges (walls, corners) weigh more
    const w = i < G * G ? 1 : i < G * G + A * A ? 2 : i < G * G + A * A + 3 ? 3 : 8;
    sum += w * d * d;
  }
  return Math.sqrt(sum / (G * G + 2 * A * A + 9 + 8 * 12));
}

/* ------------------------------------------------------------------ mirroring */

function mirrorFp(fp: FP, axis: 'x' | 'y'): FP {
  const out = fp.slice();
  const flip = (offset: number, n: number) => {
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const sx = axis === 'x' ? n - 1 - x : x;
        const sy = axis === 'y' ? n - 1 - y : y;
        out[offset + y * n + x] = fp[offset + sy * n + sx];
      }
  };
  flip(0, G);
  flip(G * G, A);
  // edge profile: swap the mirrored sides / corners
  const e = G * G + A * A + 3;
  const perm = axis === 'x' ? [0, 1, 3, 2, 4, 5, 7, 6, 9, 8, 11, 10] : [1, 0, 2, 3, 5, 4, 6, 7, 10, 11, 8, 9];
  for (let k = 0; k < 12; k++) out[e + k] = fp[e + perm[k]];
  return out;
}

const SWAP_X: Record<string, string> = { left: 'right', right: 'left' };
const SWAP_Y: Record<string, string> = { top: 'bottom', bottom: 'top', up: 'down', down: 'up' };

/** Role of the mirrored tile, e.g. wall_left → wall_right, corner_top_left → corner_top_right. */
function mirrorRole(role: TileRole | undefined, axis: 'x' | 'y'): TileRole | undefined {
  if (!role) return role;
  // a front / door / bridge looks different upside down – no vertical mirror for those
  if (axis === 'y' && /front|door|bridge|stairs|cliff|shadow|abyss_edge/.test(role)) return undefined;
  const map = axis === 'x' ? SWAP_X : SWAP_Y;
  return role
    .split('_')
    .map((p) => map[p] ?? p)
    .join('_') as TileRole;
}

const CAT_X: Partial<Record<TileCategory, TileCategory>> = { wallLeft: 'wallRight', wallRight: 'wallLeft' };
const CAT_Y: Partial<Record<TileCategory, TileCategory>> = { wallTop: 'wallBottom', wallBottom: 'wallTop' };

/* ------------------------------------------------------------------ storage */

let cache: Example[] | null = null;

export function loadExamples(): Example[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Example[];
  } catch {
    cache = [];
  }
  return cache;
}

function saveExamples(list: Example[]) {
  cache = list.slice(-MAX_EXAMPLES);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache.map((e) => ({ ...e, fp: e.fp.map((v) => Math.round(v * 1000) / 1000) }))));
  } catch {
    // storage full / unavailable: keep in memory for this session
  }
}

export function learnedCount(): number {
  return loadExamples().length;
}

export function forgetLearned() {
  saveExamples([]);
}

/**
 * Store the assignments of these tiles as examples (plus mirrored variants).
 * Tiles without category/role or with unconfirmed suggestions are skipped.
 */
export async function learnFrom(ts: Pick<Tileset, 'dataUrl' | 'tileSize' | 'columns' | 'rows' | 'emptyTiles' | 'tiles'>, indices?: number[]): Promise<number> {
  const fps = await fingerprints(ts);
  const list = loadExamples().slice();
  let added = 0;
  for (const [i, fp] of fps) {
    if (indices && !indices.includes(i)) continue;
    const m = ts.tiles[i];
    if (!m || m.auto || (!m.category && !m.role)) continue;
    // replace an existing example for the same look
    const add = (e: Example) => {
      const k = list.findIndex((o) => distance(o.fp, e.fp) < 0.01);
      if (k >= 0) list.splice(k, 1);
      list.push(e);
    };
    add({ fp, category: m.category, role: m.role });
    for (const axis of ['x', 'y'] as const) {
      const role = mirrorRole(m.role, axis);
      if (m.role && !role) continue;
      const catMap = axis === 'x' ? CAT_X : CAT_Y;
      add({ fp: mirrorFp(fp, axis), category: m.category ? (catMap[m.category] ?? m.category) : undefined, role });
    }
    added++;
  }
  saveExamples(list);
  return added;
}

/** Most similar learned example within MATCH_THRESHOLD. */
export function matchLearned(fp: FP, examples = loadExamples()): Example | null {
  let best: Example | null = null;
  let bestD = MATCH_THRESHOLD;
  for (const e of examples) {
    if (e.fp.length !== fp.length) continue;
    const d = distance(fp, e.fp);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/**
 * Tiles of the same tileset that look like `index` and are not assigned by hand yet
 * (unassigned or unconfirmed suggestions) – they get the same type as a suggestion.
 */
export async function similarTiles(ts: Pick<Tileset, 'dataUrl' | 'tileSize' | 'columns' | 'rows' | 'emptyTiles' | 'tiles'>, index: number): Promise<number[]> {
  const fps = await fingerprints(ts);
  const ref = fps.get(index);
  if (!ref) return [];
  const out: number[] = [];
  for (const [i, fp] of fps) {
    if (i === index) continue;
    const m = ts.tiles[i];
    if (m && !m.auto && (m.category || m.role)) continue;
    if (distance(ref, fp) < SIMILAR_THRESHOLD) out.push(i);
  }
  return out;
}

/** Suggestion metas from learned examples (auto = true), for tiles without manual assignment. */
export async function learnedSuggestions(ts: Pick<Tileset, 'dataUrl' | 'tileSize' | 'columns' | 'rows' | 'emptyTiles' | 'tiles'>): Promise<Record<number, TileMeta>> {
  const examples = loadExamples();
  if (!examples.length) return {};
  const fps = await fingerprints(ts);
  const out: Record<number, TileMeta> = {};
  for (const [i, fp] of fps) {
    const cur = ts.tiles[i];
    if (cur && !cur.auto && (cur.category || cur.role)) continue;
    const e = matchLearned(fp, examples);
    if (!e) continue;
    out[i] = { ...(cur ?? { tags: [], weight: 50 }), category: e.category, role: e.role, tags: [...new Set([...(cur?.tags ?? []), 'learned'])], weight: cur?.weight ?? 50, auto: true };
  }
  return out;
}
