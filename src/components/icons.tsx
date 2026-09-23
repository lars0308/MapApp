import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Icon = {
  Brush: (p: P) => (
    <Svg {...p}>
      <path d="M14.5 4.5l5 5L10 19H5v-5z" />
      <path d="M12.5 6.5l5 5" />
    </Svg>
  ),
  Eraser: (p: P) => (
    <Svg {...p}>
      <path d="M8.5 19.5L3.8 14.8a1.5 1.5 0 010-2.1l8.9-8.9a1.5 1.5 0 012.1 0l5.4 5.4a1.5 1.5 0 010 2.1L12 19.5z" />
      <path d="M8 9l7 7M12 19.5h8" />
    </Svg>
  ),
  Fill: (p: P) => (
    <Svg {...p}>
      <path d="M5 11l7-7 7 7-7 7z" />
      <path d="M5 11h14" />
      <path d="M20 15.5c0 1.2-.8 2-1.5 2s-1.5-.8-1.5-2 1.5-3 1.5-3 1.5 1.8 1.5 3z" fill="currentColor" stroke="none" />
    </Svg>
  ),
  Rect: (p: P) => (
    <Svg {...p}>
      <rect x="4.5" y="5.5" width="15" height="13" rx="1.5" />
    </Svg>
  ),
  Pipette: (p: P) => (
    <Svg {...p}>
      <path d="M14 6l4 4M16.5 3.5a2.1 2.1 0 013 3L17 9l-2-2z" />
      <path d="M15 8L6.5 16.5 5 20l3.5-1.5L17 10" />
    </Svg>
  ),
  Select: (p: P) => (
    <Svg {...p}>
      <path d="M4 7V5a1 1 0 011-1h2M11 4h2M17 4h2a1 1 0 011 1v2M20 11v2M20 17v2a1 1 0 01-1 1h-2M13 20h-2M7 20H5a1 1 0 01-1-1v-2M4 13v-2" />
    </Svg>
  ),
  Move: (p: P) => (
    <Svg {...p}>
      <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />
    </Svg>
  ),
  Play: (p: P) => (
    <Svg {...p}>
      <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />
    </Svg>
  ),
  Gear: (p: P) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" />
    </Svg>
  ),
  Mountain: (p: P) => (
    <Svg {...p}>
      <path d="M3 19l6-10 4 6 2.5-3.5L21 19z" />
      <path d="M7.5 11.5l1.5 1 1.5-1" />
    </Svg>
  ),
  Hand: (p: P) => (
    <Svg {...p}>
      <path d="M8 12V6.5a1.5 1.5 0 013 0V11M11 10.5v-6a1.5 1.5 0 013 0V11M14 11V6.5a1.5 1.5 0 013 0V14c0 3.9-2.6 6.5-6 6.5-2.5 0-3.8-1-5.2-3L4 14.8a1.5 1.5 0 012.4-1.8L8 15" />
    </Svg>
  ),
  Undo: (p: P) => (
    <Svg {...p}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 010 11H11" />
    </Svg>
  ),
  Redo: (p: P) => (
    <Svg {...p}>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 000 11H13" />
    </Svg>
  ),
  Grid: (p: P) => (
    <Svg {...p}>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16" />
    </Svg>
  ),
  Eye: (p: P) => (
    <Svg {...p}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </Svg>
  ),
  EyeOff: (p: P) => (
    <Svg {...p}>
      <path d="M4 4l16 16" />
      <path d="M9.9 6A9.8 9.8 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 01-2.7 3.4M6.4 7.6A16.5 16.5 0 002.5 12s3.5 6.5 9.5 6.5c1.5 0 2.8-.4 4-1" />
    </Svg>
  ),
  Lock: (p: P) => (
    <Svg {...p}>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 018 0v2.5" />
    </Svg>
  ),
  Unlock: (p: P) => (
    <Svg {...p}>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 017.7-1.5" />
    </Svg>
  ),
  Plus: (p: P) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  Minus: (p: P) => (
    <Svg {...p}>
      <path d="M5 12h14" />
    </Svg>
  ),
  Trash: (p: P) => (
    <Svg {...p}>
      <path d="M4.5 7h15M10 11v6M14 11v6M6 7l1 12.5a1 1 0 001 .9h8a1 1 0 001-.9L18 7M9 7V4.5h6V7" />
    </Svg>
  ),
  Duplicate: (p: P) => (
    <Svg {...p}>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5.5A1.5 1.5 0 0014.5 4h-9A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8" />
    </Svg>
  ),
  Up: (p: P) => (
    <Svg {...p}>
      <path d="M6 14l6-6 6 6" />
    </Svg>
  ),
  Down: (p: P) => (
    <Svg {...p}>
      <path d="M6 10l6 6 6-6" />
    </Svg>
  ),
  Dice: (p: P) => (
    <Svg {...p}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
    </Svg>
  ),
  Copy: (p: P) => (
    <Svg {...p}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 9V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7a2 2 0 002 2h3" />
    </Svg>
  ),
  Save: (p: P) => (
    <Svg {...p}>
      <path d="M5 4h11l3 3v12a1 1 0 01-1 1H6a1 1 0 01-1-1z" />
      <path d="M8 4v5h7V4M8 20v-6h8v6" />
    </Svg>
  ),
  Folder: (p: P) => (
    <Svg {...p}>
      <path d="M3.5 7.5a2 2 0 012-2h4l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2h-13a2 2 0 01-2-2z" />
    </Svg>
  ),
  Upload: (p: P) => (
    <Svg {...p}>
      <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V15" />
    </Svg>
  ),
  Download: (p: P) => (
    <Svg {...p}>
      <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 15v3.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V15" />
    </Svg>
  ),
  Map: (p: P) => (
    <Svg {...p}>
      <path d="M9 5L3.5 7v12L9 17l6 2 5.5-2V5L15 7z" />
      <path d="M9 5v12M15 7v12" />
    </Svg>
  ),
  Sliders: (p: P) => (
    <Svg {...p}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </Svg>
  ),
  Tiles: (p: P) => (
    <Svg {...p}>
      <rect x="4" y="4" width="7" height="7" rx="1.2" />
      <rect x="13" y="4" width="7" height="7" rx="1.2" />
      <rect x="4" y="13" width="7" height="7" rx="1.2" />
      <rect x="13" y="13" width="7" height="7" rx="1.2" />
    </Svg>
  ),
  Layers: (p: P) => (
    <Svg {...p}>
      <path d="M12 4l8.5 4.5L12 13 3.5 8.5z" />
      <path d="M3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5" />
    </Svg>
  ),
  Export: (p: P) => (
    <Svg {...p}>
      <path d="M12 3.5v11M8 7.5l4-4 4 4" />
      <path d="M8 11H6.5A1.5 1.5 0 005 12.5v6A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5v-6a1.5 1.5 0 00-1.5-1.5H16" />
    </Svg>
  ),
  Graph: (p: P) => (
    <Svg {...p}>
      <circle cx="6" cy="6.5" r="2.3" />
      <circle cx="18" cy="8" r="2.3" />
      <circle cx="10" cy="17.5" r="2.3" />
      <path d="M8.2 7l7.5.8M7 8.6l2.1 6.8M16.4 9.7l-4.6 6.2" />
    </Svg>
  ),
  Fit: (p: P) => (
    <Svg {...p}>
      <path d="M4 9V5a1 1 0 011-1h4M15 4h4a1 1 0 011 1v4M20 15v4a1 1 0 01-1 1h-4M9 20H5a1 1 0 01-1-1v-4" />
    </Svg>
  ),
  ChevronDown: (p: P) => (
    <Svg {...p}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  ),
  ChevronRight: (p: P) => (
    <Svg {...p}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  ),
  Maximize: (p: P) => (
    <Svg {...p}>
      <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />
    </Svg>
  ),
  Restore: (p: P) => (
    <Svg {...p}>
      <path d="M20 4l-6 6M14 5v5h5M4 20l6-6M10 19v-5H5" />
    </Svg>
  ),
  PanelLeft: (p: P) => (
    <Svg {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9 4.5v15" />
    </Svg>
  ),
  PanelRight: (p: P) => (
    <Svg {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M15 4.5v15" />
    </Svg>
  ),
  Close: (p: P) => (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  ),
  Check: (p: P) => (
    <Svg {...p}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  ),
  Crosshair: (p: P) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
    </Svg>
  ),
  Pencil: (p: P) => (
    <Svg {...p}>
      <path d="M15.5 4.5l4 4L9 19H5v-4z" />
    </Svg>
  ),
  Info: (p: P) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.6v.1" />
    </Svg>
  ),
  Spark: (p: P) => (
    <Svg {...p}>
      <path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z" />
      <path d="M18.5 16l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </Svg>
  ),
  More: (p: P) => (
    <Svg {...p}>
      <circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </Svg>
  ),
  Person: (p: P) => (
    <Svg {...p}>
      <circle cx="12" cy="7" r="3.2" />
      <path d="M5.5 20c.6-4 3.2-6.2 6.5-6.2s5.9 2.2 6.5 6.2" />
    </Svg>
  ),
  Box: (p: P) => (
    <Svg {...p}>
      <path d="M4 8l8-4 8 4v8l-8 4-8-4z" />
      <path d="M4 8l8 4 8-4M12 12v8" />
    </Svg>
  ),
  Mirror: (p: P) => (
    <Svg {...p}>
      <path d="M12 3v18" strokeDasharray="2 2.5" />
      <path d="M9 7L4 17h5zM15 7l5 10h-5z" />
    </Svg>
  ),
  Line: (p: P) => (
    <Svg {...p}>
      <path d="M5 19L19 5" />
    </Svg>
  ),
  Collision: (p: P) => (
    <Svg {...p}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 12l8-8M4 20L20 4M12 20l8-8" />
    </Svg>
  ),
  Home: (p: P) => (
    <Svg {...p}>
      <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />
    </Svg>
  ),
};

export type IconName = keyof typeof Icon;
