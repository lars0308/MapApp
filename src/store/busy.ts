import { create } from 'zustand';

// Everything that takes a moment says so, big and clear: "Karte wird generiert …",
// "Die KI liest deine Beschreibung …". Several jobs can run at once; the newest is shown.

export interface BusyJob {
  id: number;
  title: string;
  detail?: string;
  /** the AI is reading / thinking (shown with the AI look) */
  ai?: boolean;
}

interface BusyState {
  jobs: BusyJob[];
}

export const useBusy = create<BusyState>(() => ({ jobs: [] }));
let next = 1;

/** show a loading notice while `fn` runs */
export async function withBusy<T>(title: string, fn: () => Promise<T> | T, opts: { detail?: string; ai?: boolean } = {}): Promise<T> {
  const id = next++;
  useBusy.setState((s) => ({ jobs: [...s.jobs, { id, title, ...opts }] }));
  // let the notice paint before heavy work blocks the main thread
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  try {
    return await fn();
  } finally {
    useBusy.setState((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) }));
  }
}

/** change the text of the running notice (steps of a longer job) */
export function busyStep(title: string, detail?: string) {
  useBusy.setState((s) => (s.jobs.length ? { jobs: s.jobs.map((j, k) => (k === s.jobs.length - 1 ? { ...j, title, detail } : j)) } : s));
}
