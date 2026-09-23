import type { TileCategory, TileMeta, TileRole, Tileset } from '../types';
import { TileThumb } from './TileThumb';
import { TileLabel } from './TileLabel';
import { IconButton } from '../components/ui';
import { Icon } from '../components/icons';

// Tap a tile → choose what it is. Each choice shows a small 3×3 room sketch:
// W = wall, F = floor, S = wall front; the framed cell is the tile itself.

export interface Pick {
  id: string;
  label: string;
  category: TileCategory | undefined;
  role: TileRole | undefined;
  /** 3×3 sketch rows, e.g. 'WWW/FFF/FFF' */
  sketch?: string;
  /** framed cell 0..8 */
  at?: number;
  /** plain colour swatch instead of a sketch */
  swatch?: string;
}

const P = (id: string, label: string, category: TileCategory | undefined, role: TileRole | undefined, sketch?: string, at = 4, swatch?: string): Pick => ({ id, label, category, role, sketch, at, swatch });

export const PICK_GROUPS: { title: string; picks: Pick[] }[] = [
  {
    title: 'Boden',
    picks: [
      P('floor', 'Boden', 'floor', 'floor_center', 'FFF/FFF/FFF'),
      P('variant', 'Boden-Variante', 'floorVariant', undefined, 'FFF/FFF/FFF'),
      P('path', 'Weg', 'path', undefined, undefined, 4, '#b08354'),
    ],
  },
  {
    title: 'Wände',
    picks: [
      P('wall_top', 'Wand oben', 'wallTop', 'wall_top', 'WWW/FFF/FFF', 1),
      P('wall_bottom', 'Wand unten', 'wallBottom', 'wall_bottom', 'FFF/FFF/WWW', 7),
      P('wall_left', 'Wand links', 'wallLeft', 'wall_left', 'WFF/WFF/WFF', 3),
      P('wall_right', 'Wand rechts', 'wallRight', 'wall_right', 'FFW/FFW/FFW', 5),
      P('wall_h', 'Wand quer', 'wallTop', 'wall_horizontal', 'FFF/WWW/FFF'),
      P('wall_v', 'Wand längs', 'wallLeft', 'wall_vertical', 'FWF/FWF/FWF'),
      P('front', 'Wandfront', 'wallFront', 'wall_front', 'WWW/SSS/FFF'),
      P('front_up', 'Front oben', 'wallFront', 'wall_front_upper', 'WWW/SSS/SSS', 4),
    ],
  },
  {
    title: 'Ecken außen',
    picks: [
      P('c_tl', 'Ecke ┌', 'outerCorner', 'corner_top_left', 'WWW/WFF/WFF', 0),
      P('c_tr', 'Ecke ┐', 'outerCorner', 'corner_top_right', 'WWW/FFW/FFW', 2),
      P('c_bl', 'Ecke └', 'outerCorner', 'corner_bottom_left', 'WFF/WFF/WWW', 6),
      P('c_br', 'Ecke ┘', 'outerCorner', 'corner_bottom_right', 'FFW/FFW/WWW', 8),
    ],
  },
  {
    title: 'Ecken innen',
    picks: [
      P('i_tl', 'Innen ┌', 'innerCorner', 'inner_corner_top_left', 'FFF/FWW/FWW'),
      P('i_tr', 'Innen ┐', 'innerCorner', 'inner_corner_top_right', 'FFF/WWF/WWF'),
      P('i_bl', 'Innen └', 'innerCorner', 'inner_corner_bottom_left', 'FWW/FWW/FFF'),
      P('i_br', 'Innen ┘', 'innerCorner', 'inner_corner_bottom_right', 'WWF/WWF/FFF'),
    ],
  },
  {
    title: 'Gelände & Durchgänge',
    picks: [
      P('water', 'Wasser', 'water', 'water', undefined, 4, '#3a86c0'),
      P('lava', 'Lava', 'lava', 'lava', undefined, 4, '#e0602a'),
      P('abyss', 'Abgrund', 'abyss', 'abyss', undefined, 4, '#050507'),
      P('bridge', 'Brücke', 'bridge', 'bridge_middle', undefined, 4, '#9a6b3f'),
      P('door', 'Tür', 'door', 'door', 'WWW/FDF/FFF', 1),
      P('stairs', 'Treppe', 'stairs', 'stairs', undefined, 4, '#8a8595'),
    ],
  },
  {
    title: 'Objekte',
    picks: [
      P('deco', 'Deko', 'deco', undefined, undefined, 4, '#d8d06a'),
      P('obstacle', 'Hindernis', 'obstacle', undefined, undefined, 4, '#8f8a7a'),
      P('pillar', 'Säule', 'pillar', undefined, undefined, 4, '#a9a3b8'),
      P('shadow', 'Schatten', 'shadow', 'shadow', undefined, 4, 'rgba(0,0,0,.5)'),
    ],
  },
];

