import { useEffect, useState } from 'react';
import { Logo } from './Logo';
import { Workspace, ViewSwitch } from './Workspace';
import { GeneratorPanel, GenerateButtons } from './GeneratorPanel';
import { ExportPanel } from '../export/ExportPanel';
import { LayersPanel } from '../layers/LayersPanel';
import { TilesPanel } from '../tilesets/TilesPanel';
import { PanelTabs } from './ui';
import { BrushSize, HoverInfo, ToolButtons, UndoRedo, ViewControls } from '../editor/Toolbar';
import { SaveState } from './SaveState';
import { TerrainPanel } from './TerrainPanel';
import { SettingsPanel } from './SettingsPanel';
import { PlaytestOverlay } from '../playtest/PlaytestOverlay';
import { startPlaytest, stopPlaytest } from '../playtest/controller';
import { Icon } from './icons';
import { useEditor } from '../store/editorStore';
import { IconButton } from './ui';
import { LIMITS, useLayout, type LeftTab, type PanelId } from '../store/layoutStore';
import { PanelActions, ResizeHandle } from './desktop/Dock';

const LEFT_TABS: { value: LeftTab; label: string; icon: (p: { size?: number }) => React.ReactElement }[] = [
  { value: 'generator', label: 'Generator', icon: Icon.Sliders },
  { value: 'terrain', label: 'Terrain', icon: Icon.Mountain },
  { value: 'project', label: 'Export', icon: Icon.Export },
  { value: 'settings', label: 'Einstellungen', icon: Icon.Gear },
];
const RAIL = 44;

function useViewportWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

