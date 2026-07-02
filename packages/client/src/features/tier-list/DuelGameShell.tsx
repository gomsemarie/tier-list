/* The Phaser scene is untyped here (lazy-loaded). `any` is scoped to this file. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Flag } from "lucide-react";

import { ARCADE, PIXEL, DuelTitle, RetroBackdrop, RetroSplash, WaitScreen, type AttackItem } from "./duelChrome";

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
  /** Real duel: hold on a "waiting for opponent" screen after a win. */
  wait?: boolean;
  items?: AttackItem[];
  onParry?: (escalate: boolean) => void;
  onHit?: () => void;
  onDone: () => void;
  /** 항복: concede this game. Parent owns the outcome (lose + close overlay). */
  onSurrender?: () => void;
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
  wait = false,
  scene,
  onParry,
  onHit,
  onDone,
  onSurrender,
}: ShellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);
  const [phase, setPhase] = useState<"play" | "win" | "lose">(parryable ? "play" : "lose");
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const lv = Math.max(0, Math.floor(level));
  const onSurrenderRef = useRef(onSurrender);
  onSurrenderRef.current = onSurrender;
  const giveUp = () => {
    setConfirmGiveUp(false);
    if (doneRef.current) return;
    doneRef.current = true;
    setPhase("lose");
    onSurrenderRef.current?.();
  };

  // Esc → ask to surrender (only while the game is live and surrender is offered).
  useEffect(() => {
    if (!onSurrender) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !doneRef.current) {
        e.preventDefault();
        setConfirmGiveUp((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSurrender]);

  // Keep the callbacks in refs so the game/effect isn't torn down (and the
  // pending onDone timer cancelled) when the parent re-renders with new inline
  // handlers — that used to leave the win/lose screen stuck forever.
  const onParryRef = useRef(onParry);
  const onHitRef = useRef(onHit);
  const onDoneRef = useRef(onDone);
  onParryRef.current = onParry;
  onHitRef.current = onHit;
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!parryable) {
      const t = setTimeout(() => onDoneRef.current(), 1100);
      return () => clearTimeout(t);
    }
    let cancelled = false;
    let game: any;
    const finish: DuelResult = (kind, escalate = true) => {
      if (doneRef.current) return;
      doneRef.current = true;
      setPhase(kind === "win" ? "win" : "lose");
      if (kind === "win") onParryRef.current?.(escalate);
      else onHitRef.current?.();
      // Real-duel win: hold on the waiting screen (a fresh room:attacked will
      // remount us sooner; the duel-win notice covers us if the opponent lost).
      const holdMs = kind === "win" && wait ? 7000 : quick ? (kind === "win" ? 320 : 700) : 650;
      setTimeout(() => !cancelled && onDoneRef.current(), holdMs);
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
    // Callbacks are read via refs (above), so they're intentionally not deps —
    // the game is (re)created only when the actual round/params change.
  }, [attackKey, parryable, level, perStack, quick, wait, scene]);

  return (
    <div className="fixed inset-0 z-[200] overflow-hidden">
      <RetroBackdrop phase={phase} items={items} seed={attackKey} calm={calm} />
      {onSurrender && phase === "play" && (
        <button
          type="button"
          onClick={() => setConfirmGiveUp(true)}
          className="fixed right-4 top-4 z-[202] flex items-center gap-1"
          style={{ fontFamily: ARCADE, fontSize: 11, color: "#FFD0C8", background: "#2A1114", border: "2px solid #000", boxShadow: "2px 2px 0 #000", padding: "7px 10px", cursor: "pointer" }}
        >
          <Flag className="size-3" /> 항복 (Esc)
        </button>
      )}
      {onSurrender && phase === "play" && confirmGiveUp && (
        <div className="fixed inset-0 z-[204] grid place-items-center bg-black/60" onClick={() => setConfirmGiveUp(false)}>
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
          {/* Dark screen panel so the drifting item shrapnel can't bleed through
              and cover the arrows/marker. */}
          <div
            ref={ref}
            className="h-[280px] w-[460px] max-w-[92vw]"
            style={{ pointerEvents: "auto", background: "rgba(9,12,20,.82)", border: "3px solid #000", boxShadow: "4px 4px 0 rgba(0,0,0,.5), inset 0 0 0 2px #232A38" }}
          />
          <div style={{ fontFamily: PIXEL, fontSize: 11, color: "#9AD8E8", animation: "blink 1s steps(1) infinite" }}>{hint}</div>
        </div>
        {phase !== "play" &&
          (phase === "win" && wait ? (
            <WaitScreen by={by} />
          ) : (
            <RetroSplash phase={phase} by={by} sub={phase === "win" ? winSub : undefined} />
          ))}
      </div>
    </div>
  );
}
