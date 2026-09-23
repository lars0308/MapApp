import type { Project, TileMeta } from '../types';
import { metaTable, tileBlocks } from '../editor/collision';
import { defaultSide } from '../generator/presets';

// Side-scroller physics for the editor playtest (perspective side_view), in tiles:
// gravity, variable jump height, coyote time, one-way platforms (jump through from below,
// ↓ drops through), ladders, hazards (spikes, water, lava, falling out) → back to the last
// safe spot. Tuned so the generator's jump height / width are exactly reachable.

export interface SideMap {
  W: number;
  H: number;
  solid: Uint8Array;
  platform: Uint8Array;
  ladder: Uint8Array;
  hazard: Uint8Array;
  /** goal cell (end room centre) */
  goal: [number, number] | null;
}

export interface SideInput {
  x: number;
  up: boolean;
  down: boolean;
  jump: boolean;
}

export interface SideBody {
  x: number;
  /** feet */
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  climbing: boolean;
  coyote: number;
  jumpHeld: boolean;
  jumpCut: boolean;
  safe: [number, number];
  safeTimer: number;
  /** seconds of hit flash / respawn blink */
  hurt: number;
  reachedGoal: boolean;
}

const HW = 0.3;
const BH = 1.35;
const G = 38;
const MAX_FALL = 22;
const SPEED = 6.2;
const CLIMB = 4.5;
const COYOTE = 0.1;

type Kind = 'solid' | 'platform' | 'ladder' | 'hazard' | null;

function kindOf(m: TileMeta | undefined): Kind {
  if (!m) return null;
  const r = m.role;
  if (r === 'platform' || r === 'platform_left' || r === 'platform_right') return 'platform';
  if (r === 'ladder') return 'ladder';
  if (r === 'spikes' || r === 'water' || r === 'lava' || m.category === 'water' || m.category === 'lava') return 'hazard';
  if (r === 'back_wall' || m.category === 'deco' || m.category === 'spawn' || m.category === 'special') return null;
  return tileBlocks(m) ? 'solid' : null;
}

const CONTENT = new Set(['floor', 'groundDetails', 'paths', 'walls', 'objects', 'wallsFront', 'objectsFront', 'overhead', 'deco', 'custom']);

export function buildSideMap(p: Project): SideMap {
  const { width: W, height: H } = p.map;
  const metas = metaTable(p);
  const n = W * H;
  const m: SideMap = { W, H, solid: new Uint8Array(n), platform: new Uint8Array(n), ladder: new Uint8Array(n), hazard: new Uint8Array(n), goal: null };
  const layers = p.layers.filter((l) => CONTENT.has(l.role));
  const collision = p.layers.filter((l) => l.role === 'collision');
  for (let i = 0; i < n; i++) {
    for (const l of layers) {
      const g = l.data[i];
      if (!g) continue;
      const k = kindOf(metas[g]);
      if (k) m[k][i] = 1;
    }
    if (collision.some((l) => l.data[i])) m.solid[i] = 1;
  }
  const end = p.result?.rooms.find((r) => r.isEnd);
  if (end) m.goal = [end.centerX, end.centerY];
  return m;
}

export interface SideTuning {
  jumpV: number;
  speed: number;
}

/**
 * Jump speed and run speed from the level's jump height / width: a little more than the
 * level needs, so edges are comfortable (the same numbers go into the Godot script).
 */
export function jumpSpeed(p: Project): SideTuning {
  const jh = p.generator.side?.jumpHeight ?? defaultSide().jumpHeight;
  const jw = p.generator.side?.jumpWidth ?? defaultSide().jumpWidth;
  const jumpV = Math.sqrt(2 * G * (jh + 0.45));
  const air = (2 * jumpV) / G;
  return { jumpV, speed: Math.max(SPEED, (jw + 1.6) / air) };
}

export const GRAVITY = G;

const at = (m: SideMap, a: Uint8Array, x: number, y: number) => {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (cx < 0 || cx >= m.W) return a === m.solid ? 1 : 0;
  if (cy < 0 || cy >= m.H) return 0;
  return a[cy * m.W + cx];
};

/** does the body box at (x, feet y) overlap any cell of array a? */
function overlaps(m: SideMap, a: Uint8Array, x: number, y: number, shrink = 0): boolean {
  const x0 = Math.floor(x - HW + shrink);
  const x1 = Math.floor(x + HW - 0.001 - shrink);
  const y0 = Math.floor(y - BH + shrink);
  const y1 = Math.floor(y - 0.001 - shrink);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (at(m, a, cx + 0.5, cy + 0.5)) return true;
  return false;
}

