/* Phaser's lazy-loaded plain-object scene is untyped here — `this` is the live
   Scene and the API surface is `any`. Scoped to this file only. */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-this-alias */
import { useEffect, useRef, useState } from "react";

import { ARCADE, PIXEL, DuelTitle, RetroBackdrop, RetroSplash, type AttackItem } from "./duelChrome";

type ComboRushEffectProps = {
  attackKey: number;
  by: string;
  parryable?: boolean;
  /** Difficulty stack — longer + faster combo. */
  level?: number;
  /** Per-stack compound rate for the time limit (0.1 = 10%; 0.05 for 철벽 ½). */
  perStack?: number;
  /** Solo practice: the bot reflects immediately — shorten the post-result hold. */
  quick?: boolean;
  /** Solo practice: not under attack → calm backdrop instead of the red strobe. */
  calm?: boolean;
  /** Items scattered as retro shrapnel in the backdrop. */
  items?: AttackItem[];
  /** Completed the combo in time → reflect (escalate). */
  onParry?: (escalate: boolean) => void;
  /** Ran out of time → you're hit. */
  onHit?: () => void;
  onDone: () => void;
};

// Phaser canvas holds ONLY the game (arrows + timer + pads); the retro chrome
// (DUEL!! title, vignette, win/lose splash) is shared React — see duelChrome.
const VW = 460;
const VH = 280;
const DIRS = ["U", "D", "L", "R"] as const;

