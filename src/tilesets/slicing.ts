import type { Tileset } from '../types';
import { loadImage } from '../utils/image';
import { uid } from '../utils/id';

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

export async function createTilesetFromFile(
  name: string,
  dataUrl: string,
  preferredTileSize: number,
  firstGid: number,
): Promise<Tileset> {
  const img = await loadImage(dataUrl);
  const tileSize = guessTileSize(img.naturalWidth, img.naturalHeight, preferredTileSize);
  const { columns, rows, empty } = await findEmptyTiles(dataUrl, tileSize);
  return {
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
  };
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
