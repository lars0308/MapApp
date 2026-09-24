import { useRef, useState } from 'react';
import { Button, IconButton, Section } from './ui';
import { Icon } from './icons';
import { useProject } from '../store/projectStore';
import { useEditor } from '../store/editorStore';
import { readFileAsDataUrl } from '../utils/download';
import { refineMap, setReference } from '../api/describe';

/**
 * Aufbau → "Mit KI anpassen": say what should change ("mehr Wasser, Boss näher am Start") – the AI
 * sees the current map, the project's reference picture and description and changes the settings.
 */
export function AiRefineCard() {
  const reference = useProject((s) => s.project.reference);
  const toast = useEditor((s) => s.toast);
  const [wish, setWish] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) return toast(`${file.name}: kein Bild`, 'error');
    await setReference({ image: await readFileAsDataUrl(file) });
    toast('Referenzbild gespeichert – die KI richtet sich danach', 'success');
  };

  const run = async () => {
    if (!wish.trim() && !reference?.image) return toast('Schreib, was anders werden soll, oder füge ein Referenzbild hinzu', 'error');
    try {
      setBusy('Die KI plant …');
      const done = await refineMap(wish, setBusy);
      toast([done.summary, ...done.tips.map((t) => `Tipp: ${t}`)].join(' '), 'success');
      setWish('');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Das hat nicht geklappt', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="Mit KI anpassen">
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
        placeholder="z. B. mehr Wasser, Boss näher am Start, dichterer Wald"
        value={wish}
        disabled={!!busy}
        onChange={(e) => setWish(e.target.value)}
        aria-label="Was soll an der Karte anders werden?"
      />
      <Button variant="primary" block icon={<Icon.Spark size={16} />} disabled={!!busy} onClick={() => void run()}>
        {busy ?? 'Mit KI anpassen'}
      </Button>
    </Section>
  );
}
