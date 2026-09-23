import { useProject } from '../store/projectStore';

export function Stats() {
  const result = useProject((s) => s.project.result);
  const map = useProject((s) => s.project.map);
  if (!result) {
    return (
      <div className="stats is-empty">
        <span>Noch keine Map generiert</span>
      </div>
    );
  }
  const specials = result.rooms.filter((r) => r.type !== 'normal').length;
  const items: [string, string | number][] = [
    ['Größe', `${map.width}×${map.height}`],
    ['Räume', result.rooms.length],
    ['Verbindungen', result.connections.length],
    ['Sackgassen', result.deadEnds],
    ['Spezial', specials],
    ['Seed', result.seed],
  ];
  return (
    <div className="stats">
      <dl>
        {items.map(([k, v]) => (
          <div key={k} className={k === 'Seed' ? 'stat-seed' : undefined}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {result.warnings.map((w) => (
        <p key={w} className="warning">
          {w}
        </p>
      ))}
    </div>
  );
}
