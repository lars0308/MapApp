import { useRef, useState } from 'react';
import { Button, IconButton } from './ui';
import { Icon } from './icons';
import { useEditor } from '../store/editorStore';
import { useApp } from '../store/appStore';
import { saveNow } from '../persistence/autosave';
import { readFileAsDataUrl } from '../utils/download';
import { askPlan, buildFigure, buildFromPlan, planFigures, setReference } from '../api/describe';
import { formatCost, runAgent } from '../api/agent';

const EXAMPLES = [
  'Kleine Insel mit Dorf und Hafen, viel Wald im Süden, für ein gemütliches RPG',
  'Düsterer Dungeon mit Lava, Bossraum am Ende und vielen Schatztruhen – Roguelite',
  'Platformer-Level im Wald mit Leitern, Wasser und schwebenden Plattformen',
  'Ritter in silberner Rüstung mit rotem Umhang, Schwert und Wappenschild',
  'Grüner Schleim-Boss mit goldener Krone und bösen Augen',
  'Alte Schatztruhe aus dunklem Holz mit Goldbeschlägen',
];
/** chip text: the first part of an example */
const chipLabel = (ex: string) => ex.split(/[,–]| mit /)[0];

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
      setBusy('Die KI plant …');
      await saveNow();
      // 1. quick plan: a map (view, size, generator settings → project + first map) or only figures
      const plan = await askPlan({ text, image: image ?? undefined, tileset: tileset?.dataUrl });
      const figures = planFigures(plan);
      if (plan.create === 'figure' && figures.length) {
        const wish = text;
        const ref = image;
        setText('');
        setImage(null);
        setBusy(null);
        // the AI draws each figure live in the builder (banner shows the steps, stop anytime)
        let cost = 0;
        let words = '';
        for (const f of figures) {
          const r = await buildFigure(f, wish, ref, false);
          cost += r.cost;
          words = r.text || words;
          if (r.stopped) break;
        }
        toast(`${words || plan.summary || 'Figur fertig'} (KI-Kosten ${formatCost(cost)})`, 'success');
        return;
      }
      const done = await buildFromPlan(plan, tileset ?? undefined, setBusy);
      // the project keeps description + picture: later AI requests see them again
      await setReference({ text, image });
      const ownTiles = tileset && done.tilesetId ? { name: tileset.name, id: done.tilesetId } : null;
      setText('');
      setImage(null);
      setTileset(null);
      setBusy(null);
      goTo('map');
      // 2. the AI builds the rest itself, live on the map (banner shows the steps, stop anytime)
      const task = [
        `Der Nutzer möchte: ${text.trim() || '(siehe Referenzbild)'}`,
        `Ich habe das Projekt „${plan.name ?? ''}“ schon angelegt und generiert (${done.summary}). Einstellungen: ${JSON.stringify(plan.generator ?? {})}.`,
        ownTiles
          ? `Der Nutzer hat sein eigenes Tileset „${ownTiles.name}“ (id ${ownTiles.id}) hinzugefügt, die Demo-Tiles sind aus. Ordne es zuerst zu (tileset_render abschnittsweise, tileset_assign: Boden, Wände mit Rollen, Wasser, Wege, Türen, Deko) und generiere dann neu, damit die Karte aus seinen Tiles besteht.`
          : '',
        figures.length ? `Diese eigenen Figuren werden danach separat gezeichnet – baue sie nicht selbst: ${figures.map((f) => f.name ?? f.kind).join(', ')}.` : '',
        'Setze danach alles um, was der Generator nicht von selbst macht: bestimmte Räume, Wege, Wasser, Objekte, Figuren, Hindernisse, Deko an den beschriebenen Stellen. Prüfe dein Ergebnis mit render.',
      ].filter(Boolean).join('\n');
      const words = await runAgent(task, image ? [{ label: 'Referenzbild des Nutzers (so soll es aussehen)', dataUrl: image }] : []);
      let cost = words.cost;
      // 3. own figures from the description (hero, enemies …): drawn in the builder, then onto the map
      for (const f of words.stopped ? [] : figures.slice(0, 2)) {
        const r = await buildFigure(f, text, image, true);
        cost += r.cost;
        if (r.stopped) break;
      }
      if (figures.length) goTo('map');
      toast(`${words.text || done.summary || 'Karte fertig'} (KI-Kosten ${formatCost(cost)})`, 'success');
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
          <p>Eine Karte fürs Spiel oder eine einzelne Figur – Charakter, Kreatur oder Objekt. Die KI baut es für dich.</p>
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
              {chipLabel(ex)}
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
      <p className="hint">Karten baut MapForge mit echten Tiles, Kollision und Godot-Export; Figuren zeichnet die KI Pixel für Pixel im Figuren-Baukasten, mit allen Ansichten und Animationen. Alles bleibt danach bearbeitbar.</p>
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