export function newBody(x: number, y: number): SideBody {
  return { x, y, vx: 0, vy: 0, onGround: false, climbing: false, coyote: 0, jumpHeld: false, jumpCut: false, safe: [x, y], safeTimer: 0, hurt: 0, reachedGoal: false };
}

export function stepSide(m: SideMap, b: SideBody, inp: SideInput, dt: number, tune: SideTuning): 'goal' | 'respawn' | null {
  const { jumpV, speed } = tune;
  let event: 'goal' | 'respawn' | null = null;
  b.hurt = Math.max(0, b.hurt - dt);
  const onLadder = overlaps(m, m.ladder, b.x, b.y, 0.2) || at(m, m.ladder, b.x, b.y + 0.05) === 1;

  // ladders: grab with ↑ / ↓, jump off sideways
  if (!b.climbing && onLadder && (inp.up || (inp.down && !b.onGround))) b.climbing = true;
  if (b.climbing && (!onLadder || (inp.jump && !b.jumpHeld && inp.x !== 0))) b.climbing = false;

  const jumpPressed = inp.jump && !b.jumpHeld;
  b.jumpHeld = inp.jump;

  if (b.climbing) {
    b.vx = inp.x * CLIMB * 0.6;
    b.vy = (inp.up ? -1 : inp.down ? 1 : 0) * CLIMB;
    // snap towards the ladder centre
    b.x += (Math.floor(b.x) + 0.5 - b.x) * Math.min(1, dt * 10);
  } else {
    const accel = b.onGround ? 70 : 38;
    const target = inp.x * speed;
    b.vx += Math.max(-accel * dt, Math.min(accel * dt, target - b.vx));
    b.vy = Math.min(MAX_FALL, b.vy + G * dt);
    b.coyote = b.onGround ? COYOTE : Math.max(0, b.coyote - dt);
    if (jumpPressed && b.coyote > 0) {
      b.vy = -jumpV;
      b.coyote = 0;
      b.jumpCut = false;
      b.onGround = false;
    }
    // released early → lower jump
    if (!inp.jump && b.vy < 0 && !b.jumpCut) {
      b.vy *= 0.5;
      b.jumpCut = true;
    }
  }

  // horizontal
  let nx = b.x + b.vx * dt;
  if (overlaps(m, m.solid, nx, b.y)) {
    nx = b.vx > 0 ? Math.floor(nx + HW) - HW - 0.001 : Math.floor(nx - HW) + 1 + HW + 0.001;
    if (overlaps(m, m.solid, nx, b.y)) nx = b.x;
    b.vx = 0;
  }
  b.x = nx;

  // vertical
  const oldY = b.y;
  let ny = b.y + b.vy * dt;
  b.onGround = false;
  if (b.vy >= 0) {
    // landing on solid ground
    if (overlaps(m, m.solid, b.x, ny)) {
      ny = Math.floor(ny);
      while (ny > oldY - 1 && overlaps(m, m.solid, b.x, ny)) ny -= 1;
      b.vy = 0;
      b.onGround = true;
    } else if (!inp.down || b.climbing) {
      // one-way platforms: only from above
      const row = Math.floor(ny);
      if (row >= Math.ceil(oldY - 0.001) && (at(m, m.platform, b.x - HW + 0.05, row + 0.5) || at(m, m.platform, b.x + HW - 0.05, row + 0.5)) && oldY <= row + 0.001) {
        ny = row;
        b.vy = 0;
        b.onGround = true;
        b.climbing = b.climbing && inp.down;
      }
    }
  } else if (overlaps(m, m.solid, b.x, ny)) {
    ny = Math.floor(ny - BH) + 1 + BH;
    b.vy = 0;
  }
  b.y = ny;
  if (b.climbing && b.onGround && !inp.up) b.climbing = false;

  // hazards and falling out of the map → back to the last safe spot
  if (overlaps(m, m.hazard, b.x, b.y, 0.15) || b.y > m.H + 2) {
    b.x = b.safe[0];
    b.y = b.safe[1];
    b.vx = 0;
    b.vy = 0;
    b.hurt = 0.8;
    return 'respawn';
  }
  // remember safe ground (not right next to a pit edge)
  b.safeTimer -= dt;
  if (b.onGround && b.safeTimer <= 0 && !overlaps(m, m.hazard, b.x, b.y + 1.5) && at(m, m.solid, b.x - HW, b.y + 0.5) && at(m, m.solid, b.x + HW, b.y + 0.5)) {
    b.safe = [b.x, b.y];
    b.safeTimer = 0.4;
  }
  if (m.goal && !b.reachedGoal && Math.abs(b.x - (m.goal[0] + 0.5)) < 1 && Math.abs(b.y - (m.goal[1] + 1)) < 1.6) {
    b.reachedGoal = true;
    event = 'goal';
  }
  return event;
}
