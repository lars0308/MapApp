export const APP_NAME = 'MapForge';

/** Pixel mark: a small room + corridor glyph on a 8×8 grid. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="0" y="0" width="8" height="8" rx="1.4" fill="#1c1b21" />
      <rect x="1" y="1" width="3" height="3" fill="#e889b0" />
      <rect x="4" y="2" width="2" height="1" fill="#b0a9bb" />
      <rect x="5" y="3" width="1" height="2" fill="#b0a9bb" />
      <rect x="4" y="5" width="3" height="2" fill="#e8e6ec" />
      <rect x="2" y="4" width="1" height="2" fill="#b0a9bb" />
      <rect x="1" y="6" width="2" height="1" fill="#b0a9bb" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="logo">
      <LogoMark />
      <span className="logo-word">{APP_NAME}</span>
    </div>
  );
}
