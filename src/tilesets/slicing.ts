import type { GridCut, TileMeta, Tileset } from '../types';
import { loadImage } from '../utils/image';
import { uid } from '../utils/id';
import { slicePieces } from './pieces';

export const COMMON_TILE_SIZES = [16, 32, 48, 64];

/** Indices of tiles whose pixels are all (almost) transparent. */
export async function findEmptyTiles(dataUrl: string, tileSize: number): Promise<{ columns: number; rows: number; empty: number[] }> {
  const img = await loadImage(dataUrl);
  const columns = Math.max(1, Math.floor(img.naturalWidth / tileSize));
  const rows = Math.max(1, Math.floor(img.naturalHeight / tileSize));
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const empty: number[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < columns; c++) {
      let opaque = false;
      for (let y = r * tileSize; y < (r + 1) * tileSize && !opaque; y++)
        for (let x = c * tileSize; x < (c + 1) * tileSize; x++)
          if (data[(y * canvas.width + x) * 4 + 3] > 8) {
            opaque = true;
            break;
          }
      if (!opaque) empty.push(r * columns + c);
    }
  return { columns, rows, empty };
}

export function guessTileSize(w: number, h: number, preferred: number): number {
  if (w % preferred === 0 && h % preferred === 0) return preferred;
  for (const s of [16, 32, 48, 64, 24, 8])
    if (w % s === 0 && h % s === 0) return s;
  return 16;
}

/**
 * Detects the tile size from the image content: tile borders show a jump in colour between
 * neighbouring pixel columns/rows, the middle of a tile does not. The largest size whose borders
 * are clearly stronger than its tile middles wins (e.g. 32 px tiles are not cut into 16 px quarters).
 */
export async function detectTileSize(dataUrl: string, preferred: number): Promise<{ size: number; confident: boolean }> {
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);
  // colour jump between two pixels (index math only – big sheets stay fast on phones)
  const diff = (i: number, j: number) => {
    const a = i * 4;
    const b = j * 4;
    return Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]) + Math.abs(data[a + 3] - data[b + 3]);
  };
  // column jump between x-1 and x, row jump between y-1 and y
  const colJump = new Float64Array(w);
  const rowJump = new Float64Array(h);
  for (let x = 1; x < w; x++) {
    let sum = 0;
    for (let y = 0; y < h; y++) sum += diff(y * w + x - 1, y * w + x);
    colJump[x] = sum / h;
  }
  for (let y = 1; y < h; y++) {
    let sum = 0;
    for (let x = 0; x < w; x++) sum += diff((y - 1) * w + x, y * w + x);
    rowJump[y] = sum / w;
  }
  const mean = (arr: Float64Array, step: number, offset: number, n: number) => {
    let sum = 0,
      k = 0;
    for (let v = offset; v < n; v += step) if (v > 0) (sum += arr[v]), k++;
    return k ? sum / k : 0;
  };
  const avg = (mean(colJump, 1, 1, w) + mean(rowJump, 1, 1, h)) / 2 || 1;
  const candidates = [128, 96, 64, 48, 32, 24, 16, 12, 8].filter((c) => w % c === 0 && h % c === 0 && c <= Math.min(w, h));
  for (const c of candidates) {
    if (w / c < 2 && h / c < 2) continue; // need at least two tiles along one axis
    const border = (mean(colJump, c, c, w) + mean(rowJump, c, c, h)) / 2;
    if (c % 2 === 0) {
      const half = c / 2;
      const middle = (mean(colJump, c, half, w) + mean(rowJump, c, half, h)) / 2;
      if (border > avg * 1.4 && border > middle * 1.6) return { size: c, confident: true };
    }
  }
  return { size: guessTileSize(w, h, preferred), confident: false };
}

/** tiles along one axis for a cut (the last tile needs no spacing after it) */
export function cutCount(size: number, tile: number, margin: number, spacing: number): number {
  return Math.max(0, Math.floor((size - margin + spacing) / (tile + spacing)));
}

/** a cut that needs repacking (anything but a plain square grid) */
export const needsRepack = (c: GridCut) => c.margin > 0 || c.spacing > 0 || c.tileW !== c.tileH;

/**
 * Cuts a sheet with margin, spacing and/or non-square tiles into a tight grid of square tiles
 * (edge = the larger side; narrower tiles are centred, shorter ones stand on the bottom edge, like
 * objects on the ground). Everything after that – palette, generator, Godot export – sees a plain grid.
 */
