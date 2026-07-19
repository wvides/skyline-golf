import { mulberry32 } from "../effects/Background";
import type { RawLevel } from "./levels";

const W = 20;

/**
 * Procedural level generator that builds forgiving, playable vertical golf courses.
 *
 * Rules:
 *  - Platforms are 4-5 tiles wide and only 2-3 rows apart.
 *  - Horizontal offset between platforms is small (2-5 tiles) so shots are clear.
 *  - A guide wall is added on the OUTSIDE of the zigzag to catch stray balls.
 *  - 2-3 checkpoints on stable platforms.
 *  - Single finish hole at the top.
 *  - A water pit at the bottom catches falls.
 */
export function generateLevel(seed: number): RawLevel {
  const rng = mulberry32(seed);
  const height = 34 + Math.floor(rng() * 5); // 34-38 rows
  const rows: string[][] = Array.from({ length: height }, () => Array(W).fill("."));

  const set = (col: number, row: number, ch: string) => {
    if (col >= 0 && col < W && row >= 0 && row < height) rows[row][col] = ch;
  };

  // Start platform near the bottom.
  let currentRow = height - 4;
  let currentCol = 2 + Math.floor(rng() * 3); // left side start
  const startWidth = 4 + Math.floor(rng() * 2); // 4-5

  placePlatform(rows, currentRow, currentCol, startWidth, "#");
  const spawnCol = currentCol + Math.floor(startWidth / 2);
  set(spawnCol, currentRow - 1, "S");

  // Bottom water pit between two pillars.
  const leftPillar = 0;
  const rightPillar = W - 1;
  for (let r = currentRow + 1; r < height - 1; r++) {
    set(leftPillar, r, "#");
    set(rightPillar, r, "#");
  }
  for (let r = height - 2; r < height - 1; r++) {
    for (let c = leftPillar + 1; c < rightPillar; c++) set(c, r, "~");
  }
  for (let c = 0; c < W; c++) set(c, height - 1, "#");

  // Climb upward with alternating left/right platforms.
  const platforms: Array<{ row: number; col: number; width: number }> = [
    { row: currentRow, col: currentCol, width: startWidth },
  ];
  let direction = 1; // 1 = right side next, -1 = left side next
  let checkpointRows: number[] = [];

  while (currentRow > 6) {
    const gap = 2 + Math.floor(rng() * 2); // 2-3 rows up
    currentRow -= gap;
    if (currentRow <= 5) break;

    const platformWidth = 4 + Math.floor(rng() * 2); // 4-5
    let nextCol: number;

    if (direction === 1) {
      // Place on the right side, offset from current.
      const min = Math.max(1, currentCol + 2);
      const max = Math.min(W - 2 - platformWidth, currentCol + 5);
      nextCol = min + Math.floor(rng() * Math.max(1, max - min + 1));
      // Outside wall on the right, extending downward to catch overshoots
      // without blocking upward shots.
      for (let r = currentRow; r < currentRow + 3 && r < height - 1; r++) {
        set(nextCol + platformWidth, r, "#");
      }
    } else {
      // Place on the left side.
      const max = Math.min(W - 2 - platformWidth, currentCol - 2);
      const min = Math.max(1, currentCol - 5);
      nextCol = min + Math.floor(rng() * Math.max(1, max - min + 1));
      // Outside wall on the left.
      for (let r = currentRow; r < currentRow + 3 && r < height - 1; r++) {
        set(nextCol - 1, r, "#");
      }
    }

    // Occasional ice or rough platform.
    const tile = rng() < 0.12 ? "I" : rng() < 0.18 ? "#" : "#";
    placePlatform(rows, currentRow, nextCol, platformWidth, tile);
    platforms.push({ row: currentRow, col: nextCol, width: platformWidth });

    // Rough patch above part of the platform.
    if (rng() < 0.25 && tile === "#") {
      const roughCount = 1 + Math.floor(rng() * 2);
      for (let i = 0; i < roughCount && i < platformWidth; i++) {
        set(nextCol + 1 + i, currentRow - 1, "r");
      }
    }

    // Checkpoint on every other platform, up to 3.
    if (checkpointRows.length < 3 && rng() < 0.55) {
      const flagCol = nextCol + Math.floor(platformWidth / 2);
      set(flagCol, currentRow - 1, "F");
      checkpointRows.push(currentRow);
    }

    currentCol = nextCol;
    direction *= -1;
  }

  // Finish platform at the top.
  const finishRow = 3;
  const finishWidth = 5;
  const finishCol = Math.max(2, Math.min(W - 2 - finishWidth, currentCol - 2));
  placePlatform(rows, finishRow, finishCol, finishWidth, "#");
  set(finishCol + Math.floor(finishWidth / 2), finishRow - 1, "*");

  // Ensure at least one checkpoint if none generated.
  if (checkpointRows.length === 0) {
    const p = platforms[Math.floor(platforms.length / 2)];
    set(p.col + Math.floor(p.width / 2), p.row - 1, "F");
  }

  // World boundary floor.
  for (let c = 0; c < W; c++) set(c, height - 1, "#");

  return {
    title: `Generated Course ${seed}`,
    creator: "Procedural",
    par: 5 + Math.floor(rng() * 5), // par 5-9
    rows: rows.map((row) => row.join("")),
  };
}

function placePlatform(
  rows: string[][],
  row: number,
  col: number,
  width: number,
  tile: string,
): void {
  for (let c = 0; c < width; c++) {
    if (col + c >= 0 && col + c < rows[0].length) {
      rows[row][col + c] = tile;
    }
  }
}
