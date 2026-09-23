// Lightweight event channels between store, editor and renderer.
// Map data lives in typed arrays that are mutated in place for speed,
// so the renderer is told precisely which cells changed.

type Listener<T> = (e: T) => void;

export class Emitter<T> {
  private listeners = new Set<Listener<T>>();
  on(fn: Listener<T>): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(e: T): void {
    for (const fn of this.listeners) fn(e);
  }
}

export type MapEvent = { type: 'cells'; cells: number[] } | { type: 'all' };
export const mapEvents = new Emitter<MapEvent>();

export type ViewEvent =
  | { type: 'fit' }
  | { type: 'zoom'; factor: number }
  | { type: 'focus'; x: number; y: number; w?: number; h?: number };
export const viewEvents = new Emitter<ViewEvent>();
