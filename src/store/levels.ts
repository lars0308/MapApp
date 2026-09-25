import type { Level, LevelData, Project } from '../types';

// Ebenen: several maps in one project (floors of a dungeon, caves below a village …).
// The open level lives in the project's own fields; the others are parked in `project.levels`.

export const MAIN_LEVEL = 'lvl_main';

/** all levels in order (a project without levels has exactly one) */
export function levelsOf(p: Project): Level[] {
  return p.levels?.length ? p.levels : [{ id: p.levelId ?? MAIN_LEVEL, name: 'Ebene 1' }];
}

export const openLevelId = (p: Project) => p.levelId ?? levelsOf(p)[0].id;

/** the open level's data as it is now */
export function captureLevel(p: Project): LevelData {
  return { map: p.map, generator: p.generator, layers: p.layers, activeLayerId: p.activeLayerId, result: p.result, objects: p.objects };
}

/** the project as seen from one level (the open one: the project itself) */
export function levelProject(p: Project, level: Level): Project {
  if (level.id === openLevelId(p) || !level.data) return p;
  return { ...p, ...level.data };
}

/** remove tiles of a gid range from the parked levels (tileset removed / cut anew) */
export function clearGidsInLevels(levels: Level[] | undefined, lo: number, hi: number): Level[] | undefined {
  return levels?.map((l) =>
    l.data
      ? {
          ...l,
          data: {
            ...l.data,
            layers: l.data.layers.map((layer) => {
              const data = layer.data.slice();
              for (let i = 0; i < data.length; i++) if ((data[i] & 0x0fffffff) >= lo && (data[i] & 0x0fffffff) < hi) data[i] = 0;
              return { ...layer, data };
            }),
          },
        }
      : l,
  );
}
