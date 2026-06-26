import { useEffect, useMemo } from "react";
import type { CSSProperties } from "react";

import type { Tier } from "@tier-list/shared";
import { playRankSound } from "@/lib/sound";

const ARCADE = "'Press Start 2P','Galmuri11',monospace";
const PIXEL = "'Galmuri11','Noto Sans KR',sans-serif";
const CONFETTI_COLORS = ["#FDE047", "#F87171", "#34D399", "#60A5FA", "#F472B6", "#FB923C", "#FFFFFF"];

type PromotionEffectProps = {
  itemName: string;
  tier: { label: string; color: string; epithet: string };
  /** Direction the vote decided: promotion / demotion / unchanged. */
  kind: "up" | "down" | "keep";
  tiers: Tier[];
  onDismiss: () => void;
};

/** Shrink a tier label's font by its char count so long labels don't overflow. */
function fit(label: string, sizes: [number, number, number, number]): number {
  const n = [...label].length;
  return n <= 1 ? sizes[0] : n === 2 ? sizes[1] : n === 3 ? sizes[2] : sizes[3];
}

const KIND_META = {
  up: { sub: "* 인정협회 승급 인증 *", head: "RANK UP!!", color: "#FDE047", arrow: "→" },
  down: { sub: "* 인정협회 티어 강등 *", head: "RANK DOWN", color: "#FB7185", arrow: "▼" },
  keep: { sub: "* 인정협회 티어 확정 *", head: "티어 확정", color: "#A5B4FC", arrow: "·" },
} as const;

/** Full-screen tier-decided effect (handoff promoEl) — no radial-ray sunburst. */
export function PromotionEffect({ itemName, tier, kind, tiers, onDismiss }: PromotionEffectProps) {
  const meta = KIND_META[kind];

  useEffect(() => {
    playRankSound(kind);
  }, [kind]);
  // Randomized particles, computed once so they don't reshuffle on re-render.
  const confetti = useMemo(
    () =>
      Array.from({ length: 64 }, (_, i) => ({
        left: `${Math.random() * 100}%`,
        background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        animation: `pixFall ${1.6 + Math.random() * 1.6}s steps(14) ${Math.random() * 0.7}s infinite`,
      })),
    [],
  );
  const burst = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * 6.283;
        const d = 130 + Math.random() * 50;
        return {
          background: i % 2 ? "#FDE047" : "#fff",
          "--bx": `${Math.cos(a) * d}px`,
          "--by": `${Math.sin(a) * d}px`,
          animation: `starBurst 1.2s steps(7) ${0.15 + Math.random() * 0.25}s forwards`,
        } as CSSProperties;
      }),
    [],
  );
  const ladder = useMemo(() => [...tiers].reverse(), [tiers]);

  return (
    <div
      onClick={onDismiss}
      className="fixed inset-0 z-[60] grid cursor-pointer place-items-center overflow-hidden"
      style={{ background: "#0a0613", fontFamily: PIXEL }}
    >
      {/* diagonal scrolling bars (not radial rays) */}
      <div
        className="absolute"
        style={{
          inset: "-30%",
          background: "repeating-linear-gradient(120deg,#170d2b 0 44px,#21143f 44px 88px)",
          opacity: 0.55,
          animation: "barsMove 1.4s linear infinite",
        }}
      />
      <div
        className="absolute"
        style={{
          width: 480,
          height: 480,
          borderRadius: "50%",
          background: `radial-gradient(circle,${tier.color}44,transparent 68%)`,
          animation: "colorPulse 1s steps(2) infinite",
        }}
      />
      <div className="pointer-events-none absolute inset-0">
        {confetti.map((c, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              top: "-6vh",
              left: c.left,
              width: 9,
              height: 9,
              background: c.background,
              imageRendering: "pixelated",
              animation: c.animation,
            }}
          />
        ))}
      </div>

      <div
        className="relative flex flex-col items-center gap-[18px]"
        style={{ animation: "pixBounce .45s steps(5) both" }}
      >
        <div style={{ fontFamily: ARCADE, fontSize: 11, color: "#A78BFA", letterSpacing: 2 }}>
          {meta.sub}
        </div>
        <div
          style={{
            fontFamily: ARCADE,
            fontSize: 42,
            color: meta.color,
            textShadow: "5px 5px 0 #000",
            letterSpacing: 1,
            animation: "colorBlink .5s steps(2) infinite",
          }}
        >
          {meta.head}
        </div>
        <div className="relative grid size-[118px] place-items-center">
          {burst.map((b, i) => (
            <div
              key={i}
              className="absolute top-1/2 left-1/2 size-3"
              style={{ ...b, imageRendering: "pixelated" }}
            />
          ))}
          <div
            className="relative grid size-full place-items-center overflow-hidden px-1 leading-none whitespace-nowrap"
            style={{
              background: tier.color,
              fontFamily: ARCADE,
              fontSize: fit(tier.label, [50, 38, 27, 21]),
              color: "#fff",
              textShadow: "4px 4px 0 #000",
              boxShadow: "0 0 0 4px #000,0 0 0 9px #fff,0 0 0 13px #000",
              imageRendering: "pixelated",
            }}
          >
            {tier.label}
          </div>
        </div>
        <div
          style={{
            fontFamily: PIXEL,
            fontSize: 22,
            fontWeight: 700,
            color: "#fff",
            textShadow: "2px 2px 0 #000",
            textAlign: "center",
          }}
        >
          {itemName} {meta.arrow} {tier.label}티어{tier.epithet ? ` (${tier.epithet})` : ""}
          {kind === "keep" ? " 유지" : ""}
        </div>
        <div className="flex gap-1.5">
          {ladder.map((t) => {
            const win = t.label === tier.label;
            return (
              <div
                key={t.id}
                className="grid size-9 place-items-center overflow-hidden px-px leading-none whitespace-nowrap"
                style={{
                  background: win ? t.color : "#1b1230",
                  border: "3px solid #000",
                  outline: win ? "3px solid #fff" : "none",
                  fontFamily: ARCADE,
                  fontSize: fit(t.label, [15, 12, 9, 8]),
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
        <div
          style={{ fontFamily: PIXEL, fontSize: 13, color: "#9b91b8", marginTop: 2, animation: "blink 1s steps(1) infinite" }}
        >
          클릭하여 계속
        </div>
      </div>

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "repeating-linear-gradient(0deg,transparent 0,transparent 2px,rgba(0,0,0,.32) 3px,rgba(0,0,0,.32) 4px)",
          animation: "crtFlicker .12s steps(2) infinite",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ boxShadow: "inset 0 0 200px 44px rgba(0,0,0,.78)" }}
      />
    </div>
  );
}
