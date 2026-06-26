import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

/** One item to scatter: name (+ image optional), and a 0–1 "lowness" weight. */
export type AttackItem = { src: string | null; name: string; weight: number };

type AttackEffectProps = {
  attackKey: number;
  by: string;
  /** True for a fresh attack (can be parried); false for a reflected hit. */
  parryable?: boolean;
  /** Difficulty 0–5: rises when re-attacked within 30s (faster marker, tighter zones). */
  level?: number;
  onParry?: () => void;
  onDone: () => void;
  items?: AttackItem[];
};

const ARCADE = "'Press Start 2P','Galmuri11',monospace";
const PIXEL = "'Galmuri11','Noto Sans KR',sans-serif";
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return ((h % 360) + 360) % 360;
}

type Phase = "pending" | "perfect" | "good" | "miss" | "hit";

/** Full-screen ATTACK!! effect with a parry mini-game (handoff `attackEl`). */
export function AttackEffect({ attackKey, by, parryable = false, level = 0, onParry, onDone, items = [] }: AttackEffectProps) {
  const [phase, setPhase] = useState<Phase>(parryable ? "pending" : "hit");
  const [pos, setPos] = useState(0);
  const posRef = useRef(0);
  const rafRef = useRef<number | undefined>(undefined);
  const parriedRef = useRef(false);

  const success = phase === "perfect" || phase === "good";
  const resolved = phase !== "pending";

  // Difficulty: low levels are forgiving (slow marker, wide zones); ramps up.
  const lv = Math.min(5, Math.max(0, Math.floor(level)));
  const duration = Math.max(650, 1900 - lv * 250);
  const goodHalf = Math.max(6, 18 - lv * 2.4); // % each side of center (50)
  const perfectHalf = Math.max(2, 8 - lv * 1.2);

  // Marker sweep while waiting for the parry input.
  useEffect(() => {
    if (phase !== "pending") return;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(100, ((now - start) / duration) * 100);
      posRef.current = p;
      setPos(p);
      if (p >= 100) {
        setPhase("miss");
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, duration]);

  const tryParry = useCallback(() => {
    setPhase((cur) => {
      if (cur !== "pending") return cur;
      const d = Math.abs(posRef.current - 50);
      const ok = d <= goodHalf;
      if (ok && !parriedRef.current) {
        parriedRef.current = true;
        onParry?.();
      }
      return d <= perfectHalf ? "perfect" : ok ? "good" : "miss";
    });
  }, [onParry, goodHalf, perfectHalf]);

  useEffect(() => {
    if (phase !== "pending") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        tryParry();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, tryParry]);

  // Auto-dismiss once resolved.
  useEffect(() => {
    if (phase === "pending") return;
    const ms = success ? 2400 : phase === "hit" ? 2600 : 1900;
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, [phase, success, onDone]);

  const floaters = useMemo(() => {
    const src = items.length
      ? items.slice(0, 120)
      : Array.from({ length: 14 }, (_, i) => ({ src: null, name: `${i}`, weight: Math.random() }));
    return src.map((it, i) => ({
      key: i,
      label: it.name.slice(0, 2),
      style: {
        position: "absolute",
        left: `${rand(0, 86)}%`,
        top: success ? `${rand(60, 90)}%` : `${rand(0, 74)}%`,
        width: 36 + it.weight * 26,
        height: 36 + it.weight * 26,
        background: success ? "hsl(190,70%,55%)" : `hsl(${hueOf(it.name)},42%,46%)`,
        imageRendering: "pixelated",
        border: "3px solid #000",
        display: "grid",
        placeItems: "center",
        fontFamily: PIXEL,
        fontSize: 11,
        fontWeight: 700,
        color: "#fff",
        textShadow: "1px 1px 0 #000",
        "--dx": `${rand(-75, 75)}px`,
        "--dy": success ? `${-rand(120, 340)}px` : `${rand(-75, 75)}px`,
        "--rot": "0deg",
        animation: `floatY ${success ? 0.9 : rand(0.45, 0.9)}s steps(${success ? 5 : 4}) ${rand(0, 0.2)}s infinite alternate`,
      } as CSSProperties,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attackKey, success]);

  const boom = useMemo(() => {
    if (!resolved) return [];
    return Array.from({ length: 18 }, (_, i) => {
      const a = (i / 18) * 6.283;
      const d = 90 + Math.random() * 130;
      return {
        key: i,
        style: {
          position: "absolute",
          left: "50%",
          top: "42%",
          width: 14,
          height: 14,
          background: success ? (i % 2 ? "#22D3EE" : "#fff") : i % 3 ? "#FF3B30" : "#FDE047",
          imageRendering: "pixelated",
          "--bx": `${Math.cos(a) * d}px`,
          "--by": `${Math.sin(a) * d}px`,
          animation: `starBurst 1s steps(6) ${Math.random() * 0.2}s forwards`,
        } as CSSProperties,
      };
    });
  }, [resolved, success]);

  const vig = success ? "rgba(0,120,160,.85)" : "rgba(110,0,0,.85)";

  const atkTitle = (
    <div className="relative text-center" style={{ animation: "glitch .14s steps(2) infinite" }}>
      <div className="relative inline-block">
        <div className="absolute inset-x-0 top-0" style={{ fontFamily: ARCADE, fontSize: 44, color: "#FF2D6A", transform: "translate(-4px,0)" }}>
          ATTACK!!
        </div>
        <div className="absolute inset-x-0 top-0" style={{ fontFamily: ARCADE, fontSize: 44, color: "#22D3EE", transform: "translate(4px,0)" }}>
          ATTACK!!
        </div>
        <div className="relative" style={{ fontFamily: ARCADE, fontSize: 44, color: "#fff", textShadow: "5px 5px 0 #000" }}>
          ATTACK!!
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden">
      <div className="pointer-events-none absolute -inset-12" style={{ animation: "atkShake .22s linear infinite" }}>
        <div className="absolute inset-0" style={{ background: success ? "#22D3EE" : "#FF281C", animation: "atkFlash .16s linear infinite" }} />
        <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 220px 60px ${vig}` }} />
      </div>

      <div className="pointer-events-none absolute inset-0">
        {floaters.map((f) => (
          <span key={f.key} style={f.style}>
            {f.label}
          </span>
        ))}
        {boom.map((b) => (
          <span key={`b${b.key}`} style={b.style} />
        ))}
      </div>

      <div className="grid h-full place-items-center">
        {phase === "pending" ? (
          <div className="flex flex-col items-center gap-6 select-none">
            {atkTitle}
            <div className="-mt-3" style={{ fontFamily: PIXEL, fontSize: 15, fontWeight: 700, color: "#FFD0C8", textShadow: "2px 2px 0 #000" }}>
              관리자 {by}의 공격!
            </div>
            <div className="w-[380px] max-w-[90vw] text-center" style={{ pointerEvents: "auto" }}>
              <div className="flex items-center justify-center gap-2" style={{ marginBottom: 4 }}>
                <span style={{ fontFamily: ARCADE, fontSize: 22, color: "#22D3EE", textShadow: "3px 3px 0 #000,0 0 14px rgba(34,211,238,.7)" }}>PARRY!</span>
                {lv > 0 && (
                  <span style={{ fontFamily: ARCADE, fontSize: 12, color: "#FF6B5A", textShadow: "2px 2px 0 #000" }}>LV.{lv}</span>
                )}
              </div>
              <div style={{ fontFamily: PIXEL, fontSize: 13, color: "#fff", textShadow: "1px 1px 0 #000", marginBottom: 11 }}>
                {lv > 0 ? "연속 피격! 더 정확히 패링!" : "흰 마커가 가운데 올 때 패링!"}
              </div>
              <div className="relative h-[26px] overflow-hidden border-[3px] border-black" style={{ background: "#11141B", boxShadow: "3px 3px 0 rgba(0,0,0,.5)" }}>
                <div className="absolute inset-y-0" style={{ left: `${50 - goodHalf}%`, width: `${goodHalf * 2}%`, background: "rgba(34,211,238,.18)" }} />
                <div className="absolute inset-y-0" style={{ left: `${50 - perfectHalf}%`, width: `${perfectHalf * 2}%`, background: "rgba(34,211,238,.5)", boxShadow: "inset 0 0 0 2px #22D3EE" }} />
                <div className="absolute" style={{ left: `calc(${pos}% - 3px)`, top: -2, bottom: -2, width: 6, background: "#fff", boxShadow: "0 0 8px #fff" }} />
              </div>
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  tryParry();
                }}
                style={{ marginTop: 13, padding: "11px 26px", fontFamily: ARCADE, fontSize: 16, color: "#06121A", background: "#22D3EE", border: "3px solid #000", boxShadow: "3px 3px 0 #000", cursor: "pointer" }}
              >
                패링!
              </button>
              <div style={{ marginTop: 9, fontFamily: PIXEL, fontSize: 11, color: "#9AD8E8", animation: "blink 1s steps(1) infinite" }}>SPACE 또는 클릭</div>
            </div>
          </div>
        ) : success ? (
          <div className="text-center select-none" style={{ animation: "slam .5s steps(4) both" }}>
            <div style={{ fontFamily: ARCADE, fontSize: 50, color: "#67E8F9", textShadow: "5px 5px 0 #000,0 0 22px rgba(34,211,238,.85)" }}>
              {phase === "perfect" ? "PERFECT PARRY!!" : "PARRY!!"}
            </div>
            <div style={{ marginTop: 10, fontFamily: PIXEL, fontSize: 19, fontWeight: 700, color: "#fff", textShadow: "2px 2px 0 #000" }}>{by}에게 반격 반사 성공!</div>
            <div style={{ marginTop: 4, fontFamily: PIXEL, fontSize: 13, color: "#9AD8E8" }}>공격이 시전자에게 되돌아갔습니다</div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 select-none">
            {atkTitle}
            <div style={{ fontFamily: PIXEL, fontSize: 18, fontWeight: 700, color: "#FFD0C8", textShadow: "2px 2px 0 #000" }}>관리자 {by}의 공격 명중!</div>
            {phase === "miss" && (
              <div style={{ fontFamily: ARCADE, fontSize: 16, color: "#FF6B5A", textShadow: "2px 2px 0 #000" }}>GUARD BREAK</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
