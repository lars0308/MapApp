import { useState } from 'react';
import { useProject } from '../store/projectStore';
import { useEditor } from '../store/editorStore';
import type { Layer } from '../types';
import { IconButton, Button } from '../components/ui';
import { Icon } from '../components/icons';
import { ROLE_LABEL } from './defaults';

export function LayersPanel() {
  const layers = useProject((s) => s.project.layers);
  const activeId = useProject((s) => s.project.activeLayerId);
  const addLayer = useProject((s) => s.addLayer);
  // top-most layer first, like in every graphics editor
  const ordered = [...layers].reverse();
  return (
    <div className="layers">
      <ul className="layer-list">
        {ordered.map((l, i) => (
          <LayerRow key={l.id} layer={l} active={l.id === activeId} isTop={i === 0} isBottom={i === ordered.length - 1} canDelete={layers.length > 1} />
        ))}
      </ul>
      <Button variant="secondary" block icon={<Icon.Plus size={18} />} onClick={addLayer}>
        Layer hinzufügen
      </Button>
    </div>
  );
}

function LayerRow({ layer, active, isTop, isBottom, canDelete }: { layer: Layer; active: boolean; isTop: boolean; isBottom: boolean; canDelete: boolean }) {
  const s = useProject.getState();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(layer.name);
  const [menu, setMenu] = useState(false);
  const toast = useEditor((st) => st.toast);

  const commitName = () => {
    s.renameLayer(layer.id, name);
    setEditing(false);
  };

  return (
    <li className={`layer-row${active ? ' is-active' : ''}${layer.visible ? '' : ' is-hidden'}`}>
      <div className="layer-main">
        <IconButton label={layer.visible ? 'Ausblenden' : 'Einblenden'} className="layer-vis" onClick={() => s.toggleLayerVisible(layer.id)}>
          {layer.visible ? <Icon.Eye size={18} /> : <Icon.EyeOff size={18} />}
        </IconButton>
        <button type="button" className="layer-select" onClick={() => s.setActiveLayer(layer.id)} aria-pressed={active}>
          <span className="layer-color" style={{ background: layer.color }} />
          {editing ? (
            <input
              className="input input-plain"
              autoFocus
              value={name}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') {
                  setName(layer.name);
                  setEditing(false);
                }
              }}
            />
          ) : (
            <span className="layer-name">
              {layer.name}
              {ROLE_LABEL[layer.role] !== layer.name && <small>{ROLE_LABEL[layer.role]}</small>}
              {layer.ySort && <small className="ysort-badge" title="Y-Sort aktiv">Y</small>}
            </span>
          )}
        </button>
        <IconButton label={layer.locked ? 'Entsperren' : 'Sperren'} active={layer.locked} className="layer-lock" onClick={() => s.toggleLayerLocked(layer.id)}>
          {layer.locked ? <Icon.Lock size={18} /> : <Icon.Unlock size={18} />}
        </IconButton>
        <IconButton label="Weitere Aktionen" active={menu} onClick={() => setMenu(!menu)}>
          <Icon.More size={18} />
        </IconButton>
      </div>
      {menu && (
        <div className="layer-actions">
          <IconButton label="Nach oben" disabled={isTop} onClick={() => s.moveLayer(layer.id, 1)}>
            <Icon.Up size={18} />
          </IconButton>
          <IconButton label="Nach unten" disabled={isBottom} onClick={() => s.moveLayer(layer.id, -1)}>
            <Icon.Down size={18} />
          </IconButton>
          <IconButton
            label="Umbenennen"
            onClick={() => {
              setName(layer.name);
              setEditing(true);
            }}
          >
            <Icon.Pencil size={18} />
          </IconButton>
          <button
            type="button"
            className={`icon-btn ysort-toggle${layer.ySort ? ' is-active' : ''}`}
            aria-pressed={layer.ySort}
            title="Y-Sort: mit Objekten und Charakteren nach Y sortieren"
            onClick={() => s.setLayerYSort(layer.id, !layer.ySort)}
          >
            Y
          </button>
          <IconButton
            label="Duplizieren"
            onClick={() => {
              s.duplicateLayer(layer.id);
              setMenu(false);
            }}
          >
            <Icon.Duplicate size={18} />
          </IconButton>
          <IconButton
            label="Löschen"
            disabled={!canDelete}
            className="danger"
            onClick={() => {
              s.removeLayer(layer.id);
              toast(`Layer „${layer.name}“ gelöscht – Rückgängig möglich`);
            }}
          >
            <Icon.Trash size={18} />
          </IconButton>
        </div>
      )}
    </li>
  );
}