const ARROW_PATHS: Record<string, string> = {
  U: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  D: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  L: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  R: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
};
// Per-state arrow colors. The Canvas renderer can't tint images, so we bake the
// color into separate textures and swap with setTexture: d=대기, w=현재, g=통과, r=오답.
const ARROW_COLORS: Record<string, string> = { d: "#5a6070", w: "#ffffff", g: "#4ade80", r: "#f87171" };
function arrowSvgUri(dir: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${ARROW_PATHS[dir]}</svg>`;
  // Phaser's loader decodes data URIs as base64 (atob); a URL-encoded URI throws.
  return "data:image/svg+xml;base64," + btoa(svg);
}

function makeComboScene(ss: number, p: { level: number; perStack: number; onResult: (k: "parry" | "hit") => void }) {
  const lv = Math.max(0, Math.floor(p.level));
  const N = Math.min(10, 3 + lv);
  const T = Math.max(800, 2600 / Math.pow(1 + p.perStack, lv));
  const W = VW * ss;
  const u = (n: number) => n * ss;
  const font = (n: number) => `${n * ss}px`;
  const ICON = Math.round(34 * ss);

  const RING_X = W / 2;
  const RING_Y = u(132);
  const RING_R = u(34);
  const RING_W = u(7);
  const ARROW_Y = u(54);

  return {
    key: "combo",
    preload: function (this: any) {
      for (const d of DIRS)
        for (const c of Object.keys(ARROW_COLORS))
          this.load.svg(`arr_${d}_${c}`, arrowSvgUri(d, ARROW_COLORS[c]), { width: ICON, height: ICON });
    },
    create: function (this: any) {
      const s = this;
      s.seq = Array.from({ length: N }, () => DIRS[Math.floor(Math.random() * 4)]);
      s.idx = 0;
      s.remaining = T;
      s.done = false;

      const gap = Math.min(u(46), (W - u(48)) / N);
      const startX = W / 2 - (gap * (N - 1)) / 2;
      s.arrows = s.seq.map((d: string, i: number) => s.add.image(startX + i * gap, ARROW_Y, `arr_${d}_d`).setOrigin(0.5));
      s.drawArrows = () => {
        s.arrows.forEach((img: any, i: number) => {
          const c = i < s.idx ? "g" : i === s.idx ? "w" : "d";
          img.setTexture(`arr_${s.seq[i]}_${c}`);
          img.setScale(i === s.idx ? 1.25 : 1);
        });
      };
      s.drawArrows();

      // Retro pixel burst (square shrapnel) — green on hit, red on miss.
      const GREEN = [0x4ade80, 0x86efac, 0xbbf7d0, 0xffffff, 0x22d3ee];
      const RED = [0xf87171, 0xfca5a5, 0xfecaca, 0xffffff, 0xfb923c];
      s.burst = (bx: number, by: number, pal: number[]) => {
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2 + Math.random() * 0.5;
          const dist = u(18) + Math.random() * u(30);
          const sz = u(4) + Math.floor(Math.random() * u(4));
          const sq = s.add.rectangle(bx, by, sz, sz, pal[Math.floor(Math.random() * pal.length)]).setAngle(Math.floor(Math.random() * 4) * 45);
          s.tweens.add({ targets: sq, x: bx + Math.cos(ang) * dist, y: by + Math.sin(ang) * dist, alpha: 0, scale: 0.2, angle: sq.angle + 90, duration: 320 + Math.random() * 200, ease: "Cubic.easeOut", onComplete: () => sq.destroy() });
        }
      };

      s.timerG = s.add.graphics();
      s.timeText = s.add.text(RING_X, RING_Y, "", { fontFamily: "sans-serif", fontSize: font(15), color: "#EDEAE2", fontStyle: "bold" }).setOrigin(0.5);
      s.fb = s.add.text(W / 2, u(190), "", { fontFamily: "sans-serif", fontSize: font(15), fontStyle: "bold" }).setOrigin(0.5);

      const resolve = (kind: "parry" | "hit") => {
        if (s.done) return;
        s.done = true;
        p.onResult(kind);
      };
      s.resolve = resolve;

      const press = (d: string) => {
        if (s.done) return;
        if (d === s.seq[s.idx]) {
          s.burst(startX + s.idx * gap, ARROW_Y, GREEN);
          s.idx += 1;
          s.drawArrows();
          if (s.idx >= N) resolve("parry");
        } else {
          const wrong = s.idx;
          s.arrows.forEach((img: any, i: number) => {
            if (i <= wrong) {
              img.setTexture(`arr_${s.seq[i]}_r`);
              img.setScale(1);
            }
          });
          s.burst(startX + wrong * gap, ARROW_Y, RED);
          s.cameras.main.shake(130, 0.015);
          s.fb.setText("✕ 처음부터!").setColor("#F87171");
          s.idx = 0;
          s.time.delayedCall(320, () => {
            if (!s.done) {
              s.drawArrows();
              s.fb.setText("");
            }
          });
        }
      };

      const kb = s.input.keyboard;
      kb.on("keydown-UP", () => press("U"));
      kb.on("keydown-DOWN", () => press("D"));
      kb.on("keydown-LEFT", () => press("L"));
      kb.on("keydown-RIGHT", () => press("R"));

      const padY = u(244);
      const pad = (x: number, d: string) => {
        const r = s.add.rectangle(x, padY, u(56), u(42), 0x1b1f27).setStrokeStyle(u(1), 0x2a303c).setInteractive({ useHandCursor: true });
        s.add.image(x, padY, `arr_${d}_w`).setScale(0.62);
        r.on("pointerdown", () => press(d));
      };
      pad(W / 2 - u(93), "L");
      pad(W / 2 - u(31), "U");
      pad(W / 2 + u(31), "D");
      pad(W / 2 + u(93), "R");
    },
    update: function (this: any, _t: number, delta: number) {
      const s = this;
      if (!s.timerG) return;
      if (!s.done) s.remaining -= delta;
      const ratio = Math.max(0, Math.min(1, s.remaining / T));
      const color = ratio < 0.3 ? 0xf87171 : ratio < 0.6 ? 0xf5b942 : 0x6366f1;
      const g = s.timerG;
      g.clear();
      g.lineStyle(RING_W, 0x2a303c, 1);
      g.beginPath();
      g.arc(RING_X, RING_Y, RING_R, 0, Math.PI * 2);
      g.strokePath();
      if (ratio > 0) {
        const start = -Math.PI / 2;
        g.lineStyle(RING_W, color, 1);
        g.beginPath();
        g.arc(RING_X, RING_Y, RING_R, start, start + ratio * Math.PI * 2);
        g.strokePath();
      }
      if (s.timeText) s.timeText.setText((Math.max(0, s.remaining) / 1000).toFixed(1));
      if (!s.done && s.remaining <= 0) s.resolve("hit");
    },
  };
}

/** Phaser arrow-combo parry mini-game wrapped in the shared retro duel chrome. */
export function ComboRushEffect({ attackKey, by, parryable = true, level = 0, perStack = 0.1, quick = false, calm = false, items = [], onParry, onHit, onDone }: ComboRushEffectProps) {
  const ref = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);
  const [phase, setPhase] = useState<"play" | "win" | "lose">(parryable ? "play" : "lose");
  const lv = Math.max(0, Math.floor(level));

  useEffect(() => {
    if (!parryable) {
      const t = setTimeout(onDone, 1100);
      return () => clearTimeout(t);
    }
    let cancelled = false;
    let game: any;
    const finish = (kind: "parry" | "hit") => {
      if (doneRef.current) return;
      doneRef.current = true;
      setPhase(kind === "parry" ? "win" : "lose");
      if (kind === "parry") onParry?.(true);
      else onHit?.();
      setTimeout(() => !cancelled && onDone(), quick ? (kind === "parry" ? 320 : 700) : 650);
    };
    (async () => {
      const Phaser = (await import("phaser")).default;
      if (cancelled || !ref.current) return;
      const ss = Math.min(3, Math.max(2, Math.round(window.devicePixelRatio || 1)));
      game = new Phaser.Game({
        type: Phaser.CANVAS,
        width: VW * ss,
        height: VH * ss,
        parent: ref.current,
        transparent: true,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        render: { antialias: true, roundPixels: false },
        scene: makeComboScene(ss, { level, perStack, onResult: finish }),
      });
    })();
    return () => {
      cancelled = true;
      if (game) game.destroy(true);
    };
  }, [attackKey, parryable, level, perStack, quick, onParry, onHit, onDone]);

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden">
      <RetroBackdrop phase={phase} items={items} seed={attackKey} calm={calm} />
      <div className="grid h-full place-items-center">
        {/* Keep the play chrome (and Phaser canvas) mounted; hide it under the splash. */}
        <div className="flex flex-col items-center gap-3 select-none" style={{ display: phase === "play" ? undefined : "none" }}>
          <DuelTitle />
          <div className="-mt-2" style={{ fontFamily: PIXEL, fontSize: 15, fontWeight: 700, color: "#FFD0C8", textShadow: "2px 2px 0 #000" }}>
            {by}님의 공격!
          </div>
          <div className="flex items-center justify-center gap-2">
            <span style={{ fontFamily: ARCADE, fontSize: 22, color: "#FDE047", textShadow: "3px 3px 0 #000,0 0 14px rgba(253,224,71,.7)" }}>COMBO!</span>
            {lv > 0 && <span style={{ fontFamily: ARCADE, fontSize: 12, color: "#FF6B5A", textShadow: "2px 2px 0 #000" }}>LV.{lv}</span>}
          </div>
          <div style={{ fontFamily: PIXEL, fontSize: 13, color: "#fff", textShadow: "1px 1px 0 #000" }}>
            <span style={{ color: "#FDE047" }}>화살표 순서대로!</span> · <span style={{ color: "#FF8A7A" }}>틀리면 처음부터</span>
          </div>
          <div ref={ref} className="h-[280px] w-[460px] max-w-[92vw]" style={{ pointerEvents: "auto" }} />
          <div style={{ fontFamily: PIXEL, fontSize: 11, color: "#9AD8E8", animation: "blink 1s steps(1) infinite" }}>방향키 또는 탭</div>
        </div>
        {phase !== "play" && <RetroSplash phase={phase} by={by} sub={phase === "win" ? "콤보 성공 — 상대 차례!" : undefined} />}
      </div>
    </div>
  );
}
