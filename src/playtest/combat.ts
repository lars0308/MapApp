import { create } from 'zustand';
import type { SpawnPoint } from '../types';
import type { CharacterState } from '../renderer/character';

// Enemies and chests in the (top-down) playtest: enemies from the map's enemy spawn points chase
// the figure when it comes close, touching them costs a heart, attacking (Space / J / button)
// hits what is in front of the figure. Chests (loot spawns) open when you walk onto them.
// Editor-only – nothing here is stored or exported.

export interface Enemy {
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  hp: number;
  max: number;
  level: number;
  boss: boolean;
  alive: boolean;
  /** hit flash (s) */
  flash: number;
  /** wander target */
  wx: number;
  wy: number;
}

export interface Chest {
  x: number;
  y: number;
  open: boolean;
  tier: number;
}

interface PlayHud {
  hp: number;
  max: number;
  kills: number;
  enemies: number;
  chests: number;
  opened: number;
}
export const usePlayHud = create<PlayHud>(() => ({ hp: 5, max: 5, kills: 0, enemies: 0, chests: 0, opened: 0 }));

export const combat = {
  enemies: [] as Enemy[],
  chests: [] as Chest[],
  /** attack swing left (s) – drawn as an arc */
  swing: 0,
  invuln: 0,
  attackQueued: false,
};

const SIGHT = 6;
const REACH = 1.35;

export function initCombat(spawns: SpawnPoint[]) {
  combat.enemies = spawns
    .filter((s) => s.type === 'enemy')
    .map((s) => {
      const level = Number(s.properties.level ?? 1);
      const boss = !!s.properties.boss;
      const max = boss ? 8 : 1 + Math.ceil(level / 2);
      return { x: s.x + 0.5, y: s.y + 0.8, homeX: s.x + 0.5, homeY: s.y + 0.8, hp: max, max, level, boss, alive: true, flash: 0, wx: s.x + 0.5, wy: s.y + 0.8 };
    });
  combat.chests = spawns.filter((s) => s.type === 'loot').map((s) => ({ x: s.x + 0.5, y: s.y + 0.8, open: false, tier: Number(s.properties.tier ?? 1) }));
  combat.swing = 0;
  combat.invuln = 0;
  combat.attackQueued = false;
  usePlayHud.setState({ hp: 5, max: 5, kills: 0, enemies: combat.enemies.length, chests: combat.chests.length, opened: 0 });
}

export function queueAttack() {
  combat.attackQueued = true;
}

const facing = (c: CharacterState): [number, number] => {
  const h = c.dir === 'left' ? -1 : c.dir === 'right' ? 1 : 0;
  if (c.diag) return [h * Math.SQRT1_2, (c.diag === 'down' ? 1 : -1) * Math.SQRT1_2];
  return c.dir === 'up' ? [0, -1] : c.dir === 'down' ? [0, 1] : [h, 0];
};

/**
 * one step: enemies move, touch, attack, chests. `free(x, y)` = a figure fits there.
 * Returns a message for the toast (defeated, chest …) or null.
 */
export function stepCombat(dt: number, c: CharacterState, free: (x: number, y: number) => boolean, respawn: () => void): string | null {
  let msg: string | null = null;
  combat.invuln = Math.max(0, combat.invuln - dt);
  combat.swing = Math.max(0, combat.swing - dt);
  const hud = usePlayHud.getState();

  if (combat.attackQueued && combat.swing <= 0) {
    combat.attackQueued = false;
    combat.swing = 0.25;
    const [fx, fy] = facing(c);
    for (const e of combat.enemies) {
      if (!e.alive) continue;
      const dx = e.x - c.x;
      const dy = e.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d > REACH || (d > 0.3 && (dx * fx + dy * fy) / d < 0.2)) continue;
      e.hp--;
      e.flash = 0.2;
      // knock back
      const kx = e.x + (dx / (d || 1)) * 0.7;
      const ky = e.y + (dy / (d || 1)) * 0.7;
      if (free(kx, ky)) (e.x = kx), (e.y = ky);
      if (e.hp <= 0) {
        e.alive = false;
        usePlayHud.setState({ kills: usePlayHud.getState().kills + 1 });
        msg = e.boss ? 'Boss besiegt!' : null;
      }
    }
  } else combat.attackQueued = false;

  for (const e of combat.enemies) {
    if (!e.alive) continue;
    e.flash = Math.max(0, e.flash - dt);
    const dx = c.x - e.x;
    const dy = c.y - e.y;
    const d = Math.hypot(dx, dy);
    let tx = e.wx;
    let ty = e.wy;
    let speed = 0.8;
    if (d < SIGHT) {
      // chase (faster with level)
      tx = c.x;
      ty = c.y;
      speed = 1.7 + e.level * 0.25;
    } else if (Math.hypot(e.wx - e.x, e.wy - e.y) < 0.2 || Math.random() < dt * 0.3) {
      // wander around the spawn
      e.wx = e.homeX + (Math.random() - 0.5) * 3;
      e.wy = e.homeY + (Math.random() - 0.5) * 3;
    }
    const mx = tx - e.x;
    const my = ty - e.y;
    const ml = Math.hypot(mx, my);
    if (ml > 0.45 && e.flash <= 0) {
      const nx = e.x + (mx / ml) * speed * dt;
      const ny = e.y + (my / ml) * speed * dt;
      if (free(nx, e.y)) e.x = nx;
      if (free(e.x, ny)) e.y = ny;
    }
    // touch
    if (d < 0.6 && combat.invuln <= 0) {
      combat.invuln = 1;
      const hp = Math.max(0, hud.hp - (e.boss ? 2 : 1));
      usePlayHud.setState({ hp });
      const kx = c.x + (dx / (d || 1)) * 0.8;
      const ky = c.y + (dy / (d || 1)) * 0.8;
      if (free(kx, ky)) (c.x = kx), (c.y = ky);
      if (hp === 0) {
        respawn();
        usePlayHud.setState({ hp: usePlayHud.getState().max });
        msg = 'Besiegt – zurück zum Start';
      }
    }
  }

  for (const ch of combat.chests) {
    if (ch.open || Math.hypot(ch.x - c.x, ch.y - c.y) > 0.9) continue;
    ch.open = true;
    const opened = usePlayHud.getState().opened + 1;
    usePlayHud.setState({ opened });
    msg = `Truhe geöffnet (Stufe ${ch.tier}) – ${opened} / ${combat.chests.length}`;
  }
  return msg;
}

