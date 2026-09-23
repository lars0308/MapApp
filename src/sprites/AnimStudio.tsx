import { useEffect, useMemo, useRef, useState } from 'react';
import { compose, toPng, useSprites } from './store';
import { animsFor, frameKey, frameSize, framesOf, type AnimDef } from './animation';
import { ANIM_PRESETS } from './animPresets';
import { exportFramesZip, exportSheetPng, exportSpriteGodot, type ExportChoice, isPlatformer } from './exportSprite';
import { FrameEditor } from './FrameEditor';
import { VIEWS, type CustomAnim, type SpriteKind, type View } from './types';
import { HelpTip } from '../components/HelpTip';
import { Icon } from '../components/icons';
import { Button, IconButton, NumberField, Segmented, Slider, Toggle } from '../components/ui';
import { useEditor } from '../store/editorStore';
import { useApp } from '../store/appStore';
import { uid } from '../utils/id';
import { readFileAsDataUrl } from '../utils/download';
import { clearPlayerSprite, onPlayerSprite, playerSpriteName, setPlayerSprite } from '../playtest/playerSprite';

// "Animieren": the figure from the builders gets animations – ready-made ones (with presets),
// in three directions, frames can be edited by hand, own animations and imported spritesheets.

const KEY = 'mapforge.anim.v2';
interface Settings {
  enabled: Record<string, boolean>;
  fps: Record<string, number>;
  views: Partial<Record<SpriteKind, View[]>>;
}
const readSettings = (): Settings => {
  try {
    return { enabled: {}, fps: {}, views: {}, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { enabled: {}, fps: {}, views: {} };
  }
};

type Bg = 'dark' | 'grass' | 'light';
const BG: Record<Bg, string> = { dark: '#1d1c23', grass: '#4b6b3a', light: '#d9d4c8' };
const KIND_LABEL: Record<SpriteKind, string> = { character: 'Charakter', creature: 'Kreatur', object: 'Objekt' };

type Sel = { type: 'builtin'; id: string } | { type: 'custom'; id: string };

function drawFrame(c: HTMLCanvasElement | null, frame: Uint8ClampedArray | undefined, n: number, scale: number, bg: string, onion?: Uint8ClampedArray) {
  if (!c || !frame) return;
  c.width = c.height = n * scale;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  const off = document.createElement('canvas');
  off.width = off.height = n;
  const og = off.getContext('2d')!;
  if (onion) {
    og.putImageData(new ImageData(new Uint8ClampedArray(onion), n, n), 0, 0);
    g.globalAlpha = 0.28;
    g.drawImage(off, 0, 0, n * scale, n * scale);
    g.globalAlpha = 1;
  }
  og.putImageData(new ImageData(new Uint8ClampedArray(frame), n, n), 0, 0);
  g.drawImage(off, 0, 0, n * scale, n * scale);
}

/** small looping thumbnail */
function Thumb({ frames, n, fps, bg }: { frames: Uint8ClampedArray[]; n: number; fps: number; bg: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let i = 0;
    drawFrame(ref.current, frames[0], n, 2, bg);
    const t = setInterval(() => {
      i = (i + 1) % Math.max(1, frames.length);
      drawFrame(ref.current, frames[i], n, 2, bg);
    }, 1000 / fps);
    return () => clearInterval(t);
  }, [frames, n, fps, bg]);
  return <canvas ref={ref} className="anim-thumb" aria-hidden="true" />;
}

function BuiltinThumb({ kind, anim, view, fps, bg }: { kind: SpriteKind; anim: AnimDef; view: View; fps: number; bg: string }) {
  const doc = useSprites((s) => s[kind].doc);
  const rev = useSprites((s) => s.rev);
  const frames = useMemo(() => framesOf(doc, anim, view), [doc, rev, anim, view]);
  return <Thumb frames={frames} n={frameSize(doc.size)} fps={fps} bg={bg} />;
}

