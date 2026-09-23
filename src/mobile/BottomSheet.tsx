import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../components/icons';

type Snap = 'half' | 'full';

/**
 * In-flow bottom sheet: the map above it shrinks instead of being covered,
 * so generation results stay visible while settings are changed.
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
  const [snap, setSnap] = useState<Snap>('half');
  const [dragH, setDragH] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; h: number } | null>(null);

  useEffect(() => setSnap('half'), [title]);

  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, h: ref.current!.getBoundingClientRect().height };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const h = drag.current.h + (drag.current.y - e.clientY);
    setDragH(Math.max(80, Math.min(window.innerHeight * 0.9, h)));
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const moved = Math.abs(e.clientY - drag.current.y);
    const h = dragH ?? drag.current.h;
    drag.current = null;
    setDragH(null);
    if (moved < 6) {
      setSnap(snap === 'half' ? 'full' : 'half');
      return;
    }
    const vh = window.innerHeight;
    if (h < vh * 0.22) onClose();
    else setSnap(h > vh * 0.62 ? 'full' : 'half');
  };

  return (
    <section
      ref={ref}
      className={`sheet sheet-${snap}${dragH !== null ? ' is-dragging' : ''}`}
      style={dragH !== null ? { height: dragH } : undefined}
      aria-label={title}
    >
      <div className="sheet-grip" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <span className="grip-bar" />
      </div>
      <header className="sheet-head">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" aria-label={snap === 'half' ? 'Vergrößern' : 'Verkleinern'} onClick={() => setSnap(snap === 'half' ? 'full' : 'half')}>
          {snap === 'half' ? <Icon.Up size={20} /> : <Icon.Down size={20} />}
        </button>
        <button type="button" className="icon-btn" aria-label="Schließen" onClick={onClose}>
          <Icon.Close size={20} />
        </button>
      </header>
      <div className="sheet-body">{children}</div>
      {footer && <footer className="sheet-foot">{footer}</footer>}
    </section>
  );
}
