import type { CustomObject } from '../types';
import type { SpriteDoc } from '../sprites/types';
import { composeView } from '../sprites/store';

// A figure from the builder as a map object: its front view, cut to what is drawn, standing on
// the bottom edge of a box of whole tiles (1 figure pixel = 1 pixel at 32 px per tile).

const A = 32;

export function figureToObject(doc: SpriteDoc, collision = true): CustomObject | null {
  const n = doc.size;
  const px = composeView(doc, 'front');
  let x0 = n;
  let y0 = n;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (px[(y * n + x) * 4 + 3] > 0) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) return null;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const w = Math.max(1, Math.ceil(bw / A));
  const h = Math.max(1, Math.ceil(bh / A));
  const src = document.createElement('canvas');
  src.width = n;
  src.height = n;
  src.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px), n, n), 0, 0);
  const c = document.createElement('canvas');
  c.width = w * A;
  c.height = h * A;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  // centred, feet on the bottom edge
  g.drawImage(src, x0, y0, bw, bh, Math.floor((w * A - bw) / 2), h * A - bh, bw, bh);
  return { id: `own_${doc.id}`, label: doc.name, png: c.toDataURL('image/png'), w, h, collision, kind: doc.kind };
}
