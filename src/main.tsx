import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/index.css';
import { useProject } from './store/projectStore';
import { useEditor } from './store/editorStore';
import { viewEvents } from './store/events';

// small debugging handle (used by automated browser tests)
(window as unknown as Record<string, unknown>).__MAPFORGE__ = { project: useProject, editor: useEditor, view: viewEvents };

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
