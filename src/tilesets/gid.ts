// A cell value = tile gid + how the tile is turned (upper bits, like Tiled / Godot):
// transpose first, then flip horizontally / vertically. Godot: set_cell(…, alternative =
// TRANSFORM_FLIP_H | TRANSFORM_FLIP_V | TRANSFORM_TRANSPOSE).

export const FLIP_H = 0x10000000;
export const FLIP_V = 0x20000000;
export const TRANSPOSE = 0x40000000;
export const TRANSFORM_BITS = FLIP_H | FLIP_V | TRANSPOSE;
export const GID_MASK = 0x0fffffff;

/** the plain tile gid of a cell value */
export const tileOf = (v: number) => v & GID_MASK;
/** the transform bits of a cell value */
export const transformOf = (v: number) => v & TRANSFORM_BITS;
export const withTransform = (gid: number, t: number) => (gid ? (gid & GID_MASK) | (t & TRANSFORM_BITS) : 0);

type M = [number, number, number, number]; // a b / c d – maps tile pixel offsets

function toMatrix(t: number): M {
  // transpose first, then flips: M = F · T
  let m: M = t & TRANSPOSE ? [0, 1, 1, 0] : [1, 0, 0, 1];
  if (t & FLIP_H) m = [-m[0], -m[1], m[2], m[3]];
  if (t & FLIP_V) m = [m[0], m[1], -m[2], -m[3]];
  return m;
}

function fromMatrix(m: M): number {
  if (m[0] === 0) {
    // off-diagonal: transposed; row signs give the flips
    return TRANSPOSE | (m[1] < 0 ? FLIP_H : 0) | (m[2] < 0 ? FLIP_V : 0);
  }
  return (m[0] < 0 ? FLIP_H : 0) | (m[3] < 0 ? FLIP_V : 0);
}

const mul = (a: M, b: M): M => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3]];

/** turn a transform 90° clockwise */
export const rotateCW = (t: number) => fromMatrix(mul([0, -1, 1, 0], toMatrix(t)));
/** mirror a transform left ↔ right */
export const mirrorH = (t: number) => fromMatrix(mul([-1, 0, 0, 1], toMatrix(t)));
/** mirror a transform top ↔ bottom */
export const mirrorV = (t: number) => fromMatrix(mul([1, 0, 0, -1], toMatrix(t)));

/** rotation (0, 90, 180, 270) and mirroring of a transform – for labels */
export function describeTransform(t: number): { deg: number; mirrored: boolean } {
  const m = toMatrix(t);
  const det = m[0] * m[3] - m[1] * m[2];
  const mirrored = det < 0;
  // remove the mirror (left ↔ right) and read the rotation
  const r = mirrored ? mul(m, [-1, 0, 0, 1]) : m;
  const deg = r[0] === 1 ? 0 : r[0] === -1 ? 180 : r[2] === 1 ? 90 : 270;
  return { deg, mirrored };
}

/** canvas transform for drawing a tile into (dx, dy, dw, dh) – call inside save()/restore() */
export function applyCanvasTransform(ctx: CanvasRenderingContext2D, t: number, dx: number, dy: number, dw: number, dh: number) {
  ctx.translate(dx + dw / 2, dy + dh / 2);
  ctx.scale(t & FLIP_H ? -1 : 1, t & FLIP_V ? -1 : 1);
  if (t & TRANSPOSE) ctx.transform(0, 1, 1, 0, 0, 0);
}
