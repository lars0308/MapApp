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
import { applyAutoEdges, applyAutoWalls } from './autoWalls';
import { copySelection, stampFromSelection, transformClip } from './clipboard';
import { describeTransform, mirrorH, rotateCW, withTransform } from '../tilesets/gid';

const TOOL_ICON: Record<ToolId, (p: { size?: number }) => React.ReactElement> = {
  brush: Icon.Brush,
  eraser: Icon.Eraser,
  fill: Icon.Fill,
  rect: Icon.Rect,
  pipette: Icon.Pipette,
  select: Icon.Select,
  move: Icon.Move,
  stamp: Icon.Stamp,
  hand: Icon.Hand,
};

export function ToolButtons({ withKeys }: { withKeys?: boolean }) {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const autoWalls = useEditor((s) => s.autoWalls);
  const setFlag = useEditor((s) => s.setFlag);
  const toast = useEditor((s) => s.toast);
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
      <span className="tool-sep" aria-hidden="true" />
      <IconButton
        label={autoWalls ? 'Einzeln setzen: aus – Wände und Ränder passen sich beim Malen an' : 'Einzeln setzen: an – nur genau dieses Tile, nichts wird angepasst'}
        active={!autoWalls}
        onClick={() => {
          setFlag('autoWalls', !autoWalls);
          // "manually insert a single tile": pick the pencil right away
          if (autoWalls && tool !== 'brush') setTool('brush');
          toast(autoWalls ? 'Einzeln setzen: das gewählte Tile kommt genau dorthin, wo du tippst – Wände und Ränder werden nicht angepasst' : 'Auto-Wände wieder an: Boden malen setzt Wände, Ecken und Ränder automatisch');
        }}
      >
        <Icon.Crosshair size={20} />
      </IconButton>
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

/** CSS for a thumbnail of a turned / mirrored tile */
export function turnStyle(t: number): React.CSSProperties | undefined {
  if (!t) return undefined;
  const { deg, mirrored } = describeTransform(t);
  return { transform: `rotate(${deg}deg)${mirrored ? ' scaleX(-1)' : ''}` };
}

/** turn / mirror the tile being painted – or the whole stamp */
export function TileTurn() {
  const tool = useEditor((s) => s.tool);
  const turn = useEditor((s) => s.tileTurn);
  const obj = useEditor((s) => s.selectedObject);
  const gid = useEditor((s) => s.selectedGid);
  const clip = useEditor((s) => s.clipboard);
  const stamp = tool === 'stamp' && !!clip;
  if (!stamp && (!(tool === 'brush' || tool === 'rect' || tool === 'fill') || obj || !gid)) return null;
  const e = useEditor.getState();
  const apply = (op: 'rotate' | 'mirror') => {
    if (stamp) e.setClipboard(transformClip(clip!, op));
    else e.setTileTurn(op === 'rotate' ? rotateCW(turn) : mirrorH(turn));
  };
  const { deg, mirrored } = describeTransform(turn);
  const what = stamp ? 'Stempel' : 'Tile';
  return (
    <div className="brush-size tile-turn" role="group" aria-label={`${what} drehen / spiegeln`}>
      <button type="button" title={`${what} 90° drehen`} aria-label={`${what} drehen`} className={!stamp && deg ? 'is-active' : ''} onClick={() => apply('rotate')}>
        <Icon.Rotate size={16} />
      </button>
      <button type="button" title={`${what} spiegeln (links ↔ rechts)`} aria-label={`${what} spiegeln`} className={!stamp && mirrored ? 'is-active' : ''} onClick={() => apply('mirror')}>
        <Icon.Mirror size={16} />
      </button>
      {!stamp && turn !== 0 && (
        <button type="button" title="Zurück auf normal" aria-label="Drehung zurücksetzen" onClick={() => e.setTileTurn(0)}>
          {deg ? `${deg}°` : '0°'}
          {mirrored ? '⇋' : ''}
        </button>
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
      <MinimapToggle size={18} />
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

/** overview map on / off */
export function MinimapToggle({ size = 18 }: { size?: number }) {
  const on = useEditor((s) => s.showMinimap);
  return (
    <IconButton label="Übersichtskarte" title="Übersichtskarte ein / aus – antippen springt dorthin" active={on} onClick={() => useEditor.getState().toggleMinimap()}>
      <Icon.Minimap size={size} />
    </IconButton>
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
  const turn = useEditor((s) => s.tileTurn);
  return (
    <button type="button" className="active-tile" onClick={onClick} title="Aktives Tile und Layer">
      {obj ? (
        <ObjectThumb type={obj} size={28} />
      ) : r ? (
        <span style={turnStyle(turn)} className="turn-wrap">
          <TileThumb ts={r.ts} index={r.index} size={28} />
        </span>
      ) : (
        <span className="tile-thumb is-empty" />
      )}
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
  const clip = useEditor((s) => s.clipboard);
  if (tool === 'stamp')
    return (
      <div className="selection-bar stamp-bar">
        {clip ? (
          <span className="muted">
            Stempel {clip.w}×{clip.h} – auf die Karte tippen oder ziehen und loslassen
          </span>
        ) : (
          <span className="muted">Erst mit „Auswahl“ einen Bereich markieren, dann „Stempel“</span>
        )}
        <button type="button" className="btn btn-secondary" onClick={() => useEditor.getState().setTool('select')}>
          Neu auswählen
        </button>
      </div>
    );
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
    if (useEditor.getState().autoWalls) {
      applyAutoEdges(s.strokeCells(), layer.id);
      applyAutoWalls(s.strokeCells(), layer.id);
    }
    s.endStroke(label);
  };
  const gid = withTransform(useEditor.getState().selectedGid, useEditor.getState().tileTurn);
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
      <IconButton label="Kopieren (Strg+C)" onClick={() => copySelection()}>
        <Icon.Copy size={18} />
      </IconButton>
      <IconButton label="Ausschneiden (Strg+X) – alle Layer" onClick={() => copySelection(true)}>
        <Icon.Scissors size={18} />
      </IconButton>
      <button type="button" className="btn btn-primary" title="Kopieren und mit dem Stempel woanders einsetzen" onClick={stampFromSelection}>
        <Icon.Stamp size={16} /> Stempel
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
