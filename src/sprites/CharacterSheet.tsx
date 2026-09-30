import { useEffect, useMemo, useRef, useState } from 'react';
import type { CustomAnim, SpriteKind, View } from './types';
import { useSprites } from './store';
import { animFps, animsFor, framesOf, frameSize, type AnimDef } from './animation';
import { Button, Segmented } from '../components/ui';
import { Icon } from '../components/icons';
import { useEditor } from '../store/editorStore';
import { useApp } from '../store/appStore';
import { withBusy } from '../store/busy';
import { formatCost } from '../api/agent';
import { sideGame } from '../api/gameView';
import { IMAGE_STYLES, generateAnimation, generateFigure, shortName, type ImageStyle } from '../api/imageGen';

// The simple way (like dedicated pixel art tools): describe a character → it is painted → add
// animations by describing them. The expert builder stays one tap away ("Im Baukasten bearbeiten").

const KIND_WORD: Record<SpriteKind, string> = {
  character: 'Charakter',
  creature: 'Kreatur',
  object: 'Objekt',
};
const PLACEHOLDER: Record<SpriteKind, string> = {
  character: 'z. B. Kleiner Hase-Krieger mit großem Uhrpendel als Waffe, braune Lederrüstung, mutiger Blick',
  creature: 'z. B. Dark-Fantasy-Monster mit 2 Köpfen und 6 Armen, violette Haut, glühende Augen',
  object: 'z. B. Verfluchte Truhe mit Knochen und grünem Leuchten',
};
const SUGGEST: Record<SpriteKind, string[]> = {
  character: ['Läuft', 'Rennt', 'Springt hoch und landet', 'Schlägt mit der Waffe zu', 'Wird getroffen und zuckt zurück', 'Fällt um und bleibt liegen', 'Steht und atmet ruhig'],
  creature: ['Krabbelt vorwärts', 'Springt den Gegner an', 'Beißt zu', 'Wird getroffen', 'Zerfällt', 'Wabert im Stand'],
  object: ['Flackert', 'Öffnet sich', 'Dreht sich', 'Schwebt auf und ab', 'Wackelt'],
};

function Player({ frames, fps, size, className }: { frames: Uint8ClampedArray[]; fps: number; size: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let i = 0;
    const draw = () => {
      const c = ref.current;
      if (!c || !frames.length) return;
      c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(frames[i % frames.length]), size, size), 0, 0);
      i++;
    };
    draw();
    if (frames.length < 2) return;
    const t = setInterval(draw, 1000 / Math.max(1, fps));
    return () => clearInterval(t);
  }, [frames, fps, size]);
  return <canvas ref={ref} width={size} height={size} className={className} />;
}

function Strip({ frames, size }: { frames: Uint8ClampedArray[]; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    frames.forEach((f, i) => g.putImageData(new ImageData(new Uint8ClampedArray(f), size, size), i * size, 0));
  }, [frames, size]);
  return <canvas ref={ref} width={Math.max(1, frames.length) * size} height={size} className="sheet-strip" aria-label={`${frames.length} Bilder`} />;
}

