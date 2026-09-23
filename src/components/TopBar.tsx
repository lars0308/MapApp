import { useEffect, useRef } from 'react';
import { Logo, LogoMark } from './Logo';
import { Icon } from './icons';
import { SaveState } from './SaveState';
import { GenerateButtons } from './GeneratorPanel';
import { UndoRedo } from '../editor/Toolbar';
import { PAGES, useApp, type Page } from '../store/appStore';
import { useEditor } from '../store/editorStore';
import { startPlaytest, stopPlaytest } from '../playtest/controller';
import { getRenderer } from '../editor/rendererRef';

const PAGE_ICON: Record<Page, (p: { size?: number }) => React.ReactElement> = {
  project: Icon.Folder,
  map: Icon.Map,
  character: Icon.Person,
  object: Icon.Box,
  settings: Icon.Gear,
};

/** Projekt | Karte bauen | Charakter bauen | Objekt bauen | Einstellungen */
export function PageTabs({ compact }: { compact?: boolean }) {
  const page = useApp((s) => s.page);
  const goTo = useApp((s) => s.goTo);
  const ref = useRef<HTMLElement>(null);
  // phones: keep the active tab in view
  useEffect(() => {
    ref.current?.querySelector('.is-active')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [page]);
  return (
    <nav ref={ref} className={`page-tabs${compact ? ' is-compact' : ''}`} aria-label="Bereiche">
      {PAGES.map((p) => {
        const I = PAGE_ICON[p.id];
        return (
          <button
            key={p.id}
            type="button"
            data-page={p.id}
            className={page === p.id ? 'is-active' : ''}
            aria-current={page === p.id ? 'page' : undefined}
            title={p.label}
            onClick={() => goTo(p.id)}
          >
            <I size={compact ? 20 : 17} />
            <span className="tab-long">{p.label}</span>
            <span className="tab-short">{p.short}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** Round play button: test the map (switches to "Karte bauen" if needed). */
export function PlayButton() {
  const playtest = useEditor((s) => s.playtest);
  const page = useApp((s) => s.page);
  const onClick = () => {
    if (playtest) return stopPlaytest();
    if (page !== 'map') {
      useApp.getState().goTo('map');
      // wait until the map canvas (renderer) is mounted
      const t0 = performance.now();
      const wait = () => (getRenderer() || performance.now() - t0 > 2000 ? startPlaytest() : requestAnimationFrame(wait));
      requestAnimationFrame(wait);
      return;
    }
    startPlaytest();
  };
  return (
    <button
      type="button"
      className={`btn-play btn-test${playtest ? ' is-active' : ''}`}
      aria-label={playtest ? 'Test beenden' : 'Testen'}
      title={playtest ? 'Test beenden' : 'Map testen – mit einer Figur herumlaufen'}
      onClick={onClick}
    >
      {playtest ? <Icon.Close size={18} /> : <Icon.Play size={18} />}
    </button>
  );
}

/** Desktop header for every page. `mapActions` = the map editor's own actions (panels, undo …). */
export function TopBar({ mapActions }: { mapActions?: React.ReactNode }) {
  const page = useApp((s) => s.page);
  return (
    <header className="topbar app-topbar">
      <div className="topbar-brand">
        <Logo />
        <SaveState />
      </div>
      <PageTabs />
      <div className="topbar-right">
        {page === 'map' && mapActions}
        {page === 'map' && <UndoRedo />}
        <PlayButton />
        {page === 'map' && <GenerateButtons compact />}
      </div>
    </header>
  );
}

/** Phone header: page tabs + play; the map page adds its own action row below. */
export function MobileTopBar() {
  return (
    <header className="m-top m-top-pages">
      <LogoMark size={24} />
      <PageTabs compact />
      <PlayButton />
    </header>
  );
}
