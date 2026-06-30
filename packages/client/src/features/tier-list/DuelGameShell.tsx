/* The Phaser scene is untyped here (lazy-loaded). `any` is scoped to this file. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, type ReactNode } from "react";

import { ARCADE, PIXEL, DuelTitle, RetroBackdrop, RetroSplash, type AttackItem } from "./duelChrome";

/** Logical canvas size shared by every duel game; the FIT scaler downscales the
 *  supersampled (ss×) render so text/icons stay crisp. */
export const DUEL_VW = 460;
export const DUEL_VH = 280;

/** Each game reports its outcome once. `escalate` only matters on a win. */
export type DuelResult = (kind: "win" | "lose", escalate?: boolean) => void;
export type DuelSceneFactory = (ss: number, params: { level: number; perStack: number; onResult: DuelResult }) => any;

/** Props every concrete duel game (timing, combo, …) accepts. */
export type DuelGameProps = {
  attackKey: number;
  by: string;
  parryable?: boolean;
  level?: number;
  perStack?: number;
  quick?: boolean;
  calm?: boolean;
  items?: AttackItem[];
  onParry?: (escalate: boolean) => void;
  onHit?: () => void;
  onDone: () => void;
};

type ShellProps = DuelGameProps & {
  /** Arcade header word, e.g. "PARRY!" / "COMBO!". */
  title: string;
  titleColor: string;
  /** One-line how-to under the header. */
  instruction?: ReactNode;
  /** Blinking input hint under the canvas. */
  hint: string;
  /** Sub-line on the win splash. */
  winSub?: string;
  /** Builds the Phaser scene that *is* the game. */
  scene: DuelSceneFactory;
};

/**
 * Shared host for a Phaser-based duel mini-game: the retro chrome (DUEL!! title,
 * vignette/shake, win/lose splash) lives here, and only the inner Phaser `scene`
 * differs between games. Manages the canvas lifecycle and the play→win/lose flow.
 */
export function DuelGameShell({
  attackKey,
  by,
  parryable = true,
  level = 0,
  perStack = 0.1,
  quick = false,
  calm = false,
  items = [],
  title,
  titleColor,
  instruction,
  hint,
  winSub,
  scene,
  onParry,
  onHit,
  onDone,
}: ShellProps) {
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
    const finish: DuelResult = (kind, escalate = true) => {
      if (doneRef.current) return;
      doneRef.current = true;
      setPhase(kind === "win" ? "win" : "lose");
      if (kind === "win") onParry?.(escalate);
      else onHit?.();
      setTimeout(() => !cancelled && onDone(), quick ? (kind === "win" ? 320 : 700) : 650);
    };
    (async () => {
      const Phaser = (await import("phaser")).default;
      if (cancelled || !ref.current) return;
      const ss = Math.min(3, Math.max(2, Math.round(window.devicePixelRatio || 1)));
      game = new Phaser.Game({
        type: Phaser.CANVAS, // canvas (not WebGL) — avoids context churn across short rounds
        width: DUEL_VW * ss,
        height: DUEL_VH * ss,
        parent: ref.current,
        transparent: true,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        render: { antialias: true, roundPixels: false },
        scene: scene(ss, { level, perStack, onResult: finish }),
      });
    })();
    return () => {
      cancelled = true;
      if (game) game.destroy(true);
    };
  }, [attackKey, parryable, level, perStack, quick, scene, onParry, onHit, onDone]);

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
            <span style={{ fontFamily: ARCADE, fontSize: 22, color: titleColor, textShadow: `3px 3px 0 #000,0 0 14px ${titleColor}` }}>{title}</span>
            {lv > 0 && <span style={{ fontFamily: ARCADE, fontSize: 12, color: "#FF6B5A", textShadow: "2px 2px 0 #000" }}>LV.{lv}</span>}
          </div>
          {instruction && (
            <div style={{ fontFamily: PIXEL, fontSize: 13, color: "#fff", textShadow: "1px 1px 0 #000" }}>{instruction}</div>
          )}
          <div ref={ref} className="h-[280px] w-[460px] max-w-[92vw]" style={{ pointerEvents: "auto" }} />
          <div style={{ fontFamily: PIXEL, fontSize: 11, color: "#9AD8E8", animation: "blink 1s steps(1) infinite" }}>{hint}</div>
        </div>
        {phase !== "play" && <RetroSplash phase={phase} by={by} sub={phase === "win" ? winSub : undefined} />}
      </div>
    </div>
  );
}
