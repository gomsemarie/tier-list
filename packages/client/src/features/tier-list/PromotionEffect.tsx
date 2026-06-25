import { useEffect, useMemo, useState, type CSSProperties } from "react";

import type { Voter } from "@tier-list/shared";
import { Avatar } from "./Avatar";

type PromotionEffectProps = {
  /** Remount per vote so the animation + sound replay. */
  effectKey: string;
  itemName: string;
  itemImage?: string | null;
  toLabel: string;
  toColor: string;
  /** Winning tier's grade name (등급명), e.g. "전설". */
  epithet?: string;
  /** All tiers (top→bottom) for the result ladder. */
  tiers?: { label: string; color: string }[];
  /** Voters who picked the winning tier — shown as 공헌자. */
  contributors?: Voter[];
  /** Simplified (간소화) mode → small, quiet top-center banner. */
  compact?: boolean;
};

/** Synthesized ascending fanfare — no asset files, plays once on mount. */
function playFanfare() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const t = now + i * 0.11;
      const peak = i === notes.length - 1 ? 0.32 : 0.22;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + (i === notes.length - 1 ? 0.7 : 0.3));
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.75);
    });
    const spark = ctx.createOscillator();
    const sg = ctx.createGain();
    spark.type = "sine";
    spark.frequency.setValueAtTime(1568, now + 0.44);
    spark.frequency.exponentialRampToValueAtTime(2637, now + 0.7);
    sg.gain.setValueAtTime(0.0001, now + 0.44);
    sg.gain.exponentialRampToValueAtTime(0.18, now + 0.5);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
    spark.connect(sg).connect(ctx.destination);
    spark.start(now + 0.44);
    spark.stop(now + 1);
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch {
    /* audio unavailable — visual still plays */
  }
}

const PIX_COLORS = ["#FDE047", "#F87171", "#34D399", "#60A5FA", "#F472B6", "#FB923C", "#FFFFFF"];

