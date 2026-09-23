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
    // Classic 2D 3/4 view: the back (top) wall shows its full height, the side walls are raised
    // (cap + visible inner face), the front (bottom) wall is only a narrow top edge – the room is
    // open towards the viewer.
    return (
      <svg viewBox="0 0 120 84" className="persp-svg" aria-hidden="true" shapeRendering="crispEdges">
        <rect width="120" height="84" fill={C.bg} />
        <Floor x={22} y={24} w={76} h={54} />
        {/* back wall: cap (upper edge) + full-height front face */}
        <rect x="12" y="3" width="96" height="8" fill={C.cap} />
        <rect x="12" y="10" width="96" height="1" fill={C.capEdge} />
        <Bricks x={22} y={11} w={76} h={13} />
        <rect x="22" y="23" width="76" height="1" fill={C.faceLine} />
        {/* left wall: raised cap + lit inner face (visible wall height) */}
        <rect x="12" y="3" width="7" height="77" fill={C.cap} />
        <rect x="18" y="11" width="1" height="69" fill={C.capEdge} />
        <rect x="19" y="11" width="6" height="67" fill={C.faceHi} />
        <rect x="24" y="11" width="1" height="67" fill={C.faceLine} />
        {Array.from({ length: 17 }, (_, k) => (
          <rect key={k} x={19} y={12 + k * 4} width={5} height={0.8} fill={C.face} />
        ))}
        {/* right wall: raised cap + shaded inner face */}
        <rect x="101" y="3" width="7" height="77" fill={C.cap} />
        <rect x="101" y="11" width="1" height="69" fill={C.capEdge} />
        <rect x="97" y="11" width="4" height="67" fill={C.side} />
        <rect x="97" y="11" width="1" height="67" fill={C.faceLine} />
        {/* corner transitions (back wall meets the side faces) */}
        <polygon points="19,11 25,11 25,24 19,18" fill={C.face} />
        <polygon points="97,11 101,11 101,18 97,24" fill={C.faceLine} />
        {/* soft shadows: under the back wall and along both side walls */}
        <rect x="25" y="24" width="72" height="3" fill={C.shadow} />
        <rect x="25" y="27" width="72" height="2" fill="rgba(6,5,10,0.22)" />
        <rect x="25" y="27" width="3" height="51" fill="rgba(6,5,10,0.3)" />
        <rect x="93" y="24" width="4" height="54" fill="rgba(6,5,10,0.4)" />
        {/* front wall: only its narrow top edge, open towards the viewer (gap = doorway) */}
        <rect x="12" y="78" width="40" height="3" fill={C.cap} />
        <rect x="68" y="78" width="40" height="3" fill={C.cap} />
        <rect x="12" y="78" width="40" height="1" fill={C.capEdge} />
        <rect x="68" y="78" width="40" height="1" fill={C.capEdge} />
        {/* pillar for depth: cap, front, contact shadow */}
        <rect x="68" y="50" width="12" height="3" fill={C.shadow} />
        <rect x="68" y="34" width="10" height="4" fill={C.cap} />
        <rect x="68" y="34" width="10" height="1" fill={C.capEdge} />
        <rect x="68" y="38" width="10" height="12" fill={C.face} />
        <rect x="68" y="38" width="10" height="1" fill={C.faceHi} />
        <rect x="68" y="44" width="10" height="0.8" fill={C.faceLine} />
        <rect x="77" y="38" width="1" height="12" fill={C.faceLine} />
      </svg>
    );
  }
  // 45°: rotated room seen diagonally – both back walls show tall faces, front walls only their caps
  const iso = (x: number, y: number) => `${x},${y}`;
  const floorLines = [];
  for (let k = 1; k < 6; k++) {
    const t = k / 6;
    floorLines.push(<line key={`a${k}`} x1={16 + 44 * t} y1={50 - 22 * t} x2={60 + 44 * t} y2={72 - 22 * t} stroke={C.grout} strokeWidth={0.7} />);
    floorLines.push(<line key={`b${k}`} x1={16 + 44 * t} y1={50 + 22 * t} x2={60 + 44 * t} y2={28 + 22 * t} stroke={C.grout} strokeWidth={0.7} />);
  }
  const courses = [];
  for (let k = 1; k < 5; k++) {
    const d = k * 4.4;
    courses.push(<line key={`l${k}`} x1={16} y1={50 - d} x2={60} y2={28 - d} stroke={C.faceLine} strokeWidth={0.7} />);
    courses.push(<line key={`r${k}`} x1={60} y1={28 - d} x2={104} y2={50 - d} stroke={C.faceLine} strokeWidth={0.7} />);
  }
  return (
    <svg viewBox="0 0 120 84" className="persp-svg" aria-hidden="true">
      <rect width="120" height="84" fill={C.bg} />
      {/* floor diamond */}
      <polygon points={[iso(16, 50), iso(60, 28), iso(104, 50), iso(60, 72)].join(' ')} fill={C.floorA} />
      {floorLines}
      {/* back walls: left lit, right shaded */}
      <polygon points={[iso(16, 50), iso(60, 28), iso(60, 6), iso(16, 28)].join(' ')} fill={C.face} />
      <polygon points={[iso(60, 28), iso(104, 50), iso(104, 28), iso(60, 6)].join(' ')} fill={C.side} />
      {courses}
      <line x1={60} y1={6} x2={60} y2={28} stroke={C.faceLine} strokeWidth={0.8} />
      {/* caps (upper edges) */}
      <polygon points={[iso(12, 26), iso(60, 2), iso(108, 26), iso(104, 28), iso(60, 6), iso(16, 28)].join(' ')} fill={C.cap} />
      <polyline points={[iso(16, 28), iso(60, 6), iso(104, 28)].join(' ')} fill="none" stroke={C.capEdge} strokeWidth={0.8} />
      {/* floor shadow along both back walls */}
      <polygon points={[iso(16, 50), iso(60, 28), iso(104, 50), iso(98, 53), iso(60, 34), iso(22, 53)].join(' ')} fill={C.shadow} />
      {/* front walls: low caps + outer faces */}
      <polygon points={[iso(12, 50), iso(16, 50), iso(60, 72), iso(104, 50), iso(108, 50), iso(60, 74)].join(' ')} fill={C.cap} />
      <polygon points={[iso(12, 50), iso(60, 74), iso(60, 80), iso(12, 56)].join(' ')} fill={C.face} />
      <polygon points={[iso(60, 74), iso(108, 50), iso(108, 56), iso(60, 80)].join(' ')} fill={C.side} />
      <polyline points={[iso(16, 50), iso(60, 72), iso(104, 50)].join(' ')} fill="none" stroke={C.capEdge} strokeWidth={0.8} />
      {/* door in the front-right wall */}
      <polygon points={[iso(74, 67), iso(84, 62), iso(84, 69), iso(74, 74)].join(' ')} fill={C.door} />
      {/* pillar: iso box with shadow */}
      <polygon points={[iso(66, 48), iso(74, 44), iso(80, 47), iso(72, 51)].join(' ')} fill={C.shadow} />
      <polygon points={[iso(58, 44), iso(64, 47), iso(64, 33), iso(58, 30)].join(' ')} fill={C.face} />
      <polygon points={[iso(64, 47), iso(70, 44), iso(70, 30), iso(64, 33)].join(' ')} fill={C.side} />
      <polygon points={[iso(58, 30), iso(64, 27), iso(70, 30), iso(64, 33)].join(' ')} fill={C.capEdge} />
    </svg>
  );
}
