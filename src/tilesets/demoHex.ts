import type { TileCategory, TileMeta, TileRole, Tileset } from '../types';
import { Rng } from '../generator/rng';
import { HEX_CORNERS, HEX_EDGE_MID } from '../generator/hex';

// Demo tiles for hex maps (perspective hex), drawn at 32 × 32 px, pointy top:
// terrain hexes (tags: hex + terrain name), rivers and roads for every neighbour combination
// (roles hex_river / hex_road, tag m<bits>), settlements, resources and player flags.

const T = 32;
const COLS = 8;

interface HexDef {
  category?: TileCategory;
  role?: TileRole;
  tags: string[];
  weight?: number;
  draw: (g: CanvasRenderingContext2D, rng: Rng) => void;
}

function hexPath(g: CanvasRenderingContext2D, inset = 0) {
  g.beginPath();
  HEX_CORNERS.forEach(([cx, cy], i) => {
    const x = inset + cx * (T - 2 * inset);
    const y = inset + cy * (T - 2 * inset);
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  });
  g.closePath();
}

function speckle(g: CanvasRenderingContext2D, rng: Rng, colors: string[], n: number) {
  for (let k = 0; k < n; k++) {
    g.fillStyle = rng.pick(colors);
    g.fillRect(rng.int(3, T - 4), rng.int(4, T - 5), 1, 1);
  }
}

/** terrain hex: base colour, speckles, a soft inner edge, then details inside the hex */
function terrain(base: string, light: string, dark: string, detail?: (g: CanvasRenderingContext2D, rng: Rng) => void) {
  return (g: CanvasRenderingContext2D, rng: Rng) => {
    g.save();
    hexPath(g);
    g.clip();
    g.fillStyle = base;
    g.fillRect(0, 0, T, T);
    speckle(g, rng, [light, dark], 60);
    // light top-left, dark bottom-right
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.fillRect(0, 0, T, 8);
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(0, T - 8, T, 8);
    detail?.(g, rng);
    g.restore();
    hexPath(g, 0.5);
    g.strokeStyle = 'rgba(0,0,0,0.22)';
    g.lineWidth = 1;
    g.stroke();
  };
}

const tree = (g: CanvasRenderingContext2D, x: number, y: number, s: number, col: string, dark: string) => {
  g.fillStyle = '#5b3d22';
  g.fillRect(x - 1, y, 2, 3);
  g.fillStyle = dark;
  g.beginPath();
  g.moveTo(x, y - s * 2);
  g.lineTo(x + s, y + 1);
  g.lineTo(x - s, y + 1);
  g.closePath();
  g.fill();
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(x, y - s * 2);
  g.lineTo(x + s * 0.5, y - s * 0.3);
  g.lineTo(x - s, y + 1);
  g.lineTo(x - s * 0.2, y - s);
  g.closePath();
  g.fill();
};

const bump = (g: CanvasRenderingContext2D, x: number, y: number, r: number, light: string, dark: string) => {
  g.fillStyle = dark;
  g.beginPath();
  g.ellipse(x, y, r, r * 0.6, 0, Math.PI, 0);
  g.fill();
  g.fillStyle = light;
  g.beginPath();
  g.ellipse(x - r * 0.25, y - 0.5, r * 0.6, r * 0.4, 0, Math.PI, 0);
  g.fill();
};

const peak = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, snow: boolean) => {
  g.fillStyle = '#6d6a64';
  g.beginPath();
  g.moveTo(x, y - h);
  g.lineTo(x + w, y);
  g.lineTo(x - w, y);
  g.closePath();
  g.fill();
  g.fillStyle = '#9b978d';
  g.beginPath();
  g.moveTo(x, y - h);
  g.lineTo(x - w, y);
  g.lineTo(x - w * 0.1, y);
  g.closePath();
  g.fill();
  if (snow) {
    g.fillStyle = '#f4f6fa';
    g.beginPath();
    g.moveTo(x, y - h);
    g.lineTo(x + w * 0.35, y - h * 0.62);
    g.lineTo(x, y - h * 0.7);
    g.lineTo(x - w * 0.35, y - h * 0.6);
    g.closePath();
    g.fill();
  }
};

