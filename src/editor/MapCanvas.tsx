import { useEffect, useRef } from 'react';
import { MapRenderer } from '../renderer/MapRenderer';
import { applyIso } from '../renderer/isoSetup';
import { useProject } from '../store/projectStore';
import { useEditor } from '../store/editorStore';
import { mapEvents, viewEvents } from '../store/events';
import { brushCells, floodCells, lineCells, rectCells, rectFromPoints } from './tools';
import { setRenderer } from './rendererRef';
import { computeBlocked } from './collision';
import { applyAutoEdges, applyAutoWalls } from './autoWalls';
import { pasteClip, stampOrigin } from './clipboard';
import { tileOf, transformOf, withTransform } from '../tilesets/gid';
import { objectDef } from '../objects/defs';
import { SIDE_THEMES, type MapObject, type Project } from '../types';
import { TilePools, tilesetSupports } from '../tilesets/tilePools';
import { Rng } from '../generator/rng';

/** Top-most object whose sprite covers the cell. */
export function objectAt(objects: MapObject[], x: number, y: number): MapObject | null {
  let best: MapObject | null = null;
  for (const o of objects) {
    const d = objectDef(o.type);
    if (!d) continue;
    if (x >= o.x && x < o.x + d.w && y <= o.y && y > o.y - d.h && (!best || o.y >= best.y)) best = o;
  }
  return best;
}

type Mode = 'none' | 'paint' | 'pan' | 'pinch' | 'rect' | 'select' | 'tap' | 'moveSel' | 'moveObj' | 'stamp';

interface Pt {
  x: number;
  y: number;
}

/** Picks the top-most visible tile at a cell (active layer first). */
export function pickTile(x: number, y: number): boolean {
  const { project, setActiveLayer } = useProject.getState();
  const i = y * project.map.width + x;
  const active = project.layers.find((l) => l.id === project.activeLayerId);
  let gid = active?.data[i] ?? 0;
  let layerId = active?.id;
  if (!gid) {
    for (let k = project.layers.length - 1; k >= 0; k--) {
      const l = project.layers[k];
      if (l.visible && l.data[i]) {
        gid = l.data[i];
        layerId = l.id;
        break;
      }
    }
  }
  if (!gid || !layerId) return false;
  setActiveLayer(layerId);
  // the pipette also takes over how the tile is turned
  useEditor.setState({ selectedGid: tileOf(gid), tileTurn: transformOf(gid), tool: 'brush' });
  return true;
}

