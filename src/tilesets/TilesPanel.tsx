import { useMemo, useRef, useState } from 'react';
import { useProject } from '../store/projectStore';
import { useEditor } from '../store/editorStore';
import type { Perspective, TileCategory, TileMeta, TileRole, Tileset } from '../types';
import { PERSPECTIVES, TILE_ROLES } from '../types';
import { OBJECT_DEFS, OBJECT_TYPES } from '../objects/defs';
import { ObjectThumb } from '../objects/ObjectThumb';
import { tileBlocks } from '../editor/collision';
import { PERSPECTIVE_INFO } from '../generator/perspective';
import { CATEGORIES, CATEGORY_LABEL, SUGGESTED_TAGS } from './categories';
import { TileThumb } from './TileThumb';
import { AssignSummary, TileLabel, assignmentStats, confirmedMetas, suggestMetas } from './TileLabel';
import { autoAssign } from './autoAssign';
import { learnFrom } from './learning';
import { resolveGid, createTilesetFromFile, COMMON_TILE_SIZES } from './slicing';
import { Button, Chip, IconButton, NumberField, PanelTabs, Segmented, Slider, Toggle } from '../components/ui';
import { Icon } from '../components/icons';
import { readFileAsDataUrl } from '../utils/download';
import { saveLibraryTileset, toLibraryTileset } from '../persistence/db';

type Tab = 'palette' | 'objects' | 'tilesets';

export function TilesPanel() {
  const [tab, setTab] = useState<Tab>('palette');
  return (
    <div className="panel-col">
      <PanelTabs
        tabs={[
          { value: 'palette', label: 'Palette' },
          { value: 'objects', label: 'Objekte' },
          { value: 'tilesets', label: 'Tilesets' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'palette' ? <Palette /> : tab === 'objects' ? <ObjectPalette /> : <TilesetManager />}
    </div>
  );
}

/* ---------------------------- palette ---------------------------- */

interface PaletteItem {
  ts: Tileset;
  index: number;
  gid: number;
}

function Palette() {
  const tilesets = useProject((s) => s.project.tilesets);
  const selectedGid = useEditor((s) => s.selectedGid);
  const marked = useEditor((s) => s.markedGids);
  const multi = useEditor((s) => s.multiSelect);
  const { selectTile, toggleMark, setMultiSelect } = useEditor.getState();
  const [tsFilter, setTsFilter] = useState('all');
  const [catFilter, setCatFilter] = useState<'all' | 'none' | TileCategory>('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [labels, setLabels] = useState(() => {
    try {
      return localStorage.getItem('mapforge.tileLabels') !== '0';
    } catch {
      return true;
    }
  });
  const toggleLabels = (v: boolean) => {
    setLabels(v);
    try {
      localStorage.setItem('mapforge.tileLabels', v ? '1' : '0');
    } catch {
      // not remembered
    }
  };

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const ts of tilesets) for (const m of Object.values(ts.tiles)) m.tags.forEach((t) => set.add(t));
    return [...set].sort();
  }, [tilesets]);

  const items = useMemo(() => {
    const out: PaletteItem[] = [];
    for (const ts of tilesets) {
      if (!ts.active) continue;
      if (tsFilter !== 'all' && ts.id !== tsFilter) continue;
      const empty = new Set(ts.emptyTiles);
      for (let i = 0; i < ts.columns * ts.rows; i++) {
        if (empty.has(i)) continue;
        const meta = ts.tiles[i];
        if (catFilter === 'none' && (meta?.category || meta?.role)) continue;
        if (catFilter !== 'all' && catFilter !== 'none' && meta?.category !== catFilter) continue;
        if (tagFilter !== 'all' && !meta?.tags.includes(tagFilter)) continue;
        out.push({ ts, index: i, gid: ts.firstGid + i });
      }
    }
    return out;
  }, [tilesets, tsFilter, catFilter, tagFilter]);

  const activeTs = tilesets.filter((t) => t.active);

  return (
    <div className="palette">
      <div className="filters">
        <select className="select" aria-label="Tileset" value={tsFilter} onChange={(e) => setTsFilter(e.target.value)}>
          <option value="all">Alle Tilesets</option>
          {activeTs.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select className="select" aria-label="Kategorie" value={catFilter} onChange={(e) => setCatFilter(e.target.value as typeof catFilter)}>
          <option value="all">Alle Kategorien</option>
          <option value="none">Ohne Kategorie</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select className="select" aria-label="Tag" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
          <option value="all">Alle Tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </select>
      </div>

      <div className="palette-bar">
        <span className="muted">{items.length} Tiles</span>
        <Toggle label="Zuordnung" checked={labels} onChange={toggleLabels} />
        <Toggle label="Mehrfachauswahl" checked={multi} onChange={setMultiSelect} />
      </div>

      <div className={`tile-grid${labels ? ' has-labels' : ''}`} role="listbox" aria-label="Tiles">
        {items.map((it) => {
          const isSel = multi ? marked.includes(it.gid) : it.gid === selectedGid;
          const cat = it.ts.tiles[it.index]?.category;
          return (
            <button
              key={it.gid}
              type="button"
              role="option"
              aria-selected={isSel}
              className={`tile-cell${isSel ? ' is-selected' : ''}`}
              title={`${it.ts.name} #${it.index}${cat ? ` · ${CATEGORY_LABEL[cat]}` : ''}`}
              onClick={() => (multi ? toggleMark(it.gid) : selectTile(it.gid))}
            >
              <TileThumb ts={it.ts} index={it.index} size={40} />
              {labels ? <TileLabel meta={it.ts.tiles[it.index]} /> : cat && <span className="tile-cat-dot" />}
            </button>
          );
        })}
        {!items.length && <p className="empty-note">Keine Tiles für diesen Filter.</p>}
      </div>

      {catFilter !== 'all' && catFilter !== 'none' && items.length > 0 && <WeightList items={items} category={catFilter} />}

      <TileInspector gids={multi ? marked : selectedGid ? [selectedGid] : []} />
    </div>
  );
}

