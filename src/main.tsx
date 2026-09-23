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
import { ErrorBoundary, rememberError, takeLastError } from './components/ErrorBoundary';

// small debugging handle (used by automated browser tests)
(window as unknown as Record<string, unknown>).__MAPFORGE__ = { project: useProject, editor: useEditor, view: viewEvents, playtest, computeBlocked, metaTable, renderer: getRenderer, autoAssign, learning, detectTileSize, sprites: useSprites, spriteParts: DEMO_PARTS, composeView, app: useApp, anim: { animsFor, buildSheet } };

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary area="App">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is optional */
    });
  });
}
