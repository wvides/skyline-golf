import { Container } from "pixi.js";
import { PHYSICS_CONFIG } from "../config";

const CFG = PHYSICS_CONFIG.camera;

/**
 * Owns the world container transform: follows the ball, zooms during aim,
 * supports manual panning while the ball is at rest.
 */
export class Camera {
  readonly world = new Container();

  private viewportW = 1;
  private viewportH = 1;
  private worldW = 1;
  private worldH = 1;
  private scale: number;
  private panX = 0;
  private panY = 0;
  private userZoom = 1;

  constructor(worldWidthPx: number, worldHeightPx: number) {
    this.worldW = worldWidthPx;
    this.worldH = worldHeightPx;
    this.scale = this.baseScale();
  }

  setWorldSize(w: number, h: number): void {
    this.worldW = w;
    this.worldH = h;
  }

  setViewport(w: number, h: number): void {
    this.viewportW = w;
    this.viewportH = h;
  }

  private baseScale(): number {
    return (this.viewportH / CFG.referenceHeight) * this.userZoom;
  }

  get currentScale(): number {
    return this.scale;
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.world.x) / this.scale,
      y: (sy - this.world.y) / this.scale,
    };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: wx * this.scale + this.world.x,
      y: wy * this.scale + this.world.y,
    };
  }

  panBy(dxScreen: number, dyScreen: number): void {
    this.panX += dxScreen;
    this.panY += dyScreen;
  }

  resetPan(): void {
    this.panX = 0;
    this.panY = 0;
  }

  cycleZoom(): void {
    const levels: readonly number[] = CFG.zoomLevels;
    const i = levels.indexOf(this.userZoom);
    this.userZoom = levels[(i + 1) % levels.length];
  }

  /** Instantly center on a position (used on level load / respawn). */
  snapTo(focusX: number, focusY: number): void {
    this.scale = this.baseScale();
    const pos = this.desiredPosition(focusX, focusY, this.scale);
    this.world.position.set(pos.x, pos.y);
    this.world.scale.set(this.scale);
  }

  /**
   * @param focusX/focusY world-px point to center on (usually the ball)
   * @param aimPower 0..1 while aiming — zooms out slightly
   */
  update(dtMs: number, focusX: number, focusY: number, aimPower: number): void {
    const targetScale = this.baseScale() * (1 - CFG.dragZoomOutFactor * aimPower);

    // Frame-rate independent lerp factor.
    const t = 1 - Math.pow(1 - CFG.followLerp, dtMs / 16.67);
    this.scale += (targetScale - this.scale) * t;

    const pos = this.desiredPosition(focusX, focusY, this.scale);
    this.world.x += (pos.x - this.world.x) * t;
    this.world.y += (pos.y - this.world.y) * t;
    this.world.scale.set(this.scale);
  }

  private desiredPosition(focusX: number, focusY: number, scale: number): { x: number; y: number } {
    const scaledW = this.worldW * scale;
    const scaledH = this.worldH * scale;
    const clampX = (v: number): number =>
      scaledW <= this.viewportW
        ? (this.viewportW - scaledW) / 2
        : Math.min(0, Math.max(this.viewportW - scaledW, v));
    const clampY = (v: number): number =>
      scaledH <= this.viewportH
        ? (this.viewportH - scaledH) / 2
        : Math.min(0, Math.max(this.viewportH - scaledH, v));

    // Clamp the follow position first, then apply the pan offset and re-clamp.
    // This lets the player look around even when the ball rests at a world edge.
    const followX = clampX(this.viewportW / 2 - focusX * scale);
    const followY = clampY(this.viewportH / 2 - focusY * scale);
    return { x: clampX(followX + this.panX), y: clampY(followY + this.panY) };
  }
}
