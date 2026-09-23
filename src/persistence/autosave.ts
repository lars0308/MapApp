import { useProject } from '../store/projectStore';
import { saveProject } from './db';

// Debounced background save of the current project into IndexedDB.

let timer = 0;
let saving = false;

export async function saveNow(): Promise<boolean> {
  clearTimeout(timer);
  const { project, revision, markSaved } = useProject.getState();
  if (saving) return false;
  saving = true;
  try {
    await saveProject(project);
    markSaved(revision);
    return true;
  } catch (e) {
    console.warn('Speichern fehlgeschlagen', e);
    return false;
  } finally {
    saving = false;
  }
}

export function startAutosave(): () => void {
  let lastRev = useProject.getState().revision;
  const unsub = useProject.subscribe((s) => {
    if (s.revision === lastRev) return;
    lastRev = s.revision;
    clearTimeout(timer);
    timer = window.setTimeout(() => void saveNow(), 1200);
  });
  const flush = () => {
    const { revision, savedRevision } = useProject.getState();
    if (revision !== savedRevision) void saveNow();
  };
  const onVisibility = () => document.visibilityState === 'hidden' && flush();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', flush);
  return () => {
    unsub();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', flush);
  };
}
