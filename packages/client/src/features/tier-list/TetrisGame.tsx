/* Phaser is lazy-loaded and untyped here; `this` is the live Scene. */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-this-alias */
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Blocks, Clock, Undo2, type LucideIcon } from "lucide-react";

import { TETRIS_ITEMS } from "@tier-list/shared";
import { ARCADE, PIXEL, DuelTitle, RetroBackdrop } from "./duelChrome";
import { COLS, ROWS, CI, COLORS, SHAPES, KICK_JLSTZ, KICK_I, computeGarbage, isPerfectClear, SEC_PER_ATTACK, type Piece } from "./tetrisCore";

export type TetrisOpponent = { grid: number[][]; seconds: number; name: string } | null;

/** Live 결정전 arena state — mutated by useRoom's socket listeners, polled each
 *  frame by the Phaser scene (kept in a ref so board updates don't re-render). */
export type ArenaState = {
  boards: Record<string, { grid: number[][]; seconds: number }>;
  targets: Record<string, string>; // attacker → target
  dead: Record<string, boolean>;
  attacks: { from: string; to: string; seq: number }[]; // recent, for projectiles
};
export type ArenaProp = {
  meId: string;
  fighters: { userId: string; name: string; side: "pro" | "con" }[];
  stateRef: MutableRefObject<ArenaState>;
  onSetTarget: (targetId: string) => void;
};

type TetrisGameProps = {
  by: string;
  /** Seconds on the clock at the start. Time only ticks *down* (drain-only). */
  startSeconds?: number;
  /** Opponent board for the live side view (multiplayer); null in solo. */
  getOpponent?: () => TetrisOpponent;
  /** Accumulated seconds to add to my clock — opponent's clears push negatives. */
  deltaRef?: MutableRefObject<number>;
  /** Garbage lines queued from the opponent's clears (Tetrio-style). */
  garbageRef?: MutableRefObject<number>;
  /** Pre-stacked garbage rows at the start (결정전 공격/debt handicap). */
  startGarbage?: number;
  /** 목숨 skill: extra revives — a top-out clears the board and continues. */
  lives?: number;
  /** Each line-clear lock → (attack, garbage) I send: `attack` = the Tetrio
   *  attack value (drives the opponent's time drain, SEC_PER_ATTACK×), `garbage`
   *  = the net lines to stack after 1:1 cancellation. */
  onClear?: (attack: number, garbage: number) => void;
  /** Snapshot of my board each lock (for the opponent's live view). */
  onBoard?: (grid: number[][], seconds: number) => void;
  /** Top-out or clock ran out → final line count. */
  onGameOver: (lines: number) => void;
  /** 항복: concede this game (multiplayer → opponent wins; solo → just ends). */
  onSurrender?: () => void;
  /** 결정전 free-for-all: renders every fighter's board + targeting + projectiles. */
  arena?: ArenaProp;
  /** Equipped consumable item id ("" = none), used once via the E key. */
  item?: string;
  /** Called when the item is used (reflect → parent notifies server / bot). */
  onUseItem?: (type: string) => void;
  onClose: () => void;
};

const ITEM_LABEL: Record<string, string> = { reflect: "공격 반사", iblock: "일자 블록", time: "시간 +10" };
const ITEM_ICON: Record<string, LucideIcon> = { reflect: Undo2, iblock: Blocks, time: Clock };
const ITEM_DESC: Record<string, string> = Object.fromEntries(TETRIS_ITEMS.map((i) => [i.id, i.desc]));

type SceneParams = {
  startSeconds: number;
  startGarbage?: number;
  lives?: number;
  /** Multiplayer: always reserve/draw the opponent panel (even before data). */
  showOpp?: boolean;
  onClear?: (attack: number, garbage: number) => void;
  onBoard?: (g: number[][], s: number) => void;
  onGameOver: (l: number) => void;
  getOpp: () => TetrisOpponent;
  drainDelta: () => number;
  drainGarbage: () => number;
  arena?: ArenaProp;
  item?: string;
  useItem?: (type: string) => void;
  itemStatus?: { used: boolean; reflectMs: number };
};

