import { useState } from 'react';
import { useProject } from '../store/projectStore';
import { useEditor } from '../store/editorStore';
import { viewEvents } from '../store/events';
import { IconButton } from '../components/ui';
import { Icon } from '../components/icons';
import { TOOLS } from './tools';
import type { ToolId } from '../types';
import { resolveGid } from '../tilesets/slicing';
import { TileThumb } from '../tilesets/TileThumb';
import { ObjectThumb } from '../objects/ObjectThumb';
import { rectCells } from './tools';
import { applyAutoWalls } from './autoWalls';

const TOOL_ICON: Record<ToolId, (p: { size?: number }) => React.ReactElement> = {
  brush: Icon.Brush,
  eraser: Icon.Eraser,
  fill: Icon.Fill,
  rect: Icon.Rect,
  pipette: Icon.Pipette,
  select: Icon.Select,
  move: Icon.Move,
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
  const eraseRect = useEditor((s) => s.eraseRect);
  const eraseAll = useEditor((s) => s.eraseAllLayers);
  const setFlag = useEditor((s) => s.setFlag);
  const [more, setMore] = useState(false);
  if (tool !== 'brush' && tool !== 'eraser') return null;
  const rect = tool === 'eraser' && eraseRect;
  const big = !rect && ![1, 2, 3, 5].includes(size);
  return (
    <div className={`brush-size${more && !rect ? ' has-slider' : ''}`} role="radiogroup" aria-label={tool === 'eraser' ? 'Radierer' : 'Pinselgröße'}>
      {[1, 2, 3, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={!rect && size === n}
          className={!rect && size === n ? 'is-active' : ''}
          onClick={() => {
            setSize(n);
            if (tool === 'eraser') setFlag('eraseRect', false);
          }}
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        role="radio"
        aria-checked={big}
        aria-label="Größere Pinsel"
        title="Größe frei wählen (1–32)"
        className={`brush-more${big || (more && !rect) ? ' is-active' : ''}`}
        onClick={() => {
          if (tool === 'eraser') setFlag('eraseRect', false);
          setMore(!more || rect);
        }}
      >
        {big ? size : '…'}
      </button>
      {more && !rect && (
        <label className="brush-slider">
          <input type="range" min={1} max={32} value={size} aria-label="Pinselgröße" onChange={(e) => setSize(Number(e.target.value))} style={{ ['--pct' as string]: `${((size - 1) / 31) * 100}%` }} />
          <span>{size}×{size}</span>
        </label>
      )}
      {tool === 'eraser' && (
        <>
          <button type="button" role="radio" aria-checked={rect} aria-label="Rechteck radieren" title="Rechteck aufziehen und löschen" className={rect ? 'is-active' : ''} onClick={() => setFlag('eraseRect', true)}>
            <Icon.Rect size={16} />
          </button>
          {rect && (
            <button
              type="button"
              aria-pressed={eraseAll}
              title="Alle Layer inklusive Objekte löschen (sonst nur der aktive Layer)"
              className={`brush-all${eraseAll ? ' is-active' : ''}`}
              onClick={() => setFlag('eraseAllLayers', !eraseAll)}
            >
              Alle Layer
            </button>
          )}
        </>
      )}
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

export function ViewControls({ onSettings, settingsOpen }: { onSettings?: () => void; settingsOpen?: boolean }) {
  const showGrid = useEditor((s) => s.showGrid);
  const showCoords = useEditor((s) => s.showCoords);
  const zoom = useEditor((s) => s.zoom);
  const tileSize = useProject((s) => s.project.map.tileSize);
  const showCollision = useEditor((s) => s.showCollision);
  const { toggleGrid, toggleCoords, setFlag } = useEditor.getState();
  return (
    <div className="view-controls">
      <CollisionToggle active={showCollision} onToggle={() => setFlag('showCollision', !showCollision)} />
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
      {onSettings && (
        <>
          <span className="divider" />
          <IconButton label="Einstellungen" active={settingsOpen} onClick={onSettings}>
            <Icon.Gear size={18} />
          </IconButton>
        </>
      )}
    </div>
  );
}

/** Collision overlay: blocked cells red (walls, water, lava, obstacles). */
export function CollisionToggle({ active, onToggle, size = 18 }: { active: boolean; onToggle: () => void; size?: number }) {
  return (
    <IconButton label="Kollisionen anzeigen" title="Kollisionen anzeigen – nicht begehbare Felder rot" active={active} onClick={onToggle}>
      <Icon.Collision size={size} />
    </IconButton>
  );
}

/** Currently selected tile + active layer – tap opens the tiles panel on mobile. */
export function ActiveTileChip({ onClick }: { onClick?: () => void }) {
  const gid = useEditor((s) => s.selectedGid);
  const tilesets = useProject((s) => s.project.tilesets);
  const layer = useProject((s) => s.project.layers.find((l) => l.id === s.project.activeLayerId));
  const r = resolveGid(tilesets, gid);
  const obj = useEditor((s) => s.selectedObject);
  return (
    <button type="button" className="active-tile" onClick={onClick} title="Aktives Tile und Layer">
      {obj ? <ObjectThumb type={obj} size={28} /> : r ? <TileThumb ts={r.ts} index={r.index} size={28} /> : <span className="tile-thumb is-empty" />}
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
    if (useEditor.getState().autoWalls) applyAutoWalls(s.strokeCells(), layer.id);
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
