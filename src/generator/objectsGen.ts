import { CELL_ROOM, T_NONE, type GeneratorSettings, type MapObject, type ObjectType } from '../types';
import { OBJECT_DEFS } from '../objects/defs';
import type { Rng } from './rng';
import type { Grid } from './corridors';
import type { PlacedRoom } from './rooms';

// Places sprite objects. An object is only placed when
//  - its whole sprite lies on plain room floor (no terrain, not reserved)
//  - every collision cell has a free, walkable ring around it
// so objects can never cut a path between doors.

export interface ObjectContext {
  g: Grid;
  terrain: Uint8Array;
  reserved: Set<number>;
  /** cells already occupied by an object sprite or blocker */
  occupied: Uint8Array;
}

export function canPlace(c: ObjectContext, type: ObjectType, x: number, y: number): boolean {
  const def = OBJECT_DEFS[type];
  const { g } = c;
  const top = y - def.h + 1;
  const plain = (xx: number, yy: number) => {
    if (xx < 0 || yy < 0 || xx >= g.W || yy >= g.H) return false;
    const i = yy * g.W + xx;
    return g.cells[i] === CELL_ROOM && c.terrain[i] === T_NONE && !c.reserved.has(i) && !c.occupied[i];
  };
  for (let yy = top; yy <= y; yy++) for (let xx = x; xx < x + def.w; xx++) if (!plain(xx, yy)) return false;
  for (const [dx, dy] of def.collision)
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const xx = x + dx + ox;
        const yy = y + dy + oy;
        const isOwn = def.collision.some(([cx, cy]) => x + cx === xx && y + cy === yy);
        if (!isOwn && !plain(xx, yy) && !(yy <= y && yy >= top && xx >= x && xx < x + def.w)) return false;
      }
  return true;
}

export function occupy(c: ObjectContext, type: ObjectType, x: number, y: number) {
  const def = OBJECT_DEFS[type];
  for (let yy = y - def.h + 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + def.w; xx++) {
    if (xx >= 0 && yy >= 0 && xx < c.g.W && yy < c.g.H) c.occupied[yy * c.g.W + xx] = 1;
  }
}

export function placeObjects(
  c: ObjectContext,
  rooms: PlacedRoom[],
  roomType: (id: number) => string,
  s: GeneratorSettings,
  rng: Rng,
): MapObject[] {
  const out: MapObject[] = [];
  const add = (type: ObjectType, x: number, y: number): boolean => {
    if (!canPlace(c, type, x, y)) return false;
    occupy(c, type, x, y);
    out.push({ id: `${type}_${out.length}`, type, x, y });
    return true;
  };
  const cellsOf = (r: PlacedRoom) => {
    const list: [number, number][] = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (c.g.cells[y * c.g.W + x] === CELL_ROOM) list.push([x, y]);
    return list;
  };

  for (const r of rooms) {
    const type = roomType(r.id);
    const cells = cellsOf(r);
    // gameplay objects of special rooms (next to the centre)
    if (type === 'treasure') for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [1, 1]]) if (add('chest', r.cx + dx, r.cy + dy)) break;
    if (type === 'merchant') for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [2, 0]]) if (add('merchant', r.cx + dx, r.cy + dy)) break;

    // pillars in halls (regular grid)
    if (s.objects.pillars && r.shape === 'hall') {
      const step = r.w > 18 ? 5 : 4;
      for (let y = r.y + 3; y < r.y + r.h - 2; y += step) for (let x = r.x + 2; x < r.x + r.w - 2; x += step) add('pillar', x, y);
    }
    // arch in larger rooms
    if (r.w >= 9 && r.h >= 7 && rng.chance(s.objects.arches / 100)) {
      for (let k = 0; k < 8; k++) {
        const [x, y] = rng.pick(cells);
        if (add('arch', x, y)) break;
      }
    }
    // big rocks and trees scale with room area
    const area = cells.length;
    const rocks = Math.round((s.objects.rocks / 100) * (area / 45));
    const trees = Math.round((s.objects.trees / 100) * (area / 35));
    for (let k = 0, made = 0; k < rocks * 6 && made < rocks; k++) {
      const [x, y] = rng.pick(cells);
      if (add('rock', x, y)) made++;
    }
    for (let k = 0, made = 0; k < trees * 6 && made < trees; k++) {
      const [x, y] = rng.pick(cells);
      if (add('tree', x, y)) made++;
    }
  }
  return out;
}