export function MapCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);

  // renderer lifecycle & document sync
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const r = new MapRenderer(canvas);
    rendererRef.current = r;
    setRenderer(r);
    let zoomTimer = 0;
    r.onCameraChange = (cam) => {
      if (zoomTimer) return;
      zoomTimer = window.setTimeout(() => {
        zoomTimer = 0;
        useEditor.getState().setZoom(cam.zoom);
      }, 60);
    };

    const p = useProject.getState().project;
    r.setDocument(p.map.width, p.map.height, p.layers, p.tilesets);
    r.objects = p.objects;
    r.backdrop = backdropOf(p);
    r.hex = p.map.perspective === 'hex';
    applyIso(r, p);
    fitTileToPerspective(p);

    let fitted = false;
    const ro = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      r.resize(rect.width, rect.height);
      if (!fitted && rect.width > 0 && rect.height > 0) {
        fitted = true;
        r.fit();
      }
    });
    ro.observe(wrap);

    let prev = useProject.getState().project;
    const unsubProject = useProject.subscribe((s) => {
      const p = s.project;
      if (p === prev) return;
      const tilesetsChanged = p.tilesets !== prev.tilesets;
      const sizeChanged = p.map.width !== prev.map.width || p.map.height !== prev.map.height;
      const projectSwitched = p.id !== prev.id;
      if (p.layers !== prev.layers || tilesetsChanged || sizeChanged) {
        r.setDocument(p.map.width, p.map.height, p.layers, tilesetsChanged ? p.tilesets : null);
      }
      if (p.objects !== prev.objects) {
        r.objects = p.objects;
        r.requestRender();
      }
      if ((p.map.perspective === 'hex') !== r.hex) {
        r.hex = p.map.perspective === 'hex';
        r.fit();
      }
      if ((p.map.perspective === 'isometric') !== r.iso) {
        applyIso(r, p);
        r.fit();
      } else if (r.iso && (p.result !== prev.result || tilesetsChanged)) applyIso(r, p);
      if (p.map.perspective !== prev.map.perspective || projectSwitched) fitTileToPerspective(p);
      if (backdropOf(p) !== r.backdrop) {
        r.backdrop = backdropOf(p);
        r.requestRender();
      }
      if (sizeChanged || projectSwitched) r.fit();
      prev = p;
      if (useEditor.getState().showCollision) scheduleCollision();
    });
    // collision debug overlay (recomputed lazily)
    let colTimer = 0;
    const scheduleCollision = () => {
      clearTimeout(colTimer);
      colTimer = window.setTimeout(() => {
        r.overlay.collision = useEditor.getState().showCollision ? computeBlocked(useProject.getState().project) : null;
        r.requestRender();
      }, 80);
    };
    const unsubMap = mapEvents.on((e) => {
      if (e.type === 'all') r.invalidateAll();
      else r.invalidateCells(e.cells);
      if (useEditor.getState().showCollision) scheduleCollision();
    });
    const unsubView = viewEvents.on((e) => {
      if (e.type === 'fit') r.fit();
      else if (e.type === 'zoom') r.zoomAt(r.viewW / 2, r.viewH / 2, e.factor);
      else if (e.type === 'focus') {
        r.focus(e.x, e.y, e.w, e.h);
        if (e.w && e.h) {
          r.overlay.highlight = { x: e.x, y: e.y, w: e.w, h: e.h };
          window.setTimeout(() => {
            r.overlay.highlight = null;
            r.requestRender();
          }, 2200);
        }
      }
    });

    const syncOverlay = () => {
      const e = useEditor.getState();
      r.overlay.showGrid = e.showGrid;
      r.overlay.showCoords = e.showCoords;
      r.overlay.selection = e.selection;
      r.overlay.brushSize = e.brushSize;
      r.overlay.activeTool = e.playtest ? 'hand' : e.tool;
      r.overlay.showSortPoints = e.showSortPoints;
      if (e.tool !== 'stamp' || !e.clipboard || e.playtest) r.overlay.stamp = null;
      else if (r.overlay.stamp && r.overlay.stamp.clip !== e.clipboard) r.overlay.stamp = { ...r.overlay.stamp, clip: e.clipboard };
      if (e.showCollision !== !!r.overlay.collision) scheduleCollision();
      r.requestRender();
    };
    syncOverlay();
    const unsubEditor = useEditor.subscribe(syncOverlay);

    return () => {
      ro.disconnect();
      unsubProject();
      unsubMap();
      unsubView();
      unsubEditor();
      r.destroy();
      setRenderer(null);
      clearTimeout(zoomTimer);
      clearTimeout(colTimer);
    };
  }, []);

  // pointer / touch / wheel input
  useEffect(() => {
    const canvas = canvasRef.current!;
    const pointers = new Map<number, Pt>();
    let mode: Mode = 'none';
    let modeStart = 0;
    let lastCell: Pt | null = null;
    let anchor: Pt | null = null;
    let downPos: Pt | null = null;
    let pinch: { dist: number; center: Pt } | null = null;
    let spaceDown = false;
    let movingObject: MapObject | null = null;
    let moveDelta: Pt = { x: 0, y: 0 };

    const R = () => rendererRef.current!;
    const local = (e: PointerEvent | WheelEvent): Pt => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const editor = () => useEditor.getState();
    const store = () => useProject.getState();
    const dims = () => store().project.map;

    const setHover = (c: Pt | null) => {
      R().overlay.hover = c;
      // stamp: the copy follows the pointer (its middle under the pointer)
      const { tool, clipboard, playtest } = editor();
      R().overlay.stamp = c && tool === 'stamp' && clipboard && !playtest ? { clip: clipboard, ...stampOrigin(clipboard, c.x, c.y, R().hex) } : null;
      R().requestRender();
      editor().setHover(c && R().inBounds(c.x, c.y) ? c : null);
    };

    const startStroke = (): boolean => {
      const p = store().project;
      const layer = p.layers.find((l) => l.id === p.activeLayerId);
      if (!layer) return false;
      if (layer.locked) {
        editor().toast(`Layer „${layer.name}“ ist gesperrt`, 'error');
        return false;
      }
      if (!layer.visible) editor().toast(`Layer „${layer.name}“ ist ausgeblendet`);
      return store().beginStroke(layer.id);
    };

    const paintAt = (c: Pt) => {
      const { tool, brushSize, selectedGid, tileTurn } = editor();
      const { width: W, height: H } = dims();
      const gid = tool === 'eraser' ? 0 : withTransform(selectedGid, tileTurn);
      const from = lastCell ?? c;
      const cells: number[] = [];
      for (const [x, y] of lineCells(from.x, from.y, c.x, c.y)) cells.push(...brushCells(x, y, brushSize, W, H));
      store().strokeSet(cells, gid);
      lastCell = c;
    };

    /** end a stroke; with "Auto-Wände" the walls around painted ground / doors are re-tiled */
    const finishStroke = (label: string) => {
      const s = store();
      applyAutoEdges(s.strokeCells(), s.project.activeLayerId);
      if (editor().autoWalls) applyAutoWalls(s.strokeCells(), s.project.activeLayerId);
      s.endStroke(label);
    };

    const endInteraction = () => {
      if (mode === 'paint') finishStroke(editor().tool === 'eraser' ? 'Radieren' : 'Malen');
      mode = 'none';
      lastCell = null;
      anchor = null;
      R().overlay.preview = null;
      R().requestRender();
    };

    const cancelInteraction = () => {
      if (mode === 'paint') {
        // a second finger shortly after the first → user wants to navigate, not paint
        if (performance.now() - modeStart < 350) store().cancelStroke();
        else finishStroke('Malen');
      }
      mode = 'none';
      lastCell = null;
      anchor = null;
      R().overlay.preview = null;
      R().requestRender();
    };

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const pt = local(e);
      pointers.set(e.pointerId, pt);

      if (pointers.size === 2) {
        cancelInteraction();
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
        mode = 'pinch';
        setHover(null);
        return;
      }
      if (pointers.size > 2) return;

      const { tool, selectedGid, selectedObject, playtest } = editor();
      const cell = R().screenToCell(pt.x, pt.y);
      downPos = pt;
      modeStart = performance.now();
      // playtest: the map is only navigated (pinch / wheel), the character is steered by keys / joystick
      if (playtest) {
        mode = 'none';
        return;
      }

      if (e.button === 1 || e.button === 2 || spaceDown || tool === 'hand') {
        mode = 'pan';
        canvas.style.cursor = 'grabbing';
        return;
      }
      if (e.pointerType !== 'mouse') setHover(cell);

      const objects = store().project.objects;
      if (tool === 'brush' && selectedObject) {
        const def = objectDef(selectedObject);
        if (def && R().inBounds(cell.x, cell.y)) store().addObject({ type: selectedObject, x: cell.x - Math.floor((def.w - 1) / 2), y: cell.y });
        mode = 'none';
        return;
      }
      if (tool === 'eraser' && !editor().eraseRect) {
        const hit = objectAt(objects, cell.x, cell.y);
        if (hit) {
          store().removeObject(hit.id);
          mode = 'none';
          return;
        }
      }
      if (tool === 'stamp') {
        if (!editor().clipboard) {
          editor().toast('Erst mit „Auswahl“ einen Bereich markieren und „Kopieren“ tippen');
          mode = 'none';
          return;
        }
        // finger / mouse down shows the copy, releasing sets it (drag to place it exactly)
        mode = 'stamp';
        setHover(cell);
        return;
      }
      if (tool === 'move') {
        const sel = editor().selection;
        if (sel && cell.x >= sel.x && cell.y >= sel.y && cell.x < sel.x + sel.w && cell.y < sel.y + sel.h) {
          mode = 'moveSel';
          anchor = cell;
          return;
        }
        const hit = objectAt(objects, cell.x, cell.y);
        if (hit) {
          mode = 'moveObj';
          movingObject = hit;
          anchor = cell;
          moveDelta = { x: 0, y: 0 };
          R().overlay.objectHighlight = hit.id;
          R().requestRender();
          return;
        }
        editor().toast('Auswahl oder Objekt ziehen');
        mode = 'none';
        return;
      }

      switch (tool) {
        case 'brush':
        case 'eraser':
          // rectangle eraser: drag an area, released = cleared
          if (tool === 'eraser' && editor().eraseRect) {
            mode = 'rect';
            anchor = cell;
            R().overlay.preview = rectFromPoints(cell, cell, dims().width, dims().height);
            R().requestRender();
            break;
          }
          if (tool === 'brush' && !selectedGid) {
            editor().toast('Zuerst ein Tile auswählen');
            mode = 'none';
            return;
          }
          if (!startStroke()) {
            mode = 'none';
            return;
          }
          mode = 'paint';
          lastCell = null;
          paintAt(cell);
          break;
        case 'rect':
        case 'select':
          mode = tool;
          anchor = cell;
          R().overlay.preview = tool === 'rect' ? rectFromPoints(cell, cell, dims().width, dims().height) : null;
          if (tool === 'select') editor().setSelection(rectFromPoints(cell, cell, dims().width, dims().height));
          R().requestRender();
          break;
        default:
          mode = 'tap';
      }
    };

    const onMove = (e: PointerEvent) => {
      const pt = local(e);
      if (!pointers.has(e.pointerId)) {
        if (e.pointerType === 'mouse') setHover(R().screenToCell(pt.x, pt.y));
        return;
      }
      const prevPt = pointers.get(e.pointerId)!;
      pointers.set(e.pointerId, pt);

      if (mode === 'pinch' && pointers.size >= 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        R().panBy(center.x - pinch.center.x, center.y - pinch.center.y);
        if (pinch.dist > 10) R().zoomAt(center.x, center.y, dist / pinch.dist);
        pinch = { dist, center };
        return;
      }
      if (mode === 'pan') {
        R().panBy(pt.x - prevPt.x, pt.y - prevPt.y);
        return;
      }
      const cell = R().screenToCell(pt.x, pt.y);
      setHover(cell);
      const { width: W, height: H } = dims();
      if (mode === 'paint') {
        if (!lastCell || lastCell.x !== cell.x || lastCell.y !== cell.y) paintAt(cell);
      } else if (mode === 'rect' && anchor) {
        R().overlay.preview = rectFromPoints(anchor, cell, W, H);
        R().requestRender();
      } else if (mode === 'select' && anchor) {
        editor().setSelection(rectFromPoints(anchor, cell, W, H));
      } else if (mode === 'moveSel' && anchor) {
        const sel = editor().selection!;
        R().overlay.preview = { x: sel.x + cell.x - anchor.x, y: sel.y + cell.y - anchor.y, w: sel.w, h: sel.h };
        R().requestRender();
      } else if (mode === 'moveObj' && anchor && movingObject) {
        moveDelta = { x: cell.x - anchor.x, y: cell.y - anchor.y };
        const mo = movingObject;
        R().objects = store().project.objects.map((o) => (o.id === mo.id ? { ...o, x: mo.x + moveDelta.x, y: mo.y + moveDelta.y } : o));
        R().requestRender();
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const pt = local(e);
      pointers.delete(e.pointerId);
      if (mode === 'pinch') {
        if (pointers.size === 0) mode = 'none';
        return;
      }
      canvas.style.cursor = '';
      const cell = R().screenToCell(pt.x, pt.y);
      const { width: W, height: H } = dims();
      const { tool, selectedGid } = editor();

      if (mode === 'stamp') {
        const clip = editor().clipboard;
        if (clip && Math.abs(cell.x) < W * 4) {
          const o = stampOrigin(clip, cell.x, cell.y, R().hex);
          // at least a corner of the copy must be on the map
          if (o.x + clip.w > 0 && o.y + clip.h > 0 && o.x < W && o.y < H) {
            const n = pasteClip(clip, o.x, o.y);
            if (!n) editor().toast('Hier ist schon genau das');
          }
        }
      } else if (mode === 'moveObj' && movingObject) {
        if (moveDelta.x || moveDelta.y) store().moveObject(movingObject.id, movingObject.x + moveDelta.x, movingObject.y + moveDelta.y);
        R().objects = store().project.objects;
        R().overlay.objectHighlight = null;
        movingObject = null;
      } else if (mode === 'moveSel' && anchor) {
        const sel = editor().selection!;
        const dx = cell.x - anchor.x;
        const dy = cell.y - anchor.y;
        if ((dx || dy) && startStroke()) {
          const p = store().project;
          const layer = p.layers.find((l) => l.id === p.activeLayerId)!;
          const src = rectCells(sel, W);
          const values = src.map((i) => layer.data[i]);
          store().strokeSet(src, 0);
          const dst: number[] = [];
          const vals: number[] = [];
          src.forEach((i, k) => {
            const x = (i % W) + dx;
            const y = Math.floor(i / W) + dy;
            if (x >= 0 && y >= 0 && x < W && y < H) {
              dst.push(y * W + x);
              vals.push(values[k]);
            }
          });
          store().strokeSetLayer(layer.id, dst, vals);
          store().endStroke('Verschieben');
          editor().setSelection(rectFromPoints({ x: sel.x + dx, y: sel.y + dy }, { x: sel.x + dx + sel.w - 1, y: sel.y + dy + sel.h - 1 }, W, H));
        }
      } else if (mode === 'rect' && anchor && tool === 'eraser') {
        const r = rectFromPoints(anchor, cell, W, H);
        if (r.w > 0 && r.h > 0) {
          if (editor().eraseAllLayers) {
            const n = store().clearArea(r);
            editor().toast(n ? `${r.w} × ${r.h} Felder auf allen Layern gelöscht` : 'Bereich war schon leer');
          } else if (startStroke()) {
            store().strokeSet(rectCells(r, W), 0);
            finishStroke('Radieren');
          }
        }
      } else if (mode === 'rect' && anchor) {
        const r = rectFromPoints(anchor, cell, W, H);
        if (!selectedGid) editor().toast('Zuerst ein Tile auswählen');
        else if (r.w > 0 && r.h > 0 && startStroke()) {
          store().strokeSet(rectCells(r, W), withTransform(selectedGid, editor().tileTurn));
          finishStroke('Rechteck');
        }
      } else if (mode === 'select' && anchor) {
        const r = rectFromPoints(anchor, cell, W, H);
        editor().setSelection(r.w > 0 && r.h > 0 ? r : null);
      } else if (mode === 'tap' && downPos && Math.hypot(pt.x - downPos.x, pt.y - downPos.y) < 12 && R().inBounds(cell.x, cell.y)) {
        if (tool === 'fill') {
          if (!selectedGid) editor().toast('Zuerst ein Tile auswählen');
          else if (startStroke()) {
            const p = store().project;
            const layer = p.layers.find((l) => l.id === p.activeLayerId)!;
            store().strokeSet(floodCells(layer.data, W, H, cell.x, cell.y, editor().selection), withTransform(selectedGid, editor().tileTurn));
            finishStroke('Füllen');
          }
        } else if (tool === 'pipette') {
          if (pickTile(cell.x, cell.y)) editor().toast('Tile übernommen');
          else editor().toast('Kein Tile an dieser Stelle');
        }
      }
      endInteraction();
      if (e.pointerType !== 'mouse') setHover(null);
    };

    const onCancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (mode !== 'pinch') cancelInteraction();
      if (pointers.size === 0) mode = 'none';
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const pt = local(e);
      if (e.shiftKey && !e.ctrlKey) {
        R().panBy(-e.deltaY, 0);
        return;
      }
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const factor = Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0022));
      R().zoomAt(pt.x, pt.y, factor);
    };

    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && !pointers.size) setHover(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        spaceDown = e.type === 'keydown';
        canvas.style.cursor = spaceDown ? 'grab' : '';
        if (spaceDown) e.preventDefault();
      }
    };
    const noMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', noMenu);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', noMenu);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, []);

  const tool = useEditor((s) => s.tool);
  return (
    <div ref={wrapRef} className="map-canvas" data-tool={tool}>
      <canvas ref={canvasRef} aria-label="Map" />
    </div>
  );
}

/** side-scroller maps get a sky (outside) or a dark cave behind the tiles */
function backdropOf(p: Project): MapRenderer['backdrop'] {
  if (p.map.perspective !== 'side_view') return 'plain';
  return (SIDE_THEMES[p.generator.side?.style ?? 'outdoor'] ?? SIDE_THEMES.outdoor).backdrop;
}

/** the selected tile should belong to the map's view (grass hex, grass ground, floor) */
function fitTileToPerspective(p: Project) {
  const e = useEditor.getState();
  const persp = p.map.perspective;
  const ts = p.tilesets.find((t) => e.selectedGid >= t.firstGid && e.selectedGid < t.firstGid + t.columns * t.rows);
  if (ts && ts.active && tilesetSupports(ts, persp) && (ts.perspectives?.length || persp !== 'hex')) return;
  const pools = new TilePools(p.tilesets, persp);
  const rng = new Rng(1);
  const gid = persp === 'hex' ? pools.pickTagged(rng, 'floor', 'grass') : persp === 'side_view' ? pools.pickRole(rng, 'ground_top', ['side', 'grass']) : pools.pickPref(rng, ['floor']);
  if (gid) useEditor.setState({ selectedGid: gid });
}
