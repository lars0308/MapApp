import { useState } from 'react';
import type { SpriteKind } from './types';
import { Button } from '../components/ui';
import { Icon } from '../components/icons';
import { useEditor } from '../store/editorStore';
import { useProject } from '../store/projectStore';
import { formatCost, runAgent, useAgent } from '../api/agent';
import { styleHint } from '../api/describe';

const EXAMPLES: Record<SpriteKind, string[]> = {
  character: ['An den Stil meiner Karte anpassen', 'Details und Schattierung verbessern', 'Roten Umhang und Krone dazu', 'Als Ork-Krieger umgestalten'],
  creature: ['An den Stil meiner Karte anpassen', 'Details und Schattierung verbessern', 'Gefährlicher aussehen lassen', 'Als Eis-Variante umfärben'],
  object: ['An den Stil meiner Karte anpassen', 'Details und Schattierung verbessern', 'Goldbeschläge dazu', 'Älter und verwittert aussehen lassen'],
};

/** Figure builder → "KI": the AI works on the open figure (draw, animate, restyle) – live, stoppable */
export function FigureAiPanel({ kind }: { kind: SpriteKind }) {
  const toast = useEditor((s) => s.toast);
  const running = useAgent((s) => s.running);
  const [wish, setWish] = useState('');
  const go = async () => {
    if (!wish.trim()) return toast('Schreib kurz, was die KI machen soll', 'error');
    const ref = useProject.getState().project.reference;
    const task = [
      `Arbeite an der Figur, die gerade im Baukasten offen ist (kind "${kind}"). Wunsch des Nutzers: ${wish.trim()}`,
      'Ändere diese Figur (kein figure_new, außer der Nutzer will eine neue). Lies zuerst figure_status und figure_render.',
      /stil|karte|passend/i.test(wish) ? 'Für den Stil: style_colors lesen und Farben, Umriss und Pixelgröße übernehmen.' : '',
      styleHint(),
      'Prüfe das Ergebnis mit figure_render. Zum Schluss figure_save.',
    ].filter(Boolean).join('\n');
    try {
      const r = await runAgent(task, ref?.image ? [{ label: 'Referenzbild des Projekts', dataUrl: ref.image }] : [], { focus: 'figures' });
      toast(`${r.text || 'Fertig'} (KI-Kosten ${formatCost(r.cost)})`, 'success');
      setWish('');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Das hat nicht geklappt', 'error');
    }
  };
  return (
    <div className="figure-ai">
      <p className="hint">Die KI arbeitet an der offenen Figur: Details zeichnen, umgestalten, an den Stil deiner Karte anpassen. Du siehst jeden Schritt live und kannst im Banner stoppen.</p>
      <textarea className="input" rows={3} maxLength={1500} value={wish} disabled={running} placeholder={EXAMPLES[kind][0]} onChange={(e) => setWish(e.target.value)} aria-label="Was soll die KI an der Figur machen?" />
      {!wish && (
        <div className="chips">
          {EXAMPLES[kind].map((ex) => (
            <button key={ex} type="button" className="chip" onClick={() => setWish(ex)}>
              {ex}
            </button>
          ))}
        </div>
      )}
      <Button variant="primary" block icon={<Icon.Spark size={16} />} disabled={running} onClick={() => void go()}>
        {running ? 'Die KI arbeitet …' : 'KI machen lassen'}
      </Button>
    </div>
  );
}
