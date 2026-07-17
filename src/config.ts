/** Central tunable configuration for Skyline Golf. */

export const TILE_SIZE = 32; // px per tile
export const PHYSICS_SCALE = 50; // px per physics unit
export const TILE_PHYS = TILE_SIZE / PHYSICS_SCALE; // 0.64 physics units per tile

export const PHYSICS_CONFIG = {
  gravity: { x: 0, y: 33 }, // physics units / s^2 (y is down)
  timestep: 1 / 180, // internal physics step
  maxSubSteps: 8,

  ball: {
    radiusPhys: 0.3, // ~15 px
    linearDamping: 0.4,
    angularDamping: 15,
    restitution: 0.68,
    friction: 0.1,
    slowSpeedThreshold: 0.5, // phys units/s — below this (and grounded) the ball can be aimed
    stoppedSpeedThreshold: 0.18, // fully settled
  },

  rough: {
    linearDamping: 4.0,
    restitution: 0.25,
    maxDragFactor: 0.5,
    powerMultiplier: 0.6,
  },

  aim: {
    maxDragScreenPx: 150,
    minDragScreenPx: 15,
    powerExponent: 1.2,
    powerBase: 150, // multiplied by 15 / PHYSICS_SCALE at launch
    launchScale: 15,
    groundedUpNudge: 0.01, // tiny phys-unit nudge when aiming up off the ground
    wrongWayAngleDeg: 45, // block launches pointing more than this below horizontal
  },

  camera: {
    referenceHeight: 672, // zoom = viewport height / this
    followLerp: 0.2,
    dragZoomOutFactor: 0.12, // zoom out up to 12% at full power
    zoomLevels: [1, 0.5, 0.35],
  },

  water: {
    resetDelayMs: 500,
  },

  checkpoint: {
    activationRadiusXTiles: 6,
    activationRadiusYTiles: 2,
  },
} as const;

/** Tile ids used by level data. */
export const TILE = {
  EMPTY: 0,
  SOLID: 1,
  ICE: 103,
  FINISH: 154,
  FINISH_LEFT: 111,
  FINISH_MID: 112,
  FINISH_RIGHT: 113,
  FLAG: 153,
  WATER: 176,
  SPAWN: 209,
  SLOPE_UP_RIGHT: 169, // solid triangle, surface rises to the right
  SLOPE_UP_LEFT: 202, // solid triangle, surface rises to the left
  SLOPE_DOWN_RIGHT: 273, // ceiling triangle
  SLOPE_DOWN_LEFT: 274, // ceiling triangle
  ROUGH: 496,
  ROUGH_2: 497,
  ROUGH_3: 498,
  ROUGH_4: 499,
} as const;

export const FINISH_TILES: ReadonlySet<number> = new Set([
  TILE.FINISH,
  TILE.FINISH_LEFT,
  TILE.FINISH_MID,
  TILE.FINISH_RIGHT,
]);

export const ROUGH_TILES: ReadonlySet<number> = new Set([
  TILE.ROUGH,
  TILE.ROUGH_2,
  TILE.ROUGH_3,
  TILE.ROUGH_4,
]);

export const SLOPE_TILES: ReadonlySet<number> = new Set([
  TILE.SLOPE_UP_RIGHT,
  TILE.SLOPE_UP_LEFT,
  TILE.SLOPE_DOWN_RIGHT,
  TILE.SLOPE_DOWN_LEFT,
]);

/** Tiles the ball physically collides with as solid matter. */
export function isSolidTile(id: number): boolean {
  return id === TILE.SOLID || id === TILE.ICE || SLOPE_TILES.has(id);
}

export const COLORS = {
  skyTop: 0x3d8bd4,
  skyBottom: 0xaee3f5,
  grassTop: 0x4caf50,
  grassLight: 0x66bb6a,
  dirt: 0x8d5a3b,
  dirtDark: 0x74452a,
  ice: 0xbfeaf7,
  iceDark: 0x8fd4ea,
  water: 0x2d9cdb,
  waterDeep: 0x1b6fae,
  rough: 0x2e7d32,
  roughDark: 0x1b5e20,
  flagPole: 0x8d6e63,
  flagInactive: 0x9e9e9e,
  flagActive: 0x22c55e,
  finishPole: 0x854d0e,
  ball: 0xffffff,
  ballDimple: 0xd8d8d8,
  cloud: 0xffffff,
};
