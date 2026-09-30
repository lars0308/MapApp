import { useEffect, useMemo, useRef, useState } from 'react';
import type { CustomAnim, RigRegion, SpriteKind, View } from './types';
import { VIEWS } from './types';
import { REGION_NAME, useSprites } from './store';
import { animFps, animPoses, animView, animsFor, frameKey, framesOf, frameSize, isPixelAnim, keyPoses, smoothOf, tuneKey, tuneOf, type AnimDef, type Pose } from './animation';
import { checkAnimation, type AnimReport } from './animCheck';
import { FrameEditor } from './FrameEditor';
import { Button, Segmented } from '../components/ui';
import { Icon } from '../components/icons';
import { useEditor } from '../store/editorStore';
import { sideGame } from '../api/gameView';
import { uid } from '../utils/id';
import { imageDataFromFile } from './imageFile';

// "Animieren": watch an animation, make it smoother (computed in-betweens), nudge body parts of a
// frame, repaint single frames, build own animations and check that all frames fit together.

type Part = RigRegion | 'all';
const PARTS: Record<SpriteKind, { id: Part; label: string }[]> = {
  character: [
    { id: 'all', label: 'Ganze Figur' },
    { id: 'head', label: 'Kopf' },
    { id: 'torso', label: 'Rumpf' },
    { id: 'armR', label: 'Arm 1 (Waffe)' },
    { id: 'armL', label: 'Arm 2' },
    { id: 'legR', label: 'Bein 1' },
    { id: 'legL', label: 'Bein 2' },
    { id: 'weapon', label: 'Waffe' },
  ],
  creature: [
    { id: 'all', label: 'Ganze Figur' },
    { id: 'torso', label: 'Körper' },
    { id: 'head', label: 'Kopf / Augen' },
    { id: 'armL', label: 'Seite links' },
    { id: 'armR', label: 'Seite rechts' },
    { id: 'effect', label: 'Effekt' },
  ],
  object: [
    { id: 'all', label: 'Ganzes Objekt' },
    { id: 'head', label: 'Oberteil / Deckel' },
    { id: 'torso', label: 'Unterteil' },
    { id: 'effect', label: 'Effekt' },
  ],
};

/** a nudge of one body part as a pose delta */
function delta(part: Part, dx: number, dy: number, turn: number): Pose {
  if (part === 'all') return { all: dx || dy ? { x: dx, y: dy } : undefined, spin: turn || undefined };
  return { off: dx || dy ? { [part]: { x: dx, y: dy } } : undefined, rot: turn ? { [part]: turn } : undefined };
}

function useFrameCanvas(frame: Uint8ClampedArray | undefined, n: number, under?: Uint8ClampedArray) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, n, n);
    if (under) {
      const o = document.createElement('canvas');
      o.width = o.height = n;
      o.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(under), n, n), 0, 0);
      g.globalAlpha = 0.3;
      g.drawImage(o, 0, 0);
      g.globalAlpha = 1;
    }
    if (frame) {
      const o = document.createElement('canvas');
      o.width = o.height = n;
      o.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(frame), n, n), 0, 0);
      g.drawImage(o, 0, 0);
    }
  }, [frame, n, under]);
  return ref;
}

function Thumb({ frame, n, active, between, edited, onClick, label }: { frame: Uint8ClampedArray; n: number; active: boolean; between: boolean; edited: boolean; onClick: () => void; label: string }) {
  const ref = useFrameCanvas(frame, n);
  return (
    <button type="button" className={`anim2-thumb${active ? ' is-active' : ''}${between ? ' is-between' : ''}`} onClick={onClick} aria-label={label} title={label}>
      <canvas ref={ref} width={n} height={n} />
      <span>{between ? '·' : label.replace(/^Bild /, '')}</span>
      {edited && <i className="anim2-dot" aria-hidden="true" />}
    </button>
  );
}

