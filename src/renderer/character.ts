import { getPlayerSprite } from '../playtest/playerSprite';

// Pixel test character (editor-only, never exported) – or the own figure from "Charakter bauen".

export interface CharacterState {
  /** centre x in tiles */
  x: number;
  /** feet y in tiles (y-sort origin) */
  y: number;
  dir: 'down' | 'up' | 'left' | 'right';
  /** walking diagonally (dir is then left / right): down-left/right or up-left/right */
  diag?: 'down' | 'up';
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
  const own = getPlayerSprite();
  if (own) {
    // own character: ~1.6 tiles tall for a 32 px sprite, feet on the ground point
    const spx = zoom / 20; // 32 px figure ≈ 1.6 tiles
    const walking = c.moving;
    // direction rows (front / side / back), older player figures only have the front rows
    const view = c.diag ? (c.diag === 'down' ? 'fside' : 'bside') : c.dir === 'up' ? 'back' : c.dir === 'down' ? 'front' : 'side';
    const anim = walking ? 'walk' : 'idle';
    const r = own.rows?.[`${anim}_${view}`] ?? own.rows?.[`${anim}_side`] ?? own.rows?.[`${anim}_front`];
    const row = r ? r.row : walking ? 1 : 0;
    const count = r ? r.frames : walking ? own.walk : own.idle;
    const frame = walking ? Math.floor(c.step * 4) % count : Math.floor(performance.now() / 250) % count;
    const w = own.size * spx;
    const x = sx(c.x) - w / 2;
    const y = sy(c.y) - (own.feet + 1) * spx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (c.dir === 'left') {
      ctx.translate(sx(c.x) * 2, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(own.img, frame * own.size, row * own.size, own.size, own.size, Math.round(x), Math.round(y), Math.round(w), Math.round(w));
    ctx.restore();
    return;
  }
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
