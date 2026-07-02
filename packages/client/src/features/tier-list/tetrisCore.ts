/* Shared, pure Tetris constants + rules used by both the playable board
 * (TetrisGame) and the AI bot (tetrisBot) — one source of truth so garbage,
 * shapes and kicks stay identical (Tetrio-standard). */

export const COLS = 10;
export const ROWS = 20;

export type Piece = "I" | "J" | "L" | "O" | "S" | "T" | "Z";

// 1..7 = pieces, 8 = garbage (gray).
export const COLORS = [0x000000, 0x38bdf8, 0x3b82f6, 0xf59e0b, 0xfacc15, 0x22c55e, 0xa855f7, 0xef4444, 0x6b7280];
export const CI: Record<Piece, number> = { I: 1, J: 2, L: 3, O: 4, S: 5, T: 6, Z: 7 };

// 4 rotations each; every rotation is the list of [col,row] filled cells.
export const SHAPES: Record<Piece, number[][][]> = {
  I: [[[0, 1], [1, 1], [2, 1], [3, 1]], [[2, 0], [2, 1], [2, 2], [2, 3]], [[0, 2], [1, 2], [2, 2], [3, 2]], [[1, 0], [1, 1], [1, 2], [1, 3]]],
  J: [[[0, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [2, 0], [1, 1], [1, 2]], [[0, 1], [1, 1], [2, 1], [2, 2]], [[1, 0], [1, 1], [0, 2], [1, 2]]],
  L: [[[2, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [1, 1], [1, 2], [2, 2]], [[0, 1], [1, 1], [2, 1], [0, 2]], [[0, 0], [1, 0], [1, 1], [1, 2]]],
  O: [[[1, 0], [2, 0], [1, 1], [2, 1]], [[1, 0], [2, 0], [1, 1], [2, 1]], [[1, 0], [2, 0], [1, 1], [2, 1]], [[1, 0], [2, 0], [1, 1], [2, 1]]],
  S: [[[1, 0], [2, 0], [0, 1], [1, 1]], [[1, 0], [1, 1], [2, 1], [2, 2]], [[1, 1], [2, 1], [0, 2], [1, 2]], [[0, 0], [0, 1], [1, 1], [1, 2]]],
  T: [[[1, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [1, 1], [2, 1], [1, 2]], [[0, 1], [1, 1], [2, 1], [1, 2]], [[1, 0], [0, 1], [1, 1], [1, 2]]],
  Z: [[[0, 0], [1, 0], [1, 1], [2, 1]], [[2, 0], [1, 1], [2, 1], [1, 2]], [[0, 1], [1, 1], [1, 2], [2, 2]], [[1, 0], [0, 1], [1, 1], [0, 2]]],
};

// SRS wall kicks (y-down), keyed `${from}${to}`.
export const KICK_JLSTZ: Record<string, number[][]> = {
  "01": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], "10": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "12": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], "21": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "23": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], "32": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "30": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], "03": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};
export const KICK_I: Record<string, number[][]> = {
  "01": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]], "10": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "12": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]], "21": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "23": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]], "32": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "30": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]], "03": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

// Tetrio-style garbage tables (modern guideline).
export const GARB = [0, 0, 1, 2, 4]; // by lines cleared (0..4)
export const TSPIN_GARB = [0, 2, 4, 6]; // t-spin by lines cleared (0..3)
export const COMBO = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5]; // by combo count

/** Outgoing garbage for a clear (before 1:1 cancellation): base table (or t-spin)
 *  + combo bonus + back-to-back (+1) + perfect clear (+10). */
export function computeGarbage(cleared: number, tspin: boolean, b2b: boolean, combo: number, perfect: boolean): number {
  if (cleared <= 0) return 0;
  let g = (tspin ? TSPIN_GARB[cleared] : GARB[cleared]) ?? 0;
  g += COMBO[Math.min(Math.max(0, combo), COMBO.length - 1)];
  if ((cleared === 4 || tspin) && b2b) g += 1;
  if (perfect) g += 10;
  return g;
}

export const cellsOf = (type: Piece, rot: number, px: number, py: number): number[][] =>
  SHAPES[type][rot].map(([c, r]) => [px + c, py + r]);

export function collide(grid: number[][], type: Piece, rot: number, px: number, py: number): boolean {
  return cellsOf(type, rot, px, py).some(([c, r]) => c < 0 || c >= COLS || r >= ROWS || (r >= 0 && grid[r][c] !== 0));
}

/** Clear full rows in place; returns the number cleared. */
export function clearLines(grid: number[][]): number {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (grid[r].every((v) => v !== 0)) {
      grid.splice(r, 1);
      grid.unshift(Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  return cleared;
}

export function isPerfectClear(grid: number[][]): boolean {
  return grid.every((row) => row.every((v) => v === 0));
}

/** A fresh, shuffled 7-bag. */
export function shuffledBag(): Piece[] {
  const b: Piece[] = ["I", "J", "L", "O", "S", "T", "Z"];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
