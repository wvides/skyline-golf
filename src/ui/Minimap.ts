import { TILE, TILE_SIZE, isSolidTile } from "../config";
import type { LevelData } from "../level/LevelLoader";

export interface TrailPoint {
  x: number;
  y: number;
}

/**
 * Renders a small overview of the level with the player's shot trail,
 * shown on the score page after finishing a hole.
 */
export function renderMinimap(
  canvas: HTMLCanvasElement,
  level: LevelData,
  trail: TrailPoint[],
  ballPos: TrailPoint,
  flagsReached: boolean[],
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const cw = canvas.width;
  const ch = canvas.height;
  const worldW = level.width * TILE_SIZE;
  const worldH = level.height * TILE_SIZE;
  const scale = Math.min(cw / worldW, ch / worldH);
  const ox = (cw - worldW * scale) / 2;
  const oy = (ch - worldH * scale) / 2;

  // Sky backdrop
  const sky = ctx.createLinearGradient(0, oy, 0, oy + worldH * scale);
  sky.addColorStop(0, "#2f7cc4");
  sky.addColorStop(1, "#aee3f5");
  ctx.fillStyle = "#16240f";
  ctx.fillRect(0, 0, cw, ch);
  ctx.fillStyle = sky;
  ctx.fillRect(ox, oy, worldW * scale, worldH * scale);

  const ts = TILE_SIZE * scale;
  const tileAt = (col: number, row: number) =>
    row < 0 || row >= level.height || col < 0 || col >= level.width
      ? TILE.EMPTY
      : level.tiles[row][col];

  // Terrain
  for (let row = 0; row < level.height; row++) {
    for (let col = 0; col < level.width; col++) {
      const id = tileAt(col, row);
      if (id === TILE.EMPTY) continue;
      const x = ox + col * ts;
      const y = oy + row * ts;

      if (id === TILE.SOLID) {
        ctx.fillStyle = "#8d5a3b";
        ctx.fillRect(x, y, ts + 0.5, ts + 0.5);
        if (!isSolidTile(tileAt(col, row - 1))) {
          ctx.fillStyle = "#4caf50";
          ctx.fillRect(x, y, ts + 0.5, Math.max(1.5, ts * 0.3));
        }
      } else if (id === TILE.ICE) {
        ctx.fillStyle = "#bfeaf7";
        ctx.fillRect(x, y, ts + 0.5, ts + 0.5);
      } else if (id === TILE.WATER) {
        ctx.fillStyle = "#2d9cdb";
        ctx.fillRect(x, y, ts + 0.5, ts + 0.5);
      } else if (id >= TILE.ROUGH && id <= TILE.ROUGH_4) {
        ctx.fillStyle = "#2e7d32";
        ctx.fillRect(x, y, ts + 0.5, ts + 0.5);
      } else if (id === TILE.SLOPE_UP_RIGHT) {
        ctx.fillStyle = "#8d5a3b";
        ctx.beginPath();
        ctx.moveTo(x, y + ts);
        ctx.lineTo(x + ts, y);
        ctx.lineTo(x + ts, y + ts);
        ctx.fill();
      } else if (id === TILE.SLOPE_UP_LEFT) {
        ctx.fillStyle = "#8d5a3b";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + ts);
        ctx.lineTo(x + ts, y + ts);
        ctx.fill();
      }
    }
  }

  // Checkpoint flags
  level.flags.forEach((flag, i) => {
    const fx = ox + (flag.col + 0.5) * ts;
    const fy = oy + (flag.row + 1) * ts;
    ctx.strokeStyle = "#6b4c3a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx, fy - ts * 0.9);
    ctx.stroke();
    ctx.fillStyle = flagsReached[i] ? "#22c55e" : "#9e9e9e";
    ctx.beginPath();
    ctx.moveTo(fx, fy - ts * 0.9);
    ctx.lineTo(fx + ts * 0.55, fy - ts * 0.7);
    ctx.lineTo(fx, fy - ts * 0.5);
    ctx.fill();
  });

  // Finish marker
  for (const fin of level.finishes) {
    const fx = ox + (fin.col + 0.5) * ts;
    const fy = oy + (fin.row + 1) * ts;
    ctx.strokeStyle = "#854d0e";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx, fy - ts);
    ctx.stroke();
    // Checkered cloth
    const sq = ts * 0.22;
    for (let yy = 0; yy < 2; yy++) {
      for (let xx = 0; xx < 2; xx++) {
        ctx.fillStyle = (xx + yy) % 2 === 0 ? "#111" : "#fff";
        ctx.fillRect(fx + xx * sq, fy - ts + yy * sq, sq, sq);
      }
    }
  }

  // Shot trail
  if (trail.length > 1) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = Math.max(1.2, 2.2 * scale);
    ctx.setLineDash([5 * scale * 2, 4 * scale * 2]);
    ctx.beginPath();
    ctx.moveTo(ox + trail[0].x * scale, oy + trail[0].y * scale);
    for (let i = 1; i < trail.length; i++) {
      ctx.lineTo(ox + trail[i].x * scale, oy + trail[i].y * scale);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Final ball position
  ctx.beginPath();
  ctx.arc(ox + ballPos.x * scale, oy + ballPos.y * scale, Math.max(3, 6 * scale), 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Spawn marker
  ctx.beginPath();
  ctx.arc(ox + (level.spawn.col + 0.5) * ts, oy + (level.spawn.row + 0.5) * ts, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fill();
}
