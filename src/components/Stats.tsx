import { useProject } from '../store/projectStore';
import { PERSPECTIVE_INFO } from '../generator/perspective';

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
  const count = (t: string) => result.spawnPoints.filter((sp) => sp.type === t).length;
  const side = result.perspective === 'side_view';
  const items: [string, string | number][] = side
    ? [
        ['Größe', `${map.width}×${map.height}`],
        ['Gegner', count('enemy')],
        ['Belohnungen', count('loot')],
        ['Boss', result.rooms.some((r) => r.isBoss) ? 'ja' : 'nein'],
        ['Ziel', result.rooms.some((r) => r.isEnd) ? 'rechts' : '–'],
        ['Ansicht', PERSPECTIVE_INFO.side_view.label],
        ['Seed', result.seed],
      ]
    : [
    ['Größe', `${map.width}×${map.height}`],
    ['Räume', result.rooms.length],
    ['Verbindungen', result.connections.length],
    ['Sackgassen', result.deadEnds],
    ['Spezial', specials],
    ['Ansicht', PERSPECTIVE_INFO[result.perspective ?? 'top_down'].label.replace(' / Isometric-like', '')],
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
