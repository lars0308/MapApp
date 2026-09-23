import type { Project } from '../types';
import { downloadBlob, downloadText, safeFileName } from '../utils/download';
import { serializeProject, PROJECT_EXTENSION } from '../persistence/projectFile';
import { buildGodotData, scaledTilesetPng, tilesetImageName } from './godotJson';
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
  for (const ts of p.tilesets) {
    const png = await scaledTilesetPng(ts, p.map.tileSize);
    entries.push({ path: `${folder}/tilesets/${tilesetImageName(ts)}`, data: new Uint8Array(await png.arrayBuffer()) });
  }
  downloadBlob(createZip(entries), `${folder}-godot.zip`);
}

export function exportGodotScript() {
  downloadText(GODOT_LOADER_SCRIPT, GODOT_LOADER_FILENAME, 'text/plain');
}
