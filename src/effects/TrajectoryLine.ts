import { Graphics } from "pixi.js";
import { PHYSICS_CONFIG, PHYSICS_SCALE } from "../config";

/**
 * Dotted ballistic preview drawn in world space.
 * Simulates gravity only (no collision prediction) for a short window.
 */
export class TrajectoryLine {
  readonly view = new Graphics();
  private readonly simDt = 1 / 60;
  private readonly steps = 42; // ~0.7 s of flight

  /**
   * @param xPx/yPx launch point (world px)
   * @param vxPhys/vyPhys launch velocity (physics units/s)
   * @param power 0..1 — drives the color
   */
  show(xPx: number, yPx: number, vxPhys: number, vyPhys: number, power: number): void {
    const g = this.view;
    g.clear();

    const color = powerColor(power);
    let x = xPx / PHYSICS_SCALE;
    let y = yPx / PHYSICS_SCALE;
    let vx = vxPhys;
    let vy = vyPhys;
    const grav = PHYSICS_CONFIG.gravity.y;

    for (let i = 0; i < this.steps; i++) {
      x += vx * this.simDt;
      y += vy * this.simDt;
      vy += grav * this.simDt;

      if (i % 2 === 0) {
        const fade = 1 - i / this.steps;
        g.circle(x * PHYSICS_SCALE, y * PHYSICS_SCALE, 3.2 - i * 0.04).fill({
          color,
          alpha: 0.25 + fade * 0.65,
        });
      }
    }

    // Direction arrowhead at the first dot cluster.
    const angle = Math.atan2(vyPhys, vxPhys);
    const ax = xPx + Math.cos(angle) * 34;
    const ay = yPx + Math.sin(angle) * 34;
    const left = angle + Math.PI * 0.82;
    const right = angle - Math.PI * 0.82;
    g.poly([
      ax + Math.cos(angle) * 12, ay + Math.sin(angle) * 12,
      ax + Math.cos(left) * 9, ay + Math.sin(left) * 9,
      ax + Math.cos(right) * 9, ay + Math.sin(right) * 9,
    ]).fill({ color, alpha: 0.9 });
  }

  hide(): void {
    this.view.clear();
  }
}

/** Green → yellow → orange → red. */
export function powerColor(power: number): number {
  const p = Math.min(1, Math.max(0, power));
  const stops = [0x22c55e, 0xeab308, 0xf97316, 0xef4444];
  const seg = Math.min(stops.length - 2, Math.floor(p * (stops.length - 1)));
  const t = p * (stops.length - 1) - seg;
  return lerpColor(stops[seg], stops[seg + 1], t);
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
