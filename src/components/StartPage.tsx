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
import { profileLabel } from '../profiles';
import { APP_NAME, LogoMark } from './Logo';

const when = (t: number) => new Date(t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Start page ("Projekt"): continue, create something new (map, character, enemy, object) or load a
 * project. Backups, AI connection and options live under Einstellungen; saving / export of a map
 * on the map page („Export“).
 */
export function StartPage() {
  const name = useProject((s) => s.project.name);
  const profile = useProject((s) => s.project.profile);
  const id = useProject((s) => s.project.id);
  const revision = useProject((s) => s.revision);
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


  const recent = (list ?? []).filter((p) => !(placeholder && p.id === id)).slice(0, 8);
  const startFigure = useApp((s) => s.startFigure);

  const cards: { key: string; title: string; text: string; icon: React.ReactNode; tone: string; onClick: () => void }[] = [
    { key: 'map', title: 'Neue Karte', text: 'Dungeon, Höhle, Dorf, Level oder Weltkarte', icon: <Icon.Map size={30} />, tone: 'pink', onClick: () => useEditor.getState().openWizard() },
    { key: 'character', title: 'Charakter erstellen', text: 'Held, NPC, Spielfigur', icon: <Icon.Person size={30} />, tone: 'blue', onClick: () => startFigure('character') },
    { key: 'creature', title: 'Gegner erstellen', text: 'Monster, Kreaturen, Tiere', icon: <Icon.Ghost size={30} />, tone: 'green', onClick: () => startFigure('creature') },
    { key: 'object', title: 'Objekt erstellen', text: 'Truhe, Fackel, Tür …', icon: <Icon.Box size={30} />, tone: 'gold', onClick: () => startFigure('object') },
  ];

  return (
    <div className="page page-project page-start">
      <div className="page-inner start-inner">
        <section className="start-welcome" aria-labelledby="start-title">
          <span className="start-logo" aria-hidden="true">
            <LogoMark size={56} />
          </span>
          <h1 id="start-title">{APP_NAME}</h1>
          <p>Pixel-Art-Karten und Figuren für dein Spiel – fertig für Godot.</p>
        </section>

        {!placeholder && (
          <button type="button" className="start-resume" onClick={() => goTo('map')}>
            <span className="start-resume-icon">
              <Icon.Play size={18} />
            </span>
            <span>
              <small>Weiter bearbeiten</small>
              <strong>{name}</strong>
              <small>{profileLabel(profile)}</small>
            </span>
            <Icon.ChevronRight size={18} />
          </button>
        )}

        <section aria-label="Neu erstellen">
          <h2 className="start-h2">Neu erstellen</h2>
          <div className="start-grid">
            {cards.map((c) => (
              <button key={c.key} type="button" className={`start-tile tone-${c.tone}`} onClick={c.onClick} data-start={c.key}>
                <span className="start-tile-icon">{c.icon}</span>
                <strong>{c.title}</strong>
                <small>{c.text}</small>
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="recent-title">
          <div className="start-h2-row">
            <h2 id="recent-title" className="start-h2">
              Projekt laden
            </h2>
            <button
              type="button"
              className={`btn btn-secondary start-file${dragOver ? ' is-drop' : ''}`}
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
              title={`Projektdatei (${PROJECT_EXTENSION}) öffnen – antippen oder hierher ziehen`}
            >
              <Icon.Folder size={16} />
              <span>Datei öffnen</span>
            </button>
          </div>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
          <ul className="project-list start-recent">
            {list === null && <li className="muted">Lade …</li>}
            {list !== null && recent.length === 0 && <li className="muted">Noch keine gespeicherten Karten – leg oben eine neue an.</li>}
            {recent.map((p) => (
              <li key={p.id} className={p.id === id ? 'is-current' : ''}>
                <button type="button" className="project-open" onClick={() => open(p.id)}>
                  <strong>
                    {p.name}
                    {p.ai && (
                      <span className="badge badge-ai" title="Von der KI angelegt">
                        KI
                      </span>
                    )}
                  </strong>
                  <small>
                    {p.label ? `${p.label} · ` : ''}
                    {p.width}×{p.height} · {when(p.updatedAt)}
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
      </div>
    </div>
  );
}
