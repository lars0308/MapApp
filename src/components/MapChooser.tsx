import { useEffect, useState } from 'react';
import { useProject } from '../store/projectStore';
import { useEditor } from '../store/editorStore';
import { isPlaceholder, useApp } from '../store/appStore';
import { listProjects, loadProject, type ProjectSummary } from '../persistence/db';
import { saveNow } from '../persistence/autosave';
import { VIEWS, profileLabel, type ViewKind } from '../profiles';
import { Icon } from './icons';

const when = (t: number) => new Date(t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

const VIEW_ICON: Record<ViewKind, string> = { top_down: '▦', isometric: '◇', side_scroller: '▟', hexagonal: '⬡' };

/** "Karte": first asks which map – the open one, a saved one, or a new one of a chosen type. */
export function MapChooser() {
  const name = useProject((s) => s.project.name);
  const id = useProject((s) => s.project.id);
  const profile = useProject((s) => s.project.profile);
  const toast = useEditor((s) => s.toast);
  const [list, setList] = useState<ProjectSummary[] | null>(null);
  const placeholder = isPlaceholder();

  useEffect(() => {
    listProjects()
      .then((l) => setList(l.sort((a, b) => b.updatedAt - a.updatedAt)))
      .catch(() => setList([]));
  }, []);

  const open = async (pid: string) => {
    if (pid !== id) {
      await saveNow();
      const p = await loadProject(pid);
      if (!p) return toast('Karte nicht gefunden', 'error');
      useProject.getState().loadProject(p);
    }
    useApp.getState().goTo('map');
  };
  const others = (list ?? []).filter((p) => p.id !== id);

  return (
    <div className="page-inner chooser">
      <h1 className="page-title">Welche Karte möchtest du bearbeiten?</h1>

      {!placeholder && (
        <button type="button" className="start-continue chooser-current" onClick={() => useApp.getState().goTo('map')}>
          <Icon.Map size={20} />
          <span>
            Weiter bearbeiten: <strong>{name}</strong>
            <small>{profileLabel(profile)}</small>
          </span>
          <Icon.ChevronRight size={16} />
        </button>
      )}

      <h2 className="subhead">Neue Karte erstellen</h2>
      <div className="chooser-grid">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`choice-card chooser-card${v.available ? '' : ' is-soon'}`}
            disabled={!v.available}
            onClick={() => useEditor.getState().openWizard(false, v.id)}
          >
            <span className="chooser-icon" aria-hidden="true">
              {VIEW_ICON[v.id]}
            </span>
            <strong>{v.label}</strong>
            <small>{v.available ? v.text : 'Bald verfügbar'}</small>
          </button>
        ))}
      </div>

      {others.length > 0 && (
        <>
          <h2 className="subhead">Gespeicherte Karten</h2>
          <ul className="project-list">
            {others.slice(0, 12).map((p) => (
              <li key={p.id}>
                <button type="button" className="project-open" onClick={() => open(p.id)}>
                  <strong>{p.name}</strong>
                  <small>
                    {p.label ? `${p.label} · ` : ''}
                    {p.width} × {p.height} · {when(p.updatedAt)}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
