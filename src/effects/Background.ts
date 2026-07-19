import { Container, FillGradient, Graphics } from "pixi.js";
import { COLORS } from "../config";

interface Cloud {
  g: Graphics;
  speed: number;
  baseY: number;
  phase: number;
}

/**
 * Scrolling sky background drawn inside the world container:
 * gradient sky, sun, drifting clouds, and distant hills near the bottom.
 */
export class Background {
  readonly container = new Container();
  private clouds: Cloud[] = [];
  private readonly worldWidthPx: number;
  private readonly worldHeightPx: number;

  constructor(worldWidthPx: number, worldHeightPx: number) {
    this.worldWidthPx = worldWidthPx;
    this.worldHeightPx = worldHeightPx;
    this.build();
  }

  private build(): void {
    const w = this.worldWidthPx;
    const h = this.worldHeightPx;

    // Sky gradient
    const gradient = new FillGradient(0, 0, 0, h);
    gradient.addColorStop(0, 0x2f7cc4);
    gradient.addColorStop(0.45, COLORS.skyTop);
    gradient.addColorStop(1, COLORS.skyBottom);
    const sky = new Graphics().rect(0, 0, w, h).fill(gradient);
    this.container.addChild(sky);

    // Sun (near the top, above the summit)
    const sun = new Graphics()
      .circle(w * 0.78, h * 0.05, 34)
      .fill({ color: 0xffdf6b, alpha: 0.95 })
      .circle(w * 0.78, h * 0.05, 46)
      .fill({ color: 0xffdf6b, alpha: 0.18 });
    this.container.addChild(sun);

    // Distant hills at the base of the world
    const hills = new Graphics();
    hills
      .ellipse(w * 0.2, h + 40, w * 0.45, 150)
      .fill({ color: 0x2f8f46, alpha: 0.55 });
    hills
      .ellipse(w * 0.8, h + 60, w * 0.5, 190)
      .fill({ color: 0x2a7f3e, alpha: 0.5 });
    this.container.addChild(hills);

    // Clouds scattered through the sky
    const rng = mulberry32(12345);
    const count = Math.max(6, Math.floor(h / 220));
    for (let i = 0; i < count; i++) {
      const scale = 0.5 + rng() * 0.9;
      const cloud = this.buildCloud(scale, 0.25 + rng() * 0.35);
      cloud.g.position.set(rng() * w, 40 + rng() * (h - 120));
      cloud.baseY = cloud.g.y;
      cloud.speed = 4 + rng() * 9;
      cloud.phase = rng() * Math.PI * 2;
      this.clouds.push(cloud);
      this.container.addChild(cloud.g);
    }
  }

  private buildCloud(scale: number, alpha: number): Cloud {
    const g = new Graphics();
    const shapes = CLOUD_SHAPES[Math.floor(Math.random() * CLOUD_SHAPES.length)];
    const px = 8 * scale; // pixel size
    const palette = [0xffffff, 0xe8f4ff, 0xd6ecff];
    for (let r = 0; r < shapes.length; r++) {
      for (let c = 0; c < shapes[r].length; c++) {
        if (shapes[r][c] === "#") {
          const color = palette[(r * 7 + c * 3) % palette.length];
          g.rect((c - 5) * px, (r - 2) * px, px, px).fill({ color, alpha });
        }
      }
    }
    return { g, speed: 0, baseY: 0, phase: 0 };
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    for (const cloud of this.clouds) {
      cloud.g.x += cloud.speed * dt;
      cloud.g.y = cloud.baseY + Math.sin(cloud.phase + cloud.g.x * 0.004) * 8;
      if (cloud.g.x - 80 > this.worldWidthPx) {
        cloud.g.x = -90;
      }
    }
  }
}

const CLOUD_SHAPES: string[][] = [
  [
    "..######..",
    ".########.",
    "##########",
    ".########.",
    "..######..",
  ],
  [
    "...####...",
    "..######..",
    ".########.",
    "##########",
    ".########.",
    "..######..",
  ],
  [
    ".########.",
    "##########",
    "##########",
    ".########.",
  ],
];

/** Deterministic tiny PRNG so the sky looks the same for everyone. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
