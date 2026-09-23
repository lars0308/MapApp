import { useRef, useState } from 'react';
import type { Perspective, TileMeta, Tileset } from '../../types';
import { PERSPECTIVES } from '../../types';
import { PERSPECTIVE_INFO } from '../../generator/perspective';
import { deleteLibraryTileset, saveLibraryTileset, toLibraryTileset, type LibraryTileset } from '../../persistence/db';
import { summarizeTileset } from '../../tilesets/library';
import { applyTileMeta, COMMON_TILE_SIZES, createTilesetFromFile, findEmptyTiles } from '../../tilesets/slicing';
import { tilesetSupports } from '../../tilesets/tilePools';
import { TileThumb } from '../../tilesets/TileThumb';
import { AssignSummary, TileLabel, confirmedMetas, suggestMetas } from '../../tilesets/TileLabel';
import { autoAssign } from '../../tilesets/autoAssign';
import { TileInspector } from '../../tilesets/TilesPanel';
import { useEditor } from '../../store/editorStore';
import { readFileAsDataUrl } from '../../utils/download';
import { Button, Chip, IconButton, NumberField, Segmented } from '../ui';
import { Icon } from '../icons';

export type TileSource = 'library' | 'upload' | 'demo';

export interface TilesChoice {
  source: TileSource;
  /** selected library tileset ids */
  selected: string[];
}

const shortLabel = (p: Perspective) => PERSPECTIVE_INFO[p].label.replace(' / Isometric-like', '');

/** Setup step "Welche Tiles möchtest du verwenden?" */
export function TilesStep({
  perspective,
  value,
  onChange,
  library,
  reloadLibrary,
  upload,
  setUpload,
}: {
  perspective: Perspective;
  value: TilesChoice;
  onChange: (v: TilesChoice) => void;
  library: LibraryTileset[] | null;
  reloadLibrary: () => Promise<LibraryTileset[]>;
  upload: Tileset | null;
  setUpload: (t: Tileset | null) => void;
}) {
  const options: { id: TileSource; title: string; text: string; icon: React.ReactNode }[] = [
    { id: 'library', title: 'Vorhandenes Tileset auswählen', text: library?.length ? `${library.length} gespeicherte Tilesets` : 'Noch keine gespeicherten Tilesets', icon: <Icon.Layers size={22} /> },
    { id: 'upload', title: 'Neues Tileset hochladen', text: 'PNG importieren, Rollen zuweisen, speichern', icon: <Icon.Upload size={22} /> },
    { id: 'demo', title: 'Demo-Tiles verwenden', text: 'Sofort loslegen, ohne eigene Dateien', icon: <Icon.Spark size={22} /> },
  ];
  return (
    <>
      <div className="choice-grid" role="radiogroup" aria-label="Tile-Quelle">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value.source === o.id}
            className={`choice-card${value.source === o.id ? ' is-selected' : ''}`}
            onClick={() => onChange({ ...value, source: o.id })}
          >
            <span className="choice-icon">{o.icon}</span>
            <span className="choice-text">
              <strong>{o.title}</strong>
              <small>{o.text}</small>
            </span>
          </button>
        ))}
      </div>

      {value.source === 'library' && <LibraryList perspective={perspective} value={value} onChange={onChange} library={library} reloadLibrary={reloadLibrary} />}
      {value.source === 'upload' && (
        <UploadEditor
          perspective={perspective}
          upload={upload}
          setUpload={setUpload}
          onSaved={async (id) => {
            await reloadLibrary();
            setUpload(null);
            onChange({ source: 'library', selected: [...new Set([...value.selected, id])] });
          }}
        />
      )}
      {value.source === 'demo' && (
        <p className="note">
          Die Demo-Tiles enthalten alle Rollen für Top-Down, Low Top-Down und 45° (Wände, Wandfronten, Gelände, Brücken, Klippen). Eigene Tilesets kannst du später jederzeit unter
          Tiles → Tilesets hochladen und in die Bibliothek speichern.
        </p>
      )}
    </>
  );
}

