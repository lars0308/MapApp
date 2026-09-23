import { useState } from 'react';
import { Icon } from './icons';

const key = (id: string) => `mapforge.help.${id}`;

/** Short "So geht's" card, shown until dismissed (per page, stored in the browser). */
export function HelpTip({ id, title, steps }: { id: string; title?: string; steps: React.ReactNode[] }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key(id)) !== 'done';
    } catch {
      return true;
    }
  });
  if (!open) return null;
  return (
    <div className="help-tip" role="note">
      <div className="help-tip-head">
        <strong>{title ?? "So geht's"}</strong>
        <button
          type="button"
          className="help-tip-close"
          aria-label="Hinweis schließen"
          onClick={() => {
            setOpen(false);
            try {
              localStorage.setItem(key(id), 'done');
            } catch {
              // ignore
            }
          }}
        >
          <Icon.Close size={16} />
          <span>Verstanden</span>
        </button>
      </div>
      <ol>
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </div>
  );
}
