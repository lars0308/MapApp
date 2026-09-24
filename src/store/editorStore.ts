import { create } from 'zustand';
import type { ViewKind } from '../profiles';
import type { ObjectType, Selection, ToolId } from '../types';

export type MobilePanel = 'generate' | 'terrain' | 'tiles' | 'layers' | 'export' | 'settings' | null;
export type ViewMode = 'map' | 'graph';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error' | 'success';
}

interface EditorState {
  tool: ToolId;
  brushSize: number;
  selectedGid: number;
  /** tiles marked for batch categorisation */
  markedGids: number[];
  multiSelect: boolean;
  selection: Selection | null;
  showGrid: boolean;
  showCoords: boolean;
  view: ViewMode;
  mobilePanel: MobilePanel;
  hoverCell: { x: number; y: number } | null;
  zoom: number;
  toasts: Toast[];
  showCollision: boolean;
  /** eraser draws a rectangle instead of brush strokes */
  eraseRect: boolean;
  /** rectangle eraser clears all (unlocked) layers and objects */
  eraseAllLayers: boolean;
  showSortPoints: boolean;
  /** re-tile walls automatically while painting ground / doors */
  autoWalls: boolean;
  /** object brush (null = tiles) */
  selectedObject: ObjectType | null;
  playtest: boolean;
  setFlag: (key: 'showCollision' | 'showSortPoints' | 'autoWalls' | 'eraseRect' | 'eraseAllLayers', value: boolean) => void;
  selectObject: (t: ObjectType | null) => void;
  setPlaytest: (v: boolean) => void;
  /** new-project setup wizard */
  wizardOpen: boolean;
  /** opened automatically on first start (closing it creates a demo map) */
  wizardFirstRun: boolean;
  /** game view picked before opening the wizard ("Neue Karte → Side-Scroller") */
  wizardView: ViewKind | null;
  openWizard: (firstRun?: boolean, view?: ViewKind) => void;
  closeWizard: () => void;
  setTool: (t: ToolId) => void;
  setBrushSize: (n: number) => void;
  selectTile: (gid: number) => void;
  toggleMark: (gid: number) => void;
  setMultiSelect: (v: boolean) => void;
  clearMarks: () => void;
  setSelection: (s: Selection | null) => void;
  toggleGrid: () => void;
  toggleCoords: () => void;
  setView: (v: ViewMode) => void;
  setMobilePanel: (p: MobilePanel) => void;
  setHover: (c: { x: number; y: number } | null) => void;
  setZoom: (z: number) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
}

let toastId = 1;

export const useEditor = create<EditorState>((set, get) => ({
  tool: 'hand',
  brushSize: 1,
  selectedGid: 0,
  markedGids: [],
  multiSelect: false,
  selection: null,
  showGrid: true,
  showCoords: false,
  view: 'map',
  mobilePanel: null,
  hoverCell: null,
  zoom: 1,
  toasts: [],
  showCollision: false,
  eraseRect: false,
  eraseAllLayers: false,
  showSortPoints: false,
  autoWalls: true,
  selectedObject: null,
  playtest: false,
  setFlag: (key, value) => set({ [key]: value } as Partial<EditorState>),
  selectObject: (selectedObject) =>
    set({ selectedObject, tool: selectedObject && get().tool !== 'eraser' && get().tool !== 'move' ? 'brush' : get().tool }),
  setPlaytest: (playtest) => set({ playtest, mobilePanel: null, selection: null }),
  wizardOpen: false,
  wizardFirstRun: false,
  wizardView: null,
  openWizard: (firstRun = false, view) => set({ wizardOpen: true, wizardFirstRun: firstRun, wizardView: view ?? null, mobilePanel: null }),
  closeWizard: () => set({ wizardOpen: false, wizardFirstRun: false }),
  setTool: (tool) => set({ tool, selection: tool === 'select' || tool === 'move' ? get().selection : null }),
  setBrushSize: (brushSize) => set({ brushSize }),
  selectTile: (gid) => {
    const { tool } = get();
    set({ selectedGid: gid, selectedObject: null, tool: tool === 'eraser' || tool === 'pipette' || tool === 'hand' ? 'brush' : tool });
  },
  toggleMark: (gid) => {
    const m = get().markedGids;
    set({ markedGids: m.includes(gid) ? m.filter((g) => g !== gid) : [...m, gid] });
  },
  setMultiSelect: (multiSelect) => set({ multiSelect, markedGids: [] }),
  clearMarks: () => set({ markedGids: [] }),
  setSelection: (selection) => set({ selection }),
  toggleGrid: () => set({ showGrid: !get().showGrid }),
  toggleCoords: () => set({ showCoords: !get().showCoords }),
  setView: (view) => set({ view }),
  setMobilePanel: (mobilePanel) => set({ mobilePanel }),
  setHover: (hoverCell) => {
    const cur = get().hoverCell;
    if (cur?.x === hoverCell?.x && cur?.y === hoverCell?.y) return;
    set({ hoverCell });
  },
  setZoom: (zoom) => set({ zoom }),
  toast: (text, tone = 'info') => {
    const id = toastId++;
    set({ toasts: [...get().toasts.slice(-2), { id, text, tone }] });
    setTimeout(() => get().dismissToast(id), tone === 'error' ? 4200 : 2400);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
