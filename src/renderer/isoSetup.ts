import type { Project } from '../types';
import type { MapRenderer } from './MapRenderer';
import { TilePools } from '../tilesets/tilePools';
import { Rng } from '../generator/rng';

/** diamond view: switch, raised floor from the generator, tiles for the block sides */
export function applyIso(r: MapRenderer, p: Project) {
  r.iso = p.map.perspective === 'isometric';
  r.heights = r.iso ? (p.result?.heights ?? null) : null;
  if (r.iso) {
    // side faces: the 3/4 wall fronts / cliff faces of the tilesets, when there are some
    const pools = new TilePools(p.tilesets.filter((t) => t.active), 'low_top_down');
    const rng = new Rng(3);
    r.isoWallSide = pools.hasRole('wall_front') ? pools.pickRole(rng, 'wall_front', ['base']) : 0;
    r.isoCliffSide = pools.hasRole('cliff_front') ? pools.pickRole(rng, 'cliff_front') : 0;
  }
  r.invalidateAll();
}