export async function repackGrid(dataUrl: string, cut: GridCut): Promise<{ dataUrl: string; tileSize: number; width: number; height: number }> {
  const img = await loadImage(dataUrl);
  const { tileW, tileH, margin, spacing } = cut;
  const cols = cutCount(img.naturalWidth, tileW, margin, spacing);
  const rows = cutCount(img.naturalHeight, tileH, margin, spacing);
  if (!cols || !rows) throw new Error(`Bei ${tileW}×${tileH} px mit Rand ${margin} px passt kein Tile ins Bild (${img.naturalWidth}×${img.naturalHeight} px)`);
  if (cols * rows > MAX_GRID_TILES) throw new Error(`${cols * rows} Tiles – zu viele; größere Tiles wählen`);
  const size = Math.max(tileW, tileH);
  const canvas = document.createElement('canvas');
  canvas.width = cols * size;
  canvas.height = rows * size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const ox = Math.floor((size - tileW) / 2);
  const oy = size - tileH;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      ctx.drawImage(img, margin + c * (tileW + spacing), margin + r * (tileH + spacing), tileW, tileH, c * size + ox, r * size + oy, tileW, tileH);
  return { dataUrl: canvas.toDataURL('image/png'), tileSize: size, width: canvas.width, height: canvas.height };
}

/** more tiles than this from one image is no tileset but a picture cut into crumbs */
const MAX_GRID_TILES = 1500;

/**
 * Tileset from an uploaded image. A clean grid is cut as it is; a sheet of separate pieces
 * (gaps, different sizes, gradient / white / transparent background) is cut into its pieces,
 * which are scaled to whole tiles and packed into a new tileset image. `note` explains what happened.
 */
export async function createTilesetFromFile(name: string, dataUrl: string, preferredTileSize: number, firstGid: number): Promise<{ ts: Tileset; note: string }> {
  let img = await loadImage(dataUrl);
  const det = await detectTileSize(dataUrl, preferredTileSize);
  let tileSize = det.size;
  let note = `Raster ${tileSize} px`;
  const gridTiles = Math.floor(img.naturalWidth / tileSize) * Math.floor(img.naturalHeight / tileSize);
  if (!det.confident || gridTiles > MAX_GRID_TILES) {
    const sheet = await slicePieces(dataUrl, preferredTileSize);
    if (sheet) {
      dataUrl = sheet.dataUrl;
      img = await loadImage(dataUrl);
      tileSize = sheet.tileSize;
      note = `${sheet.pieces.length} Einzelteile erkannt, auf ${tileSize} px pro Tile gebracht`;
    } else if (gridTiles > MAX_GRID_TILES) {
      // no pieces found: coarser grid instead of thousands of crumbs
      tileSize = [32, 48, 64, 96, 128].find((s) => Math.floor(img.naturalWidth / s) * Math.floor(img.naturalHeight / s) <= MAX_GRID_TILES) ?? 128;
      note = `kein klares Raster – als ${tileSize}-px-Raster geschnitten`;
    }
  }
  const { columns, rows, empty } = await findEmptyTiles(dataUrl, tileSize);
  const ts: Tileset = {
    id: uid('ts'),
    name,
    source: 'upload',
    dataUrl,
    imageWidth: img.naturalWidth,
    imageHeight: img.naturalHeight,
    tileSize,
    columns,
    rows,
    firstGid,
    active: true,
    tiles: {},
    emptyTiles: empty,
    perspectives: [],
  };
  return { ts, note };
}

export function tileCount(ts: Tileset): number {
  return ts.columns * ts.rows;
}

/** Find tileset + local index for a gid. */
export function resolveGid(tilesets: Tileset[], gid: number): { ts: Tileset; index: number } | null {
  if (!gid) return null;
  for (const ts of tilesets) {
    const n = ts.columns * ts.rows;
    if (gid >= ts.firstGid && gid < ts.firstGid + n) return { ts, index: gid - ts.firstGid };
  }
  return null;
}

/** Apply a meta patch to the tiles with the given gids (pure; shared by the store and the setup wizard). */
export function applyTileMeta(tilesets: Tileset[], gids: number[], patch: Partial<TileMeta>): Tileset[] {
  return tilesets.map((ts) => {
    const n = ts.columns * ts.rows;
    const mine = gids.filter((g) => g >= ts.firstGid && g < ts.firstGid + n);
    if (!mine.length) return ts;
    const tiles = { ...ts.tiles };
    for (const g of mine) {
      const idx = g - ts.firstGid;
      const cur = tiles[idx] ?? { tags: [], weight: 50 };
      tiles[idx] = { ...cur, ...patch };
      if (patch.category === undefined && 'category' in patch) delete tiles[idx].category;
      // any manual edit confirms an automatic suggestion
      if (!('auto' in patch)) delete tiles[idx].auto;
    }
    return { ...ts, tiles };
  });
}
