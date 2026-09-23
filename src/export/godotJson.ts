import type { Project, Tileset } from '../types';
import { loadImage, canvasToBlob } from '../utils/image';
import { rleEncode } from '../utils/rle';
import { safeFileName } from '../utils/download';

// Map data for Godot 4 (TileMapLayer based).
// Every tileset image is re-sampled (nearest neighbour) to the map tile size,
// so in Godot TileSet.tile_size == texture_region_size == map.tileSize.

export const GODOT_FORMAT = 'mapforge-godot';

export interface GodotTile {
  x: number;
  y: number;
  tileset: string;
  tile: number;
  atlas: [number, number];
  category: string | null;
}

export function tilesetImageName(ts: Tileset): string {
  return `${safeFileName(ts.id)}.png`;
}

/** Scale a tileset PNG so each tile has `tileSize` pixels. */
export async function scaledTilesetPng(ts: Tileset, tileSize: number): Promise<Blob> {
  const img = await loadImage(ts.dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = ts.columns * tileSize;
  canvas.height = ts.rows * tileSize;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, ts.columns * ts.tileSize, ts.rows * ts.tileSize, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function buildGodotData(p: Project, opts: { embedImages: boolean }) {
  const { width: W, height: H, tileSize } = p.map;
  const used = new Set<number>();
  for (const l of p.layers) for (let i = 0; i < l.data.length; i++) if (l.data[i]) used.add(l.data[i]);

  const tsFor = (gid: number) => p.tilesets.find((t) => gid >= t.firstGid && gid < t.firstGid + t.columns * t.rows);

  const tilesets = [];
  for (const ts of p.tilesets) {
    const n = ts.columns * ts.rows;
    const tiles = [];
    for (let i = 0; i < n; i++) {
      const meta = ts.tiles[i];
      if (!meta?.category && !used.has(ts.firstGid + i)) continue;
      tiles.push({
        id: i,
        atlas: [i % ts.columns, Math.floor(i / ts.columns)],
        category: meta?.category ?? null,
        tags: meta?.tags ?? [],
        weight: meta?.weight ?? 0,
      });
    }
    tilesets.push({
      id: ts.id,
      name: ts.name,
      image: `tilesets/${tilesetImageName(ts)}`,
      ...(opts.embedImages ? { imageBase64: await blobToBase64(await scaledTilesetPng(ts, tileSize)) } : {}),
      tileSize,
      sourceTileSize: ts.tileSize,
      columns: ts.columns,
      rows: ts.rows,
      active: ts.active,
      tiles,
    });
  }

  const layers = p.layers.map((l, z) => {
    const tiles: GodotTile[] = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const gid = l.data[y * W + x];
        if (!gid) continue;
        const ts = tsFor(gid);
        if (!ts) continue;
        const local = gid - ts.firstGid;
        tiles.push({
          x,
          y,
          tileset: ts.id,
          tile: local,
          atlas: [local % ts.columns, Math.floor(local / ts.columns)],
          category: ts.tiles[local]?.category ?? null,
        });
      }
    return { id: l.id, name: l.name, role: l.role, visible: l.visible, locked: l.locked, zIndex: z, color: l.color, tiles };
  });

  const r = p.result;
  return {
    version: 1,
    format: GODOT_FORMAT,
    generator: 'MapForge',
    exportedAt: new Date().toISOString(),
    map: { name: p.name, width: W, height: H, tileSize, seed: r?.seed ?? p.generator.seed },
    tilesets,
    layers,
    rooms: (r?.rooms ?? []).map((room) => ({
      id: room.id,
      type: room.type,
      shape: room.shape,
      x: room.x,
      y: room.y,
      width: room.width,
      height: room.height,
      center: [room.centerX, room.centerY],
      connectedRooms: room.connections,
      start: room.isStart,
      end: room.isEnd,
      boss: room.isBoss,
      special: room.special,
    })),
    connections: (r?.connections ?? []).map((c) => ({ id: c.id, from: c.from, to: c.to, kind: c.kind, width: c.width, length: c.length })),
    doors: r?.doors ?? [],
    spawnPoints: r?.spawnPoints ?? [],
    spawnTypes: ['player', 'enemy', 'loot', 'npc', 'quest'],
    structure: r
      ? {
          encoding: 'rle',
          legend: { 0: 'void', 1: 'room', 2: 'corridor', 3: 'wall', 4: 'hazard' },
          cells: rleEncode(r.cells),
          wallMaskBits: { N: 1, NE: 2, E: 4, SE: 8, S: 16, SW: 32, W: 64, NW: 128 },
          wallMask: rleEncode(r.wallMask),
        }
      : null,
  };
}
