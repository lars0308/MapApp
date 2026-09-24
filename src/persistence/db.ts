import { profileLabel } from '../profiles';
import type { Project, Tileset } from '../types';
import { migrateProject } from './migrate';
import { useEditor } from '../store/editorStore';

// Minimal promise wrapper around IndexedDB.
// Projects are stored as structured clones (typed arrays are supported natively).

const DB_NAME = 'mapforge';
const DB_VERSION = 2;
const STORE = 'projects';
const META = 'meta';
/** reusable tilesets (incl. roles, tags, perspectives), independent of projects */
const LIBRARY = 'library';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  width: number;
  height: number;
  rooms: number;
  /** "Top-Down · Action-Roguelite" (since v2.6) */
  label?: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let blockedNotified = false;
/** open request waits for another tab – fail fast instead of waiting again */
let blocked = false;

/** How long the UI waits for the database before carrying on without it. */
const OPEN_TIMEOUT = 4000;
export const DB_BLOCKED_MESSAGE =
  'MapForge ist noch in einem anderen Tab oder als installierte App (ältere Version) geöffnet und blockiert den Speicher. Bitte dort schließen – bis dahin wird nicht gespeichert.';

function connect(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB nicht verfügbar'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      if (!db.objectStoreNames.contains(LIBRARY)) db.createObjectStore(LIBRARY, { keyPath: 'id' });
    };
    // an older version holds the database open in another tab: tell the user once
    req.onblocked = () => {
      blocked = true;
      if (blockedNotified) return;
      blockedNotified = true;
      useEditor.getState().toast(DB_BLOCKED_MESSAGE, 'error');
    };
    req.onsuccess = () => {
      blocked = false;
      const db = req.result;
      // a newer version in another tab wants to upgrade: release the connection instead of blocking it
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = connect();
    dbPromise.catch(() => (dbPromise = null));
  }
  // never let the UI hang on a blocked database (the pending open keeps running)
  if (blocked) return Promise.reject(new Error(DB_BLOCKED_MESSAGE));
  return Promise.race([
    dbPromise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(DB_BLOCKED_MESSAGE)), OPEN_TIMEOUT)),
  ]);
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

interface StoredProject {
  id: string;
  name: string;
  updatedAt: number;
  summary: ProjectSummary;
  project: Project;
}

export async function saveProject(p: Project): Promise<void> {
  const summary: ProjectSummary = {
    id: p.id,
    name: p.name,
    updatedAt: p.updatedAt,
    width: p.map.width,
    height: p.map.height,
    rooms: p.result?.rooms.length ?? 0,
    label: profileLabel(p.profile),
  };
  await tx(STORE, 'readwrite', (s) => s.put({ id: p.id, name: p.name, updatedAt: p.updatedAt, summary, project: p } satisfies StoredProject));
  await tx(META, 'readwrite', (s) => s.put(p.id, 'lastProjectId'));
}

export async function loadProject(id: string): Promise<Project | null> {
  const rec = await tx<StoredProject | undefined>(STORE, 'readonly', (s) => s.get(id));
  return rec?.project ? migrateProject(rec.project) : null;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await tx<StoredProject[]>(STORE, 'readonly', (s) => s.getAll());
  return all.map((r) => r.summary).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProject(id: string): Promise<void> {
  await tx(STORE, 'readwrite', (s) => s.delete(id));
}

export async function lastProjectId(): Promise<string | null> {
  const id = await tx<string | undefined>(META, 'readonly', (s) => s.get('lastProjectId'));
  return id ?? null;
}

/* ---------------------------- tileset library ---------------------------- */

/** A tileset stored for reuse in new projects (gid range and active flag belong to a project). */
export type LibraryTileset = Omit<Tileset, 'firstGid' | 'active'> & { savedAt: number };

export function toLibraryTileset(ts: Tileset): LibraryTileset {
  const { firstGid: _g, active: _a, ...rest } = ts;
  void _g;
  void _a;
  const entry = { ...structuredClone(rest), savedAt: Date.now() };
  // copies of built-in demo sets get their own id (new projects always contain the originals)
  if (ts.source === 'demo') return { ...entry, id: `lib_${ts.id}`, source: 'upload' };
  return entry;
}

export async function saveLibraryTileset(entry: LibraryTileset): Promise<void> {
  await tx(LIBRARY, 'readwrite', (s) => s.put(entry));
}

export async function listLibraryTilesets(): Promise<LibraryTileset[]> {
  const all = await tx<LibraryTileset[]>(LIBRARY, 'readonly', (s) => s.getAll());
  return all.sort((a, b) => b.savedAt - a.savedAt);
}

export async function deleteLibraryTileset(id: string): Promise<void> {
  await tx(LIBRARY, 'readwrite', (s) => s.delete(id));
}
