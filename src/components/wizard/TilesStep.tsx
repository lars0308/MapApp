import { useState } from 'react';
import { TilesetEditor } from '../../tilesets/TilesetEditor';
import type { Perspective, Tileset } from '../../types';
import { PERSPECTIVE_INFO } from '../../generator/perspective';
import { deleteLibraryTileset, saveLibraryTileset, toLibraryTileset, type LibraryTileset } from '../../persistence/db';
import { summarizeTileset } from '../../tilesets/library';
import { tilesetSupports } from '../../tilesets/tilePools';
import { learnFrom } from '../../tilesets/learning';
import { useEditor } from '../../store/editorStore';
import { Button, IconButton } from '../ui';
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
        <TilesetEditor
          perspective={perspective}
          upload={upload}
          setUpload={setUpload}
          saveLabel="In Bibliothek speichern"
          onSave={async (ts) => {
            await saveLibraryTileset(toLibraryTileset(ts));
            void learnFrom(ts);
            useEditor.getState().toast(`„${ts.name}“ in der Bibliothek gespeichert`, 'success');
            await reloadLibrary();
            setUpload(null);
            onChange({ source: 'library', selected: [...new Set([...value.selected, ts.id])] });
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
