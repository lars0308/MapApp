import { CHANNELS, FIX, code, codeToRgba, type Channel, type Ramps } from './palette';

// Tiny pixel painter for the demo parts: shapes are filled with channel base colours,
// then `finish()` adds shading (light top, dark bottom/right) and a 1 px outline –
// the classic pixel-art look without hand-drawing every part.

export const S = 32;

export class Painter {
  g = new Uint8Array(S * S);
  /** pixels that keep their colour in the shading pass (details, highlights) */
  fixed = new Uint8Array(S * S);

  in(x: number, y: number) {
    return x >= 0 && y >= 0 && x < S && y < S;
  }
  get(x: number, y: number) {
    return this.in(x, y) ? this.g[y * S + x] : 0;
  }
  px(x: number, y: number, c: number, keep = false) {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.in(x, y)) return this;
    this.g[y * S + x] = c;
    this.fixed[y * S + x] = keep ? 1 : 0;
    return this;
  }
  /** fill channel base colour (shaded later) */
  rect(x0: number, y0: number, x1: number, y1: number, c: number, keep = false) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.px(x, y, c, keep);
    return this;
  }
  /** ellipse with centre in pixel-corner coordinates (cx = 16 → between pixel 15 and 16) */
  ell(cx: number, cy: number, rx: number, ry: number, c: number, where?: (x: number, y: number) => boolean, keep = false) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1 && (!where || where(x, y))) this.px(x, y, c, keep);
      }
    return this;
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number, keep = false) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.px(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c, keep);
    return this;
  }
  /** triangle given by three points */
  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: number) {
    const minX = Math.floor(Math.min(ax, bx, cx));
    const maxX = Math.ceil(Math.max(ax, bx, cx));
    const minY = Math.floor(Math.min(ay, by, cy));
    const maxY = Math.ceil(Math.max(ay, by, cy));
    const s = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const d1 = s(px, py, ax, ay, bx, by);
        const d2 = s(px, py, bx, by, cx, cy);
        const d3 = s(px, py, cx, cy, ax, ay);
        const neg = d1 < 0 || d2 < 0 || d3 < 0;
        const pos = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(neg && pos)) this.px(x, y, c);
      }
    return this;
  }
  /** remove pixels */
  clear(x0: number, y0: number, x1: number, y1: number) {
    return this.rect(x0, y0, x1, y1, 0);
  }

  /** move everything horizontally */
  shiftX(dx: number) {
    const g = new Uint8Array(S * S);
    const fx = new Uint8Array(S * S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const tx = x + dx;
        if (tx < 0 || tx >= S) continue;
        g[y * S + tx] = this.g[y * S + x];
        fx[y * S + tx] = this.fixed[y * S + x];
      }
    this.g = g;
    this.fixed = fx;
    return this;
  }
  /** mirror around the vertical line at cx (pixel-corner coordinates, 16 = centre) */
  mirrorX(cx = S / 2) {
    const g = new Uint8Array(S * S);
    const fx = new Uint8Array(S * S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const tx = Math.round(2 * cx - 1 - x);
        if (tx < 0 || tx >= S) continue;
        g[y * S + tx] = this.g[y * S + x];
        fx[y * S + tx] = this.fixed[y * S + x];
      }
    this.g = g;
    this.fixed = fx;
    return this;
  }
  /** remove pixels where the test is true */
  clearWhere(test: (x: number, y: number) => boolean) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (test(x, y)) this.g[y * S + x] = 0;
    return this;
  }

  /** light top edge, dark bottom / right edge for all channel base pixels */
  shade() {
    const src = this.g.slice();
    const empty = (x: number, y: number) => !this.in(x, y) || src[y * S + x] === 0;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        const c = src[i];
        if (!c || c >= 64 || this.fixed[i] || (c - 1) % 4 !== 1) continue;
        const base = c - 1;
        if (empty(x, y + 1) || empty(x + 1, y)) this.g[i] = base + 2;
        else if (empty(x, y - 1) || empty(x - 1, y)) this.g[i] = base;
      }
    return this;
  }
  outline() {
    const src = this.g.slice();
    const solid = (x: number, y: number) => this.in(x, y) && src[y * S + x] !== 0 && src[y * S + x] !== FIX.SHADOW && src[y * S + x] !== FIX.GLOW;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        if (src[y * S + x]) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) this.g[y * S + x] = FIX.OUTLINE;
      }
    return this;
  }
  finish({ outline = true, shade = true } = {}) {
    if (shade) this.shade();
    if (outline) this.outline();
    return this;
  }
}

export const C = (ch: Channel, shade: 0 | 1 | 2 = 1) => code(ch, shade);
export { FIX, CHANNELS };

/** Cropped RGBA of a painted part. */
export interface Pixels {
  x: number;
  y: number;
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

export function render(p: Painter, ramps: Ramps): Pixels {
  let x0 = S,
    y0 = S,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++)
      if (p.g[y * S + x]) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) return { x: 0, y: 0, w: 1, h: 1, data: new Uint8ClampedArray(4) };
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = p.g[(y + y0) * S + x + x0];
      if (!c) continue;
      const [r, g, b, a] = codeToRgba(c, ramps);
      const k = (y * w + x) * 4;
      data[k] = r;
      data[k + 1] = g;
      data[k + 2] = b;
      data[k + 3] = a;
    }
  return { x: x0, y: y0, w, h, data };
}

/** channels a painted part uses (for the colour panel) */
export function channelsUsed(p: Painter): Channel[] {
  const out = new Set<Channel>();
  for (const c of p.g) if (c > 0 && c < 64) out.add(CHANNELS[Math.floor((c - 1) / 4)]);
  return [...out];
}
