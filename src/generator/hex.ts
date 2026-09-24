// Hex grid geometry ("odd-r" offset layout, pointy top): every odd row is shifted half a hex
// to the right, rows are 3/4 of a hex apart. This is exactly Godot's hexagon TileSet with
// TILE_LAYOUT_STACKED and TILE_OFFSET_AXIS_HORIZONTAL. A hex fills a 1 × 1 box (tile image).
//
// Directions (bit in river / road masks): 0 E, 1 SE, 2 SW, 3 W, 4 NW, 5 NE.

export const HEX_DIRS = ['E', 'SE', 'SW', 'W', 'NW', 'NE'] as const;
export const ROW_STEP = 0.75;

const EVEN: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
];
const ODD: [number, number][] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];

/** neighbour of (x, y) in direction d (may lie outside the map) */
export function hexNeighbor(x: number, y: number, d: number): [number, number] {
  const [dx, dy] = (y & 1 ? ODD : EVEN)[d];
  return [x + dx, y + dy];
}

export const opposite = (d: number) => (d + 3) % 6;

/** direction from a to its neighbour b, -1 if not neighbours */
export function hexDirTo(ax: number, ay: number, bx: number, by: number): number {
  for (let d = 0; d < 6; d++) {
    const [nx, ny] = hexNeighbor(ax, ay, d);
    if (nx === bx && ny === by) return d;
  }
  return -1;
}

function toCube(x: number, y: number): [number, number, number] {
  const q = x - (y - (y & 1)) / 2;
  const r = y;
  return [q, r, -q - r];
}

export function hexDistance(ax: number, ay: number, bx: number, by: number): number {
  const a = toCube(ax, ay);
  const b = toCube(bx, by);
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

/** top-left of the hex box in world units */
export function hexOrigin(x: number, y: number): [number, number] {
  return [x + (y & 1 ? 0.5 : 0), y * ROW_STEP];
}

/** world size of a W × H hex map */
export function hexWorldSize(W: number, H: number): [number, number] {
  return [W + 0.5, (H - 1) * ROW_STEP + 1];
}

/** hex cell under a world point (nearest centre) */
export function hexAt(wx: number, wy: number): { x: number; y: number } {
  const r0 = Math.floor(wy / ROW_STEP);
  let best = { x: 0, y: 0 };
  let bd = Infinity;
  for (let y = r0 - 1; y <= r0 + 1; y++) {
    const off = y & 1 ? 0.5 : 0;
    const c0 = Math.floor(wx - off);
    for (let x = c0 - 1; x <= c0 + 1; x++) {
      const cx = x + off + 0.5;
      const cy = y * ROW_STEP + 0.5;
      const d = (wx - cx) ** 2 + (wy - cy) ** 2;
      if (d < bd) (bd = d), (best = { x, y });
    }
  }
  return best;
}

/** corners of a hex box (0..1), pointy top, clockwise from the top */
export const HEX_CORNERS: [number, number][] = [
  [0.5, 0],
  [1, 0.25],
  [1, 0.75],
  [0.5, 1],
  [0, 0.75],
  [0, 0.25],
];

/** middle of the edge towards direction d (0..1 box) */
export const HEX_EDGE_MID: [number, number][] = [
  [1, 0.5],
  [0.75, 0.875],
  [0.25, 0.875],
  [0, 0.5],
  [0.25, 0.125],
  [0.75, 0.125],
];
