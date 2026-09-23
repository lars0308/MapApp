import { useEffect, useRef, useState } from 'react';
import { useProject, createProject } from '../store/projectStore';
import { useEditor } from '../store/editorStore';
import { Button, IconButton, Section } from '../components/ui';
import { Icon } from '../components/icons';
import { deleteProject, listProjects, loadProject, type ProjectSummary } from './db';
import { saveNow } from './autosave';
import { deserializeProject } from './projectFile';
import { readFileAsText } from '../utils/download';

export function ProjectSection() {
  const name = useProject((s) => s.project.name);
  const id = useProject((s) => s.project.id);
  const dirty = useProject((s) => s.revision !== s.savedRevision);
  const { setName, loadProject: load, runGenerate } = useProject.getState();
  const toast = useEditor((s) => s.toast);
  const [list, setList] = useState<ProjectSummary[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () =>
    listProjects()
      .then(setList)
      .catch(() => setList([]));
  useEffect(() => {
    void refresh();
  }, [id]);

  const save = async () => {
    const ok = await saveNow();
    toast(ok ? 'Projekt gespeichert' : 'Speichern fehlgeschlagen', ok ? 'success' : 'error');
    void refresh();
  };

  const newProject = async () => {
    await saveNow();
    load(createProject());
    await runGenerate();
    await saveNow();
    toast('Neues Projekt erstellt', 'success');
    void refresh();
  };

  const open = async (pid: string) => {
    if (pid === id) return;
    await saveNow();
    const p = await loadProject(pid);
    if (!p) {
      toast('Projekt nicht gefunden', 'error');
      return;
    }
    load(p);
    toast(`„${p.name}“ geöffnet`, 'success');
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      await saveNow();
      const p = deserializeProject(await readFileAsText(file));
      load(p);
      await saveNow();
      toast(`„${p.name}“ importiert`, 'success');
      void refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import fehlgeschlagen', 'error');
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

  return (
    <Section title="Projekt">
      <div className="field">
        <label htmlFor="project-name">Name</label>
        <input id="project-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="button-row">
        <Button variant="primary" icon={<Icon.Save size={18} />} onClick={save}>
          Speichern
        </Button>
        <Button icon={<Icon.Plus size={18} />} onClick={newProject}>
          Neu
        </Button>
        <Button icon={<Icon.Upload size={18} />} onClick={() => fileRef.current?.click()}>
          Import
        </Button>
      </div>
      <p className="muted small">{dirty ? 'Ungespeicherte Änderungen · Auto-Speichern aktiv' : 'Alle Änderungen lokal gespeichert'}</p>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => importFile(e.target.files?.[0])} />

      <h4 className="subhead">Gespeicherte Projekte</h4>
      <ul className="project-list">
        {list === null && <li className="muted">Lade …</li>}
        {list?.length === 0 && <li className="muted">Noch keine gespeicherten Projekte</li>}
        {list?.map((p) => (
          <li key={p.id} className={p.id === id ? 'is-current' : ''}>
            <button type="button" className="project-open" onClick={() => open(p.id)}>
              <strong>{p.name}</strong>
              <small>
                {p.width}×{p.height} · {p.rooms} Räume · {new Date(p.updatedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
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
    </Section>
  );
}
