// Neutral pixel test character (editor-only, never exported).

export interface CharacterState {
  /** centre x in tiles */
  x: number;
  /** feet y in tiles (y-sort origin) */
  y: number;
  dir: 'down' | 'up' | 'left' | 'right';
  /** walk animation phase */
  step: number;
  moving: boolean;
}

/** Draws a 12×20 px figure scaled to the zoom, feet at (x, y). */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  c: CharacterState,
  sx: (x: number) => number,
  sy: (y: number) => number,
  zoom: number,
) {
  const px = zoom / 16; // one sprite pixel
  const baseX = sx(c.x) - 6 * px;
  const baseY = sy(c.y) - 20 * px;
  const r = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(baseX + x * px), Math.round(baseY + y * px), Math.ceil(w * px), Math.ceil(h * px));
  };
  const bob = c.moving && Math.floor(c.step * 2) % 2 ? 1 : 0;
  const legA = c.moving ? (Math.floor(c.step * 2) % 2 ? 1 : -1) : 0;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(sx(c.x), sy(c.y) - px, 5 * px, 2 * px, 0, 0, Math.PI * 2);
  ctx.fill();
  // legs
  r(3, 15 - bob, 2, 4 + (legA > 0 ? 1 : 0), '#3a3348');
  r(7, 15 - bob, 2, 4 + (legA < 0 ? 1 : 0), '#3a3348');
  // body
  r(2, 8 - bob, 8, 8, '#e889b0');
  r(2, 8 - bob, 8, 2, '#f4a8c8');
  r(1, 9 - bob, 1, 5, '#c96f95');
  r(10, 9 - bob, 1, 5, '#c96f95');
  // head
  r(3, 1 - bob, 6, 7, '#f0d2b4');
  r(3, 1 - bob, 6, 2, '#4b3a57');
  if (c.dir !== 'up') {
    const eyeShift = c.dir === 'left' ? -1 : c.dir === 'right' ? 1 : 0;
    r(4 + eyeShift, 4 - bob, 1, 1, '#1c1a1f');
    r(7 + eyeShift, 4 - bob, 1, 1, '#1c1a1f');
  } else r(3, 3 - bob, 6, 2, '#4b3a57');
}
