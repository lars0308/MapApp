import type { GameProfile } from '../profiles';
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
  | 'wallFront'
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
  | 'special'
  | 'shadow';

/**
 * Camera perspective of the map. Controls which wall/tile roles the generator uses.
 * side_view = 2D side-scroller (gravity, ground, platforms) – its own generator.
 */
export type Perspective = 'top_down' | 'low_top_down' | 'isometric_45' | 'side_view' | 'hex';
export const PERSPECTIVES: Perspective[] = ['top_down', 'low_top_down', 'isometric_45', 'side_view', 'hex'];

/**
 * Auto-tile roles. The generator asks for a role first and falls back to
 * categories, so tilesets without roles keep working.
 */
export const TILE_ROLES = [
  'floor_center',
  'floor_edge_top',
  'floor_edge_bottom',
  'floor_edge_left',
  'floor_edge_right',
  'floor_corner',
  'wall_horizontal',
  'wall_vertical',
  'wall_top',
  'wall_bottom',
  'wall_left',
  'wall_right',
  'corner_top_left',
  'corner_top_right',
  'corner_bottom_left',
  'corner_bottom_right',
  'inner_corner_top_left',
  'inner_corner_top_right',
  'inner_corner_bottom_left',
  'inner_corner_bottom_right',
  'end_cap_top',
  'end_cap_bottom',
  'end_cap_left',
  'end_cap_right',
  'junction_t_up',
  'junction_t_down',
  'junction_t_left',
  'junction_t_right',
  'junction_cross',
  'wall_front',
  'wall_front_upper',
  'door',
  'door_frame_left',
  'door_frame_right',
  'bridge_start',
  'bridge_middle',
  'bridge_end',
  'bridge_left',
  'bridge_right',
  'cliff_top',
  'cliff_front',
  'cliff_left',
  'cliff_right',
  'cliff_inner_corner',
  'cliff_outer_corner',
  'cliff_bottom',
  'cliff_shadow',
  'stairs',
  'water',
  'lava',
  'abyss',
  'abyss_edge',
  'raised_floor',
  'transition',
  'shadow',
  // side view (side-scroller): solid ground, one-way platforms, ladders, hazards, back wall
  'ground_top',
  'ground_top_left',
  'ground_top_right',
  'ground_left',
  'ground_right',
  'ground_bottom',
  'ground_inner_left',
  'ground_inner_right',
  'ground_fill',
  'platform',
  'platform_left',
  'platform_right',
  'ladder',
  'spikes',
  'back_wall',
  // moving platform (lift / elevator) + its rail: the lift travels along the rail tiles
  'lift',
  'lift_track',
  // hex maps: rivers and roads connect to their neighbour hexes (tag m<bits>: E=1 SE=2 SW=4 W=8 NW=16 NE=32)
  'hex_river',
  'hex_road',
] as const;
export type TileRole = (typeof TILE_ROLES)[number];

export interface TileMeta {
  category?: TileCategory;
  /** auto-tile role (optional, more specific than the category) */
  role?: TileRole;
  tags: string[];
  /** Relative weight inside its category / role (0–100). */
  weight: number;
  /** undefined = derived from category / role */
  collision?: boolean;
  /** tall tiles: rows below this tile where its y-sort origin lies */
  sortOffset?: number;
  /** category/role was suggested automatically and not yet confirmed or edited */
  auto?: boolean;
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
  /** Perspectives this tileset is drawn for (empty = all). */
  perspectives: Perspective[];
}

export type LayerRole =
  | 'floor'
  | 'groundDetails'
  | 'paths'
  | 'shadow'
  | 'walls'
  | 'objects'
  | 'wallsFront'
  | 'objectsFront'
  | 'overhead'
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
  /** participates in the y-sorted pass together with objects and characters */
  ySort: boolean;
  data: Uint32Array;
}

export interface MapSettings {
  width: number;
  height: number;
  tileSize: number;
  perspective: Perspective;
  /** generate subtle wall shadows into the shadow layer */
  shadows: boolean;
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
  terrain: TerrainSettings;
  objects: { trees: number; rocks: number; arches: number; pillars: boolean };
  /** side-scroller levels (perspective side_view) */
  side?: SideSettings;
  /** hex world maps (perspective hex) */
  hex?: HexSettings;
}

/** Settings of the hex world generator. */
export interface HexSettings {
  /** continent: one big land mass, islands: many small ones */
  shape: 'continent' | 'islands';
  climate: 'temperate' | 'hot' | 'cold';
  /** 0–100 */
  water: number;
  mountains: number;
  forests: number;
  rivers: number;
  /** settlements (towns, villages, castles) */
  towns: number;
  /** start positions, spread far apart (capital + flag) */
  players: number;
  roads: boolean;
  /** mines, farms, ruins */
  resources: number;
}

