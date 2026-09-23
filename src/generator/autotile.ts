import { CELL_VOID, CELL_WALL, type Perspective, type TileCategory } from '../types';
import { PERSPECTIVE_INFO } from './perspective';
import type { Grid } from './corridors';

// Rule-based tile role resolution ("auto-tiling light").
// Every wall / floor cell gets a role derived from its neighbourhood. The roles are
// mapped to tile categories (+ preferred tags). A future terrain system can replace
// `wallRequest` while keeping the masks and roles computed here.

// wall neighbour bits (clockwise from north)
export const N = 1,
  NE = 2,
  E = 4,
  SE = 8,
  S = 16,
  SW = 32,
  W = 64,
  NW = 128;

export enum WallRole {
  None = 0,
  Top = 1, // flat wall / upper edge (cap)
  Bottom = 2,
  Left = 3,
  Right = 4,
  Inner = 5,
  Outer = 6,
  FrontBase = 7, // visible wall face, lowest row
  FrontUpper = 8, // visible wall face, rows above
}

export interface RoleRequest {
  cats: TileCategory[];
  prefer?: string;
  avoid?: string[];
}

const WALL_ORDER: TileCategory[] = ['wallTop', 'wallBottom', 'wallLeft', 'wallRight'];
const withFallback = (first: TileCategory[]): TileCategory[] => [...first, ...WALL_ORDER.filter((c) => !first.includes(c))];

export function wallRequest(role: WallRole, perspective: Perspective): RoleRequest {
  const side = PERSPECTIVE_INFO[perspective].sideFaces;
  switch (role) {
    case WallRole.FrontBase:
      return { cats: ['wallFront', ...withFallback(['wallTop'])], prefer: 'base', avoid: ['upper'] };
    case WallRole.FrontUpper:
      return { cats: ['wallFront', ...withFallback(['wallTop'])], prefer: 'upper', avoid: ['base'] };
    case WallRole.Top:
      return { cats: withFallback(['wallTop']) };
    case WallRole.Bottom:
      return { cats: withFallback(['wallBottom']) };
    case WallRole.Left:
      return side ? { cats: withFallback(['wallLeft']), prefer: 'side' } : { cats: withFallback(['wallLeft']), avoid: ['side'] };
    case WallRole.Right:
      return side ? { cats: withFallback(['wallRight']), prefer: 'side' } : { cats: withFallback(['wallRight']), avoid: ['side'] };
    case WallRole.Inner:
      return { cats: ['innerCorner', 'outerCorner', ...WALL_ORDER] };
    case WallRole.Outer:
      return { cats: ['outerCorner', 'innerCorner', ...WALL_ORDER] };
    default:
      return { cats: [] };
  }
}

/** Base role of a wall cell from its 8-neighbour walkable mask. */
function baseRole(m: number, faces: boolean): WallRole {
  const n = !!(m & N);
  const s = !!(m & S);
  const e = !!(m & E);
  const w = !!(m & W);
  if (s && faces) return WallRole.FrontBase;
  const orth = +n + +s + +e + +w;
  if (orth >= 2 && !(n && s && !e && !w) && !(e && w && !n && !s)) return WallRole.Inner;
  if (s) return WallRole.Top;
  if (n) return WallRole.Bottom;
  if (e) return WallRole.Left;
  if (w) return WallRole.Right;
  return WallRole.Outer;
}

export interface AutoTileResult {
  wallRoles: Uint8Array;
  /** shadow tag per cell ('' = none) */
  shadows: ('' | 'top' | 'side' | 'corner')[];
  floorMask: Uint8Array;
}

/**
 * Resolve wall roles for the perspective. In 3/4 views walls facing the camera
 * get a visible front (1 or 2 rows) and a cap above; this may turn void cells
 * above the front into wall cells.
 */
export function resolveAutoTiles(g: Grid, wallMask: Uint8Array, perspective: Perspective, shadows: boolean): AutoTileResult {
  const { W, H, cells } = g;
  const info = PERSPECTIVE_INFO[perspective];
  const faces = info.faceRows > 0;
  const roles = new Uint8Array(W * H);

  for (let i = 0; i < W * H; i++) if (cells[i] === CELL_WALL) roles[i] = baseRole(wallMask[i], faces);

  if (faces) {
    const bases: number[] = [];
    for (let i = 0; i < W * H; i++) if (roles[i] === WallRole.FrontBase) bases.push(i);
    const free = (i: number) => cells[i] === CELL_VOID || (cells[i] === CELL_WALL && (roles[i] === WallRole.Outer || roles[i] === WallRole.Top));
    for (const b of bases) {
      const x = b % W;
      let y = ((b / W) | 0) - 1;
      // extra face rows (45°)
      for (let k = 1; k < info.faceRows && y >= 0; k++, y--) {
        const i = y * W + x;
        if (!free(i)) break;
        cells[i] = CELL_WALL;
        roles[i] = WallRole.FrontUpper;
      }
      // wall cap above the face
      if (y >= 0) {
        const i = y * W + x;
        if (free(i)) {
          cells[i] = CELL_WALL;
          roles[i] = WallRole.Top;
        }
      }
    }
  }

  if (faces) {
    // close the outline next to raised walls (outer corners beside caps / upper faces)
    const raised = (i: number) => roles[i] === WallRole.Top || roles[i] === WallRole.FrontUpper;
    for (let y = H - 2; y >= 0; y--)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (cells[i] !== CELL_VOID || cells[i + W] !== CELL_WALL) continue;
        if (raised(i - 1) || raised(i + 1)) {
          cells[i] = CELL_WALL;
          roles[i] = WallRole.Outer;
        }
      }
  }

  const walk = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < W && y < H && cells[y * W + x] !== CELL_VOID && cells[y * W + x] !== CELL_WALL;
  const wall = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && cells[y * W + x] === CELL_WALL;

  const floorMask = new Uint8Array(W * H);
  const shadowTags: AutoTileResult['shadows'] = new Array(W * H).fill('');
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!walk(x, y)) continue;
      const i = y * W + x;
      floorMask[i] = (walk(x, y - 1) ? 1 : 0) | (walk(x + 1, y) ? 2 : 0) | (walk(x, y + 1) ? 4 : 0) | (walk(x - 1, y) ? 8 : 0);
      if (!shadows) continue;
      const top = wall(x, y - 1);
      const left = faces && wall(x - 1, y);
      shadowTags[i] = top && left ? 'corner' : top ? 'top' : left ? 'side' : '';
    }
  return { wallRoles: roles, shadows: shadowTags, floorMask };
}
