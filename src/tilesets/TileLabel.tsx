import type { TileMeta, Tileset } from '../types';
import { autoAssign, tileLabel, type LabelGroup } from './autoAssign';

/** Label on a tile cell: what the tile is used as. Dashed = automatic suggestion, not yet confirmed. */
export function TileLabel({ meta }: { meta: TileMeta | undefined }) {
  const l = tileLabel(meta);
  if (!l) return <span className="tile-label is-none">?</span>;
  return (
    <span className={`tile-label g-${l.group}${l.auto ? ' is-auto' : ''}`} title={l.auto ? `${l.text} (${meta?.tags.includes('learned') ? 'gelernt' : 'Vorschlag'})` : l.text}>
      {l.text}
    </span>
  );
}

const GROUP_NAME: Record<LabelGroup, string> = {
  floor: 'Boden',
  wall: 'Wände/Ecken',
  liquid: 'Wasser/Lava/Abgrund',
  passage: 'Türen/Brücken/Treppen',
  object: 'Deko/Hindernisse',
  other: 'Sonstige',
};

export function assignmentStats(ts: Pick<Tileset, 'tiles' | 'columns' | 'rows' | 'emptyTiles'>) {
  const empty = new Set(ts.emptyTiles);
  const groups: Partial<Record<LabelGroup, number>> = {};
  let none = 0;
  let auto = 0;
  for (let i = 0; i < ts.columns * ts.rows; i++) {
    if (empty.has(i)) continue;
    const l = tileLabel(ts.tiles[i]);
    if (!l) none++;
    else {
      groups[l.group] = (groups[l.group] ?? 0) + 1;
      if (l.auto) auto++;
    }
  }
  return { groups, none, auto };
}

/** "20 Boden · 8 Wände/Ecken · 3 ohne Zuordnung" + actions */
export function AssignSummary({
  ts,
  busy,
  onAuto,
  onConfirm,
}: {
  ts: Pick<Tileset, 'tiles' | 'columns' | 'rows' | 'emptyTiles'>;
  busy?: boolean;
  onAuto: () => void;
  onConfirm: () => void;
}) {
  const st = assignmentStats(ts);
  const parts = (Object.keys(GROUP_NAME) as LabelGroup[]).filter((g) => st.groups[g]).map((g) => `${st.groups[g]} ${GROUP_NAME[g]}`);
  return (
    <div className="assign-summary">
      <p>
        {parts.join(' · ') || 'Noch nichts zugeordnet'}
        {st.none > 0 && <span className="assign-none"> · {st.none} ohne Zuordnung</span>}
      </p>
      {st.auto > 0 && <p className="hint">{st.auto} automatisch erkannt (gestrichelt) – Tile antippen und im Inspektor korrigieren; jede Änderung bestätigt das Tile.</p>}
      <div className="assign-actions">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onAuto}>
          {busy ? 'Erkenne …' : 'Automatisch zuordnen'}
        </button>
        {st.auto > 0 && (
          <button type="button" className="btn btn-ghost" onClick={onConfirm}>
            Vorschläge bestätigen
          </button>
        )}
      </div>
    </div>
  );
}

/** metas with the auto flag removed (confirm all suggestions) */
export function confirmedMetas(tiles: Record<number, TileMeta>): Record<number, TileMeta> {
  const out: Record<number, TileMeta> = {};
  for (const [k, m] of Object.entries(tiles))
    if (m.auto) {
      const { auto: _a, ...rest } = m;
      void _a;
      out[Number(k)] = rest;
    }
  return out;
}

/**
 * Automatic assignment that keeps manual work: unassigned tiles and unconfirmed suggestions
 * are (re)detected, confirmed / edited tiles stay as they are.
 */
export async function suggestMetas(ts: Pick<Tileset, 'dataUrl' | 'tileSize' | 'columns' | 'rows' | 'emptyTiles' | 'tiles'>) {
  const manual: Record<number, TileMeta> = {};
  for (const [k, m] of Object.entries(ts.tiles)) if (!m.auto) manual[Number(k)] = m;
  return autoAssign({ ...ts, tiles: manual });
}
