import { create } from 'zustand';

// Desktop workspace layout (side docks, sections, sizes). Mobile keeps its bottom sheets.
// Stored per browser in localStorage – a convenience, never project data.

export type LeftTab = 'generator' | 'terrain';
/** panels that can be collapsed / closed / maximized */
export type PanelId = 'left' | 'layers' | 'tiles';

export interface PanelState {
  collapsed: boolean;
  closed: boolean;
}

export interface DesktopLayout {
  leftWidth: number;
  rightWidth: number;
  /** height of the layer section in the right dock (px) */
  layersHeight: number;
  leftTab: LeftTab;
  panels: Record<PanelId, PanelState>;
  maximized: PanelId | null;
}

export const LAYOUT_DEFAULTS: DesktopLayout = {
  leftWidth: 320,
  rightWidth: 304,
  layersHeight: 300,
  leftTab: 'generator',
  panels: {
    left: { collapsed: false, closed: false },
    layers: { collapsed: false, closed: false },
    tiles: { collapsed: false, closed: false },
  },
  maximized: null,
};

export const LIMITS = {
  sideMin: 240,
  /** the map keeps at least this width */
  centerMin: 320,
  sectionMin: 120,
};

const KEY = 'mapforge.desktopLayout.v1';

function load(): DesktopLayout {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return LAYOUT_DEFAULTS;
    const v = JSON.parse(raw) as Partial<DesktopLayout>;
    return {
      ...LAYOUT_DEFAULTS,
      ...v,
      // export and settings moved to their own pages (tabs "Projekt" / "Einstellungen")
      leftTab: v.leftTab === 'terrain' ? 'terrain' : 'generator',
      panels: {
        left: { ...LAYOUT_DEFAULTS.panels.left, ...v.panels?.left },
        layers: { ...LAYOUT_DEFAULTS.panels.layers, ...v.panels?.layers },
        tiles: { ...LAYOUT_DEFAULTS.panels.tiles, ...v.panels?.tiles },
      },
    };
  } catch {
    return LAYOUT_DEFAULTS;
  }
}

function save(l: DesktopLayout) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    // private mode / storage full: layout just isn't remembered
  }
}

interface LayoutState extends DesktopLayout {
  setSize: (patch: Partial<Pick<DesktopLayout, 'leftWidth' | 'rightWidth' | 'layersHeight'>>) => void;
  setLeftTab: (tab: LeftTab) => void;
  toggleCollapsed: (id: PanelId) => void;
  setClosed: (id: PanelId, closed: boolean) => void;
  toggleMaximized: (id: PanelId) => void;
  /** open a panel (un-close, expand) – e.g. from the topbar or the gear button */
  show: (id: PanelId, tab?: LeftTab) => void;
  resetSize: (key: 'leftWidth' | 'rightWidth' | 'layersHeight') => void;
  resetAll: () => void;
}

export const useLayout = create<LayoutState>((set, get) => {
  const commit = (patch: Partial<DesktopLayout>) => {
    set(patch);
    const { leftWidth, rightWidth, layersHeight, leftTab, panels, maximized } = get();
    save({ leftWidth, rightWidth, layersHeight, leftTab, panels, maximized });
  };
  const patchPanel = (id: PanelId, p: Partial<PanelState>) => ({ ...get().panels, [id]: { ...get().panels[id], ...p } });
  return {
    ...load(),
    setSize: (patch) => commit(patch),
    setLeftTab: (leftTab) => commit({ leftTab }),
    toggleCollapsed: (id) => commit({ panels: patchPanel(id, { collapsed: !get().panels[id].collapsed }), maximized: get().maximized === id ? null : get().maximized }),
    setClosed: (id, closed) => commit({ panels: patchPanel(id, { closed, collapsed: false }), maximized: closed && get().maximized === id ? null : get().maximized }),
    toggleMaximized: (id) => commit({ maximized: get().maximized === id ? null : id, panels: patchPanel(id, { collapsed: false, closed: false }) }),
    show: (id, tab) => commit({ panels: patchPanel(id, { collapsed: false, closed: false }), ...(tab ? { leftTab: tab } : {}) }),
    resetSize: (key) => commit({ [key]: LAYOUT_DEFAULTS[key] }),
    resetAll: () => commit({ ...LAYOUT_DEFAULTS, leftTab: get().leftTab }),
  };
});
