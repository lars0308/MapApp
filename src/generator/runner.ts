import { generate, type GenerateInput, type GenerateOutput } from './index';

// Generator in a web worker; falls back to the main thread when workers are not available
// (or the worker fails to start).

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (o: GenerateOutput) => void; reject: (e: Error) => void; input: GenerateInput }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; out?: GenerateOutput; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.out) p.resolve(e.data.out);
      else p.reject(new Error(e.data.error ?? 'Generator-Fehler'));
    };
    // worker could not load: run everything that waits (and all later runs) here instead
    worker.onerror = (e) => {
      e.preventDefault();
      worker?.terminate();
      worker = null;
      for (const [id, p] of pending) {
        pending.delete(id);
        try {
          p.resolve(generate(p.input));
        } catch (err) {
          p.reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
    };
  } catch {
    worker = null;
  }
  return worker;
}

export function generateAsync(input: GenerateInput): Promise<GenerateOutput> {
  const w = getWorker();
  if (!w) return Promise.resolve().then(() => generate(input));
  // tileset images are not needed for generating – keep the message small
  const lean: GenerateInput = { ...input, layers: input.layers.map((l) => ({ id: l.id, role: l.role })), tilesets: input.tilesets.map((t) => ({ ...t, dataUrl: '', sourceDataUrl: undefined })) };
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, input });
    w.postMessage({ id, input: lean });
  });
}
