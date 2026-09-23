import type { GenerationResult, Layer, Project } from '../types';
import { rleDecode, rleEncode } from '../utils/rle';
import { defaultGenerator } from '../generator/presets';
import { uid } from '../utils/id';

// Portable project format (*.mapforge.json). Layer data is run-length encoded.

export const PROJECT_EXTENSION = '.mapforge.json';
const FORMAT = 'mapforge-project';

interface FileLayer extends Omit<Layer, 'data'> {
  data: number[];
}

interface FileResult extends Omit<GenerationResult, 'cells' | 'wallMask'> {
  cells: number[];
  wallMask: number[];
}

interface ProjectFile {
  format: typeof FORMAT;
  formatVersion: 1;
  app: 'MapForge';
  exportedAt: string;
  project: Omit<Project, 'layers' | 'result'> & { layers: FileLayer[]; result: FileResult | null };
}

export function serializeProject(p: Project): string {
  const file: ProjectFile = {
    format: FORMAT,
    formatVersion: 1,
    app: 'MapForge',
    exportedAt: new Date().toISOString(),
    project: {
      ...p,
      layers: p.layers.map((l) => ({ ...l, data: rleEncode(l.data) })),
      result: p.result ? { ...p.result, cells: rleEncode(p.result.cells), wallMask: rleEncode(p.result.wallMask) } : null,
    },
  };
  return JSON.stringify(file);
}

export function deserializeProject(text: string): Project {
  let parsed: ProjectFile;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Datei ist kein gültiges JSON');
  }
  if (parsed?.format !== FORMAT || !parsed.project) throw new Error('Keine MapForge-Projektdatei');
  const fp = parsed.project;
  const size = fp.map.width * fp.map.height;
  const layers: Layer[] = fp.layers.map((l) => ({ ...l, data: rleDecode(l.data, new Uint32Array(size)) }));
  const result: GenerationResult | null = fp.result
    ? {
        ...fp.result,
        cells: rleDecode(fp.result.cells, new Uint8Array(fp.result.width * fp.result.height)),
        wallMask: rleDecode(fp.result.wallMask, new Uint8Array(fp.result.width * fp.result.height)),
      }
    : null;
  return {
    ...fp,
    // imported copies get a fresh id so they never overwrite an existing local project
    id: uid('prj'),
    generator: { ...defaultGenerator(fp.generator?.seed), ...fp.generator },
    layers,
    result,
    activeLayerId: layers.some((l) => l.id === fp.activeLayerId) ? fp.activeLayerId : layers[0]?.id,
    updatedAt: Date.now(),
  };
}
