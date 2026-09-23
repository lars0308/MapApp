import { useProject } from '../store/projectStore';
import { useEditor } from '../store/editorStore';
import { viewEvents } from '../store/events';
import { IconButton } from '../components/ui';
import { Icon } from '../components/icons';
import { TOOLS } from './tools';
import type { ToolId } from '../types';
import { resolveGid } from '../tilesets/slicing';
import { TileThumb } from '../tilesets/TileThumb';
import { rectCells } from './tools';

const TOOL_ICON: Record<ToolId, (p: { size?: number }) => React.ReactElement> = {
  brush: Icon.Brush,
  eraser: Icon.Eraser,
  fill: Icon.Fill,
  rect: Icon.Rect,
  pipette: Icon.Pipette,
  select: Icon.Select,
  hand: Icon.Hand,
};

export function ToolButtons({ withKeys }: { withKeys?: boolean }) {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  return (
    <>
      {TOOLS.map((t) => {
        const I = TOOL_ICON[t.id];
        return (
          <IconButton key={t.id} label={withKeys ? `${t.label} (${t.key})` : t.label} active={tool === t.id} onClick={() => setTool(t.id)}>
            <I size={20} />
          </IconButton>
        );
      })}
    </>
  );
}

export function BrushSize() {
  const tool = useEditor((s) => s.tool);
  const size = useEditor((s) => s.brushSize);
  const setSize = useEditor((s) => s.setBrushSize);
  if (tool !== 'brush' && tool !== 'eraser') return null;
  return (
    <div className="brush-size" role="radiogroup" aria-label="Pinselgröße">
      {[1, 2, 3, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={size === n} className={size === n ? 'is-active' : ''} onClick={() => setSize(n)}>
          {n}
        </button>
      ))}
    </div>
  );
}

export function UndoRedo() {
  const canUndo = useProject((s) => s.canUndo);
  const canRedo = useProject((s) => s.canRedo);
  const { undo, redo } = useProject.getState();
  return (
    <>
      <IconButton label="Rückgängig" disabled={!canUndo} onClick={undo}>
        <Icon.Undo size={20} />
      </IconButton>
      <IconButton label="Wiederholen" disabled={!canRedo} onClick={redo}>
        <Icon.Redo size={20} />
      </IconButton>
    </>
  );
}

export function ViewControls() {
  const showGrid = useEditor((s) => s.showGrid);
  const showCoords = useEditor((s) => s.showCoords);
  const zoom = useEditor((s) => s.zoom);
  const tileSize = useProject((s) => s.project.map.tileSize);
  const { toggleGrid, toggleCoords } = useEditor.getState();
  return (
    <div className="view-controls">
      <IconButton label="Raster" active={showGrid} onClick={toggleGrid}>
        <Icon.Grid size={18} />
      </IconButton>
      <IconButton label="Koordinaten" active={showCoords} onClick={toggleCoords}>
        <Icon.Crosshair size={18} />
      </IconButton>
      <span className="divider" />
      <IconButton label="Verkleinern" onClick={() => viewEvents.emit({ type: 'zoom', factor: 1 / 1.4 })}>
        <Icon.Minus size={18} />
      </IconButton>
      <button type="button" className="zoom-label" title="Einpassen" onClick={() => viewEvents.emit({ type: 'fit' })}>
        {Math.round((zoom / tileSize) * 100)} %
      </button>
      <IconButton label="Vergrößern" onClick={() => viewEvents.emit({ type: 'zoom', factor: 1.4 })}>
        <Icon.Plus size={18} />
      </IconButton>
      <IconButton label="Einpassen" onClick={() => viewEvents.emit({ type: 'fit' })}>
        <Icon.Fit size={18} />
      </IconButton>
    </div>
  );
}

/** Currently selected tile + active layer – tap opens the tiles panel on mobile. */
export function ActiveTileChip({ onClick }: { onClick?: () => void }) {
  const gid = useEditor((s) => s.selectedGid);
  const tilesets = useProject((s) => s.project.tilesets);
  const layer = useProject((s) => s.project.layers.find((l) => l.id === s.project.activeLayerId));
  const r = resolveGid(tilesets, gid);
  return (
    <button type="button" className="active-tile" onClick={onClick} title="Aktives Tile und Layer">
      {r ? <TileThumb ts={r.ts} index={r.index} size={28} /> : <span className="tile-thumb is-empty" />}
      <span className="active-tile-layer">
        <span className="layer-color" style={{ background: layer?.color }} />
        {layer?.name ?? '–'}
        {layer?.locked && <Icon.Lock size={12} />}
      </span>
    </button>
  );
}

export function SelectionActions() {
  const sel = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  if (!sel || tool !== 'select') return null;
  const apply = (gid: number, label: string) => {
    const s = useProject.getState();
    const p = s.project;
    const layer = p.layers.find((l) => l.id === p.activeLayerId);
    if (!layer) return;
    if (layer.locked) {
      useEditor.getState().toast(`Layer „${layer.name}“ ist gesperrt`, 'error');
      return;
    }
    if (!s.beginStroke(layer.id)) return;
    s.strokeSet(rectCells(sel, p.map.width), gid);
    s.endStroke(label);
  };
  const gid = useEditor.getState().selectedGid;
  return (
    <div className="selection-bar">
      <span className="muted">
        {sel.w}×{sel.h}
      </span>
      <button type="button" className="btn btn-secondary" disabled={!gid} onClick={() => apply(gid, 'Auswahl füllen')}>
        Füllen
      </button>
      <button type="button" className="btn btn-secondary" onClick={() => apply(0, 'Auswahl leeren')}>
        Leeren
      </button>
      <IconButton label="Auswahl aufheben" onClick={() => useEditor.getState().setSelection(null)}>
        <Icon.Close size={18} />
      </IconButton>
    </div>
  );
}

export function HoverInfo() {
  const hover = useEditor((s) => s.hoverCell);
  if (!hover) return null;
  return (
    <span className="hover-info mono">
      {hover.x}, {hover.y}
    </span>
  );
}