/** Vote-result 승급 celebration. Full mode = arcade RANK UP; compact = mini banner. */
export function PromotionEffect({
  effectKey,
  itemName,
  itemImage,
  toLabel,
  toColor,
  epithet,
  tiers = [],
  contributors = [],
  compact = false,
}: PromotionEffectProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!compact) playFanfare();
  }, [effectKey, compact]);

  const confetti = useMemo(
    () =>
      Array.from({ length: 64 }, (_, i) => ({
        left: Math.random() * 100,
        color: PIX_COLORS[i % PIX_COLORS.length],
        dur: 1.6 + Math.random() * 1.6,
        delay: Math.random() * 0.7,
      })),
    [],
  );
  const burst = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * 6.283;
        const d = 130 + Math.random() * 50;
        return { bx: Math.cos(a) * d, by: Math.sin(a) * d, gold: i % 2 === 0, delay: 0.15 + Math.random() * 0.25 };
      }),
    [],
  );

  // ── Compact (간소화) — small top-center banner ──
  if (compact) {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-16 z-[65] flex justify-center px-4">
        <div className="mod-slam retro-border flex items-center gap-2.5 rounded-[3px] border-black bg-panel-head px-4 py-2">
          <span className="size-9 shrink-0 overflow-hidden rounded-[3px] border-2 border-black bg-muted">
            {itemImage ? (
              <img src={itemImage} alt={itemName} className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-xs font-bold text-muted-foreground">
                {itemName.slice(0, 2)}
              </span>
            )}
          </span>
          <div className="min-w-0">
            <p className="font-pixel text-[10px] font-bold tracking-wider text-amber-fg uppercase">
              🏛️ 승급
            </p>
            <p className="font-pixel flex items-center gap-1.5 text-sm font-bold text-foreground">
              <span className="max-w-[7rem] truncate">{itemName}</span>
              <span className="text-amber-fg">→</span>
              <span
                className="grid h-6 min-w-6 place-items-center rounded-[3px] border-2 border-black px-1.5 font-black text-white"
                style={{ backgroundColor: toColor }}
              >
                {toLabel}
              </span>
            </p>
          </div>
          {contributors.length > 0 && (
            <div className="flex shrink-0 items-center -space-x-1.5 pl-1">
              {contributors.slice(0, 4).map((v) => (
                <span key={v.userId} title={v.name} className="rounded-full ring-2 ring-white">
                  <Avatar name={v.name} src={v.avatar} frame={v.frame} size={20} />
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (dismissed) return null;

  // ── Full arcade RANK UP ──
  const ladder = [...tiers].reverse();
  return (
    <div
      onClick={() => setDismissed(true)}
      className="font-pixel fixed inset-0 z-[70] grid cursor-pointer place-items-center overflow-hidden"
      style={{ background: "#0a0613" }}
    >
      {/* scrolling bars */}
      <div
        className="pointer-events-none absolute"
        style={{
          inset: "-30%",
          background: "repeating-linear-gradient(120deg,#170d2b 0 44px,#21143f 44px 88px)",
          opacity: 0.55,
          animation: "barsMove 1.4s linear infinite",
        }}
      />
      {/* glow */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          width: 480,
          height: 480,
          background: `radial-gradient(circle,${toColor}44,transparent 68%)`,
          animation: "colorPulse 1s steps(2) infinite",
        }}
      />
      {/* confetti */}
      <div className="pointer-events-none absolute inset-0">
        {confetti.map((c, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              top: "-6vh",
              left: `${c.left}%`,
              width: 9,
              height: 9,
              background: c.color,
              imageRendering: "pixelated",
              animation: `pixFall ${c.dur}s steps(14) ${c.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* center */}
      <div
        className="relative flex flex-col items-center gap-[18px]"
        style={{ animation: "pixBounce .45s steps(5) both" }}
      >
        <div className="font-arcade text-[11px] tracking-[2px]" style={{ color: "#A78BFA" }}>
          * 인정협회 승급 인증 *
        </div>
        <div
          className="font-arcade text-[42px] tracking-[1px]"
          style={{ color: "#FDE047", textShadow: "5px 5px 0 #000", animation: "colorBlink .5s steps(2) infinite" }}
        >
          RANK UP!!
        </div>
        {/* emblem */}
        <div className="relative grid size-[118px] place-items-center">
          {burst.map((b, i) => (
            <div
              key={i}
              className="absolute top-1/2 left-1/2"
              style={
                {
                  width: 12,
                  height: 12,
                  background: b.gold ? "#FDE047" : "#fff",
                  imageRendering: "pixelated",
                  "--bx": `${b.bx}px`,
                  "--by": `${b.by}px`,
                  animation: `starBurst 1.2s steps(7) ${b.delay}s forwards`,
                } as CSSProperties
              }
            />
          ))}
          <div
            className="font-arcade relative grid size-full place-items-center text-[50px] text-white"
            style={{
              background: toColor,
              textShadow: "4px 4px 0 #000",
              boxShadow: "0 0 0 4px #000,0 0 0 9px #fff,0 0 0 13px #000",
              imageRendering: "pixelated",
            }}
          >
            {toLabel}
          </div>
        </div>
        {/* name */}
        <div className="text-center text-[22px] font-bold text-white" style={{ textShadow: "2px 2px 0 #000" }}>
          {itemName} → {toLabel}티어{epithet ? ` (${epithet})` : ""}
        </div>
        {/* ladder */}
        {ladder.length > 0 && (
          <div className="flex gap-1.5">
            {ladder.map((t) => {
              const win = t.label === toLabel && t.color === toColor;
              return (
                <div
                  key={t.label + t.color}
                  className="font-arcade grid size-9 place-items-center text-[15px]"
                  style={{
                    background: win ? t.color : "#1b1230",
                    border: "3px solid #000",
                    outline: win ? "3px solid #fff" : "none",
                    color: win ? "#fff" : "#574d70",
                    textShadow: win ? "2px 2px 0 #000" : "none",
                    animation: win ? "rankFlash .5s steps(2) infinite" : "none",
                  }}
                >
                  {t.label}
                </div>
              );
            })}
          </div>
        )}
        {/* contributors (compact row) */}
        {contributors.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="font-pixel text-[11px] text-[#9b91b8]">공헌</span>
            <div className="flex -space-x-1.5">
              {contributors.slice(0, 6).map((v) => (
                <span key={v.userId} title={v.name} className="rounded-full ring-2 ring-black">
                  <Avatar name={v.name} src={v.avatar} frame={v.frame} size={20} />
                </span>
              ))}
            </div>
          </div>
        )}
        <div
          className="font-pixel text-[13px]"
          style={{ color: "#9b91b8", animation: "blink 1s steps(1) infinite" }}
        >
          클릭하여 계속
        </div>
      </div>

      {/* scanlines + vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(0deg,transparent 0,transparent 2px,rgba(0,0,0,.32) 3px,rgba(0,0,0,.32) 4px)",
          animation: "crtFlicker .12s steps(2) infinite",
        }}
      />
      <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 200px 44px rgba(0,0,0,.78)" }} />
    </div>
  );
}
