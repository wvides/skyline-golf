import { PHYSICS_SCALE, TILE, TILE_PHYS, TILE_SIZE, isSolidTile } from "../config";
import type { LevelData } from "../level/LevelLoader";
import { RAPIER, type PhysicsWorld } from "./PhysicsWorld";

export interface SensorColliders {
  water: RAPIER.Collider[];
  rough: RAPIER.Collider[];
}

/**
 * Builds static Rapier colliders from level tile data.
 * Solid tiles are merged into horizontal runs to keep collider counts low.
 * All coordinates are converted from tiles to physics units (1 tile = 0.64).
 */
export class ColliderBuilder {
  static build(level: LevelData, physics: PhysicsWorld): SensorColliders {
    const { world } = physics;
    const sensors: SensorColliders = { water: [], rough: [] };
    const { width, height, tiles } = level;

    const tileAt = (col: number, row: number): number =>
      row < 0 || row >= height || col < 0 || col >= width ? TILE.EMPTY : tiles[row][col];

    // --- Merge solid tiles into horizontal runs ---
    for (let row = 0; row < height; row++) {
      let col = 0;
      while (col < width) {
        const id = tileAt(col, row);
        if (!isSolidTile(id) || id === TILE.SLOPE_UP_RIGHT || id === TILE.SLOPE_UP_LEFT ||
            id === TILE.SLOPE_DOWN_RIGHT || id === TILE.SLOPE_DOWN_LEFT) {
          col++;
          continue;
        }
        // Extend the run while tiles share the same friction profile.
        const isIce = id === TILE.ICE;
        let end = col + 1;
        while (end < width) {
          const next = tileAt(end, row);
          if (next === TILE.SOLID && isIce) break;
          if (next === TILE.ICE && !isIce) break;
          if (next !== TILE.SOLID && next !== TILE.ICE) break;
          end++;
        }
        const runTiles = end - col;
        const hx = (runTiles * TILE_PHYS) / 2;
        const hy = TILE_PHYS / 2;
        const cx = (col + runTiles / 2) * TILE_PHYS;
        const cy = (row + 0.5) * TILE_PHYS;
        const desc = RAPIER.ColliderDesc.cuboid(hx, hy)
          .setTranslation(cx, cy)
          .setFriction(isIce ? 0 : 1)
          .setRestitution(0);
        world.createCollider(desc);
        col = end;
      }
    }

    // --- Slopes: convex hull triangles ---
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const id = tileAt(col, row);
        const x0 = col * TILE_PHYS;
        const y0 = row * TILE_PHYS;
        const x1 = x0 + TILE_PHYS;
        const y1 = y0 + TILE_PHYS;
        let verts: number[] | null = null;

        switch (id) {
          case TILE.SLOPE_UP_RIGHT:
            // Solid below the diagonal from bottom-left to top-right.
            verts = [x0, y1, x1, y0, x1, y1];
            break;
          case TILE.SLOPE_UP_LEFT:
            // Solid below the diagonal from top-left to bottom-right.
            verts = [x0, y0, x0, y1, x1, y1];
            break;
          case TILE.SLOPE_DOWN_RIGHT:
            // Solid above the diagonal from top-left to bottom-right (ceiling).
            verts = [x0, y0, x1, y0, x1, y1];
            break;
          case TILE.SLOPE_DOWN_LEFT:
            // Solid above the diagonal from bottom-left to top-right (ceiling).
            verts = [x0, y0, x1, y0, x0, y1];
            break;
        }
        if (!verts) continue;
        const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(verts));
        if (desc) {
          desc.setFriction(1).setRestitution(0);
          world.createCollider(desc);
        }
      }
    }

    // --- Sensor tiles (water / rough) ---
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const id = tileAt(col, row);
        const isWater = id === TILE.WATER;
        const isRough = id >= TILE.ROUGH && id <= TILE.ROUGH_4;
        if (!isWater && !isRough) continue;
        const desc = RAPIER.ColliderDesc.cuboid(TILE_PHYS / 2, TILE_PHYS / 2)
          .setTranslation((col + 0.5) * TILE_PHYS, (row + 0.5) * TILE_PHYS)
          .setSensor(true)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
        const collider = world.createCollider(desc);
        if (isWater) sensors.water.push(collider);
        else sensors.rough.push(collider);
      }
    }

    // --- World boundary walls ---
    const worldW = width * TILE_PHYS;
    const worldH = height * TILE_PHYS;
    const t = 1; // wall thickness (physics units)
    const walls: Array<[number, number, number, number]> = [
      // [cx, cy, hx, hy]
      [worldW / 2, -t / 2, worldW / 2 + t, t / 2], // top
      [worldW / 2, worldH + t / 2, worldW / 2 + t, t / 2], // bottom
      [-t / 2, worldH / 2, t / 2, worldH / 2 + t], // left
      [worldW + t / 2, worldH / 2, t / 2, worldH / 2 + t], // right
    ];
    for (const [cx, cy, hx, hy] of walls) {
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, hy).setTranslation(cx, cy).setFriction(0).setRestitution(0),
      );
    }

    return sensors;
  }
}

/** Convert a tile position to the physics-space center of that tile. */
export function tileCenterPhys(col: number, row: number): { x: number; y: number } {
  return {
    x: ((col + 0.5) * TILE_SIZE) / PHYSICS_SCALE,
    y: ((row + 0.5) * TILE_SIZE) / PHYSICS_SCALE,
  };
}
