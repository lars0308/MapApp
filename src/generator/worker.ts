import { generate, type GenerateInput } from './index';

// Runs the generator off the main thread, so the app stays responsive while big maps are built
// (phones take a second or two for 256×256).

self.onmessage = (e: MessageEvent<{ id: number; input: GenerateInput }>) => {
  const { id, input } = e.data;
  try {
    const out = generate(input);
    (self as unknown as Worker).postMessage({ id, out }, Object.values(out.layerData).map((a) => a.buffer));
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
