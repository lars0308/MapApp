import { create } from 'zustand';
import { useProject } from './projectStore';
import { useEditor } from './editorStore';

// Top level pages (tabs in the header). The app always opens on "Projekt":
// new project / open a file / continue a recent one.

export type Page = 'project' | 'map' | 'character' | 'creature' | 'object' | 'animate' | 'settings';

export type FigurePage = 'character' | 'creature' | 'object';
export const FIGURE_PAGES: FigurePage[] = ['character', 'creature', 'object'];

/** header tabs – "Figuren" holds the three builders (Charakter / Kreatur / Objekt) */
export type Tab = 'project' | 'map' | 'figures' | 'animate' | 'settings';
export const TABS: { id: Tab; label: string; short: string }[] = [
  { id: 'project', label: 'Projekt', short: 'Projekt' },
  { id: 'map', label: 'Karte bauen', short: 'Karte' },
  { id: 'figures', label: 'Figuren bauen', short: 'Figuren' },
  { id: 'animate', label: 'Animieren', short: 'Animieren' },
  { id: 'settings', label: 'Einstellungen', short: 'Einstell.' },
];
export const tabOf = (p: Page): Tab => ((FIGURE_PAGES as string[]).includes(p) ? 'figures' : (p as Tab));

interface AppState {
  page: Page;
  /** builder last used under "Figuren" */
  figure: FigurePage;
  goTo: (page: Page) => void;
  goToTab: (tab: Tab) => void;
}

const KEY_FIG = 'mapforge.figurePage';
const readFig = (): FigurePage => {
  try {
    const v = localStorage.getItem(KEY_FIG) as FigurePage | null;
    return v && FIGURE_PAGES.includes(v) ? v : 'character';
  } catch {
    return 'character';
  }
};

/** untouched placeholder project (first start): nothing generated, nothing painted */
export function isPlaceholder(): boolean {
  const p = useProject.getState().project;
  return p.mode === 'generate' && !p.result && !p.objects.length && p.layers.every((l) => !l.data.some(Boolean));
}

export const useApp = create<AppState>((set, get) => ({
  page: 'project',
  figure: readFig(),
  goToTab: (tab) => get().goTo(tab === 'figures' ? get().figure : tab),
  goTo: (page) => {
    if ((FIGURE_PAGES as string[]).includes(page)) {
      set({ figure: page as FigurePage });
      try {
        localStorage.setItem(KEY_FIG, page);
      } catch {
        // ignore
      }
    }
    if (page === get().page) return;
    if (page !== 'map' && useEditor.getState().playtest) void import('../playtest/controller').then((m) => m.stopPlaytest());
    set({ page });
    // "Karte bauen" without a project yet: show a generated demo map instead of an empty editor
    if (page === 'map' && isPlaceholder()) void useProject.getState().runGenerate();
  },
}));
