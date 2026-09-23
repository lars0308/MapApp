import { useEffect, useState } from 'react';
import { DesktopLayout } from './components/DesktopLayout';
import { MobileLayout } from './mobile/MobileLayout';
import { Toasts } from './components/Toasts';
import { useMediaQuery } from './utils/useMediaQuery';
import { useShortcuts } from './editor/useShortcuts';
import { useProject } from './store/projectStore';
import { useEditor } from './store/editorStore';
import { lastProjectId, loadProject } from './persistence/db';
import { saveNow, startAutosave } from './persistence/autosave';

/** Wide screens (desktop, tablet landscape) get the three-column editor. */
export const DESKTOP_QUERY = '(min-width: 1000px) and (min-height: 560px)';

let bootPromise: Promise<void> | null = null;

async function boot() {
  try {
    const id = await lastProjectId();
    const saved = id ? await loadProject(id) : null;
    if (saved) {
      useProject.getState().loadProject(saved);
      return;
    }
  } catch (e) {
    console.warn('Gespeichertes Projekt konnte nicht geladen werden', e);
  }
  // first start: generate a demo map right away
  await useProject.getState().runGenerate();
  await saveNow();
}

export function App() {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [ready, setReady] = useState(false);
  useShortcuts();

  useEffect(() => {
    let stop = () => {};
    let alive = true;
    bootPromise ??= boot();
    bootPromise.finally(() => {
      if (!alive) return;
      // first palette selection: first floor tile
      const p = useProject.getState().project;
      if (!useEditor.getState().selectedGid) {
        for (const ts of p.tilesets) {
          const idx = Object.keys(ts.tiles).map(Number).find((i) => ts.tiles[i].category === 'floor');
          if (idx !== undefined) {
            useEditor.setState({ selectedGid: ts.firstGid + idx });
            break;
          }
        }
      }
      stop = startAutosave();
      setReady(true);
    });
    return () => {
      alive = false;
      stop();
    };
  }, []);

  return (
    <div className={`app${ready ? ' is-ready' : ''}`}>
      {desktop ? <DesktopLayout /> : <MobileLayout />}
      <Toasts />
    </div>
  );
}
