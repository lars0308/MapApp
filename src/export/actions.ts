import type { Project } from '../types';
import { dataUrlToBytes, downloadBlob, downloadText, safeFileName } from '../utils/download';
import { playerSheet, playerSpriteData } from '../playtest/playerSprite';
import { useSprites } from '../sprites/store';
import { spriteGodotEntries } from '../sprites/exportSprite';
import { serializeProject, PROJECT_EXTENSION } from '../persistence/projectFile';
import { OBJECTS_IMAGE, buildGodotData, scaledObjectsPng, scaledTilesetPng, tilesetImageName } from './godotJson';
import { renderMapPng, type PngOptions } from './pngExport';
import { createZip, type ZipEntry } from './zip';
import { GODOT_LOADER_FILENAME, GODOT_LOADER_SCRIPT, GODOT_README } from './godotScript';

export function exportProjectFile(p: Project) {
  downloadText(serializeProject(p), `${safeFileName(p.name)}${PROJECT_EXTENSION}`);
}

export async function exportJson(p: Project, includeShadows = true) {
  const data = await buildGodotData(p, { embedImages: true, includeShadows });
  downloadText(JSON.stringify(data, null, 1), `${safeFileName(p.name)}.map.json`);
}

export async function exportPng(p: Project, o: PngOptions) {
  const blob = await renderMapPng(p, o);
  const suffix = o.layers === 'visible' ? '' : `-${safeFileName(p.layers.find((l) => l.id === o.layers)?.name ?? 'layer')}`;
  downloadBlob(blob, `${safeFileName(p.name)}${suffix}.png`);
}

export async function exportGodotPackage(p: Project, includeShadows = true) {
  const data = await buildGodotData(p, { embedImages: false, includeShadows });
  const folder = safeFileName(p.name);
  const entries: ZipEntry[] = [
    { path: `${folder}/map.json`, data: JSON.stringify(data, null, 1) },
    { path: `${folder}/${GODOT_LOADER_FILENAME}`, data: GODOT_LOADER_SCRIPT },
    { path: `${folder}/README.md`, data: GODOT_README },
  ];
  const objectsPng = await scaledObjectsPng(p.map.tileSize);
  entries.push({ path: `${folder}/${OBJECTS_IMAGE}`, data: new Uint8Array(await objectsPng.arrayBuffer()) });
  const exportedIds = new Set(data.tilesets.map((t) => t.id));
  for (const ts of p.tilesets.filter((t) => exportedIds.has(t.id))) {
    const png = await scaledTilesetPng(ts, p.map.tileSize);
    entries.push({ path: `${folder}/tilesets/${tilesetImageName(ts)}`, data: new Uint8Array(await png.arrayBuffer()) });
  }
  // ready scene + player figure: the own one from "Animieren", else the figure from the builder
  const side = p.map.perspective === 'side_view';
  // hex maps are strategy maps: camera instead of a walking figure
  let player = p.map.perspective === 'hex' ? null : playerSpriteData();
  if (!player && p.map.perspective !== 'hex') {
    try {
      player = playerSheet(useSprites.getState().character.doc);
    } catch {
      player = null;
    }
  }
  if (player) {
    const dir = (view: string) => (view === 'front' ? 'down' : view === 'back' ? 'up' : 'side');
    entries.push(
      ...spriteGodotEntries({
        folder: `${folder}/player`,
        base: 'player',
        name: player.name,
        character: true,
        platformer: side,
        png: dataUrlToBytes(player.png),
        feetInFrame: player.feet,
        spriteSize: Math.round(player.size / 1.5),
        meta: {
          name: player.name,
          frameWidth: player.size,
          frameHeight: player.size,
          columns: Math.max(player.idle, player.walk, ...Object.values(player.rows ?? {}).map((r) => r.frames)),
          animations: player.rows
            ? Object.entries(player.rows).map(([k, r]) => {
                const cut = k.lastIndexOf('_');
                const base = k.slice(0, cut);
                return { name: `${base}_${dir(k.slice(cut + 1))}`, row: r.row, frames: r.frames, fps: r.fps ?? (base === 'walk' ? 8 : 4), loop: r.loop ?? true };
              })
            : [
                { name: 'idle', row: 0, frames: player.idle, fps: 4, loop: true },
                { name: 'walk', row: 1, frames: player.walk, fps: 8, loop: true },
              ],
        },
      }),
    );
  }
  entries.push({
    path: `${folder}/Map.tscn`,
    data: `[gd_scene load_steps=${player ? 3 : 2} format=3]

[ext_resource type="Script" path="${GODOT_LOADER_FILENAME}" id="1_loader"]
${player ? '[ext_resource type="PackedScene" path="player/player.tscn" id="2_player"]\n' : ''}
[node name="Map" type="Node2D"]
script = ExtResource("1_loader")
${player ? 'player_scene = ExtResource("2_player")\n' : ''}`,
  });
  downloadBlob(createZip(entries), `${folder}-godot.zip`);
}

export function exportGodotScript() {
  downloadText(GODOT_LOADER_SCRIPT, GODOT_LOADER_FILENAME, 'text/plain');
}