function Sketch({ pick }: { pick: Pick }) {
  if (!pick.sketch) return <span className="pick-swatch" style={{ background: pick.swatch }} />;
  const cells = pick.sketch.replace(/\//g, '').split('');
  return (
    <span className="pick-sketch" aria-hidden="true">
      {cells.map((c, i) => (
        <span key={i} className={`c-${c}${i === pick.at ? ' is-tile' : ''}`} />
      ))}
    </span>
  );
}

const isCurrent = (meta: TileMeta | undefined, p: Pick) => !!meta && meta.category === p.category && (meta.role ?? undefined) === p.role;

/**
 * Quick choice for one (or several marked) tiles.
 * `index` is the local tile index shown in the header; the choice is applied by the caller.
 */
export function QuickPick({
  ts,
  index,
  count,
  position,
  autoNext,
  onAutoNext,
  onPick,
  onNav,
  onMore,
  onClose,
}: {
  ts: Tileset;
  index: number;
  /** how many tiles the choice applies to (multi-select) */
  count: number;
  position: string;
  autoNext: boolean;
  onAutoNext: (v: boolean) => void;
  onPick: (patch: Partial<TileMeta>) => void;
  onNav?: (delta: number) => void;
  onMore: () => void;
  onClose: () => void;
}) {
  const meta = ts.tiles[index];
  return (
    <div className="quick-pick-backdrop" role="presentation" onClick={onClose}>
      <div className="quick-pick" role="dialog" aria-label="Tile zuordnen" onClick={(e) => e.stopPropagation()}>
        <header className="quick-pick-head">
          {onNav && (
            <IconButton label="Vorheriges Tile" onClick={() => onNav(-1)}>
              <Icon.ChevronRight size={18} style={{ transform: 'rotate(180deg)' }} />
            </IconButton>
          )}
          <div className="quick-pick-tile">
            <TileThumb ts={ts} index={index} size={56} />
            <div>
              <strong>{count > 1 ? `${count} Tiles markiert` : `Tile ${position}`}</strong>
              <span className="quick-pick-current">
                Jetzt: <TileLabel meta={meta} />
              </span>
            </div>
          </div>
          {onNav && (
            <IconButton label="Nächstes Tile" onClick={() => onNav(1)}>
              <Icon.ChevronRight size={18} />
            </IconButton>
          )}
          <IconButton label="Schließen" onClick={onClose}>
            <Icon.Close size={18} />
          </IconButton>
        </header>
        <div className="quick-pick-body">
          {PICK_GROUPS.map((g) => (
            <section key={g.title}>
              <h4>{g.title}</h4>
              <div className="pick-grid">
                {g.picks.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`pick-btn${count === 1 && isCurrent(meta, p) ? ' is-current' : ''}`}
                    onClick={() => onPick({ category: p.category, role: p.role })}
                  >
                    <Sketch pick={p} />
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <footer className="quick-pick-foot">
          <label className="quick-pick-next">
            <input type="checkbox" checked={autoNext} onChange={(e) => onAutoNext(e.target.checked)} disabled={count > 1} />
            Danach nächstes Tile
          </label>
          <button type="button" className="btn btn-ghost" onClick={() => onPick({ category: undefined, role: undefined })}>
            Keine Zuordnung
          </button>
          <button type="button" className="btn btn-secondary" onClick={onMore}>
            Mehr Optionen
          </button>
        </footer>
      </div>
    </div>
  );
}
