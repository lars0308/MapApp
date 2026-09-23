import { LogoMark } from '../components/Logo';
import { Workspace, ViewSwitch } from '../components/Workspace';
import { GeneratorPanel, GenerateButtons } from '../components/GeneratorPanel';
import { ExportPanel } from '../export/ExportPanel';
import { LayersPanel } from '../layers/LayersPanel';
import { TilesPanel } from '../tilesets/TilesPanel';
import { ActiveTileChip, BrushSize, ToolButtons, UndoRedo } from '../editor/Toolbar';
import { BottomSheet } from './BottomSheet';
import { useEditor, type MobilePanel } from '../store/editorStore';
import { useProject } from '../store/projectStore';
import { viewEvents } from '../store/events';
import { Icon } from '../components/icons';
import { IconButton } from '../components/ui';
import { SaveState } from '../components/SaveState';
import { TerrainPanel } from '../components/TerrainPanel';
import { SettingsPanel } from '../components/SettingsPanel';
import { PlaytestOverlay } from '../playtest/PlaytestOverlay';
import { startPlaytest } from '../playtest/controller';

const NAV: { id: MobilePanel; label: string; icon: (p: { size?: number }) => React.ReactElement }[] = [
  { id: null, label: 'Map', icon: Icon.Map },
  { id: 'generate', label: 'Generator', icon: Icon.Sliders },
  { id: 'terrain', label: 'Terrain', icon: Icon.Mountain },
  { id: 'tiles', label: 'Tiles', icon: Icon.Tiles },
  { id: 'layers', label: 'Layer', icon: Icon.Layers },
  { id: 'export', label: 'Export', icon: Icon.Export },
];

const TITLES: Record<Exclude<MobilePanel, null>, string> = {
  generate: 'Generator',
  terrain: 'Terrain',
  settings: 'Einstellungen',
  tiles: 'Tiles',
  layers: 'Layer',
  export: 'Projekt & Export',
};

export function MobileLayout() {
  const panel = useEditor((s) => s.mobilePanel);
  const setPanel = useEditor((s) => s.setMobilePanel);
  const view = useEditor((s) => s.view);
  const showGrid = useEditor((s) => s.showGrid);
  const toggleGrid = useEditor((s) => s.toggleGrid);
  const playtest = useEditor((s) => s.playtest);
  const run = useProject((s) => s.runGenerate);
  const busy = useProject((s) => s.generating);

  return (
    <div className={`mobile${panel ? ' has-sheet' : ''}${playtest ? ' is-playtest' : ''}`}>
      <header className="m-top">
        <LogoMark size={26} />
        <SaveState />
        <div className="m-top-actions">
          <IconButton label="Neues Projekt" onClick={() => useEditor.getState().openWizard()}>
            <Icon.Plus size={20} />
          </IconButton>
          <UndoRedo />
          <IconButton label="Playtest" active={playtest} onClick={() => startPlaytest()}>
            <Icon.Play size={18} />
          </IconButton>
          <button type="button" className="btn btn-primary m-generate" disabled={busy} onClick={() => run()}>
            <Icon.Spark size={18} />
            <span>{busy ? '…' : 'Generieren'}</span>
          </button>
        </div>
      </header>

      <main className="m-main">
        <Workspace>
          <div className="m-float-top-right">
            <IconButton label="Raster" active={showGrid} onClick={toggleGrid}>
              <Icon.Grid size={20} />
            </IconButton>
            <IconButton label="Einstellungen" active={panel === 'settings'} onClick={() => setPanel(panel === 'settings' ? null : 'settings')}>
              <Icon.Gear size={20} />
            </IconButton>
            <IconButton label="Einpassen" onClick={() => viewEvents.emit({ type: 'fit' })}>
              <Icon.Fit size={20} />
            </IconButton>
          </div>
          <PlaytestOverlay touch />
          {!panel && !playtest && (
            <div className="m-float-bottom">
              <ActiveTileChip onClick={() => setPanel('tiles')} />
              <BrushSize />
            </div>
          )}
        </Workspace>
        {!playtest && (
          <div className="m-view-switch">
            <ViewSwitch />
          </div>
        )}
      </main>

      {panel && !playtest && (
        <BottomSheet
          title={TITLES[panel]}
          onClose={() => setPanel(null)}
          footer={panel === 'generate' || panel === 'terrain' ? <GenerateButtons /> : undefined}
        >
          {panel === 'generate' && <GeneratorPanel />}
          {panel === 'terrain' && <TerrainPanel />}
          {panel === 'settings' && <SettingsPanel />}
          {panel === 'tiles' && <TilesPanel />}
          {panel === 'layers' && <LayersPanel />}
          {panel === 'export' && <ExportPanel />}
        </BottomSheet>
      )}

      {!panel && view === 'map' && !playtest && (
        <div className="m-tools" role="toolbar" aria-label="Werkzeuge">
          <ToolButtons />
        </div>
      )}

      <nav className="m-nav" aria-label="Navigation">
        {NAV.map((n) => {
          const active = panel === n.id;
          const I = n.icon;
          return (
            <button
              key={n.label}
              type="button"
              className={active ? 'is-active' : ''}
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                setPanel(n.id === panel ? null : n.id);
                if (n.id === null) useEditor.getState().setView('map');
              }}
            >
              <I size={22} />
              <span>{n.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
