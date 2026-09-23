import type { GenerationResult, Layer, MapSettings, Tileset } from '../types';

export interface DocSnapshot {
  map: MapSettings;
  layers: Layer[];
  activeLayerId: string;
  result: GenerationResult | null;
  /** only captured for tileset operations */
  tilesets?: Tileset[];
  nextGid?: number;
}

export type HistoryEntry =
  | {
      kind: 'cells';
      label: string;
      layerId: string;
      idx: Uint32Array;
      before: Uint32Array;
      after: Uint32Array;
    }
  | { kind: 'doc'; label: string; before: DocSnapshot; after: DocSnapshot };

const LIMIT = 60;
/** Rough memory budget for snapshots (bytes). */
const BUDGET = 160 * 1024 * 1024;

export function cloneLayers(layers: Layer[]): Layer[] {
  return layers.map((l) => ({ ...l, data: l.data.slice() }));
}

function entrySize(e: HistoryEntry): number {
  if (e.kind === 'cells') return e.idx.byteLength * 3;
  const size = (s: DocSnapshot) => s.layers.reduce((n, l) => n + l.data.byteLength, 0);
  return size(e.before) + size(e.after);
}

export class History {
  undoStack: HistoryEntry[] = [];
  redoStack: HistoryEntry[] = [];

  push(e: HistoryEntry) {
    this.undoStack.push(e);
    this.redoStack = [];
    let total = this.undoStack.reduce((n, x) => n + entrySize(x), 0);
    while (this.undoStack.length > LIMIT || (total > BUDGET && this.undoStack.length > 1)) {
      const removed = this.undoStack.shift()!;
      total -= entrySize(removed);
    }
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
}
