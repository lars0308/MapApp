import type { ObjectType } from '../types';
import { OBJECT_ATLAS_TILE, OBJECT_DEFS, objectAtlas } from './defs';

/** Scaled sprite preview of an object (fits into a square). */
export function ObjectThumb({ type, size = 40 }: { type: ObjectType; size?: number }) {
  const d = OBJECT_DEFS[type];
  const atlas = objectAtlas();
  const scale = size / (Math.max(d.w, d.h) * OBJECT_ATLAS_TILE);
  const w = d.w * OBJECT_ATLAS_TILE * scale;
  const h = d.h * OBJECT_ATLAS_TILE * scale;
  return (
    <span className="object-thumb" style={{ width: size, height: size }}>
      <span
        style={{
          width: w,
          height: h,
          backgroundImage: `url(${atlas.dataUrl})`,
          backgroundSize: `${atlas.canvas.width * scale}px ${atlas.canvas.height * scale}px`,
          backgroundPosition: `${-d.sx * OBJECT_ATLAS_TILE * scale}px ${-d.sy * OBJECT_ATLAS_TILE * scale}px`,
        }}
      />
    </span>
  );
}
