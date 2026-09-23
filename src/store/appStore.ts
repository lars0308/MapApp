import { create } from 'zustand';
import { useProject } from './projectStore';
import { useEditor } from './editorStore';

// Top level pages (tabs in the header). The app always opens on "Projekt":
// new project / open a file / continue a recent one.

export type Page = 'project' | 'map' | 'character' | 'object' | 'animate' | 'settings';

export const PAGES: { id: Page; label: string; short: string }[] = [
  { id: 'project', label: 'Projekt', short: 'Projekt' },
  { id: 'map', label: 'Karte bauen', short: 'Karte' },
  { id: 'character', label: 'Charakter bauen', short: 'Charakter' },
  { id: 'object', label: 'Objekt bauen', short: 'Objekt' },
  { id: 'animate', label: 'Animieren', short: 'Animieren' },
  { id: 'settings', label: 'Einstellungen', short: 'Einstell.' },
];

interface AppState {
  page: Page;
  goTo: (page: Page) => void;
}

/** untouched placeholder project (first start): nothing generated, nothing painted */
export function isPlaceholder(): boolean {
  const p = useProject.getState().project;
  return p.mode === 'generate' && !p.result && !p.objects.length && p.layers.every((l) => !l.data.some(Boolean));
}

export const useApp = create<AppState>((set, get) => ({
  page: 'project',
  goTo: (page) => {
    if (page === get().page) return;
    if (page !== 'map' && useEditor.getState().playtest) void import('../playtest/controller').then((m) => m.stopPlaytest());
    set({ page });
    // "Karte bauen" without a project yet: show a generated demo map instead of an empty editor
    if (page === 'map' && isPlaceholder()) void useProject.getState().runGenerate();
  },
}));
