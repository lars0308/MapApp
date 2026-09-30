import { readFileAsDataUrl } from '../utils/download';

// Own pictures for the figure builder: read, background removed (a picture without transparency
// gets its border colour cleared from the edges inwards), transparent margins cropped.

/**
 * picture without any transparent pixel: the colour of the corners is background – cleared from
 * the edges inwards (flood fill with a small tolerance), so the figure stands free
 */
export function removeBackground(d: ImageData): boolean {
  const { width: w, height: h, data } = d;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return false;
  const corners = [0, w - 1, (h - 1) * w, h * w - 1].map((p) => [data[p * 4], data[p * 4 + 1], data[p * 4 + 2]]);
  // corners must agree (a photo or a full scene is left alone)
  const same = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 30;
  if (corners.filter((c) => same(c, corners[0])).length < 3) return false;
  const bg = corners[0];
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (!same([data[i], data[i + 1], data[i + 2]], bg)) continue;
    data[i + 3] = 0;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  return true;
}

export async function imageDataFromFile(file: File): Promise<ImageData> {
  const url = await readFileAsDataUrl(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Bild konnte nicht gelesen werden'));
    i.src = url;
  });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  if (removeBackground(d)) g.putImageData(d, 0, 0);
  // crop transparent margins so the own sprite sits right
  let x0 = c.width,
    y0 = c.height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++)
      if (d.data[(y * c.width + x) * 4 + 3] > 0) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) throw new Error('Das Bild ist leer (nur transparent)');
  return g.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}
