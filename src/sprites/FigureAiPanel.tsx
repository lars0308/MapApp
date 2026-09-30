import { useState } from 'react';
import type { SpriteKind } from './types';
import { Button, Segmented } from '../components/ui';
import { Icon } from '../components/icons';
import { useEditor } from '../store/editorStore';
import { useProject } from '../store/projectStore';
import { useSprites } from './store';
import { formatCost, runAgent, useAgent } from '../api/agent';
import { styleHint } from '../api/describe';
import { gameView, setGameView, type GameView } from '../api/gameView';

const EXAMPLES: Record<GameView, Record<SpriteKind, string[]>> = {
  side: {
    character: ['Alle Animationen flüssiger machen und prüfen', 'Lauf-, Sprung- und Fall-Animation verbessern', 'Schwertangriff mit Schlagspur', 'Neue Animation: Wandsprung', 'Neue Animation: Dash', 'Mein hochgeladenes Bild in Teile trennen und animieren', 'Details und Schattierung verbessern'],
    creature: ['Bewegung und Angriff flüssiger machen', 'Treffer- und Tod-Animation verbessern', 'Neue Animation: Sprungangriff', 'Mein hochgeladenes Bild in Teile trennen und animieren', 'Gefährlicher aussehen lassen'],
    object: ['Fackel flackern lassen', 'Truhe öffnen animieren', 'Münze drehen lassen', 'Mein hochgeladenes Objekt animieren', 'Details und Schattierung verbessern'],
  },
  top: {
    character: ['Lauf- und Angriffs-Animation verbessern', 'Neue Animation: Ausweichrolle', 'Roten Umhang und Krone dazu', 'Details und Schattierung verbessern', 'An den Stil meiner Karte anpassen'],
    creature: ['Bewegung und Angriff flüssiger machen', 'Treffer- und Tod-Animation verbessern', 'Gefährlicher aussehen lassen', 'An den Stil meiner Karte anpassen'],
    object: ['Fackel flackern lassen', 'Truhe öffnen animieren', 'Goldbeschläge dazu', 'An den Stil meiner Karte anpassen'],
  },
};

/** Figure builder → "KI": the AI works on the open figure (draw, animate, restyle) – live, stoppable */
export function FigureAiPanel({ kind }: { kind: SpriteKind }) {
  const toast = useEditor((s) => s.toast);
  const running = useAgent((s) => s.running);
  const [wish, setWish] = useState('');
  const [view, setView] = useState<GameView>(gameView);
  const go = async () => {
    if (!wish.trim()) return toast('Schreib kurz, was die KI machen soll', 'error');
    const ref = useProject.getState().project.reference;
    const task = [
      `Arbeite an der Figur, die gerade im Baukasten offen ist (kind "${kind}"). Wunsch des Nutzers: ${wish.trim()}`,
      'Ändere diese Figur (kein figure_new, außer der Nutzer will eine neue). Lies zuerst figure_status und figure_render.',
      /stil|karte|passend/i.test(wish) ? 'Für den Stil: style_colors lesen und Farben, Umriss und Pixelgröße übernehmen.' : '',
      view === 'side' && kind !== 'object'
        ? 'Das Spiel ist ein 2D-Side-Scroller: Seitenansicht (view side) ist die Hauptansicht, Animationen dort prüfen und verbessern (figure_render mit animation, figure_anim_frames, figure_anim_draw; neue Bewegungen mit figure_anim_new in view side).'
        : '',
      /anim|beweg|lauf|sprung|spring|angriff|schlag|dash|flacker|öffn|dreh|flüssig|teile/i.test(wish)
        ? 'Es geht um Animation: arbeite wie unter ANIMATION beschrieben – Ebenen/Teile prüfen, Bewegung als Posen (figure_anim_pose, figure_anim_new mit poses), figure_anim_smooth, nach jeder Änderung figure_anim_check und figure_render (animation), bis alle Bilder zusammenpassen.'
        : '',
      useSprites.getState()[kind].doc.layers.some((l) => l.region === 'torso' && !l.partId) ? 'Die Figur ist ein hochgeladenes Bild: wenn sich Teile bewegen sollen, trenne sie zuerst mit figure_layer_split ab (figure_grid zeigt die Pixel).' : '',
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
      <p className="hint">Die KI arbeitet an der offenen Figur: animieren, neue Bewegungen, Details zeichnen, an den Stil deiner Karte anpassen. Du siehst jeden Schritt live und kannst im Banner stoppen.</p>
      {kind !== 'object' && (
        <Segmented
          label="Mein Spiel"
          value={view}
          onChange={(v) => {
            setView(v);
            setGameView(v);
          }}
          options={[
            { value: 'side', label: 'Side-Scroller' },
            { value: 'top', label: 'Top-Down' },
          ]}
        />
      )}
      <textarea className="input" rows={3} maxLength={1500} value={wish} disabled={running} placeholder={EXAMPLES[view][kind][0]} onChange={(e) => setWish(e.target.value)} aria-label="Was soll die KI an der Figur machen?" />
      {!wish && (
        <div className="chips">
          {EXAMPLES[view][kind].map((ex) => (
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
