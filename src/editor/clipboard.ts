import { useEditor } from '../store/editorStore';
import { useProject } from '../store/projectStore';
import { OBJECT_DEFS } from '../objects/defs';
import type { ObjectType, Project, Selection } from '../types';
import { uid } from '../utils/id';
import { mirrorH, rotateCW, transformOf, withTransform } from '../tilesets/gid';

// Copy / cut / paste a map area: tiles of every layer, the objects standing in it and the
// map structure below (so auto-walls keep working). Pasting = the stamp tool: empty cells of
// the copy are transparent, one undo step per stamp.

export interface Clip {
  w: number;
  h: number;
  /** tiles per layer (w × h, 0 = empty – keeps what is below) */
  layers: { id: string; name: string; data: Uint32Array }[];
  objects: { type: ObjectType; dx: number; dy: number }[];
  /** structure cells (CELL_*) where the copy has tiles */
  cells: Uint8Array | null;
  terrain: Uint8Array | null;
}

const inRect = (r: Selection, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

/** copy the selection (all layers, like „Ausschneiden“ clears all unlocked layers) */
export function copyArea(r: Selection): Clip | null {
  const p = useProject.getState().project;
  const W = p.map.width;
  const layers: Clip['layers'] = [];
  let any = false;
  for (const l of p.layers) {
    const data = new Uint32Array(r.w * r.h);
    let has = false;
    for (let y = 0; y < r.h; y++)
      for (let x = 0; x < r.w; x++) {
        const g = l.data[(r.y + y) * W + r.x + x];
        if (g) (data[y * r.w + x] = g), (has = true);
      }
    if (has) layers.push({ id: l.id, name: l.name, data }), (any = true);
  }
  const objects = p.objects.filter((o) => inRect(r, o.x, o.y)).map((o) => ({ type: o.type, dx: o.x - r.x, dy: o.y - r.y }));
  if (!any && !objects.length) return null;
  const grab = (src: Uint8Array | undefined) => {
    if (!src) return null;
    const out = new Uint8Array(r.w * r.h);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) out[y * r.w + x] = src[(r.y + y) * W + r.x + x];
    return out;
  };
  return { w: r.w, h: r.h, layers, objects, cells: grab(p.result?.cells), terrain: grab(p.result?.terrain) };
}

/** top-left of a stamp whose middle is under the pointer (hex maps: even row shift keeps the shape) */
export function stampOrigin(clip: Clip, cx: number, cy: number, hex = false): { x: number; y: number } {
  let y = cy - Math.floor((clip.h - 1) / 2);
  if (hex && y % 2) y -= 1;
  return { x: cx - Math.floor((clip.w - 1) / 2), y };
}

/** target layer for a copied layer: same id, else same name, else the active layer */
function targetLayer(p: Project, l: Clip['layers'][number]) {
  return p.layers.find((x) => x.id === l.id) ?? p.layers.find((x) => x.name === l.name) ?? p.layers.find((x) => x.id === p.activeLayerId);
}

/** paste at (x, y) = top-left; returns the number of changed cells (−1 = nothing possible) */
export function pasteClip(clip: Clip, x0: number, y0: number): number {
  const s = useProject.getState();
  const p = s.project;
  const W = p.map.width;
  const H = p.map.height;
  let changed = 0;
  const locked = new Set<string>();
  s.editDoc('Stempel', (q) => {
    const layers = q.layers.map((l) => ({ ...l }));
    for (const cl of clip.layers) {
      const t = targetLayer(q, cl);
      if (!t) continue;
      const li = layers.findIndex((l) => l.id === t.id);
      if (layers[li].locked) {
        locked.add(layers[li].name);
        continue;
      }
      const data = layers[li].data.slice();
      for (let y = 0; y < clip.h; y++)
        for (let x = 0; x < clip.w; x++) {
          const g = cl.data[y * clip.w + x];
          const tx = x0 + x;
          const ty = y0 + y;
          if (!g || tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
          const i = ty * W + tx;
          if (data[i] !== g) (data[i] = g), changed++;
        }
      layers[li] = { ...layers[li], data };
    }
    const objects = [...q.objects];
    for (const o of clip.objects) {
      const x = x0 + o.dx;
      const y = y0 + o.dy;
      const d = OBJECT_DEFS[o.type];
      if (!d || x < 0 || y < 0 || x + d.w > W || y >= H) continue;
      objects.push({ id: uid('obj'), type: o.type, x, y });
      changed++;
    }
    // structure below the copied tiles (walls stay walls for auto-walls / the generator)
    let result = q.result;
    if (result && clip.cells) {
      const cells = result.cells.slice();
      const terrain = result.terrain.slice();
      for (let y = 0; y < clip.h; y++)
        for (let x = 0; x < clip.w; x++) {
          const tx = x0 + x;
          const ty = y0 + y;
          if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
          const k = y * clip.w + x;
          if (!clip.layers.some((l) => l.data[k])) continue;
          cells[ty * W + tx] = clip.cells[k];
          if (clip.terrain) terrain[ty * W + tx] = clip.terrain[k];
        }
      result = { ...result, cells, terrain };
    }
    return { ...q, layers, objects, result };
  });
  if (locked.size) useEditor.getState().toast(`Gesperrt, nicht eingefügt: ${[...locked].join(', ')}`, 'error');
  return changed;
}

/** copy the current selection into the clipboard; true when something was copied */
export function copySelection(cut = false): boolean {
  const e = useEditor.getState();
  const sel = e.selection;
  if (!sel) {
    e.toast('Erst mit „Auswahl“ einen Bereich markieren');
    return false;
  }
  const clip = copyArea(sel);
  if (!clip) {
    e.toast('Der Bereich ist leer');
    return false;
  }
  e.setClipboard(clip);
  if (cut) useProject.getState().clearArea(sel);
  e.toast(`${sel.w} × ${sel.h} ${cut ? 'ausgeschnitten' : 'kopiert'} – mit dem Stempel einsetzen`, 'success');
  return true;
}

/** copy and switch to the stamp right away */
export function stampFromSelection(): void {
  if (copySelection()) useEditor.getState().setTool('stamp');
}

/**
 * turn the copy 90° clockwise or mirror it: cells move and every tile turns with them
 * (objects keep their look, only their place changes)
 */
export function transformClip(clip: Clip, op: 'rotate' | 'mirror'): Clip {
  const rot = op === 'rotate';
  const w = rot ? clip.h : clip.w;
  const h = rot ? clip.w : clip.h;
  // new position of an old cell
  const to = (x: number, y: number): [number, number] => (rot ? [clip.h - 1 - y, x] : [clip.w - 1 - x, y]);
  const move = <T extends Uint8Array | Uint32Array>(src: T, turn?: (v: number) => number): T => {
    const out = new (src.constructor as { new (n: number): T })(w * h);
    for (let y = 0; y < clip.h; y++)
      for (let x = 0; x < clip.w; x++) {
        const v = src[y * clip.w + x];
        const [nx, ny] = to(x, y);
        out[ny * w + nx] = turn && v ? turn(v) : v;
      }
    return out;
  };
  const turnTile = (v: number) => withTransform(v, (rot ? rotateCW : mirrorH)(transformOf(v)));
  return {
    w,
    h,
    layers: clip.layers.map((l) => ({ ...l, data: move(l.data, turnTile) })),
    objects: clip.objects.map((o) => {
      const [dx, dy] = to(o.dx, o.dy);
      return { ...o, dx, dy };
    }),
    cells: clip.cells && move(clip.cells),
    terrain: clip.terrain && move(clip.terrain),
  };
}
