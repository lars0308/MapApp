import { useEffect } from 'react';
import { useEditor } from '../store/editorStore';
import { useProject } from '../store/projectStore';
import { viewEvents } from '../store/events';
import { TOOLS } from './tools';
import { saveNow } from '../persistence/autosave';
import { useApp } from '../store/appStore';
import { copySelection } from './clipboard';

/** Desktop keyboard shortcuts. Mobile uses the visible buttons. */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // other pages (character / object builder …) have their own shortcuts
      if (useApp.getState().page !== 'map') return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const project = useProject.getState();
      const editor = useEditor.getState();

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) project.redo();
        else project.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        project.redo();
        return;
      }
      if (mod && (key === 'c' || key === 'x') && editor.selection) {
        e.preventDefault();
        copySelection(key === 'x');
        return;
      }
      if (mod && key === 'v') {
        e.preventDefault();
        if (editor.clipboard) editor.setTool('stamp');
        else editor.toast('Nichts kopiert – erst einen Bereich markieren und kopieren');
        return;
      }
      if ((key === 'delete' || key === 'backspace') && editor.selection) {
        e.preventDefault();
        const n = project.clearArea(editor.selection);
        editor.toast(n ? 'Auswahl gelöscht (alle Layer)' : 'Auswahl war schon leer');
        return;
      }
      if (mod && key === 's') {
        e.preventDefault();
        void saveNow().then((ok) => editor.toast(ok ? 'Projekt gespeichert' : 'Speichern fehlgeschlagen', ok ? 'success' : 'error'));
        return;
      }
      if (mod || e.altKey) return;
      const tool = TOOLS.find((x) => x.key.toLowerCase() === key);
      if (tool) {
        editor.setTool(tool.id);
        return;
      }
      if (key === 'g') editor.toggleGrid();
      else if (key === '0') viewEvents.emit({ type: 'fit' });
      else if (key === '+' || key === '=') viewEvents.emit({ type: 'zoom', factor: 1.4 });
      else if (key === '-') viewEvents.emit({ type: 'zoom', factor: 1 / 1.4 });
      else if (key === 'escape') editor.setSelection(null);
      else if (key === '[' ) editor.setBrushSize(Math.max(1, editor.brushSize - 1));
      else if (key === ']') editor.setBrushSize(Math.min(5, editor.brushSize + 1));
      else if (key === 'enter' && e.shiftKey && project.project.mode !== 'manual') void project.runGenerate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
