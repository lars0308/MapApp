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

/** pages that first ask what should be made / opened */
export type Chooser = 'map' | 'figures' | 'animate';

interface AppState {
  page: Page;
  /** builder last used under "Figuren" */
  figure: FigurePage;
  /** figure kind in "Animieren" */
  animKind: FigurePage;
  /** answered "what do you want to …?" in this session (tab clicks show the question until then) */
  chosen: Record<Chooser, boolean>;
  setChosen: (c: Chooser, v: boolean) => void;
  setAnimKind: (k: FigurePage) => void;
  /** open a page directly (from a button) – counts as a choice */
  goTo: (page: Page) => void;
  /** header tab: shows the question first when nothing was chosen yet */
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
  animKind: 'character',
  chosen: { map: false, figures: false, animate: false },
  setChosen: (c, v) => set({ chosen: { ...get().chosen, [c]: v } }),
  setAnimKind: (animKind) => set({ animKind }),
  goToTab: (tab) => {
    // tapping the open tab again goes back to its question (other map / other figure)
    const c: Chooser | null = tab === 'map' || tab === 'animate' || tab === 'figures' ? tab : null;
    if (c && tabOf(get().page) === tab && get().chosen[c]) return set({ chosen: { ...get().chosen, [c]: false } });
    open(tab === 'figures' ? get().figure : tab);
  },
  goTo: (page) => {
    const c: Chooser | null = page === 'map' ? 'map' : page === 'animate' ? 'animate' : (FIGURE_PAGES as string[]).includes(page) ? 'figures' : null;
    if (c && !get().chosen[c]) set({ chosen: { ...get().chosen, [c]: true } });
    open(page);
  },
}));

function open(page: Page) {
  const get = useApp.getState;
  const set = useApp.setState;
  {
    if ((FIGURE_PAGES as string[]).includes(page)) {
      set({ figure: page as FigurePage });
      try {
        localStorage.setItem(KEY_FIG, page);
      } catch {
        // ignore
      }
    }
    // map chosen but still the untouched first-start project: show a generated demo map
    if (page === 'map' && get().chosen.map && isPlaceholder()) void useProject.getState().runGenerate();
    if (page === get().page) return;
    if (page !== 'map' && useEditor.getState().playtest) void import('../playtest/controller').then((m) => m.stopPlaytest());
    set({ page });
  }
}
