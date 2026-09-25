import type { Project } from '../types';
import { dataUrlToBytes, downloadBlob, downloadText, safeFileName } from '../utils/download';
import { playerSheet, playerSpriteData } from '../playtest/playerSprite';
import { useSprites } from '../sprites/store';
import { spriteGodotEntries } from '../sprites/exportSprite';
import { DIR_NAME } from '../sprites/animation';
import type { View } from '../sprites/types';
import { serializeProject, PROJECT_EXTENSION } from '../persistence/projectFile';
import { OBJECTS_IMAGE, buildGodotData, scaledObjectsPng, scaledTilesetPng, tilesetImageName } from './godotJson';
import { renderMapPng, type PngOptions } from './pngExport';
import { createZip, type ZipEntry } from './zip';
import { GODOT_LOADER_FILENAME, GODOT_LOADER_SCRIPT, GODOT_README } from './godotScript';
import { TILESET_RESOURCE, buildMapScene, buildTileSetResource } from './godotScene';
import { buildIsoScene, buildIsoTileSet, isoSheetPng, planIso } from './isoExport';
import { levelProject, levelsOf } from '../store/levels';

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
  const { blob, name } = await buildGodotPackage(p, includeShadows);
  downloadBlob(blob, name);
}

/** the Godot package as a zip (map.json, loader, tilesets, player figure, Map.tscn) */
export async function buildGodotPackage(p: Project, includeShadows = true): Promise<{ blob: Blob; name: string }> {
  const root = safeFileName(p.name);
  const levels = levelsOf(p);
  if (levels.length < 2) return { blob: createZip(await godotEntries(p, root, includeShadows)), name: `${root}-godot.zip` };
  // Ebenen: every level is a complete Godot folder of its own (scene, map.json, tilesets, loader)
  const entries: ZipEntry[] = [];
  const folders: string[] = [];
  for (const [k, level] of levels.entries()) {
    const folder = `${root}/${String(k + 1).padStart(2, '0')}-${safeFileName(level.name)}`;
    folders.push(`- \`${folder.slice(root.length + 1)}/Map.tscn\` – ${level.name}`);
    const dir = (j: number) => (levels[j] ? `../${String(j + 1).padStart(2, '0')}-${safeFileName(levels[j].name)}/Map.tscn` : null);
    const info = { index: k + 1, count: levels.length, name: level.name, previous: dir(k - 1), next: dir(k + 1) };
    entries.push(...(await godotEntries(levelProject(p, level), folder, includeShadows, info)));
  }
  entries.push({
    path: `${root}/EBENEN.md`,
    data: `# ${p.name} – Ebenen\n\nJede Ebene ist ein eigener Ordner mit eigener Szene (Map.tscn), map.json, Tilesets und Loader:\n\n${folders.join('\n')}\n\nÜbergänge: In jeder map.json steht unter \`level\` die Nummer der Ebene und der Pfad zur vorherigen / nächsten Szene (\`previous\`, \`next\`). Der Raum mit \`end: true\` (Treppe / Ausgang) führt zur nächsten Ebene, der mit \`start: true\` zurück – dort z. B. mit get_tree().change_scene_to_file() wechseln.\n`,
  });
  return { blob: createZip(entries), name: `${root}-godot.zip` };
}

/** all files of one map's Godot folder */
async function godotEntries(p: Project, folder: string, includeShadows: boolean, level?: Record<string, unknown>): Promise<ZipEntry[]> {
  const data = await buildGodotData(p, { embedImages: false, includeShadows });
  // Ebenen: which level this is and where the neighbours are
  if (level) (data as unknown as Record<string, unknown>).level = level;
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
  // diamond view: own iso sheets (diamonds, blocks, upright tiles) for the ready TileSet and scene
  const iso = p.map.perspective === 'isometric' ? planIso(p, data) : null;
  if (iso)
    for (const sheet of iso.sheets) {
      const png = await isoSheetPng(sheet, p.map.tileSize);
      entries.push({ path: `${folder}/${sheet.image}`, data: new Uint8Array(await png.arrayBuffer()) });
    }
  // ready scene + player figure: the own one ("Als Spielfigur verwenden"), else the figure from the builder
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
    const dir = (view: string) => DIR_NAME[view as View] ?? 'side';
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
  // ready resources: TileSet and the scene with all tiles and objects (visible in the Godot editor)
  if (iso) {
    entries.push({ path: `${folder}/${TILESET_RESOURCE}`, data: buildIsoTileSet(iso, data) });
    entries.push({ path: `${folder}/Map.tscn`, data: buildIsoScene(iso, data, { player: !!player, tileset: TILESET_RESOURCE }) });
  } else {
    entries.push({ path: `${folder}/${TILESET_RESOURCE}`, data: buildTileSetResource(data) });
    entries.push({ path: `${folder}/Map.tscn`, data: buildMapScene(data, { player: !!player }) });
  }
  return entries;
}

export function exportGodotScript() {
  downloadText(GODOT_LOADER_SCRIPT, GODOT_LOADER_FILENAME, 'text/plain');
}