export function DesktopLayout() {
  const playtest = useEditor((s) => s.playtest);
  const L = useLayout();
  const vw = useViewportWidth();

  const leftOpen = !L.panels.left.closed;
  const leftRail = leftOpen && L.panels.left.collapsed && L.maximized !== 'left';
  const sections = (['layers', 'tiles'] as const).filter((id) => !L.panels[id].closed);
  const rightOpen = sections.length > 0;
  const rightRail = rightOpen && sections.every((id) => L.panels[id].collapsed) && !sections.includes(L.maximized as 'layers');

  // side widths: the map always keeps LIMITS.centerMin
  const rightW = !rightOpen ? 0 : rightRail ? RAIL : Math.max(LIMITS.sideMin, Math.min(L.rightWidth, vw - LIMITS.centerMin - (leftOpen ? (leftRail ? RAIL : LIMITS.sideMin) : 0)));
  const leftW = !leftOpen ? 0 : leftRail ? RAIL : Math.max(LIMITS.sideMin, Math.min(L.leftWidth, vw - LIMITS.centerMin - rightW));
  const leftMax = vw - LIMITS.centerMin - rightW;
  const rightMax = vw - LIMITS.centerMin - leftW;

  // Esc restores a maximized panel
  useEffect(() => {
    if (!L.maximized) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && useLayout.getState().toggleMaximized(L.maximized!);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [L.maximized]);

  const openSettings = () => {
    const s = useLayout.getState();
    if (s.leftTab === 'settings' && !s.panels.left.closed && !s.panels.left.collapsed) s.setLeftTab('generator');
    else s.show('left', 'settings');
  };
  const leftPanel = L.leftTab === 'generator' ? <GeneratorPanel /> : L.leftTab === 'terrain' ? <TerrainPanel /> : L.leftTab === 'project' ? <ExportPanel /> : <SettingsPanel desktop />;
  const settingsOpen = leftOpen && !leftRail && L.leftTab === 'settings';

  return (
    <div className={`desktop${L.maximized ? ' has-maximized' : ''}`} style={{ gridTemplateColumns: `${leftW}px minmax(0, 1fr) ${rightW}px` }}>
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
          <div className="panel-toggles" role="group" aria-label="Panels ein- und ausblenden">
            <PanelToggle id="left" label="Linkes Panel" icon={<Icon.PanelLeft size={18} />} />
            <PanelToggle id="layers" label="Layer-Panel" icon={<Icon.Layers size={18} />} />
            <PanelToggle id="tiles" label="Tiles-Panel" icon={<Icon.Tiles size={18} />} />
          </div>
          <span className="divider" />
          <UndoRedo />
          <span className="divider" />
          <button type="button" className={`btn btn-secondary btn-test${playtest ? ' is-active' : ''}`} onClick={() => (playtest ? stopPlaytest() : startPlaytest())}>
            <Icon.Play size={16} />
            <span>{playtest ? 'Beenden' : 'Testen'}</span>
          </button>
          <GenerateButtons compact />
        </div>
      </header>

      {leftOpen && (
        <aside className={`side side-left${leftRail ? ' is-rail' : ''}${L.maximized === 'left' ? ' is-maximized' : ''}`} aria-label="Generator, Terrain, Export, Einstellungen">
          {leftRail ? (
            <div className="dock-rail">
              <IconButton label="Linkes Panel ausklappen" onClick={() => L.toggleCollapsed('left')}>
                <Icon.ChevronRight size={16} />
              </IconButton>
              {LEFT_TABS.map((t) => (
                <IconButton key={t.value} label={t.label} active={L.leftTab === t.value} onClick={() => L.show('left', t.value)}>
                  <t.icon size={18} />
                </IconButton>
              ))}
            </div>
          ) : (
            <>
              <div className="dock-head">
                <PanelTabs tabs={LEFT_TABS.map(({ value, label }) => ({ value, label }))} value={L.leftTab} onChange={L.setLeftTab} />
                <PanelActions id="left" label="Linkes Panel" />
              </div>
              {leftPanel}
              {L.maximized !== 'left' && (
                <ResizeHandle
                  axis="x"
                  sign={1}
                  value={leftW}
                  min={LIMITS.sideMin}
                  max={leftMax}
                  label="Breite linkes Panel"
                  className="at-right"
                  onChange={(leftWidth) => L.setSize({ leftWidth })}
                  onReset={() => L.resetSize('leftWidth')}
                />
              )}
            </>
          )}
        </aside>
      )}

      <main className="center">
        <Workspace>
          <PlaytestOverlay touch={false} />
          {!playtest && (
            <>
              <div className="float-tools" role="toolbar" aria-label="Werkzeuge">
                <ToolButtons withKeys />
              </div>
              <div className="float-bottom-left">
                <BrushSize />
                <HoverInfo />
              </div>
            </>
          )}
          <div className="float-bottom-right">
            <ViewControls onSettings={openSettings} settingsOpen={settingsOpen} />
          </div>
        </Workspace>
      </main>

      {rightOpen && (
        <aside className={`side side-right${rightRail ? ' is-rail' : ''}`} aria-label="Layer und Tiles">
          {rightRail ? (
            <div className="dock-rail">
              {sections.map((id) => (
                <IconButton key={id} label={id === 'layers' ? 'Layer ausklappen' : 'Tiles ausklappen'} onClick={() => L.toggleCollapsed(id)}>
                  {id === 'layers' ? <Icon.Layers size={18} /> : <Icon.Tiles size={18} />}
                </IconButton>
              ))}
            </div>
          ) : (
            <>
              {!L.panels.layers.closed && (
                <DockSection
                  id="layers"
                  title="Layer"
                  // fixed height only while the tiles section below takes the rest
                  height={!L.panels.layers.collapsed && !L.panels.tiles.closed && !L.panels.tiles.collapsed ? L.layersHeight : undefined}
                >
                  <LayersPanel />
                </DockSection>
              )}
              {!L.panels.layers.closed && !L.panels.layers.collapsed && !L.panels.tiles.closed && !L.panels.tiles.collapsed && L.maximized !== 'layers' && L.maximized !== 'tiles' && (
                <ResizeHandle
                  axis="y"
                  sign={1}
                  value={L.layersHeight}
                  min={LIMITS.sectionMin}
                  max={window.innerHeight - 260}
                  label="Höhe Layer-Bereich"
                  className="between"
                  onChange={(layersHeight) => L.setSize({ layersHeight })}
                  onReset={() => L.resetSize('layersHeight')}
                />
              )}
              {!L.panels.tiles.closed && (
                <DockSection id="tiles" title="Tiles">
                  <TilesPanel />
                </DockSection>
              )}
              {!sections.includes(L.maximized as 'layers') && (
                <ResizeHandle
                  axis="x"
                  sign={-1}
                  value={rightW}
                  min={LIMITS.sideMin}
                  max={rightMax}
                  label="Breite rechtes Panel"
                  className="at-left"
                  onChange={(rightWidth) => L.setSize({ rightWidth })}
                  onReset={() => L.resetSize('rightWidth')}
                />
              )}
            </>
          )}
        </aside>
      )}

      {L.maximized && <div className="dock-backdrop" role="presentation" onClick={() => L.toggleMaximized(L.maximized!)} />}
    </div>
  );
}

/** Section of the right dock (Layer, Tiles): header with actions, collapsible, maximizable. */
function DockSection({ id, title, height, children }: { id: PanelId; title: string; height?: number; children: React.ReactNode }) {
  const collapsed = useLayout((s) => s.panels[id].collapsed);
  const maximized = useLayout((s) => s.maximized === id);
  const style = height !== undefined && !maximized ? { height: `clamp(${LIMITS.sectionMin}px, ${height}px, calc(100% - 170px))` } : undefined;
  return (
    <section
      className={`side-block dock-section ${id}-block${collapsed && !maximized ? ' is-collapsed' : ''}${height !== undefined ? ' is-sized' : ''}${maximized ? ' is-maximized' : ''}`}
      style={style}
      aria-label={title}
    >
      <div className="dock-head">
        <button type="button" className="block-title" aria-expanded={!collapsed} onClick={() => useLayout.getState().toggleCollapsed(id)}>
          {title}
        </button>
        <PanelActions id={id} label={`${title}-Panel`} />
      </div>
      {(!collapsed || maximized) && <div className="dock-body">{children}</div>}
    </section>
  );
}

/** Topbar toggle: show / hide a panel. */
function PanelToggle({ id, label, icon }: { id: PanelId; label: string; icon: React.ReactNode }) {
  const closed = useLayout((s) => s.panels[id].closed);
  return (
    <IconButton label={`${label} ${closed ? 'einblenden' : 'ausblenden'}`} active={!closed} onClick={() => (closed ? useLayout.getState().show(id) : useLayout.getState().setClosed(id, true))}>
      {icon}
    </IconButton>
  );
}

