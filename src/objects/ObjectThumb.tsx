import type { ObjectType } from '../types';
import { useSyncExternalStore } from 'react';
import { OBJECT_ATLAS_TILE, atlasVersion, objectAtlas, objectDef, onAtlasChange } from './defs';
import { imageUrl } from '../tilesets/TileThumb';

/** Scaled sprite preview of an object (fits into a square). */
export function ObjectThumb({ type, size = 40 }: { type: ObjectType; size?: number }) {
  useSyncExternalStore(onAtlasChange, atlasVersion);
  const d = objectDef(type);
  if (!d) return <span className="object-thumb" style={{ width: size, height: size }} />;
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
          backgroundImage: `url(${imageUrl(atlas.dataUrl)})`,
          backgroundSize: `${atlas.canvas.width * scale}px ${atlas.canvas.height * scale}px`,
          backgroundPosition: `${-d.sx * OBJECT_ATLAS_TILE * scale}px ${-d.sy * OBJECT_ATLAS_TILE * scale}px`,
        }}
      />
    </span>
  );
}