function LibraryList({
  perspective,
  value,
  onChange,
  library,
  reloadLibrary,
}: {
  perspective: Perspective;
  value: TilesChoice;
  onChange: (v: TilesChoice) => void;
  library: LibraryTileset[] | null;
  reloadLibrary: () => Promise<LibraryTileset[]>;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);
  if (library === null) return <p className="muted">Lade Bibliothek …</p>;
  if (!library.length)
    return (
      <p className="empty-note">
        Noch keine gespeicherten Tilesets. Lade unter „Neues Tileset hochladen“ ein PNG hoch oder speichere ein Tileset im Editor unter Tiles → Tilesets → „In Bibliothek“.
      </p>
    );
  const toggle = (id: string) => onChange({ ...value, selected: value.selected.includes(id) ? value.selected.filter((x) => x !== id) : [...value.selected, id] });
  const chosen = library.filter((e) => value.selected.includes(e.id));
  const incompatible = chosen.length > 0 && !chosen.some((e) => tilesetSupports({ ...e, firstGid: 0, active: true }, perspective));
  return (
    <div className="library-list">
      <p className="muted small">Mehrere Tilesets möglich. Fehlende Rollen werden automatisch aus den Demo-Tiles ergänzt.</p>
      {library.map((e) => {
        const sum = summarizeTileset(e);
        const on = value.selected.includes(e.id);
        const fits = sum.perspectives.includes(perspective);
        return (
          <div key={e.id} className={`library-card${on ? ' is-selected' : ''}`}>
            <button type="button" className="library-main" role="checkbox" aria-checked={on} onClick={() => toggle(e.id)}>
              <img src={e.dataUrl} alt="" className="library-preview" />
              <span className="library-info">
                <strong>{e.name}</strong>
                <small>
                  {e.tileSize} px · {sum.tiles} Tiles · {sum.roles.length} Rollen
                </small>
                <span className="library-tags">
                  {sum.perspectives.map((p) => (
                    <span key={p} className={`badge${p === perspective ? ' badge-accent' : ''}`}>
                      {shortLabel(p)}
                    </span>
                  ))}
                  {sum.terrains.map((t) => (
                    <span key={t} className="badge">
                      #{t}
                    </span>
                  ))}
                </span>
                {sum.roles.length > 0 && <small className="mono library-roles">{sum.roles.slice(0, 8).join(', ') + (sum.roles.length > 8 ? ' …' : '')}</small>}
                {!fits && <span className="badge badge-warn">Nicht für {shortLabel(perspective)} markiert</span>}
              </span>
              <span className="special-check">{on && <Icon.Check size={16} />}</span>
            </button>
            <div className="library-actions">
              {confirm === e.id ? (
                <>
                  <span className="muted small">Aus der Bibliothek löschen?</span>
                  <Button
                    variant="danger"
                    onClick={() =>
                      void deleteLibraryTileset(e.id).then(async () => {
                        setConfirm(null);
                        await reloadLibrary();
                        onChange({ ...value, selected: value.selected.filter((x) => x !== e.id) });
                      })
                    }
                  >
                    Löschen
                  </Button>
                  <IconButton label="Abbrechen" onClick={() => setConfirm(null)}>
                    <Icon.Close size={16} />
                  </IconButton>
                </>
              ) : (
                <IconButton label={`${e.name} löschen`} onClick={() => setConfirm(e.id)}>
                  <Icon.Trash size={16} />
                </IconButton>
              )}
            </div>
          </div>
        );
      })}
      {incompatible && (
        <p className="note">Keines der gewählten Tilesets ist für {shortLabel(perspective)} markiert. Die Map wird trotzdem erzeugt – fehlende Rollen kommen aus den Demo-Tiles.</p>
      )}
    </div>
  );
}

