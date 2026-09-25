import type { GenerationResult, Layer, Level, LevelData, Project } from '../types';
import { rleDecode, rleEncode } from '../utils/rle';
import { defaultGenerator } from '../generator/presets';
import { uid } from '../utils/id';
import { migrateProject } from './migrate';

// Portable project format (*.mapforge.json). Layer data is run-length encoded.

export const PROJECT_EXTENSION = '.mapforge.json';
const FORMAT = 'mapforge-project';

interface FileLayer extends Omit<Layer, 'data'> {
  data: number[];
}

interface FileResult extends Omit<GenerationResult, 'cells' | 'wallMask' | 'floorMask' | 'terrain' | 'heights'> {
  cells: number[];
  wallMask: number[];
  floorMask?: number[];
  terrain?: number[];
  heights?: number[];
}

interface FileLevel extends Omit<Level, 'data'> {
  data?: Omit<LevelData, 'layers' | 'result'> & { layers: FileLayer[]; result: FileResult | null };
}

interface ProjectFile {
  format: typeof FORMAT;
  formatVersion: 1;
  app: 'MapForge';
  exportedAt: string;
  project: Omit<Project, 'layers' | 'result' | 'levels'> & { layers: FileLayer[]; result: FileResult | null; levels?: FileLevel[] };
}

const encodeLayers = (layers: Layer[]): FileLayer[] => layers.map((l) => ({ ...l, data: rleEncode(l.data) }));
const encodeResult = (r: GenerationResult | null): FileResult | null =>
  r
    ? {
        ...r,
        cells: rleEncode(r.cells),
        wallMask: rleEncode(r.wallMask),
        floorMask: rleEncode(r.floorMask ?? new Uint8Array(0)),
        terrain: rleEncode(r.terrain ?? new Uint8Array(0)),
        heights: rleEncode(r.heights ?? new Uint8Array(0)),
      }
    : null;
const decodeLayers = (layers: FileLayer[], size: number): Layer[] => layers.map((l) => ({ ...l, data: rleDecode(l.data, new Uint32Array(size)) }));
function decodeResult(r: FileResult | null, fallbackPerspective: GenerationResult['perspective']): GenerationResult | null {
  if (!r) return null;
  const n = r.width * r.height;
  return {
    ...r,
    cells: rleDecode(r.cells, new Uint8Array(n)),
    wallMask: rleDecode(r.wallMask, new Uint8Array(n)),
    floorMask: rleDecode(r.floorMask ?? [], new Uint8Array(n)),
    terrain: rleDecode(r.terrain ?? [], new Uint8Array(n)),
    heights: rleDecode(r.heights ?? [], new Uint8Array(n)),
    perspective: r.perspective ?? fallbackPerspective ?? 'top_down',
  };
}

export function serializeProject(p: Project): string {
  const file: ProjectFile = {
    format: FORMAT,
    formatVersion: 1,
    app: 'MapForge',
    exportedAt: new Date().toISOString(),
    project: {
      ...p,
      layers: encodeLayers(p.layers),
      result: encodeResult(p.result),
      levels: p.levels?.map((l) => (l.data ? { ...l, data: { ...l.data, layers: encodeLayers(l.data.layers), result: encodeResult(l.data.result) } } : { id: l.id, name: l.name })),
    },
  };
  return JSON.stringify(file);
}

export function deserializeProject(text: string, keepId = false): Project {
  let parsed: ProjectFile;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Datei ist kein gültiges JSON');
  }
  if (parsed?.format !== FORMAT || !parsed.project) throw new Error('Keine MapForge-Projektdatei');
  const fp = parsed.project;
  const size = fp.map.width * fp.map.height;
  const layers = decodeLayers(fp.layers, size);
  const result = decodeResult(fp.result, fp.map.perspective);
  const levels: Level[] | undefined = fp.levels?.map((l) =>
    l.data ? { ...l, data: { ...l.data, layers: decodeLayers(l.data.layers, l.data.map.width * l.data.map.height), result: decodeResult(l.data.result, l.data.map.perspective) } } : { id: l.id, name: l.name },
  );
  return migrateProject({
    ...fp,
    // imported copies get a fresh id so they never overwrite an existing local project
    id: keepId && fp.id ? fp.id : uid('prj'),
    generator: { ...defaultGenerator(fp.generator?.seed), ...fp.generator },
    layers,
    result,
    levels,
    activeLayerId: layers.some((l) => l.id === fp.activeLayerId) ? fp.activeLayerId : layers[0]?.id,
    updatedAt: keepId ? (fp.updatedAt ?? Date.now()) : Date.now(),
  });
}
