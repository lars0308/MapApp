import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../components/icons';

export type SheetSnap = 'collapsed' | 'half' | 'full';

const COLLAPSED = 72;
const LANDSCAPE = '(orientation: landscape) and (max-height: 540px)';

function navHeight(): number {
  return document.querySelector('.m-nav')?.getBoundingClientRect().height ?? 62;
}
function topInset(): number {
  return document.querySelector('.m-top')?.getBoundingClientRect().top ?? 0;
}

/** Pixel height of each snap point for the current viewport. */
function snapHeights() {
  const avail = window.innerHeight - navHeight();
  return {
    collapsed: COLLAPSED,
    half: Math.round(avail * 0.56),
    full: Math.round(avail - topInset() - 10),
  };
}

/**
 * Mobile bottom sheet with three states.
 * - collapsed / half: the map shrinks above the sheet (a spacer keeps the layout in flow)
 * - full: the sheet rises almost to the top; a backdrop blocks the map behind it
 * Drag the grip or the header to resize; release snaps to the nearest state,
 * dragging below the collapsed height closes the sheet.
 */
export function BottomSheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [snap, setSnap] = useState<SheetSnap>('half');
  const [dragH, setDragH] = useState<number | null>(null);
  const [heights, setHeights] = useState(snapHeights);
  const drag = useRef<{ y: number; h: number; moved: boolean } | null>(null);

  useEffect(() => {
    setSnap('half');
  }, [title]);
  useEffect(() => {
    const onResize = () => setHeights(snapHeights());
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const height = dragH ?? heights[snap];
  const overlay = snap === 'full' || (dragH !== null && dragH > heights.half);

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    // landscape phones show the sheet as a fixed side panel
    if (window.matchMedia(LANDSCAPE).matches) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, h: heights[snap], moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.y - e.clientY;
    if (Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setDragH(Math.max(24, Math.min(heights.full, d.h + dy)));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      // tap on grip/header: cycle collapsed → half → full → half
      setSnap(snap === 'full' ? 'half' : snap === 'half' ? 'full' : 'half');
      return;
    }
    const h = dragH ?? d.h;
    setDragH(null);
    if (h < COLLAPSED * 0.6) {
      onClose();
      return;
    }
    const order: SheetSnap[] = ['collapsed', 'half', 'full'];
    let best: SheetSnap = 'half';
    let bd = Infinity;
    for (const s of order) {
      const dist = Math.abs(heights[s] - h);
      if (dist < bd) {
        bd = dist;
        best = s;
      }
    }
    setSnap(best);
  };

  const dragProps = { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp };

  return (
    <>
      {/* keeps the map area above the sheet visible in collapsed / half state */}
      <div className="sheet-spacer" style={{ height: Math.min(height, heights.half) }} aria-hidden="true" />
      {overlay && <div className="sheet-backdrop" onClick={() => setSnap('half')} aria-hidden="true" />}
      <section
        className={`sheet sheet-${snap}${dragH !== null ? ' is-dragging' : ''}`}
        style={{ height }}
        aria-label={title}
        role={overlay ? 'dialog' : 'region'}
        aria-modal={overlay || undefined}
      >
        <div className="sheet-grip" {...dragProps}>
          <span className="grip-bar" />
        </div>
        <header className="sheet-head" {...dragProps}>
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-btn sheet-max"
            aria-label={snap === 'full' ? 'Verkleinern' : 'Vollständig öffnen'}
            onClick={() => setSnap(snap === 'full' ? 'half' : 'full')}
          >
            {snap === 'full' ? <Icon.Down size={20} /> : <Icon.Up size={20} />}
          </button>
          <button type="button" className="icon-btn" aria-label="Schließen" onClick={onClose}>
            <Icon.Close size={20} />
          </button>
        </header>
        <div className="sheet-body" hidden={snap === 'collapsed' && dragH === null}>
          {children}
        </div>
        {footer && !(snap === 'collapsed' && dragH === null) && <footer className="sheet-foot">{footer}</footer>}
      </section>
    </>
  );
}
