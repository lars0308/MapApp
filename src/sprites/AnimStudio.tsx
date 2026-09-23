import { useEffect, useMemo, useRef, useState } from 'react';
import { useSprites } from './store';
import { animsFor, frameSize, renderAnimation, type AnimDef } from './animation';
import { exportFramesZip, exportSheetPng, exportSpriteGodot } from './exportSprite';
import type { SpriteKind } from './types';
import { Icon } from '../components/icons';
import { Button, IconButton, Segmented, Slider, Toggle } from '../components/ui';
import { useEditor } from '../store/editorStore';
import { useApp } from '../store/appStore';
import { clearPlayerSprite, onPlayerSprite, playerSpriteName, setPlayerSprite } from '../playtest/playerSprite';

// "Animieren": the figure from "Charakter bauen" / "Objekt bauen" gets animations
// (breathing, walking, jumping, sliding …), previewed and exported as spritesheet / Godot.

const KEY = 'mapforge.anim.v1';
interface Settings {
  enabled: Record<string, boolean>;
  fps: Record<string, number>;
}
const readSettings = (): Settings => {
  try {
    return { enabled: {}, fps: {}, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { enabled: {}, fps: {} };
  }
};

type Bg = 'dark' | 'grass' | 'light';
const BG: Record<Bg, string> = { dark: '#1d1c23', grass: '#4b6b3a', light: '#d9d4c8' };

function useFrames(kind: SpriteKind, anim: AnimDef) {
  const doc = useSprites((s) => s[kind].doc);
  const rev = useSprites((s) => s.rev);
  return useMemo(() => renderAnimation(doc, anim), [doc, rev, anim]);
}

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

/** small looping thumbnail in the animation list */
function AnimThumb({ kind, anim, fps, bg }: { kind: SpriteKind; anim: AnimDef; fps: number; bg: string }) {
  const frames = useFrames(kind, anim);
  const n = frameSize(useSprites((s) => s[kind].doc.size));
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let i = 0;
    drawFrame(ref.current, frames[0], n, 2, bg);
    const t = setInterval(() => {
      i = (i + 1) % frames.length;
      drawFrame(ref.current, frames[i], n, 2, bg);
    }, 1000 / fps);
    return () => clearInterval(t);
  }, [frames, n, fps, bg]);
  return <canvas ref={ref} className="anim-thumb" aria-hidden="true" />;
}

