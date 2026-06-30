/* Phaser's lazy-loaded plain-object scene is untyped here — `this` is the live
   Scene and the API surface is `any`. Scoped to this file only. */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-this-alias */
import { useEffect, useRef } from "react";

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
  /** Completed the combo in time → reflect (escalate). */
  onParry?: (escalate: boolean) => void;
  /** Ran out of time → you're hit. */
  onHit?: () => void;
  onDone: () => void;
};

// Logical design size; the canvas renders at `ss`× this for crisp text on HiDPI.
const VW = 460;
const VH = 320;
const DIRS = ["U", "D", "L", "R"] as const;

// lucide arrow icon path data (ArrowUp / Down / Left / Right) — drawn as proper
// icons (rasterized SVG textures), tinted per progress state.
const ARROW_PATHS: Record<string, string> = {
  U: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  D: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  L: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  R: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
};
// Per-state arrow colors. The Canvas renderer can't tint images, so we bake the
// color into separate textures and swap with setTexture: d=대기, w=현재, g=통과, r=오답.
const ARROW_COLORS: Record<string, string> = {
  d: "#5a6070",
  w: "#ffffff",
  g: "#4ade80",
  r: "#f87171",
};
function arrowSvgUri(dir: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${ARROW_PATHS[dir]}</svg>`;
  // Phaser's loader decodes data URIs as base64 (atob), so it MUST be base64 —
  // a URL-encoded URI throws InvalidCharacterError. The SVG is ASCII, so btoa is safe.
  return "data:image/svg+xml;base64," + btoa(svg);
}

/**
 * Build a plain-object Phaser scene (no `extends`, so Phaser can be lazy-loaded).
 * `ss` = supersample factor: everything is sized × `ss` and the FIT scaler
 * downscales it, so text/icons stay sharp on high-DPI screens.
 */
function makeComboScene(ss: number, p: { level: number; perStack: number; by: string; onResult: (k: "parry" | "hit") => void }) {
  const lv = Math.max(0, Math.floor(p.level));
  const N = Math.min(10, 3 + lv); // combo length grows with difficulty
  const T = Math.max(800, 2600 / Math.pow(1 + p.perStack, lv)); // total ms (철벽 ½ → more time)
  const W = VW * ss;
  const u = (n: number) => n * ss; // logical px → device px
  const font = (n: number) => `${n * ss}px`;
  const ICON = Math.round(34 * ss); // arrow texture raster size (device px)

  const RING_X = W / 2;
  const RING_Y = u(178);
  const RING_R = u(34);
  const RING_W = u(7);
  const ARROW_Y = u(96);

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

      s.add.text(W / 2, u(26), `${p.by}의 공격!`, { fontFamily: "sans-serif", fontSize: font(16), color: "#F5B942", fontStyle: "bold" }).setOrigin(0.5);
      s.add.text(W / 2, u(48), "화살표 순서대로! (틀리면 처음부터)", { fontFamily: "sans-serif", fontSize: font(11), color: "#9AA0AD" }).setOrigin(0.5);

      // --- combo arrows (lucide icon textures, recolored per progress) ---
      const gap = Math.min(u(46), (W - u(48)) / N);
      const startX = W / 2 - (gap * (N - 1)) / 2;
      s.arrows = s.seq.map((d: string, i: number) => s.add.image(startX + i * gap, ARROW_Y, `arr_${d}_d`).setOrigin(0.5));
      s.drawArrows = () => {
        s.arrows.forEach((img: any, i: number) => {
          const c = i < s.idx ? "g" : i === s.idx ? "w" : "d"; // 통과/현재/대기
          img.setTexture(`arr_${s.seq[i]}_${c}`);
          img.setScale(i === s.idx ? 1.25 : 1);
        });
      };
      s.drawArrows();

      // Retro pixel burst (square shrapnel, 8-bit palette) — green on hit, red on miss.
      const GREEN = [0x4ade80, 0x86efac, 0xbbf7d0, 0xffffff, 0x22d3ee];
      const RED = [0xf87171, 0xfca5a5, 0xfecaca, 0xffffff, 0xfb923c];
      s.burst = (bx: number, by: number, pal: number[]) => {
        const n = 12;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5;
          const dist = u(18) + Math.random() * u(30);
          const sz = u(4) + Math.floor(Math.random() * u(4));
          const sq = s.add.rectangle(bx, by, sz, sz, pal[Math.floor(Math.random() * pal.length)]).setAngle(Math.floor(Math.random() * 4) * 45);
          s.tweens.add({
            targets: sq,
            x: bx + Math.cos(ang) * dist,
            y: by + Math.sin(ang) * dist,
            alpha: 0,
            scale: 0.2,
            angle: sq.angle + 90,
            duration: 320 + Math.random() * 200,
            ease: "Cubic.easeOut",
            onComplete: () => sq.destroy(),
          });
        }
      };

      // --- circular countdown timer ---
      s.timerG = s.add.graphics();
      s.timeText = s.add.text(RING_X, RING_Y, "", { fontFamily: "sans-serif", fontSize: font(15), color: "#EDEAE2", fontStyle: "bold" }).setOrigin(0.5);
      s.fb = s.add.text(W / 2, u(236), "", { fontFamily: "sans-serif", fontSize: font(20), fontStyle: "bold" }).setOrigin(0.5);

      const resolve = (kind: "parry" | "hit") => {
        if (s.done) return;
        s.done = true;
        s.fb.setText(kind === "parry" ? "✓ 반격!" : "✕ 피격").setColor(kind === "parry" ? "#4ADE80" : "#F87171");
        p.onResult(kind);
      };
      s.resolve = resolve;

      const press = (d: string) => {
        if (s.done) return;
        if (d === s.seq[s.idx]) {
          s.burst(startX + s.idx * gap, ARROW_Y, GREEN); // 정답 → 녹색 파티클
          s.idx += 1;
          s.drawArrows();
          if (s.idx >= N) resolve("parry");
        } else {
          // 틀림: 통과했던 화살표를 붉게 번쩍 → "처음부터"임을 인지시킴.
          const wrong = s.idx;
          s.arrows.forEach((img: any, i: number) => {
            if (i <= wrong) {
              img.setTexture(`arr_${s.seq[i]}_r`); // 붉게
              img.setScale(1);
            }
          });
          s.burst(startX + wrong * gap, ARROW_Y, RED);
          s.cameras.main.shake(130, 0.015);
          s.fb.setText("✕ 틀림 — 처음부터!").setColor("#F87171");
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

      // --- on-screen pads (touch / click): rounded box + arrow icon ---
      const padY = u(284);
      const padW = u(56);
      const padH = u(42);
      const pad = (x: number, d: string) => {
        const r = s.add.rectangle(x, padY, padW, padH, 0x1b1f27).setStrokeStyle(u(1), 0x2a303c).setInteractive({ useHandCursor: true });
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

/** Phaser arrow-combo parry mini-game — the "콤보 러시" alternative to the timing bar. */
export function ComboRushEffect({ attackKey, by, parryable = true, level = 0, perStack = 0.1, quick = false, onParry, onHit, onDone }: ComboRushEffectProps) {
  const ref = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    // Non-parryable (rare for combo) → brief beat, then dismiss.
    if (!parryable) {
      const t = setTimeout(onDone, 1100);
      return () => clearTimeout(t);
    }
    let cancelled = false;
    let game: any;
    const finish = (kind: "parry" | "hit") => {
      if (doneRef.current) return;
      doneRef.current = true;
      if (kind === "parry") onParry?.(true);
      else onHit?.();
      setTimeout(() => !cancelled && onDone(), quick ? (kind === "parry" ? 320 : 700) : 650);
    };
    (async () => {
      const Phaser = (await import("phaser")).default;
      if (cancelled || !ref.current) return;
      // Render at devicePixelRatio (min 2×) so text/icons aren't blurry on HiDPI.
      const ss = Math.min(3, Math.max(2, Math.round(window.devicePixelRatio || 1)));
      game = new Phaser.Game({
        type: Phaser.CANVAS, // canvas (not WebGL) — avoids context churn across short rounds
        width: VW * ss,
        height: VH * ss,
        parent: ref.current,
        transparent: true,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        render: { antialias: true, roundPixels: false },
        scene: makeComboScene(ss, { level, perStack, by, onResult: finish }),
      });
    })();
    return () => {
      cancelled = true;
      if (game) game.destroy(true);
    };
  }, [attackKey, parryable, level, perStack, quick, by, onParry, onHit, onDone]);

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75" onClick={(e) => e.stopPropagation()}>
      {parryable ? (
        <div ref={ref} className="h-[320px] w-[460px] max-w-[92vw]" />
      ) : (
        <div className="font-display text-[40px] text-[#F87171]">DUEL!!</div>
      )}
    </div>
  );
}
