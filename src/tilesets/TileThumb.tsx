import type { CSSProperties } from 'react';
import type { Tileset } from '../types';

export function tileStyle(ts: Tileset, index: number, size: number): CSSProperties {
  const col = index % ts.columns;
  const row = Math.floor(index / ts.columns);
  const scale = size / ts.tileSize;
  return {
    width: size,
    height: size,
    backgroundImage: `url(${ts.dataUrl})`,
    backgroundSize: `${ts.imageWidth * scale}px ${ts.imageHeight * scale}px`,
    backgroundPosition: `${-col * size}px ${-row * size}px`,
  };
}

export function TileThumb({ ts, index, size = 40 }: { ts: Tileset; index: number; size?: number }) {
  return <span className="tile-thumb" style={tileStyle(ts, index, size)} />;
}
