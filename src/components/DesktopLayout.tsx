import { useState } from 'react';
import { Logo } from './Logo';
import { Workspace, ViewSwitch } from './Workspace';
import { GeneratorPanel, GenerateButtons } from './GeneratorPanel';
import { ExportPanel } from '../export/ExportPanel';
import { LayersPanel } from '../layers/LayersPanel';
import { TilesPanel } from '../tilesets/TilesPanel';
import { PanelTabs } from './ui';
import { BrushSize, HoverInfo, ToolButtons, UndoRedo, ViewControls } from '../editor/Toolbar';
import { SaveState } from './SaveState';
import { Icon } from './icons';
import { useEditor } from '../store/editorStore';

export function DesktopLayout() {
  const [left, setLeft] = useState<'generator' | 'project'>('generator');
  return (
    <div className="desktop">
      <header className="topbar">
        <Logo />
        <div className="topbar-project">
          <SaveState />
          <button type="button" className="btn btn-ghost btn-new" onClick={() => useEditor.getState().openWizard()}>
            <Icon.Plus size={16} />
            <span>Neues Projekt</span>
          </button>
        </div>
        <div className="topbar-center">
          <ViewSwitch />
        </div>
        <div className="topbar-right">
          <UndoRedo />
          <span className="divider" />
          <GenerateButtons compact />
        </div>
      </header>

      <aside className="side side-left">
        <PanelTabs
          tabs={[
            { value: 'generator', label: 'Generator' },
            { value: 'project', label: 'Projekt & Export' },
          ]}
          value={left}
          onChange={setLeft}
        />
        {left === 'generator' ? <GeneratorPanel /> : <ExportPanel />}
      </aside>

      <main className="center">
        <Workspace>
          <div className="float-tools" role="toolbar" aria-label="Werkzeuge">
            <ToolButtons withKeys />
          </div>
          <div className="float-bottom-left">
            <BrushSize />
            <HoverInfo />
          </div>
          <div className="float-bottom-right">
            <ViewControls />
          </div>
        </Workspace>
      </main>

      <aside className="side side-right">
        <div className="side-block layers-block">
          <h2 className="block-title">Layer</h2>
          <LayersPanel />
        </div>
        <div className="side-block tiles-block">
          <h2 className="block-title">Tiles</h2>
          <TilesPanel />
        </div>
      </aside>
    </div>
  );
}
