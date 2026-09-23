// Colour channels of the sprite builder. Demo parts are painted with channel + shade codes,
// so one part works with any skin / hair / cloth colour. Changing a channel colour later
// replaces the old shades with the new ones in every layer (drawn pixels included).

export const CHANNELS = ['skin', 'hair', 'primary', 'secondary', 'metal', 'wood', 'stone', 'leaf'] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABEL: Record<Channel, string> = {
  skin: 'Haut',
  hair: 'Haare',
  primary: 'Farbe 1',
  secondary: 'Farbe 2',
  metal: 'Metall',
  wood: 'Holz/Leder',
  stone: 'Stein',
  leaf: 'Pflanze',
};

/** light, base, dark */
export type Ramp = [string, string, string];
export type Ramps = Record<Channel, Ramp>;

export const RAMP_PRESETS: Record<Channel, Ramp[]> = {
  skin: [
    ['#ffd9b8', '#f2b48c', '#c98563'],
    ['#f6c79e', '#dd9f6f', '#aa6e47'],
    ['#d99e6f', '#b87848', '#86512f'],
    ['#a8704a', '#835233', '#5b3620'],
    ['#9fd18a', '#6fae5a', '#467a3a'],
    ['#b7c4f2', '#8492d6', '#5a64a6'],
  ],
  hair: [
    ['#5c4033', '#3d2a22', '#241814'],
    ['#b2703a', '#8a4f25', '#5e3317'],
    ['#f6dc7d', '#dcb04a', '#a57a2a'],
    ['#e36b4a', '#b8442e', '#80291c'],
    ['#e9e6f0', '#bdb7ca', '#8a839b'],
    ['#8c6fe0', '#6547b8', '#43307f'],
    ['#5a5a6e', '#3a3a4a', '#23232e'],
    ['#ff9ec8', '#e46da4', '#a8467a'],
  ],
  primary: [
    ['#6fa0e8', '#4671c4', '#2e4a8a'],
    ['#e86f6f', '#c44646', '#8a2e3a'],
    ['#7fcf7a', '#4f9e4f', '#2f6a3a'],
    ['#b88ae8', '#8a5cc4', '#5c3a8a'],
    ['#f0c060', '#d09030', '#946020'],
    ['#8a8fa0', '#5f6475', '#3c3f4c'],
    ['#f2efe6', '#cfc8b8', '#9a9282'],
  ],
  secondary: [
    ['#8a6a4a', '#6a4c33', '#473222'],
    ['#5a6a8a', '#3f4c6a', '#2a3247'],
    ['#6a8a5a', '#4c6a3f', '#32472a'],
    ['#a05a5a', '#7a3f3f', '#522a2a'],
    ['#d8d0c0', '#b0a690', '#7f7560'],
    ['#4a4a55', '#33333c', '#202027'],
  ],
  metal: [
    ['#e4e8f0', '#a9b0c0', '#6b7285'],
    ['#ffe28a', '#e0b040', '#9a7020'],
    ['#e8a878', '#c07848', '#80482a'],
    ['#9ac8e0', '#5f96b8', '#3a6280'],
  ],
  wood: [
    ['#b98a5e', '#8e6440', '#5f4128'],
    ['#d9b27e', '#b08552', '#7a5a34'],
    ['#7a5a4a', '#5a3f33', '#3a2822'],
    ['#6a6a6a', '#4a4a4a', '#2e2e2e'],
  ],
  stone: [
    ['#b8b4c4', '#8a8698', '#5e5a6c'],
    ['#c8b89a', '#a08e6e', '#6e6048'],
    ['#8aa0a8', '#607880', '#3e5058'],
  ],
  leaf: [
    ['#8fd46a', '#5aa446', '#35702e'],
    ['#c8d86a', '#98a846', '#66702e'],
    ['#e8a04a', '#c0702e', '#80461e'],
    ['#e87aa8', '#c04a80', '#80305a'],
  ],
};

export function defaultRamps(): Ramps {
  return Object.fromEntries(CHANNELS.map((c) => [c, RAMP_PRESETS[c][0]])) as Ramps;
}

// ---------------------------------------------------------------- codes

/** code = channel * 4 + shade + 1 (shade 0 light, 1 base, 2 dark); fixed colours from 64 */
export const code = (ch: Channel, shade: 0 | 1 | 2 = 1) => CHANNELS.indexOf(ch) * 4 + shade + 1;
export const FIX = {
  OUTLINE: 64,
  WHITE: 65,
  EYE: 66,
  RED: 67,
  GLOW: 68,
  SHADOW: 69,
  GOLD_L: 70,
  GOLD: 71,
  GOLD_D: 72,
  FIRE_L: 73,
  FIRE: 74,
  FIRE_D: 75,
  GLOW_D: 76,
} as const;

const FIXED_RGBA: Record<number, [number, number, number, number]> = {
  [FIX.OUTLINE]: [27, 20, 32, 255],
  [FIX.WHITE]: [250, 248, 244, 255],
  [FIX.EYE]: [34, 26, 44, 255],
  [FIX.RED]: [196, 72, 88, 255],
  [FIX.GLOW]: [150, 240, 255, 255],
  [FIX.GLOW_D]: [70, 170, 220, 255],
  [FIX.SHADOW]: [0, 0, 0, 90],
  [FIX.GOLD_L]: [255, 236, 140, 255],
  [FIX.GOLD]: [236, 184, 64, 255],
  [FIX.GOLD_D]: [160, 110, 32, 255],
  [FIX.FIRE_L]: [255, 240, 150, 255],
  [FIX.FIRE]: [255, 160, 50, 255],
  [FIX.FIRE_D]: [220, 70, 40, 255],
};

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function codeToRgba(c: number, ramps: Ramps): [number, number, number, number] {
  if (c >= 64) return FIXED_RGBA[c] ?? [255, 0, 255, 255];
  const ch = CHANNELS[Math.floor((c - 1) / 4)];
  const shade = (c - 1) % 4;
  const [r, g, b] = hexToRgb(ramps[ch][Math.min(2, shade)]);
  return [r, g, b, 255];
}

export function channelOf(c: number): Channel | null {
  return c > 0 && c < 64 ? CHANNELS[Math.floor((c - 1) / 4)] : null;
}

/** colours for the free drawing palette */
export const DRAW_SWATCHES = [
  '#1b1420', '#3a3440', '#6a6478', '#a9a3b8', '#f2efe6', '#ffffff',
  '#5a2a2a', '#c44646', '#e86f6f', '#f0a060', '#f0c060', '#ffe28a',
  '#2f6a3a', '#4f9e4f', '#8fd46a', '#2e4a8a', '#4671c4', '#6fa0e8',
  '#5c3a8a', '#8a5cc4', '#e46da4', '#5f4128', '#8e6440', '#d9b27e',
];
