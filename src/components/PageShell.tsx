import type { ReactNode } from 'react';
import { MobileTopBar, TopBar } from './TopBar';

/** Header with the page tabs + page content (every page except the map editor, which has its own layout). */
export function PageShell({ desktop, children }: { desktop: boolean; children: ReactNode }) {
  return (
    <div className={`page-shell${desktop ? ' is-desktop' : ' is-mobile'}`}>
      {desktop ? <TopBar /> : <MobileTopBar />}
      <main className="page-main">{children}</main>
    </div>
  );
}
