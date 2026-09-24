import { useEffect, useMemo, useRef, useState } from 'react';
import { useSprites } from './store';
import { animsFor, framesOf, frameSize } from './animation';
import { exportSheetPng, exportSpriteGodot, type ExportChoice } from './exportSprite';
import { VIEWS, VIEWS4, type SpriteKind, type View } from './types';
import { Button, Segmented } from '../components/ui';
import { Icon } from '../components/icons';
import { useEditor } from '../store/editorStore';
import { clearPlayerSprite, onPlayerSprite, playerSpriteName, setPlayerSprite } from '../playtest/playerSprite';
import { figureToObject } from '../objects/fromFigure';
import { useProject } from '../store/projectStore';
import { useApp } from '../store/appStore';

// Builder tab "Export": the figure with its standard animations (stand, walk, attack, hit,
// fall over …) straight into Godot or as a spritesheet – and as the player figure in the test.

type Dirs = '4' | '8' | '2';
const KEY = 'mapforge.figureExport';
const readDirs = (): Dirs => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === '4' || v === '8' || v === '2') return v;
  } catch {
    // ignore
  }
  return '4';
};

/** small looping preview of one animation */
function Preview({ kind, animId, view }: { kind: SpriteKind; animId: string; view: View }) {
  const doc = useSprites((s) => s[kind].doc);
  const rev = useSprites((s) => s.rev);
  const ref = useRef<HTMLCanvasElement>(null);
  const anim = animsFor(kind).find((a) => a.id === animId) ?? animsFor(kind)[0];
  const frames = useMemo(() => framesOf(doc, anim, view), [doc, rev, anim, view]);
  const n = frameSize(doc.size);
  useEffect(() => {
    let i = 0;
    const draw = () => {
      const c = ref.current;
      if (!c || !frames.length) return;
      c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(frames[i % frames.length]), n, n), 0, 0);
      i++;
    };
    draw();
    const t = setInterval(draw, 1000 / anim.fps);
    return () => clearInterval(t);
  }, [frames, n, anim.fps]);
  return <canvas ref={ref} width={n} height={n} className="export-preview" aria-label={`Vorschau ${anim.label}`} />;
}

export function ExportPanel({ kind }: { kind: SpriteKind }) {
  const doc = useSprites((s) => s[kind].doc);
  const toast = useEditor((s) => s.toast);
  const [dirs, setDirs] = useState<Dirs>(readDirs);
  const [player, setPlayer] = useState(playerSpriteName());
  useEffect(() => {
    const off = onPlayerSprite(() => setPlayer(playerSpriteName()));
    return () => {
      off();
    };
  }, []);
  const anims = animsFor(kind);
  const [preview, setPreview] = useState(anims.find((a) => a.id === 'walk' || a.id === 'k_hop' || a.id === 'bob')?.id ?? anims[0].id);
  const views: View[] = kind === 'object' ? ['front'] : dirs === '2' ? ['side'] : dirs === '8' ? VIEWS.map((v) => v.id) : VIEWS4;
  const choice: ExportChoice = { anims, fps: {}, views, custom: doc.customAnims ?? [] };
  const pickDirs = (v: Dirs) => {
    setDirs(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      // not stored
    }
  };

  return (
    <div className="figure-export">
      <div className="export-preview-row">
        <Preview kind={kind} animId={preview} view={dirs === '2' ? 'side' : 'front'} />
        <div className="export-anim-list">
          <p className="muted small">Kommt automatisch mit ({anims.length}):</p>
          <div className="chips">
            {anims.map((a) => (
              <button key={a.id} type="button" className={`chip${a.id === preview ? ' is-active' : ''}`} title={a.hint} onClick={() => setPreview(a.id)}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {kind !== 'object' && (
        <Segmented
          label="Richtungen"
          value={dirs}
          onChange={pickDirs}
          options={[
            { value: '4', label: '4 Richtungen' },
            { value: '8', label: '8 (+ schräg)' },
            { value: '2', label: '2 · Platformer' },
          ]}
        />
      )}

      <div className="button-row">
        <Button variant="primary" icon={<Icon.Download size={16} />} onClick={() => (exportSpriteGodot(doc, choice), toast('Godot-Paket exportiert', 'success'))}>
          Godot-Paket (ZIP)
        </Button>
        <Button icon={<Icon.Download size={16} />} onClick={() => exportSheetPng(doc, choice)}>
          Spritesheet PNG
        </Button>
      </div>
      <p className="hint">
        Ordner ins Godot-Projekt ziehen, die <code>.tscn</code> in die Szene –{' '}
        {kind === 'creature'
          ? 'der Gegner verfolgt die Spielfigur, greift an, nimmt Schaden und stirbt.'
          : kind === 'character'
            ? dirs === '2'
              ? 'Platformer-Steuerung: ← → laufen, ↑ / Leertaste springt, J greift an.'
              : 'Pfeiltasten laufen, Shift rennt, Leertaste / J greift an.'
            : 'das Objekt spielt seine Animation.'}{' '}
        Die Animationen entstehen automatisch aus den Teilen – gut für Prototypen und Gegner; für ein fertiges Spiel das Spritesheet von Hand nachzeichnen.
      </p>

      <h4 className="subhead">Auf die Karte</h4>
      <p className="muted small">
        Als Objekt in die aktuelle Karte „{useProject.getState().project.name}“ – steht dann unter <b>Tiles → Objekte</b> und lässt sich wie ein Baum oder eine Truhe setzen (Y-Sortierung, Kollision, Godot-Export).
      </p>
      <div className="button-row">
        <Button
          icon={<Icon.Map size={16} />}
          onClick={() => {
            const o = figureToObject(doc, true);
            if (!o) return toast('Die Figur ist leer', 'error');
            const again = (useProject.getState().project.customObjects ?? []).some((x) => x.id === o.id);
            useProject.getState().addCustomObject(o);
            useEditor.getState().selectObject(o.id);
            useApp.getState().goTo('map');
            toast(again ? `„${o.label}“ auf der Karte aktualisiert – antippen zum Setzen` : `„${o.label}“ ist jetzt ein Objekt – auf die Karte tippen zum Setzen`, 'success');
          }}
        >
          Als Objekt auf die Karte
        </Button>
      </div>

      {kind !== 'object' && (
        <>
          <h4 className="subhead">Spielfigur im Test (▶) und im Karten-Export</h4>
          <p className="muted small">{player ? `Aktuell: „${player}“` : 'Aktuell: Standard-Figur'}</p>
          <div className="button-row">
            <Button icon={<Icon.Person size={16} />} onClick={() => toast(setPlayerSprite(doc) ? `„${doc.name}“ ist jetzt die Spielfigur` : 'Konnte nicht gespeichert werden', 'success')}>
              Als Spielfigur verwenden
            </Button>
            {player && (
              <Button variant="ghost" onClick={clearPlayerSprite}>
                Standard
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