/** Settings of the side-scroller generator. Heights / widths are in tiles. */
export interface SideSettings {
  /** outdoor: sky above, cave: ceiling and back wall */
  style: 'outdoor' | 'cave';
  /** how far the player can jump (up / across) – the level never asks for more */
  jumpHeight: number;
  jumpWidth: number;
  /** 0–100: how often the ground goes up and down */
  hills: number;
  /** 0–100: pits to jump over */
  gaps: number;
  /** 0–100: floating one-way platforms, upper routes with rewards */
  platforms: number;
  ladders: boolean;
  /** lifts: platforms that go up and down to high ledges */
  lifts?: boolean;
  /** what lies at the bottom of pits */
  hazards: { water: boolean; lava: boolean; spikes: boolean; abyss: boolean };
  /** 0–100: enemy spawn points on the ground */
  enemies: number;
  /** 0–100: loot on platforms and hidden spots */
  loot: number;
}

export interface TerrainSettings {
  water: { enabled: boolean; amount: number };
  lava: { enabled: boolean; amount: number };
  abyss: {
    enabled: boolean;
    amount: number;
    minSize: number;
    maxSize: number;
    islands: boolean;
    bridges: boolean;
    inRooms: boolean;
    betweenRooms: boolean;
  };
  /** raised plateaus with cliff edges + stairs */
  cliffs: { enabled: boolean; amount: number };
  /** bridges over water / lava / abyss where a path would be cut */
  bridges: boolean;
  /** transition floor where corridors meet rooms of another terrain */
  transitions: { enabled: boolean; amount: number };
}

/** Reusable terrain set: floors/walls tagged with `tag` are used for rooms of this terrain. */
export interface TerrainSet {
  id: string;
  name: string;
  tag: string;
  color: string;
  weight: number;
  active: boolean;
}

export type ObjectType = 'tree' | 'pillar' | 'rock' | 'arch' | 'chest' | 'merchant';

/** Free-standing sprite object (y-sorted by its base row). */
export interface MapObject {
  id: string;
  type: ObjectType;
  /** left tile of the footprint */
  x: number;
  /** base row (the row the object stands on) */
  y: number;
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
  terrain: string;
  doors: { x: number; y: number }[];
}

export interface Connection {
  id: number;
  from: number;
  to: number;
  kind: 'main' | 'loop' | 'alternative';
  width: number;
  length: number;
  /** centre line cells as [x, y] */
  path: [number, number][];
  door: boolean;
  bridge: boolean;
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

/** Terrain detail per cell (GenerationResult.terrain). */
export const T_NONE = 0;
export const T_WATER = 1;
export const T_LAVA = 2;
export const T_ABYSS = 3;
export const T_PLATEAU = 4;
export const T_CLIFF = 5;
export const T_STAIRS = 6;
export const T_BRIDGE = 7;
export const T_TRANSITION = 8;
/** side view: one-way platform, ladder, spikes */
export const T_PLATFORM = 9;
export const T_LADDER = 10;
export const T_SPIKES = 11;
/** side view: path of a lift (moving platform) */
export const T_LIFT = 12;
/** hex maps: terrain of each hex (water = T_WATER) */
export const T_DEEP = 13;
export const T_SAND = 14;
export const T_GRASS = 15;
export const T_FOREST = 16;
export const T_HILLS = 17;
export const T_MOUNTAIN = 18;
export const T_SNOW = 19;
export const T_DESERT = 20;
export const T_SWAMP = 21;
export const TERRAIN_NAMES = ['ground', 'water', 'lava', 'abyss', 'plateau', 'cliff', 'stairs', 'bridge', 'transition', 'platform', 'ladder', 'spikes', 'lift', 'deep_water', 'sand', 'grass', 'forest', 'hills', 'mountain', 'snow', 'desert', 'swamp'];

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
  /** 4-bit mask (N=1,E=2,S=4,W=8) of walkable neighbours for every walkable cell. */
  floorMask: Uint8Array;
  /** T_* terrain code per cell */
  terrain: Uint8Array;
  /** height level per cell (0 = ground, 1 = plateau) */
  heights: Uint8Array;
  perspective: Perspective;
  warnings: string[];
}

/**
 * How the map is built: `generate` = procedural generator (default),
 * `manual` = empty map, the user places rooms, paths, abysses … with the editor tools
 * (the structure grid in `result` is kept up to date by auto-walls).
 */
export type ProjectMode = 'generate' | 'manual';

export interface Project {
  formatVersion: 1;
  mode: ProjectMode;
  /** answers from the setup wizard (view, genre, effort) – see profiles/ */
  profile?: GameProfile;
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
  terrains: TerrainSet[];
  objects: MapObject[];
}

export type ToolId = 'brush' | 'eraser' | 'fill' | 'rect' | 'pipette' | 'select' | 'move' | 'hand';

export interface Selection {
  x: number;
  y: number;
  w: number;
  h: number;
}
