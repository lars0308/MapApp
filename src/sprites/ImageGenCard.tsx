import { useEffect, useRef, useState } from 'react';
import type { SpriteKind, View } from './types';
import { useSprites } from './store';
import { Button, Segmented } from '../components/ui';
import { Icon } from '../components/icons';
import { useEditor } from '../store/editorStore';
import { withBusy } from '../store/busy';
import { generateFigure, rigTask, type GeneratedFigure } from '../api/imageGen';
import { formatCost, runAgent } from '../api/agent';
import { sideGame } from '../api/gameView';

const PLACEHOLDER: Record<SpriteKind, string> = {
  character: 'z. B. Dunkler Ritter mit zerrissenem Umhang und glühendem Schwert',
  creature: 'z. B. Dark-Fantasy-Monster mit 2 Köpfen und 6 Armen, violette Haut',
  object: 'z. B. Verfluchte Truhe mit Knochen und grünem Leuchten',
};

function Preview({ fig }: { fig: GeneratedFigure }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    ref.current?.getContext('2d')!.putImageData(fig.image, 0, 0);
  }, [fig]);
  return <canvas ref={ref} width={fig.size} height={fig.size} className="imagegen-sprite" aria-label="Entwurf als Pixel-Figur" />;
}

/**
 * "Mit KI zeichnen": describe the figure, the image model paints two drafts, MapForge turns them
 * into real pixels – pick one, and the AI cuts it into parts and animates it (optional).
 */
export function ImageGenCard({ kind, onDone }: { kind: SpriteKind; onDone: () => void }) {
  const toast = useEditor((s) => s.toast);
  const [text, setText] = useState('');
  const [size, setSize] = useState(48);
  const [view, setView] = useState<View>(kind !== 'object' && sideGame() ? 'side' : 'front');
  const [animate, setAnimate] = useState(kind !== 'object');
  const [drafts, setDrafts] = useState<GeneratedFigure[]>([]);
  const [busy, setBusy] = useState(false);

  const draw = async () => {
    if (!text.trim()) return toast('Beschreibe kurz, was gezeichnet werden soll', 'error');
    setBusy(true);
    try {
      const results = await withBusy(
        'Das Bildmodell zeichnet deine Figur …',
        () => Promise.allSettled([0, 1].map(() => generateFigure({ description: text, kind, view, size }))),
        { ai: true, detail: 'Zwei Entwürfe – danach werden sie in echte Pixel umgewandelt' },
      );
      const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      if (!ok.length) throw (results[0] as PromiseRejectedResult).reason;
      setDrafts(ok);
      const cost = ok.reduce((a, f) => (f.cost === null || a === null ? null : a + f.cost), 0 as number | null);
      if (cost !== null) toast(`Entwürfe fertig (KI-Kosten ${formatCost(cost)})`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Das hat nicht geklappt', 'error');
    } finally {
      setBusy(false);
    }
  };

  const take = async (fig: GeneratedFigure) => {
    const st = useSprites.getState();
    const name = text.trim().split(/[,.–]/)[0].slice(0, 40).trim() || 'KI-Figur';
    st.newFromImage(kind, fig.image, name, fig.size);
    st.setStudioTab('anim');
    onDone();
    if (!animate) return toast('Figur übernommen – im Reiter Animieren kannst du sie in Teile trennen und bewegen', 'success');
    try {
      const r = await runAgent(rigTask(kind, text), [], { focus: 'figures' });
      toast(`${r.text || 'Figur zerlegt und animiert'} (KI-Kosten ${formatCost(r.cost)})`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Animieren hat nicht geklappt', 'error');
    }
  };

  return (
    <section className="imagegen" aria-label="Mit KI zeichnen">
      <p className="hint">Beschreibe die Figur – ein Bildmodell zeichnet sie in Pixel-Art, MapForge wandelt sie in echte Pixel um. Danach kann die KI sie in Teile zerlegen und animieren.</p>
      <textarea className="input" rows={3} maxLength={1200} value={text} disabled={busy} placeholder={PLACEHOLDER[kind]} onChange={(e) => setText(e.target.value)} aria-label="Beschreibung der Figur" />
      <Segmented
        label="Größe"
        value={String(size)}
        onChange={(v) => setSize(Number(v))}
        options={[
          { value: '32', label: '32 px' },
          { value: '48', label: '48 px' },
          { value: '64', label: '64 px' },
        ]}
      />
      {kind !== 'object' && (
        <Segmented
          label="Ansicht"
          value={view}
          onChange={(v) => setView(v)}
          options={[
            { value: 'side', label: 'Seite' },
            { value: 'front', label: 'Vorne' },
          ]}
        />
      )}
      {kind !== 'object' && (
        <label className="slot-lock">
          <input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} />
          Danach von der KI in Teile zerlegen und animieren lassen
        </label>
      )}
      <Button variant="primary" block icon={<Icon.Spark size={16} />} disabled={busy} onClick={() => void draw()}>
        {busy ? 'Zeichnet …' : drafts.length ? 'Neue Entwürfe' : 'Zeichnen'}
      </Button>
      {drafts.length > 0 && (
        <div className="imagegen-drafts">
          {drafts.map((f, i) => (
            <div key={i} className="imagegen-draft">
              <Preview fig={f} />
              <img src={f.raw} alt="Original des Bildmodells" className="imagegen-raw" />
              <Button variant="secondary" onClick={() => void take(f)}>
                Diese nehmen
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
