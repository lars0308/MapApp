import { useEffect, useMemo, useState } from 'react';
import { compose, toPng, useSprites } from './store';
import type { SpriteKind } from './types';
import { useApp } from '../store/appStore';
import { Icon } from '../components/icons';

const KINDS: { id: SpriteKind; label: string; many: string; text: string; icon: string }[] = [
  { id: 'character', label: 'Charakter', many: 'Charaktere', text: 'Held, NPC, Spielfigur – mit Kleidung, Haaren, Waffen', icon: '🧍' },
  { id: 'creature', label: 'Kreatur', many: 'Kreaturen', text: 'Monster, Gegner, Tiere – Schleim, Fledermaus, Spinne …', icon: '👾' },
  { id: 'object', label: 'Objekt', many: 'Objekte', text: 'Truhe, Fackel, Kristall, Tür – Dinge in der Welt', icon: '📦' },
];

/**
 * First question of "Figuren": what kind, then which one
 * (saved, last edited or a new one).
 */
export function FigureChooser({ purpose, onPick }: { purpose: 'build' | 'animate'; onPick: (kind: SpriteKind) => void }) {
  // start page „Charakter erstellen“ …: straight to that kind
  const [kind, setKind] = useState<SpriteKind | null>(() => {
    const k = useApp.getState().askFigure;
    if (k) useApp.setState({ askFigure: null });
    return k;
  });
  if (!kind)
    return (
      <div className="page-inner chooser">
        <h1 className="page-title">{purpose === 'build' ? 'Was möchtest du bauen?' : 'Was möchtest du animieren?'}</h1>
        <div className="chooser-grid">
          {KINDS.map((k) => (
            <button key={k.id} type="button" className="choice-card chooser-card" data-kind={k.id} onClick={() => setKind(k.id)}>
              <span className="chooser-icon" aria-hidden="true">
                {k.icon}
              </span>
              <strong>{k.label}</strong>
              <small>{k.text}</small>
            </button>
          ))}
        </div>
      </div>
    );
  return <Which kind={kind} purpose={purpose} onBack={() => setKind(null)} onPick={() => onPick(kind)} />;
}

function Which({ kind, purpose, onBack, onPick }: { kind: SpriteKind; purpose: 'build' | 'animate'; onBack: () => void; onPick: () => void }) {
  const info = KINDS.find((k) => k.id === kind)!;
  const gallery = useSprites((s) => s.gallery).filter((g) => g.doc.kind === kind);
  const current = useSprites((s) => s[kind].doc);
  const rev = useSprites((s) => s.rev);
  const loaded = useSprites((s) => s.loaded[kind]);
  const thumb = useMemo(() => (loaded ? toPng(compose(current), current.size) : ''), [current, rev, loaded]);
  useEffect(() => {
    void useSprites.getState().load(kind);
  }, [kind]);
  const st = useSprites.getState();
  return (
    <div className="page-inner chooser anim-picker">
      <button type="button" className="btn btn-ghost chooser-back" onClick={onBack}>
        <Icon.ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} />
        <span>Andere Art</span>
      </button>
      <h1 className="page-title">
        {purpose === 'build' ? `${info.label} bauen` : `${info.label} animieren`} – welche{kind === 'object' ? 's' : ''}?
      </h1>
      <div className="anim-picker-more">
        {loaded && (
          <button type="button" className="start-continue" onClick={onPick}>
            {thumb && <img src={thumb} alt="" className="anim-picker-thumb" />}
            <span>
              Zuletzt bearbeitet: <strong>{current.name}</strong>
            </span>
            <Icon.ChevronRight size={16} />
          </button>
        )}
        {purpose === 'build' ? (
          <>
            <button type="button" className="start-continue" onClick={() => (st.reset(kind, false), onPick())}>
              <Icon.Plus size={18} />
              <span>
                Neu mit Baukasten-Teilen <small>Teile antippen, Farben wählen – am schnellsten</small>
              </span>
              <Icon.ChevronRight size={16} />
            </button>
            <button type="button" className="start-continue" onClick={() => (st.reset(kind, true), onPick())}>
              <Icon.Pencil size={18} />
              <span>
                Neu auf leerer Zeichenfläche <small>Alles selbst zeichnen</small>
              </span>
              <Icon.ChevronRight size={16} />
            </button>
          </>
        ) : (
          <button type="button" className="start-continue" onClick={() => useApp.getState().goTo(kind)}>
            <Icon.Plus size={18} />
            <span>Neu bauen (Figuren)</span>
            <Icon.ChevronRight size={16} />
          </button>
        )}
      </div>
      <h2 className="subhead">Gespeicherte {info.many}</h2>
      {gallery.length ? (
        <ul className="gallery-grid anim-picker-grid">
          {gallery.map((g) => (
            <li key={g.doc.id}>
              <button
                type="button"
                className="gallery-open"
                onClick={async () => {
                  await useSprites.getState().openFromGallery(kind, g.doc.id);
                  onPick();
                }}
              >
                <img src={g.thumb} alt="" />
                <span>{g.doc.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Noch nichts gespeichert. Im Baukasten „Speichern“ (Galerie) antippen – dann erscheint es hier.</p>
      )}
    </div>
  );
}
