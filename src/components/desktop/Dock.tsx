import { useRef } from 'react';
import { IconButton } from '../ui';
import { Icon } from '../icons';
import { useLayout, type PanelId } from '../../store/layoutStore';

/** Collapse / maximize / close for a desktop panel – small and quiet. */
export function PanelActions({ id, label }: { id: PanelId; label: string }) {
  const collapsed = useLayout((s) => s.panels[id].collapsed);
  const maximized = useLayout((s) => s.maximized === id);
  const { toggleCollapsed, toggleMaximized, setClosed } = useLayout.getState();
  return (
    <div className="dock-actions">
      {!maximized && (
        <IconButton label={collapsed ? `${label} ausklappen` : `${label} einklappen`} onClick={() => toggleCollapsed(id)}>
          {collapsed ? <Icon.ChevronRight size={16} /> : <Icon.ChevronDown size={16} />}
        </IconButton>
      )}
      <IconButton label={maximized ? `${label} wiederherstellen` : `${label} maximieren`} active={maximized} onClick={() => toggleMaximized(id)}>
        {maximized ? <Icon.Restore size={16} /> : <Icon.Maximize size={16} />}
      </IconButton>
      <IconButton label={`${label} schließen`} onClick={() => setClosed(id, true)}>
        <Icon.Close size={16} />
      </IconButton>
    </div>
  );
}

/**
 * Drag handle that changes a size in px. `sign` = +1 when dragging right/down grows the size.
 * Double click resets to the default size.
 */
export function ResizeHandle({
  axis,
  value,
  sign,
  min,
  max,
  onChange,
  onReset,
  label,
  className = '',
}: {
  axis: 'x' | 'y';
  value: number;
  sign: 1 | -1;
  min: number;
  max: number;
  onChange: (v: number) => void;
  onReset: () => void;
  label: string;
  className?: string;
}) {
  const start = useRef<{ pos: number; value: number } | null>(null);
  const clamp = (v: number) => Math.round(Math.min(Math.max(v, min), Math.max(min, max)));
  return (
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={`${label} – ziehen zum Ändern, Doppelklick = Standardgröße`}
      className={`resize-handle is-${axis} ${className}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { pos: axis === 'x' ? e.clientX : e.clientY, value };
        document.body.classList.add(axis === 'x' ? 'is-resizing-x' : 'is-resizing-y');
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const d = (axis === 'x' ? e.clientX : e.clientY) - start.current.pos;
        onChange(clamp(start.current.value + sign * d));
      }}
      onPointerUp={() => {
        start.current = null;
        document.body.classList.remove('is-resizing-x', 'is-resizing-y');
      }}
      onPointerCancel={() => {
        start.current = null;
        document.body.classList.remove('is-resizing-x', 'is-resizing-y');
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        const grow = axis === 'x' ? (sign > 0 ? 'ArrowRight' : 'ArrowLeft') : sign > 0 ? 'ArrowDown' : 'ArrowUp';
        const shrink = axis === 'x' ? (sign > 0 ? 'ArrowLeft' : 'ArrowRight') : sign > 0 ? 'ArrowUp' : 'ArrowDown';
        if (e.key === grow) onChange(clamp(value + step));
        else if (e.key === shrink) onChange(clamp(value - step));
        else if (e.key === 'Home' || e.key === 'Enter') onReset();
        else return;
        e.preventDefault();
      }}
    />
  );
}
