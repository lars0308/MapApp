import { useEffect, useState } from 'react';
import { DesktopLayout } from './components/DesktopLayout';
import { MobileLayout } from './mobile/MobileLayout';
import { Toasts } from './components/Toasts';
import { SetupWizard } from './components/wizard/SetupWizard';
import { useMediaQuery } from './utils/useMediaQuery';
import { useShortcuts } from './editor/useShortcuts';
import { useProject } from './store/projectStore';
import { useEditor } from './store/editorStore';
import { lastProjectId, loadProject } from './persistence/db';
import { startAutosave } from './persistence/autosave';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useApp } from './store/appStore';
import { MapChooser } from './components/MapChooser';
import { FigureChooser } from './sprites/FigureChooser';
import { StartPage } from './components/StartPage';
import { SettingsPage } from './components/SettingsPage';
import { PageShell } from './components/PageShell';
import { SpriteStudio } from './sprites/SpriteStudio';

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
  // nothing saved yet: the start page offers "Neues Projekt" / "Projekt öffnen"
}

export function App() {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [ready, setReady] = useState(false);
  const wizardOpen = useEditor((s) => s.wizardOpen);
  const page = useApp((s) => s.page);
  const chosen = useApp((s) => s.chosen);
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
    <div className={`app on-${page}${ready ? ' is-ready' : ''}${wizardOpen ? ' has-wizard' : ''}`}>
      {page === 'map' && chosen.map ? (
        <ErrorBoundary area="Editor">{desktop ? <DesktopLayout /> : <MobileLayout />}</ErrorBoundary>
      ) : page === 'map' ? (
        <PageShell desktop={desktop}>
          <MapChooser />
        </PageShell>
      ) : (
        <PageShell desktop={desktop}>
          <ErrorBoundary area={page === 'project' ? 'Projekt' : page === 'settings' ? 'Einstellungen' : page === 'character' ? 'Charakter bauen' : page === 'creature' ? 'Kreatur bauen' : 'Objekt bauen'} key={page}>
            {page === 'project' && <StartPage />}
            {page === 'settings' && <SettingsPage desktop={desktop} />}
            {(page === 'character' || page === 'object' || page === 'creature') &&
              (chosen.figures ? <SpriteStudio kind={page} desktop={desktop} /> : <FigureChooser purpose="build" onPick={(k) => useApp.getState().goTo(k)} />)}
          </ErrorBoundary>
        </PageShell>
      )}
      <ErrorBoundary area="Setup-Assistent" onClose={() => useEditor.getState().closeWizard()} closeLabel="Assistent schließen">
        <SetupWizard />
      </ErrorBoundary>
      <Toasts />
    </div>
  );
}
