import { MapCanvas } from '../editor/MapCanvas';
import { RoomGraph } from '../renderer/RoomGraph';
import { useEditor } from '../store/editorStore';
import { useProject } from '../store/projectStore';
import { Segmented } from './ui';
import { SelectionActions } from '../editor/Toolbar';
import type { ReactNode } from 'react';

export function ViewSwitch() {
  const view = useEditor((s) => s.view);
  const setView = useEditor((s) => s.setView);
  return (
    <Segmented
      label="Ansicht"
      value={view}
      onChange={setView}
      options={[
        { value: 'map', label: 'Map' },
        { value: 'graph', label: 'Room Graph' },
      ]}
    />
  );
}

/** Map canvas + room graph overlay. The canvas stays mounted to keep its camera. */
export function Workspace({ children }: { children?: ReactNode }) {
  const view = useEditor((s) => s.view);
  const generating = useProject((s) => s.generating);
  return (
    <div className={`workspace view-${view}`}>
      <MapCanvas />
      {view === 'graph' && <RoomGraph />}
      {view === 'map' && <SelectionActions />}
      {view === 'map' && children}
      {generating && <div className="busy-bar" />}
    </div>
  );
}
