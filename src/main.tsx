import { buildSideMap, stepSide, newBody, jumpSpeed, liftRow } from './playtest/sidePhysics';
import { animsFor, buildSheet } from './sprites/animation';
import { StrictMode } from 'react';
import { DEMO_PARTS, composeView, useSprites } from './sprites/store';
import { useApp } from './store/appStore';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/index.css';
import { useProject } from './store/projectStore';
import { useEditor } from './store/editorStore';
import { viewEvents } from './store/events';
import * as playtest from './playtest/controller';
import { computeBlocked, metaTable } from './editor/collision';
import { getRenderer } from './editor/rendererRef';
import { autoAssign } from './tilesets/autoAssign';
import * as learning from './tilesets/learning';
import { detectTileSize } from './tilesets/slicing';
import { slicePieces } from './tilesets/pieces';
import { ErrorBoundary, rememberError, takeLastError } from './components/ErrorBoundary';
import { startAiBridge } from './api/bridge';
import { startRelay, syncCloud } from './api/relay';
import { cloudLoad, cloudSave, isCloud } from './api/cloud';
import { setCustomObjects } from './objects/defs';

// small debugging handle (used by automated browser tests)
(window as unknown as Record<string, unknown>).__MAPFORGE__ = { project: useProject, editor: useEditor, view: viewEvents, playtest, computeBlocked, metaTable, renderer: getRenderer, autoAssign, learning, detectTileSize, slicePieces, sprites: useSprites, spriteParts: DEMO_PARTS, composeView, app: useApp, syncCloud, anim: { animsFor, buildSheet }, sidePhysics: { buildSideMap, stepSide, newBody, jumpSpeed, liftRow } };

// errors outside React rendering (event handlers, promises) become a visible message instead of silence
const report = (area: string, err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  rememberError(area, err);
  useEditor.getState().toast(`Fehler: ${msg}`, 'error');
};
window.addEventListener('error', (e) => e.message && !e.message.includes('ResizeObserver') && report('Skript', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => report('Hintergrund', e.reason));
// an error from the previous session (e.g. before a reload) stays readable
const last = takeLastError();
if (last) {
  console.warn('MapForge: letzter Fehler', last);
  setTimeout(() => useEditor.getState().toast(`Letzter Fehler (${last.area}, ${new Date(last.at).toLocaleTimeString()}): ${last.message}`, 'error'), 1500);
}

// manual building (Baukasten): no automatic neighbour walls unless switched on in the toolbar;
// generated maps keep them (painting floor then adjusts walls around it)
let autoWallsFor = '';
const syncAutoWalls = () => {
  const p = useProject.getState().project;
  if (p.id === autoWallsFor) return;
  autoWallsFor = p.id;
  useEditor.getState().setFlag('autoWalls', p.mode !== 'manual');
};
syncAutoWalls();
useProject.subscribe(syncAutoWalls);

// own objects (figures on the map) of the open project → object atlas
setCustomObjects(useProject.getState().project.customObjects);
useProject.subscribe((s) => setCustomObjects(s.project.customObjects));

// AI connection (MCP server on this computer) – only active when switched on
startAiBridge();
if (isCloud) Object.assign((window as unknown as { mapforge: object }).mapforge, { cloud: { load: cloudLoad, save: cloudSave } });
else startRelay();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary area="App">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD && !isCloud) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is optional */
    });
  });
}