function WeightList({ items, category }: { items: PaletteItem[]; category: TileCategory }) {
  const setTileMeta = useProject((s) => s.setTileMeta);
  const total = items.reduce((n, it) => n + (it.ts.tiles[it.index]?.weight ?? 0), 0);
  return (
    <div className="weight-list">
      <h4>Gewichtung · {CATEGORY_LABEL[category]}</h4>
      {items.map((it) => {
        const w = it.ts.tiles[it.index]?.weight ?? 0;
        return (
          <div className="weight-row" key={it.gid}>
            <TileThumb ts={it.ts} index={it.index} size={32} />
            <input
              type="range"
              min={0}
              max={100}
              value={w}
              aria-label={`Gewichtung Tile ${it.index}`}
              style={{ '--pct': `${w}%` } as React.CSSProperties}
              onChange={(e) => setTileMeta([it.gid], { weight: Number(e.target.value) })}
            />
            <span className="weight-pct">{total ? Math.round((w / total) * 100) : 0} %</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Tile meta editor (category, role, collision, sort offset, weight, tags).
 * Works on the project by default; the setup wizard passes a draft tileset list + setter.
 */
export function TileInspector({ gids, tilesets: draftTilesets, onMeta }: { gids: number[]; tilesets?: Tileset[]; onMeta?: (gids: number[], patch: Partial<TileMeta>) => void }) {
  const projectTilesets = useProject((s) => s.project.tilesets);
  const projectSetMeta = useProject((s) => s.setTileMeta);
  const tilesets = draftTilesets ?? projectTilesets;
  const setTileMeta = onMeta ?? projectSetMeta;
  const [tagDraft, setTagDraft] = useState('');
  if (!gids.length) return <div className="inspector is-empty">Tile antippen, um es zu malen und zu kategorisieren.</div>;

  const resolved = gids.map((g) => resolveGid(tilesets, g)).filter(Boolean) as { ts: Tileset; index: number }[];
  if (!resolved.length) return null;
  const first = resolved[0];
  const meta = first.ts.tiles[first.index] ?? { tags: [], weight: 50 };
  const sameCat = resolved.every((r) => r.ts.tiles[r.index]?.category === meta.category);
  const category = sameCat ? meta.category ?? '' : 'mixed';

  // share inside category
  let share: number | null = null;
  if (resolved.length === 1 && meta.category) {
    let total = 0;
    for (const ts of tilesets) {
      if (!ts.active) continue;
      for (const m of Object.values(ts.tiles)) if (m.category === meta.category) total += m.weight;
    }
    share = total ? Math.round((meta.weight / total) * 100) : 0;
  }
  const hasTag = (t: string) => resolved.every((r) => r.ts.tiles[r.index]?.tags.includes(t));
  const toggleTag = (t: string) => {
    const on = hasTag(t);
    for (const r of resolved) {
      const cur = r.ts.tiles[r.index]?.tags ?? [];
      setTileMeta([r.ts.firstGid + r.index], { tags: on ? cur.filter((x) => x !== t) : [...new Set([...cur, t])] });
    }
  };
  const tagList = [...new Set([...SUGGESTED_TAGS, ...resolved.flatMap((r) => r.ts.tiles[r.index]?.tags ?? [])])];

  return (
    <div className="inspector">
      <div className="inspector-head">
        <TileThumb ts={first.ts} index={first.index} size={52} />
        <div>
          <strong>{resolved.length > 1 ? `${resolved.length} Tiles markiert` : `${first.ts.name} · #${first.index}`}</strong>
          <span className="muted">{share !== null ? `${share} % Anteil in „${CATEGORY_LABEL[meta.category!]}“` : meta.category ? CATEGORY_LABEL[meta.category] : 'Ohne Kategorie'}</span>
        </div>
      </div>
      <div className="field">
        <label htmlFor="tile-cat">Kategorie</label>
        <select
          id="tile-cat"
          className="select"
          value={category}
          onChange={(e) => setTileMeta(gids, { category: (e.target.value || undefined) as TileCategory | undefined })}
        >
          {category === 'mixed' && <option value="mixed">Gemischt</option>}
          <option value="">— keine —</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="tile-role">Rolle (Auto-Tile)</label>
        <select
          id="tile-role"
          className="select mono"
          value={resolved.every((r) => r.ts.tiles[r.index]?.role === meta.role) ? (meta.role ?? '') : 'mixed'}
          onChange={(e) => setTileMeta(gids, { role: (e.target.value || undefined) as TileRole | undefined })}
        >
          <option value="">— keine —</option>
          {TILE_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="tile-col">Kollision</label>
          <select
            id="tile-col"
            className="select"
            value={meta.collision === undefined ? 'auto' : meta.collision ? 'yes' : 'no'}
            onChange={(e) => setTileMeta(gids, { collision: e.target.value === 'auto' ? undefined : e.target.value === 'yes' })}
          >
            <option value="auto">Auto ({tileBlocks({ ...meta, collision: undefined }) ? 'ja' : 'nein'})</option>
            <option value="yes">Ja</option>
            <option value="no">Nein</option>
          </select>
        </div>
        <NumberField label="Sortier-Offset" value={meta.sortOffset ?? 0} min={0} max={4} suffix="Tiles" onChange={(v) => setTileMeta(gids, { sortOffset: v || undefined })} />
      </div>
      <Slider label="Gewichtung" value={meta.weight} onChange={(v) => setTileMeta(gids, { weight: v })} />
      <div className="field">
        <label>Tags</label>
        <div className="chips">
          {tagList.map((t) => (
            <Chip key={t} active={hasTag(t)} onClick={() => toggleTag(t)}>
              #{t}
            </Chip>
          ))}
        </div>
        <form
          className="tag-add"
          onSubmit={(e) => {
            e.preventDefault();
            const t = tagDraft.trim().toLowerCase().replace(/\s+/g, '-');
            if (t && !hasTag(t)) toggleTag(t);
            setTagDraft('');
          }}
        >
          <input className="input" placeholder="Eigener Tag" value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} />
          <Button type="submit" icon={<Icon.Plus size={16} />}>
            Tag
          </Button>
        </form>
      </div>
    </div>
  );
}

/* ---------------------------- tileset manager ---------------------------- */

function TilesetManager() {
  const tilesets = useProject((s) => s.project.tilesets);
  const tileSize = useProject((s) => s.project.map.tileSize);
  const addTileset = useProject((s) => s.addTileset);
  const toast = useEditor((s) => s.toast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        if (!/image\/(png|webp|gif)/.test(f.type) && !/\.png$/i.test(f.name)) {
          toast(`${f.name}: nur PNG-Dateien`, 'error');
          continue;
        }
        const dataUrl = await readFileAsDataUrl(f);
        const nextGid = useProject.getState().project.nextGid;
        const ts = await createTilesetFromFile(f.name.replace(/\.[^.]+$/, ''), dataUrl, tileSize, nextGid);
        // first guess for every tile (floor, walls, corners …) – shown as suggestions
        ts.tiles = await autoAssign(ts);
        addTileset(ts);
        const st = assignmentStats(ts);
        toast(`${ts.name}: ${ts.columns * ts.rows - ts.emptyTiles.length} Tiles (${ts.tileSize} px), ${st.auto} automatisch zugeordnet – bitte in der Palette prüfen`, 'success');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload fehlgeschlagen', 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="tileset-manager">
      <input ref={fileRef} type="file" accept="image/png" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      <Button variant="primary" block icon={<Icon.Upload size={18} />} disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? 'Lade …' : 'PNG-Tileset hochladen'}
      </Button>
      {tilesets.map((ts) => (
        <TilesetCard key={ts.id} ts={ts} />
      ))}
      {!tilesets.length && <p className="empty-note">Keine Tilesets vorhanden.</p>}
    </div>
  );
}

function TilesetCard({ ts }: { ts: Tileset }) {
  const toast = useEditor((s) => s.toast);
  const mergeTileMetas = useProject((s) => s.mergeTileMetas);
  const [detecting, setDetecting] = useState(false);
  const updateTileset = useProject((s) => s.updateTileset);
  const removeTileset = useProject((s) => s.removeTileset);
  const setTilesetTileSize = useProject((s) => s.setTilesetTileSize);
  const [confirm, setConfirm] = useState(false);
  const custom = !COMMON_TILE_SIZES.includes(ts.tileSize);
  const count = ts.columns * ts.rows - ts.emptyTiles.length;
  const categorized = Object.values(ts.tiles).filter((m) => m.category).length;
  const perspective = useProject((s) => s.project.map.perspective);
  const supportsCurrent = !ts.perspectives?.length || ts.perspectives.includes(perspective);

  return (
    <div className={`tileset-card${ts.active ? '' : ' is-inactive'}`}>
      <div className="tileset-top">
        <img src={ts.dataUrl} alt="" className="tileset-preview" />
        <div className="tileset-info">
          <input
            className="input input-plain"
            value={ts.name}
            aria-label="Tileset-Name"
            onChange={(e) => updateTileset(ts.id, { name: e.target.value })}
          />
          <span className="muted">
            {count} Tiles · {ts.tileSize} px · {categorized} kategorisiert
          </span>
          {!supportsCurrent && <span className="badge badge-warn">Nicht für {PERSPECTIVE_INFO[perspective].label.replace(' / Isometric-like', '')}</span>}
        </div>
      </div>
      <Toggle label="Aktiv" description="Im Generator und in der Palette verwenden" checked={ts.active} onChange={(v) => updateTileset(ts.id, { active: v })} />
      <AssignSummary
        ts={ts}
        busy={detecting}
        onAuto={() => {
          setDetecting(true);
          void suggestMetas(ts)
            .then((tiles) => {
              mergeTileMetas(ts.id, tiles);
              toast(`${Object.keys(tiles).length} Tiles automatisch zugeordnet`, 'success');
            })
            .finally(() => setDetecting(false));
        }}
        onConfirm={() => {
          const confirmed = confirmedMetas(ts.tiles);
          mergeTileMetas(ts.id, confirmed);
          void learnFrom({ ...ts, tiles: { ...ts.tiles, ...confirmed } });
        }}
      />
      <div className="field">
        <label>Geeignet für</label>
        <div className="chips">
          {PERSPECTIVES.map((p: Perspective) => {
            const list = ts.perspectives ?? [];
            const on = list.length === 0 || list.includes(p);
            return (
              <Chip
                key={p}
                active={on}
                onClick={() => {
                  const base = list.length ? list : [...PERSPECTIVES];
                  const next = on ? base.filter((x) => x !== p) : [...base, p];
                  if (next.length) updateTileset(ts.id, { perspectives: next.length === PERSPECTIVES.length ? [] : next });
                }}
              >
                {PERSPECTIVE_INFO[p].label.replace(' / Isometric-like', '')}
              </Chip>
            );
          })}
        </div>
        <p className="hint">Der Generator nutzt nur Tilesets, die zur Perspektive der Map passen.</p>
      </div>
      <div className="field">
        <label>Tilegröße</label>
        <Segmented
          label="Tilegröße"
          value={custom ? 'custom' : String(ts.tileSize)}
          options={[...COMMON_TILE_SIZES.map((s) => ({ value: String(s), label: String(s) })), { value: 'custom', label: 'Frei' }]}
          onChange={(v) => {
            if (v !== 'custom') void setTilesetTileSize(ts.id, Number(v));
            else if (!custom) void setTilesetTileSize(ts.id, 24);
          }}
        />
      </div>
      {custom && <NumberField label="Freie Tilegröße" value={ts.tileSize} min={4} max={512} suffix="px" onChange={(v) => void setTilesetTileSize(ts.id, v)} />}
      <p className="hint">Beim Ändern wird neu zugeschnitten; platzierte Tiles dieses Tilesets werden entfernt (Rückgängig möglich).</p>
      <div className="tileset-actions">
        <Button
          variant="secondary"
          icon={<Icon.Save size={16} />}
          onClick={() =>
            void (learnFrom(ts), saveLibraryTileset(toLibraryTileset(ts)))
              .then(() => toast(`„${ts.name}“ in der Tileset-Bibliothek gespeichert – bei neuen Projekten wählbar`, 'success'))
              .catch(() => toast('Speichern in der Bibliothek fehlgeschlagen', 'error'))
          }
        >
          In Bibliothek
        </Button>
        {confirm ? (
          <>
            <span className="muted">Tileset und platzierte Tiles entfernen?</span>
            <Button variant="danger" onClick={() => removeTileset(ts.id)}>
              Löschen
            </Button>
            <IconButton label="Abbrechen" onClick={() => setConfirm(false)}>
              <Icon.Close size={18} />
            </IconButton>
          </>
        ) : (
          <Button variant="ghost" icon={<Icon.Trash size={16} />} onClick={() => setConfirm(true)}>
            Löschen
          </Button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------- objects ---------------------------- */

function ObjectPalette() {
  const selected = useEditor((s) => s.selectedObject);
  const selectObject = useEditor((s) => s.selectObject);
  const objects = useProject((s) => s.project.objects);
  return (
    <div className="palette">
      <p className="hint">Antippen = als Pinsel wählen und auf die Map tippen. Radierer entfernt, „Verschieben“ zieht Objekte. Objekte werden nach ihrem Fußpunkt Y-sortiert.</p>
      <div className="object-grid">
        {OBJECT_TYPES.map((t) => {
          const d = OBJECT_DEFS[t];
          return (
            <button key={t} type="button" className={`object-cell${selected === t ? ' is-selected' : ''}`} aria-pressed={selected === t} onClick={() => selectObject(selected === t ? null : t)}>
              <ObjectThumb type={t} size={56} />
              <span>{d.label}</span>
              <small className="muted">
                {d.w}×{d.h} · {d.collision.length ? 'Kollision' : 'frei'}
                {d.overheadRows ? ' · Overhead' : ''}
              </small>
            </button>
          );
        })}
      </div>
      <p className="muted small">{objects.length} Objekte auf der Map</p>
    </div>
  );
}