/** Import a PNG, slice it, assign roles/tags/perspectives, save it to the library. */
function UploadEditor({
  perspective,
  upload,
  setUpload,
  onSaved,
}: {
  perspective: Perspective;
  upload: Tileset | null;
  setUpload: (t: Tileset | null) => void;
  onSaved: (id: string) => Promise<void>;
}) {
  const toast = useEditor((s) => s.toast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [marked, setMarked] = useState<number[]>([]);
  const [detected, setDetected] = useState<number | null>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (!/image\/png/.test(f.type) && !/\.png$/i.test(f.name)) {
      toast(`${f.name}: nur PNG-Dateien`, 'error');
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await readFileAsDataUrl(f);
      // draft gids start at 1 (own id space, only used inside the wizard)
      const ts = await createTilesetFromFile(f.name.replace(/\.[^.]+$/, ''), dataUrl, 16, 1);
      setDetected(ts.tileSize);
      // first guess for every tile – the user only corrects
      setUpload({ ...ts, perspectives: [perspective], tiles: await autoAssign(ts) });
      setMarked([]);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload fehlgeschlagen', 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const reslice = async (size: number) => {
    if (!upload || size === upload.tileSize) return;
    const { columns, rows, empty } = await findEmptyTiles(upload.dataUrl, size);
    const resliced = { ...upload, tileSize: size, columns, rows, emptyTiles: empty, tiles: {} };
    setUpload({ ...resliced, tiles: await autoAssign(resliced) });
    setMarked([]);
  };

  const save = async () => {
    if (!upload) return;
    setBusy(true);
    try {
      await saveLibraryTileset(toLibraryTileset(upload));
      toast(`„${upload.name}“ in der Bibliothek gespeichert`, 'success');
      await onSaved(upload.id);
    } catch {
      toast('Speichern in der Bibliothek fehlgeschlagen', 'error');
    } finally {
      setBusy(false);
    }
  };

  const input = <input ref={fileRef} type="file" accept="image/png" hidden onChange={(e) => void onFile(e.target.files?.[0])} />;
  if (!upload)
    return (
      <div className="upload-editor">
        {input}
        <Button variant="primary" block icon={<Icon.Upload size={18} />} disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Lade …' : 'PNG-Tileset auswählen'}
        </Button>
        <p className="hint">Quadratische Tiles ohne Abstand. Die Tilegröße wird erkannt und kann angepasst werden.</p>
      </div>
    );

  const empty = new Set(upload.emptyTiles);
  const indices = Array.from({ length: upload.columns * upload.rows }, (_, i) => i).filter((i) => !empty.has(i));
  const custom = !COMMON_TILE_SIZES.includes(upload.tileSize);
  const sum = summarizeTileset(upload);
  const list = upload.perspectives.length ? upload.perspectives : [...PERSPECTIVES];
  const onMeta = (gids: number[], patch: Partial<TileMeta>) => setUpload(applyTileMeta([upload], gids, patch)[0]);

  return (
    <div className="upload-editor">
      {input}
      <div className="field">
        <label htmlFor="up-name">Name</label>
        <input id="up-name" className="input" value={upload.name} onChange={(e) => setUpload({ ...upload, name: e.target.value })} />
      </div>
      <div className="field">
        <label>
          Tilegröße {detected && <span className="muted">· erkannt: {detected} px</span>}
        </label>
        <Segmented
          label="Tilegröße"
          value={custom ? 'custom' : String(upload.tileSize)}
          options={[...COMMON_TILE_SIZES.map((s) => ({ value: String(s), label: String(s) })), { value: 'custom', label: 'Frei' }]}
          onChange={(v) => void reslice(v === 'custom' ? 24 : Number(v))}
        />
      </div>
      {custom && <NumberField label="Freie Tilegröße" value={upload.tileSize} min={4} max={512} suffix="px" onChange={(v) => void reslice(v)} />}
      <div className="field">
        <label>Perspektive</label>
        <div className="chips">
          {PERSPECTIVES.map((p) => {
            const on = list.includes(p);
            return (
              <Chip
                key={p}
                active={on}
                onClick={() => {
                  const next = on ? list.filter((x) => x !== p) : [...list, p];
                  if (next.length) setUpload({ ...upload, perspectives: next.length === PERSPECTIVES.length ? [] : next });
                }}
              >
                {shortLabel(p)}
              </Chip>
            );
          })}
        </div>
      </div>
      <div className="field">
        <label>
          Tiles <span className="muted">· {indices.length} Tiles, {sum.roles.length} Rollen zugewiesen – antippen zum Markieren</span>
        </label>
        <div className="tile-grid upload-grid has-labels" role="listbox" aria-label="Tiles des neuen Tilesets" aria-multiselectable="true">
          {indices.map((i) => {
            const on = marked.includes(i + 1);
            const meta = upload.tiles[i];
            return (
              <button
                key={i}
                type="button"
                role="option"
                aria-selected={on}
                className={`tile-cell${on ? ' is-selected' : ''}`}
                title={meta?.role ?? meta?.category ?? `#${i}`}
                onClick={() => setMarked(on ? marked.filter((g) => g !== i + 1) : [...marked, i + 1])}
              >
                <TileThumb ts={upload} index={i} size={40} />
                <TileLabel meta={meta} />
              </button>
            );
          })}
        </div>
        {marked.length > 0 && (
          <Button variant="ghost" onClick={() => setMarked([])}>
            Markierung aufheben ({marked.length})
          </Button>
        )}
      </div>
      <AssignSummary
        ts={upload}
        busy={busy}
        onAuto={() => {
          setBusy(true);
          void suggestMetas(upload)
            .then((tiles) => setUpload({ ...upload, tiles: { ...upload.tiles, ...tiles } }))
            .finally(() => setBusy(false));
        }}
        onConfirm={() => setUpload({ ...upload, tiles: { ...upload.tiles, ...confirmedMetas(upload.tiles) } })}
      />
      <TileInspector gids={marked} tilesets={[upload]} onMeta={onMeta} />
      <p className="hint">
        Rolle = Verwendung im Generator (z. B. <code>floor_center</code>, <code>wall_top</code>, <code>wall_front</code>). Material-Tags von Böden (z. B. <code>#grass</code>) werden
        zu Terrain-Sets.
      </p>
      <div className="upload-actions">
        <Button variant="secondary" onClick={() => setUpload(null)} disabled={busy}>
          Verwerfen
        </Button>
        <Button variant="primary" icon={<Icon.Save size={16} />} onClick={() => void save()} disabled={busy}>
          In Bibliothek speichern
        </Button>
      </div>
    </div>
  );
}

