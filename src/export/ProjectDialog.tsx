import { useState } from 'react';
import { useProject } from '../store/projectStore';
import { useEditor } from '../store/editorStore';
import { saveNow } from '../persistence/autosave';
import { profileLabel } from '../profiles';
import { Button, IconButton } from '../components/ui';
import { Icon } from '../components/icons';
import { ExportPanel } from './ExportPanel';

/** Map page: name, save and export of the open map (Godot package, PNG, project file …). */
export function ProjectDialog({ onClose }: { onClose: () => void }) {
  const name = useProject((s) => s.project.name);
  const profile = useProject((s) => s.project.profile);
  const dirty = useProject((s) => s.revision !== s.savedRevision);
  const toast = useEditor((s) => s.toast);
  return (
    <div className="quick-pick-backdrop" role="presentation" onClick={onClose}>
      <div className="quick-pick project-dialog" role="dialog" aria-label="Speichern und exportieren" onClick={(e) => e.stopPropagation()}>
        <header className="quick-pick-head">
          <div className="quick-pick-tile">
            <div>
              <strong>Speichern & exportieren</strong>
              <span className="quick-pick-current">{profileLabel(profile)}</span>
            </div>
          </div>
          <IconButton label="Schließen" onClick={onClose}>
            <Icon.Close size={18} />
          </IconButton>
        </header>
        <div className="quick-pick-body">
          <div className="field">
            <label htmlFor="project-name">Name der Karte</label>
            <input id="project-name" className="input" value={name} onChange={(e) => useProject.getState().setName(e.target.value)} />
          </div>
          <div className="button-row">
            <Button
              variant="primary"
              icon={<Icon.Save size={18} />}
              onClick={async () => {
                const ok = await saveNow();
                toast(ok ? 'Gespeichert' : 'Speichern fehlgeschlagen', ok ? 'success' : 'error');
              }}
            >
              Speichern
            </Button>
            <span className="muted small">{dirty ? 'Ungespeicherte Änderungen · wird automatisch gespeichert' : 'Alles gespeichert'}</span>
          </div>
          <ExportPanel />
        </div>
      </div>
    </div>
  );
}

export function ExportButton({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {compact ? (
        <IconButton label="Speichern & exportieren" onClick={() => setOpen(true)}>
          <Icon.Export size={19} />
        </IconButton>
      ) : (
        <button type="button" className="btn btn-secondary btn-export" onClick={() => setOpen(true)} title="Speichern, Godot-Paket, PNG, Projektdatei">
          <Icon.Export size={18} />
          <span>Export</span>
        </button>
      )}
      {open && <ProjectDialog onClose={() => setOpen(false)} />}
    </>
  );
}
