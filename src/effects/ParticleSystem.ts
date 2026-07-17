import { Graphics } from "pixi.js";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  gravity: number;
  drag: number;
}

const MAX_PARTICLES = 320;

/**
 * Lightweight pooled particle system — all particles are redrawn into a
 * single Graphics object each frame to keep draw calls at one.
 */
export class ParticleSystem {
  readonly view = new Graphics();
  private particles: Particle[] = [];

  burst(
    x: number,
    y: number,
    opts: {
      count?: number;
      color?: number | number[];
      speed?: number;
      spread?: number; // radians around base angle
      angle?: number; // base emission angle (y-down coords)
      size?: number;
      lifeMs?: number;
      gravity?: number;
      drag?: number;
    } = {},
  ): void {
    const {
      count = 10,
      color = 0xffffff,
      speed = 120,
      spread = Math.PI * 2,
      angle = 0,
      size = 3,
      lifeMs = 600,
      gravity = 500,
      drag = 0.98,
    } = opts;

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * (0.4 + Math.random() * 0.9);
      const c = Array.isArray(color) ? color[Math.floor(Math.random() * color.length)] : color;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: lifeMs * (0.6 + Math.random() * 0.7),
        maxLife: lifeMs,
        size: size * (0.6 + Math.random() * 0.8),
        color: c,
        gravity,
        drag,
      });
    }
  }

  /** Convenience presets */
  dust(x: number, y: number, strength = 1): void {
    this.burst(x, y, {
      count: Math.round(6 * strength),
      color: [0xd7c4a0, 0xcbb489, 0xe6d8bd],
      speed: 70 * strength,
      size: 3,
      lifeMs: 450,
      gravity: 260,
    });
  }

  splash(x: number, y: number): void {
    this.burst(x, y, {
      count: 22,
      color: [0x2d9cdb, 0x9fd8f5, 0xffffff],
      speed: 190,
      angle: -Math.PI / 2,
      spread: Math.PI * 0.9,
      size: 3.5,
      lifeMs: 650,
      gravity: 700,
    });
  }

  confetti(x: number, y: number): void {
    this.burst(x, y, {
      count: 34,
      color: [0x22c55e, 0xfdf06a, 0xf97316, 0x3b82f6, 0xec4899],
      speed: 240,
      angle: -Math.PI / 2,
      spread: Math.PI * 1.4,
      size: 4,
      lifeMs: 1100,
      gravity: 420,
      drag: 0.985,
    });
  }

  leaves(x: number, y: number): void {
    this.burst(x, y, {
      count: 8,
      color: [0x2e7d32, 0x4caf50, 0x1b5e20],
      speed: 90,
      size: 3,
      lifeMs: 600,
      gravity: 300,
    });
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    const g = this.view;
    g.clear();

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dtMs;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const alpha = Math.min(1, (p.life / p.maxLife) * 1.6);
      g.circle(p.x, p.y, p.size).fill({ color: p.color, alpha });
    }
  }
}
