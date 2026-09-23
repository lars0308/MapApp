import type { Painter } from './painter';
import type { Ramps } from './palette';

export type SpriteKind = 'character' | 'object';

export interface SlotDef {
  id: string;
  label: string;
  /** several layers of this slot may exist (details, effects) – a new part adds instead of replacing */
  multi?: boolean;
}

/** Body measurements the character parts fit to (32 × 32 design grid). */
export interface Body {
  /** head ellipse */
  hx: number;
  hy: number;
  hrx: number;
  hry: number;
  /** torso x0, y0, x1, y1 */
  t: [number, number, number, number];
  aL: [number, number];
  aR: [number, number];
  /** arm rows (hand = last two rows) */
  ay: [number, number];
  lL: [number, number];
  lR: [number, number];
  ly: [number, number];
}

/** Bounds of an object's base shape – details and effects attach to it. */
export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FitContext {
  body: Body;
  bounds: Bounds;
}

export interface DemoPart {
  id: string;
  kind: SpriteKind;
  slot: string;
  label: string;
  paint: (ctx: FitContext) => Painter;
  /** body parts define the measurements, base shapes the bounds */
  body?: Body;
  bounds?: Bounds;
}

/** Part the user saved from own drawings. Pixels are stored as PNG (canvas-sized). */
export interface UserPart {
  id: string;
  kind: SpriteKind;
  slot: string;
  label: string;
  size: number;
  png: string;
  createdAt: number;
}

export interface SpriteLayer {
  id: string;
  name: string;
  slot: string | null;
  /** demo part this layer was made from (refits to a new body until drawn on) */
  partId: string | null;
  edited: boolean;
  visible: boolean;
  /** size × size RGBA */
  data: Uint8ClampedArray;
}

export interface SpriteDoc {
  id: string;
  kind: SpriteKind;
  name: string;
  size: number;
  layers: SpriteLayer[];
  ramps: Ramps;
  updatedAt: number;
}
