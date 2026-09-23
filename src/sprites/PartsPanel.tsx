import { useEffect, useMemo, useRef, useState } from 'react';
import { DEMO_PARTS, SLOTS, fitContext, paintPart, toPng, useSprites } from './store';
import type { DemoPart, FitContext, SpriteKind, UserPart } from './types';
import type { Ramps } from './palette';
import { Icon } from '../components/icons';
import { IconButton } from '../components/ui';

const thumbCache = new Map<string, string>();

function demoThumb(part: DemoPart, ctx: FitContext, ramps: Ramps): string {
  const key = `${part.id}|${JSON.stringify(ctx)}|${JSON.stringify(ramps)}`;
  let url = thumbCache.get(key);
  if (!url) {
    url = toPng(paintPart(part, ctx, ramps, 32), 32);
    if (thumbCache.size > 600) thumbCache.clear();
    thumbCache.set(key, url);
  }
  return url;
}

type AnyPart = DemoPart | UserPart;

/**
 * Drag a part onto the canvas (mouse: just drag; touch: hold briefly, then drag) –
 * or simply tap it. The part snaps to its place (hair on the head, sword in the hand …).
 */
function useDragToCanvas(kind: SpriteKind) {
  const [ghost, setGhost] = useState<{ x: number; y: number; src: string; over: boolean } | null>(null);
  const place = useSprites((s) => s.placePart);
  const start = (e: React.PointerEvent, part: AnyPart, src: string) => {
    if (e.button !== 0) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const touch = e.pointerType !== 'mouse';
    let dragging = false;
    let moved = false;
    const el = e.currentTarget as HTMLElement;
    const overCanvas = (x: number, y: number) => !!document.elementFromPoint(x, y)?.closest(`[data-sprite-drop="${kind}"]`);
    const begin = (x: number, y: number) => {
      dragging = true;
      document.body.classList.add('is-part-dragging');
      setGhost({ x, y, src, over: overCanvas(x, y) });
    };
    const hold = touch ? setTimeout(() => !moved && begin(x0, y0), 280) : null;
    const preventScroll = (ev: TouchEvent) => dragging && ev.preventDefault();
    const move = (ev: PointerEvent) => {
      const far = Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6;
      if (!dragging && far) {
        moved = true;
        if (!touch) begin(ev.clientX, ev.clientY);
        else if (hold) clearTimeout(hold);
      }
      if (dragging) setGhost({ x: ev.clientX, y: ev.clientY, src, over: overCanvas(ev.clientX, ev.clientY) });
    };
    const end = (ev: PointerEvent) => {
      if (hold) clearTimeout(hold);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('touchmove', preventScroll);
      document.body.classList.remove('is-part-dragging');
      setGhost(null);
      if (dragging ? overCanvas(ev.clientX, ev.clientY) : !moved) void place(kind, part);
    };
    const cancel = () => {
      if (hold) clearTimeout(hold);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('touchmove', preventScroll);
      document.body.classList.remove('is-part-dragging');
      setGhost(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('touchmove', preventScroll, { passive: false });
    void el;
  };
  return { ghost, start };
}

export function PartsPanel({ kind }: { kind: SpriteKind }) {
  const slots = SLOTS[kind];
  const [slot, setSlot] = useState(slots.find((s) => s.id === (kind === 'character' ? 'hair' : kind === 'creature' ? 'body' : 'base'))!.id);
  const doc = useSprites((s) => s[kind].doc);
  const locks = useSprites((s) => s[kind].locks);
  const userParts = useSprites((s) => s.userParts);
  const { toggleLock, removeLayer, deleteUserPart } = useSprites.getState();
  const ctx = useMemo(() => fitContext(doc), [doc]);
  const { ghost, start } = useDragToCanvas(kind);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const demo = DEMO_PARTS[kind].filter((p) => p.slot === slot);
  const own = userParts.filter((p) => p.kind === kind && p.slot === slot);
  const slotDef = slots.find((s) => s.id === slot) ?? slots[0];
  const layersOfSlot = doc.layers.filter((l) => l.slot === slot);
  const usedIds = new Set(doc.layers.map((l) => l.partId));

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [slot]);

  return (
    <div className="parts-panel">
      <div className="slot-chips" role="tablist" aria-label="Teile-Gruppen">
        {slots.map((s) => {
          const filled = doc.layers.some((l) => l.slot === s.id);
          return (
            <button key={s.id} type="button" role="tab" aria-selected={slot === s.id} className={`slot-chip${slot === s.id ? ' is-active' : ''}${filled ? ' is-filled' : ''}`} onClick={() => setSlot(s.id)}>
              {s.label}
              {locks[s.id] && <Icon.Lock size={11} />}
            </button>
          );
        })}
      </div>
      <div className="slot-head">
        <label className="slot-lock" title="Bei „Zufall“ nicht austauschen">
          <input type="checkbox" checked={!!locks[slot]} onChange={() => toggleLock(kind, slot)} />
          Bei Zufall behalten
        </label>
        {layersOfSlot.length > 0 && !slotDef.multi && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLayer(kind, layersOfSlot[0].id)}>
            Entfernen
          </button>
        )}
      </div>
      <p className="hint parts-hint">Teil auf die Figur ziehen oder antippen – es rastet an seiner Stelle ein.{slotDef.multi ? ' Mehrere möglich.' : ' Ersetzt das bisherige Teil.'}</p>
      <div className="parts-grid" ref={listRef}>
        {demo.map((p) => {
          const src = demoThumb(p, ctx, doc.ramps);
          return (
            <button
              key={p.id}
              type="button"
              className={`part-card${usedIds.has(p.id) ? ' is-used' : ''}`}
              title={p.label}
              onPointerDown={(e) => start(e, p, src)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), void useSprites.getState().placePart(kind, p))}
            >
              <img src={src} alt="" draggable={false} />
              <span>{p.label}</span>
            </button>
          );
        })}
        {own.map((p) => (
          <div key={p.id} className="part-card-wrap">
            <button type="button" className="part-card is-own" title={`${p.label} (eigenes Teil)`} onPointerDown={(e) => start(e, p, p.png)}>
              <img src={p.png} alt="" draggable={false} />
              <span>{p.label}</span>
            </button>
            {confirmDel === p.id ? (
              <button type="button" className="part-del is-confirm" onClick={() => (deleteUserPart(p.id), setConfirmDel(null))}>
                Löschen?
              </button>
            ) : (
              <IconButton label="Eigenes Teil löschen" className="part-del" onClick={() => setConfirmDel(p.id)}>
                <Icon.Trash size={14} />
              </IconButton>
            )}
          </div>
        ))}
        {!demo.length && !own.length && <p className="muted small parts-empty">Noch keine eigenen Teile. Zeichne etwas und speichere es mit „Als Teil speichern“ in dieser Gruppe.</p>}
      </div>
      {ghost && (
        <div className={`part-ghost${ghost.over ? ' is-over' : ''}`} style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          <img src={ghost.src} alt="" />
        </div>
      )}
    </div>
  );
}
