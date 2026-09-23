import type { Perspective } from '../../types';

// Small illustrative mock-ups of the three perspectives (same room, different wall roles).

const C = {
  bg: '#0e0e12',
  floorA: '#3b3641',
  floorB: '#35303b',
  grout: '#2a262f',
  cap: '#1f1b23',
  capEdge: '#5e5667',
  face: '#4a4351',
  faceLine: '#2e2934',
  faceHi: '#554d5d',
  side: '#3a3441',
  door: '#6b4b30',
  shadow: 'rgba(6,5,10,0.45)',
};

function Floor({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const tiles = [];
  for (let ty = 0; ty < h; ty += 8)
    for (let tx = 0; tx < w; tx += 8)
      tiles.push(<rect key={`${tx}-${ty}`} x={x + tx} y={y + ty} width={Math.min(8, w - tx)} height={Math.min(8, h - ty)} fill={(tx + ty) % 16 ? C.floorA : C.floorB} stroke={C.grout} strokeWidth={0.6} />);
  return <g>{tiles}</g>;
}

function Bricks({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const lines = [];
  for (let r = 0; r * 4 < h; r++) {
    lines.push(<rect key={`h${r}`} x={x} y={y + r * 4} width={w} height={0.8} fill={C.faceHi} />);
    for (let bx = (r % 2) * 4; bx < w; bx += 8) lines.push(<rect key={`v${r}-${bx}`} x={x + bx} y={y + r * 4} width={0.8} height={Math.min(4, h - r * 4)} fill={C.faceLine} />);
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={C.face} />
      {lines}
    </g>
  );
}

export function PerspectivePreview({ perspective }: { perspective: Perspective }) {
  // room interior: x 22..98, y 18..70
  if (perspective === 'top_down') {
    return (
      <svg viewBox="0 0 120 84" className="persp-svg" aria-hidden="true" shapeRendering="crispEdges">
        <rect width="120" height="84" fill={C.bg} />
        <rect x="16" y="10" width="88" height="66" fill={C.cap} />
        <Floor x={22} y={16} w={76} h={54} />
        <rect x="22" y="15" width="76" height="1" fill={C.capEdge} />
        <rect x="22" y="70" width="76" height="1" fill={C.capEdge} />
        <rect x="21" y="16" width="1" height="54" fill={C.capEdge} />
        <rect x="98" y="16" width="1" height="54" fill={C.capEdge} />
        <rect x="54" y="70" width="12" height="6" fill={C.door} />
      </svg>
    );
  }
  if (perspective === 'low_top_down') {
    return (
      <svg viewBox="0 0 120 84" className="persp-svg" aria-hidden="true" shapeRendering="crispEdges">
        <rect width="120" height="84" fill={C.bg} />
        <rect x="16" y="6" width="88" height="70" fill={C.cap} />
        <Floor x={22} y={24} w={76} h={46} />
        <rect x="22" y="11" width="76" height="1" fill={C.capEdge} />
        <Bricks x={22} y={12} w={76} h={12} />
        <rect x="22" y="24" width="76" height="4" fill={C.shadow} />
        <rect x="21" y="12" width="1" height="58" fill={C.capEdge} />
        <rect x="98" y="12" width="1" height="58" fill={C.capEdge} />
        <rect x="22" y="70" width="76" height="1" fill={C.capEdge} />
        <rect x="54" y="70" width="12" height="6" fill={C.door} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 120 84" className="persp-svg" aria-hidden="true" shapeRendering="crispEdges">
      <rect width="120" height="84" fill={C.bg} />
      <rect x="12" y="2" width="96" height="76" fill={C.cap} />
      <Floor x={26} y={32} w={68} h={38} />
      {/* visible side faces */}
      <polygon points="18,8 26,14 26,70 18,76" fill={C.side} />
      <polygon points="102,8 94,14 94,70 102,76" fill={C.side} />
      <rect x="18" y="7" width="84" height="1" fill={C.capEdge} />
      <Bricks x={26} y={14} w={68} h={18} />
      <rect x="26" y="32" width="68" height="6" fill={C.shadow} />
      <rect x="26" y="32" width="4" height="38" fill={C.shadow} />
      <rect x="18" y="76" width="84" height="1" fill={C.capEdge} />
      <rect x="54" y="70" width="12" height="7" fill={C.door} />
    </svg>
  );
}
