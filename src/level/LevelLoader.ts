import { TILE } from "../config";
import { CHAR_TO_TILE, type RawLevel } from "./levels";

export interface TilePos {
  col: number;
  row: number;
}

export interface LevelData {
  title: string;
  creator: string;
  par: number;
  width: number;
  height: number;
  /** tiles[row][col] */
  tiles: number[][];
  spawn: TilePos;
  /** Flag positions ordered top-most first, then left to right. */
  flags: TilePos[];
  finishes: TilePos[];
}

export class LevelLoader {
  static fromRaw(raw: RawLevel, infuriatingMode = false): LevelData {
    const height = raw.rows.length;
    const width = raw.rows[0]?.length ?? 0;
    if (width === 0 || height === 0) {
      throw new Error(`Level "${raw.title}" has invalid dimensions`);
    }

    const tiles: number[][] = [];
    let spawn: TilePos | null = null;
    const flags: TilePos[] = [];
    const finishes: TilePos[] = [];

    for (let row = 0; row < height; row++) {
      const line = raw.rows[row];
      if (line.length !== width) {
        throw new Error(`Level "${raw.title}" row ${row} has inconsistent width`);
      }
      const tilesRow: number[] = [];
      for (let col = 0; col < width; col++) {
        const ch = line[col];
        const id = CHAR_TO_TILE[ch] ?? TILE.EMPTY;

        if (id === TILE.FLAG && infuriatingMode) {
          tilesRow.push(TILE.EMPTY);
          continue;
        }
        if (id === TILE.SPAWN) {
          spawn = { col, row };
          tilesRow.push(TILE.EMPTY); // spawn marker is not terrain
          continue;
        }
        if (id === TILE.FLAG) flags.push({ col, row });
        if (id === TILE.FINISH) finishes.push({ col, row });
        tilesRow.push(id);
      }
      tiles.push(tilesRow);
    }

    if (!spawn) {
      // Fall back to the bottom-left-most solid tile, resting on top of it.
      outer: for (let row = height - 1; row >= 0; row--) {
        for (let col = 0; col < width; col++) {
          if (tiles[row][col] === TILE.SOLID) {
            spawn = { col, row: row - 1 };
            break outer;
          }
        }
      }
    }
    if (!spawn) throw new Error(`Level "${raw.title}" has no spawn point`);

    // Highest first, then left-to-right.
    flags.sort((a, b) => a.row - b.row || a.col - b.col);

    return {
      title: raw.title,
      creator: raw.creator,
      par: raw.par,
      width,
      height,
      tiles,
      spawn,
      flags,
      finishes,
    };
  }
}