function AnimCard({ kind, anim, view, own }: { kind: SpriteKind; anim: AnimDef | CustomAnim; view: View; own: boolean }) {
  const doc = useSprites((s) => s[kind].doc);
  const rev = useSprites((s) => s.rev);
  const n = frameSize(doc.size);
  const frames = useMemo(() => framesOf(doc, anim, own ? (anim as CustomAnim).view : view), [doc, rev, anim, view, own]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = 'label' in anim ? anim.label : anim.name;
  return (
    <article className="sheet-anim">
      <header>
        <strong>{name}</strong>
        <span className="badge">{frames.length} Bilder</span>
        <span className={`badge${own ? ' badge-ai' : ''}`}>{own ? 'KI · Bildmodell' : 'Vorlage · Skelett'}</span>
        {own && (
          <button type="button" className="icon-btn" aria-label={`${name} löschen`} onClick={() => useSprites.getState().deleteCustomAnim(kind, anim.id)}>
            <Icon.Trash size={16} />
          </button>
        )}
      </header>
      <div className="sheet-anim-body">
        <Player frames={frames} fps={animFps(doc, anim)} size={n} className="sheet-anim-play" />
        <div className="sheet-strip-wrap">
          <Strip frames={frames} size={n} />
        </div>
      </div>
    </article>
  );
}

export function CharacterSheet({ kind }: { kind: SpriteKind }) {
  const doc = useSprites((s) => s[kind].doc);
  const rev = useSprites((s) => s.rev);
  const creating = useSprites((s) => s.sheetCreate);
  const toast = useEditor((s) => s.toast);
  const st = useSprites.getState();
  const [text, setText] = useState('');
  const [style, setStyle] = useState<ImageStyle>(() => (localStorage.getItem('mapforge.imageStyle') as ImageStyle) || 'retro');
  const [size, setSize] = useState(48);
  const [view, setView] = useState<View>(kind !== 'object' && sideGame() ? 'side' : 'front');
  const [adding, setAdding] = useState(false);
  const [action, setAction] = useState('');
  const [count, setCount] = useState(6);
  const [showTemplates, setShowTemplates] = useState(false);
  const busy = useRef(false);
  const own = doc.customAnims ?? [];
  const templates = animsFor(kind);
  const n = frameSize(doc.size);
  const docView: View = own[0]?.view ?? (kind !== 'object' && sideGame() ? 'side' : 'front');
  const hero = own[0] ?? templates.find((a) => a.id === 'idle' || a.id === 'k_idle' || a.id === 'bob') ?? templates[0];
  const heroFrames = useMemo(() => framesOf(doc, hero, 'view' in hero ? hero.view : docView), [doc, rev, hero, docView]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void useSprites.getState().load(kind);
  }, [kind]);
  useEffect(() => {
    try {
      localStorage.setItem('mapforge.imageStyle', style);
    } catch {
      /* private mode */
    }
  }, [style]);

  const create = async () => {
    if (!text.trim()) return toast(`Beschreibe kurz, wie dein${kind === 'creature' ? 'e Kreatur' : kind === 'object' ? ' Objekt' : ' Charakter'} aussehen soll`, 'error');
    if (busy.current) return;
    busy.current = true;
    try {
      const fig = await withBusy(
        `Dein${kind === 'creature' ? 'e Kreatur wird' : kind === 'object' ? ' Objekt wird' : ' Charakter wird'} gezeichnet …`,
        () => generateFigure({ description: text, kind, view, size, style }),
        {
          ai: true,
          detail: 'Die KI schreibt eine genaue Bildbeschreibung, das Bildmodell zeichnet, eine zweite KI prüft das Ergebnis',
        },
      );
      if (st[kind].doc.layers.some((l) => l.edited || l.partId)) st.saveToGallery(kind);
      st.newFromImage(kind, fig.image, shortName(text.trim().split(/[,.–]/)[0]) || KIND_WORD[kind], fig.size);
      st.setDocPrompt(kind, text.trim());
      st.setSheetCreate(false);
      toast(`Fertig${fig.cost !== null ? ` (KI-Kosten ${formatCost(fig.cost)})` : ''} – jetzt kannst du Animationen hinzufügen`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Das hat nicht geklappt', 'error');
    } finally {
      busy.current = false;
    }
  };

  const animate = async () => {
    if (!action.trim()) return toast('Beschreibe kurz, was passieren soll', 'error');
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await withBusy('Die Animation wird gezeichnet …', () => generateAnimation(kind, action, count, style), {
        ai: true,
        detail: `${count} Bilder – die KI plant die Schlüsselposen, das Bildmodell zeichnet, danach werden sie ausgeschnitten und ausgerichtet`,
      });
      setAction('');
      setAdding(false);
      toast(
        `Animation fertig: ${r.frames} Bilder${r.cost !== null ? ` (KI-Kosten ${formatCost(r.cost)})` : ''}${r.problems ? ` – Hinweis der Prüfung: ${r.problems}` : ''}`,
        r.problems ? 'info' : 'success',
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Das hat nicht geklappt', 'error');
    } finally {
      busy.current = false;
    }
  };

  const openStudio = (tab?: string) => {
    if (tab) st.setStudioTab(tab);
    st.setSimple(false);
  };

  return (
    <div className="page-inner charsheet">
      <div className="sheet-bar">
        <button type="button" className="btn btn-ghost" onClick={() => useApp.getState().setChosen('figures', false)}>
          <Icon.ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} />
          <span>Auswahl</span>
        </button>
        {!creating && (
          <div className="sheet-bar-actions">
            <Button variant="ghost" onClick={() => openStudio()}>
              Im Baukasten bearbeiten
            </Button>
            <Button variant="secondary" icon={<Icon.Download size={16} />} onClick={() => openStudio('export')}>
              Export
            </Button>
          </div>
        )}
      </div>

      {creating ? (
        <section className="sheet-create" aria-label={`${KIND_WORD[kind]} erstellen`}>
          <h1 className="page-title">{KIND_WORD[kind]} mit KI erstellen</h1>
          <textarea className="input" rows={4} maxLength={1200} value={text} placeholder={PLACEHOLDER[kind]} onChange={(e) => setText(e.target.value)} aria-label="Beschreibung" />
          <div className="chips" role="radiogroup" aria-label="Stil">
            {IMAGE_STYLES.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={style === s.id} className={`chip${style === s.id ? ' is-active' : ''}`} onClick={() => setStyle(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
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
                { value: 'side', label: 'Seite (Side-Scroller)' },
                { value: 'front', label: 'Vorne (Top-Down)' },
              ]}
            />
          )}
          <Button variant="primary" block icon={<Icon.Spark size={16} />} onClick={() => void create()}>
            Erstellen
          </Button>
          <p className="hint">Kostet etwa 7–15 Cent (Bildmodell plus Prüfung; bei Fehlern wird einmal nachgebessert). Danach kannst du Animationen hinzufügen.</p>
          {doc.layers.length > 1 || doc.customAnims?.length ? (
            <button type="button" className="btn btn-ghost" onClick={() => st.setSheetCreate(false)}>
              Zurück zu „{doc.name}“
            </button>
          ) : null}
        </section>
      ) : (
        <>
          <section className="sheet-hero" aria-label={doc.name}>
            <div className="sheet-preview">
              <Player frames={heroFrames} fps={animFps(doc, hero)} size={n} className="sheet-preview-canvas" />
            </div>
            <div className="sheet-info">
              <h1>{doc.name}</h1>
              {doc.prompt && <p className="sheet-prompt">„{doc.prompt}“</p>}
              <div className="sheet-meta">
                <span>
                  {doc.size}×{doc.size} px
                </span>
                <span>{docView === 'side' ? 'Seitenansicht · links gespiegelt' : docView === 'front' ? 'Vorderansicht' : 'Ansicht ' + docView}</span>
                <span>
                  {own.length} {own.length === 1 ? 'eigene Animation' : 'eigene Animationen'} · {templates.length} Vorlagen
                </span>
              </div>
              <div className="button-row">
                <Button variant="secondary" icon={<Icon.Plus size={16} />} onClick={() => st.setSheetCreate(true)}>
                  Neu erstellen
                </Button>
                <Button variant="ghost" onClick={() => st.saveToGallery(kind) && toast('In der Galerie gespeichert', 'success')}>
                  Speichern
                </Button>
              </div>
            </div>
          </section>

          <section className="sheet-anims" aria-labelledby="sheet-anims-title">
            <div className="sheet-anims-head">
              <h2 id="sheet-anims-title">
                Animationen <span className="badge">{own.length}</span>
              </h2>
              <Button variant="primary" icon={<Icon.Plus size={16} />} onClick={() => setAdding(!adding)}>
                Neue Animation
              </Button>
            </div>
            {adding && (
              <div className="sheet-add">
                <textarea
                  className="input"
                  rows={3}
                  maxLength={600}
                  value={action}
                  placeholder="Was soll passieren? z. B. hebt das riesige Uhrpendel über den Kopf und schmettert es auf den Boden – kleine Schockwelle"
                  onChange={(e) => setAction(e.target.value)}
                  aria-label="Was soll passieren?"
                />
                <div className="chips">
                  {SUGGEST[kind].map((s) => (
                    <button key={s} type="button" className="chip" onClick={() => setAction(s)}>
                      {s}
                    </button>
                  ))}
                </div>
                <Segmented
                  label="Bilder"
                  value={String(count)}
                  onChange={(v) => setCount(Number(v))}
                  options={[
                    { value: '4', label: '4' },
                    { value: '6', label: '6' },
                    { value: '8', label: '8' },
                  ]}
                />
                <Button variant="primary" block icon={<Icon.Spark size={16} />} onClick={() => void animate()}>
                  Animation zeichnen
                </Button>
                <p className="hint">
                  Das Bildmodell zeichnet die Bewegung deiner Figur als Bildfolge; MapForge schneidet die Bilder aus, gibt allen dieselben Farben und stellt sie auf dieselbe Bodenlinie. Kostet etwa
                  7–15 Cent.
                </p>
              </div>
            )}
            {own.length === 0 && !adding && <p className="muted">Noch keine eigenen Animationen – tippe auf „Neue Animation“ oder nimm unten eine Vorlage.</p>}
            {own.map((a) => (
              <AnimCard key={a.id} kind={kind} anim={a} view={a.view} own />
            ))}
            <button type="button" className="btn btn-ghost sheet-templates-toggle" onClick={() => setShowTemplates(!showTemplates)} aria-expanded={showTemplates}>
              <Icon.ChevronRight
                size={16}
                style={{
                  transform: showTemplates ? 'rotate(90deg)' : undefined,
                }}
              />
              Vorlagen · kostenlos ({templates.length}) –{' '}
              {templates
                .slice(0, 4)
                .map((t) => t.label)
                .join(', ')}{' '}
              …
            </button>
            {showTemplates && templates.map((a) => <AnimCard key={a.id} kind={kind} anim={a} view={docView} own={false} />)}
          </section>
        </>
      )}
    </div>
  );
}
