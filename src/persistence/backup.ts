import { listLibraryTilesets, listProjects, loadProject, saveLibraryTileset, saveProject, type LibraryTileset } from './db';
import { deserializeProject, serializeProject } from './projectFile';
import { saveNow } from './autosave';
import { downloadText } from '../utils/download';

// One file with everything: all map projects, the tileset library and everything the
// builders keep in the browser (figures, gallery, own parts, palettes, player figure, settings).

const FORMAT = 'mapforge-backup';
const PREFIX = 'mapforge.';
const KEY_LAST = 'mapforge.lastBackup';
/** browser-only view settings that should not travel to another device */
const SKIP = new Set(['mapforge.desktopLayout.v1', 'mapforge.lastError', KEY_LAST]);

interface BackupFile {
  format: typeof FORMAT;
  version: 1;
  createdAt: string;
  projects: string[];
  library: LibraryTileset[];
  local: Record<string, string>;
}

export interface BackupInfo {
  projects: number;
  tilesets: number;
  figures: number;
}

function localEntries(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith(PREFIX) && !SKIP.has(k)) out[k] = localStorage.getItem(k) ?? '';
    }
  } catch {
    // storage unavailable
  }
  return out;
}

const countFigures = (local: Record<string, string>) => {
  try {
    return (JSON.parse(local['mapforge.sprite.gallery.v1'] ?? '[]') as unknown[]).length;
  } catch {
    return 0;
  }
};

export async function createBackup(): Promise<BackupInfo> {
  await saveNow();
  const summaries = await listProjects();
  const projects: string[] = [];
  for (const s of summaries) {
    const p = await loadProject(s.id);
    if (p) projects.push(serializeProject(p));
  }
  const library = await listLibraryTilesets().catch(() => []);
  const local = localEntries();
  const file: BackupFile = { format: FORMAT, version: 1, createdAt: new Date().toISOString(), projects, library, local };
  const date = new Date().toISOString().slice(0, 10);
  downloadText(JSON.stringify(file), `mapforge-sicherung-${date}.json`);
  try {
    localStorage.setItem(KEY_LAST, String(Date.now()));
  } catch {
    // ignore
  }
  return { projects: projects.length, tilesets: library.length, figures: countFigures(local) };
}

/** Restores a backup. Projects / tilesets with the same id are replaced, others stay. */
export async function restoreBackup(text: string): Promise<BackupInfo> {
  let file: BackupFile;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error('Datei ist kein gültiges JSON');
  }
  if (file?.format !== FORMAT) throw new Error('Keine MapForge-Sicherung (…-sicherung-….json)');
  let projects = 0;
  for (const t of file.projects ?? []) {
    try {
      await saveProject(deserializeProject(t, true));
      projects++;
    } catch (e) {
      console.warn('Projekt aus Sicherung übersprungen', e);
    }
  }
  for (const ts of file.library ?? []) await saveLibraryTileset(ts);
  for (const [k, v] of Object.entries(file.local ?? {})) {
    if (!k.startsWith(PREFIX)) continue;
    try {
      localStorage.setItem(k, v);
    } catch {
      throw new Error('Browser-Speicher voll – Sicherung nur teilweise geladen');
    }
  }
  return { projects, tilesets: file.library?.length ?? 0, figures: countFigures(file.local ?? {}) };
}

/** days since the last backup (null = never) */
export function daysSinceBackup(): number | null {
  try {
    const t = Number(localStorage.getItem(KEY_LAST));
    return t ? Math.floor((Date.now() - t) / 86400000) : null;
  } catch {
    return null;
  }
}
