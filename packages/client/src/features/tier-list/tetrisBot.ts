/* A self-contained, client-side Tetris AI opponent for 봇 대전 (solo). It runs
 * its own board on a timer, places pieces with a height/holes/bumpiness
 * heuristic, and exchanges time-drain + garbage with the player exactly like a
 * human opponent (same tetrisCore rules). Three difficulties tune think speed,
 * mistake rate and stacking quality. */
import {
  COLS,
  ROWS,
  CI,
  SHAPES,
  collide,
  clearLines,
  computeGarbage,
  isPerfectClear,
  shuffledBag,
  SEC_PER_ATTACK,
  type Piece,
} from "./tetrisCore";

export type BotDifficulty = "easy" | "normal" | "hard";

export const BOT_LABEL: Record<BotDifficulty, string> = { easy: "봇 · 쉬움", normal: "봇 · 보통", hard: "봇 · 어려움" };

// interval = ms between placements; mistake = chance of a sub-optimal move;
// wHoles/wBump = penalty weights (lower = sloppier stacking).
const PARAMS: Record<BotDifficulty, { interval: number; mistake: number; wHoles: number; wBump: number }> = {
  easy: { interval: 1150, mistake: 0.35, wHoles: 0.18, wBump: 0.12 },
  normal: { interval: 560, mistake: 0.08, wHoles: 0.35663, wBump: 0.184483 },
  hard: { interval: 280, mistake: 0.0, wHoles: 0.46, wBump: 0.22 },
};
const W_AGG = 0.510066;
const W_LINES = 0.760666;
const TICK = 50;

type BotOpts = {
  seconds: number;
  difficulty: BotDifficulty;
  /** The bot cleared → attack the player: `attack` = Tetrio attack value (drives
   *  the player's time drain), `garbage` = net lines to stack after cancellation. */
  onClear: (attack: number, garbage: number) => void;
  /** The bot topped out or ran out of time → the player wins. */
  onDead: () => void;
};

export type TetrisBot = {
  getBoard: () => { grid: number[][]; seconds: number };
  receive: (lines: number, garbage: number) => void;
  start: () => void;
  stop: () => void;
};

const clone = (grid: number[][]) => grid.map((row) => row.slice());
const rotsOf = (piece: Piece): number[] =>
  piece === "O" ? [0] : piece === "I" || piece === "S" || piece === "Z" ? [0, 1] : [0, 1, 2, 3];

function colHeights(grid: number[][]): number[] {
  const h = new Array(COLS).fill(0);
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (grid[r][c] !== 0) { h[c] = ROWS - r; break; }
    }
  }
  return h;
}
function countHoles(grid: number[][]): number {
  let holes = 0;
  for (let c = 0; c < COLS; c++) {
    let seen = false;
    for (let r = 0; r < ROWS; r++) {
      if (grid[r][c] !== 0) seen = true;
      else if (seen) holes++;
    }
  }
  return holes;
}
function evaluate(grid: number[][], cleared: number, wHoles: number, wBump: number): number {
  const h = colHeights(grid);
  let agg = 0;
  let bump = 0;
  for (let c = 0; c < COLS; c++) {
    agg += h[c];
    if (c < COLS - 1) bump += Math.abs(h[c] - h[c + 1]);
  }
  return W_LINES * cleared - W_AGG * agg - wHoles * countHoles(grid) - wBump * bump;
}
// Drop `piece` straight down at (rot, x); returns the resulting board + clears,
// or null if that column/rotation isn't placeable.
function simDrop(grid: number[][], piece: Piece, rot: number, x: number): { grid: number[][]; cleared: number } | null {
  let y = -2;
  if (collide(grid, piece, rot, x, y)) return null; // out of bounds / blocked at top
  while (!collide(grid, piece, rot, x, y + 1)) y++;
  const g2 = clone(grid);
  for (const [cc, rr] of SHAPES[piece][rot]) {
    const c = x + cc;
    const r = y + rr;
    if (r < 0) return null; // locked above the ceiling → a top-out, not a real option
    g2[r][c] = CI[piece];
  }
  return { grid: g2, cleared: clearLines(g2) };
}

export function createTetrisBot(opts: BotOpts): TetrisBot {
  const params = PARAMS[opts.difficulty];
  let grid: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  const bag: Piece[] = [];
  let cur: Piece;
  let time = opts.seconds * 1000;
  let incoming = 0;
  let combo = -1;
  let b2b = false;
  let over = false;
  let thinkAcc = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const pull = (): Piece => {
    if (bag.length === 0) bag.push(...shuffledBag());
    return bag.shift() as Piece;
  };
  cur = pull();

  const addGarbage = (n: number): boolean => {
    const hole = Math.floor(Math.random() * COLS);
    for (let i = 0; i < n; i++) {
      if (grid[0].some((v) => v !== 0)) return false; // shoved a block off the top
      grid.shift();
      const row = Array(COLS).fill(8);
      row[hole] = 0;
      grid.push(row);
    }
    return true;
  };

  const dead = () => {
    if (over) return;
    over = true;
    stop();
    opts.onDead();
  };

  const step = () => {
    if (over) return;
    const cands: { rot: number; x: number; grid: number[][]; cleared: number; score: number }[] = [];
    for (const rot of rotsOf(cur)) {
      for (let x = -2; x < COLS; x++) {
        const res = simDrop(grid, cur, rot, x);
        if (!res) continue;
        cands.push({ rot, x, grid: res.grid, cleared: res.cleared, score: evaluate(res.grid, res.cleared, params.wHoles, params.wBump) });
      }
    }
    if (cands.length === 0) { dead(); return; }
    cands.sort((a, b) => b.score - a.score);
    // Difficulty mistakes: sometimes take a weaker move from the top few.
    let pick = cands[0];
    if (params.mistake > 0 && Math.random() < params.mistake) {
      pick = cands[Math.floor(Math.random() * Math.min(cands.length, 6))];
    }
    grid = pick.grid; // already line-cleared by simDrop
    if (pick.cleared > 0) {
      combo++;
      const perfect = isPerfectClear(grid);
      const g = computeGarbage(pick.cleared, false, b2b, combo, perfect); // the bot doesn't spin
      b2b = pick.cleared === 4;
      const cancel = Math.min(g, incoming);
      incoming -= cancel;
      const net = g - cancel;
      if (g > 0) opts.onClear(g, net); // attack value drives the drain
    } else {
      combo = -1;
      if (incoming > 0) {
        if (!addGarbage(incoming)) { dead(); return; }
        incoming = 0;
      }
    }
    cur = pull();
  };

  const start = () => {
    if (timer) return;
    timer = setInterval(() => {
      if (over) return;
      time -= TICK;
      if (time <= 0) { time = 0; dead(); return; }
      thinkAcc += TICK;
      if (thinkAcc >= params.interval) { thinkAcc = 0; step(); }
    }, TICK);
  };
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    getBoard: () => ({ grid: clone(grid), seconds: Math.max(0, time / 1000) }),
    receive: (attack: number, garbage: number) => {
      time -= SEC_PER_ATTACK * 1000 * Math.max(0, attack); // player's attack drains the bot's clock
      incoming += Math.max(0, garbage);
    },
    start,
    stop,
  };
}
