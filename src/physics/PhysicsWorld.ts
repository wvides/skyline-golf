import RAPIER from "@dimforge/rapier2d-compat";
import { PHYSICS_CONFIG } from "../config";

/**
 * Thin wrapper around the Rapier world with a fixed-timestep accumulator.
 * Coordinates: y points down (matches screen space), 1 unit = PHYSICS_SCALE px.
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;
  private eventQueue: RAPIER.EventQueue;
  private accumulator = 0;

  private constructor(world: RAPIER.World) {
    this.world = world;
    this.eventQueue = new RAPIER.EventQueue(true);
  }

  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init();
    const world = new RAPIER.World({
      x: PHYSICS_CONFIG.gravity.x,
      y: PHYSICS_CONFIG.gravity.y,
    });
    world.timestep = PHYSICS_CONFIG.timestep;
    return new PhysicsWorld(world);
  }

  /** Advance physics by a frame delta (ms), using fixed internal steps. */
  step(deltaMs: number): void {
    this.accumulator += deltaMs / 1000;
    const dt = PHYSICS_CONFIG.timestep;
    let steps = 0;
    while (this.accumulator >= dt && steps < PHYSICS_CONFIG.maxSubSteps) {
      this.world.step(this.eventQueue);
      this.accumulator -= dt;
      steps++;
    }
    // Avoid spiral of death after long tab suspensions.
    if (steps >= PHYSICS_CONFIG.maxSubSteps) this.accumulator = 0;
  }

  /** Drain collision start/stop events. Call once per frame after stepping. */
  drainCollisionEvents(
    cb: (c1: RAPIER.Collider, c2: RAPIER.Collider, started: boolean) => void,
  ): void {
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      const c1 = this.world.getCollider(h1);
      const c2 = this.world.getCollider(h2);
      if (c1 && c2) cb(c1, c2, started);
    });
  }
}

export { RAPIER };
