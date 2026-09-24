import { useEffect, useRef, useState } from 'react';
import { useProject } from '../store/projectStore';
import { useEditor } from '../store/editorStore';
import { isPlaceholder, useApp } from '../store/appStore';
import { Button, IconButton } from './ui';
import { Icon } from './icons';
import { deleteProject, listProjects, loadProject, onProjectsChanged, type ProjectSummary } from '../persistence/db';
import { saveNow } from '../persistence/autosave';
import { deserializeProject, PROJECT_EXTENSION } from '../persistence/projectFile';
import { readFileAsText } from '../utils/download';
import { ExportPanel } from '../export/ExportPanel';
import { profileLabel } from '../profiles';
import { BackupSection } from '../persistence/BackupSection';

const when = (t: number) => new Date(t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

/**
 * "Projekt" page – also the start screen: new project (setup wizard), open a project file,
 * continue a recent project; below: the open project (name, save, export).
 */
export function StartPage() {
  const name = useProject((s) => s.project.name);
  const profile = useProject((s) => s.project.profile);
  const id = useProject((s) => s.project.id);
  const revision = useProject((s) => s.revision);
  const dirty = useProject((s) => s.revision !== s.savedRevision);
  const toast = useEditor((s) => s.toast);
  const goTo = useApp((s) => s.goTo);
  const [list, setList] = useState<ProjectSummary[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const placeholder = isPlaceholder();
  void revision;

  const refresh = () =>
    listProjects()
      .then((l) => setList(l.sort((a, b) => b.updatedAt - a.updatedAt)))
      .catch(() => setList([]));
  useEffect(() => {
    void refresh();
  }, [id]);
  // cards the AI makes while this page is open show up right away
  useEffect(() => onProjectsChanged(() => void refresh()), []);

  const open = async (pid: string) => {
    if (pid !== id) {
      await saveNow();
      const p = await loadProject(pid);
      if (!p) {
        toast('Projekt nicht gefunden', 'error');
        return;
      }
      useProject.getState().loadProject(p);
      toast(`„${p.name}“ geöffnet`, 'success');
    }
    goTo('map');
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (!placeholder) await saveNow();
      const p = deserializeProject(await readFileAsText(file));
      useProject.getState().loadProject(p);
      await saveNow();
      toast(`„${p.name}“ geöffnet`, 'success');
      goTo('map');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Datei konnte nicht geöffnet werden', 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async (pid: string) => {
    await deleteProject(pid);
    setConfirmDelete(null);
    void refresh();
    toast('Projekt gelöscht');
  };

  const save = async () => {
    const ok = await saveNow();
    toast(ok ? 'Projekt gespeichert' : 'Speichern fehlgeschlagen', ok ? 'success' : 'error');
    void refresh();
  };

  const recent = (list ?? []).filter((p) => !(placeholder && p.id === id));

  return (
    <div className="page page-project">
      <div className="page-inner">
        <section className="start-hero" aria-labelledby="start-title">
          <h1 id="start-title">Was möchtest du tun?</h1>
          <div className="start-choices">
            <button type="button" className="start-card is-primary" aria-label="Neues Projekt" onClick={() => useEditor.getState().openWizard()}>
              <span className="start-card-icon">
                <Icon.Plus size={26} />
              </span>
              <strong>Neues Projekt</strong>
              <small>Der Assistent fragt nach Spiel, Perspektive, Tiles und Größe und richtet alles passend ein.</small>
            </button>
            <button
              type="button"
              className={`start-card${dragOver ? ' is-drop' : ''}`}
              aria-label="Projekt öffnen"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void importFile(e.dataTransfer.files?.[0]);
              }}
            >
              <span className="start-card-icon">
                <Icon.Upload size={26} />
              </span>
              <strong>Projekt öffnen</strong>
              <small>
                Projektdatei (<code>{PROJECT_EXTENSION}</code>) hochladen – antippen oder hierher ziehen.
              </small>
            </button>
          </div>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
          {!placeholder && (
            <button type="button" className="start-continue" onClick={() => goTo('map')}>
              <Icon.Map size={18} />
              <span>
                Weiter bearbeiten: <strong>{name}</strong>
              </span>
              <Icon.ChevronRight size={16} />
            </button>
          )}
        </section>

        <BackupSection />

        <section className="start-block" aria-labelledby="recent-title">
          <h2 id="recent-title">Zuletzt bearbeitet</h2>
          <ul className="project-list">
            {list === null && <li className="muted">Lade …</li>}
            {list !== null && recent.length === 0 && <li className="muted">Noch keine gespeicherten Projekte</li>}
            {recent.map((p) => (
              <li key={p.id} className={p.id === id ? 'is-current' : ''}>
                <button type="button" className="project-open" onClick={() => open(p.id)}>
                  <strong>{p.name}{p.ai && <span className="badge badge-ai" title="Von der KI angelegt">KI</span>}</strong>
                  <small>
                    {p.width}×{p.height} · {p.rooms} Räume · {when(p.updatedAt)}
                  </small>
                </button>
                {p.id === id ? (
                  <span className="badge">Offen</span>
                ) : confirmDelete === p.id ? (
                  <Button variant="danger" onClick={() => remove(p.id)}>
                    Löschen
                  </Button>
                ) : (
                  <IconButton label="Projekt löschen" onClick={() => setConfirmDelete(p.id)}>
                    <Icon.Trash size={18} />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        </section>

        {!placeholder && (
          <section className="start-block" aria-labelledby="current-title">
            <h2 id="current-title">Aktuelles Projekt</h2>
            <p className="muted small start-profile">Spiel: {profileLabel(profile)}</p>
            <div className="field">
              <label htmlFor="project-name">Name</label>
              <input id="project-name" className="input" value={name} onChange={(e) => useProject.getState().setName(e.target.value)} />
            </div>
            <div className="button-row">
              <Button variant="primary" icon={<Icon.Save size={18} />} onClick={save}>
                Speichern
              </Button>
            </div>
            <p className="muted small">{dirty ? 'Ungespeicherte Änderungen · Auto-Speichern aktiv' : 'Alle Änderungen lokal im Browser gespeichert'}</p>
            <ExportPanel />
          </section>
        )}
      </div>
    </div>
  );
}
