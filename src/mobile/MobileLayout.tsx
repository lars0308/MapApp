import { MobileTopBar } from '../components/TopBar';
import { useApp } from '../store/appStore';
import { Workspace, ViewSwitch } from '../components/Workspace';
import { GeneratorPanel, GenerateButtons } from '../components/GeneratorPanel';
import { LayersPanel } from '../layers/LayersPanel';
import { TilesPanel } from '../tilesets/TilesPanel';
import { ActiveTileChip, BrushSize, CollisionToggle, TileTurn, ToolButtons, UndoRedo } from '../editor/Toolbar';
import { BottomSheet } from './BottomSheet';
import { useEditor, type MobilePanel } from '../store/editorStore';
import { useProject } from '../store/projectStore';
import { viewEvents } from '../store/events';
import { Icon } from '../components/icons';
import { IconButton } from '../components/ui';
import { SaveState } from '../components/SaveState';
import { TerrainPanel } from '../components/TerrainPanel';
import { PlaytestOverlay } from '../playtest/PlaytestOverlay';

const NAV: { id: MobilePanel; label: string; icon: (p: { size?: number }) => React.ReactElement }[] = [
  { id: null, label: 'Map', icon: Icon.Map },
  { id: 'generate', label: 'Generator', icon: Icon.Sliders },
  { id: 'terrain', label: 'Terrain', icon: Icon.Mountain },
  { id: 'tiles', label: 'Tiles', icon: Icon.Tiles },
  { id: 'layers', label: 'Layer', icon: Icon.Layers },
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
  const showCollision = useEditor((s) => s.showCollision);
  const run = useProject((s) => s.runGenerate);
  const busy = useProject((s) => s.generating);
  const manual = useProject((s) => s.project.mode === 'manual');
  // side-scroller / hex: terrain settings live in the generator panel
  const plain = useProject((s) => s.project.map.perspective === 'side_view' || s.project.map.perspective === 'hex');

  return (
    <div className={`mobile${panel ? ' has-sheet' : ''}${playtest ? ' is-playtest' : ''}`}>
      <MobileTopBar />
      {!playtest && (
        <div className="m-actions">
          <SaveState />
          <div className="m-top-actions">
            <UndoRedo />
            {!manual && (
              <>
                <IconButton label="Neue Variante" onClick={() => run({ newSeed: true })} disabled={busy}>
                  <Icon.Dice size={19} />
                </IconButton>
                <button type="button" className="btn btn-primary m-generate" disabled={busy} onClick={() => run()}>
                  <Icon.Spark size={18} />
                  <span>{busy ? '…' : 'Generieren'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <main className="m-main">
        <Workspace>
          <div className="m-float-top-right">
            <IconButton label="Raster" active={showGrid} onClick={toggleGrid}>
              <Icon.Grid size={20} />
            </IconButton>
            <CollisionToggle size={20} active={showCollision} onToggle={() => useEditor.getState().setFlag('showCollision', !showCollision)} />
            <IconButton label="Einstellungen" onClick={() => useApp.getState().goTo('settings')}>
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
              <TileTurn />
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
          {panel === 'tiles' && <TilesPanel />}
          {panel === 'layers' && <LayersPanel />}
        </BottomSheet>
      )}

      {!panel && view === 'map' && !playtest && (
        <div className="m-tools" role="toolbar" aria-label="Werkzeuge">
          <ToolButtons />
        </div>
      )}

      <nav className="m-nav" aria-label="Navigation">
        {NAV.filter((n) => n.id !== 'terrain' || !plain).map((n) => {
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
