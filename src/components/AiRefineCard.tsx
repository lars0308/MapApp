import { useRef, useState } from 'react';
import { Button, IconButton, Section } from './ui';
import { Icon } from './icons';
import { useProject } from '../store/projectStore';
import { useEditor } from '../store/editorStore';
import { readFileAsDataUrl } from '../utils/download';
import { setReference } from '../api/describe';
import { formatCost, runAgent, useAgent } from '../api/agent';

/**
 * Aufbau → "Mit KI bauen": say what to build or change ("Truhe oben links, Fluss mit Brücke") – the
 * AI looks at the map, sees the project's reference picture and description and builds it with the
 * app's own tools (settings, painting, objects, figures).
 */
export function AiRefineCard() {
  const reference = useProject((s) => s.project.reference);
  const toast = useEditor((s) => s.toast);
  const [wish, setWish] = useState('');
  const busy = useAgent((s) => (s.running ? s.step || 'Die KI baut …' : null));
  const fileRef = useRef<HTMLInputElement>(null);

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) return toast(`${file.name}: kein Bild`, 'error');
    await setReference({ image: await readFileAsDataUrl(file) });
    toast('Referenzbild gespeichert – die KI richtet sich danach', 'success');
  };

  const run = async () => {
    if (!wish.trim() && !reference?.image) return toast('Schreib, was die KI bauen oder ändern soll, oder füge ein Referenzbild hinzu', 'error');
    const task = [
      `Wunsch des Nutzers für die offene Karte: ${wish.trim() || 'Passe die Karte besser an das Referenzbild an.'}`,
      reference?.text ? `Projektbeschreibung: ${reference.text}` : '',
      'Schau dir die Karte zuerst mit render an und setze den Wunsch dann mit den Werkzeugen um.',
    ].filter(Boolean).join('\n');
    setWish('');
    try {
      const done = await runAgent(task, reference?.image ? [{ label: 'Referenzbild des Nutzers (so soll es aussehen)', dataUrl: reference.image }] : []);
      toast(`${done.text || 'Fertig'} (KI-Kosten ${formatCost(done.cost)})`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Das hat nicht geklappt', 'error');
    }
  };

  return (
    <Section title="Mit KI bauen">
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => (void pickImage(e.target.files?.[0]), (e.target.value = ''))} />
      <div className="ai-ref">
        <button type="button" className="describe-slot-btn" onClick={() => fileRef.current?.click()} disabled={!!busy}>
          {reference?.image ? <img src={reference.image} alt="" /> : <Icon.Plus size={18} />}
          <span>
            <strong>Referenzbild</strong>
            <small>{reference?.image ? 'Die KI sieht es bei jeder Anpassung' : 'So soll die Karte aussehen'}</small>
          </span>
        </button>
        {reference?.image && (
          <IconButton label="Referenzbild entfernen" onClick={() => void setReference({ image: null })} disabled={!!busy}>
            <Icon.Close size={14} />
          </IconButton>
        )}
      </div>
      {reference?.text && <p className="hint ai-ref-text">Projekt: „{reference.text}“</p>}
      <textarea
        className="input describe-text"
        rows={2}
        maxLength={1500}
        placeholder="z. B. Truhe in den Raum oben links, Fluss mit Brücke, Händler am Start, mehr Wald"
        value={wish}
        disabled={!!busy}
        onChange={(e) => setWish(e.target.value)}
        aria-label="Was soll die KI bauen oder ändern?"
      />
      <Button variant="primary" block icon={<Icon.Spark size={16} />} disabled={!!busy} onClick={() => void run()}>
        {busy ?? 'KI bauen lassen'}
      </Button>
    </Section>
  );
}
