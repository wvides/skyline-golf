import { PHYSICS_CONFIG, TILE_SIZE } from "../config";
import type { LevelData, TilePos } from "./LevelLoader";

/**
 * Tracks which checkpoint flags have been reached.
 * Flags are ordered top-most first, so "highest" means greatest progress.
 */
export class CheckpointManager {
  readonly flags: TilePos[];
  private activated: boolean[];
  private readonly spawn: TilePos;
  highestIndex = -1;

  constructor(level: LevelData) {
    this.flags = level.flags;
    this.activated = level.flags.map(() => false);
    this.spawn = level.spawn;
  }

  /** World-pixel position the ball should respawn at. */
  get respawnPosPx(): { x: number; y: number } {
    const target = this.highestIndex >= 0 ? this.flags[this.highestIndex] : this.spawn;
    return {
      x: (target.col + 0.5) * TILE_SIZE,
      y: (target.row + 0.5) * TILE_SIZE,
    };
  }

  /**
   * Check whether the ball is resting near a flag and activate it.
   * Returns the flag index when a NEW checkpoint was activated this call.
   */
  checkActivation(ballXPx: number, ballYPx: number, ballResting: boolean): number {
    if (!ballResting) return -1;
    const cfg = PHYSICS_CONFIG.checkpoint;
    const ballCol = ballXPx / TILE_SIZE;
    const ballRow = ballYPx / TILE_SIZE;

    for (let i = 0; i < this.flags.length; i++) {
      if (this.activated[i]) continue;
      const flag = this.flags[i];
      // Flag tile sits one tile above the ground the ball rests on.
      const dx = Math.abs(ballCol - (flag.col + 0.5));
      const dy = Math.abs(ballRow - (flag.row + 0.5));
      if (dx <= cfg.activationRadiusXTiles && dy <= cfg.activationRadiusYTiles + 0.5) {
        this.activated[i] = true;
        // Lower index = higher up the map = more progress.
        if (this.highestIndex === -1 || i < this.highestIndex) {
          this.highestIndex = i;
        } else if (i > this.highestIndex) {
          // Reached a flag below current progress — still counts as activated,
          // but doesn't move the respawn point backwards.
        }
        return i;
      }
    }
    return -1;
  }

  isActivated(index: number): boolean {
    return this.activated[index] ?? false;
  }

  reset(): void {
    this.activated.fill(false);
    this.highestIndex = -1;
  }
}
