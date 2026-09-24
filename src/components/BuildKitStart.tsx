import { useProject } from '../store/projectStore';
import { useEditor } from '../store/editorStore';
import { viewEvents } from '../store/events';
import { applyAutoWalls } from '../editor/autoWalls';
import { TilePools } from '../tilesets/tilePools';
import { Rng } from '../generator/rng';
import { Icon } from './icons';

// Manual build mode with an empty map: instead of a dark, empty canvas show where to start.

function floorGid(): number {
  const p = useProject.getState().project;
  return new TilePools(p.tilesets, p.map.perspective).pickPref(new Rng(1), ['floor']);
}

/** Places a first room in the middle of the map (same path as painting: stroke + auto-walls, one undo step). */
function createStartRoom() {
  const s = useProject.getState();
  const p = s.project;
  const floor = p.layers.find((l) => l.role === 'floor');
  const gid = floorGid();
  if (!floor || !gid) return;
  const w = Math.min(11, p.map.width - 6);
  const h = Math.min(8, p.map.height - 6);
  const x0 = Math.floor((p.map.width - w) / 2);
  const y0 = Math.floor((p.map.height - h) / 2);
  const cells: number[] = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) cells.push(y * p.map.width + x);
  s.setActiveLayer(floor.id);
  if (!s.beginStroke(floor.id)) return;
  s.strokeSet(cells, gid);
  applyAutoWalls(useProject.getState().strokeCells(), floor.id);
  useProject.getState().endStroke('Startraum');
  const e = useEditor.getState();
  e.selectTile(gid);
  e.setTool('hand');
  viewEvents.emit({ type: 'focus', x: x0 - 6, y: y0 - 5, w: w + 12, h: h + 10 });
}

export function BuildKitStart() {
  const manual = useProject((s) => s.project.mode === 'manual');
  // any floor tile = the user has started building
  const empty = useProject((s) => !s.project.layers.find((l) => l.role === 'floor')?.data.some(Boolean));
  const playtest = useEditor((s) => s.playtest);
  if (!manual || !empty || playtest) return null;
  return (
    <div className="buildkit-start" role="region" aria-label="Baukasten starten">
      <strong>Leere Map – Baukasten</strong>
      <p>Male Boden, um Räume und Wege anzulegen. Wände, Ecken und Fronten entstehen automatisch.</p>
      <div className="buildkit-actions">
        <button type="button" className="btn btn-primary" onClick={createStartRoom}>
          <Icon.Plus size={16} />
          <span>Startraum anlegen</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            const p = useProject.getState().project;
            const floor = p.layers.find((l) => l.role === 'floor');
            if (floor) useProject.getState().setActiveLayer(floor.id);
            const gid = floorGid();
            if (gid) useEditor.getState().selectTile(gid);
            useEditor.getState().setTool('rect');
            useEditor.getState().toast('Rechteck-Werkzeug: auf der Map einen Raum aufziehen');
          }}
        >
          <Icon.Rect size={16} />
          <span>Raum aufziehen</span>
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            useProject.getState().setMode('generate');
            void useProject.getState().runGenerate();
          }}
        >
          <Icon.Spark size={16} />
          <span>Automatisch generieren</span>
        </button>
      </div>
    </div>
  );
}