export function AnimPanel({ kind }: { kind: SpriteKind }) {
  const doc = useSprites((s) => s[kind].doc);
  const rev = useSprites((s) => s.rev);
  const toast = useEditor((s) => s.toast);
  const st = useSprites.getState();
  const builtIn = animsFor(kind);
  const own = doc.customAnims ?? [];
  const [animId, setAnimId] = useState(() => (sideGame() && kind === 'character' ? 'run' : builtIn.find((a) => a.id === 'walk' || a.id === 'k_hop' || a.id === 'bob')?.id) ?? builtIn[0].id);
  const anim: AnimDef | CustomAnim = own.find((a) => a.id === animId) ?? builtIn.find((a) => a.id === animId) ?? builtIn[0];
  const custom = 'frames' in anim;
  const pixel = isPixelAnim(anim);
  const [viewSel, setViewSel] = useState<View>(() => (kind !== 'object' && sideGame() ? 'side' : 'front'));
  const view = kind === 'object' ? 'front' : animView(anim, viewSel);
  const n = frameSize(doc.size);
  const frames = useMemo(() => framesOf(doc, anim, view), [doc, rev, anim, view]); // eslint-disable-line react-hooks/exhaustive-deps
  const keys = useMemo(() => (pixel ? frames.map((_, i) => i) : animPoses(doc, anim, view).keys), [doc, rev, anim, view, pixel, frames]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [onion, setOnion] = useState(false);
  const [tick, setTick] = useState(0);
  const [part, setPart] = useState<Part>('all');
  const [everyFrame, setEveryFrame] = useState(false);
  const [editing, setEditing] = useState(false);
  const [report, setReport] = useState<AnimReport | null>(null);
  const [creating, setCreating] = useState(false);
  const fps = animFps(doc, anim);
  const smooth = smoothOf(doc, anim);
  const tune = tuneOf(doc, anim.id);
  const cur = Math.min(sel, frames.length - 1);
  const key = keys[cur] ?? -1;
  const tuned = key >= 0 && !!tune.poses?.[tuneKey(view, key)];
  const edited = !pixel && !!doc.frames?.[frameKey(view, anim.id, cur)];

  // play: the big picture runs, the strip shows where it is
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000 / fps);
    return () => clearInterval(t);
  }, [playing, fps, frames.length]);
  useEffect(() => setReport(null), [animId, view, rev]);
  const shown = playing ? tick % Math.max(1, frames.length) : cur;
  const stageRef = useFrameCanvas(frames[shown], n, !playing && onion && frames.length > 1 ? frames[(cur - 1 + frames.length) % frames.length] : undefined);

  const pick = (id: string) => {
    setAnimId(id);
    setSel(0);
    setTick(0);
  };
  const nudge = (dx: number, dy: number, turn: number) => {
    if (key < 0) return;
    const d = delta(part, dx, dy, turn);
    // "für alle Bilder": e.g. hold the weapon a little lower in the whole animation
    const list = everyFrame ? keyPoses(doc, anim, view).map((_, i) => i) : [key];
    for (const i of list) st.nudgePose(kind, anim.id, tuneKey(view, i), d);
  };
  const saveFrame = (d: Uint8ClampedArray) => {
    if (pixel) {
      const all = (anim as CustomAnim).frames.slice();
      all[cur] = d;
      st.updateCustomAnim(kind, anim.id, { frames: all });
    } else st.setFrame(kind, frameKey(view, anim.id, cur), d);
    setEditing(false);
    toast('Bild übernommen', 'success');
  };

  return (
    <div className="anim2">
      <div className="anim2-head">
        <label className="field anim2-pick">
          <span>Animation</span>
          <select className="input" value={anim.id} onChange={(e) => pick(e.target.value)}>
            <optgroup label="Eingebaut">
              {builtIn.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </optgroup>
            {own.length > 0 && (
              <optgroup label="Eigene">
                {own.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <Button variant="secondary" icon={<Icon.Plus size={16} />} onClick={() => setCreating(!creating)}>
          Neue Animation
        </Button>
      </div>
      {creating && (
        <NewAnim
          kind={kind}
          view={view}
          onDone={(id) => {
            setCreating(false);
            if (id) pick(id);
          }}
        />
      )}
      {kind !== 'object' && !custom && (
        <Segmented label="Ansicht" value={viewSel} onChange={(v) => setViewSel(v)} options={VIEWS.map((v) => ({ value: v.id, label: v.label }))} />
      )}
      {!custom && 'hint' in anim && <p className="hint">{anim.hint}</p>}

      <div className="anim2-stage-row">
        <canvas ref={stageRef} width={n} height={n} className="anim2-stage" aria-label={`Vorschau ${'label' in anim ? anim.label : anim.name}`} />
        <div className="anim2-controls">
          <Button variant="secondary" onClick={() => setPlaying(!playing)}>
            {playing ? '⏸ Anhalten' : '▶ Abspielen'}
          </Button>
          <div className="anim2-step">
            <button type="button" className="btn btn-secondary" aria-label="Bild zurück" onClick={() => (setPlaying(false), setSel((cur - 1 + frames.length) % frames.length))}>
              ‹
            </button>
            <span>
              {cur + 1} / {frames.length}
            </span>
            <button type="button" className="btn btn-secondary" aria-label="Bild vor" onClick={() => (setPlaying(false), setSel((cur + 1) % frames.length))}>
              ›
            </button>
          </div>
          <label className="slot-lock">
            <input type="checkbox" checked={onion} onChange={(e) => setOnion(e.target.checked)} />
            Vorheriges Bild durchscheinen
          </label>
          <label className="field anim2-speed">
            <span>Tempo: {tune.fps ?? anim.fps} Bilder/s</span>
            <input type="range" min={2} max={20} value={tune.fps ?? anim.fps} onChange={(e) => st.setAnimTune(kind, anim.id, { fps: Number(e.target.value) })} />
          </label>
        </div>
      </div>

      {!pixel && (
        <Segmented
          label="Flüssiger"
          value={String(smooth)}
          onChange={(v) => {
            st.setAnimTune(kind, anim.id, { smooth: Number(v) });
            setSel(0);
          }}
          options={[
            { value: '1', label: 'Normal' },
            { value: '2', label: 'Flüssig ×2' },
            { value: '3', label: 'Sehr flüssig ×3' },
          ]}
        />
      )}
      {!pixel && smooth > 1 && <p className="hint">Zwischen je zwei Bildern werden {smooth - 1 === 1 ? 'ein Zwischenbild' : `${smooth - 1} Zwischenbilder`} berechnet – gleiche Länge, weichere Bewegung. Die Zwischenbilder (·) folgen deinen Änderungen automatisch.</p>}

      <div className="anim2-strip" role="listbox" aria-label="Bilder der Animation">
        {frames.map((f, i) => (
          <Thumb
            key={i}
            frame={f}
            n={n}
            active={i === (playing ? shown : cur)}
            between={keys[i] < 0}
            edited={!pixel && !!doc.frames?.[frameKey(view, anim.id, i)]}
            label={keys[i] < 0 ? `Zwischenbild nach Bild ${i}` : `Bild ${i + 1}`}
            onClick={() => {
              setPlaying(false);
              setSel(i);
            }}
          />
        ))}
      </div>

      {!playing && (
        <section className="anim2-tune" aria-label="Bild nachjustieren">
          {key < 0 ? (
            <p className="hint">Das ist ein berechnetes Zwischenbild. Es folgt automatisch den Bildern davor und danach – justiere diese.</p>
          ) : pixel ? (
            <p className="hint">Diese Animation besteht aus gemalten Bildern (z. B. importiertes Spritesheet). Bearbeite sie mit „Pixel bearbeiten“.</p>
          ) : (
            <>
              <h4>Bild {cur + 1} nachjustieren</h4>
              <div className="chips" role="radiogroup" aria-label="Körperteil">
                {PARTS[kind].map((p) => (
                  <button key={p.id} type="button" role="radio" aria-checked={part === p.id} className={`chip${part === p.id ? ' is-active' : ''}`} onClick={() => setPart(p.id)}>
                    {p.label}
                  </button>
                ))}
              </div>
              <label className="slot-lock">
                <input type="checkbox" checked={everyFrame} onChange={(e) => setEveryFrame(e.target.checked)} />
                Für alle Bilder dieser Animation
              </label>
              <div className="anim2-pad">
                <button type="button" className="btn btn-secondary" aria-label="Nach links" onClick={() => nudge(-1, 0, 0)}>
                  ←
                </button>
                <button type="button" className="btn btn-secondary" aria-label="Nach oben" onClick={() => nudge(0, -1, 0)}>
                  ↑
                </button>
                <button type="button" className="btn btn-secondary" aria-label="Nach unten" onClick={() => nudge(0, 1, 0)}>
                  ↓
                </button>
                <button type="button" className="btn btn-secondary" aria-label="Nach rechts" onClick={() => nudge(1, 0, 0)}>
                  →
                </button>
                <button type="button" className="btn btn-secondary" aria-label="Gegen den Uhrzeigersinn drehen" onClick={() => nudge(0, 0, -8)}>
                  ↺
                </button>
                <button type="button" className="btn btn-secondary" aria-label="Im Uhrzeigersinn drehen" onClick={() => nudge(0, 0, 8)}>
                  ↻
                </button>
              </div>
              {tuned && (
                <button type="button" className="btn btn-ghost" onClick={() => st.nudgePose(kind, anim.id, tuneKey(view, key), null)}>
                  Nachjustierung dieses Bildes zurücksetzen
                </button>
              )}
              {Object.keys(tune.poses ?? {}).filter((k) => k.startsWith(`${view}:`)).length > 1 && (
                <button type="button" className="btn btn-ghost" onClick={() => Object.keys(tune.poses ?? {}).filter((k) => k.startsWith(`${view}:`)).forEach((k) => st.nudgePose(kind, anim.id, k, null))}>
                  Alle Nachjustierungen dieser Animation zurücksetzen
                </button>
              )}
            </>
          )}
          <div className="button-row">
            {(key >= 0 || pixel) && (
              <Button variant="secondary" icon={<Icon.Pencil size={16} />} onClick={() => setEditing(true)}>
                Pixel bearbeiten
              </Button>
            )}
            {edited && (
              <Button variant="ghost" onClick={() => st.setFrame(kind, frameKey(view, anim.id, cur), null)}>
                Gemalte Änderung verwerfen
              </Button>
            )}
          </div>
          {custom && (
            <div className="button-row anim2-ops">
              <Button variant="secondary" disabled={smooth > 1} onClick={() => st.animFrameOp(kind, anim.id, 'duplicate', key)}>
                Bild doppeln
              </Button>
              {!pixel && (
                <Button variant="secondary" disabled={smooth > 1} onClick={() => st.animFrameOp(kind, anim.id, 'inbetween', key)}>
                  Zwischenbild danach
                </Button>
              )}
              <Button variant="secondary" disabled={smooth > 1 || key <= 0} onClick={() => (st.animFrameOp(kind, anim.id, 'left', key), setSel(cur - 1))}>
                ‹ Nach vorne
              </Button>
              <Button variant="secondary" disabled={smooth > 1 || key >= frames.length - 1} onClick={() => (st.animFrameOp(kind, anim.id, 'right', key), setSel(cur + 1))}>
                Nach hinten ›
              </Button>
              <Button variant="ghost" disabled={smooth > 1 || frames.length <= 1} onClick={() => (st.animFrameOp(kind, anim.id, 'delete', key), setSel(Math.max(0, cur - 1)))}>
                Löschen
              </Button>
            </div>
          )}
          {custom && smooth > 1 && <p className="hint">Bilder doppeln, verschieben und löschen geht bei „Normal“ (ohne Zwischenbilder).</p>}
        </section>
      )}

      <RigSection kind={kind} />

      <Button variant="secondary" block icon={<Icon.Check size={16} />} onClick={() => setReport(checkAnimation(doc, anim, view))}>
        Prüfen: Passen alle Bilder zusammen?
      </Button>
      {report && (
        <div className={`anim2-report${report.issues.some((x) => x.level === 'error') ? ' has-errors' : ' is-ok'}`} role="status">
          {report.issues.length === 0 ? (
            <p>
              <b>Alles passt.</b> Farben, Größe, Bodenkontakt und Übergänge aller {report.frames} Bilder sind stimmig.
            </p>
          ) : (
            <>
              <p>
                <b>{report.issues.length} Hinweise</b> ({report.score}/100) – antippen springt zum Bild:
              </p>
              <ul>
                {report.issues.map((x, k) => (
                  <li key={k}>
                    <button type="button" onClick={() => (setPlaying(false), setSel(x.frame))}>
                      <b>Bild {x.frame + 1}:</b> {x.text}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {custom && (
        <Button
          variant="ghost"
          icon={<Icon.Trash size={16} />}
          onClick={() => {
            st.deleteCustomAnim(kind, anim.id);
            pick(builtIn[0].id);
            toast('Animation gelöscht');
          }}
        >
          Eigene Animation löschen
        </Button>
      )}

      {editing && frames[cur] && (
        <FrameEditor frame={frames[cur]} size={n} prev={frames.length > 1 ? frames[(cur - 1 + frames.length) % frames.length] : undefined} title={`Bild ${cur + 1} bearbeiten`} onSave={saveFrame} onCancel={() => setEditing(false)} />
      )}
    </div>
  );
}

/** new own animation: starts as a copy of an existing one (its poses) or of the figure standing */
function NewAnim({ kind, view, onDone }: { kind: SpriteKind; view: View; onDone: (id: string | null) => void }) {
  const doc = useSprites((s) => s[kind].doc);
  const builtIn = animsFor(kind);
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [count, setCount] = useState(6);
  const create = () => {
    const src = [...builtIn, ...(doc.customAnims ?? [])].find((a) => a.id === from);
    let poses: Pose[];
    if (src && !isPixelAnim(src)) {
      const k = keyPoses(doc, src, view);
      poses = Array.from({ length: count }, (_, i) => structuredClone(k[i % k.length]));
    } else poses = Array.from({ length: count }, () => ({}));
    const id = uid('anim');
    useSprites.getState().addCustomAnim(kind, { id, name: name.trim() || 'Eigene Animation', fps: src?.fps ?? 8, loop: src?.loop ?? true, view: src && 'view' in src ? src.view : view, frames: [], poses });
    onDone(id);
  };
  return (
    <div className="anim2-new">
      <label className="field">
        <span>Name</span>
        <input className="input" value={name} maxLength={40} placeholder="z. B. Wandsprung" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Startet als Kopie von</span>
        <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="">Figur steht still</option>
          {[...builtIn, ...(doc.customAnims ?? []).filter((a) => !isPixelAnim(a))].map((a) => (
            <option key={a.id} value={a.id}>
              {'label' in a ? a.label : a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Bilder: {count}</span>
        <input type="range" min={2} max={12} value={count} onChange={(e) => setCount(Number(e.target.value))} />
      </label>
      <p className="hint">Danach justierst du jedes Bild nach (Körperteile verschieben und drehen) – die Figur bleibt in allen Bildern dieselbe, nichts zerfällt.</p>
      <div className="button-row">
        <Button variant="ghost" onClick={() => onDone(null)}>
          Abbrechen
        </Button>
        <Button variant="primary" onClick={create}>
          Anlegen
        </Button>
      </div>
    </div>
  );
}

/** regions a layer can move as (per kind) */
const RIG_OPTIONS: Record<SpriteKind, RigRegion[]> = {
  character: ['torso', 'head', 'armR', 'armL', 'legR', 'legL', 'weapon', 'effect', 'ground'],
  creature: ['torso', 'head', 'armL', 'armR', 'effect', 'ground'],
  object: ['torso', 'head', 'effect', 'ground'],
};
const regionLabel = (kind: SpriteKind, r: RigRegion) =>
  kind === 'object' ? ({ head: 'Oberteil / Deckel', torso: 'Unterteil', effect: 'Effekt', ground: 'Schatten' } as Record<string, string>)[r] ?? REGION_NAME[r] : kind === 'creature' && (r === 'armL' || r === 'armR') ? (r === 'armL' ? 'Seite links (Flügel, Beine)' : 'Seite rechts (Flügel, Beine)') : REGION_NAME[r];

/**
 * "Ebenen & Bewegung": every layer says how it moves. An own picture is one layer that moves as a
 * whole; cutting parts off (rectangle on the canvas) gives head, arms, legs, weapon their own motion.
 */
function RigSection({ kind }: { kind: SpriteKind }) {
  const doc = useSprites((s) => s[kind].doc);
  const active = useSprites((s) => s[kind].active);
  const cut = useSprites((s) => s.cut);
  const tool = useSprites((s) => s.tool);
  const toast = useEditor((s) => s.toast);
  const st = useSprites.getState();
  const [region, setRegion] = useState<RigRegion>(kind === 'object' ? 'head' : kind === 'creature' ? 'armL' : 'head');
  const fileRef = useRef<HTMLInputElement>(null);
  const cutting = !!cut && cut.kind === kind && tool === 'cut';
  const own = doc.layers.some((l) => l.region);
  const upload = async (f: File | undefined) => {
    if (!f) return;
    try {
      const img = await imageDataFromFile(f);
      st.newFromImage(kind, img, f.name.replace(/\.[^.]+$/, ''));
      toast(kind === 'object' ? 'Bild geladen – wähle eine Animation (z. B. Schweben, Wackeln, Öffnen)' : 'Bild geladen – es bewegt sich erst als Ganzes. Trenne Kopf, Arme, Beine oder Waffe ab, damit sie sich einzeln bewegen.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Bild konnte nicht geladen werden', 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  return (
    <details className="anim2-rig" open={own || cutting}>
      <summary>Eigenes Bild &amp; Ebenen bewegen</summary>
      <p className="hint">Lade ein eigenes Bild hoch (PNG, am besten mit durchsichtigem Hintergrund) – es wird zur Figur und kann sofort animiert werden. Damit sich Teile einzeln bewegen, trennst du sie ab: jede Ebene bewegt sich dann als Kopf, Arm, Bein, Waffe …</p>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
      <Button variant="secondary" icon={<Icon.Upload size={16} />} onClick={() => fileRef.current?.click()}>
        Eigenes Bild hochladen
      </Button>

      <h4>Teil abtrennen</h4>
      <div className="anim2-cut">
        <label className="field">
          <span>Neues Teil bewegt sich als</span>
          <select className="input" value={region} disabled={cutting} onChange={(e) => setRegion(e.target.value as RigRegion)}>
            {RIG_OPTIONS[kind].filter((r) => r !== 'torso').map((r) => (
              <option key={r} value={r}>
                {regionLabel(kind, r)}
              </option>
            ))}
          </select>
        </label>
        {cutting ? (
          <Button variant="primary" icon={<Icon.Check size={16} />} onClick={() => st.stopCut()}>
            Fertig
          </Button>
        ) : (
          <Button variant="secondary" icon={<Icon.Scissors size={16} />} onClick={() => (st.startCut(kind, region) ? toast('Zieh auf der Zeichenfläche ein Rechteck um das Teil – mehrere Rechtecke landen im selben Teil') : toast('Keine Ebene zum Zerteilen', 'error'))}>
            Abtrennen
          </Button>
        )}
      </div>
      {cutting && <p className="hint is-warn">Zieh auf der Zeichenfläche Rechtecke um „{regionLabel(kind, cut!.region)}“. Die Pixel wandern in eine eigene Ebene. Danach „Fertig“ – und das nächste Teil.</p>}

      <h4>Ebenen</h4>
      <ul className="anim2-layers">
        {[...doc.layers].reverse().map((l) => (
          <li key={l.id} className={l.id === active ? 'is-active' : ''}>
            <button type="button" className="anim2-layer-name" onClick={() => st.setActive(kind, l.id)}>
              {l.name}
            </button>
            <select
              className="input"
              aria-label={`${l.name} bewegt sich als`}
              value={l.region ?? ''}
              onChange={(e) => st.setLayerRig(kind, l.id, { region: (e.target.value || null) as RigRegion | null })}
            >
              <option value="">Automatisch</option>
              {RIG_OPTIONS[kind].map((r) => (
                <option key={r} value={r}>
                  {regionLabel(kind, r)}
                </option>
              ))}
            </select>
            {l.region && l.region !== 'ground' && (
              <select className="input anim2-swing" aria-label={`${l.name}: Schwung`} title="Schwung: wie stark das Teil mitschwingt" value={String(l.swing ?? 1)} onChange={(e) => st.setLayerRig(kind, l.id, { swing: Number(e.target.value) })}>
                <option value="1">Schwung normal</option>
                <option value="0.5">Schwung schwach</option>
                <option value="-1">Gegenläufig</option>
                <option value="0">Bewegt sich nicht</option>
              </select>
            )}
          </li>
        ))}
      </ul>
      <div className="button-row">
        <Button
          variant={tool === 'pivot' ? 'primary' : 'ghost'}
          onClick={() => {
            if (tool === 'pivot') return st.stopCut();
            st.setTool('pivot');
            toast('Tipp auf die Zeichenfläche, wo sich die aktive Ebene drehen soll (Schulter, Hüfte, Hals, Griff)');
          }}
        >
          {tool === 'pivot' ? 'Drehpunkt fertig' : 'Drehpunkt der aktiven Ebene setzen'}
        </Button>
      </div>
      <p className="hint">„Automatisch“ = nach Baukasten-Teil und Lage. Mehrere Arme oder Köpfe: jedes als eigene Ebene – jede dreht sich an ihrem eigenen Drehpunkt; „Gegenläufig“ bei jedem zweiten Arm, damit nicht alle im Gleichschritt gehen. Der Drehpunkt wird beim Abtrennen passend gesetzt (Arm: Schulter, Bein: Hüfte, Kopf: Hals) – du kannst ihn selbst versetzen.</p>
    </details>
  );
}