/** First step: which saved figure should be animated? */
function FigurePicker({ kind, setKind, onPick }: { kind: SpriteKind; setKind: (k: SpriteKind) => void; onPick: () => void }) {
  const gallery = useSprites((s) => s.gallery).filter((g) => g.doc.kind === kind);
  const current = useSprites((s) => s[kind].doc);
  const rev = useSprites((s) => s.rev);
  const loaded = useSprites((s) => s.loaded[kind]);
  const thumb = useMemo(() => (loaded ? toPng(compose(current), current.size) : ''), [current, rev, loaded]);
  useEffect(() => {
    void useSprites.getState().load(kind);
  }, [kind]);
  const noun = kind === 'object' ? 'Objekt' : kind === 'creature' ? 'Kreatur' : 'Figur';
  return (
    <div className="page-inner anim-picker">
      <h1 className="page-title">Was möchtest du animieren?</h1>
      <Segmented
        label="Art"
        value={kind}
        onChange={setKind}
        options={(['character', 'creature', 'object'] as SpriteKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
      />
      <h2 className="subhead">Gespeicherte {kind === 'object' ? 'Objekte' : kind === 'creature' ? 'Kreaturen' : 'Charaktere'}</h2>
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
        <p className="muted small">
          Noch nichts gespeichert. Im Baukasten unter <strong>Galerie → Aktuellen speichern</strong> ablegen – dann erscheint es hier.
        </p>
      )}
      <h2 className="subhead">Oder</h2>
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
        <button type="button" className="start-continue" onClick={() => useApp.getState().goTo(kind)}>
          <Icon.Plus size={18} />
          <span>{kind === 'object' ? 'Neues Objekt bauen' : `Neue ${noun} bauen`}</span>
          <Icon.ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export function AnimStudio({ desktop }: { desktop: boolean }) {
  const [kind, setKind] = useState<SpriteKind>('character');
  const [picked, setPicked] = useState(false);
  if (!picked) return <FigurePicker kind={kind} setKind={setKind} onPick={() => setPicked(true)} />;
  return <AnimWorkspace desktop={desktop} kind={kind} onBack={() => setPicked(false)} />;
}

function AnimWorkspace({ desktop, kind, onBack }: { desktop: boolean; kind: SpriteKind; onBack: () => void }) {
  const loaded = useSprites((s) => s.loaded[kind]);
  const doc = useSprites((s) => s[kind].doc);
  const rev = useSprites((s) => s.rev);
  const toast = useEditor((s) => s.toast);
  const list = animsFor(kind);
  const custom = doc.customAnims ?? [];
  const [sel, setSel] = useState<Sel>({ type: 'builtin', id: list[0].id });
  const [settings, setSettings] = useState<Settings>(readSettings);
  const [view, setView] = useState<View>('front');
  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState(0);
  const [onion, setOnion] = useState(false);
  const [bg, setBg] = useState<Bg>('dark');
  const [editing, setEditing] = useState(false);
  const [player, setPlayer] = useState(playerSpriteName());
  const [importImg, setImportImg] = useState<{ img: HTMLImageElement; name: string; fw: number; fh: number } | null>(null);
  const big = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const F = frameSize(doc.size);
  const hasViews = kind !== 'object';

  useEffect(() => {
    void useSprites.getState().load(kind);
    setSel({ type: 'builtin', id: animsFor(kind)[0].id });
    if (kind === 'object') setView('front');
  }, [kind]);
  useEffect(() => {
    const off = onPlayerSprite(() => setPlayer(playerSpriteName()));
    return () => {
      off();
    };
  }, []);
  const save = (s: Settings) => {
    setSettings(s);
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // not stored
    }
  };

  const builtin = sel.type === 'builtin' ? (list.find((a) => a.id === sel.id) ?? list[0]) : null;
  const cAnim = sel.type === 'custom' ? custom.find((a) => a.id === sel.id) : undefined;
  useEffect(() => {
    if (sel.type === 'custom' && !cAnim) setSel({ type: 'builtin', id: list[0].id });
  }, [sel, cAnim, list]);
  const fpsOf = (a: AnimDef) => settings.fps[a.id] ?? a.fps;
  const fps = builtin ? fpsOf(builtin) : (cAnim?.fps ?? 8);
  const curView = cAnim ? cAnim.view : view;
  const frames = useMemo(() => (builtin ? framesOf(doc, builtin, view) : (cAnim?.frames ?? [])), [doc, rev, builtin, cAnim, view]);
  const isOn = (a: AnimDef) => settings.enabled[`${kind}.${a.id}`] ?? true;
  const chosen = list.filter(isOn);
  // figures always get all directions (↓ ↑ → and ← mirrored); only a side-scroller needs just the side
  const sideOnly = settings.views[kind]?.length === 1 && settings.views[kind]![0] === 'side';
  const exportViews: View[] = hasViews ? (sideOnly ? ['side'] : VIEWS.map((v) => v.id)) : ['front'];
  const fpsMap = Object.fromEntries(list.map((a) => [a.id, fpsOf(a)]));
  const choice: ExportChoice = { anims: chosen, fps: fpsMap, views: exportViews, custom };

  // playback
  useEffect(() => {
    setFrame(0);
  }, [sel.id, kind, view]);
  useEffect(() => {
    if (!playing || editing) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % Math.max(1, frames.length)), 1000 / fps);
    return () => clearInterval(t);
  }, [playing, fps, frames.length, editing]);
  const [scale, setScale] = useState(8);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.max(2, Math.floor((Math.min(el.clientWidth, el.clientHeight) - 24) / F))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [F, editing]);
  const f = Math.min(frame, Math.max(0, frames.length - 1));
  const loop = builtin ? builtin.loop : (cAnim?.loop ?? true);
  useEffect(() => {
    drawFrame(big.current, frames[f], F, scale, BG[bg], onion && f > 0 ? frames[f - 1] : onion && loop ? frames[frames.length - 1] : undefined);
  });

  const editedKey = builtin ? frameKey(view, builtin.id, f) : '';
  const isEdited = !!(builtin && doc.frames?.[editedKey]);
  const st = useSprites.getState();

  const saveFrame = (d: Uint8ClampedArray) => {
    if (builtin) st.setFrame(kind, editedKey, d);
    else if (cAnim) st.updateCustomAnim(kind, cAnim.id, { frames: cAnim.frames.map((x, i) => (i === f ? d : x)) });
    setEditing(false);
    toast('Bild übernommen', 'success');
  };

  const newCustom = (copy: boolean) => {
    const a: CustomAnim = {
      id: uid(),
      name: copy && builtin ? `${builtin.label} (eigen)` : 'Eigene Animation',
      fps,
      loop: true,
      view: curView,
      frames: copy && frames.length ? frames.map((x) => new Uint8ClampedArray(x)) : [new Uint8ClampedArray(F * F * 4)],
    };
    st.addCustomAnim(kind, a);
    setSel({ type: 'custom', id: a.id });
    toast(copy ? 'Kopie angelegt – jetzt Bild für Bild anpassen' : 'Leere Animation angelegt', 'success');
  };
  const customFrames = (fn: (fr: Uint8ClampedArray[]) => Uint8ClampedArray[], to?: number) => {
    if (!cAnim) return;
    st.updateCustomAnim(kind, cAnim.id, { frames: fn(cAnim.frames) });
    if (to !== undefined) setFrame(to);
    setPlaying(false);
  };

  const pickSheet = async (file: File | undefined) => {
    if (!file) return;
    const url = await readFileAsDataUrl(file);
    const img = new Image();
    img.onload = () => {
      const h = img.naturalHeight;
      const w = img.naturalWidth;
      // guess: one row of square frames, else frames the size of our frames
      const fh = w % h === 0 ? h : Math.min(h, F);
      setImportImg({ img, name: file.name.replace(/\.[^.]+$/, ''), fw: fh, fh });
    };
    img.src = url;
    if (fileRef.current) fileRef.current.value = '';
  };
  const doImport = () => {
    if (!importImg) return;
    const { img, fw, fh, name } = importImg;
    const cols = Math.floor(img.naturalWidth / fw);
    const rows = Math.floor(img.naturalHeight / fh);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    let first = '';
    let count = 0;
    for (let r = 0; r < rows; r++) {
      const fr: Uint8ClampedArray[] = [];
      for (let k = 0; k < cols; k++) {
        const src = g.getImageData(k * fw, r * fh, fw, fh).data;
        if (!src.some((v, i) => i % 4 === 3 && v > 0)) continue; // empty cell
        const out = new Uint8ClampedArray(F * F * 4);
        // centred horizontally, feet at the bottom margin; larger frames are cropped
        const ox = Math.floor((F - fw) / 2);
        const oy = F - fh - Math.max(0, Math.floor((F - fh) / 6));
        for (let y = 0; y < fh; y++)
          for (let x = 0; x < fw; x++) {
            const tx = x + ox;
            const ty = y + oy;
            if (tx < 0 || ty < 0 || tx >= F || ty >= F) continue;
            const s = (y * fw + x) * 4;
            if (src[s + 3]) out.set(src.subarray(s, s + 4), (ty * F + tx) * 4);
          }
        fr.push(out);
      }
      if (!fr.length) continue;
      const a: CustomAnim = { id: uid(), name: rows > 1 ? `${name} ${r + 1}` : name, fps: 8, loop: true, view: curView, frames: fr };
      st.addCustomAnim(kind, a);
      first ||= a.id;
      count++;
    }
    setImportImg(null);
    if (first) setSel({ type: 'custom', id: first });
    toast(count ? `${count} Animation${count > 1 ? 'en' : ''} importiert` : 'Keine Bilder gefunden', count ? 'success' : 'error');
  };

  const applyPreset = (id: string) => {
    const p = ANIM_PRESETS.find((x) => x.id === id)!;
    const enabled = { ...settings.enabled };
    for (const a of list) enabled[`${kind}.${a.id}`] = p.anims[0] === '*' || p.anims.includes(a.id);
    save({ ...settings, enabled, views: { ...settings.views, [kind]: p.views } });
    const firstAnim = p.anims[0] === '*' ? list[0].id : p.anims[0];
    setSel({ type: 'builtin', id: firstAnim });
    setView(p.views[0]);
    toast(`Standard „${p.label}“: ${p.anims[0] === '*' ? list.length : p.anims.length} Animationen, ${p.views.length} Richtung${p.views.length > 1 ? 'en' : ''}`, 'success');
  };

  const title = builtin ? `${builtin.label} · Bild ${f + 1}` : `${cAnim?.name ?? ''} · Bild ${f + 1}`;

  return (
    <div className={`anim-studio${desktop ? ' is-desktop' : ' is-mobile'}`}>
      <div className="studio-bar anim-bar">
        <Button variant="ghost" icon={<Icon.ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} />} onClick={onBack}>
          Auswahl
        </Button>
        <strong className="anim-name" title={KIND_LABEL[kind]}>
          {doc.name}
        </strong>
        <Button icon={<Icon.Save size={16} />} onClick={() => toast(st.saveToGallery(kind) ? 'In der Galerie gespeichert – mit Animationen und bearbeiteten Bildern' : 'Speicher voll', 'success')}>
          Speichern
        </Button>
        <Button variant="ghost" icon={<Icon.Pencil size={16} />} onClick={() => useApp.getState().goTo(kind)}>
          Bearbeiten
        </Button>
      </div>
      <HelpTip
        id="animate"
        steps={[
          <>Eine Animation aus der Liste antippen (oder oben einen <b>Standard</b> wählen) – die Vorschau läuft sofort.</>,
          <>Mit <b>Richtung</b> prüfen, ob vorne, Seite und hinten gut aussehen. Einzelne Bilder lassen sich mit „Bild bearbeiten“ nachzeichnen.</>,
          <>Unten <b>Godot-Paket (ZIP)</b> laden, entpacken und den Ordner in dein Godot-Projekt ziehen – die Szene ist sofort spielbar.</>,
        ]}
      />

      <div className="anim-work">
        <aside className="anim-list" aria-label="Animationen">
          <div className="anim-presets">
            <h4 className="subhead">Standards</h4>
            <div className="chips">
              {ANIM_PRESETS.filter((p) => p.kind === kind).map((p) => (
                <button key={p.id} type="button" className="chip" title={p.text} onClick={() => applyPreset(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <h4 className="subhead">Animationen</h4>
          {list.map((a) => (
            <div key={a.id} className={`anim-item${sel.type === 'builtin' && a.id === builtin?.id ? ' is-active' : ''}`}>
              <button type="button" className="anim-pick" onClick={() => (setSel({ type: 'builtin', id: a.id }), setPlaying(true), setEditing(false))} aria-pressed={sel.type === 'builtin' && a.id === builtin?.id}>
                {loaded && <BuiltinThumb kind={kind} anim={a} view={view} fps={fpsOf(a)} bg={BG[bg]} />}
                <span>
                  <strong>{a.label}</strong>
                  <small>
                    {a.poses.length} Bilder · {fpsOf(a)} fps{a.loop ? ' · Schleife' : ''}
                  </small>
                </span>
              </button>
              <label className="anim-export" title="Im Export enthalten">
                <input type="checkbox" checked={isOn(a)} onChange={(e) => save({ ...settings, enabled: { ...settings.enabled, [`${kind}.${a.id}`]: e.target.checked } })} />
                Export
              </label>
            </div>
          ))}
          <h4 className="subhead">Eigene Animationen</h4>
          {custom.map((a) => (
            <div key={a.id} className={`anim-item${cAnim?.id === a.id ? ' is-active' : ''}`}>
              <button type="button" className="anim-pick" onClick={() => (setSel({ type: 'custom', id: a.id }), setPlaying(true), setEditing(false))}>
                <Thumb frames={a.frames} n={F} fps={a.fps} bg={BG[bg]} />
                <span>
                  <strong>{a.name}</strong>
                  <small>
                    {a.frames.length} Bilder · {a.fps} fps · {VIEWS.find((v) => v.id === a.view)?.label}
                  </small>
                </span>
              </button>
            </div>
          ))}
          <div className="anim-new">
            <Button icon={<Icon.Plus size={16} />} onClick={() => newCustom(true)} title="Kopie der gewählten Animation zum Bearbeiten">
              Kopie bearbeiten
            </Button>
            <Button onClick={() => newCustom(false)}>Leer</Button>
            <Button icon={<Icon.Upload size={16} />} onClick={() => fileRef.current?.click()}>
              Spritesheet
            </Button>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/gif,image/webp" hidden onChange={(e) => void pickSheet(e.target.files?.[0])} />
        </aside>

        <section className="anim-stage-wrap">
          {hasViews && !cAnim && (
            <div className="anim-view-row">
              <Segmented label="Richtung" value={view} onChange={(v) => setView(v)} options={VIEWS.map((v) => ({ value: v.id, label: v.label }))} />
            </div>
          )}
          {editing && frames[f] ? (
            <FrameEditor frame={frames[f]} size={F} prev={f > 0 ? frames[f - 1] : loop ? frames[frames.length - 1] : undefined} title={title} onSave={saveFrame} onCancel={() => setEditing(false)} />
          ) : (
            <>
              <div className="anim-stage" ref={stage}>
                <canvas ref={big} aria-label="Vorschau" />
              </div>
              <p className="hint anim-hint">
                {builtin?.hint ?? 'Eigene Animation – Bild für Bild bearbeitbar.'}
                {isEdited && ' · dieses Bild ist von Hand bearbeitet'}
              </p>
              <div className="anim-controls">
                <IconButton label="Vorheriges Bild" onClick={() => (setPlaying(false), setFrame((f + frames.length - 1) % Math.max(1, frames.length)))}>
                  <Icon.ChevronRight size={18} style={{ transform: 'rotate(180deg)' }} />
                </IconButton>
                <button type="button" className="btn-play" aria-label={playing ? 'Pause' : 'Abspielen'} onClick={() => setPlaying(!playing)}>
                  {playing ? <Icon.Close size={18} /> : <Icon.Play size={18} />}
                </button>
                <IconButton label="Nächstes Bild" onClick={() => (setPlaying(false), setFrame((f + 1) % Math.max(1, frames.length)))}>
                  <Icon.ChevronRight size={18} />
                </IconButton>
                <span className="anim-frame-no">
                  Bild {f + 1} / {frames.length}
                </span>
                <Button icon={<Icon.Pencil size={16} />} onClick={() => (setPlaying(false), setEditing(true))}>
                  Bild bearbeiten
                </Button>
                {isEdited && (
                  <Button variant="ghost" onClick={() => st.setFrame(kind, editedKey, null)}>
                    Zurücksetzen
                  </Button>
                )}
              </div>
              {cAnim && (
                <div className="anim-custom-tools">
                  <input className="input" value={cAnim.name} aria-label="Name der Animation" onChange={(e) => st.updateCustomAnim(kind, cAnim.id, { name: e.target.value.slice(0, 30) })} />
                  <Button icon={<Icon.Plus size={16} />} onClick={() => customFrames((fr) => [...fr.slice(0, f + 1), new Uint8ClampedArray(fr[f]), ...fr.slice(f + 1)], f + 1)}>
                    Bild duplizieren
                  </Button>
                  <Button onClick={() => customFrames((fr) => [...fr.slice(0, f + 1), new Uint8ClampedArray(F * F * 4), ...fr.slice(f + 1)], f + 1)}>Leeres Bild</Button>
                  <IconButton label="Bild nach links" disabled={f === 0} onClick={() => customFrames((fr) => fr.map((x, i) => (i === f - 1 ? fr[f] : i === f ? fr[f - 1] : x)), f - 1)}>
                    <Icon.ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} />
                  </IconButton>
                  <IconButton label="Bild nach rechts" disabled={f >= cAnim.frames.length - 1} onClick={() => customFrames((fr) => fr.map((x, i) => (i === f + 1 ? fr[f] : i === f ? fr[f + 1] : x)), f + 1)}>
                    <Icon.ChevronRight size={16} />
                  </IconButton>
                  <IconButton label="Bild löschen" disabled={cAnim.frames.length <= 1} onClick={() => customFrames((fr) => fr.filter((_, i) => i !== f), Math.max(0, f - 1))}>
                    <Icon.Trash size={16} />
                  </IconButton>
                  {hasViews && (
                    <Segmented label="Richtung der Animation" value={cAnim.view} onChange={(v) => st.updateCustomAnim(kind, cAnim.id, { view: v })} options={VIEWS.map((v) => ({ value: v.id, label: v.label }))} />
                  )}
                  <Toggle label="Schleife" checked={cAnim.loop} onChange={(loop) => st.updateCustomAnim(kind, cAnim.id, { loop })} />
                  <Button variant="danger" onClick={() => st.deleteCustomAnim(kind, cAnim.id)}>
                    Animation löschen
                  </Button>
                </div>
              )}
              <div className="anim-strip" role="listbox" aria-label="Einzelbilder">
                {frames.map((fr, i) => (
                  <FrameThumb key={i} frame={fr} n={F} bg={BG[bg]} active={i === f} edited={!!(builtin && doc.frames?.[frameKey(view, builtin.id, i)])} onClick={() => (setPlaying(false), setFrame(i))} />
                ))}
              </div>
            </>
          )}
        </section>

        <aside className="anim-side">
          <Slider
            label="Geschwindigkeit"
            value={fps}
            min={1}
            max={24}
            unit="fps"
            onChange={(v) => (builtin ? save({ ...settings, fps: { ...settings.fps, [builtin.id]: v } }) : cAnim && st.updateCustomAnim(kind, cAnim.id, { fps: v }))}
          />
          <Toggle label="Zwiebelschicht" description="Vorheriges Bild durchscheinend zeigen" checked={onion} onChange={setOnion} />
          <div className="field">
            <label>Hintergrund</label>
            <Segmented
              label="Hintergrund"
              value={bg}
              onChange={setBg}
              options={[
                { value: 'dark', label: 'Dunkel' },
                { value: 'grass', label: 'Wiese' },
                { value: 'light', label: 'Hell' },
              ]}
            />
          </div>

          <h4 className="subhead">
            Export ({chosen.length + custom.length} Animationen{hasViews ? (sideOnly ? ' · Seite, links gespiegelt' : ' · vorne, hinten, Seite – links gespiegelt') : ''})
          </h4>
          {hasViews && (
            <div className="anim-dirs">
              <Segmented
                label="Richtungen im Export"
                value={sideOnly ? 'side' : 'all'}
                onChange={(v) => save({ ...settings, views: { ...settings.views, [kind]: v === 'side' ? ['side'] : VIEWS.map((x) => x.id) } })}
                options={[
                  { value: 'all', label: '4 Richtungen ↓ ↑ ← →' },
                  { value: 'side', label: '2 Richtungen ← → (Platformer)' },
                ]}
              />
            </div>
          )}
          <div className="anim-export-buttons">
            <Button variant="primary" icon={<Icon.Download size={16} />} disabled={!chosen.length && !custom.length} onClick={() => (exportSpriteGodot(doc, choice), toast('Godot-Paket exportiert', 'success'))}>
              Godot-Paket (ZIP)
            </Button>
            <Button icon={<Icon.Download size={16} />} disabled={!chosen.length && !custom.length} onClick={() => exportSheetPng(doc, choice)}>
              Spritesheet PNG
            </Button>
            <Button icon={<Icon.Download size={16} />} disabled={!chosen.length && !custom.length} onClick={() => exportSheetPng(doc, choice, 4)}>
              Spritesheet 4×
            </Button>
            <Button icon={<Icon.Download size={16} />} disabled={!chosen.length && !custom.length} onClick={() => exportFramesZip(doc, choice)}>
              Einzelbilder (ZIP)
            </Button>
          </div>
          <p className="hint">
            Godot-Paket: Ordner ins Projekt ziehen, <code>.tscn</code> in die Szene ziehen – {kind === 'creature' ? 'der Gegner verfolgt die Spielfigur, greift an, nimmt Schaden und stirbt' : kind === 'character' ? (isPlatformer(doc, choice) ? 'nur Seite gewählt → Platformer-Steuerung: ← → laufen, ↑/Leertaste springt, J greift an, mit Schwerkraft' : 'Pfeiltasten laufen, Shift rennt, Leertaste/J greift an (mit Richtungen)') : 'Objekt spielt seine Animation'}. Dazu PNG + JSON für andere Engines.
          </p>

          {kind !== 'object' && (
            <>
              <h4 className="subhead">Spielfigur im Test</h4>
              <p className="muted small">{player ? `Aktuell: „${player}“` : 'Aktuell: Standard-Figur'}</p>
              <div className="button-row">
                <Button variant="primary" icon={<Icon.Person size={16} />} onClick={() => toast(setPlayerSprite(doc) ? `„${doc.name}“ ist jetzt die Spielfigur im Test (▶) – mit Richtungen` : 'Konnte nicht gespeichert werden', 'success')}>
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
        </aside>
      </div>

      {importImg && (
        <div className="quick-pick-backdrop" role="presentation" onClick={() => setImportImg(null)}>
          <div className="save-part-dialog" role="dialog" aria-label="Spritesheet importieren" onClick={(e) => e.stopPropagation()}>
            <h3>Spritesheet importieren</h3>
            <p className="hint">
              {importImg.img.naturalWidth} × {importImg.img.naturalHeight} px. Jede Zeile wird eine eigene Animation, leere Zellen werden übersprungen. Bilder werden in {F} × {F}-Frames gesetzt (Füße unten).
            </p>
            <div className="grid-2">
              <NumberField label="Frame-Breite" value={importImg.fw} min={4} max={512} suffix="px" onChange={(v) => setImportImg({ ...importImg, fw: v })} />
              <NumberField label="Frame-Höhe" value={importImg.fh} min={4} max={512} suffix="px" onChange={(v) => setImportImg({ ...importImg, fh: v })} />
            </div>
            <p className="muted small">
              = {Math.floor(importImg.img.naturalWidth / importImg.fw)} Bilder pro Zeile × {Math.floor(importImg.img.naturalHeight / importImg.fh)} Zeilen
              {(importImg.fw > F || importImg.fh > F) && ` · größer als ${F} px – wird beschnitten`}
            </p>
            <div className="button-row">
              <Button variant="ghost" onClick={() => setImportImg(null)}>
                Abbrechen
              </Button>
              <Button variant="primary" icon={<Icon.Upload size={16} />} onClick={doImport}>
                Importieren
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FrameThumb({ frame, n, bg, active, edited, onClick }: { frame: Uint8ClampedArray; n: number; bg: string; active: boolean; edited: boolean; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    drawFrame(ref.current, frame, n, 2, bg);
  }, [frame, n, bg]);
  return (
    <button type="button" role="option" aria-selected={active} className={`anim-frame${active ? ' is-active' : ''}${edited ? ' is-edited' : ''}`} onClick={onClick} title={edited ? 'Von Hand bearbeitet' : undefined}>
      <canvas ref={ref} />
    </button>
  );
}
