import { useRef, useState } from 'react';
import type { Perspective, TileMeta, Tileset } from '../types';
import { PERSPECTIVES } from '../types';
import { PERSPECTIVE_INFO } from '../generator/perspective';
import { applyTileMeta, COMMON_TILE_SIZES, createTilesetFromFile, findEmptyTiles } from './slicing';
import { TileThumb } from './TileThumb';
import { AssignSummary, TileLabel, confirmedMetas, suggestMetas } from './TileLabel';
import { autoAssign } from './autoAssign';
import { QuickPick } from './QuickPick';
import { RoomMarker, applyRoom } from './RoomMarker';
import { learnFrom, similarTiles } from './learning';
import { TileInspector } from './TilesPanel';
import { useEditor } from '../store/editorStore';
import { readFileAsDataUrl } from '../utils/download';
import { Button, Chip, NumberField, Segmented, Toggle } from '../components/ui';
import { Icon } from '../components/icons';

const shortLabel = (p: Perspective) => PERSPECTIVE_INFO[p].label.replace(' / Isometric-like', '');

/**
 * Everything for a new tileset in one place: pick a PNG, tile size (detected), map kinds, build a
 * room from it (frame / builder), tap tiles to say what they are, then save (`onSave`: library in
 * the setup wizard, the project under Tiles → Tilesets).
 */
