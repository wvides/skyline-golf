import { Container, Graphics } from "pixi.js";
import { COLORS, PHYSICS_CONFIG, PHYSICS_SCALE } from "../config";
import { RAPIER, type PhysicsWorld } from "./PhysicsWorld";

const CFG = PHYSICS_CONFIG.ball;

export class Ball {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly view: Container;

  private readonly radiusPx = CFG.radiusPhys * PHYSICS_SCALE;
  private readonly grabRing: Graphics;
  private grounded = false;
  private ringPulse = 0;

  private constructor(
    body: RAPIER.RigidBody,
    collider: RAPIER.Collider,
    view: Container,
    grabRing: Graphics,
  ) {
    this.body = body;
    this.collider = collider;
    this.view = view;
    this.grabRing = grabRing;
  }

  static create(physics: PhysicsWorld, xPhys: number, yPhys: number): Ball {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(xPhys, yPhys)
      .setLinearDamping(CFG.linearDamping)
      .setAngularDamping(CFG.angularDamping)
      .setCanSleep(false)
      .setCcdEnabled(true);
    const body = physics.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.ball(CFG.radiusPhys)
      .setRestitution(CFG.restitution)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
      .setFriction(CFG.friction)
      .setDensity(1);
    const collider = physics.world.createCollider(colliderDesc, body);

    // --- Visual ---
    const view = new Container();

    const grabRing = new Graphics();
    view.addChild(grabRing);

    const shadow = new Graphics()
      .ellipse(2, 5, 14, 10)
      .fill({ color: 0x000000, alpha: 0.22 });
    view.addChild(shadow);

    // Only the ball texture spins; shadow and ring stay put.
    const spinner = new Container();
    view.addChild(spinner);
    view.label = "ball";
    spinner.label = "spinner";

    const base = new Graphics()
      .circle(0, 0, 15)
      .fill(COLORS.ball)
      .stroke({ color: 0xb9b9b9, width: 1.5 });
    spinner.addChild(base);

    // Dimples
    const dimples = new Graphics();
    const dimpleSpots: Array<[number, number]> = [
      [-5, -4], [4, -6], [7, 2], [-7, 3], [0, 6], [-2, -9], [2, -1], [-6, -7], [8, -3],
    ];
    for (const [dx, dy] of dimpleSpots) {
      dimples.circle(dx, dy, 1.6).fill({ color: COLORS.ballDimple, alpha: 0.85 });
    }
    spinner.addChild(dimples);

    const highlight = new Graphics()
      .circle(-5, -6, 4.5)
      .fill({ color: 0xffffff, alpha: 0.65 });
    spinner.addChild(highlight);

    return new Ball(body, collider, view, grabRing);
  }

  /** Physics position in pixels. */
  get x(): number {
    return this.body.translation().x * PHYSICS_SCALE;
  }

  get y(): number {
    return this.body.translation().y * PHYSICS_SCALE;
  }

  get speed(): number {
    const v = this.body.linvel();
    return Math.hypot(v.x, v.y);
  }

  get isSlow(): boolean {
    return this.speed < CFG.slowSpeedThreshold;
  }

  get isStopped(): boolean {
    return this.speed < CFG.stoppedSpeedThreshold;
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  /** Can the player grab and aim the ball right now? */
  get canShoot(): boolean {
    return this.isSlow && this.grounded;
  }

  get inRough(): boolean {
    return this._inRough;
  }

  private _inRough = false;

  /** Refresh grounded state from current contact normals. */
  updateContacts(physics: PhysicsWorld, roughColliders: RAPIER.Collider[]): void {
    let grounded = false;
    physics.world.contactPairsWith(this.collider, (other) => {
      if (grounded) return;
      physics.world.contactPair(this.collider, other, (manifold, flipped) => {
        const n = manifold.normal();
        // Normal points from collider1 to collider2 unless flipped.
        const groundBelow = (!flipped && n.y > 0.5) || (flipped && n.y < -0.5);
        if (groundBelow) grounded = true;
      });
    });
    this.grounded = grounded;

    let inRough = false;
    for (const rough of roughColliders) {
      if (physics.world.intersectionPair(this.collider, rough)) {
        inRough = true;
        break;
      }
    }
    if (inRough !== this._inRough) {
      this._inRough = inRough;
      if (inRough) {
        this.body.setLinearDamping(PHYSICS_CONFIG.rough.linearDamping);
        this.collider.setRestitution(PHYSICS_CONFIG.rough.restitution);
      } else {
        this.body.setLinearDamping(CFG.linearDamping);
        this.collider.setRestitution(CFG.restitution);
      }
    }
  }

  launch(vxPhys: number, vyPhys: number): void {
    this.body.setLinvel({ x: vxPhys, y: vyPhys }, true);
    this.body.setAngvel(0, true);
  }

  /** Teleport to a physics-space position and stop all motion. */
  placeAt(xPhys: number, yPhys: number): void {
    this.body.setTranslation({ x: xPhys, y: yPhys }, true);
    this.body.setLinvel({ x: 0, y: 0 }, true);
    this.body.setAngvel(0, true);
    this.grounded = false; // re-detected on the next physics step
  }

  freeze(): void {
    this.body.setLinvel({ x: 0, y: 0 }, true);
    this.body.setAngvel(0, true);
    this.body.setGravityScale(0, true);
  }

  unfreeze(): void {
    this.body.setGravityScale(1, true);
  }

  /** Sync the Pixi view with the physics body. */
  syncVisual(dtMs: number): void {
    this.view.position.set(this.x, this.y);
    const spinner = this.view.getChildByLabel("spinner");
    if (spinner) spinner.rotation = this.body.rotation();

    // Pulsing ring that invites the player to grab the ball.
    if (this.canShoot) {
      this.ringPulse += dtMs / 600;
      const pulse = 1 + Math.sin(this.ringPulse * Math.PI * 2) * 0.12;
      const r = (this.radiusPx + 7) * pulse;
      this.grabRing
        .clear()
        .circle(0, 0, r)
        .stroke({ color: 0xffffff, width: 2.5, alpha: 0.55 });
    } else if (this.grounded === false || this.grabRing.width > 0) {
      this.grabRing.clear();
    }
  }
}
