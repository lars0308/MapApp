// Central data model of MapForge.
// Tiles are referenced on layers by a numeric "gid" (global tile id, 0 = empty).
// Each tileset owns a contiguous gid range starting at `firstGid` (Tiled-style),
// which keeps layer data compact (Uint32Array) and fast to render.

export type TileCategory =
  | 'floor'
  | 'floorVariant'
  | 'path'
  | 'wallTop'
  | 'wallBottom'
  | 'wallLeft'
  | 'wallRight'
  | 'innerCorner'
  | 'outerCorner'
  | 'door'
  | 'water'
  | 'lava'
  | 'abyss'
  | 'deco'
  | 'obstacle'
  | 'bridge'
  | 'pillar'
  | 'stairs'
  | 'transition'
  | 'spawn'
  | 'special';

export interface TileMeta {
  category?: TileCategory;
  tags: string[];
  /** Relative weight inside its category (0–100). */
  weight: number;
}

export interface Tileset {
  id: string;
  name: string;
  source: 'demo' | 'upload';
  /** PNG image as data URL (keeps projects self-contained). */
  dataUrl: string;
  imageWidth: number;
  imageHeight: number;
  tileSize: number;
  columns: number;
  rows: number;
  firstGid: number;
  active: boolean;
  /** Metadata keyed by local tile index. */
  tiles: Record<number, TileMeta>;
  /** Local indices of fully transparent tiles (hidden in the palette). */
  emptyTiles: number[];
}

export type LayerRole =
  | 'floor'
  | 'paths'
  | 'walls'
  | 'objects'
  | 'deco'
  | 'collision'
  | 'gameplay'
  | 'spawn'
  | 'custom';

export interface Layer {
  id: string;
  name: string;
  role: LayerRole;
  color: string;
  visible: boolean;
  locked: boolean;
  data: Uint32Array;
}

export interface MapSettings {
  width: number;
  height: number;
  tileSize: number;
}

export type RoomShape = 'rect' | 'l' | 't' | 'cross' | 'irregular' | 'hall';
export type Distribution = 'even' | 'random' | 'cluster' | 'center' | 'spread';
export type SpecialRoomType =
  | 'start'
  | 'end'
  | 'boss'
  | 'treasure'
  | 'secret'
  | 'merchant'
  | 'quest'
  | 'arena'
  | 'puzzle';

export interface GeneratorSettings {
  seed: string;
  roomCount: number;
  roomMinW: number;
  roomMaxW: number;
  roomMinH: number;
  roomMaxH: number;
  roomSpacing: number;
  shapes: Record<RoomShape, boolean>;
  /** 0 = clean/rectangular, 100 = very irregular */
  irregularity: number;
  corridorWidth: number;
  corridorMinWidth: number;
  corridorMaxWidth: number;
  /** 0 = direct, 100 = many corners */
  twistiness: number;
  /** 0 = detours, 100 = straight to the target */
  directness: number;
  corridor: {
    straight: boolean;
    curves: boolean;
    branches: boolean;
    deadEnds: boolean;
    loops: boolean;
    alternatives: boolean;
  };
  /** 0 = linear, 100 = networked */
  connectivity: number;
  distribution: Distribution;
  specials: Record<SpecialRoomType, boolean>;
  floorVariation: number;
  decoDensity: number;
  obstacleDensity: number;
  hazards: number;
}

export interface Room {
  id: number;
  type: SpecialRoomType | 'normal';
  shape: RoomShape;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  area: number;
  connections: number[];
  isStart: boolean;
  isEnd: boolean;
  isBoss: boolean;
  special: SpecialRoomType | null;
}

export interface Connection {
  id: number;
  from: number;
  to: number;
  kind: 'main' | 'loop' | 'alternative';
  width: number;
  length: number;
}

export type SpawnType = 'player' | 'enemy' | 'loot' | 'npc' | 'quest';

export interface SpawnPoint {
  id: string;
  type: SpawnType;
  x: number;
  y: number;
  roomId: number | null;
  properties: Record<string, string | number | boolean>;
}

export interface Door {
  x: number;
  y: number;
  roomId: number;
}

/** Cell structure kinds of the generated grid (basis for future auto-tiling). */
export const CELL_VOID = 0;
export const CELL_ROOM = 1;
export const CELL_CORRIDOR = 2;
export const CELL_WALL = 3;
export const CELL_HAZARD = 4;

export interface GenerationResult {
  seed: string;
  width: number;
  height: number;
  rooms: Room[];
  connections: Connection[];
  doors: Door[];
  deadEnds: number;
  spawnPoints: SpawnPoint[];
  /** Structural grid (CELL_* values). */
  cells: Uint8Array;
  /** 8-bit neighbour mask of walkable cells for every wall cell (auto-tiling ready). */
  wallMask: Uint8Array;
  warnings: string[];
}

export interface Project {
  formatVersion: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  map: MapSettings;
  generator: GeneratorSettings;
  tilesets: Tileset[];
  nextGid: number;
  layers: Layer[];
  activeLayerId: string;
  result: GenerationResult | null;
}

export type ToolId = 'brush' | 'eraser' | 'fill' | 'rect' | 'pipette' | 'select' | 'hand';

export interface Selection {
  x: number;
  y: number;
  w: number;
  h: number;
}