export function TilesetEditor({
  perspective,
  upload,
  setUpload,
  onSave,
  saveLabel,
  onCancel,
  fixedSize,
}: {
  perspective: Perspective;
  upload: Tileset | null;
  setUpload: (t: Tileset | null) => void;
  onSave: (ts: Tileset) => Promise<void>;
  saveLabel: string;
  /** "Verwerfen" (default: back to the file choice) */
  onCancel?: () => void;
  /** existing tileset of a project: the tile size is changed on its card (gids depend on it) */
  fixedSize?: boolean;
}) {
  const toast = useEditor((s) => s.toast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [marked, setMarked] = useState<number[]>([]);
  /** tile whose quick menu is open (local index) */
  const [pick, setPick] = useState<number | null>(null);
  const [marking, setMarking] = useState(false);
  const [multi, setMulti] = useState(false);
  const [autoNext, setAutoNext] = useState(true);
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
      const { ts, note } = await createTilesetFromFile(f.name.replace(/\.[^.]+$/, ''), dataUrl, 16, 1);
      if (note.includes('Einzelteile') || note.includes('kein klares')) toast(`${f.name}: ${note}`, 'success');
      setDetected(ts.tileSize);
      // first guess for every tile – the user only corrects
      setUpload({ ...ts, perspectives: [perspective], tiles: await autoAssign(ts) });
      setMarked([]);
      // straight into "Raum füllen": tap a tile, tap where it goes in the room
      setMarking(true);
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
      await onSave(upload);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Speichern fehlgeschlagen', 'error');
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
  const list = upload.perspectives.length ? upload.perspectives : [...PERSPECTIVES];
  const onMeta = (gids: number[], patch: Partial<TileMeta>) => {
    const next = applyTileMeta([upload], gids, patch)[0];
    setUpload(next);
    // the app learns from every manual assignment
    if ('category' in patch || 'role' in patch) void learnFrom(next, gids.map((g) => g - 1));
    return next;
  };
  const pos = pick === null ? -1 : indices.indexOf(pick);
  const choose = (patch: Partial<TileMeta>) => {
    if (pick === null) return;
    const gids = multi && marked.length ? marked : [pick + 1];
    const next = onMeta(gids, patch);
    // same look elsewhere in this tileset → same type as a suggestion
    if (!multi && (patch.category || patch.role)) {
      void similarTiles(next, pick).then((idx) => {
        if (!idx.length) return;
        const tiles = { ...next.tiles };
        for (const i of idx) tiles[i] = { ...(tiles[i] ?? { tags: [], weight: 50 }), category: patch.category, role: patch.role, auto: true };
        setUpload({ ...next, tiles });
        toast(`${idx.length} ähnliche${idx.length === 1 ? 's' : ''} Tile${idx.length === 1 ? '' : 's'} ebenfalls vorgeschlagen`);
      });
    }
    if (multi) {
      setMarked([]);
      setPick(null);
    } else if (autoNext && pos < indices.length - 1) setPick(indices[pos + 1]);
    else setPick(null);
  };

  return (
    <div className="upload-editor">
      {input}
      <div className="field">
        <label htmlFor="up-name">Name</label>
        <input id="up-name" className="input" value={upload.name} onChange={(e) => setUpload({ ...upload, name: e.target.value })} />
      </div>
      {!fixedSize && (
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
      )}
      {!fixedSize && custom && <NumberField label="Freie Tilegröße" value={upload.tileSize} min={4} max={512} suffix="px" onChange={(v) => void reslice(v)} />}
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
          Tiles <span className="muted">· {indices.length} Tiles – antippen, um den Typ zu wählen</span>
        </label>
        <Button variant="primary" block icon={<Icon.Grid size={16} />} onClick={() => setMarking(true)}>
          Raum füllen
        </Button>
        <p className="hint">Am schnellsten: Tile antippen, dann ins passende Feld des Raums tippen (Ecken, Wände, Boden, Tür, Wasser) – so weiß MapForge genau, was wohin gehört. Deko und Sonstiges danach unten antippen.</p>
        {marking && (
          <RoomMarker
            ts={upload}
            onClose={() => setMarking(false)}
            onApply={(room, clearOthers) => {
              const next = { ...upload, ...applyRoom(upload, room, clearOthers) };
              setUpload(next);
              void learnFrom(next, Object.keys(room.tiles).map(Number));
              setMarking(false);
            }}
          />
        )}
        <div className="upload-grid-bar">
          <Toggle label="Mehrfachauswahl" checked={multi} onChange={(v) => (setMulti(v), setMarked([]))} />
          {multi && marked.length > 0 && (
            <Button variant="primary" onClick={() => setPick(marked[0] - 1)}>
              Typ für {marked.length} wählen
            </Button>
          )}
        </div>
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
                onClick={() => (multi ? setMarked(on ? marked.filter((g) => g !== i + 1) : [...marked, i + 1]) : setPick(i))}
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
        onConfirm={() => {
          const next = { ...upload, tiles: { ...upload.tiles, ...confirmedMetas(upload.tiles) } };
          setUpload(next);
          void learnFrom(next);
        }}
      />
      {marked.length > 0 && <TileInspector gids={marked} tilesets={[upload]} onMeta={onMeta} />}
      {pick !== null && (
        <QuickPick
          ts={upload}
          index={pick}
          count={multi ? Math.max(1, marked.length) : 1}
          position={`${pos + 1} / ${indices.length}`}
          autoNext={autoNext}
          onAutoNext={setAutoNext}
          onPick={choose}
          onNav={multi ? undefined : (d) => setPick(indices[Math.min(indices.length - 1, Math.max(0, pos + d))])}
          onMore={() => {
            // full inspector (collision, weight, tags …) for this tile
            if (!multi) setMarked([pick + 1]);
            setPick(null);
          }}
          onClose={() => setPick(null)}
        />
      )}
      <p className="hint">
        Rolle = Verwendung im Generator (z. B. <code>floor_center</code>, <code>wall_top</code>, <code>wall_front</code>). Material-Tags von Böden (z. B. <code>#grass</code>) werden
        zu Terrain-Sets.
      </p>
      <div className="upload-actions">
        <Button variant="secondary" onClick={() => (onCancel ? onCancel() : setUpload(null))} disabled={busy}>
          Verwerfen
        </Button>
        <Button variant="primary" icon={<Icon.Save size={16} />} onClick={() => void save()} disabled={busy}>
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