/** draw an enemy (slime) with its feet at (x, y) */
export function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, sx: (x: number) => number, sy: (y: number) => number, zoom: number) {
  const px = zoom / 16;
  const s = e.boss ? 1.6 : 1;
  const cx = sx(e.x);
  const by = sy(e.y);
  const bob = Math.sin(performance.now() / 180 + e.homeX) * px * 0.6;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, by - px, 6 * px * s, 2 * px * s, 0, 0, Math.PI * 2);
  ctx.fill();
  const base = e.flash > 0 ? '#ffffff' : e.boss ? '#b04ad8' : e.level >= 4 ? '#d8544a' : e.level >= 2 ? '#e0874a' : '#6cc16a';
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.ellipse(cx, by - 5 * px * s + bob, 6.5 * px * s, 5.5 * px * s, 0, Math.PI, 0);
  ctx.lineTo(cx + 6.5 * px * s, by - 2 * px * s);
  ctx.lineTo(cx - 6.5 * px * s, by - 2 * px * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1c1a1f';
  ctx.fillRect(Math.round(cx - 3 * px * s), Math.round(by - 7 * px * s + bob), Math.ceil(1.5 * px * s), Math.ceil(2 * px * s));
  ctx.fillRect(Math.round(cx + 1.5 * px * s), Math.round(by - 7 * px * s + bob), Math.ceil(1.5 * px * s), Math.ceil(2 * px * s));
  // health bar when hurt
  if (e.hp < e.max) {
    const w = 12 * px * s;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(cx - w / 2, by - 13 * px * s, w, 2 * px);
    ctx.fillStyle = '#e86f6f';
    ctx.fillRect(cx - w / 2, by - 13 * px * s, (w * e.hp) / e.max, 2 * px);
  }
}

/** a chest (closed / open) with its feet at (x, y) */
export function drawChest(ctx: CanvasRenderingContext2D, ch: Chest, sx: (x: number) => number, sy: (y: number) => number, zoom: number) {
  if (!ch.open) return; // closed chests are the map's own chest objects
  const px = zoom / 16;
  const cx = sx(ch.x);
  const by = sy(ch.y);
  ctx.fillStyle = '#f2d27a';
  for (let k = 0; k < 3; k++) ctx.fillRect(Math.round(cx - 3 * px + k * 2.5 * px), Math.round(by - 12 * px - ((performance.now() / 90 + k * 3) % 6) * px), Math.ceil(px), Math.ceil(px));
}

/** the attack arc in front of the figure */
export function drawSwing(ctx: CanvasRenderingContext2D, c: CharacterState, sx: (x: number) => number, sy: (y: number) => number, zoom: number) {
  if (combat.swing <= 0) return;
  const [fx, fy] = facing(c);
  const a = Math.atan2(fy, fx);
  const t = 1 - combat.swing / 0.25;
  ctx.strokeStyle = `rgba(255,250,235,${0.9 - t * 0.6})`;
  ctx.lineWidth = Math.max(2, zoom / 10);
  ctx.beginPath();
  ctx.arc(sx(c.x), sy(c.y - 0.45), zoom * REACH * 0.8, a - 1.1 + t * 0.6, a + 0.3 + t * 0.8);
  ctx.stroke();
}
