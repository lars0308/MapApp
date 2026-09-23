import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/index.css';
import { useProject } from './store/projectStore';
import { useEditor } from './store/editorStore';
import { viewEvents } from './store/events';
import * as playtest from './playtest/controller';
import { computeBlocked, metaTable } from './editor/collision';
import { getRenderer } from './editor/rendererRef';

// small debugging handle (used by automated browser tests)
(window as unknown as Record<string, unknown>).__MAPFORGE__ = { project: useProject, editor: useEditor, view: viewEvents, playtest, computeBlocked, metaTable, renderer: getRenderer };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is optional */
    });
  });
}
