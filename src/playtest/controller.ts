import { useProject } from '../store/projectStore';
import { useEditor } from '../store/editorStore';
import { mapEvents } from '../store/events';
import { getRenderer } from '../editor/rendererRef';
import { computeBlocked } from '../editor/collision';
import type { CharacterState } from '../renderer/character';

// Editor-only playtest: a neutral character walks over the current map.
// Nothing here is stored in the project or exported.

/** analogue input from the touch joystick (-1..1) */
export const joystick = { vx: 0, vy: 0 };

const SPEED = 4.2; // tiles per second
const HALF_W = 0.28; // feet box half width (tiles)
const BOX_H = 0.22; // feet box height (tiles)

let running = false;
let raf = 0;
let last = 0;
let blocked: Uint8Array = new Uint8Array(0);
let W = 0;
let H = 0;
const keys = new Set<string>();
let char: CharacterState | null = null;
let unsubMap: (() => void) | null = null;
let unsubProject: (() => void) | null = null;

export function playtestState() {
  return { running, char: char ? { ...char } : null };
}

function refreshBlocked() {
  const p = useProject.getState().project;
  W = p.map.width;
  H = p.map.height;
  blocked = computeBlocked(p);
}

const free = (x: number, y: number) => {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  return cx >= 0 && cy >= 0 && cx < W && cy < H && !blocked[cy * W + cx];
};

/** feet box (x ± HALF_W, y - BOX_H .. y) must be free */
function boxFree(x: number, y: number) {
  const top = y - BOX_H;
  const bottom = y - 0.01;
  return free(x - HALF_W, top) && free(x + HALF_W, top) && free(x - HALF_W, bottom) && free(x + HALF_W, bottom);
}

function spawnPosition(): [number, number] | null {
  const p = useProject.getState().project;
  const r = p.result;
  const candidates: [number, number][] = [];
  const player = r?.spawnPoints.find((s) => s.type === 'player');
  if (player) candidates.push([player.x, player.y]);
  const start = r?.rooms.find((room) => room.isStart) ?? r?.rooms[0];
  if (start) candidates.push([start.centerX, start.centerY]);
  // nearest free cell around the candidates, else anywhere
  for (const [cx, cy] of candidates)
    for (let rad = 0; rad < 12; rad++)
      for (let oy = -rad; oy <= rad; oy++)
        for (let ox = -rad; ox <= rad; ox++) {
          const x = cx + ox;
          const y = cy + oy;
          if (x >= 0 && y >= 0 && x < W && y < H && !blocked[y * W + x] && boxFree(x + 0.5, y + 0.8)) return [x + 0.5, y + 0.8];
        }
  for (let i = 0; i < W * H; i++) if (!blocked[i]) return [(i % W) + 0.5, Math.floor(i / W) + 0.8];
  return null;
}

function onKey(e: KeyboardEvent) {
  const k = e.key.toLowerCase();
  if (e.type === 'keydown' && k === 'escape') {
    stopPlaytest();
    return;
  }
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
    e.preventDefault();
    if (e.type === 'keydown') keys.add(k);
    else keys.delete(k);
  }
}

function tick(now: number) {
  if (!running || !char) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  let vx = joystick.vx;
  let vy = joystick.vy;
  if (keys.has('a') || keys.has('arrowleft')) vx -= 1;
  if (keys.has('d') || keys.has('arrowright')) vx += 1;
  if (keys.has('w') || keys.has('arrowup')) vy -= 1;
  if (keys.has('s') || keys.has('arrowdown')) vy += 1;
  const len = Math.hypot(vx, vy);
  if (len > 1) {
    vx /= len;
    vy /= len;
  }
  const moving = len > 0.08;
  if (moving) {
    const nx = char.x + vx * SPEED * dt;
    if (boxFree(nx, char.y)) char.x = nx;
    const ny = char.y + vy * SPEED * dt;
    if (boxFree(char.x, ny)) char.y = ny;
    char.dir = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 'left' : 'right') : vy < 0 ? 'up' : 'down';
    char.step += dt * 4;
  }
  char.moving = moving;
  const r = getRenderer();
  if (r) {
    r.character = char;
    r.follow(char.x, char.y - 0.5);
  }
  raf = requestAnimationFrame(tick);
}

export function startPlaytest(): boolean {
  if (running) return true;
  refreshBlocked();
  const pos = spawnPosition();
  const editor = useEditor.getState();
  if (!pos) {
    editor.toast('Keine begehbare Fläche gefunden', 'error');
    return false;
  }
  char = { x: pos[0], y: pos[1], dir: 'down', step: 0, moving: false };
  running = true;
  editor.setPlaytest(true);
  const r = getRenderer();
  if (r) {
    r.cam.zoom = Math.max(r.cam.zoom, 36);
    r.character = char;
    r.follow(char.x, char.y - 0.5, true);
  }
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  unsubMap = mapEvents.on(refreshBlocked);
  let prevObjects = useProject.getState().project.objects;
  unsubProject = useProject.subscribe((s) => {
    if (s.project.objects !== prevObjects) {
      prevObjects = s.project.objects;
      refreshBlocked();
    }
  });
  last = performance.now();
  raf = requestAnimationFrame(tick);
  return true;
}

export function stopPlaytest() {
  if (!running) return;
  running = false;
  cancelAnimationFrame(raf);
  keys.clear();
  joystick.vx = 0;
  joystick.vy = 0;
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  unsubMap?.();
  unsubProject?.();
  const r = getRenderer();
  if (r) {
    r.character = null;
    r.requestRender();
  }
  char = null;
  useEditor.getState().setPlaytest(false);
}
