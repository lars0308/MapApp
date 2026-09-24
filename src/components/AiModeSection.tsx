import { useState } from 'react';
import { Section, Segmented } from './ui';
import { aiMode, setAiMode, type AiMode } from '../api/agent';

/** Einstellungen → KI-Assistent: which Claude model builds (Vercel AI Gateway) */
export function AiModeSection() {
  const [mode, setMode] = useState<AiMode>(aiMode);
  return (
    <Section title="KI-Assistent">
      <Segmented
        label="KI-Modell"
        value={mode}
        onChange={(v) => {
          setMode(v);
          setAiMode(v);
        }}
        options={[
          { value: 'standard', label: 'Gründlich' },
          { value: 'sparsam', label: 'Sparsam' },
        ]}
      />
      <p className="hint">
        Gründlich (Claude Sonnet): bessere Karten und Tile-Zuordnung. Sparsam (Claude Haiku): etwa halb so teuer, einfacher. Nach jedem Bauen zeigt die App die tatsächlichen Kosten an.
      </p>
    </Section>
  );
}
