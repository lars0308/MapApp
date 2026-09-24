import { useRef, useState } from 'react';
import { Button, IconButton } from './ui';
import { Icon } from './icons';
import { useEditor } from '../store/editorStore';
import { useApp } from '../store/appStore';
import { saveNow } from '../persistence/autosave';
import { readFileAsDataUrl } from '../utils/download';
import { askPlan, buildFromPlan, setReference } from '../api/describe';

const EXAMPLES = [
  'Kleine Insel mit Dorf und Hafen, viel Wald im Süden, für ein gemütliches RPG',
  'Düsterer Dungeon mit Lava, Bossraum am Ende und vielen Schatztruhen – Roguelite',
  'Platformer-Level im Wald mit Leitern, Wasser und schwebenden Plattformen',
];

/**
 * Start page: describe the game / map in your own words (+ reference picture, + own tileset) –
 * the AI plans the settings, the app builds project and map.
 */
export function DescribeCard() {
  const toast = useEditor((s) => s.toast);
  const goTo = useApp((s) => s.goTo);
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [tileset, setTileset] = useState<{ name: string; dataUrl: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const tilesetRef = useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined, kind: 'image' | 'tileset') => {
    if (!file) return;
    if (!/^image\//.test(file.type)) return toast(`${file.name}: kein Bild`, 'error');
    if (kind === 'tileset' && !/png/.test(file.type)) return toast('Tilesets bitte als PNG', 'error');
    const dataUrl = await readFileAsDataUrl(file);
    if (kind === 'image') setImage(dataUrl);
    else setTileset({ name: file.name.replace(/\.[^.]+$/, ''), dataUrl });
  };

  const create = async () => {
    if (!text.trim() && !image) return toast('Beschreibe dein Spiel oder füge ein Referenzbild hinzu', 'error');
    try {
      setBusy('Die KI plant deine Karte …');
      await saveNow();
      const plan = await askPlan({ text, image: image ?? undefined, tileset: tileset?.dataUrl });
      const done = await buildFromPlan(plan, tileset ?? undefined, setBusy);
      // the project keeps description + picture: "Mit KI anpassen" shows them to the AI again
      await setReference({ text, image });
      toast([done.summary || 'Karte erstellt', ...done.tips.map((t) => `Tipp: ${t}`)].join(' '), 'success');
      goTo('map');
      setText('');
      setImage(null);
      setTileset(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Das hat nicht geklappt', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="describe-card" aria-labelledby="describe-title">
      <div className="describe-head">
        <span className="describe-icon" aria-hidden="true">
          <Icon.Spark size={18} />
        </span>
        <div>
          <h2 id="describe-title">Beschreibe dein Spiel</h2>
          <p>Was für ein Spiel, welche Karte, welche Stimmung – die KI stellt alles ein und baut die Karte.</p>
        </div>
      </div>
      <textarea
        className="input describe-text"
        rows={3}
        maxLength={3000}
        placeholder={EXAMPLES[0]}
        value={text}
        disabled={!!busy}
        onChange={(e) => setText(e.target.value)}
        aria-label="Beschreibung deines Spiels und deiner Karte"
      />
      {!text && !busy && (
        <div className="describe-examples" aria-label="Beispiele">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="chip" onClick={() => setText(ex)}>
              {ex.split(/[,–]/)[0]}
            </button>
          ))}
        </div>
      )}
      <input ref={imageRef} type="file" accept="image/*" hidden onChange={(e) => (void pick(e.target.files?.[0], 'image'), (e.target.value = ''))} />
      <input ref={tilesetRef} type="file" accept="image/png" hidden onChange={(e) => (void pick(e.target.files?.[0], 'tileset'), (e.target.value = ''))} />
      <div className="describe-attach">
        <Attachment label="Referenzbild" hint="So soll es aussehen" src={image} onPick={() => imageRef.current?.click()} onClear={() => setImage(null)} disabled={!!busy} />
        <Attachment label="Eigenes Tileset" hint="PNG, wird übernommen" src={tileset?.dataUrl ?? null} pixel onPick={() => tilesetRef.current?.click()} onClear={() => setTileset(null)} disabled={!!busy} />
      </div>
      <Button variant="primary" block icon={<Icon.Spark size={16} />} disabled={!!busy} onClick={() => void create()}>
        {busy ?? 'Mit KI erstellen'}
      </Button>
      <p className="hint">Die KI plant nur die Einstellungen – die Karte baut MapForge mit echten Tiles, Kollision und Godot-Export. Alles bleibt danach bearbeitbar.</p>
    </section>
  );
}

function Attachment({ label, hint, src, pixel, onPick, onClear, disabled }: { label: string; hint: string; src: string | null; pixel?: boolean; onPick: () => void; onClear: () => void; disabled?: boolean }) {
  return (
    <div className={`describe-slot${src ? ' has-image' : ''}`}>
      <button type="button" className="describe-slot-btn" onClick={onPick} disabled={disabled}>
        {src ? <img src={src} alt="" className={pixel ? 'is-pixel' : undefined} /> : <Icon.Plus size={18} />}
        <span>
          <strong>{label}</strong>
          <small>{src ? 'Antippen zum Ändern' : hint}</small>
        </span>
      </button>
      {src && (
        <IconButton label={`${label} entfernen`} onClick={onClear} disabled={disabled}>
          <Icon.Close size={14} />
        </IconButton>
      )}
    </div>
  );
}
