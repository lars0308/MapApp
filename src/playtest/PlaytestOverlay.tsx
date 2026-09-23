import { useRef, useState } from 'react';
import { useEditor } from '../store/editorStore';
import { useProject } from '../store/projectStore';
import { joystick, stopPlaytest } from './controller';
import { Icon } from '../components/icons';

/** Touch joystick (bottom left). Writes a normalised vector into `joystick`. */
function Joystick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);
  const R = 42;

  const update = (e: React.PointerEvent) => {
    const rect = baseRef.current!.getBoundingClientRect();
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    setKnob({ x: dx, y: dy });
    joystick.vx = dx / R;
    joystick.vy = dy / R;
  };
  const end = () => {
    active.current = null;
    setKnob({ x: 0, y: 0 });
    joystick.vx = 0;
    joystick.vy = 0;
  };
  return (
    <div
      ref={baseRef}
      className="joystick"
      aria-label="Joystick"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        active.current = e.pointerId;
        update(e);
      }}
      onPointerMove={(e) => active.current === e.pointerId && update(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

/** big jump button for side-scroller maps (bottom right) */
function JumpButton() {
  const set = (v: boolean) => (joystick.jump = v);
  return (
    <button
      type="button"
      className="jump-btn"
      aria-label="Springen"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      Springen
    </button>
  );
}

export function PlaytestOverlay({ touch }: { touch: boolean }) {
  const on = useEditor((s) => s.playtest);
  const side = useProject((s) => s.project.map.perspective === 'side_view');
  if (!on) return null;
  return (
    <>
      <div className="playtest-bar">
        <span className="playtest-dot" />
        <strong>Playtest</strong>
        <span className="muted playtest-hint">
          {side
            ? touch
              ? 'Joystick: laufen, hoch = Leiter · Knopf rechts: springen'
              : 'A/D laufen · W/Leertaste springen (lang = höher) · ↓ durch Plattformen · Esc'
            : touch
              ? 'Joystick links unten'
              : 'WASD / Pfeiltasten · Esc beendet'}
        </span>
        <button type="button" className="btn btn-primary playtest-stop" onClick={stopPlaytest}>
          <Icon.Close size={16} />
          <span>Playtest beenden</span>
        </button>
      </div>
      {touch && <Joystick />}
      {touch && side && <JumpButton />}
    </>
  );
}