export function AnimStudio({ desktop }: { desktop: boolean }) {
  const [kind, setKind] = useState<SpriteKind>('character');
  const loaded = useSprites((s) => s.loaded[kind]);
  const doc = useSprites((s) => s[kind].doc);
  const gallery = useSprites((s) => s.gallery).filter((g) => g.doc.kind === kind);
  const toast = useEditor((s) => s.toast);
  const list = animsFor(kind);
  const [sel, setSel] = useState(list[0].id);
  const anim = list.find((a) => a.id === sel) ?? list[0];
  const [settings, setSettings] = useState<Settings>(readSettings);
  const fps = settings.fps[anim.id] ?? anim.fps;
  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState(0);
  const [onion, setOnion] = useState(false);
  const [bg, setBg] = useState<Bg>('dark');
  const [player, setPlayer] = useState(playerSpriteName());
  const frames = useFrames(kind, anim);
  const big = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void useSprites.getState().load(kind);
  }, [kind]);
  useEffect(() => {
    const off = onPlayerSprite(() => setPlayer(playerSpriteName()));
    return () => {
      off();
    };
  }, []);
  useEffect(() => {
    if (!list.some((a) => a.id === sel)) setSel(list[0].id);
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (s: Settings) => {
    setSettings(s);
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // not stored
    }
  };
  const isOn = (a: AnimDef) => settings.enabled[`${kind}.${a.id}`] ?? true;
  const chosen = list.filter(isOn);
  const fpsMap = Object.fromEntries(list.map((a) => [a.id, settings.fps[a.id] ?? a.fps]));

  // playback
  useEffect(() => {
    setFrame(0);
  }, [anim.id, kind]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % frames.length), 1000 / fps);
    return () => clearInterval(t);
  }, [playing, fps, frames.length]);
  const [scale, setScale] = useState(8);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.max(2, Math.floor((Math.min(el.clientWidth, el.clientHeight) - 24) / frameSize(doc.size)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc.size]);
  const f = Math.min(frame, frames.length - 1);
  useEffect(() => {
    drawFrame(big.current, frames[f], frameSize(doc.size), scale, BG[bg], onion && f > 0 ? frames[f - 1] : onion && anim.loop ? frames[frames.length - 1] : undefined);
  });

  const usePlayer = () => {
    if (kind !== 'character') return;
    toast(setPlayerSprite(doc) ? `„${doc.name}“ ist jetzt die Spielfigur im Test (▶)` : 'Konnte nicht gespeichert werden', 'success');
  };

  return (
    <div className={`anim-studio${desktop ? ' is-desktop' : ' is-mobile'}`}>
      <div className="studio-bar anim-bar">
        <Segmented
          label="Was animieren?"
          value={kind}
          onChange={(k) => setKind(k)}
          options={[
            { value: 'character', label: 'Charakter' },
            { value: 'object', label: 'Objekt' },
          ]}
        />
        <strong className="anim-name" title="Aus „Charakter bauen“ / „Objekt bauen“">
          {doc.name}
        </strong>
        {gallery.length > 0 && (
          <select className="input anim-source" value="" aria-label="Andere Figur laden" onChange={(e) => e.target.value && void useSprites.getState().openFromGallery(kind, e.target.value)}>
            <option value="">Aus Galerie laden …</option>
            {gallery.map((g) => (
              <option key={g.doc.id} value={g.doc.id}>
                {g.doc.name}
              </option>
            ))}
          </select>
        )}
        <Button variant="ghost" icon={<Icon.Pencil size={16} />} onClick={() => useApp.getState().goTo(kind)}>
          Bearbeiten
        </Button>
      </div>

      <div className="anim-work">
        <aside className="anim-list" aria-label="Animationen">
          {list.map((a) => (
            <div key={a.id} className={`anim-item${a.id === anim.id ? ' is-active' : ''}`}>
              <button type="button" className="anim-pick" onClick={() => (setSel(a.id), setPlaying(true))} aria-pressed={a.id === anim.id}>
                {loaded && <AnimThumb kind={kind} anim={a} fps={fpsMap[a.id]} bg={BG[bg]} />}
                <span>
                  <strong>{a.label}</strong>
                  <small>
                    {a.poses.length} Frames · {fpsMap[a.id]} fps{a.loop ? ' · Schleife' : ''}
                  </small>
                </span>
              </button>
              <label className="anim-export" title="Im Export enthalten">
                <input type="checkbox" checked={isOn(a)} onChange={(e) => save({ ...settings, enabled: { ...settings.enabled, [`${kind}.${a.id}`]: e.target.checked } })} />
                Export
              </label>
            </div>
          ))}
        </aside>

        <section className="anim-stage-wrap">
          <div className="anim-stage" ref={stage}>
            <canvas ref={big} aria-label={`Vorschau ${anim.label}`} />
          </div>
          <p className="hint anim-hint">{anim.hint}</p>
          <div className="anim-controls">
            <IconButton label="Vorheriges Bild" onClick={() => (setPlaying(false), setFrame((f + frames.length - 1) % frames.length))}>
              <Icon.ChevronRight size={18} style={{ transform: 'rotate(180deg)' }} />
            </IconButton>
            <button type="button" className="btn-play" aria-label={playing ? 'Pause' : 'Abspielen'} onClick={() => setPlaying(!playing)}>
              {playing ? <Icon.Close size={18} /> : <Icon.Play size={18} />}
            </button>
            <IconButton label="Nächstes Bild" onClick={() => (setPlaying(false), setFrame((f + 1) % frames.length))}>
              <Icon.ChevronRight size={18} />
            </IconButton>
            <span className="anim-frame-no">
              Bild {f + 1} / {frames.length}
            </span>
          </div>
          <div className="anim-strip" role="listbox" aria-label="Einzelbilder">
            {frames.map((fr, i) => (
              <FrameThumb key={i} frame={fr} n={frameSize(doc.size)} bg={BG[bg]} active={i === f} onClick={() => (setPlaying(false), setFrame(i))} />
            ))}
          </div>
        </section>

        <aside className="anim-side">
          <Slider label="Geschwindigkeit" value={fps} min={1} max={24} unit="fps" onChange={(v) => save({ ...settings, fps: { ...settings.fps, [anim.id]: v } })} />
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

          <h4 className="subhead">Export ({chosen.length} Animationen)</h4>
          <div className="anim-export-buttons">
            <Button variant="primary" icon={<Icon.Download size={16} />} disabled={!chosen.length} onClick={() => (exportSpriteGodot(doc, chosen, fpsMap), toast('Godot-Paket exportiert', 'success'))}>
              Godot-Paket (ZIP)
            </Button>
            <Button icon={<Icon.Download size={16} />} disabled={!chosen.length} onClick={() => exportSheetPng(doc, chosen, fpsMap)}>
              Spritesheet PNG
            </Button>
            <Button icon={<Icon.Download size={16} />} disabled={!chosen.length} onClick={() => exportSheetPng(doc, chosen, fpsMap, 4)}>
              Spritesheet 4×
            </Button>
            <Button icon={<Icon.Download size={16} />} disabled={!chosen.length} onClick={() => exportFramesZip(doc, chosen, fpsMap)}>
              Einzelbilder (ZIP)
            </Button>
          </div>
          <p className="hint">Godot-Paket: Ordner ins Projekt ziehen, <code>.tscn</code> in die Szene ziehen – Figur läuft mit Pfeiltasten. Dazu PNG + JSON für andere Engines.</p>

          {kind === 'character' && (
            <>
              <h4 className="subhead">Spielfigur im Test</h4>
              <p className="muted small">{player ? `Aktuell: „${player}“` : 'Aktuell: Standard-Figur'}</p>
              <div className="button-row">
                <Button variant="primary" icon={<Icon.Person size={16} />} onClick={usePlayer}>
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
          <p className="hint">Richtungen (seitlich, hinten) und Bild-für-Bild-Bearbeitung folgen als nächster Schritt.</p>
        </aside>
      </div>
    </div>
  );
}

function FrameThumb({ frame, n, bg, active, onClick }: { frame: Uint8ClampedArray; n: number; bg: string; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    drawFrame(ref.current, frame, n, 2, bg);
  }, [frame, n, bg]);
  return (
    <button type="button" role="option" aria-selected={active} className={`anim-frame${active ? ' is-active' : ''}`} onClick={onClick}>
      <canvas ref={ref} />
    </button>
  );
}