const waves = (col: string) => (g: CanvasRenderingContext2D, rng: Rng) => {
  g.strokeStyle = col;
  g.lineWidth = 1;
  for (let k = 0; k < 4; k++) {
    const x = rng.int(5, T - 12);
    const y = rng.int(8, T - 8);
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 2, y - 2, x + 4, y);
    g.quadraticCurveTo(x + 6, y + 2, x + 8, y);
    g.stroke();
  }
};

function terrainDefs(): HexDef[] {
  const t = (name: string, category: TileCategory, draw: HexDef['draw'], weight = 100): HexDef => ({ category, tags: ['hex', name], weight, draw });
  return [
    t('deep_water', 'water', terrain('#24558f', '#2c64a6', '#1d4677', waves('#3b78bd'))),
    t('deep_water', 'water', terrain('#24558f', '#2c64a6', '#1d4677', waves('#3b78bd')), 60),
    t('water', 'water', terrain('#3d86c6', '#4c97d6', '#3274ae', waves('#79b6e6'))),
    t('water', 'water', terrain('#3d86c6', '#4c97d6', '#3274ae', waves('#79b6e6')), 60),
    t('sand', 'floor', terrain('#e9d49a', '#f3e2b1', '#d8bf80')),
    t('grass', 'floor', terrain('#6caa4c', '#82bf5c', '#5a943e', (g, rng) => {
      g.fillStyle = '#86c864';
      for (let k = 0; k < 5; k++) {
        const x = rng.int(6, T - 8);
        const y = rng.int(9, T - 9);
        g.fillRect(x, y, 1, 2);
        g.fillRect(x + 2, y - 1, 1, 3);
      }
    })),
    t('grass', 'floor', terrain('#6caa4c', '#82bf5c', '#5a943e'), 70),
    t('grass', 'floor', terrain('#72ad4f', '#8ac463', '#5d9741', (g) => {
      g.fillStyle = '#f2e47a';
      g.fillRect(10, 12, 1, 1);
      g.fillRect(20, 18, 1, 1);
      g.fillStyle = '#e8849a';
      g.fillRect(14, 21, 1, 1);
    }), 50),
    t('forest', 'floor', terrain('#4f8a3c', '#5f9c48', '#3f7430', (g) => {
      for (const [x, y, s] of [
        [10, 14, 4],
        [20, 12, 4],
        [15, 21, 5],
        [24, 22, 4],
        [8, 23, 3],
      ])
        tree(g, x, y, s, '#3f8c3a', '#2a6329');
    })),
    t('forest', 'floor', terrain('#4f8a3c', '#5f9c48', '#3f7430', (g) => {
      for (const [x, y, r] of [
        [11, 13, 4],
        [21, 14, 4.5],
        [15, 22, 5],
        [24, 23, 3.5],
      ]) {
        g.fillStyle = '#5b3d22';
        g.fillRect(x - 1, y + r - 1, 2, 3);
        g.fillStyle = '#2f6a2b';
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#4c9a40';
        g.beginPath();
        g.arc(x - 1, y - 1, r * 0.55, 0, Math.PI * 2);
        g.fill();
      }
    }), 70),
    t('hills', 'floor', terrain('#86a454', '#97b562', '#728d45', (g) => {
      bump(g, 11, 17, 7, '#a2bf6c', '#6f8a42');
      bump(g, 21, 21, 8, '#a2bf6c', '#6f8a42');
    })),
    t('hills', 'floor', terrain('#86a454', '#97b562', '#728d45', (g) => {
      bump(g, 16, 16, 9, '#a2bf6c', '#6f8a42');
      bump(g, 9, 23, 5, '#a2bf6c', '#6f8a42');
    }), 70),
    t('mountain', 'floor', terrain('#8a8577', '#99948a', '#77736a', (g) => {
      peak(g, 13, 22, 9, 15, true);
      peak(g, 22, 25, 7, 11, false);
    })),
    t('mountain', 'floor', terrain('#8a8577', '#99948a', '#77736a', (g) => {
      peak(g, 17, 24, 11, 18, true);
    }), 70),
    t('snow', 'floor', terrain('#e8eef5', '#f7fbff', '#cfd9e6', (g) => {
      g.fillStyle = '#c3cfdd';
      g.fillRect(8, 20, 6, 1);
      g.fillRect(18, 12, 5, 1);
    })),
    t('desert', 'floor', terrain('#dcb86a', '#e8c67c', '#c9a557', (g) => {
      g.strokeStyle = '#c29a4b';
      for (const y of [12, 18, 24]) {
        g.beginPath();
        g.moveTo(5, y);
        g.quadraticCurveTo(12, y - 3, 19, y);
        g.quadraticCurveTo(24, y + 2, 28, y - 1);
        g.stroke();
      }
    })),
    t('desert', 'floor', terrain('#dcb86a', '#e8c67c', '#c9a557', (g) => {
      // cactus
      g.fillStyle = '#4f8a3c';
      g.fillRect(15, 12, 3, 11);
      g.fillRect(12, 15, 3, 2);
      g.fillRect(12, 13, 2, 3);
      g.fillRect(18, 17, 3, 2);
      g.fillRect(19, 15, 2, 3);
    }), 50),
    t('swamp', 'floor', terrain('#5d7a4e', '#6c8a5a', '#4d6741', (g) => {
      g.fillStyle = '#4a7a8a';
      g.beginPath();
      g.ellipse(12, 18, 5, 2.5, 0, 0, Math.PI * 2);
      g.ellipse(22, 13, 4, 2, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3d5a2e';
      for (const [x, y] of [
        [18, 21],
        [9, 12],
        [24, 22],
      ]) {
        g.fillRect(x, y - 4, 1, 4);
        g.fillRect(x + 2, y - 3, 1, 3);
      }
    })),
  ];
}

/** line from the hex centre to every edge in the mask */
function connector(mask: number, width: number, color: string, core: string, dashed: boolean) {
  return (g: CanvasRenderingContext2D) => {
    const c = T / 2;
    g.lineCap = 'round';
    for (const [w, col] of [
      [width, color],
      [Math.max(1, width - 2), core],
    ] as [number, string][]) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.setLineDash(dashed && col === core ? [2, 3] : []);
      g.beginPath();
      let any = false;
      for (let d = 0; d < 6; d++) {
        if (!(mask & (1 << d))) continue;
        const [ex, ey] = HEX_EDGE_MID[d];
        g.moveTo(c, c);
        g.lineTo(ex * T, ey * T);
        any = true;
      }
      if (!any) {
        g.moveTo(c - 1, c);
        g.lineTo(c + 1, c);
      }
      g.stroke();
    }
    g.setLineDash([]);
    // round joint in the middle
    g.fillStyle = color;
    g.beginPath();
    g.arc(c, c, width / 2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = core;
    g.beginPath();
    g.arc(c, c, Math.max(0.5, width / 2 - 1), 0, Math.PI * 2);
    g.fill();
  };
}

function connectorDefs(): HexDef[] {
  const out: HexDef[] = [];
  for (let m = 0; m < 64; m++) out.push({ role: 'hex_river', category: 'water', tags: ['hex', 'river', `m${m}`], draw: connector(m, 5, '#2f6fb3', '#62a8e8', false) });
  for (let m = 0; m < 64; m++) out.push({ role: 'hex_road', category: 'path', tags: ['hex', 'road', `m${m}`], draw: connector(m, 4, '#7a5a34', '#c8a26a', true) });
  return out;
}

const house = (g: CanvasRenderingContext2D, x: number, y: number, w: number, roof: string) => {
  g.fillStyle = '#e9dcc1';
  g.fillRect(x, y, w, w - 1);
  g.fillStyle = '#6b4b2c';
  g.fillRect(x + Math.floor(w / 2) - 1, y + w - 4, 2, 3);
  g.fillStyle = roof;
  g.beginPath();
  g.moveTo(x - 1, y + 1);
  g.lineTo(x + w / 2, y - w / 2);
  g.lineTo(x + w + 1, y + 1);
  g.closePath();
  g.fill();
};

const PLAYER_COLORS = ['#e04848', '#3f7fe0', '#f2c230', '#9a5ad6', '#3fb35c', '#f08a2a'];

function objectDefs(): HexDef[] {
  const o = (tags: string[], draw: HexDef['draw']): HexDef => ({ category: 'special', tags: ['hex', ...tags], draw });
  const defs: HexDef[] = [
    o(['town', 'settlement'], (g) => {
      house(g, 7, 15, 7, '#c0453c');
      house(g, 17, 12, 8, '#b8573a');
      house(g, 14, 21, 6, '#c0453c');
      g.fillStyle = '#9b7a4b';
      g.fillRect(8, 26, 16, 1);
    }),
    o(['village', 'settlement'], (g) => {
      house(g, 9, 16, 6, '#b8733a');
      house(g, 17, 19, 6, '#a86a33');
    }),
    o(['castle', 'settlement'], (g) => {
      g.fillStyle = '#8e8a84';
      g.fillRect(8, 13, 16, 13);
      g.fillStyle = '#a7a39c';
      g.fillRect(6, 9, 5, 17);
      g.fillRect(21, 9, 5, 17);
      for (const x of [6, 9, 21, 24]) g.fillRect(x, 7, 2, 2);
      for (const x of [12, 15, 18]) g.fillRect(x, 11, 2, 2);
      g.fillStyle = '#4a3a2a';
      g.fillRect(14, 20, 4, 6);
      g.fillStyle = '#e04848';
      g.fillRect(8, 3, 1, 5);
      g.fillRect(9, 3, 4, 2);
    }),
    o(['farm', 'resource'], (g) => {
      g.fillStyle = '#d8b04a';
      for (const y of [16, 19, 22]) g.fillRect(6, y, 14, 2);
      g.fillStyle = '#b8903a';
      for (const y of [17, 20, 23]) g.fillRect(6, y, 14, 1);
      house(g, 20, 13, 6, '#9a3c2c');
    }),
    o(['mine', 'resource'], (g) => {
      g.fillStyle = '#5b554d';
      g.beginPath();
      g.moveTo(8, 25);
      g.lineTo(16, 11);
      g.lineTo(25, 25);
      g.closePath();
      g.fill();
      g.fillStyle = '#1f1b18';
      g.beginPath();
      g.ellipse(16, 23, 4, 4, 0, Math.PI, 0);
      g.fill();
      g.fillRect(12, 23, 8, 2);
      g.fillStyle = '#f2c230';
      g.fillRect(20, 19, 2, 2);
      g.fillRect(11, 20, 1, 1);
    }),
    o(['ruins', 'resource'], (g) => {
      g.fillStyle = '#b4ad9f';
      g.fillRect(9, 13, 3, 12);
      g.fillRect(15, 17, 3, 8);
      g.fillRect(21, 11, 3, 14);
      g.fillStyle = '#8e877a';
      g.fillRect(7, 25, 19, 2);
      g.fillRect(20, 10, 5, 2);
    }),
  ];
  PLAYER_COLORS.forEach((col, i) =>
    defs.push(
      o(['player', `p${i + 1}`, 'flag'], (g) => {
        g.fillStyle = '#3a2f24';
        g.fillRect(12, 7, 2, 19);
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(14, 8);
        g.lineTo(24, 11);
        g.lineTo(14, 15);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(14, 9, 4, 1);
        g.fillStyle = '#3a2f24';
        g.fillRect(9, 26, 8, 2);
      }),
    ),
  );
  return defs;
}

export const DEMO_HEX_ID = 'demo_hex';
export const HEX_PLAYER_COLORS = PLAYER_COLORS;

export function createDemoHexTileset(firstGid: number): Tileset {
  const defs = [...terrainDefs(), ...connectorDefs(), ...objectDefs()];
  const rows = Math.ceil(defs.length / COLS);
  const canvas = document.createElement('canvas');
  canvas.width = COLS * T;
  canvas.height = rows * T;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const tiles: Record<number, TileMeta> = {};
  defs.forEach((d, i) => {
    g.save();
    g.translate((i % COLS) * T, Math.floor(i / COLS) * T);
    d.draw(g, new Rng(9100 + i * 37));
    g.restore();
    tiles[i] = { category: d.category, role: d.role, tags: d.tags, weight: d.weight ?? 100, collision: false };
  });
  const empty: number[] = [];
  for (let i = defs.length; i < rows * COLS; i++) empty.push(i);
  return {
    id: DEMO_HEX_ID,
    name: 'Demo Hex',
    source: 'demo',
    dataUrl: canvas.toDataURL('image/png'),
    imageWidth: canvas.width,
    imageHeight: canvas.height,
    tileSize: T,
    columns: COLS,
    rows,
    firstGid,
    active: true,
    tiles,
    emptyTiles: empty,
    perspectives: ['hex'],
  };
}
