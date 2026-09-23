import { useEffect, useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon } from './icons';
import { clamp } from '../utils/math';

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  icon,
  children,
  className = '',
  block,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; icon?: ReactNode; block?: boolean }) {
  return (
    <button type="button" className={`btn btn-${variant}${block ? ' btn-block' : ''} ${className}`} {...rest}>
      {icon}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({
  label,
  active,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      className={`icon-btn${active ? ' is-active' : ''} ${className}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Slider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  hint?: [string, string];
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  const commit = () => {
    const n = Number(draft.replace(',', '.'));
    const v = Number.isFinite(n) ? clamp(Math.round(n / step) * step, min, max) : value;
    setDraft(String(v));
    if (v !== value) onChange(v);
  };
  return (
    <div className="field slider-field">
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        <span className="slider-value">
          <input
            className="slider-num"
            inputMode="numeric"
            aria-label={`${label} Wert`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          {unit && <span className="slider-unit">{unit.trim()}</span>}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && (
        <div className="slider-hint">
          <span>{hint[0]}</span>
          <span>{hint[1]}</span>
        </div>
      )}
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}) {
  return (
    <label className="toggle">
      <span className="toggle-text">
        <span>{label}</span>
        {description && <small>{description}</small>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
    </label>
  );
}

export function Chip({
  active,
  children,
  onClick,
  color,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button type="button" className={`chip${active ? ' is-active' : ''}`} aria-pressed={active} onClick={onClick}>
      {color && <span className="chip-dot" style={{ background: color }} />}
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'is-active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Number input with large −/+ steppers for touch. Commits on blur / enter. */
export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  const commit = (v: number) => {
    const n = clamp(Number.isFinite(v) ? Math.round(v / step) * step : value, min, max);
    setDraft(String(n));
    if (n !== value) onChange(n);
  };
  return (
    <div className="field number-field">
      <label htmlFor={id}>{label}</label>
      <div className="stepper">
        <button type="button" aria-label={`${label} verringern`} onClick={() => commit(value - step)} disabled={value <= min}>
          <Icon.Minus size={16} />
        </button>
        <input
          id={id}
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(Number(draft))}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {suffix && <span className="stepper-suffix">{suffix}</span>}
        <button type="button" aria-label={`${label} erhöhen`} onClick={() => commit(value + step)} disabled={value >= max}>
          <Icon.Plus size={16} />
        </button>
      </div>
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Section({
  title,
  children,
  defaultOpen = true,
  aside,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  aside?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`section${open ? ' is-open' : ''}`}>
      <div className="section-head">
        <button type="button" className="section-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon.Down size={16} className="section-chevron" />
          <h3>{title}</h3>
        </button>
        {aside}
      </div>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

export function PanelTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="panel-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={t.value === value}
          className={t.value === value ? 'is-active' : ''}
          onClick={() => onChange(t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
