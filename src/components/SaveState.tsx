import { useProject } from '../store/projectStore';

export function SaveState() {
  const name = useProject((s) => s.project.name);
  const dirty = useProject((s) => s.revision !== s.savedRevision);
  return (
    <div className="save-state" title={dirty ? 'Wird automatisch gespeichert' : 'Lokal gespeichert'}>
      <span className="project-name">{name}</span>
      <span className={`save-dot${dirty ? ' is-dirty' : ''}`} aria-label={dirty ? 'Ungespeichert' : 'Gespeichert'} />
    </div>
  );
}
