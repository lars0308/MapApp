import type { Project } from '../types';
import { migrateProject } from './migrate';

// Minimal promise wrapper around IndexedDB.
// Projects are stored as structured clones (typed arrays are supported natively).

const DB_NAME = 'mapforge';
const DB_VERSION = 1;
const STORE = 'projects';
const META = 'meta';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  width: number;
  height: number;
  rooms: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB nicht verfügbar'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => (dbPromise = null));
  return dbPromise;
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