function tetrisScene(ss: number, p: SceneParams) {
  const u = (n: number) => n * ss;
  const font = (n: number) => `${n * ss}px`;
  const CELL = u(15);
  const BX = u(150);
  const BY = u(92); // leaves room above the board for the score header
  const OC = u(8); // opponent cell
  const OX = u(432);
  // Bottom-align the opponent board with mine (both bottom edges at the same y).
  const OY = BY + ROWS * CELL - ROWS * OC;
  const startMs = p.startSeconds * 1000;
  const boardMidX = BX + (COLS * CELL) / 2;
  const BW = COLS * CELL; // board width
  // Vertical time gauge, full board height, hugging the board's right edge.
  const GX = BX + BW + u(6);
  const GW = u(12);
  const GH = ROWS * CELL;
  // 결정전 arena: grid of every other fighter's small board (right of NEXT).
  const AX = u(420);
  const AY = u(86);
  const ACELL = u(5); // small-board cell
  const ACOLS = 4;
  const ASLOTW = u(68);
  const ASLOTH = u(132);

  return {
    key: "tetris",
    create: function (this: any) {
      const s = this;
      s.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
      s.bag = [] as Piece[];
      s.next = [] as Piece[];
      s.hold = null as Piece | null;
      s.holdUsed = false;
      s.lines = 0;
      s.time = startMs;
      // Score = total seconds I've drained from the opponent (2s per line cleared).
      // oppDealt = the mirror: seconds the opponent has drained from me.
      s.dealt = 0;
      s.oppDealt = 0;
      s.over = false;
      s.dropAcc = 0;
      s.dropInterval = 750;
      s.lockAcc = 0;
      s.das = { dir: 0, t: 0, charged: false };
      s.incoming = 0; // pending garbage lines to receive
      s.combo = -1;
      s.b2b = false;
      s.spin = false; // last successful action was a rotation (for t-spin)
      s.lives = Math.max(0, Math.floor(p.lives ?? 0)); // 목숨: top-out revives
      s.reviveFlash = 0;
      s.projectiles = []; // attack motion (both 1:1 and arena)
      s.seenSeq = 0;
      s.itemUsed = false; // consumable item: one use per game
      s.reflectMs = 0; // 공격 반사 remaining (visual aura)
      s.itemFlash = 0; // brief centered flash on item use
      s.clearFade = 0; // clear-type callout remaining

      const refill = () => {
        const b: Piece[] = ["I", "J", "L", "O", "S", "T", "Z"];
        for (let i = b.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [b[i], b[j]] = [b[j], b[i]];
        }
        s.bag.push(...b);
      };
      const pull = (): Piece => {
        if (s.bag.length === 0) refill();
        return s.bag.shift();
      };
      while (s.next.length < 5) s.next.push(pull());

      const cellsOf = (type: Piece, rot: number, px: number, py: number): number[][] => SHAPES[type][rot].map(([c, r]) => [px + c, py + r]);
      const collide = (type: Piece, rot: number, px: number, py: number) =>
        cellsOf(type, rot, px, py).some(([c, r]) => c < 0 || c >= COLS || r >= ROWS || (r >= 0 && s.grid[r][c] !== 0));
      s.collide = collide;
      const canDown = () => !collide(s.cur.type, s.cur.rot, s.cur.x, s.cur.y + 1);
      // T-spin: 3+ of the T-piece's four diagonal box-corners are blocked.
      const blocked = (c: number, r: number) => c < 0 || c >= COLS || r >= ROWS || (r >= 0 && s.grid[r][c] !== 0);
      const isTSpin = () => {
        if (s.cur.type !== "T" || !s.spin) return false;
        const { x, y } = s.cur;
        let n = 0;
        for (const [cx, cy] of [[0, 0], [2, 0], [0, 2], [2, 2]]) if (blocked(x + cx, y + cy)) n++;
        return n >= 3;
      };

      const spawn = () => {
        const type = s.next.shift() as Piece;
        s.next.push(pull());
        s.cur = { type, rot: 0, x: 3, y: -1 };
        s.holdUsed = false;
        s.lockAcc = 0;
        s.dropAcc = 0;
        s.spin = false;
        if (collide(type, 0, s.cur.x, s.cur.y)) end();
      };
      const end = () => {
        if (s.over) return;
        // 목숨: a top-out spends a life — wipe the board and keep playing.
        if (s.lives > 0) {
          s.lives -= 1;
          s.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
          s.incoming = 0;
          s.lockAcc = 0;
          s.reviveFlash = 1000;
          spawn();
          return;
        }
        s.over = true;
        p.onGameOver(s.lines);
      };
      // Materialize incoming garbage: push gray rows (one shared hole) up from the
      // bottom; if a filled row is shoved past the top, it's a top-out.
      const addGarbage = (n: number) => {
        const hole = Math.floor(Math.random() * COLS);
        for (let i = 0; i < n; i++) {
          if (s.grid[0].some((v: number) => v !== 0)) { end(); return; }
          s.grid.shift();
          const row = Array(COLS).fill(8);
          row[hole] = 0;
          s.grid.push(row);
        }
      };
      const lock = () => {
        for (const [c, r] of cellsOf(s.cur.type, s.cur.rot, s.cur.x, s.cur.y)) {
          if (r < 0) { end(); return; }
          s.grid[r][c] = CI[s.cur.type as Piece];
        }
        // Detect the T-spin on the INTACT board (piece placed, lines not yet
        // cleared) — the corner check must read pre-clear cell positions.
        const tspin = isTSpin();
        let cleared = 0;
        for (let r = ROWS - 1; r >= 0; r--) {
          if (s.grid[r].every((v: number) => v !== 0)) {
            s.grid.splice(r, 1);
            s.grid.unshift(Array(COLS).fill(0));
            cleared++;
            r++;
          }
        }
        if (cleared > 0) {
          s.lines += cleared;
          const difficult = cleared === 4 || tspin;
          const wasB2b = s.b2b; // B2B applies only if the *previous* clear was difficult too
          s.combo++;
          const perfect = isPerfectClear(s.grid);
          const g = computeGarbage(cleared, tspin, s.b2b, s.combo, perfect); // Tetrio attack
          s.b2b = difficult;
          // Cancel incoming garbage 1:1 before stacking the remainder on them.
          const cancel = Math.min(g, s.incoming);
          s.incoming -= cancel;
          const net = g - cancel;
          // My clears only drain the opponent's clock (never grow mine), so the
          // match always converges. Time drain scales with the *attack* value
          // (Tetrio-weighted), separate from the net garbage that stacks.
          if (g > 0) {
            s.dealt += SEC_PER_ATTACK * g; // score = seconds drained from the opponent
            // 1:1 attack motion: a projectile flies my board → opponent's. (In the
            // arena the projectiles are driven by the server's tetris:attack events.)
            if (p.showOpp) s.projectiles.push({ fx: BX + BW / 2, fy: BY + GH / 2, tx: OX + (COLS * OC) / 2, ty: OY + (ROWS * OC) / 2, t: 0, dur: 420, color: 0x22d3ee });
            p.onClear?.(g, net);
          }
          // Clear-type callout (Tetrio-style): tells you what you pulled off + the
          // attack you sent — so a T-spin/tetris/combo reads as a deliberate hit.
          const TYPE = tspin
            ? `T-SPIN ${["", "SINGLE", "DOUBLE", "TRIPLE"][cleared] ?? ""}`.trim()
            : (["", "SINGLE", "DOUBLE", "TRIPLE", "TETRIS"][cleared] ?? "");
          const mods: string[] = [];
          if (difficult && wasB2b) mods.push("B2B");
          if (s.combo >= 1) mods.push(`${s.combo} COMBO`);
          if (perfect) mods.push("PERFECT CLEAR");
          if (net > 0) mods.push(`+${net}`);
          s.clearBigT.setText(TYPE);
          s.clearBigT.setColor(perfect ? "#22C55E" : tspin ? "#C084FC" : cleared === 4 ? "#FDE047" : "#67E8F9");
          s.clearSubT.setText(mods.join(" · "));
          s.clearFade = 1400;
        } else {
          s.combo = -1;
          if (s.incoming > 0) { addGarbage(s.incoming); s.incoming = 0; }
        }
        p.onBoard?.(s.grid.map((row: number[]) => row.slice()), s.time / 1000);
        if (!s.over) spawn();
      };
      s.lockNow = lock; // update() calls this when the lock delay expires
      const move = (dx: number) => {
        if (!s.over && !collide(s.cur.type, s.cur.rot, s.cur.x + dx, s.cur.y)) {
          s.cur.x += dx;
          s.lockAcc = 0;
          s.spin = false;
        }
      };
      const rotate = (dir: 1 | -1) => {
        if (s.over || s.cur.type === "O") return;
        const from = s.cur.rot;
        const to = (from + (dir === 1 ? 1 : 3)) % 4;
        const kicks = (s.cur.type === "I" ? KICK_I : KICK_JLSTZ)[`${from}${to}`] ?? [[0, 0]];
        for (const [kx, ky] of kicks) {
          if (!collide(s.cur.type, to, s.cur.x + kx, s.cur.y + ky)) {
            s.cur.rot = to;
            s.cur.x += kx;
            s.cur.y += ky;
            s.lockAcc = 0;
            s.spin = true;
            return;
          }
        }
      };
      const rotate180 = () => {
        if (s.over || s.cur.type === "O") return;
        const to = (s.cur.rot + 2) % 4;
        for (const [kx, ky] of [[0, 0], [0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [-1, -1]]) {
          if (!collide(s.cur.type, to, s.cur.x + kx, s.cur.y + ky)) {
            s.cur.rot = to;
            s.cur.x += kx;
            s.cur.y += ky;
            s.lockAcc = 0;
            s.spin = true;
            return;
          }
        }
      };
      const hardDrop = () => {
        if (s.over) return;
        while (canDown()) s.cur.y += 1;
        lock();
      };
      const holdSwap = () => {
        if (s.over || s.holdUsed) return;
        const cur = s.cur.type;
        if (s.hold) {
          const h = s.hold;
          s.hold = cur;
          s.cur = { type: h, rot: 0, x: 3, y: -1 };
          s.spin = false;
          if (collide(h, 0, 3, -1)) { end(); return; }
        } else {
          s.hold = cur;
          spawn();
        }
        s.holdUsed = true;
        s.lockAcc = 0;
      };
      // 결정전 handicap: pre-stack N garbage rows (one shared hole) from the bottom.
      const seed = Math.min(ROWS - 4, Math.max(0, Math.floor(p.startGarbage ?? 0)));
      if (seed > 0) {
        const hole = Math.floor(Math.random() * COLS);
        for (let i = 0; i < seed; i++) {
          const row = Array(COLS).fill(8);
          row[hole] = 0;
          s.grid[ROWS - 1 - i] = row;
        }
      }
      spawn();

      const kb = s.input.keyboard;
      kb.addCapture(["LEFT", "RIGHT", "DOWN", "UP", "SPACE", "Z", "X", "A", "C", "SHIFT"]);
      s.keyDown = kb.addKey("DOWN");
      kb.on("keydown-LEFT", () => { move(-1); s.das = { dir: -1, t: 0, charged: false }; });
      kb.on("keydown-RIGHT", () => { move(1); s.das = { dir: 1, t: 0, charged: false }; });
      kb.on("keyup-LEFT", () => { if (s.das.dir === -1) s.das.dir = 0; });
      kb.on("keyup-RIGHT", () => { if (s.das.dir === 1) s.das.dir = 0; });
      kb.on("keydown-UP", () => rotate(1));
      kb.on("keydown-X", () => rotate(1));
      kb.on("keydown-Z", () => rotate(-1));
      kb.on("keydown-A", () => rotate180());
      kb.on("keydown-SPACE", () => hardDrop());
      kb.on("keydown-C", () => holdSwap());
      kb.on("keydown-SHIFT", () => holdSwap());
      // Consumable item (E): one use per game, effect by type.
      kb.addCapture(["E"]);
      kb.on("keydown-E", () => {
        if (s.over || s.itemUsed || !p.item) return;
        s.itemUsed = true;
        if (p.item === "iblock") { for (let i = 0; i < 3 && i < s.next.length; i++) s.next[i] = "I"; }
        else if (p.item === "time") s.time += 10000;
        else if (p.item === "reflect") s.reflectMs = 5000;
        s.itemFlash = 1200;
        if (s.itemFlashT) s.itemFlashT.setText(`${ITEM_LABEL[p.item] ?? p.item}!`);
        p.useItem?.(p.item);
      });

      // 결정전 arena: slot geometry, targeting input, projectile state.
      if (p.arena) {
        const A = p.arena;
        const mySide = A.fighters.find((f) => f.userId === A.meId)?.side;
        const others = A.fighters.filter((f) => f.userId !== A.meId);
        s.slots = others.map((f: ArenaProp["fighters"][number], i: number) => ({
          f,
          x: AX + (i % ACOLS) * ASLOTW,
          y: AY + Math.floor(i / ACOLS) * ASLOTH,
        }));
        s.arenaCenter = (id: string) => {
          if (id === A.meId) return { x: BX + BW / 2, y: BY + GH / 2 };
          const sl = s.slots.find((x: any) => x.f.userId === id);
          return sl ? { x: sl.x + 5 * ACELL, y: sl.y + u(15) + 10 * ACELL } : null;
        };
        const enemies = () => {
          const st = A.stateRef.current;
          return A.fighters.filter((f) => f.side !== mySide && !st.dead[f.userId]);
        };
        kb.addCapture(["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "TAB"]);
        ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT"].forEach((k, i) =>
          kb.on(`keydown-${k}`, () => {
            const e = enemies()[i];
            if (e) A.onSetTarget(e.userId);
          }),
        );
        kb.on("keydown-TAB", () => {
          const e = enemies();
          if (!e.length) return;
          const cur = A.stateRef.current.targets[A.meId];
          const idx = e.findIndex((x) => x.userId === cur);
          A.onSetTarget(e[(idx + 1) % e.length].userId);
        });
        s.input.on("pointerdown", (ptr: any) => {
          for (const sl of s.slots) {
            const bx = sl.x;
            const by = sl.y + u(15);
            if (ptr.x >= bx && ptr.x <= bx + 10 * ACELL && ptr.y >= by && ptr.y <= by + 20 * ACELL) {
              if (sl.f.side !== mySide && !A.stateRef.current.dead[sl.f.userId]) A.onSetTarget(sl.f.userId);
              return;
            }
          }
        });
      }

      s.g = s.add.graphics();
      // Score comparison header, centered directly above my board: my drained-
      // seconds on the left (cyan), opponent's on the right (red), with a
      // tug-of-war bar between them (drawn in scoreBar) for at-a-glance compare.
      s.meScore = s.add.text(BX, u(44), "", { fontFamily: PIXEL, fontSize: font(15), fontStyle: "bold", color: "#67E8F9" }).setOrigin(0, 0.5);
      s.opScore = s.add.text(BX + BW, u(44), "", { fontFamily: PIXEL, fontSize: font(15), fontStyle: "bold", color: "#FCA5A5" }).setOrigin(1, 0.5);
      // Remaining seconds, sitting on top of the vertical time gauge.
      s.gaugeSec = s.add.text(GX + GW / 2, BY - u(6), "", { fontFamily: ARCADE, fontSize: font(11), color: "#FDE047" }).setOrigin(0.5, 1);
      s.oppInfo = s.add.text(OX, OY - u(6), "", { fontFamily: PIXEL, fontSize: font(11), color: "#9AA0AD" }).setOrigin(0, 1);
      s.oppWait = s.add.text(OX + (COLS * OC) / 2, OY + (ROWS * OC) / 2, "", { fontFamily: PIXEL, fontSize: font(11), color: "#6A707E", align: "center" }).setOrigin(0.5).setVisible(false);
      s.statText = s.add.text(boardMidX, BY + ROWS * CELL + u(14), "", { fontFamily: PIXEL, fontSize: font(12), color: "#9AD8E8" }).setOrigin(0.5);
      s.reviveText = s.add.text(boardMidX, BY + (ROWS * CELL) / 2, "REVIVE", { fontFamily: ARCADE, fontSize: font(22), color: "#FF6B8A" }).setOrigin(0.5).setVisible(false);
      // Clear-type callout (near the board top), fades after each line clear.
      s.clearBigT = s.add.text(boardMidX, BY + u(46), "", { fontFamily: ARCADE, fontSize: font(15), color: "#67E8F9", align: "center" }).setOrigin(0.5).setVisible(false);
      s.clearSubT = s.add.text(boardMidX, BY + u(66), "", { fontFamily: PIXEL, fontSize: font(12), fontStyle: "bold", color: "#FCA5A5", align: "center" }).setOrigin(0.5).setVisible(false);
      if (p.item) {
        // The slot panel (icon+name+desc+state) is a crisp React overlay; here we
        // only draw the big centered flash on use.
        s.itemFlashT = s.add.text(boardMidX, BY + (ROWS * CELL) / 2 - u(34), "", { fontFamily: ARCADE, fontSize: font(18), color: "#67E8F9" }).setOrigin(0.5).setVisible(false);
      }
      if (p.arena) {
        s.arenaTitle = s.add.text(AX, u(64), "숫자키/클릭=타깃 · Tab=순환", { fontFamily: PIXEL, fontSize: font(10), color: "#67E8F9" }).setOrigin(0, 0);
        for (const sl of s.slots) {
          sl.nameT = s.add.text(sl.x, sl.y, "", { fontFamily: PIXEL, fontSize: font(9), color: "#C4C8D2" }).setOrigin(0, 0);
          sl.infoT = s.add.text(sl.x, sl.y + u(15) + 20 * ACELL + u(1), "", { fontFamily: PIXEL, fontSize: font(9), color: "#9AA0AD" }).setOrigin(0, 0);
        }
      }

      // --- drawing ---
      const box = (g: any, x: number, y: number, w: number, h: number) => {
        g.fillStyle(0x0b0e16, 0.92);
        g.fillRect(x, y, w, h);
        g.lineStyle(u(2), 0x2a303c, 1);
        g.strokeRect(x, y, w, h);
      };
      const cell = (g: any, x: number, y: number, ci: number, size: number) => {
        if (!ci) return;
        g.fillStyle(COLORS[ci], 1);
        g.fillRect(x + 1, y + 1, size - 2, size - 2);
        g.fillStyle(0xffffff, 0.14);
        g.fillRect(x + 1, y + 1, size - 2, u(2));
      };
      // Tug-of-war score bar above the board: cyan (me) vs red (opponent),
      // split by each side's share of the total drained-seconds.
      const scoreBar = (g: any) => {
        const by = u(56);
        const bh = u(13);
        const total = s.dealt + s.oppDealt;
        const frac = total > 0 ? s.dealt / total : 0.5;
        g.fillStyle(0x0b0e16, 0.92);
        g.fillRect(BX, by, BW, bh);
        g.fillStyle(0x22d3ee, 1);
        g.fillRect(BX + u(1), by + u(1), (BW - u(2)) * frac, bh - u(2));
        g.fillStyle(0xf87171, 1);
        g.fillRect(BX + u(1) + (BW - u(2)) * frac, by + u(1), (BW - u(2)) * (1 - frac), bh - u(2));
        g.lineStyle(u(2), 0x2a303c, 1);
        g.strokeRect(BX, by, BW, bh);
        // center tick
        g.lineStyle(u(1), 0xffffff, 0.5);
        g.lineBetween(boardMidX, by, boardMidX, by + bh);
      };
      // Vertical time gauge, full board height, hugging the board's right edge —
      // drains from the top, green → yellow → red as it empties.
      const timeGauge = (g: any) => {
        const frac = Math.max(0, Math.min(1, s.time / startMs));
        const col = frac > 0.5 ? 0x22c55e : frac > 0.2 ? 0xfacc15 : 0xef4444;
        g.fillStyle(0x0b0e16, 0.92);
        g.fillRect(GX, BY, GW, GH);
        const fh = frac * GH;
        if (fh > 0) {
          g.fillStyle(col, 1);
          g.fillRect(GX + u(1), BY + GH - fh + u(1), GW - u(2), Math.max(0, fh - u(2)));
        }
        g.lineStyle(u(2), 0x2a303c, 1);
        g.strokeRect(GX, BY, GW, GH);
      };
      // 결정전 arena: every other fighter's small board + target highlight + the
      // attack projectiles flying between boards.
      const drawArena = (g: any) => {
        const A = p.arena!;
        const st = A.stateRef.current;
        const mySide = A.fighters.find((f) => f.userId === A.meId)?.side;
        const myTarget = st.targets[A.meId];
        const enemyOrder = A.fighters.filter((f) => f.side !== mySide && !st.dead[f.userId]).map((f) => f.userId);
        for (const sl of s.slots) {
          const bx = sl.x;
          const by = sl.y + u(15);
          const bw = 10 * ACELL;
          const bh = 20 * ACELL;
          const dead = !!st.dead[sl.f.userId];
          const isEnemy = sl.f.side !== mySide;
          const isTarget = sl.f.userId === myTarget;
          g.fillStyle(0x0b0e16, dead ? 0.5 : 0.92);
          g.fillRect(bx, by, bw, bh);
          const border = dead ? 0x3a3f4a : isTarget ? 0xfde047 : isEnemy ? 0xf87171 : 0x38bdf8;
          g.lineStyle(isTarget ? u(3) : u(2), border, 1);
          g.strokeRect(bx, by, bw, bh);
          const bd = st.boards[sl.f.userId];
          if (bd && !dead) for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (bd.grid[r]?.[c]) cell(g, bx + c * ACELL, by + r * ACELL, bd.grid[r][c], ACELL);
          const num = isEnemy && !dead ? enemyOrder.indexOf(sl.f.userId) : -1;
          sl.nameT.setText(`${num >= 0 ? `${num + 1}. ` : ""}${sl.f.name}`.slice(0, 12));
          sl.nameT.setColor(isTarget ? "#FDE047" : isEnemy ? "#FCA5A5" : "#9AD8E8");
          sl.infoT.setText(dead ? "OUT" : `${bd ? Math.ceil(Math.max(0, bd.seconds)) : "?"}s`);
        }
      };
      // Attack motion — a bright dot streaking from attacker board → target board.
      const drawProjectiles = (g: any) => {
        for (const pr of s.projectiles) {
          const t = Math.min(1, pr.t / pr.dur);
          const x = pr.fx + (pr.tx - pr.fx) * t;
          const y = pr.fy + (pr.ty - pr.fy) * t;
          g.fillStyle(pr.color, 0.9);
          g.fillCircle(x, y, u(6));
          g.fillStyle(0xffffff, 0.75);
          g.fillCircle(x, y, u(3));
        }
      };
      s.draw = () => {
        const g = s.g;
        g.clear();
        if (p.showOpp) scoreBar(g); // score compare only matters vs an opponent
        timeGauge(g);
        if (p.arena) drawArena(g);
        box(g, BX - u(3), BY - u(3), COLS * CELL + u(6), ROWS * CELL + u(6));
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) cell(g, BX + c * CELL, BY + r * CELL, s.grid[r][c], CELL);
        if (s.cur && !s.over) {
          let gy = s.cur.y;
          while (!collide(s.cur.type, s.cur.rot, s.cur.x, gy + 1)) gy++;
          const ci = CI[s.cur.type as Piece];
          for (const [c, r] of SHAPES[s.cur.type as Piece][s.cur.rot]) {
            if (gy + r >= 0) {
              g.lineStyle(u(1), COLORS[ci], 0.45);
              g.strokeRect(BX + (s.cur.x + c) * CELL + 1, BY + (gy + r) * CELL + 1, CELL - 2, CELL - 2);
            }
          }
          for (const [c, r] of SHAPES[s.cur.type as Piece][s.cur.rot]) if (s.cur.y + r >= 0) cell(g, BX + (s.cur.x + c) * CELL, BY + (s.cur.y + r) * CELL, ci, CELL);
        }
        // incoming-garbage warning bar (right edge of my board)
        if (s.incoming > 0) {
          const gh = Math.min(ROWS, s.incoming) * CELL;
          g.fillStyle(0xef4444, 0.85);
          // Incoming-garbage warning hugs the *left* edge (time gauge is on the right).
          g.fillRect(BX - u(9), BY + ROWS * CELL - gh, u(5), gh);
        }
        const mini = (type: Piece | null, mx: number, my: number) => {
          box(g, mx, my, u(56), u(44));
          if (type) for (const [c, r] of SHAPES[type][0]) cell(g, mx + u(7) + c * u(10), my + u(9) + r * u(10), CI[type], u(10));
        };
        mini(s.hold, u(24), BY);
        s.next.slice(0, 3).forEach((t: Piece, i: number) => mini(t, BX + COLS * CELL + u(24), BY + i * u(50)));
        const secLeft = Math.ceil(Math.max(0, s.time) / 1000);
        const gfrac = Math.max(0, Math.min(1, s.time / startMs));
        s.gaugeSec.setColor(gfrac > 0.5 ? "#22c55e" : gfrac > 0.2 ? "#facc15" : "#ef4444");
        s.gaugeSec.setText(`${secLeft}s`);
        s.statText.setText(`${s.lines}L${s.combo > 0 ? ` · ${s.combo} COMBO` : ""}${s.lives > 0 ? ` · 목숨 ${s.lives}` : ""}`);
        s.reviveText.setVisible(s.reviveFlash > 0);
        if (p.item) {
          // Publish live state to the React overlay panel; draw the use-flash.
          if (p.itemStatus) { p.itemStatus.used = s.itemUsed; p.itemStatus.reflectMs = Math.max(0, s.reflectMs); }
          s.itemFlashT.setVisible(s.itemFlash > 0);
        }
        // 공격 반사 aura around my board while active.
        if (s.reflectMs > 0) {
          g.lineStyle(u(4), 0x22d3ee, 0.85);
          g.strokeRect(BX - u(6), BY - u(6), BW + u(12), ROWS * CELL + u(12));
        }
        const opp = p.getOpp();
        if (p.showOpp) {
          // Score header (both sides) + always-present opponent panel.
          s.meScore.setText(`나 ${s.dealt}`);
          s.opScore.setText(`${s.oppDealt} 상대`);
          box(g, OX, OY, COLS * OC, ROWS * OC);
          if (opp) {
            for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (opp.grid[r]?.[c]) cell(g, OX + c * OC, OY + r * OC, opp.grid[r][c], OC);
            s.oppInfo.setText(`상대 · ${opp.name} · ${Math.ceil(Math.max(0, opp.seconds))}s`);
          } else {
            s.oppWait.setText("상대\n대기중…");
            s.oppInfo.setText("상대");
          }
          s.oppWait.setVisible(!opp);
        } else {
          s.meScore.setText("");
          s.opScore.setText("");
          s.oppInfo.setText("");
          s.oppWait.setVisible(false);
        }
        drawProjectiles(g); // on top of everything
      };
      s.draw();
    },
    update: function (this: any, _t: number, dt: number) {
      const s = this;
      if (s.reviveFlash > 0) s.reviveFlash -= dt;
      if (s.reflectMs > 0) s.reflectMs -= dt;
      if (s.itemFlash > 0) s.itemFlash -= dt;
      if (s.clearFade > 0) {
        s.clearFade -= dt;
        const a = Math.max(0, Math.min(1, s.clearFade / 400)); // hold, then fade last 400ms
        s.clearBigT.setAlpha(a).setVisible(s.clearFade > 0);
        s.clearSubT.setAlpha(a).setVisible(s.clearFade > 0 && s.clearSubT.text.length > 0);
      } else {
        s.clearBigT.setVisible(false);
        s.clearSubT.setVisible(false);
      }
      if (p.arena) {
        // Spawn a projectile for each new server attack event (arena).
        const st = p.arena.stateRef.current;
        for (const a of st.attacks) {
          if (a.seq > s.seenSeq) {
            const from = s.arenaCenter(a.from);
            const to = s.arenaCenter(a.to);
            if (from && to) s.projectiles.push({ fx: from.x, fy: from.y, tx: to.x, ty: to.y, t: 0, dur: 420, color: a.from === p.arena.meId ? 0x22d3ee : 0xf87171 });
          }
        }
        if (st.attacks.length) s.seenSeq = Math.max(s.seenSeq, st.attacks[st.attacks.length - 1].seq);
      }
      s.projectiles = s.projectiles.filter((pr: any) => (pr.t += dt) < pr.dur);
      if (!s.over) {
        s.time -= dt;
        const dd = p.drainDelta(); // opponent's clears drain my clock (negative)
        s.time += dd * 1000;
        if (dd < 0) {
          s.oppDealt += -dd; // mirror score: seconds the opponent drained from me
          // 1:1 attack motion: opponent's board → mine when they hit me.
          if (p.showOpp) s.projectiles.push({ fx: OX + (COLS * OC) / 2, fy: OY + (ROWS * OC) / 2, tx: BX + BW / 2, ty: BY + GH / 2, t: 0, dur: 420, color: 0xf87171 });
        }
        s.incoming += p.drainGarbage(); // opponent's clears queue garbage on me
        if (s.time <= 0) { s.time = 0; s.over = true; p.onGameOver(s.lines); }
        // DAS auto-repeat
        if (s.das.dir !== 0 && !s.over) {
          s.das.t += dt;
          const delay = s.das.charged ? 40 : 150;
          if (s.das.t >= delay) {
            s.das.t = 0;
            s.das.charged = true;
            if (!s.collide(s.cur.type, s.cur.rot, s.cur.x + s.das.dir, s.cur.y)) { s.cur.x += s.das.dir; s.lockAcc = 0; s.spin = false; }
          }
        }
        // gravity + lock
        if (!s.over) {
          const soft = s.keyDown.isDown;
          s.dropAcc += dt;
          if (s.dropAcc >= (soft ? 45 : s.dropInterval)) {
            s.dropAcc = 0;
            if (!s.collide(s.cur.type, s.cur.rot, s.cur.x, s.cur.y + 1)) { s.cur.y += 1; s.spin = false; }
          }
          if (s.collide(s.cur.type, s.cur.rot, s.cur.x, s.cur.y + 1)) {
            s.lockAcc += dt;
            if (s.lockAcc >= 500) s.lockNow();
          } else s.lockAcc = 0;
        }
      }
      s.draw();
    },
  } as any;
}

/** Full-screen Tetris time-attack. Solo = pure practice; multiplayer feeds an
 *  opponent board + drain/garbage via refs. */
export function TetrisGame({ by, startSeconds = 60, getOpponent, deltaRef, garbageRef, startGarbage = 0, lives = 0, onClear, onBoard, onGameOver, onSurrender, arena, item, onUseItem, onClose }: TetrisGameProps) {
  const ref = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);
  const [over, setOver] = useState<{ lines: number } | null>(null);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  // Live item state published by the scene; a light ticker refreshes the panel.
  const itemStatusRef = useRef({ used: false, reflectMs: 0 });
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!item) return;
    const id = setInterval(() => setTick((t) => t + 1), 150);
    return () => clearInterval(id);
  }, [item]);

  useEffect(() => {
    let cancelled = false;
    let game: any;
    (async () => {
      const Phaser = (await import("phaser")).default;
      if (cancelled || !ref.current) return;
      const ss = Math.min(3, Math.max(2, Math.round(window.devicePixelRatio || 1)));
      const scene: any = tetrisScene(ss, {
        startSeconds,
        startGarbage,
        lives,
        showOpp: !!getOpponent,
        arena,
        item,
        useItem: onUseItem,
        itemStatus: itemStatusRef.current,
        onClear,
        onBoard,
        getOpp: () => getOpponent?.() ?? null,
        drainDelta: () => {
          const d = deltaRef?.current ?? 0;
          if (deltaRef) deltaRef.current = 0;
          return d;
        },
        drainGarbage: () => {
          const d = garbageRef?.current ?? 0;
          if (garbageRef) garbageRef.current = 0;
          return d;
        },
        onGameOver: (lines) => {
          if (doneRef.current) return;
          doneRef.current = true;
          setOver({ lines });
          onGameOver(lines);
        },
      });
      game = new Phaser.Game({
        type: Phaser.CANVAS,
        width: (arena ? 720 : 560) * ss, // arena needs room for the fighter grid
        height: 470 * ss,
        parent: ref.current,
        transparent: true,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        render: { antialias: true, roundPixels: false },
        scene,
      });
    })();
    return () => {
      cancelled = true;
      if (game) game.destroy(true);
    };
  }, [startSeconds, startGarbage, lives, getOpponent, deltaRef, garbageRef, arena, item, onUseItem, onClear, onBoard, onGameOver]);

  const giveUp = () => {
    setConfirmGiveUp(false);
    if (doneRef.current) return;
    doneRef.current = true;
    if (onSurrender) onSurrender();
    else { setOver({ lines: 0 }); onGameOver(0); }
  };

  // Esc → ask to surrender (confirm dialog). Ignored once the game is over.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !doneRef.current) {
        e.preventDefault();
        setConfirmGiveUp((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const CONTROLS: [string, string][] = [
    ["← →", "이동"],
    ["↓", "소프트 드롭"],
    ["Space", "하드 드롭"],
    ["Z / X", "회전"],
    ["A", "180° 회전"],
    ["C / Shift", "홀드"],
    ...(item ? ([["E", "아이템 사용"]] as [string, string][]) : []),
    ...(arena ? ([["1~9", "타깃 지정"], ["Tab", "타깃 순환"]] as [string, string][]) : []),
    ["Esc", "항복"],
  ];

  return (
    <div className="fixed inset-0 z-[200] overflow-hidden">
      <RetroBackdrop phase={over ? "lose" : "play"} calm seed={startSeconds} />
      {/* 항복 (surrender) — button + Esc, both open the confirm dialog. */}
      {!over && (
        <button
          type="button"
          onClick={() => setConfirmGiveUp(true)}
          className="fixed right-4 top-4 z-[202]"
          style={{ fontFamily: ARCADE, fontSize: 11, color: "#FFD0C8", background: "#2A1114", border: "2px solid #000", boxShadow: "2px 2px 0 #000", padding: "7px 10px", cursor: "pointer" }}
        >
          항복 (Esc)
        </button>
      )}
      <div className="grid h-full place-items-center">
        <div className="flex flex-col items-center gap-2 select-none">
          <DuelTitle />
          <div style={{ fontFamily: PIXEL, fontSize: 12, color: "#9AD8E8" }}>{by}</div>
          <div className="flex items-start gap-4">
            {/* Left column, top-aligned with the board: 아이템 HUD (위) + 조작법. */}
            <div className="hidden shrink-0 flex-col gap-3 sm:flex" style={{ width: 210 }}>
              {/* 아이템 슬롯 — 아이콘 + 명칭 + 설명 + 상태 (준비/발동중/사용됨). */}
              {item && (() => {
                const st = itemStatusRef.current;
                const active = st.reflectMs > 0;
                const border = active ? "#22D3EE" : st.used ? "#3A3F4A" : "#6366F1";
                const Icon = ITEM_ICON[item] ?? Blocks;
                return (
                  <div style={{ background: "rgba(9,12,20,.92)", border: `3px solid ${border}`, boxShadow: `3px 3px 0 #000${active ? ", 0 0 18px rgba(34,211,238,.55)" : ""}`, padding: "10px 12px" }}>
                    <div style={{ fontFamily: PIXEL, fontSize: 10, color: "#8A8F9C" }}>아이템 · [E] 사용</div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="grid size-8 shrink-0 place-items-center" style={{ background: "#0E1117", border: `2px solid ${border}` }}>
                        <Icon className="size-[18px]" style={{ color: active ? "#67E8F9" : st.used ? "#6A707E" : "#A5B4FC" }} />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate" style={{ fontFamily: PIXEL, fontSize: 14, fontWeight: 700, color: st.used && !active ? "#8A8F9C" : "#fff" }}>{ITEM_LABEL[item] ?? item}</div>
                        <div style={{ fontFamily: PIXEL, fontSize: 10, fontWeight: 700, color: active ? "#67E8F9" : st.used ? "#6A707E" : "#A5B4FC" }}>
                          {active ? `발동 중 ${Math.ceil(st.reflectMs / 1000)}s` : st.used ? "사용됨" : "사용 가능"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-1.5" style={{ fontFamily: PIXEL, fontSize: 10, lineHeight: 1.35, color: "#9AD8E8" }}>{ITEM_DESC[item] ?? ""}</div>
                  </div>
                );
              })()}
              {/* 조작법 — one control per line. */}
              <div style={{ background: "rgba(9,12,20,.85)", border: "3px solid #000", boxShadow: "4px 4px 0 rgba(0,0,0,.5)", padding: "16px 14px" }}>
                <div style={{ fontFamily: ARCADE, fontSize: 12, color: "#67E8F9", textShadow: "2px 2px 0 #000", marginBottom: 8 }}>조작법</div>
                <div className="flex flex-col gap-2">
                  {CONTROLS.map(([k, d]) => (
                    <div key={k} className="flex items-center gap-2.5">
                      <span
                        className="text-center"
                        style={{ fontFamily: PIXEL, fontSize: 12, fontWeight: 700, color: "#FDE047", background: "#171B22", border: "2px solid #000", boxShadow: "2px 2px 0 #000", padding: "4px 7px", minWidth: 62 }}
                      >
                        {k}
                      </span>
                      <span style={{ fontFamily: PIXEL, fontSize: 12, color: "#C4C8D2" }}>{d}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div ref={ref} className={arena ? "h-[640px] w-[980px] max-w-[94vw]" : "h-[705px] w-[840px] max-w-[80vw]"} style={{ pointerEvents: "auto", background: "rgba(9,12,20,.85)", border: "3px solid #000", boxShadow: "4px 4px 0 rgba(0,0,0,.5)" }} />
          </div>
        </div>
        {confirmGiveUp && !over && (
          <div className="absolute inset-0 z-[204] grid place-items-center bg-black/60" onClick={() => setConfirmGiveUp(false)}>
            <div
              className="flex flex-col items-center gap-4 px-9 py-7 text-center"
              onClick={(e) => e.stopPropagation()}
              style={{ background: "#0E1117", border: "4px solid #F87171", boxShadow: "6px 6px 0 #000, 0 0 28px rgba(248,113,113,.4)", animation: "slam .3s steps(4) both" }}
            >
              <div style={{ fontFamily: ARCADE, fontSize: 18, color: "#FFD0C8", textShadow: "3px 3px 0 #000" }}>항복하시겠습니까?</div>
              <div className="flex gap-2.5">
                <button type="button" onClick={giveUp} style={{ fontFamily: ARCADE, fontSize: 13, color: "#06121A", background: "#F87171", border: "3px solid #000", boxShadow: "3px 3px 0 #000", padding: "10px 20px", cursor: "pointer" }}>항복</button>
                <button type="button" onClick={() => setConfirmGiveUp(false)} style={{ fontFamily: ARCADE, fontSize: 13, color: "#C4C8D2", background: "#171B22", border: "3px solid #000", boxShadow: "3px 3px 0 #000", padding: "10px 20px", cursor: "pointer" }}>취소</button>
              </div>
            </div>
          </div>
        )}
        {over && (
          <div className="absolute inset-0 grid place-items-center bg-black/70" onClick={onClose}>
            <div className="flex flex-col items-center gap-2.5" style={{ animation: "slam .5s steps(4) both" }}>
              <div style={{ fontFamily: ARCADE, fontSize: 32, color: "#F87171", textShadow: "4px 4px 0 #000" }}>GAME OVER</div>
              <div style={{ fontFamily: ARCADE, fontSize: 22, color: "#fff", textShadow: "3px 3px 0 #000" }}>{over.lines} LINES</div>
              <button type="button" onClick={onClose} style={{ marginTop: 8, fontFamily: ARCADE, fontSize: 13, color: "#06121A", background: "#22D3EE", border: "3px solid #000", boxShadow: "3px 3px 0 #000", padding: "10px 18px", cursor: "pointer" }}>
                EXIT
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
