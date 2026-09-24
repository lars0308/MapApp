import type { CSSProperties } from 'react';
import type { Tileset } from '../types';

// A data URL in thousands of inline styles (one per tile) costs megabytes each – big sheets took
// minutes to show. Every image becomes one short blob: URL instead.
const blobUrls = new Map<string, string>();
export function imageUrl(dataUrl: string): string {
  if (!dataUrl.startsWith('data:')) return dataUrl;
  let url = blobUrls.get(dataUrl);
  if (!url) {
    const [head, body] = dataUrl.split(',', 2);
    const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'image/png';
    const bin = atob(body ?? '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    blobUrls.set(dataUrl, url);
  }
  return url;
}

export function tileStyle(ts: Tileset, index: number, size: number): CSSProperties {
  const col = index % ts.columns;
  const row = Math.floor(index / ts.columns);
  const scale = size / ts.tileSize;
  return {
    width: size,
    height: size,
    backgroundImage: `url(${imageUrl(ts.dataUrl)})`,
    backgroundSize: `${ts.imageWidth * scale}px ${ts.imageHeight * scale}px`,
    backgroundPosition: `${-col * size}px ${-row * size}px`,
  };
}

export function TileThumb({ ts, index, size = 40 }: { ts: Tileset; index: number; size?: number }) {
  return <span className="tile-thumb" style={tileStyle(ts, index, size)} />;
}
