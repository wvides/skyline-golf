import { PHYSICS_CONFIG, PHYSICS_SCALE } from "../config";
import type { Ball } from "../physics/Ball";
import type { Camera } from "./Camera";

const CFG = PHYSICS_CONFIG.aim;

export interface AimState {
  active: boolean;
  /** Unit launch direction (world coords, y-down). */
  dirX: number;
  dirY: number;
  /** Normalized 0..1 after rough caps — drives color and camera zoom. */
  powerNorm: number;
  /** Launch velocity in physics units/s. */
  vxPhys: number;
  vyPhys: number;
  /** Drag below the minimum threshold. */
  belowMin: boolean;
  /** Launch would point steeply downward. */
  wrongWay: boolean;
}

const IDLE_AIM: AimState = {
  active: false,
  dirX: 0,
  dirY: 0,
  powerNorm: 0,
  vxPhys: 0,
  vyPhys: 0,
  belowMin: false,
  wrongWay: false,
};

export class InputManager {
  inputEnabled = false;
  onShoot: ((vxPhys: number, vyPhys: number) => void) | null = null;
  onAimChange: ((aim: AimState) => void) | null = null;

  private ball: Ball | null = null;
  private camera: Camera | null = null;
  private aiming = false;
  private panning = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private currentAim: AimState = IDLE_AIM;
  private readonly grabRadiusPx = 52;

  bind(ball: Ball, camera: Camera): void {
    this.ball = ball;
    this.camera = camera;
  }

  attach(canvas: HTMLCanvasElement): void {
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.inputEnabled || !this.ball || !this.camera) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;

    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    const ballScreen = this.camera.worldToScreen(this.ball.x, this.ball.y);
    const dist = Math.hypot(e.clientX - ballScreen.x, e.clientY - ballScreen.y);

    if (this.ball.canShoot && dist <= this.grabRadiusPx) {
      this.aiming = true;
      this.updateAim(e.clientX, e.clientY);
    } else if (this.ball.isSlow) {
      // Dragging empty space while the ball rests pans the camera.
      this.panning = true;
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.aiming) {
      this.updateAim(e.clientX, e.clientY);
    } else if (this.panning && this.camera) {
      this.camera.panBy(e.clientX - this.lastPointerX, e.clientY - this.lastPointerY);
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    }
  };

  private onPointerUp = (): void => {
    if (this.aiming) {
      const aim = this.currentAim;
      this.aiming = false;
      this.setAim(IDLE_AIM);
      if (!aim.belowMin && !aim.wrongWay && this.onShoot) {
        this.onShoot(aim.vxPhys, aim.vyPhys);
      }
    }
    this.panning = false;
  };

  cancelAim(): void {
    this.aiming = false;
    this.panning = false;
    this.setAim(IDLE_AIM);
  }

  private updateAim(pointerX: number, pointerY: number): void {
    if (!this.ball || !this.camera) return;
    const ballScreen = this.camera.worldToScreen(this.ball.x, this.ball.y);

    // Pull-back: the launch direction opposes the drag direction.
    const dragX = pointerX - ballScreen.x;
    const dragY = pointerY - ballScreen.y;
    const dragDist = Math.hypot(dragX, dragY);

    const inRough = this.ball.inRough;
    const maxDrag = CFG.maxDragScreenPx * (inRough ? PHYSICS_CONFIG.rough.maxDragFactor : 1);
    const belowMin = dragDist < CFG.minDragScreenPx;

    let dirX = 0;
    let dirY = 0;
    if (dragDist > 0.001) {
      dirX = -dragX / dragDist;
      dirY = -dragY / dragDist;
    }

    const powerNorm = Math.min(1, dragDist / maxDrag);
    const roughMult = inRough ? PHYSICS_CONFIG.rough.powerMultiplier : 1;
    const power = Math.pow(powerNorm, CFG.powerExponent) * CFG.powerBase * roughMult;

    let vxPhys = (dirX * power * CFG.launchScale) / PHYSICS_SCALE;
    let vyPhys = (dirY * power * CFG.launchScale) / PHYSICS_SCALE;

    // Tiny upward nudge when launching off the ground.
    if (dirY < 0 && this.ball.isGrounded) vyPhys -= CFG.groundedUpNudge;

    // Block steep downward launches (screen y is down, so dirY > sin(45°)).
    const wrongWay = dirY > Math.sin((CFG.wrongWayAngleDeg * Math.PI) / 180);

    this.setAim({
      active: true,
      dirX,
      dirY,
      powerNorm,
      vxPhys,
      vyPhys,
      belowMin,
      wrongWay,
    });
  }

  private setAim(aim: AimState): void {
    this.currentAim = aim;
    this.onAimChange?.(aim);
  }
}
