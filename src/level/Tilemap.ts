import { Container, Graphics } from "pixi.js";
import { COLORS, TILE, TILE_SIZE, isSolidTile } from "../config";
import type { LevelData } from "./LevelLoader";

/**
 * Renders level tiles into Pixi display objects.
 * Static terrain is baked into a few Graphics objects; flags and the finish
 * flag are individual containers so they can be recolored on activation.
 */
export class Tilemap {
  readonly container = new Container();
  private flagVisuals: FlagVisual[] = [];
  private waterGraphics: Graphics | null = null;
  private waterTime = 0;
  private readonly level: LevelData;

  constructor(level: LevelData) {
    this.level = level;
    this.build();
  }

  private tileAt(col: number, row: number): number {
    const { tiles, width, height } = this.level;
    if (row < 0 || row >= height || col < 0 || col >= width) return TILE.EMPTY;
    return tiles[row][col];
  }

  private build(): void {
    const terrain = new Graphics();
    const { width, height } = this.level;

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const id = this.tileAt(col, row);
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;

        if (id === TILE.SOLID) {
          const hasGrass = !isSolidTile(this.tileAt(col, row - 1));
          this.drawGroundTile(terrain, x, y, col, row, hasGrass);
        } else if (id === TILE.ICE) {
          this.drawIceTile(terrain, x, y);
        } else if (id >= TILE.ROUGH && id <= TILE.ROUGH_4) {
          this.drawRoughTile(terrain, x, y, col, row);
        } else if (id === TILE.SLOPE_UP_RIGHT || id === TILE.SLOPE_UP_LEFT) {
          this.drawSlopeTile(terrain, x, y, id === TILE.SLOPE_UP_RIGHT);
        } else if (id === TILE.FLAG) {
          this.container.addChild(this.buildFlag(col, row).root);
        } else if (id === TILE.FINISH) {
          this.container.addChild(this.buildFinish(col, row));
        }
      }
    }

    this.container.addChildAt(terrain, 0);

    // Water drawn above terrain.
    const water = new Graphics();
    this.redrawWater(water, 0);
    this.waterGraphics = water;
    this.container.addChild(water);
  }

  // ---------- Terrain tiles ----------

  private drawGroundTile(g: Graphics, x: number, y: number, col: number, row: number, grass: boolean): void {
    const shade = (col * 7 + row * 13) % 3;
    const dirtColors = [COLORS.dirt, COLORS.dirtDark, 0x845231];
    g.rect(x, y, TILE_SIZE, TILE_SIZE).fill(dirtColors[shade] ?? COLORS.dirt);
    if (grass) {
      g.rect(x, y, TILE_SIZE, 9).fill(COLORS.grassTop);
      g.rect(x, y + 9, TILE_SIZE, 2).fill({ color: COLORS.dirtDark, alpha: 0.5 });
      // Grass tufts
      g.poly([x + 5, y, x + 8, y - 5, x + 11, y]).fill(COLORS.grassLight);
      g.poly([x + 18, y, x + 21, y - 6, x + 24, y]).fill(COLORS.grassTop);
    }
  }

  private drawIceTile(g: Graphics, x: number, y: number): void {
    g.rect(x, y, TILE_SIZE, TILE_SIZE).fill(COLORS.ice);
    g.rect(x, y, TILE_SIZE, 3).fill({ color: 0xffffff, alpha: 0.8 });
    g.moveTo(x + 6, y + 22).lineTo(x + 20, y + 8).stroke({ color: 0xffffff, width: 2, alpha: 0.5 });
    g.moveTo(x + 14, y + 26).lineTo(x + 26, y + 14).stroke({ color: 0xffffff, width: 1.5, alpha: 0.4 });
    g.rect(x, y + TILE_SIZE - 3, TILE_SIZE, 3).fill({ color: COLORS.iceDark, alpha: 0.6 });
  }

  private drawRoughTile(g: Graphics, x: number, y: number, col: number, row: number): void {
    // Translucent tint + tall blades so the ball looks nestled in deep grass,
    // not inside a solid block (rough tiles are non-colliding sensors).
    g.rect(x, y, TILE_SIZE, TILE_SIZE).fill({ color: COLORS.rough, alpha: 0.35 });
    for (let i = 0; i < 6; i++) {
      const bx = x + 2 + ((col * 11 + i * 5) % 27);
      const bh = 9 + ((row * 5 + i * 3) % 9);
      g.moveTo(bx, y + TILE_SIZE)
        .lineTo(bx + 2, y + TILE_SIZE - bh)
        .lineTo(bx + 4, y + TILE_SIZE)
        .fill(i % 2 === 0 ? COLORS.rough : COLORS.roughDark);
    }
  }

  private drawSlopeTile(g: Graphics, x: number, y: number, upRight: boolean): void {
    const x0 = x, y0 = y, x1 = x + TILE_SIZE, y1 = y + TILE_SIZE;
    if (upRight) {
      g.poly([x0, y1, x1, y0, x1, y1]).fill(COLORS.dirt);
      g.moveTo(x0, y1).lineTo(x1, y0).stroke({ color: COLORS.grassTop, width: 5 });
    } else {
      g.poly([x0, y0, x0, y1, x1, y1]).fill(COLORS.dirt);
      g.moveTo(x0, y0).lineTo(x1, y1).stroke({ color: COLORS.grassTop, width: 5 });
    }
  }

  // ---------- Water ----------

  private redrawWater(g: Graphics, time: number): void {
    g.clear();
    const { width, height } = this.level;
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        if (this.tileAt(col, row) !== TILE.WATER) continue;
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;
        const surface = this.tileAt(col, row - 1) !== TILE.WATER;
        g.rect(x, y, TILE_SIZE, TILE_SIZE).fill({ color: COLORS.water, alpha: 0.85 });
        if (surface) {
          // Animated wavy surface line
          const wave = Math.sin(time * 2 + col * 0.9) * 2;
          g.rect(x, y + wave, TILE_SIZE, 4).fill({ color: 0x9fd8f5, alpha: 0.9 });
          if ((col + Math.floor(time)) % 3 === 0) {
            g.circle(x + 10 + ((col * 7) % 14), y + 14 + wave, 2).fill({ color: 0xffffff, alpha: 0.5 });
          }
        }
      }
    }
  }

  update(dtMs: number): void {
    if (!this.waterGraphics) return;
    this.waterTime += dtMs / 1000;
    // Redraw at ~12 fps to keep it cheap.
    if (Math.floor(this.waterTime * 12) !== Math.floor((this.waterTime - dtMs / 1000) * 12)) {
      this.redrawWater(this.waterGraphics, this.waterTime);
    }
  }

  // ---------- Flags & finish ----------

  private buildFlag(col: number, row: number): FlagVisual {
    const root = new Container();
    const baseX = (col + 0.5) * TILE_SIZE;
    const groundY = (row + 1) * TILE_SIZE;
    root.position.set(baseX, groundY);

    const pole = new Graphics().rect(-1.5, -26, 3, 26).fill(COLORS.flagPole);
    root.addChild(pole);

    const flag = new Graphics();
    this.drawFlagCloth(flag, false);
    root.addChild(flag);

    const visual: FlagVisual = { root, cloth: flag };
    this.flagVisuals.push(visual);
    return visual;
  }

  private drawFlagCloth(g: Graphics, active: boolean): void {
    g.clear();
    const color = active ? COLORS.flagActive : COLORS.flagInactive;
    g.poly([0, -26, 16, -21, 0, -15]).fill(color);
    if (active) {
      g.circle(0, -26, 2.5).fill(0xffd166);
    }
  }

  setFlagActive(index: number): void {
    const visual = this.flagVisuals[index];
    if (visual) this.drawFlagCloth(visual.cloth, true);
  }

  resetFlags(): void {
    for (const visual of this.flagVisuals) {
      this.drawFlagCloth(visual.cloth, false);
    }
  }

  private buildFinish(col: number, row: number): Container {
    const root = new Container();
    const baseX = (col + 0.5) * TILE_SIZE;
    const groundY = (row + 1) * TILE_SIZE;
    root.position.set(baseX, groundY);

    // Hole
    root.addChild(new Graphics().ellipse(0, 0, 10, 4).fill(0x1a1a1a));

    // Pole
    root.addChild(new Graphics().rect(-1.5, -30, 3, 30).fill(COLORS.finishPole));

    // Checkered flag
    const cloth = new Graphics();
    const sq = 5;
    for (let fy = 0; fy < 2; fy++) {
      for (let fx = 0; fx < 3; fx++) {
        cloth
          .rect(fx * sq, -30 + fy * sq, sq, sq)
          .fill((fx + fy) % 2 === 0 ? 0x111111 : 0xffffff);
      }
    }
    root.addChild(cloth);

    return root;
  }
}

interface FlagVisual {
  root: Container;
  cloth: Graphics;
}
